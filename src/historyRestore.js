import { cycleIds, MAX_CYCLES, reportForSelection } from './trace.js'
import { MAX_DRAWING_COMMANDS, MAX_DRAWING_WINDOWS, MAX_DRAWING_BYTES } from './canvasTrace.js'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const REPLAY_LIMIT = MAX_CYCLES + 55
const hasAnnotation = (item) => typeof item?.note === 'string' && Array.isArray(item.paths)
  && item.paths.every((path) => typeof path === 'string')

function validCanvasCommand(command, index, commands) {
  if (!Array.isArray(command) || typeof command[0] !== 'string') return false
  if (command[0] === 'pixels') {
    const [, png] = command
    return index === 1 && commands[0][0] === 'size' && command.length === 2
      && typeof png === 'string' && png.length <= MAX_DRAWING_BYTES / 2
      && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(png)
  }
  if (command[0] !== 'size') return true
  const [, width, height] = command
  return command.length === 3 && [width, height].every((size) => Number.isInteger(size) && size >= 0 && size <= 8192)
    && width * height <= 16000000
}

export function hasDrawing(drawings, cursor) {
  return drawings.some(({ first, offset, commands }) => cursor >= first && cursor <= offset + commands.length)
}

export function replayForReport(debugSource, recorded, report) {
  const cycles = new Set(report.cycles)
  const range = recorded.filter(({ cycle }) => cycles.has(cycle))
  const matchedIds = new Set(report.steps.map(({ id }) => id))
  const matches = range.filter(({ id }) => matchedIds.has(id))
  const lastInCycle = new Map(range.map((step) => [step.cycle, step]))
  for (const step of matches) lastInCycle.set(step.cycle, step)
  const latestPerFunction = new Map(matches.map((step) => [step.functionId ?? step.line, step]))
  const selected = new Set([range.at(-1), ...lastInCycle.values(), ...latestPerFunction.values()])
  const limit = cycles.size + 55
  for (let index = matches.length - 1; index >= 0 && selected.size < limit; index--) {
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
    const { steps, commands } = record.replay
    const drawings = record.replay.drawings ?? (commands === undefined ? [] : [{ first: 0, offset: 0, commands }])
    if (!Array.isArray(drawings) || drawings.length > MAX_DRAWING_WINDOWS || drawings.some((entry) =>
      !Number.isSafeInteger(entry?.offset) || !Number.isSafeInteger(entry.first) || entry.first < Math.max(0, entry.offset)
      || !Array.isArray(entry.commands) || entry.commands.length > MAX_DRAWING_COMMANDS
      || !entry.commands.every(validCanvasCommand) || entry.first > entry.offset + entry.commands.length)) {
      throw new Error('저장된 캔버스 명령의 형식이 올바르지 않아요.')
    }
    if (!Array.isArray(steps) || !steps.length || steps.length > REPLAY_LIMIT || steps.some((step, index) =>
      !Number.isSafeInteger(step?.id) || step.id <= (steps[index - 1]?.id ?? 0)
      || !Number.isSafeInteger(step.cycle) || step.cycle < (steps[index - 1]?.cycle ?? 0)
      || !Number.isSafeInteger(step.line) || !isObject(step.state) || !isObject(step.variables)
      || (step.functionId !== undefined && !Number.isSafeInteger(step.functionId))
      || (step.endLine !== undefined && (!Number.isSafeInteger(step.endLine) || step.endLine < step.line))
      || (step.canvasSize !== undefined && (!Array.isArray(step.canvasSize) || step.canvasSize.length !== 2
        || !step.canvasSize.every((value) => Number.isFinite(value) && value > 0)))
      || (step.canvasCursor != null && (!Number.isSafeInteger(step.canvasCursor) || step.canvasCursor < 0
        || (drawings.length ? !hasDrawing(drawings, step.canvasCursor) : step.canvasCursor > MAX_DRAWING_COMMANDS)))
      || typeof step.label !== 'string'
    )) throw new Error('저장된 실행 스텝의 형식이 올바르지 않아요.')
    const ids = new Set(steps.map(({ id }) => id))
    const annotations = Array.isArray(output?.steps) ? output.steps.filter((step) => ids.has(step?.id)
      && hasAnnotation(step)) : []
    let report = null
    if (typeof output?.summary === 'string') {
      const cycleCount = Number.isInteger(output.cycleCount) && output.cycleCount >= 1 && output.cycleCount <= MAX_CYCLES
        ? output.cycleCount : 1
      const plan = { source: 'ai', summary: output.summary, concern: input?.concern, cycleCount, cycleReason: output.cycleReason }
      if (Array.isArray(output.functions)) {
        plan.functions = output.functions.filter((item) => Number.isInteger(item?.functionId) && hasAnnotation(item))
      } else if (Array.isArray(output.lines)) {
        plan.lines = output.lines.filter((item) => Number.isInteger(item?.line) && hasAnnotation(item))
      }
      report = plan.functions || plan.lines ? reportForSelection(plan, steps, source) : { ...plan, cycles: cycleIds(steps), steps: annotations }
    }
    replay = { steps, report, drawings }
  }
  return { source, debugSource, concern: typeof input?.concern === 'string' ? input.concern : '', replay, task: record.task }
}
