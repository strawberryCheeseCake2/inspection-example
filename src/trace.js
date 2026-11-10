import { instrument, isDebugCandidate } from './instrument.js'

export const MAX_CYCLES = 180

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
    const name = path.slice(1)
    return Object.hasOwn(step.variables ?? {}, name) ? step.variables[name] : undefined
  }
  if (Object.hasOwn(step.state, path)) return step.state[path]
  return valueAt(step.state, path)
}

export function reportForSelection(plan, steps) {
  const cycleCount = plan.cycleCount ?? 1
  const cycles = cycleIds(steps).slice(-cycleCount)
  const included = new Set(cycles)
  const key = plan.functions ? 'functionId' : 'line'
  const selected = new Map((plan.functions ?? plan.lines).map((item) => [item[key], item]))
  const matches = steps.flatMap((step) => {
    const selection = selected.get(step[key])
    if (!selection || !included.has(step.cycle)) return []
    const paths = selection.paths.filter((path) => variableAt(step, path) !== undefined)
    return [{ id: step.id, note: selection.note, paths }]
  })
  return { source: plan.source, summary: plan.summary, cycleCount, cycleReason: plan.cycleReason, cycles, steps: matches }
}

export function localAnalysis(concern, source, steps) {
  const terms = concern.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const labels = [
    [/겹|합치|합쳐|overlap|merg/i, /overlap|merg/i],
    [/위치|드래그|position|drag/i, /mouse[xy]|stamp/i],
    [/물|침수|나무|water|flood|tree/i, /water|flood|tree/i],
  ].filter(([query]) => query.test(concern))
  const codeLines = source.split(/\r\n|[\r\n\u2028\u2029]/)
  const functions = instrument(source).functions.filter(isDebugCandidate).flatMap(({ functionId, name, line, endLine }) => {
    const code = [name, ...codeLines.slice(line - 1, endLine)].join('\n')
    const matches = labels.some(([, match]) => match.test(code))
      || terms.some((term) => term.length > 2 && code.toLowerCase().includes(term))
    return matches ? [{ functionId, note: '', paths: [] }] : []
  })
  return reportForSelection({
    source: 'local',
    summary: '요청의 키워드와 관련된 함수를 찾았습니다.',
    functions,
  }, steps)
}
