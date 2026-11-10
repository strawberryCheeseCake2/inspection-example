let state

const colors = ['#f39cbd', '#f9b7ce', '#e887b2', '#e9a5d5', '#f5acc5']
let lastPoint

function overlap(a, b) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y)
  const overlapRadius = (a.size + b.size) * 0.68
  const isOverlapping = distance < overlapRadius
  return isOverlapping
}

function findOverlaps(heart, hearts, ignoredIndex = -1) {
  const overlaps = []
  for (let i = 0; i < hearts.length; i++) {
    if (i !== ignoredIndex && overlap(heart, hearts[i])) overlaps.push(i)
  }
  return overlaps
}

function stamp(x, y, size) {
  const s = state
  s.cursor = { x, y }
  const heart = { x, y, size, color: s.hearts.length % colors.length }
  s.overlaps = findOverlaps(heart, s.hearts)
  s.active = s.hearts.push(heart) - 1
}

p.setup = () => {
  p.createCanvas(720, 390)
  p.frameRate(12)
  state = { hearts: [], cursor: { x: 0, y: 0 }, active: -1, overlaps: [], merge: false }
}

function samplePointer() {
  const x = p.mouseX
  const y = p.mouseY
  return { x, y }
}

function addPointerHeart(point) {
  lastPoint = point
  const size = 57
  stamp(point.x, point.y, size)
}

function shouldStamp(point) {
  const insideCanvas = point.x >= 0 && point.x <= p.width && point.y >= 0 && point.y <= p.height
  const spacing = 25
  const distance = lastPoint ? Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) : Infinity
  const ready = insideCanvas && distance >= spacing
  return ready
}

p.mousePressed = () => {
  addPointerHeart(samplePointer())
}

p.mouseDragged = () => {
  const point = samplePointer()
  if (shouldStamp(point)) addPointerHeart(point)
}

function collectCluster(pending) {
  const cluster = [pending.pop()]
  for (const heart of cluster) {
    for (let i = pending.length - 1; i >= 0; i--) {
      if (overlap(heart, pending[i])) cluster.push(...pending.splice(i, 1))
    }
  }
  return cluster
}

function combineCluster(cluster) {
  let totalX = 0
  let totalY = 0
  const sizes = []
  for (const heart of cluster) {
    totalX += heart.x
    totalY += heart.y
    sizes.push(heart.size)
  }
  const x = totalX / cluster.length
  const y = totalY / cluster.length
  const size = Math.hypot(...sizes)
  return { x, y, size, color: cluster[0].color }
}

function mergeClusters(hearts) {
  const pending = [...hearts]
  const result = []
  while (pending.length) result.push(combineCluster(collectCluster(pending)))
  return result
}

function drawHeart({ x, y, size, color }) {
  p.push()
  p.translate(x, y)
  p.scale(Math.max(0, Math.min(size, 250)) / 50)
  p.stroke('#a84f7b')
  p.strokeWeight(0.75)
  p.fill(colors[color] ?? colors[0])
  p.beginShape()
  p.vertex(0, -10)
  p.bezierVertex(-22, -34, -42, -4, 0, 24)
  p.bezierVertex(42, -4, 22, -34, 0, -10)
  p.endShape(p.CLOSE)
  p.pop()
}

function drawPaper() {
  p.background('#f5edf5')
  p.stroke('#ded2e2')
  p.strokeWeight(2)
  for (let y = 15; y < p.height; y += 15) {
    for (let x = 15; x < p.width; x += 15) p.point(x, y)
  }
}

function drawTrajectory(hearts, cursor) {
  p.noFill()
  p.stroke('#a875ac')
  p.drawingContext.setLineDash([4, 6])
  p.beginShape()
  for (const { x, y } of [...hearts, cursor]) p.vertex(x, y)
  p.endShape()
  p.drawingContext.setLineDash([])
}

function drawSelection(active) {
  if (!active) return
  p.noFill()
  p.stroke('#754681')
  p.strokeWeight(1)
  p.drawingContext.setLineDash([3, 4])
  p.circle(active.x, active.y, Math.max(12, Math.min(active.size + 18, 260)))
  p.drawingContext.setLineDash([])
  p.line(active.x - 4, active.y, active.x + 4, active.y)
  p.line(active.x, active.y - 4, active.x, active.y + 4)
}

p.draw = () => {
  const { hearts, cursor, merge, active } = state
  drawPaper()
  drawTrajectory(hearts, cursor)
  const visibleHearts = merge ? mergeClusters(hearts) : hearts
  for (const heart of visibleHearts) drawHeart(heart)
  drawSelection(hearts[active])
}
