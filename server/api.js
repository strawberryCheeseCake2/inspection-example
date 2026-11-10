import { resolve } from 'node:path'
import { createHistory, readAnalysisHistory, saveHistory } from './ai-history.js'
import sketchContract from './prompts/generate.js'
import editInstructions from './prompts/edit.js'
import analysisInstructions from './prompts/analyze.js'
import overlayInstructions from './prompts/overlay.js'
import { instrument, isDebugCandidate } from '../src/instrument.js'
import { readHistory } from '../src/historyRestore.js'
import { MAX_CYCLES } from '../src/trace.js'
import { checkedOverlay } from '../src/overlay.js'

const string = { type: 'string' }
const object = (properties) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
})

const generation = object({ source: string, debugSource: string })
const revision = object({
  edits: { type: 'array', items: object({ before: string, after: string }) },
  debugSource: string,
})
const analysis = object({
  summary: string,
  cycleCount: { type: 'integer', minimum: 1, maximum: MAX_CYCLES },
  cycleReason: string,
  functions: {
    type: 'array',
    items: object({
      functionId: { type: 'integer' },
      note: string,
      paths: { type: 'array', items: string },
      focusLines: { type: 'array', items: { type: 'integer' } },
    }),
  },
})

const overlay = object({
  plans: { type: 'array', items: object({ site: { type: 'integer' }, code: string, skipReason: string }) },
})

const tasks = {
  generate: { schema: generation, instructions: sketchContract, maxTokens: 8000 },
  edit: { schema: revision, instructions: editInstructions, maxTokens: 8000 },
  analyze: { schema: analysis, instructions: analysisInstructions(MAX_CYCLES), maxTokens: 4000 },
  overlay: { schema: overlay, instructions: overlayInstructions, maxTokens: 5500 },
}

const validDebugSource = (value) => typeof value === 'string' && value.length <= 12000

function applyEdits(source, edits) {
  let end = 0
  const chunks = []
  for (const { before, after } of edits) {
    const start = source.indexOf(before)
    if (!before || start < end || source.indexOf(before, start + 1) !== -1) return null
    chunks.push(source.slice(end, start), after)
    end = start + before.length
  }
  chunks.push(source.slice(end))
  return chunks.join('')
}

function reply(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

async function readBody(req, limit) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) return null
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

function modelRequest(env, task, input) {
  const { schema, instructions, maxTokens } = tasks[task]
  return {
    model: env.OPENAI_MODEL || 'gpt-6.1-sol',
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: maxTokens,
    instructions,
    input,
    text: {
      format: { type: 'json_schema', strict: true, name: task, schema },
    },
  }
}

async function askModel(env, history, signal) {
  const { request } = history
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    body: JSON.stringify({ ...request, input: JSON.stringify(request.input) }),
  })
  const provider = history.provider = {
    status: response.status,
    requestId: response.headers.get('x-request-id'),
  }
  const raw = await response.text()
  try {
    provider.body = JSON.parse(raw)
  } catch {
    provider.body = raw
  }
  if (!response.ok) throw new Error(`OpenAI API 요청에 실패했습니다 (HTTP ${response.status}).`)
  const result = provider.body
  const output = result?.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')
  if (result?.status !== 'completed' || !output) throw new Error('모델 응답이 완료되지 않았습니다. 다시 시도해 주세요.')
  return JSON.parse(output.text)
}

