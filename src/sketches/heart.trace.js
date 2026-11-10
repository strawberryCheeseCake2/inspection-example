trace.cycle = { start: 'mousePressed', end: 'mouseReleased' }
trace.bind(() => typeof state === 'undefined' ? undefined : state, (value) => { state = value })

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
    s.overlaps = findOverlaps(heart, s.hearts, s.active)
  }
}
