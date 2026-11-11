import p5Url from 'p5/lib/p5.min.js?url&no-inline'
import { instrument } from './instrument.js'
import { createRecorder, TRACE_BATCH_SIZE } from './recorder.js'
import { createCanvasTrace, MAX_DRAWING_COMMANDS, MAX_DRAWING_WINDOWS, MAX_DRAWING_BYTES } from './canvasTrace.js'

export const WIDTH = 720
export const HEIGHT = 390

// Serialized into an opaque-origin iframe. Keep this function self-contained.
function boot(source, hook, batchSize, width, height, createRecorder, createCanvasTrace, drawingLimit, windowLimit, drawingBytes, restored) {
  const send = (message) => parent.postMessage(message, '*')
  const copy = (value) => JSON.parse(JSON.stringify(value))
  let event = 'setup'
  let preview = restored?.step ?? null
  let fallbackState = {}
  let readState
  let writeState
  let drawing
  let sketch
  const trace = {
    get state() { return readState?.() ?? fallbackState },
    set state(value) {
      if (readState?.() === undefined) fallbackState = value
      else writeState(value)
    },
    bind(read, write) {
      readState = read
      writeState = write
    },
    // Legacy sketches may still call the old line-checkpoint hooks.
    label() {},
    step() {},
    startCycle() {
      if (!preview) recorder.begin()
    },
    endCycle() {
      if (!preview) recorder.end()
    },
  }
  const recorder = createRecorder(send, snapshot, trace, () => ({
    event, preview,
    get canvasCursor() { return drawing?.cursor() },
    get canvasSize() { return sketch?.canvas && sketch.width > 0 && sketch.height > 0 ? [sketch.width, sketch.height] : undefined },
  }), batchSize)

  function snapshot() {
    try {
      const data = typeof trace.record === 'function' ? trace.record() : trace.state
      const json = data && typeof data === 'object' && !Array.isArray(data) && JSON.stringify(data)
      if (json && json.length <= 64000) return json
    } catch {
      // Optional trace data should not interrupt the sketch.
    }
    return '{}'
  }

  new p5((p) => {
    sketch = p
    new Function('p', 'trace', hook, source + '\n//# sourceURL=sketch-user.js')(p, trace, recorder)
    const setup = p.setup
    const draw = p.draw
    const redraw = trace.render ?? draw
    const handlers = {
      mousePressed: p.mousePressed,
      mouseDragged: p.mouseDragged,
      mouseReleased: p.mouseReleased,
      keyPressed: p.keyPressed,
    }

    const cycle = trace.cycle ?? (trace.render && !draw ? undefined : 'frame')
    if (!trace.render && !writeState) drawing = createCanvasTrace(p, drawingLimit, Boolean(cycle), windowLimit, drawingBytes,
      (drawing) => send({ type: 'archivedDrawing', drawing }))

    function render() {
      if (!redraw || (preview && !trace.render && readState?.() === undefined)) return
      const liveState = trace.state
      if (preview) trace.state = copy(preview.state)
      p.push()
      try {
        redraw.call(trace.render ? trace : p)
      } finally {
        p.pop()
        if (preview) trace.state = liveState
      }
    }

    let previewCanvas
    function publishGeometry() {
      if (!preview) return
      const id = preview.id
      const canvas = previewCanvas
      if (!canvas || !innerWidth || !innerHeight) return send({ type: 'canvasGeometry', id, geometry: null })
      const sameSize = canvas.width === p.canvas.width && canvas.height === p.canvas.height
      const size = drawing && preview.canvasSize ? preview.canvasSize : sameSize ? [p.width, p.height] : null
      const rect = canvas.getBoundingClientRect()
      const geometry = size?.every((value) => Number.isFinite(value) && value > 0) && rect.width > 0 && rect.height > 0
        ? { width: size[0], height: size[1], left: rect.left / innerWidth, top: rect.top / innerHeight,
          viewWidth: rect.width / innerWidth, viewHeight: rect.height / innerHeight }
        : null
      send({ type: 'canvasGeometry', id, geometry })
    }
    window.addEventListener('resize', publishGeometry)

    async function showPreview(archivedDrawing) {
      if (drawing) {
        const step = preview
        const saved = restored && step.id <= restored.latest.id ? restored.drawings : archivedDrawing && [archivedDrawing]
        previewCanvas = null
        const canvas = await drawing.show(step.canvasCursor, saved)
        if (preview !== step) return
        previewCanvas = canvas
      } else {
        render()
        previewCanvas = p.canvas
      }
      publishGeometry()
    }

    function run(name, handler) {
      event = name
      return handler()
    }

    window.addEventListener('message', ({ source: sender, data, ports }) => {
      if (sender !== parent || !data) return
      if (data.type === 'inspect') {
        const { id, canvasCursor, canvasSize, state } = data.step
        preview = { id, canvasCursor, canvasSize, state }
        showPreview(data.drawing)
      }
      if (data.type === 'live') {
        preview = null
        if (drawing) drawing.hide()
        else if (trace.render || readState?.() !== undefined) render()
      }
      if (data.type === 'exportDrawing' && ports[0]) {
        const { cursors, id } = data
        const saved = restored && id <= restored.latest.id ? restored.drawings : undefined
        ports[0].postMessage(drawing?.export(cursors, saved))
        ports[0].close()
      }
    })

    p.setup = () => {
      if (!draw && trace.render) {
        p.createCanvas(width, height)
        p.frameRate(12)
      }
      if (!preview && cycle === 'frame' && !recorder.active) recorder.begin()
      if (setup) run('setup', () => setup.call(p))
      if (p.canvas) {
        p.canvas.tabIndex = 0
        p.canvas.setAttribute('aria-label', 'Interactive p5.js canvas')
      }
      if (restored) {
        recorder.restore(restored.latest.cycle, restored.latest.id)
        if (!drawing) trace.state = copy(restored.latest.state)
      }
      if (preview) showPreview()
      else if (!draw) render()
      if (cycle === 'frame') recorder.end()
      send({ type: 'ready' })
    }

    p.draw = () => {
      if (preview) return
      const frameCycle = cycle === 'frame'
      if (frameCycle && !recorder.active) {
        drawing?.nextFrame()
        recorder.begin()
      }
      event = 'draw'
      if (draw) draw.call(p)
      else {
        if (trace.tick) run('draw', trace.tick)
        render()
      }
      if (frameCycle) recorder.end()
    }

    let pressedOnCanvas = false
    for (const [name, handler] of Object.entries(handlers)) {
      p[name] = (input) => {
        if (name === 'mousePressed') {
          pressedOnCanvas = input?.target === p.canvas
          if (pressedOnCanvas) p.canvas.focus()
        }
        if (name.startsWith('mouse') && !pressedOnCanvas) return
        if (name === 'mouseReleased') pressedOnCanvas = false
        if (name === 'keyPressed' && document.activeElement !== p.canvas) return
        if (preview) return
        const eventCycle = cycle === 'event'
        const frameStart = cycle === 'frame' && !recorder.active
        if (cycle?.start === name || (handler && (eventCycle || frameStart))) recorder.begin()
        if (handler) drawing?.nextFrame()
        const result = handler && run(name, () => handler.call(p, input))
        if (cycle?.end === name || (handler && eventCycle)) recorder.end()
        return result
      }
    }
  })
}

export function frameDocument(source, debugSource = '', restored = null) {
  const library = new URL(p5Url, window.location.href).href
  const compiled = instrument(source)
  const attached = debugSource.trim() ? `\n;(function () {\n${debugSource}\n}).call(p)` : ''
  const scriptData = (value) => JSON.stringify(value).replaceAll('<', '\\u003c')
  const executable = compiled.source + attached
  // Validate the combined script before replacing the running preview.
  new Function('p', 'trace', compiled.hook, executable)
  const code = scriptData(executable)
  return `<!doctype html><html><head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' ${library}; style-src 'unsafe-inline'; img-src data: blob:">
    <style>html,body{margin:0;overflow:hidden;background:#efede7}canvas{display:block;width:100%!important;height:auto!important;outline:none;touch-action:none}</style>
    <script src="${library}"></script>
    </head><body><script>(${boot.toString()})(${code},${JSON.stringify(compiled.hook)},${TRACE_BATCH_SIZE},${WIDTH},${HEIGHT},${createRecorder.toString()},${createCanvasTrace.toString()},${MAX_DRAWING_COMMANDS},${MAX_DRAWING_WINDOWS},${MAX_DRAWING_BYTES},${scriptData(restored)})</script></body></html>`
}
