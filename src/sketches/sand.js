let state

const CELL = 15
const COLS = 48
const ROWS = 26
const EMPTY = 0, SAND = 1, WATER = 2, SEED = 3, TREE = 4, SOIL = 5, FLOODED = 6
const colors = ['#eaf0e6', '#ddb15b', '#6699d5', '#77aa53', '#386548', '#83735d', '#486784']

function paint(x, y) {
  const s = state
  const col = Math.floor(x / CELL)
  const row = Math.floor(y / CELL)
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS || s.grid[row][col] === SOIL) return
  s.grid[row][col] = [EMPTY, SAND, WATER, SEED].includes(s.brush) ? s.brush : WATER
  s.cell = { x: col, y: row }
  s.isTree = false
  s.waterNeighbors = countWater(s.grid, col, row)
}

p.setup = () => {
  p.createCanvas(720, 390)
  p.frameRate(12)
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY))
  for (let x = 0; x < COLS; x++) {
    for (let y = 22 + Math.round(2 * Math.sin(x / 5)); y < ROWS; y++) grid[y][x] = SOIL
  }
  for (let x = 13; x < 24; x++) grid[8 + x % 3][x] = WATER
  for (let x = 30; x < 37; x++) grid[7 + x % 3][x] = SAND
  grid[18][17] = SEED
  state = {
    grid, cell: { x: 17, y: 18 }, brush: WATER, isTree: false,
    waterNeighbors: 0, floodThreshold: 2, flooding: false, observed: {},
  }
}

p.mousePressed = () => paint(p.mouseX, p.mouseY)
p.mouseDragged = p.mousePressed
p.keyPressed = () => {
  if (['0', '1', '2', '3'].includes(p.key)) state.brush = Number(p.key)
}

function countWater(grid, x, y) {
  return [[-1, 0], [1, 0], [0, -1], [0, 1]]
    .filter(([dx, dy]) => grid[y + dy]?.[x + dx] === WATER).length
}

function inspectTree(s, x, y) {
  const count = countWater(s.grid, x, y)
  const key = y * COLS + x
  const flood = s.flooding && count >= s.floodThreshold
  if (s.observed[key] === count && !flood) return
  s.observed[key] = count
  s.cell = { x, y }
  s.isTree = s.grid[y][x] === TREE
  s.waterNeighbors = count
  if (flood) {
    s.grid[y][x] = FLOODED
    s.isTree = false
    delete s.observed[key]
  }
}

function updateGrid() {
  const s = state
  const { grid } = s
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] === TREE) inspectTree(s, x, y)
    }
  }
  for (let y = ROWS - 2; y >= 0; y--) {
    for (let x = 0; x < COLS; x++) {
      const value = grid[y][x]
      if (![WATER, SAND, SEED].includes(value)) continue
      const options = value === SEED ? [[0, 1]] : [[0, 1], [-1, 1], [1, 1]]
      const next = options.find(([dx, dy]) => grid[y + dy]?.[x + dx] === EMPTY)
      if (next) {
        grid[y + next[1]][x + next[0]] = value
        grid[y][x] = EMPTY
      } else if (value === SEED) {
        grid[y][x] = TREE
        if (grid[y - 1]?.[x] === EMPTY) grid[y - 1][x] = TREE
        s.cell = { x, y }
        s.isTree = true
        s.waterNeighbors = countWater(grid, x, y)
      }
    }
  }
}

function drawGrid() {
  const { grid, cell } = state
  p.background(colors[EMPTY])
  p.noStroke()
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const color = colors[grid[y][x]]
      if (!grid[y][x]) continue
      p.fill(color ?? colors[EMPTY])
      p.rect(x * CELL, y * CELL, CELL - 1, CELL - 1, 2)
    }
  }
  p.noFill()
  p.stroke('#294833')
  p.strokeWeight(1.5)
  p.rect(cell.x * CELL - 1, cell.y * CELL - 1, CELL + 1, CELL + 1, 2)
}

p.draw = () => {
  updateGrid()
  drawGrid()
}