export function inspectorApi(env, historyDirectory = resolve('ai-history')) {
  const enabled = Boolean(env.OPENAI_API_KEY?.trim())
  async function middleware(req, res, next) {
    const task = req.url?.split('?')[0]
    if (!['/api/status', '/api/generate', '/api/edit', '/api/analyze', '/api/analyze/replay', '/api/overlay'].includes(task)) return next()
    const method = task === '/api/status' ? 'GET' : 'POST'
    if (req.method !== method) return reply(res, 405, { error: '지원하지 않는 요청입니다.' })
    if (task === '/api/status') return reply(res, 200, { enabled })
    if (!req.headers?.['content-type']?.startsWith('application/json')) {
      return reply(res, 415, { error: 'JSON 요청이 필요합니다.' })
    }
    if (!enabled) return reply(res, 503, { error: '.env에 OPENAI_API_KEY를 입력하고 서버를 다시 시작하세요.' })

    const controller = new AbortController()
    let history
    let response
    let failure
    function respond(status, body) {
      response = { status, body }
    }
    async function requestModel(operation, input) {
      history = createHistory(operation, modelRequest(env, operation, input))
      await saveHistory(historyDirectory, history, env.OPENAI_API_KEY)
      controller.signal.throwIfAborted()
      return askModel(env, history, controller.signal)
    }
    function disconnect() {
      if (!res.writableEnded) controller.abort()
    }
    res.once('close', disconnect)
    try {
      const bodyLimit = task === '/api/analyze/replay' ? 32 * 1024 * 1024
        : task === '/api/overlay' ? 1024 * 1024 : 200000
      const body = await readBody(req, bodyLimit)
      if (controller.signal.aborted) return
      if (task === '/api/analyze/replay') {
        const record = await readAnalysisHistory(historyDirectory, body?.historyRef)
        if (!record) return respond(404, { error: '재생 상태를 저장할 분석 기록이 없어요.' })
        record.replay = body?.replay
        try {
          if (!readHistory(record).replay) throw new Error('Missing replay')
        } catch {
          return respond(400, { error: '복구용 실행 기록을 확인해 주세요.' })
        }
        controller.signal.throwIfAborted()
        await saveHistory(historyDirectory, record, env.OPENAI_API_KEY)
        return respond(200, { saved: true })
      }
      if (!body || typeof body.concern !== 'string' || !body.concern.trim() || body.concern.length > 2000) {
        return respond(400, { error: '요청을 1–2,000자로 입력하세요.' })
      }
      if (task === '/api/generate') {
        const { source, debugSource } = await requestModel('generate', { concern: body.concern })
        if (typeof source !== 'string' || !source.trim() || source.length > 30000 || !validDebugSource(debugSource)) {
          return respond(502, { error: '실행할 스케치 코드를 받지 못했습니다.' })
        }
        return respond(200, { source, debugSource })
      }

      const { source, debugSource = '' } = body
      if (task === '/api/edit') {
        if (typeof source !== 'string' || !source.trim() || source.length > 30000 || !validDebugSource(debugSource)) {
          return respond(400, { error: '수정할 코드를 에디터에 입력해 주세요.' })
        }
        const result = await requestModel('edit', { concern: body.concern, source, debugSource })
        const { edits } = result
        const revised = applyEdits(source, edits)
        if (!revised?.trim() || revised.length > 30000 || !validDebugSource(result.debugSource)) {
          return respond(502, { error: '수정 내용을 현재 코드에 적용할 수 없습니다. 다시 시도해 주세요.' })
        }
        return respond(200, { source: revised, debugSource: result.debugSource })
      }

      if (typeof source !== 'string' || !source.trim() || source.length > 30000 || !validDebugSource(debugSource)) {
        return respond(400, { error: '실행 코드를 확인해 주세요.' })
      }
      if (task === '/api/overlay') {
        const { evidence } = body
        if (!Array.isArray(evidence) || !evidence.length || evidence.length > 32 || evidence.some((row) =>
          !Number.isSafeInteger(row?.id) || !Number.isSafeInteger(row.site)
          || ![row.variables, row.state].every((value) => value && typeof value === 'object' && !Array.isArray(value)))) {
          return respond(400, { error: '오버레이에 사용할 실행 기록을 확인해 주세요.' })
        }
        const plan = await requestModel('overlay', { concern: body.concern, source, debugSource, evidence })
        const result = checkedOverlay(plan, evidence)
        if (!result) return respond(502, { error: '일부 함수의 오버레이 응답이 빠졌거나 형식이 올바르지 않아요. 다시 생성해 주세요.' })
        return respond(200, result)
      }
      const { functions: instrumentedFunctions, sketchBindings } = instrument(source)
      const recordableFunctions = instrumentedFunctions.filter(isDebugCandidate)
      const sites = new Set(recordableFunctions.map(({ functionId }) => functionId))
      const plan = await requestModel('analyze', { concern: body.concern, source, debugSource, recordableFunctions, sketchBindings })
      if (!Number.isInteger(plan.cycleCount) || plan.cycleCount < 1 || plan.cycleCount > MAX_CYCLES
        || typeof plan.cycleReason !== 'string' || !plan.cycleReason.trim()) {
        return respond(502, { error: 'AI 응답에서 볼 사이클 수를 확인할 수 없어요.' })
      }
      const functions = [...new Map(plan.functions.filter(({ functionId }) => sites.has(functionId))
        .map((item) => [item.functionId, item])).values()].slice(0, 12)
      const historyRef = { id: history.id, startedAt: history.startedAt }
      return respond(200, { summary: plan.summary, cycleCount: plan.cycleCount, cycleReason: plan.cycleReason,
        functions, source: 'ai', historyRef })
    } catch (error) {
      failure = { name: error.name, message: error.message }
      if (controller.signal.aborted) return
      const message = error.message.startsWith('OpenAI API') || error.message.startsWith('모델 응답')
        ? error.message : 'AI 요청을 완료할 수 없습니다. 서버 연결을 확인해 주세요.'
      return respond(502, { error: message })
    } finally {
      if (history) {
        const status = controller.signal.aborted ? 'cancelled'
          : response?.status === 200 ? 'completed' : 'failed'
        Object.assign(history, { status, finishedAt: new Date().toISOString(), response, error: failure })
        try {
          await saveHistory(historyDirectory, history, env.OPENAI_API_KEY)
        } catch (error) {
          console.error('AI 기록 저장 실패', history.id, error.message)
        }
      }
      res.off('close', disconnect)
      if (response && !controller.signal.aborted) reply(res, response.status, response.body)
    }
  }

  const mount = (server) => { server.middlewares.use(middleware) }
  return { name: 'execution-inspector-api', configureServer: mount, configurePreviewServer: mount }
}
