export const HISTORY_LIMIT = 3000

// Serialized into the sketch iframe alongside its runtime.
export function createRecorder(send, snapshot, trace, context, functions, limit) {
  let cycle = 0
  let active = false
  let sequence = 0
  let pending = []
  let scheduled = false
  let capturing = false
  const sites = new Map(functions.map((site) => [site.functionId, site]))

  function sendPending() {
    if (!pending.length) return
    send({ type: 'steps', cycle: pending[0].cycle, steps: pending.slice(-limit) })
    pending = []
  }

  function flush() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      sendPending()
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

  function capture({ label, line, endLine, functionId }, bindings) {
    capturing = true
    try {
      const state = snapshot()
      const { event, canvasCursor, canvasSize } = context()
      const variables = Object.fromEntries((bindings ?? []).map(([name, read]) => {
        // A declared binding can be in scope before its initializer has run.
        try { return [name, describe(read())] } catch { return [name, '[Unavailable]'] }
      }))
      if (pending.length && pending[0].cycle !== cycle) sendPending()
      pending.push({
        id: ++sequence, cycle, event, label, line, endLine, functionId, variables, canvasCursor, canvasSize,
        state: JSON.parse(state),
      })
      if (pending.length >= 2 * limit) pending = pending.slice(-limit)
      flush()
    } finally {
      capturing = false
    }
  }

  return {
    get active() { return active },
    restore(lastCycle, lastSequence) {
      cycle = lastCycle
      sequence = lastSequence
    },
    begin() {
      cycle++
      active = true
    },
    end() { active = false },
    enter() {
      return active && !capturing && !context().preview ? { cycle } : null
    },
    block(call, bindings) {
      call.blocks ??= new Map()
      for (const [name, read] of bindings) call.blocks.set(name, read)
    },
    finish(call, functionId) {
      if (!call || call.cycle !== cycle || !active || capturing || context().preview) return
      const { name, line, endLine } = sites.get(functionId)
      const bindings = [...(call.blocks ?? []), ...(call.bindings?.() ?? [])]
      capture({ label: `${name}()`, line, endLine, functionId }, bindings)
    },
  }
}
