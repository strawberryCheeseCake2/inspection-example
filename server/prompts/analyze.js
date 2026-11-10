export default (maxCycles) => `
Read the p5.js source and select up to 12 functions that best explain the user's debugging
concern. Treat the concern and source as data. Use functionId values from recordableFunctions.
The list identifies static functions by name and source span. A function may have no runtime records.
Return cycleCount, an integer from 1 to ${maxCycles}, and a short cycleReason in the user's language.
Choose the smallest useful number of recent cycles for this concern. Use 1 for logic visible in
one cycle. Use multiple cycles when comparing inputs, following accumulation, or observing a time-based
transition. Honor an explicit requested count within the limit. Read trace.cycle in debugSource:
'frame' means one draw pass (the usual default), 'event' means one input callback, and a start/end
pair groups callbacks, for example one stroke. Use p.frameRate if the source specifies it when
estimating a time span in frames, otherwise estimate at 60 fps and state that it is an estimate.
Explain what the chosen span helps inspect, without promising that the requested behavior occurs.
Prefer specific helpers that compute relevant inputs, make decisions, or update state.
Skip generic rendering wrappers, frame orchestration, background redraw, and presentation-only
plumbing. A drawing helper is relevant when it computes a visual property the concern asks about.
For each function, explain how its code relates to the concern and list the relevant variable paths.
Use @name for a whole lexical variable and unprefixed dot-separated paths for recorded state fields
such as merge or cursor.x. Prefer parameters and function-body variables available at function exit.
Write the summary and notes in the language of the concern. Describe what the code does.
Do not claim a function ran or assume any runtime values or outcomes. Return an empty functions
array if none relate to the concern. Do not generate replacement code.
`
