trace.cycle = 'frame'
trace.bind(() => typeof state === 'undefined' ? undefined : state, (value) => { state = value })

if (typeof drawGrid === 'function') trace.render = drawGrid
