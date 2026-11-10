export const MAX_DRAWING_COMMANDS = 100000
export const MAX_DRAWING_WINDOWS = 8

// Serialized into the sketch iframe. Only Canvas 2D commands with plain data are recorded.
export function createCanvasTrace(p, limit, rolling, windowLimit) {
  const methods = ('save restore reset scale rotate translate transform setTransform resetTransform ' +
    'clearRect fillRect strokeRect beginPath closePath moveTo lineTo bezierCurveTo quadraticCurveTo ' +
    'arc arcTo ellipse rect roundRect fill stroke clip fillText strokeText setLineDash').split(' ')
  const properties = ('direction fillStyle filter font fontKerning fontStretch fontVariantCaps ' +
    'globalAlpha globalCompositeOperation imageSmoothingEnabled imageSmoothingQuality letterSpacing ' +
    'lineCap lineDashOffset lineJoin lineWidth miterLimit shadowBlur shadowColor shadowOffsetX ' +
    'shadowOffsetY strokeStyle textAlign textBaseline textRendering wordSpacing').split(' ')
  const byteLimit = 4_000_000
  let journal = { commands: [], offset: 0, first: 0, bytes: 0 }
  const archived = []
  let checkpoint
  let depth = 0
  let clipped = false
  let path = []
  let pathMatrix
  let background
  let available = true
  let context
  let size
  let overlay

  function record(command) {
    if (!available) return
    journal.bytes += JSON.stringify(command).length
    if (journal.commands.length >= limit || journal.bytes > byteLimit) available = false
    if (available) journal.commands.push(command)
  }

  function syncSize() {
    const { width, height } = context.canvas
    if (size?.[0] === width && size?.[1] === height) return
    size = [width, height]
    depth = 0
    clipped = false
    path = []
    pathMatrix = undefined
    checkpoint = undefined
    if (width > 8192 || height > 8192 || width * height > 16000000) available = false
    record(['size', width, height])
  }

  function plain(value) {
    if (value === undefined) return null
    if (value === null || typeof value === 'boolean' || Number.isFinite(value)) return value
    if (typeof value === 'string' && value.length <= 2048) return value
    if (Array.isArray(value) && value.length <= 256) return value.map(plain)
    throw new TypeError('Drawing command requires a canvas resource')
  }

  function transform() {
    const { a, b, c, d, e, f } = context.getTransform()
    return ['setTransform', a, b, c, d, e, f]
  }

  const pathMethods = new Set(('closePath moveTo lineTo bezierCurveTo quadraticCurveTo ' +
    'arc arcTo ellipse rect roundRect').split(' '))

  function track(name, args) {
    if (name === 'save') depth++
    if (name === 'restore') depth = Math.max(0, depth - 1)
    if (name === 'clip') clipped = true
    if (name === 'reset' || name === 'beginPath') {
      path = []
      pathMatrix = undefined
    }
    if (name === 'reset') {
      depth = 0
      clipped = false
    }
    if (path && pathMethods.has(name)) {
      const matrix = transform()
      if (!pathMatrix || matrix.some((value, index) => value !== pathMatrix[index])) {
        path.push(matrix)
        pathMatrix = matrix
      }
      path.push([name, ...args])
      if (path.length > 2048) path = null
    }
    if (background && name === 'fillRect') {
      const [, a, b, c, d, e, f] = transform()
      const [x, y, width, height] = args
      const color = context.fillStyle
      if (!clipped && a > 0 && d > 0 && b === 0 && c === 0
        && a * x + e <= 0 && d * y + f <= 0
        && a * (x + width) + e >= size[0] && d * (y + height) + f >= size[1]
        && context.globalAlpha === 1 && context.globalCompositeOperation === 'source-over'
        && context.filter === 'none' && /^#[\da-f]{6}$/i.test(color)) background.color = color
    }
  }

  function contextProperties() {
    return properties.flatMap((property) => {
      const value = context[property]
      return value !== undefined && typeof value !== 'object' ? [['set', property, value]] : []
    })
  }

  if (rolling) {
    const original = p.background
    p.background = function (...args) {
      if (!available || !context || depth || clipped || !path) return original.apply(this, args)
      const overwrite = background = {}
      try {
        const result = original.apply(this, args)
        if (available && overwrite.color && !depth && !clipped && path) {
          // Opaque background covers every pixel. Keep enough commands to rebuild the context too.
          const prefix = [
            ['size', ...size], ['set', 'fillStyle', overwrite.color], ['fillRect', 0, 0, ...size],
            ...contextProperties(), ['setLineDash', context.getLineDash()], ...path, transform(),
          ]
          checkpoint = { cursor: journal.offset + journal.commands.length, prefix }
        }
        return result
      } finally {
        background = undefined
      }
    }
  }

  function nextFrame() {
    if (!available || !checkpoint || (journal.commands.length < limit / 2 && journal.bytes < byteLimit / 2)) return
    const { cursor, prefix } = checkpoint
    const commands = prefix.concat(journal.commands.slice(cursor - journal.offset))
    if (commands.length >= journal.commands.length) return
    archived.unshift(journal)
    if (archived.length >= windowLimit) archived.pop()
    journal = { commands, offset: cursor - prefix.length, first: cursor,
      bytes: commands.reduce((total, command) => total + JSON.stringify(command).length, 0) }
    checkpoint = undefined
  }

  function windowFor(cursor, windows = [journal, ...archived]) {
    return windows.find((entry) => entry.first <= cursor
      && cursor <= entry.offset + entry.commands.length)
  }

  function attach() {
    const next = p.drawingContext
    if (!(next instanceof CanvasRenderingContext2D)) {
      available = false
      return
    }
    if (next === context) {
      syncSize()
      return
    }
    context = next
    size = null
    syncSize()
    const prototype = CanvasRenderingContext2D.prototype
    for (const property of properties) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property)
      if (!descriptor?.set) continue
      Object.defineProperty(next, property, {
        ...descriptor,
        set(value) {
          const before = descriptor.get.call(this)
          if (available && this === context) syncSize()
          descriptor.set.call(this, value)
          const after = descriptor.get.call(this)
          if (!available || this !== context || before === after) return
          if (typeof after === 'object' || (typeof after === 'string' && after.length > 2048)) available = false
          else record(['set', property, after])
        },
      })
    }
    for (const name of [...methods, 'drawImage', 'putImageData', 'drawFocusIfNeeded']) {
      const method = next[name]
      if (typeof method !== 'function') continue
      Object.defineProperty(next, name, {
        configurable: true,
        writable: true,
        value(...args) {
          if (available && this === context) syncSize()
          const result = method.apply(this, args)
          if (!available || this !== context) return result
          try {
            if (!methods.includes(name)) throw new TypeError('Drawing method requires a canvas resource')
            if (name === 'setTransform' && args.length === 1) {
              const matrix = this.getTransform()
              args = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
            }
            args = args.map(plain)
            record([name, ...args])
            if (rolling && available) track(name, args)
          } catch {
            available = false
          }
          return result
        },
      })
    }
    for (const command of contextProperties()) record(command)
    record(transform())
  }

  for (const name of ['createCanvas', 'resizeCanvas']) {
    const original = p[name]
    p[name] = function (...args) {
      size = null
      const result = original.apply(this, args)
      attach()
      return result
    }
  }

  function hide() {
    overlay?.remove()
    overlay = undefined
  }

  function show(cursor, saved) {
    const live = p.canvas
    if (!live?.parentNode) return
    if (!overlay) {
      overlay = document.createElement('canvas')
      overlay.setAttribute('aria-label', '이전 스텝 캔버스')
      // Keep the live canvas in place so resuming needs no redraw or state mutation.
      overlay.style.cssText = 'position:absolute;background:#efede7;pointer-events:none'
      live.after(overlay)
    }
    const { top, left } = live.getBoundingClientRect()
    overlay.style.top = `${top}px`
    overlay.style.left = `${left}px`
    const replay = overlay.getContext('2d')
    overlay.width = live.width
    overlay.height = live.height
    const recording = Number.isSafeInteger(cursor) && windowFor(cursor, saved)
    if (!recording) {
      replay.fillStyle = '#504d44'
      replay.font = '16px sans-serif'
      replay.fillText('이 스텝의 캔버스 기록을 재생할 수 없어요.', 16, 30)
      return
    }
    for (let index = 0; index < cursor - recording.offset; index++) {
      const [name, ...args] = recording.commands[index]
      if (name === 'size') {
        overlay.width = args[0]
        overlay.height = args[1]
      } else if (name === 'set' && properties.includes(args[0])) {
        replay[args[0]] = args[1]
      } else if (methods.includes(name)) {
        replay[name](...args)
      }
    }
    return overlay
  }

  return {
    hide, show, nextFrame,
    cursor() {
      if (!available || !context) return null
      syncSize()
      return available ? journal.offset + journal.commands.length : null
    },
    export(cursors, saved) {
      const used = new Map()
      for (const cursor of cursors) {
        const entry = windowFor(cursor, saved)
        if (entry) used.set(entry, Math.max(used.get(entry) ?? cursor, cursor))
      }
      return [...used].sort(([a], [b]) => b.first - a.first).map(([entry, cursor]) => ({
        first: entry.first, offset: entry.offset, commands: entry.commands.slice(0, cursor - entry.offset),
      }))
    },
  }
}
