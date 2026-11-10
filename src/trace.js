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

export function reportForLines(plan, steps) {
  const selected = new Map(plan.lines.map((item) => [item.line, item]))
  const matches = steps.flatMap((step) => {
    const selection = selected.get(step.line)
    if (!selection) return []
    const paths = selection.paths.filter((path) => variableAt(step, path) !== undefined)
    return [{ id: step.id, note: selection.note, paths }]
  })
  return { source: plan.source, summary: plan.summary, steps: matches }
}

export function localAnalysis(concern, source, steps) {
  const terms = concern.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const labels = [
    [/겹|합치|합쳐|overlap|merg/i, /overlap|merg/i],
    [/위치|드래그|position|drag/i, /mouse[xy]|stamp/i],
    [/물|침수|나무|water|flood|tree/i, /water|flood|tree/i],
  ].filter(([query]) => query.test(concern))
  const lines = source.split(/\r\n|[\r\n\u2028\u2029]/).flatMap((code, index) => {
    const matches = labels.some(([, match]) => match.test(code))
      || terms.some((term) => term.length > 2 && code.toLowerCase().includes(term))
    return matches ? [{ line: index + 1, note: '', paths: [] }] : []
  })
  return reportForLines({
    source: 'local',
    summary: '요청의 키워드로 코드 줄을 찾았습니다.',
    lines,
  }, steps)
}
