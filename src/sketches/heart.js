let state

const colors = ['#f39cbd', '#f9b7ce', '#e887b2', '#e9a5d5', '#f5acc5']
let lastPoint

function overlap(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < (a.size + b.size) * 0.68
}

function stamp(x, y, size) {
  const s = state
  s.cursor = { x, y }
  const heart = { x, y, size, color: s.hearts.length % colors.length }
  s.overlaps = s.hearts.flatMap((other, i) => overlap(heart, other) ? [i] : [])
  s.active = s.hearts.push(heart) - 1
}

p.setup = () => {
  p.createCanvas(720, 390)
  p.frameRate(12)
  state = { hearts: [], cursor: { x: 0, y: 0 }, active: -1, overlaps: [], merge: false }
}

function addPointerHeart() {
  lastPoint = { x: p.mouseX, y: p.mouseY }
  stamp(lastPoint.x, lastPoint.y, 57)
}

p.mousePressed = () => {
  addPointerHeart()
}

p.mouseDragged = () => {
  if (p.mouseX < 0 || p.mouseX > p.width || p.mouseY < 0 || p.mouseY > p.height) return
  if (!lastPoint || Math.hypot(p.mouseX - lastPoint.x, p.mouseY - lastPoint.y) >= 25) {
    addPointerHeart()
  }
}

function mergeClusters(hearts) {
  const pending = [...hearts]
  const result = []
  while (pending.length) {
    const cluster = [pending.pop()]
    for (const heart of cluster) {
      for (let i = pending.length - 1; i >= 0; i--) {
        if (overlap(heart, pending[i])) cluster.push(...pending.splice(i, 1))
      }
    }
    result.push({
      x: cluster.reduce((sum, h) => sum + h.x, 0) / cluster.length,
      y: cluster.reduce((sum, h) => sum + h.y, 0) / cluster.length,
      size: Math.hypot(...cluster.map((h) => h.size)),
      color: cluster[0].color,
    })
  }
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

p.draw = () => {
  const s = state
  p.background('#f5edf5')
  p.stroke('#ded2e2')
  p.strokeWeight(2)
  for (let y = 15; y < p.height; y += 15) {
    for (let x = 15; x < p.width; x += 15) p.point(x, y)
  }
  p.noFill()
  p.stroke('#a875ac')
  p.drawingContext.setLineDash([4, 6])
  p.beginShape()
  for (const { x, y } of [...s.hearts, s.cursor]) p.vertex(x, y)
  p.endShape()
  p.drawingContext.setLineDash([])
  for (const heart of s.merge ? mergeClusters(s.hearts) : s.hearts) drawHeart(heart)
  const active = s.hearts[s.active]
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
