import { annotateReport, cycleIds, matchesRange, MAX_DEBUG_STEPS, sampleRanks, selectFsmSteps, traceSite } from './trace.js'

export async function queryTrace(archive, recent, plan, source, signal) {
  const latest = recent.at(-1)
  const count = plan.cycleCount ?? 1
  const selections = plan.states ?? plan.lines

  async function cyclesThrough(through) {
    const liveCycles = cycleIds(recent.filter((step) => step.cycle <= through)).slice(-count)
    if (liveCycles.length === count) return liveCycles
    const stored = await archive.cycles(Math.min(through, (liveCycles[0] ?? through + 1) - 1),
      count - liveCycles.length, signal)
    return stored.reverse().concat(liveCycles)
  }

  async function scan({ line, site = line, range }, from, through, visit) {
    if (from > through) return
    signal.throwIfAborted()
    const matches = (step) => (plan.states ? step.fsm?.kind === 'state' : !step.fsm) && matchesRange(step, range)
    for (let index = recent.length - 1; index >= 0; index--) {
      const step = recent[index]
      if (step.cycle < from) break
      if (step.cycle <= through && traceSite(step) === site && matches(step) && visit(step) === false) return
    }
    await archive.scanSite(site, from, through, recent[0].id - 1,
      (step) => matches(step) ? visit(step) : undefined, signal)
  }

  async function collectFsm(cycles) {
    const matches = []
    if (!selections.length) return matches
    const hot = Map.groupBy(recent, (step) => step.cycle)
    for (const cycle of [...cycles].reverse()) {
      signal.throwIfAborted()
      const stored = []
      await archive.scanCycle(cycle, recent[0].id - 1, (step) => { stored.push(step) }, signal)
      const rows = stored.reverse().concat(hot.get(cycle) ?? [])
      matches.push(...selectFsmSteps(plan, rows, MAX_DEBUG_STEPS - matches.length, !matches.length))
      if (matches.length >= MAX_DEBUG_STEPS) break
    }
    return matches
  }

  async function collect(cycles) {
    if (plan.states) return collectFsm(cycles)
    const from = cycles[0]
    const through = cycles.at(-1)
    const groups = await Promise.all(plan.lines.map(async (line) => {
      const sample = []
      let count = 0
      await scan(line, from, through, (step) => {
        if (++count <= MAX_DEBUG_STEPS) sample.push(step)
      })
      return { count, sample }
    }))
    const ranks = sampleRanks(groups.map((group) => group.count))
    const matches = await Promise.all(groups.map(async ({ sample }, index) => {
      const wanted = ranks[index]
      const selected = wanted.filter((rank) => rank < sample.length).map((rank) => sample[rank])
      let position = selected.length
      if (position < wanted.length) {
        let rank = 0
        await scan(plan.lines[index], from, through, (step) => {
          if (rank++ === wanted[position]) {
            selected.push(step)
            position++
          }
          if (position === wanted.length) return false
        })
      }
      return selected
    }))
    return matches.flat()
  }

  let cycles = await cyclesThrough(latest.cycle)
  let matches = await collect(cycles)
  if (!matches.length && cycles[0] > 0 && selections.length) {
    // Only fall back when the requested recent span contains no selected execution.
    const earlier = await Promise.all(selections.map(async (line) => {
      let cycle = -1
      await scan(line, 0, cycles[0] - 1, (step) => {
        cycle = step.cycle
        return false
      })
      return cycle
    }))
    const through = Math.max(...earlier)
    if (through >= 0) {
      cycles = await cyclesThrough(through)
      matches = await collect(cycles)
    }
  }

  const tails = await Promise.all(cycles.map(async (cycle) => {
    const live = recent.findLast((step) => step.cycle === cycle)
    if (live) return live
    let stored
    await archive.scanCycle(cycle, latest.id, (step) => {
      stored = step
      return false
    }, signal)
    return stored
  }))
  const recorded = [...new Map([...matches, ...tails.filter(Boolean)].map((step) => [step.id, step])).values()]
    .sort((a, b) => a.id - b.id)
  const report = annotateReport(plan, matches, source, cycles)
  return { report, recorded, historical: !cycles.includes(latest.cycle) }
}
