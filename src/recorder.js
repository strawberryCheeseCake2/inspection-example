export const RECENT_STEP_LIMIT = 10000
export const TRACE_BATCH_SIZE = 1000

// Serialized into the sketch iframe alongside its runtime.
export function createRecorder(send, snapshot, trace, context, batchSize, sites = []) {
  let cycle = 0
  let active = false
  let sequence = 0
  let pending = []
  let scheduled = false
  let capturing = false
  let globals = () => []
  let caller
  let locals
  const occurrences = new Map()
  const instances = new WeakMap()
  const instanceCounts = new Map()
  const machines = new Map(sites.map((site) =>
    [JSON.stringify([site.collectionPath ?? [site.collection], site.object, site.state]), site]))

  function stateSite(owner, state) {
    const collection = owner.collection
    const path = []
    for (let member = collection ?? owner; member; member = member.parent) path.push(member.id)
    return machines.get(JSON.stringify([path.reverse(), collection ? owner.id : null, state]))
  }

  function sendPending() {
    if (!pending.length) return
    send({ type: 'steps', cycle: pending[0].cycle, steps: pending })
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

  function record(site, bindings, detail) {
    if (!active || capturing) return
    const execution = context()
    if (execution.preview) return
    capturing = true
    try {
      const state = snapshot()
      const { event, canvasCursor, canvasSize } = execution
      const variables = Object.fromEntries(bindings().map(([name, read]) => {
        // A declared binding can be in scope before its initializer has run.
        try { return [name, describe(read())] } catch { return [name, '[Unavailable]'] }
      }))
      if (pending.length && pending[0].cycle !== cycle) sendPending()
      const occurrence = (occurrences.get(site.site ?? site.line) ?? 0) + 1
      occurrences.set(site.site ?? site.line, occurrence)
      pending.push({
        id: ++sequence, cycle, event, ...site, occurrence, variables, canvasCursor, canvasSize, state: JSON.parse(state),
        ...(detail && { fsm: detail }),
      })
      if (pending.length >= batchSize) sendPending()
      else flush()
      return sequence
    } finally {
      capturing = false
    }
  }

  function fsmStep(owner, state, site, visit, detail, read, applied = []) {
    const { collection, collectionPath, object, state: name, site: stateSite } = state
    const { site: id, line, endLine } = site
    let instance = instances.get(owner)
    if ((object !== null || collectionPath) && !instance) {
      const role = JSON.stringify([collectionPath ?? [collection], object])
      instance = (instanceCounts.get(role) ?? 0) + 1
      instanceCounts.set(role, instance)
      instances.set(owner, instance)
    }
    const ownerName = [...(collectionPath ?? [collection]), ...(object === null ? [] : [object])].join(' / ')
      + (instance ? ` #${instance}` : '')
    const label = detail.kind === 'transition' ? `${name} → ${detail.to} · ${detail.event}`
      : detail.kind === 'constraint' ? `${name} · ${detail.property}` : `상태 · ${name}`
    const bindings = new Map([...globals(), ...(caller?.() ?? []), ...(read?.() ?? [])]
      .map((entry) => [entry[0], entry]))
    const localNames = [...bindings.values()].filter(([, , local]) => local).map(([name]) => name)
    return record({ site: id, line, endLine, label: `${ownerName} · ${label}` },
      () => [...bindings.values(), ['$fsmData', () => owner.data], ['$fsmState', () => owner.fsm.currentState], ...applied],
      { collection, ...(collectionPath && { collectionPath }), object, instance, state: name, stateSite, visit, localNames, ...detail })
  }

  return {
    get active() { return active },
    restore(lastCycle, lastSequence) {
      cycle = lastCycle
      sequence = lastSequence
    },
    begin() {
      cycle++
      occurrences.clear()
      active = true
    },
    end() { active = false },
    bind(read) { globals = read },
    fsmCall(machine, name, read) {
      const method = machine[name]
      return (...args) => {
        const outer = caller
        caller = read
        try { return Reflect.apply(method, machine, args) }
        finally { caller = outer }
      }
    },
    enterState(owner, name, previous, from) {
      if (!active || capturing || context().preview) return
      const state = stateSite(owner, name)
      if (!state) return
      if (previous?.cycle === cycle && previous.site === state.site) return previous
      const id = fsmStep(owner, state, state, sequence + 1, { kind: 'state', fromVisit: from?.id })
      return id && { id, cycle, site: state.site }
    },
    transition(owner, from, to, event, visit) {
      if (!visit) return
      const state = stateSite(owner, from)
      const site = state.transitions.find((entry) => entry.to === to && entry.event === event)
      if (site) fsmStep(owner, state, site, visit.id, { kind: 'transition', to, event }, undefined, [
        ['$fsmEvent', () => event],
      ])
    },
    constraint(owner, name, property, index, visit, apply) {
      const outer = locals
      const scope = locals = new Map()
      try {
        apply()
        const state = stateSite(owner, name)
        const site = state.constraints[index]
        if (site) fsmStep(owner, state, site, visit.id, { kind: 'constraint', property, index },
          () => scope.values(), [['$fsmValue', () => owner.data[property]]])
      } finally {
        locals = outer
      }
    },
    line(line, bindings) {
      record({ line, label: `Line ${line}` }, bindings)
    },
    value(line, value, bindings) {
      if (!sites.length) record({ line, label: `Line ${line}` }, bindings)
      else if (locals && !capturing) {
        for (const binding of bindings()) {
          if (binding[2]) locals.set(binding[0], binding)
        }
      }
      return value
    },
  }
}
