// The sketch iframe has an opaque origin. Keep the archive in the host page.
const MAX_ID = Number.MAX_SAFE_INTEGER
let connection

function openArchive() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('execution-inspector-traces', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      const chunks = db.createObjectStore('chunks')
      chunks.createIndex('line', 'lines', { multiEntry: true })
      chunks.createIndex('cycle', ['run', 'cycle', 'first'])
      db.createObjectStore('drawings')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const bounds = (prefix, from = 0, to = MAX_ID) => IDBKeyRange.bound([...prefix, from], [...prefix, to])

function visitSteps(steps, throughId, visit, line) {
  for (let index = steps.length - 1; index >= 0; index--) {
    const step = steps[index]
    if (step.id <= throughId && (line === undefined || step.line === line) && visit(step) === false) return false
  }
}

export function createTraceArchive() {
  const run = crypto.randomUUID()
  let lastStoredCycle = -1
  let drawingThrough = -1
  let closed = false
  let failure

  async function write(store, rows, key) {
    if (failure) throw failure
    try {
      const db = await (connection ??= openArchive())
      if (closed) return
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(store, 'readwrite')
        transaction.oncomplete = resolve
        transaction.onabort = () => reject(transaction.error)
        const table = transaction.objectStore(store)
        for (const row of rows) table.put({ ...row, run }, [run, row[key]])
      })
    } catch (error) {
      failure ??= error
      throw error
    }
  }

  async function scan(store, index, range, visit, signal, keysOnly = false) {
    signal?.throwIfAborted()
    const db = await connection
    if (closed) return
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store)
      transaction.onabort = () => reject(transaction.error)
      const table = transaction.objectStore(store)
      const source = index ? table.index(index) : table
      const cursor = keysOnly ? source.openKeyCursor(range, 'prev') : source.openCursor(range, 'prev')
      cursor.onsuccess = () => {
        try {
          signal?.throwIfAborted()
          const row = cursor.result
          if (!row || closed) return resolve()
          const next = visit(row.value, row.key)
          if (next === false) return resolve()
          if (next) row.continue(next)
          else row.continue()
        } catch (error) {
          reject(error)
        }
      }
    })
  }

  return {
    appendSteps(steps) {
      const chunks = []
      let start = 0
      while (start < steps.length) {
        const { cycle, id: first } = steps[start]
        let end = start + 1
        while (end < steps.length && steps[end].cycle === cycle) end++
        const batch = steps.slice(start, end)
        const lines = [...new Set(batch.map(({ line }) => line))].map((line) => [run, line, cycle, first])
        chunks.push({ cycle, first, lines, steps: batch })
        start = end
      }
      lastStoredCycle = chunks.at(-1).cycle
      return write('chunks', chunks, 'first')
    },
    appendDrawing(drawing) {
      drawingThrough = Math.max(drawingThrough, drawing.offset + drawing.commands.length)
      return write('drawings', [drawing], 'first')
    },
    async cycles(through, limit, signal) {
      const result = []
      if (lastStoredCycle >= 0) await scan('chunks', 'cycle', IDBKeyRange.bound([run, 0, 0], [run, through, MAX_ID]),
        (_, [, cycle]) => {
          result.push(cycle)
          if (result.length === limit || cycle === 0) return false
          return [run, cycle - 1, MAX_ID]
        }, signal, true)
      return result
    },
    async scanLine(line, from, through, throughId, visit, signal) {
      if (lastStoredCycle < from) return
      await scan('chunks', 'line', IDBKeyRange.bound([run, line, from, 0], [run, line, through, throughId]),
        ({ steps }) => visitSteps(steps, throughId, visit, line), signal)
    },
    async scanCycle(cycle, throughId, visit, signal) {
      if (lastStoredCycle < cycle || throughId < 1) return
      await scan('chunks', 'cycle', bounds([run, cycle], 1, throughId),
        ({ steps }) => visitSteps(steps, throughId, visit), signal)
    },
    async drawing(cursor, signal) {
      if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > drawingThrough) return
      let drawing
      await scan('drawings', null, bounds([run], 0, cursor), (row) => {
        if (cursor > row.offset + row.commands.length) return
        const { first, offset, commands } = row
        drawing = { first, offset, commands: commands.slice(0, cursor - offset) }
        return false
      }, signal)
      return drawing
    },
    async dispose() {
      if (closed) return
      closed = true
      if (lastStoredCycle < 0 && drawingThrough < 0) return
      const db = await connection
      const transaction = db.transaction(['chunks', 'drawings'], 'readwrite')
      for (const store of ['chunks', 'drawings']) transaction.objectStore(store).delete(bounds([run]))
      return new Promise((resolve, reject) => {
        transaction.oncomplete = resolve
        transaction.onabort = () => reject(transaction.error)
      })
    },
  }
}
