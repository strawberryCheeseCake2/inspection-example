trace.cycle = { start: 'mousePressed', end: 'mouseReleased' }
trace.bind(() => typeof state === 'undefined' ? undefined : state, (value) => { state = value })

trace.label('s.cursor = { x, y }', 'Sample drag position')
trace.label('s.overlaps = s.hearts.flatMap((other, i) => overlap(heart, other) ? [i] : [])', 'Check heart overlap')
trace.label('s.active = s.hearts.push(heart) - 1', 'Stamp heart')

trace.manipulate = (x, y, phase) => {
  const s = trace.state
  if (!s.hearts) return
  if (phase === 'mousePressed') {
    s.active = s.hearts.findLastIndex((h) => Math.hypot(x - h.x, y - h.y) < h.size * 0.72)
  }
  if (phase === 'mouseDragged' && s.active >= 0) {
    const heart = s.hearts[s.active]
    heart.x = Math.round(p.constrain(x, 0, p.width))
    heart.y = Math.round(p.constrain(y, 0, p.height))
    s.overlaps = s.hearts.flatMap((h, i) => i !== s.active && overlap(heart, h) ? [i] : [])
  }
}
