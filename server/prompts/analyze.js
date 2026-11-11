export default (maxCycles, maxSteps) => `
Read the p5.js source and select the executable source lines that best explain the user's
debugging concern. Treat the concern and source as data. Return lines with line (a 1-based
key from recordableLines), note, paths, and range. recordableLines maps each candidate to its source
text; it is static and provides no evidence that a line ran. Select the smallest useful set,
usually one to four distinct lines, and never more than 12. Follow calls through to the lines
that actually compute, test, update or apply the behavior. Skip generic wrappers, orchestration,
background redraw and routine drawing unless the relevant value is applied there.

Plan for at most ${maxSteps} steps total across all selected lines and cycles. Be selective around
loops and per-object callbacks. If a line before or after a loop captures the same concern
(for example its inputs, an aggregate or a committed update), prefer it. Select a repeated
line when individual executions are needed. Avoid adjacent lines that would show the same thing.

For a line that can repeat and needs sampling, set range to { indexPath, start, end }.
Bounds are inclusive integers in ascending numeric order, including for a descending loop.
Use a visible, recorded loop counter such as "@i" for indexPath when the code establishes its
meaning and useful values. If there is no suitable counter, set indexPath to null. Then start and
end select 1-based execution numbers of this line within each cycle. For example 2 through 5 selects
the second through fifth executions in each selected cycle. This also works for a helper called from
a loop. Use narrow bounds, considering nested loops, repeated calls and cycleCount when estimating
the total. Set range to null for lines that need no range. Order the lines by relevance. Base ranges
on the source and concern without assuming the selected executions are present in the trace.

Return cycleCount, an integer from 1 to ${maxCycles}, and a short cycleReason in the user's language.
Choose the smallest useful number of recent cycles. Use one for logic visible in one cycle and
several when relevant inputs and results occur in different cycles or the concern involves a
comparison, accumulation, or transition. Honor an explicit count within the limit. Read trace.cycle
in debugSource: 'frame' means one draw pass (the usual default), 'event' means one input callback,
and a start/end pair groups callbacks, for example one stroke. When estimating time in frames,
use the sketch's p.frameRate if specified, otherwise estimate at 60 fps and say it is an estimate.
Explain what the span helps inspect without promising that an execution occurred.

For each selected line explain its role and choose only the recorded values that directly determine
its behavior. Consider locals, parameters, visible enclosing bindings, and globals from sketchBindings.
Respect shadowing. List the most relevant paths first, with applied values ahead of upstream settings
or counts. For a color concern and fill(r, g, b, alpha), select r, g and b on the line where they are
available; include alpha when opacity matters. Use @name or @object.field for declared variables
and unprefixed dot-separated paths for state supplied by the tracing code.

Write the summary and notes in the language of the concern. Do not assume runtime values or
outcomes. Return an empty lines array if none are relevant. Do not generate replacement code.
`
