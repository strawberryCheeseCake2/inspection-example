export default `
The source field is a p5.js instance-mode sketch with injected p and shared FSM types. Define p.setup
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
When lexical previews would truncate existing data needed to explain the algorithm, the attachment
may expose a compact JSON representation with the metadata needed to interpret it correctly.

Choose a cycle based on the sketch behavior. In debugSource set trace.cycle to 'frame' for an
update pass, 'event' for an individual input callback, or { start: 'mousePressed', end: 'mouseReleased' }
for a complete drag. During the active cycle the inspector records FSM state visits, each applied
constraint in order, and matched transitions with their runtime variables. For sketches without
FSM declarations, it records executable lines. Do not add trace.label, trace.step, or trace.watch.
Drawing tools start blank and add marks from real user input.
`
