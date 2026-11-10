import { useLayoutEffect, useRef, useState } from 'react'
import { frameDocument } from './frame.js'
import { HISTORY_LIMIT } from './recorder.js'
import { MAX_CYCLES } from './trace.js'

const fresh = (cycle = 0) => ({ cycle, steps: [], picked: null, report: null, editedHead: null, restored: false })

function trimHistory(steps) {
  let cycles = 1
  const floor = Math.max(0, steps.length - HISTORY_LIMIT)
  let start = steps.length - 1
  for (; start > floor; start--) {
    if (steps[start].cycle !== steps[start - 1].cycle && ++cycles > MAX_CYCLES) break
  }
  // Drop a whole older cycle if the memory limit cuts through it.
  if (start === floor && start > 0 && steps[start].cycle === steps[start - 1].cycle
    && steps[start].cycle !== steps.at(-1).cycle) {
    while (steps[start].cycle === steps[start - 1].cycle) start++
  }
  return steps.slice(Math.max(0, start))
}

function reportTarget(report, steps) {
  if (!report) return steps.at(-1)
  const ids = new Set(report.steps.map(({ id }) => id))
  const matches = steps.filter(({ id }) => ids.has(id))
  return (report.cycles?.length > 1 ? matches[0] : matches.at(-1)) ?? steps.at(-1)
}

export function useInspector(initialSource, initialDebugSource) {
  const frame = useRef(null)
  const holding = useRef(false)
  const [run, setRun] = useState(() => ({
    id: 0, source: initialSource, debugSource: initialDebugSource,
    document: frameDocument(initialSource, initialDebugSource),
  }))
  const [history, setHistory] = useState(() => fresh())
  const [ready, setReady] = useState(false)
  const live = history.picked === null
  const focused = history.report && new Set(history.report.steps.map(({ id }) => id))
  const steps = focused ? history.steps.filter(({ id }) => focused.has(id)) : history.steps
  const step = live ? steps.at(-1) : steps.find(({ id }) => id === history.picked)

  useLayoutEffect(() => {
    function receive({ source, data }) {
      if (source !== frame.current?.contentWindow || !data) return
      if (data.type === 'ready') setReady(true)
      if (data.type === 'steps') setHistory((current) => {
        const edits = data.steps[0]?.baseId != null
        if (edits ? !holding.current : holding.current || data.cycle < current.cycle) return current
        let next = { ...current, cycle: Math.max(current.cycle, data.cycle) }
        let steps = current.steps.slice()
        for (let incoming of data.steps) {
          if (incoming.baseId !== null) {
            const base = steps.find(({ id }) => id === incoming.baseId)
            if (!base) continue
            incoming = { ...incoming, variables: base.variables }
            steps = steps.filter(({ id }) => id <= incoming.baseId)
            const annotation = next.report?.source === 'ai'
              && next.report.steps.find(({ id }) => id === base.id)
            const report = annotation ? {
              ...next.report,
                cycles: next.report.cycles.filter((cycle) => cycle <= base.cycle),
              steps: [
                ...next.report.steps.filter(({ id }) => id <= base.id),
                { id: incoming.id, note: '상태를 직접 편집한 스텝입니다.', paths: annotation.paths },
              ],
            } : null
            next = { ...next, picked: incoming.id, report, editedHead: incoming }
          }
          steps.push(incoming)
        }
        return { ...next, steps: trimHistory(steps) }
      })
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  function send(message) {
    frame.current?.contentWindow?.postMessage(message, '*')
  }

  function restart(source, debugSource, replay) {
    const step = replay && reportTarget(replay.report, replay.steps)
    const latest = replay?.steps.at(-1)
    const document = frameDocument(source, debugSource, step ? { step, latest, drawings: replay.drawings } : null)
    holding.current = Boolean(step)
    setHistory(step ? {
      ...fresh(latest.cycle), steps: replay.steps, picked: step.id, report: replay.report, restored: true,
    } : fresh())
    setReady(false)
    setRun((current) => ({ id: current.id + 1, source, debugSource, document }))
  }

  function seek(target) {
    if (!target) return
    holding.current = true
    send({ type: 'inspect', step: target })
    setHistory((current) => current.steps.some(({ id }) => id === target.id) ? { ...current, picked: target.id } : current)
  }

  function toggleLive() {
    if (live) return seek(step)
    holding.current = false
    send({ type: 'live', state: history.editedHead?.state })
    setHistory((current) => current.restored ? fresh(current.cycle) : {
      ...current, picked: null, report: null, editedHead: null,
    })
  }

  function applyReport(report, recorded) {
    const target = reportTarget(report, recorded)
    if (!target) return
    seek(target)
    setHistory((current) => current.steps.some(({ id }) => id === target.id) ? { ...current, report } : current)
  }

  function exportDrawing(steps, signal) {
    const target = frame.current?.contentWindow
    if (!target) return Promise.resolve(undefined)
    signal.throwIfAborted()
    return new Promise((resolve) => {
      const { port1, port2 } = new MessageChannel()
      const timeout = setTimeout(finish, 3000)
      function finish(recording) {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
        port1.close()
        resolve(recording)
      }
      function abort() { finish() }
      port1.onmessage = ({ data }) => finish(data)
      signal.addEventListener('abort', abort, { once: true })
      target.postMessage({ type: 'exportDrawing', id: steps.at(-1).id, cursors: steps.map(({ canvasCursor }) => canvasCursor) }, '*', [port2])
    })
  }

  return {
    frame, run, ready, live, step, steps, seek, restart, toggleLive, applyReport, exportDrawing,
    report: history.report, recorded: history.steps,
    edit: (path, value) => send({ type: 'edit', path, value }),
    showAll: () => setHistory((current) => ({ ...current, report: null })),
  }
}
