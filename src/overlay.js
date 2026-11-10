import { parse } from 'acorn'
import { simple } from 'acorn-walk'

export const overlaySite = (step) => step.functionId ?? -step.line

export function overlaySnapshot(step) {
  const variables = Object.fromEntries(Object.entries(step.variables ?? {}).flatMap(([name, value]) => {
    try { return [[name, JSON.parse(value)]] } catch { return [] }
  }))
  const { id, cycle, event, label, line, endLine, canvasSize, state } = step
  return { id, site: overlaySite(step), cycle, event, label, line, endLine, canvasSize, variables, state }
}

export function overlayContext(steps, current, limit = 8) {
  const sites = new Set()
  const context = []
  for (let index = steps.length - 1; index >= 0 && context.length < limit; index--) {
    const step = steps[index]
    if (step.cycle !== current.cycle || step.id >= current.id || sites.has(overlaySite(step))) continue
    if (current.canvasSize && step.canvasSize && current.canvasSize.some((size, axis) => size !== step.canvasSize[axis])) continue
    sites.add(overlaySite(step))
    context.push(overlaySnapshot(step))
  }
  return context
}

// Also runs in the overlay worker, so the reader has no module dependencies.
export function readOverlayValue(snapshot, scope, path) {
  if (!['variables', 'state'].includes(scope) || !Array.isArray(path) || !path.length || path.length > 12) return
  let value = snapshot?.[scope]
  for (const key of path) {
    if (!(typeof key === 'string' && key.length <= 120) && !(Number.isSafeInteger(key) && key >= 0)) return
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return
    value = value[key]
  }
  return value
}

export function overlayLabels(marks, { step, context, width, height }) {
  if (!Array.isArray(marks)) return []
  const snapshots = new Map([step, ...context].map((item) => [item.id, item]))
  return marks.slice(0, 8).flatMap((mark) => {
    const { x, y, fields } = mark ?? {}
    if (![x, y].every(Number.isFinite) || x < 0 || x > width || y < 0 || y > height || !Array.isArray(fields)) return []
    const labels = new Set()
    for (const field of fields.slice(0, 6)) {
      if (!Array.isArray(field)) continue
      const [scope, path, id = step.id] = field
      const value = readOverlayValue(snapshots.get(id), scope, path)
      if (value === undefined) continue
      const display = JSON.stringify(value)
      if (display.length > 96 || /"(?:\[(?:…|Reference|Accessor|Unavailable)\]|…(?: \(\d+ items\))?)"/.test(display)) continue
      const name = path.map((key, index) => /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(key)
        ? (index ? '.' : '') + key
        : `[${JSON.stringify(key)}]`).join('')
      labels.add(`${name}: ${display}`)
    }
    return labels.size ? [{ x, y, labels: [...labels] }] : []
  })
}

function sampleSnapshot(snapshot, paths, budget) {
  const inputs = [
    ...Object.entries(snapshot.state).map(([name, value]) => ({ name, value, scope: 'state', path: name })),
    ...Object.entries(snapshot.variables).map(([name, value]) => ({ name, value, scope: 'variables', path: '@' + name })),
  ].map((input) => ({ ...input, size: JSON.stringify([input.name, input.value]).length }))
  const data = { variables: Object.create(null), state: Object.create(null) }
  const omitted = []
  // Leave room for coordinates and other drawing inputs outside the analysis selection.
  let selectedBudget = Math.floor(budget / 2)
  for (const { scope, name, value, path, size } of inputs) {
    if (size <= selectedBudget && paths.some((item) => item === path || item.startsWith(path + '.'))) {
      data[scope][name] = value
      selectedBudget -= size
      budget -= size
    }
  }
  for (const { scope, name, value, path, size } of inputs.sort((a, b) => a.size - b.size)) {
    if (Object.hasOwn(data[scope], name)) continue
    if (size > budget) {
      if (omitted.length < 24) omitted.push(path.slice(0, 120))
      continue
    }
    budget -= size
    data[scope][name] = value
  }
  return { ...snapshot, ...data, omitted }
}

export function overlayEvidence(steps, report, current) {
  const annotations = new Map(report.steps.map(({ id, paths }) => [id, paths]))
  const groups = new Map()
  if (current && annotations.has(current.id)) groups.set(overlaySite(current), [])
  for (const step of steps) {
    if (!annotations.has(step.id)) continue
    const site = overlaySite(step)
    if (!groups.has(site)) groups.set(site, [])
    groups.get(site).push(step)
  }
  return [...groups.values()].slice(0, 16).flatMap((group) => {
    const samples = new Set([group.find(({ id }) => id === current?.id), group.at(-1), group[0]])
    return [...samples].filter(Boolean).slice(0, 2).map((step) => {
      const paths = annotations.get(step.id)
      const context = overlayContext(steps, step, 4).map((snapshot) => sampleSnapshot(snapshot, [], 750))
      return { ...sampleSnapshot(overlaySnapshot(step), paths, 5000), paths, context }
    })
  })
}

export function checkedOverlay(plan, evidence) {
  const pending = new Set(evidence.map(({ site }) => site))
  if (!Array.isArray(plan?.plans) || plan.plans.length !== pending.size) return null
  const bySite = Object.create(null)
  let codeLength = 0
  try {
    for (const { site, code, skipReason } of plan.plans) {
      if (!pending.delete(site) || typeof code !== 'string' || typeof skipReason !== 'string') return null
      const reason = skipReason.trim()
      if (!code.trim()) {
        if (!reason) return null
        bySite[site] = { code: '', skipReason: reason }
        continue
      }
      codeLength += code.length
      if (reason || codeLength > 24000) return null
      const tree = parse('"use strict";\n' + code, { ecmaVersion: 2024, allowReturnOutsideFunction: true })
      let anchored = false
      simple(tree, { CallExpression({ callee }) { if (callee.type === 'Identifier' && callee.name === 'mark') anchored = true } })
      if (!anchored) return null
      bySite[site] = { code, skipReason: '' }
    }
    return { bySite }
  } catch {
    return null
  }
}
