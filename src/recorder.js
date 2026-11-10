// Serialized into the sketch iframe alongside its runtime.
export function createRecorder(send, snapshot, trace, context) {
  let cycle = 0
  let active = false
  let sequence = 0
  let pending = []
  let scheduled = false
  let capturing = false
  let counts = new Map()
  let renderCounts = new Map()
  const labels = new Map()
  let rootBindings

  function flush() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      send({ type: 'steps', cycle: pending[0].cycle, steps: pending })
      pending = []
    })
  }

  function describe(value) {
    if (typeof value === 'string') return JSON.stringify(value.slice(0, 600))
    if (typeof value === 'function') return '[Function]'
    if (typeof value === 'bigint') return `${value}n`
    if (!value || typeof value !== 'object') return String(value)
    if (value === trace.state) return '[trace.state]'
    const seen = new WeakSet()
    function preview(item, depth) {
      if (!item || typeof item !== 'object') {
        return typeof item === 'string' ? item.slice(0, 120)
          : ['number', 'boolean'].includes(typeof item) ? item : String(item).slice(0, 120)
      }
      if (seen.has(item)) return '[Reference]'
      if (depth >= 3) return '[…]'
      seen.add(item)
      const keys = Object.keys(item)
      const shown = keys.slice(0, 16).map((key) => {
        const property = Object.getOwnPropertyDescriptor(item, key)
        return [key, property && 'value' in property ? preview(property.value, depth + 1) : '[Accessor]']
      })
      if (Array.isArray(item)) {
        const entries = shown.map(([, entry]) => entry)
        if (item.length > shown.length) entries.push(`… (${item.length} items)`)
        return entries
      }
      if (keys.length > shown.length) shown.push(['…', `${keys.length} properties`])
      return Object.fromEntries(shown)
    }
    const result = JSON.stringify(preview(value, 0))
    return result.length > 1600 ? result.slice(0, 1599) + '…' : result
  }

  function capture(label, line, bindings, baseId = null, stepCycle = cycle) {
    if (capturing || !Number.isInteger(line) || (!active && baseId === null)) return
    capturing = true
    try {
      const state = snapshot()
      const { event } = context()
      const variables = Object.fromEntries(((bindings ?? rootBindings)?.() ?? []).map(([name, read]) => {
        // A declared binding can be in scope before its initializer has run.
        try { return [name, describe(read())] } catch { return [name, '[Unavailable]'] }
      }))
      if (pending.length && pending[0].cycle !== stepCycle) pending = []
      pending.push({
        id: ++sequence, cycle: stepCycle, event, label, line, variables,
        state: JSON.parse(state),
        baseId,
      })
      flush()
    } finally {
      capturing = false
    }
  }

  function point(line, site, bindings) {
    if (!active || capturing || context().preview) return
    const count = (counts.get(site) ?? 0) + 1
    counts.set(site, count)
    // Keep the first visit and sample repeats within a single callback.
    const label = labels.get(site)
    if (label || (count & (count - 1)) === 0) capture(label ?? `Line ${line}`, line, bindings)
  }

  return {
    get active() { return active },
    get sequence() { return sequence },
    restore(lastCycle, lastSequence) {
      cycle = lastCycle
      sequence = lastSequence
    },
    begin() {
      cycle++
      counts = new Map()
      renderCounts = new Map()
      active = true
    },
    end() { active = false },
    label(site, label) { labels.set(site, label) },
    register(bindings) { rootBindings = bindings },
    callback(rendering = false) { counts = rendering ? renderCounts : new Map() },
    capture,
    point,
    result(value, line, site, bindings) {
      point(line, site, bindings)
      return value
    },
    step(line, _site, bindings) {
      return (label) => {
        if (!context().preview) capture(String(label).slice(0, 100), line, bindings)
      }
    },
  }
}
