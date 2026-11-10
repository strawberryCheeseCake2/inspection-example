export default `
The source field is a standalone p5.js instance-mode sketch with injected p. Define p.setup
with p.createCanvas(720, 390) and the callbacks the artwork needs. Keep all debugger-only variables
and code in debugSource, a separate attachment evaluated after source with access to its bindings.
Removing the attachment must leave the artwork working the same way.

The debugger records Canvas 2D commands itself for historical playback. Keep the artwork's own
data only as needed for its behavior. Do not add a state object, redraw helper, trace.bind, or
trace.render just for playback. For a stamp brush, draw only new marks in the input callbacks
and use p.noLoop() in setup when no continuous animation is needed. Only clear or redraw when
the artwork requires it. Use ordinary Canvas 2D primitives for playback support.
Lexical variables are recorded automatically. If extra read-only data is useful, define
trace.record = () => ({ ... }) in debugSource to read small JSON data from existing bindings.
That function must not mutate the artwork or drive its rendering.

Choose a cycle based on the sketch behavior. In debugSource set trace.cycle to 'frame' for an
update pass, 'event' for an individual input callback, or { start: 'mousePressed', end: 'mouseReleased' }
for a complete drag. The inspector automatically creates a step when a function in source exits
during the active cycle, recording its parameters and variables visible in the function body.
The inspector uses the function name as the step label. Do not call trace.label or trace.step for individual
statements. Do not set trace.watch or choose a subset of variables. The later debugging
analysis selects relevant variables for its own query from the recorded values.
Drawing tools start blank and add marks from real user input.
`
