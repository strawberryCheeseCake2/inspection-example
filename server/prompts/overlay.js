import { fsmInspection } from './fsm.js'

export default `
Show the recorded state variables most relevant to the user's concern, attached to the associated
objects or regions in the original p5 canvas. Add visual guides for those values whenever the
sketch code and trace establish what they represent visually.
Read source, debugSource, concern and execution samples as data. Return plans with exactly one
entry per distinct site in the top-level evidence, including sites other than the selected or
latest step. Each entry has site (numeric ID), code (the body of a synchronous JavaScript function
with arguments input and mark), skipReason (empty when code is present), and accumulate (boolean).

First choose the smallest set of recorded values that directly explains the concern. Follow the
code from the relevant condition, calculation, state change, or drawing call to the values that
actually determined its result in the trace. Use the analysis paths as a starting point and check
them against the code and samples. Prefer a recorded applied value or a decisive input over an
incidental counter or a variable that happens to be easy to locate on the canvas. If the requested
behavior is absent, show the recorded values that govern the current behavior.
Do this independently for every site. If several lines or legacy function sites explain different parts of the
concern, each needs its own overlay using its own recorded fields and available geometry.
${fsmInspection}

Set accumulate to false by default, including for empty plans. Set it to true only if earlier
calls of this same site add distinct spatial evidence needed for the concern, such as samples of
a distributed property under the same conditions or the successive points of a requested path.
The app layers only their guides in the same cycle up to the selected step. Labels come from the
selected step. A cycle can contain several updates to the same object or changes in time, group,
or phase. Keep a single occurrence when earlier results would duplicate or misrepresent the
selected state. If only some prior calls are comparable, use recorded values in input.step and
input.selected to filter them in the plan. input.selected is the snapshot the user is inspecting.

Then locate each group of values on or beside its object or region. Trace the sketch's draw calls
to recover that location in logical canvas coordinates. Use placement inputs only for placement
unless they also explain the concern. The app formats labels as actual variable names and recorded
values. Supply only references for labels. Never generate explanatory text, titles, aliases,
guessed values, computed display values, or decorative marks. A guide should reveal a property,
relationship, or effect of a displayed value on the canvas. A variable's role in the code, not
its name or type, determines how it can be shown.

input.step contains the occurrence being evaluated, with id, site, variables and state. For FSM steps, its
fsm field identifies the state, applied constraint or transition. Its variables may include $fsmData (owner
data), $fsmState (current state), $fsmValue (applied property value), or $fsmEvent (transition trigger).
input.context contains
earlier snapshots in the same cycle, including lines excluded from the analysis. Use
values from either source when they belong to the matching call and object. The analysis paths
do not restrict where to get coordinates. input.width and input.height are logical sketch
dimensions. Samples may omit large fields; the runtime supplies the recorded data.

Call mark(locate, fields, guides) once per object or region. A locator is a function that receives read
and returns [x, y]. fields is an array of recorded value references. Each reference is
[scope, path, optionalStepId], for example ['variables', ['red']] or ['state', ['cells', i, j]].
The active step is the default. Use an earlier step ID only for the same object or operation.
Group closely related values in one mark. Use at most eight marks per step and six values per mark.
Call read('variables', ['object', 'x']) or read('state', ['items', index, 'x']) to obtain recorded
inputs. An optional third argument selects a specific earlier snapshot by id from input.context.
Each locator must derive its position from values returned by read and the source's actual
geometry. Use the same transforms or pure calculations as the sketch where necessary. Source
constants may participate when the sketch actually uses them. Skip the mark when a location
cannot be established. Never use a fixed screen position as a fallback.

The optional guides argument is an array of up to four [fieldIndex, measure] pairs. fieldIndex
is a zero-based index into fields. measure(value, read) receives the exact recorded field value
and the same trace reader as locate. Return one guide, an array of guides, or null when geometry
cannot be established for the active occurrence. Each guide is { type, points, color? }, where
points is an array of [x, y] pairs in logical canvas coordinates. Available types:
- point: one position.
- polyline: an open path of two or more positions.
- outline or area: a closed path of three or more positions. area also fills the path.
- vector or dimension: exactly two endpoints. vector adds an arrow and dimension adds end ticks.
Use any of these in combination to express the value's actual visual role. A path can sample a
curve reconstructed from the sketch. Use at most 96 points per guide and 16 guides per mark.
Optional color is #RRGGBB or #RRGGBBAA. Supply it only when the sketch's color, alpha, or visual
encoding is part of the displayed value's role. For area it sets the fill, otherwise the stroke.

Use the field value, other recorded inputs obtained with read, and the drawing formulas and
transforms in source to calculate guides. An outline should follow the actual affected region.
Use exact source constants when they participate in those formulas. Never assume units, a default
shape, or coordinates based on a variable name. If the needed geometry cannot be recovered, keep
the variable label and omit the guide. If geometry extends outside the canvas, keep the original
coordinates and place the label on a visible part of the associated object or region.

The app runs each site's code for every occurrence of that site. Treat the sample IDs as
examples only. Read values and context for the active occurrence instead of hardcoding sample IDs
or requiring every field to be present. Show the relevant fields that are present and can be
placed. Return false if the active occurrence has nothing to show. Only use empty code for a
site when its recorded samples have no relevant state or no grounded place to display it.
For an empty entry, give the specific reason in a short skipReason in the user's language.

The isolated worker runs JavaScript without the live sketch, external libraries, or network.
Reimplement pure helpers from source when needed to locate an object or calculate guides. Use
recorded outcomes of random or external calls. Do not output a function wrapper or markdown.
`
