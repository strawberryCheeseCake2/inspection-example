import p5Url from 'p5/lib/p5.min.js?url&no-inline'
import { instrument } from './instrument.js'
import { createRecorder } from './recorder.js'

export const WIDTH = 720
export const HEIGHT = 390

// Serialized into an opaque-origin iframe. Keep this function self-contained.
function boot(source, hook, anchors, width, height, createRecorder, restored) {
  const send = (message) => parent.postMessage(message, '*')
  const copy = (value) => JSON.parse(JSON.stringify(value))
  let event = 'setup'
  let preview = restored?.step ?? null
  let editing = false
  let fallbackState = {}
  let readState
  let writeState
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
    label(anchor, label) {
      const site = anchors[anchor.replace(/;$/, '').trim()]
      if (Number.isInteger(site)) recorder.label(site, label)
    },
    step(label) {
      if (!preview) recorder.capture(String(label).slice(0, 100), null)
    },
    startCycle() {
      if (!preview) recorder.begin()
    },
    endCycle() {
      if (!preview) recorder.end()
    },
  }
  const recorder = createRecorder(send, snapshot, trace, () => ({ event, preview }))

  function snapshot() {
    if (!trace.state || typeof trace.state !== 'object' || Array.isArray(trace.state)) {
      throw new Error('trace.state는 JSON 객체여야 합니다.')
    }
    const json = JSON.stringify(trace.state)
    if (!json || json.length > 64000) throw new Error('trace.state must be JSON data under 64 KB.')
    return json
  }

  new p5((p) => {
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

    function render() {
      if (!redraw || (preview && !trace.render && readState?.() === undefined)) return
      const liveState = trace.state
      if (preview) trace.state = copy(preview.state)
      recorder.callback(true)
      p.push()
      try {
        redraw.call(trace.render ? trace : p)
      } finally {
        p.pop()
        if (preview) trace.state = liveState
      }
    }

    function run(name, handler) {
      event = name
      recorder.callback()
      return handler()
    }

    function edit(label, mutate) {
      if (!preview) return
      const liveState = trace.state
      const before = JSON.stringify(preview.state)
      trace.state = preview.state
      try {
        mutate()
        const json = snapshot()
        preview.state = JSON.parse(json)
        if (json === before) return
        event = 'stateEdit'
        recorder.capture(label, preview.line, null, preview.id, preview.cycle)
        preview.id = recorder.sequence
      } finally {
        trace.state = liveState
      }
      render()
    }

    function setValue(path, value) {
      const key = path.at(-1)
      let target = trace.state
      for (const part of path.slice(0, -1)) {
        if (!target || typeof target !== 'object' || !Object.hasOwn(target, part)) return
        target = target[part]
      }
      if (!target || typeof target !== 'object' || !Object.hasOwn(target, key)) return
      if (!['number', 'boolean', 'string'].includes(typeof value) || typeof target[key] !== typeof value) return
      if (typeof value === 'number' && !Number.isFinite(value)) return
      target[key] = value
    }

    window.addEventListener('message', ({ source: sender, data }) => {
      if (sender !== parent || !data) return
      if (data.type === 'inspect') {
        const { id, cycle, line, state } = data.step
        preview = { id, cycle, line, state: copy(state) }
        render()
      }
      if (data.type === 'live') {
        if (data.state) trace.state = copy(data.state)
        preview = null
        if (trace.render || readState?.() !== undefined) render()
      }
      if (data.type === 'edit') {
        const { path, value } = data
        edit(path.join('.'), () => setValue(path, value))
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
        trace.state = copy(restored.latest.state)
      }
      if (preview || !draw) render()
      if (cycle === 'frame') recorder.end()
      send({ type: 'ready' })
    }

    p.draw = () => {
      if (preview) return
      const frameCycle = cycle === 'frame'
      if (frameCycle && !recorder.active) recorder.begin()
      event = 'draw'
      if (draw) {
        if (trace.render) run('draw', () => draw.call(p))
        else {
          recorder.callback(true)
          draw.call(p)
        }
      } else {
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
        if (preview) {
          if (name === 'mousePressed') editing = true
          if (editing && trace.manipulate && name.startsWith('mouse')) {
            edit('Canvas manipulation', () => trace.manipulate(p.mouseX, p.mouseY, name))
          }
          if (name === 'mouseReleased') editing = false
          return
        }
        const eventCycle = cycle === 'event'
        const frameStart = cycle === 'frame' && !recorder.active
        if (cycle?.start === name || (handler && (eventCycle || frameStart))) recorder.begin()
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
    </head><body><script>(${boot.toString()})(${code},${JSON.stringify(compiled.hook)},${scriptData(compiled.anchors)},${WIDTH},${HEIGHT},${createRecorder.toString()},${scriptData(restored)})</script></body></html>`
}
