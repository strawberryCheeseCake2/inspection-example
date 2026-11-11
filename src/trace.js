import { instrument } from './instrument.js'
import { sourceVariablePaths } from './analysisPaths.js'

export const MAX_CYCLES = 180
export const MAX_DEBUG_STEPS = 30

export const sourceLines = (source) => source.split(/\r\n|[\r\n\u2028\u2029]/)

export function cycleIds(steps) {
  return [...new Set(steps.map(({ cycle }) => cycle))]
}

export function valueAt(state, path) {
  return path.split('.').reduce(
    (target, key) => target && typeof target === 'object' && Object.hasOwn(target, key) ? target[key] : undefined,
    state,
  )
}

export function variableAt(step, path) {
  if (path.startsWith('@')) {
    const [name, ...keys] = path.slice(1).split('.')
    if (!Object.hasOwn(step.variables ?? {}, name)) return undefined
    const value = step.variables[name]
    if (!keys.length) return value
    try { return valueAt(JSON.parse(value), keys.join('.')) } catch { return undefined }
  }
  if (Object.hasOwn(step.state, path)) return step.state[path]
  return valueAt(step.state, path)
}

export function validIterationRange(range) {
  if (range === null) return true
  const { indexPath, start, end } = range ?? {}
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end
    && (indexPath === null ? start >= 1 : typeof indexPath === 'string' && indexPath.trim().length > 0)
}

export function matchesRange(step, range, ordinal) {
  if (!range) return true
  const { indexPath, start, end } = range
  let value = indexPath === null ? step.occurrence ?? ordinal : variableAt(step, indexPath)
  // A whole lexical binding uses the recorder's display string, while nested values are already decoded.
  if (indexPath?.startsWith('@') && !indexPath.includes('.') && typeof value === 'string') {
    value = Number(value)
  }
  return Number.isFinite(value) && value >= start && value <= end
}

// Ranks are newest first. Give each selected line a turn before sampling busy lines.
export function sampleRanks(counts) {
  const slots = counts.map(() => 0)
  let remaining = Math.min(MAX_DEBUG_STEPS, counts.reduce((total, count) => total + count, 0))
  for (let round = 0; remaining > 0; round++) {
    for (const [index, count] of counts.entries()) {
      if (count <= round) continue
      slots[index]++
      if (--remaining === 0) break
    }
  }
  return counts.map((count, index) => {
    const size = slots[index]
    if (size === 1) return [0]
    return Array.from({ length: size }, (_, offset) =>
      count - 1 - Math.round((size - 1 - offset) * (count - 1) / (size - 1)))
  })
}

export function reportForSelection(plan, steps, source) {
  const cycleCount = plan.cycleCount ?? 1
  const cycles = cycleIds(steps).slice(-cycleCount)
  const included = new Set(cycles)
  const key = plan.functions ? 'functionId' : 'line'
  const selected = new Map((plan.functions ?? plan.lines).map((item) => [item[key], item]))
  const groups = new Map([...selected.keys()].map((site) => [site, []]))
  const ordinals = new Map()
  let currentCycle
  for (const step of steps) {
    if (key === 'line' && step.functionId !== undefined) continue
    const site = step[key]
    const selection = selected.get(site)
    if (!selection || !included.has(step.cycle)) continue
    if (currentCycle !== step.cycle) {
      currentCycle = step.cycle
      ordinals.clear()
    }
    const ordinal = (ordinals.get(site) ?? 0) + 1
    ordinals.set(site, ordinal)
    if (!matchesRange(step, selection.range, ordinal)) continue
    groups.get(site).push(step)
  }
  const rows = [...groups.values()]
  const matches = sampleRanks(rows.map((group) => group.length))
    .flatMap((ranks, index) => ranks.map((rank) => rows[index].at(-1 - rank)))
  return annotateReport(plan, matches, source, cycles)
}

export function annotateReport(plan, matches, source, cycles) {
  const key = plan.functions ? 'functionId' : 'line'
  const selected = new Map((plan.functions ?? plan.lines).map((item) => [item[key], item]))
  const sourcePaths = sourceVariablePaths(source, plan)
  const annotations = [...matches].sort((a, b) => a.id - b.id).map((step) => {
    const selection = selected.get(step[key])
    const direct = sourcePaths.get(step.functionId)
    const available = (path) => {
      const value = variableAt(step, path)
      return value !== undefined && value !== '[Unavailable]'
    }
    const inputs = (direct?.paths ?? []).filter(available)
    // Some saved plans omit @ on a declared variable. An actual application-state path takes precedence.
    const chosen = [...new Set(selection.paths.flatMap((path) => {
      if (available(path)) return [path]
      return !path.startsWith('@') && available('@' + path) ? ['@' + path] : []
    }))].slice(0, 8)
    const chosenPaths = new Set(chosen)
    const inferred = inputs.filter((path) => !chosenPaths.has(path)).slice(0, 8 - chosen.length)
    const paths = direct?.replace && inputs.length ? inputs.slice(0, 8) : [...inferred, ...chosen]
    return { id: step.id, note: selection.note, paths }
  })
  return { source: plan.source, summary: plan.summary, concern: plan.concern,
    cycleCount: plan.cycleCount ?? 1, cycleReason: plan.cycleReason, cycles, steps: annotations }
}

export function localPlan(concern, source) {
  const terms = concern.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const labels = [
    [/겹|합치|합쳐|overlap|merg/i, /overlap|merg/i],
    [/위치|드래그|position|drag/i, /mouse[xy]|stamp/i],
    [/물|침수|나무|water|flood|tree/i, /water|flood|tree/i],
  ].filter(([query]) => query.test(concern))
  const codeLines = sourceLines(source)
  const lines = instrument(source).lines.flatMap((line) => {
    const code = codeLines[line - 1]
    const matches = labels.some(([, match]) => match.test(code))
      || terms.some((term) => term.length > 2 && code.toLowerCase().includes(term))
    return matches ? [{ line, note: '', paths: [] }] : []
  })
  return {
    source: 'local',
    concern,
    summary: '요청의 키워드와 관련된 줄을 찾았습니다.',
    lines,
  }
}
