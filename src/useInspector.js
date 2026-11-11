import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { frameDocument } from './frame.js'
import { MAX_DRAWING_WINDOWS } from './canvasTrace.js'
import { hasDrawing } from './historyRestore.js'
import { RECENT_STEP_LIMIT } from './recorder.js'
import { queryTrace } from './traceQuery.js'
import { reportForSelection } from './trace.js'
import { createTraceArchive } from './traceArchive.js'
import { overlaySite } from './overlay.js'

const fresh = () => ({ steps: [], picked: null, report: null, matches: [], restored: false })

function reportMatches(report, steps) {
  if (!report) return []
  const ids = new Set(report.steps.map(({ id }) => id))
  return steps.filter(({ id }) => ids.has(id))
}

function reportTarget(report, steps, matches) {
  return (report?.cycles.length > 1 ? matches[0] : matches.at(-1)) ?? steps.at(-1)
}

export function useInspector(initialSource, initialDebugSource) {
  const frame = useRef(null)
  const recent = useRef([])
  const archive = useRef(null)
  if (!archive.current) archive.current = createTraceArchive()
  const preview = useRef(null)
  const [run, setRun] = useState(() => ({
    id: 0, source: initialSource, debugSource: initialDebugSource,
    document: frameDocument(initialSource, initialDebugSource),
  }))
  const [history, setHistory] = useState(fresh)
  const [ready, setReady] = useState(false)
  const [canvasGeometry, setCanvasGeometry] = useState(null)
  const [traceError, setTraceError] = useState('')
  const live = history.picked === null
  const steps = history.report ? history.matches : history.steps
  const step = live ? steps.at(-1) : steps.find(({ id }) => id === history.picked)

  const storageFailed = useCallback((storage) => {
    if (archive.current === storage) setTraceError('임시 DB에서 실행 기록을 처리할 수 없어요. 최근 기록은 계속 볼 수 있어요.')
  }, [])

  useLayoutEffect(() => {
    function receive({ source, data }) {
      if (source !== frame.current?.contentWindow || !data) return
      if (data.type === 'ready') setReady(true)
      if (data.type === 'canvasGeometry') setCanvasGeometry(data)
      const storage = archive.current
      if (data.type === 'archivedDrawing') {
        storage.appendDrawing(data.drawing).catch(() => storageFailed(storage))
      }
      if (data.type === 'steps') {
        const batch = data.steps
        if (!batch.length || batch[0].id <= (recent.current.at(-1)?.id ?? 0)) return
        const combined = recent.current.concat(batch)
        const overflow = combined.length - RECENT_STEP_LIMIT
        if (overflow > 0) storage.appendSteps(combined.slice(0, overflow)).catch(() => storageFailed(storage))
        recent.current = overflow > 0 ? combined.slice(overflow) : combined
        const steps = recent.current
        setHistory((current) => ({ ...current, steps }))
      }
    }
    function pageHide(event) {
      if (!event.persisted) archive.current.dispose().catch(() => {})
    }
    window.addEventListener('message', receive)
    window.addEventListener('pagehide', pageHide)
    return () => {
      window.removeEventListener('message', receive)
      window.removeEventListener('pagehide', pageHide)
      archive.current.dispose().catch(() => {})
    }
  }, [storageFailed])

  function send(message) {
    frame.current?.contentWindow?.postMessage(message, '*')
  }

  function restart(source, debugSource, replay) {
    const matches = reportMatches(replay?.report, replay?.steps)
    const target = replay && reportTarget(replay.report, replay.steps, matches)
    const latest = replay?.steps.at(-1)
    const document = frameDocument(source, debugSource, target ? { step: target, latest, drawings: replay.drawings } : null)
    const previous = archive.current
    archive.current = createTraceArchive()
    previous.dispose().catch(() => {})
    preview.current = null
    frame.current = null
    recent.current = replay?.steps ?? []
    setHistory(target ? {
      ...fresh(), steps: recent.current, picked: target.id, report: replay.report, matches, restored: true,
    } : fresh())
    setReady(false)
    setTraceError('')
    setCanvasGeometry(null)
    setRun((current) => ({ id: current.id + 1, source, debugSource, document }))
  }

  function seek(target) {
    if (!target) return
    const storage = archive.current
    const marker = preview.current = {}
    send({ type: 'inspect', step: target })
    setHistory((current) => ({ ...current, picked: target.id }))
    storage.drawing(target.canvasCursor).then((drawing) => {
      if (drawing && preview.current === marker) send({ type: 'inspect', step: target, drawing })
    }).catch(() => storageFailed(storage))
  }

  function toggleLive() {
    if (live) return seek(step)
    preview.current = null
    if (history.restored) recent.current = []
    send({ type: 'live' })
    setHistory((current) => current.restored ? fresh() : {
      ...current, picked: null, report: null, matches: [],
    })
  }

  function applyReport(report, recorded) {
    const matches = reportMatches(report, recorded)
    seek(reportTarget(report, recorded, matches))
    setHistory((current) => ({ ...current, report, matches }))
  }

  function showAll() {
    if (!recent.current.some(({ id }) => id === history.picked)) seek(recent.current.at(-1))
    setHistory((current) => ({ ...current, report: null, matches: [] }))
  }

  async function analyze(plan, signal) {
    const storage = archive.current
    const steps = recent.current
    if (history.restored) return { report: reportForSelection(plan, steps, run.source), recorded: steps }
    try {
      return await queryTrace(storage, steps, plan, run.source, signal)
    } catch (error) {
      signal.throwIfAborted()
      storageFailed(storage)
      // The hot timeline is still usable if browser storage is unavailable.
      return queryTrace(createTraceArchive(), steps, plan, run.source, signal)
    }
  }

  const overlayContextFor = useCallback(async (target, accumulate, signal) => {
    const storage = archive.current
    const max = accumulate ? RECENT_STEP_LIMIT : 8
    const sites = new Set()
    const rows = []
    function add(step) {
      if (!accumulate) {
        const site = overlaySite(step)
        if (sites.has(site)) return
        if (target.canvasSize && step.canvasSize && target.canvasSize.some((size, axis) => size !== step.canvasSize[axis])) return
        sites.add(site)
      }
      rows.push(step)
      if (rows.length === max) return false
    }
    const steps = recent.current
    for (let index = steps.length - 1; index >= 0; index--) {
      const step = steps[index]
      if (step.cycle < target.cycle) break
      if (step.id < target.id && step.cycle === target.cycle && add(step) === false) return rows.reverse()
    }
    try {
      await storage.scanCycle(target.cycle, Math.min(target.id, steps[0]?.id ?? target.id) - 1, add, signal)
    } catch {
      signal.throwIfAborted()
      storageFailed(storage)
    }
    return rows.reverse()
  }, [storageFailed])

  async function exportDrawing(steps, signal) {
    const storage = archive.current
    const target = frame.current?.contentWindow
    if (!target) return []
    signal.throwIfAborted()
    const cursors = steps.map(({ canvasCursor }) => canvasCursor)
    const drawings = await new Promise((resolve) => {
      const { port1, port2 } = new MessageChannel()
      const timeout = setTimeout(() => finish([]), 3000)
      function finish(recording) {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
        port1.close()
        resolve(recording ?? [])
      }
      function abort() { finish([]) }
      port1.onmessage = ({ data }) => finish(data)
      signal.addEventListener('abort', abort, { once: true })
      target.postMessage({ type: 'exportDrawing', id: steps.at(-1).id, cursors }, '*', [port2])
    })
    for (const cursor of [...new Set(cursors)].sort((a, b) => b - a)) {
      if (drawings.length === MAX_DRAWING_WINDOWS) break
      if (hasDrawing(drawings, cursor)) continue
      signal.throwIfAborted()
      const archived = await storage.drawing(cursor, signal)
      if (archived) drawings.push(archived)
    }
    return drawings.sort((a, b) => b.first - a.first)
  }

  return {
    frame, run, ready, live, step, steps, seek, restart, toggleLive, applyReport, exportDrawing, analyze, showAll,
    canvasGeometry: canvasGeometry?.id === step?.id ? canvasGeometry?.geometry : null,
    report: history.report, recorded: history.steps, matches: history.matches, overlayContextFor, traceError,
  }
}
