trace.cycle = 'frame'
trace.bind(() => typeof state === 'undefined' ? undefined : state, (value) => { state = value })

trace.label('s.waterNeighbors = countWater(s.grid, col, row)', 'Paint grid cell')
trace.label('s.waterNeighbors = count', 'Check water neighbors')
trace.label('delete s.observed[key]', 'Flood tree cell')
trace.label('s.waterNeighbors = countWater(grid, x, y)', 'Seed grows into tree')

trace.manipulate = (x, y, phase) => {
  if (trace.state.grid && typeof paint === 'function' && phase !== 'mouseReleased') paint(x, y)
}

if (typeof drawGrid === 'function') trace.render = drawGrid
