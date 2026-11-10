trace.cycle = { start: 'mousePressed', end: 'mouseReleased' }
trace.bind(() => typeof state === 'undefined' ? undefined : state, (value) => { state = value })
