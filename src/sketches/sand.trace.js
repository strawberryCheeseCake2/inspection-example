trace.cycle = 'frame'
trace.bind(() => typeof state === 'undefined' ? undefined : state, (value) => { state = value })

trace.manipulate = (x, y, phase) => {
  if (trace.state.grid && typeof paint === 'function' && phase !== 'mouseReleased') paint(x, y)
}

if (typeof drawGrid === 'function') trace.render = drawGrid
