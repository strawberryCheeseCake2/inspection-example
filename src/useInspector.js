import { useLayoutEffect, useRef, useState } from 'react'
import { frameDocument } from './frame.js'

const HISTORY_LIMIT = 3000
const fresh = (cycle = 0) => ({ cycle, steps: [], picked: null, report: null, editedHead: null })

function reportTarget(report, steps) {
  if (!report) return steps.at(-1)
  const ids = new Set(report.steps.map(({ id }) => id))
  return steps.findLast(({ id }) => ids.has(id)) ?? steps.at(-1)
}

export function useInspector(initialSource, initialDebugSource) {
  const frame = useRef(null)
  const heldCycle = useRef(null)
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
        if (data.cycle < current.cycle || (heldCycle.current !== null && data.cycle !== heldCycle.current)) return current
        let next = data.cycle === current.cycle ? current : fresh(data.cycle)
        let steps = next.steps.slice()
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
              steps: [
                ...next.report.steps.filter(({ id }) => id <= base.id),
                { id: incoming.id, note: '상태를 직접 편집한 스텝입니다.', paths: annotation.paths },
              ],
            } : null
            next = { ...next, picked: incoming.id, report, editedHead: incoming }
          }
          steps.push(incoming)
        }
        const overflow = Math.max(0, steps.length - HISTORY_LIMIT)
        const pickedIndex = steps.findIndex(({ id }) => id === next.picked)
        // A batch already in flight can arrive after the user pauses on an old step.
        const trim = pickedIndex < 0 ? overflow : Math.min(overflow, pickedIndex)
        return { ...next, steps: steps.slice(trim) }
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
    const document = frameDocument(source, debugSource, step ? { step, latest } : null)
    heldCycle.current = step?.cycle ?? null
    setHistory(step ? {
      ...fresh(step.cycle), steps: replay.steps, picked: step.id, report: replay.report,
    } : fresh())
    setReady(false)
    setRun((current) => ({ id: current.id + 1, source, debugSource, document }))
  }

  function seek(target) {
    if (!target) return
    heldCycle.current = target.cycle
    send({ type: 'inspect', step: target })
    setHistory((current) => target.cycle === current.cycle ? { ...current, picked: target.id } : current)
  }

  function toggleLive() {
    if (live) return seek(step)
    heldCycle.current = null
    send({ type: 'live', state: history.editedHead?.state })
    setHistory((current) => ({
      ...current, steps: current.steps.slice(-HISTORY_LIMIT), picked: null, report: null, editedHead: null,
    }))
  }

  function applyReport(report, recorded) {
    const target = reportTarget(report, recorded)
    if (!target) return
    seek(target)
    setHistory((current) => target.cycle === current.cycle ? { ...current, report } : current)
  }

  return {
    frame, run, ready, live, step, steps, seek, restart, toggleLive, applyReport,
    report: history.report, recorded: history.steps,
    edit: (path, value) => send({ type: 'edit', path, value }),
    showAll: () => setHistory((current) => ({ ...current, report: null })),
  }
}
