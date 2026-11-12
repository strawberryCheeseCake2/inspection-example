import { parse } from 'acorn'
import { simple } from 'acorn-walk'

export const overlaySite = (step) => step.site ?? step.functionId ?? -step.line

export function overlaySnapshot(step) {
  const variables = Object.fromEntries(Object.entries(step.variables ?? {}).flatMap(([name, value]) => {
    try { return [[name, JSON.parse(value)]] } catch { return [] }
  }))
  const { id, cycle, event, label, line, endLine, canvasSize, state, fsm } = step
  return { id, site: overlaySite(step), cycle, event, label, line, endLine, canvasSize, variables, state, fsm }
}

export function overlayOccurrences(steps, selected, accumulate, width, height) {
  if (!accumulate) return [selected]
  const site = overlaySite(selected)
  const previous = steps.filter((step) => step.id < selected.id && step.cycle === selected.cycle
    && overlaySite(step) === site && step.canvasSize?.[0] === width && step.canvasSize?.[1] === height)
  return [selected, ...previous.reverse()]
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

// Also runs in the worker to keep its output limited to bounded canvas geometry.
export function overlayGuide(geometry, width, height) {
  const { type, points, color } = geometry ?? {}
  const minimum = { point: 1, polyline: 2, outline: 3, area: 3, vector: 2, dimension: 2 }
  if (typeof type !== 'string' || !Object.hasOwn(minimum, type)) return null
  if (!Array.isArray(points) || points.length > 96) return null
  const fixed = type === 'point' || type === 'vector' || type === 'dimension'
  if (fixed ? points.length !== minimum[type] : points.length < minimum[type]) return null
  const vertices = []
  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    if (!Array.isArray(point) || point.length !== 2) return null
    const [x, y] = point
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > width * 16 || Math.abs(y) > height * 16) return null
    vertices.push([x, y])
  }
  if (fixed && vertices.length === 2 && vertices[0][0] === vertices[1][0] && vertices[0][1] === vertices[1][1]) return null
  return { type, points: vertices, color: typeof color === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color) ? color : undefined }
}

export function overlayLabels(marks, { step, context, width, height }) {
  if (!Array.isArray(marks)) return []
  const snapshots = new Map([step, ...context].map((item) => [item.id, item]))
  return marks.slice(0, 8).flatMap((mark) => {
    const { x, y, fields, guides } = mark ?? {}
    if (![x, y].every(Number.isFinite) || x < 0 || x > width || y < 0 || y > height || !Array.isArray(fields)) return []
    const labels = new Map()
    const visibleFields = new Map()
    for (const [index, field] of fields.slice(0, 6).entries()) {
      if (!Array.isArray(field)) continue
      const [scope, path, id = step.id] = field
      const value = readOverlayValue(snapshots.get(id), scope, path)
      if (value === undefined) continue
      const display = JSON.stringify(value)
      if (display.length > 96 || /"(?:\[(?:…|Reference|Accessor|Unavailable)\]|…(?: \(\d+ items\))?)"/.test(display)) continue
      const name = path.map((key, index) => /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(key)
        ? (index ? '.' : '') + key
        : `[${JSON.stringify(key)}]`).join('')
      const key = JSON.stringify([scope, path.map(String)])
      labels.set(JSON.stringify([key, display]), { key, name, value: display })
      visibleFields.set(index, key)
    }
    if (!labels.size) return []
    const visibleGuides = Array.isArray(guides) ? guides.slice(0, 16).flatMap((guide) => {
      const geometry = visibleFields.has(guide?.field) && overlayGuide(guide, width, height)
      return geometry ? [{ ...geometry, fieldKey: visibleFields.get(guide.field) }] : []
    }) : []
    return [{ x, y, labels: [...labels.values()], guides: visibleGuides }]
  })
}

const guideColors = ['#8cf4c8', '#ffd278', '#8ecbff', '#ff9fc8', '#d3ee82', '#c9b3ff', '#ffab89', '#82e8f2']

export function overlayColors(guides) {
  const colors = new Map()
  const used = new Set()
  for (const { fieldKey, color } of guides) {
    if (!colors.has(fieldKey)) colors.set(fieldKey, undefined)
    const accent = color?.slice(0, 7).toLowerCase()
    if (accent && !colors.get(fieldKey) && !used.has(accent)) {
      colors.set(fieldKey, accent)
      used.add(accent)
    }
  }
  let index = 0
  for (const [fieldKey, color] of colors) {
    if (color) continue
    while (used.has(guideColors[index])) index++
    const accent = guideColors[index] ?? `hsl(${(index * 137.508) % 360} 85% 76%)`
    colors.set(fieldKey, accent)
    index++
  }
  return colors
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

export async function overlayEvidence(steps, report, current, loadContext, signal) {
  const annotations = new Map(report.steps.map(({ id, paths }) => [id, paths]))
  const groups = new Map()
  if (current && annotations.has(current.id)) groups.set(overlaySite(current), [])
  for (const step of steps) {
    if (!annotations.has(step.id)) continue
    const site = overlaySite(step)
    if (!groups.has(site)) groups.set(site, [])
    groups.get(site).push(step)
  }
  const samples = [...groups.values()].filter((group) => group.length).slice(0, 32).map((group) =>
    [...new Set([group.find(({ id }) => id === current?.id), group.at(-1), group[0]])].filter(Boolean))
  const primary = samples.map(([step]) => step)
  const secondary = samples.flatMap(([, step]) => step ? [step] : []).slice(0, 32 - primary.length)
  return Promise.all([...primary, ...secondary].map(async (step) => {
    const paths = annotations.get(step.id)
    const rows = await loadContext(step, false, signal)
    const context = overlayContext(rows, step, 4).map((snapshot) => sampleSnapshot(snapshot, [], 750))
    return { ...sampleSnapshot(overlaySnapshot(step), paths, 5000), paths, context }
  }))
}

export function checkedOverlay(plan, evidence) {
  const pending = new Set(evidence.map(({ site }) => site))
  if (!Array.isArray(plan?.plans) || plan.plans.length !== pending.size) return null
  const bySite = Object.create(null)
  let codeLength = 0
  try {
    for (const { site, code, skipReason, accumulate = false } of plan.plans) {
      if (!pending.delete(site) || typeof code !== 'string' || typeof skipReason !== 'string') return null
      if (typeof accumulate !== 'boolean') return null
      const reason = skipReason.trim()
      if (!code.trim()) {
        if (!reason || accumulate) return null
        bySite[site] = { code: '', skipReason: reason }
        continue
      }
      codeLength += code.length
      if (reason || codeLength > 24000) return null
      const tree = parse('"use strict";\n' + code, { ecmaVersion: 2024, allowReturnOutsideFunction: true })
      let anchored = false
      simple(tree, { CallExpression({ callee }) { if (callee.type === 'Identifier' && callee.name === 'mark') anchored = true } })
      if (!anchored) return null
      bySite[site] = { code, skipReason: '', accumulate }
    }
    return { bySite }
  } catch {
    return null
  }
}
