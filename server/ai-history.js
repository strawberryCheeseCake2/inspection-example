import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function createHistory(task, request) {
  return {
    id: randomUUID(),
    task,
    startedAt: new Date().toISOString(),
    status: 'pending',
    request,
  }
}

function historyPath(directory, { id, task, startedAt }) {
  const timestamp = startedAt.replaceAll(':', '-')
  return join(directory, `${timestamp}-${task}-${id}.json`)
}

export async function readAnalysisHistory(directory, ref) {
  const { id, startedAt } = ref ?? {}
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)
    || typeof startedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(startedAt)) return null
  try {
    const record = JSON.parse(await readFile(historyPath(directory, { id, startedAt, task: 'analyze' }), 'utf8'))
    return record.status === 'completed' ? record : null
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return null
  }
}

export async function saveHistory(directory, record, apiKey) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = historyPath(directory, record)
  const temporary = `${path}.${randomUUID()}.tmp`
  const json = JSON.stringify(record, (_, value) => (
    typeof value === 'string' && apiKey ? value.replaceAll(apiKey, '[REDACTED]') : value
  ), 2)
  await writeFile(temporary, json + '\n', { mode: 0o600 })
  await rename(temporary, path)
}
