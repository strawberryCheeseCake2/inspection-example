// These functions run in an opaque-origin iframe and its dedicated worker.
import { overlayGuide, readOverlayValue } from './overlay.js'

function workerMain(readValue, validateGuide) {
  self.Worker = undefined
  self.SharedWorker = undefined
  self.postMessage = undefined
  const compile = Function
  function drawStep(draw, input) {
    const { width, height, step: { id: stepId } } = input
    const snapshots = new Map(structuredClone([input.step, ...input.context]).map((step) => [step.id, step]))
    const marks = []
    let attempts = 0

    function mark(locate, fields, guides) {
      if (++attempts > 100 || marks.length >= 8 || typeof locate !== 'function'
        || !Array.isArray(fields) || !fields.length) return false

      const references = []
      const fieldIndices = new Map()
      for (const [index, field] of fields.slice(0, 6).entries()) {
        if (!Array.isArray(field)) continue
        const [scope, path, sourceId = stepId] = field
        if (readValue(snapshots.get(sourceId), scope, path) === undefined) continue
        fieldIndices.set(index, references.length)
        references.push([scope, [...path], sourceId])
      }
      if (!references.length) return false

      let usedTrace = false
      const read = (scope, path, sourceId = stepId) => {
        const value = readValue(snapshots.get(sourceId), scope, path)
        if (value == null || (typeof value === 'string' && /^\[(?:…|Reference|Accessor|Unavailable)\]$/.test(value))) return
        usedTrace = true
        return typeof value === 'object' ? structuredClone(value) : value
      }
      const point = locate(read)
      if (!usedTrace || !Array.isArray(point)) return false
      const [x, y] = point
      if (![x, y].every(Number.isFinite) || x < 0 || x > width || y < 0 || y > height) return false
      const geometry = []
      for (const guide of Array.isArray(guides) ? guides.slice(0, 4) : []) {
        if (!Array.isArray(guide)) continue
        const [index, measure] = guide
        const field = fieldIndices.get(index)
        if (field === undefined || typeof measure !== 'function') continue
        try {
          const value = read(...references[field])
          if (value === undefined) continue
          const measured = measure(value, read)
          const remaining = 16 - geometry.length
          for (const item of Array.isArray(measured) ? measured.slice(0, remaining) : [measured]) {
            const result = validateGuide(item, width, height)
            if (result) geometry.push({ ...result, field })
            if (geometry.length === 16) break
          }
          if (geometry.length === 16) break
        } catch {
          // A guide may be unavailable on this occurrence. Keep the variable labels.
        }
      }
      marks.push({ x, y, fields: references, guides: geometry })
      return true
    }

    // Each occurrence gets its own copy of the selected snapshot.
    const result = draw({ ...input, selected: structuredClone(input.selected) }, mark)
    return result === false ? [] : marks
  }

  self.onmessage = ({ ports: [port] }) => {
    self.onmessage = null
    const send = port.postMessage.bind(port)
    const error = '오버레이 코드를 실행할 수 없어요.'
    port.onmessage = ({ data: { id, code, inputs } }) => {
      try {
        const draw = new compile('input', 'mark', '"use strict";\n' + code)
        const results = inputs.map((input) => {
          try { return { marks: drawStep(draw, input) } } catch { return { error } }
        })
        send({ id, results })
      } catch {
        send({ id, error })
      }
    }
  }
}

function frameMain(workerSource) {
  window.addEventListener('message', function connect({ source, data, ports: [client] }) {
    if (source !== parent || data !== 'connectOverlay' || !client) return
    window.removeEventListener('message', connect)
    let worker
    let workerPort
    let pending
    let active
    let timer

    function stop() {
      clearTimeout(timer)
      worker?.terminate()
      workerPort?.close()
      worker = undefined
      workerPort = undefined
    }
    window.addEventListener('pagehide', stop)

    function finish(result) {
      clearTimeout(timer)
      active = undefined
      client.postMessage(result)
      runNext()
    }

    function runNext() {
      if (active || !pending) return
      active = pending
      pending = undefined
      try {
        if (!worker) {
          const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
          try { worker = new Worker(url) } finally { URL.revokeObjectURL(url) }
          const { port1, port2 } = new MessageChannel()
          workerPort = port1
          workerPort.onmessage = ({ data }) => finish(data)
          worker.onerror = () => {
            const id = active?.id
            stop()
            if (id !== undefined) finish({ id, error: '오버레이 실행 환경을 시작할 수 없어요.' })
          }
          worker.postMessage(null, [port2])
        }
        timer = setTimeout(() => {
          const id = active.id
          stop()
          finish({ id, error: '오버레이 계산 시간이 초과됐어요.' })
        }, 700)
        workerPort.postMessage(active)
      } catch {
        const id = active.id
        stop()
        finish({ id, error: '이 브라우저에서 오버레이를 실행할 수 없어요.' })
      }
    }

    client.onmessage = ({ data }) => {
      pending = data
      runNext()
    }
  })
}

const workerSource = '(' + workerMain.toString() + ')(' + readOverlayValue.toString() + ',' + overlayGuide.toString() + ')'
export const overlayDocument = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:">
<script>(${frameMain.toString()})(${JSON.stringify(workerSource).replaceAll('<', '\\u003c')})</script>`
