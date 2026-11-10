export default `
The source field contains ordinary p5.js instance-mode code with injected p. It defines p.setup
with p.createCanvas(720, 390), p.draw, and any event callbacks it needs. It runs by itself inside
a p5 instance. Keep all trace calls and debugger wiring in debugSource, a separate JavaScript
attachment evaluated after source in a nested scope with access to its bindings and injected trace.

Use a top-level let state with a small JSON object initialized by p.setup for replayable artwork.
In debugSource connect it with trace.bind(() => state, (value) => { state = value }).
If p.draw updates state, keep the drawing in a separate pure helper that reads state afresh.
Call that helper from p.draw and set trace.render to the helper in debugSource for paused replay.
If p.draw only paints from state, the inspector can reuse it directly.

Choose a cycle based on the sketch behavior. In debugSource set trace.cycle to 'frame' for an
update pass, 'event' for an individual input callback, or { start: 'mousePressed', end: 'mouseReleased' }
for a complete drag. For a semantic checkpoint, call trace.label('exact statement', 'short event label')
in debugSource. The statement or condition must match a unique source fragment verbatim and
should mark a meaningful outcome or decision in the sketch. Register only a few labels.
The inspector automatically records all in-scope declared variables and parameters at each
recorded point. Do not set trace.watch or choose a subset of variables. The later debugging
analysis selects relevant variables for its own query from the recorded values.
Optionally set trace.manipulate = (x, y, phase) => {...} for paused pointer editing. phase is
mousePressed, mouseDragged, or mouseReleased. Drawing tools start blank and add marks from real user input.
`
