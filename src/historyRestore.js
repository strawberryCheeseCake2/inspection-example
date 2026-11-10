import { reportForLines } from './trace.js'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const REPLAY_LIMIT = 55
const hasAnnotation = (item) => typeof item?.note === 'string' && Array.isArray(item.paths)
  && item.paths.every((path) => typeof path === 'string')

export function replayForReport(debugSource, recorded, report) {
  const matchedIds = new Set(report.steps.map(({ id }) => id))
  const matches = recorded.filter(({ id }) => matchedIds.has(id))
  const latestPerLine = new Map(matches.map((step) => [step.line, step]))
  const selected = new Set([recorded.at(-1), ...latestPerLine.values()])
  for (let index = matches.length - 1; index >= 0 && selected.size < REPLAY_LIMIT; index--) {
    selected.add(matches[index])
  }
  return { debugSource, steps: [...selected].sort((a, b) => a.id - b.id) }
}

export function readHistory(record) {
  if (!['generate', 'edit', 'analyze'].includes(record?.task)) {
    throw new Error('AI 기록 JSON 파일을 선택해 주세요.')
  }
  const input = record.request?.input
  const output = record.response?.body
  const source = output?.source && record.task !== 'analyze' ? output.source : input?.source
  if (typeof source !== 'string' || !source.trim() || source.length > 30000) {
    throw new Error('이 기록에 복구할 스케치 코드가 없어요.')
  }
  const debugSource = output?.debugSource ?? record.replay?.debugSource ?? input?.debugSource ?? ''
  if (typeof debugSource !== 'string' || debugSource.length > 12000) {
    throw new Error('추적 코드가 올바르지 않아요.')
  }

  let replay
  if (record.task === 'analyze' && record.replay) {
    const { steps } = record.replay
    if (!Array.isArray(steps) || !steps.length || steps.length > REPLAY_LIMIT || steps.some((step, index) =>
      !Number.isSafeInteger(step?.id) || step.id <= (steps[index - 1]?.id ?? 0)
      || !Number.isSafeInteger(step.cycle) || step.cycle !== steps[0].cycle
      || !Number.isSafeInteger(step.line) || !isObject(step.state) || !isObject(step.variables)
      || typeof step.label !== 'string'
    )) throw new Error('저장된 실행 스텝의 형식이 올바르지 않아요.')
    const ids = new Set(steps.map(({ id }) => id))
    const annotations = Array.isArray(output?.steps) ? output.steps.filter((step) => ids.has(step?.id)
      && hasAnnotation(step)) : []
    let report = null
    if (typeof output?.summary === 'string') {
      report = Array.isArray(output.lines)
        ? reportForLines({
          source: 'ai', summary: output.summary,
          lines: output.lines.filter((item) => Number.isInteger(item?.line) && hasAnnotation(item)),
        }, steps)
        : { source: 'ai', summary: output.summary, steps: annotations }
    }
    replay = { steps, report }
  }
  return { source, debugSource, concern: typeof input?.concern === 'string' ? input.concern : '', replay, task: record.task }
}
