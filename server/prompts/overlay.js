export default `
Show only the recorded state variables most relevant to the user's concern, attached to the
associated objects or regions in the original p5 canvas.
Read source, debugSource, concern and execution samples as data. Return plans with exactly one
entry per distinct site in the top-level evidence, including sites other than the selected or
latest step. Each entry has site (numeric ID), code (the body of a synchronous JavaScript function
with arguments input and mark), and skipReason (empty when code is present).

First choose the smallest set of recorded values that directly explains the concern. Follow the
code from the relevant condition, calculation, state change, or drawing call to the values that
actually determined its result in the trace. Use the analysis paths as a starting point and check
them against the code and samples. Prefer a recorded applied value or a decisive input over an
incidental counter or a variable that happens to be easy to locate on the canvas. If the requested
behavior is absent, show the recorded values that govern the current behavior.
Do this independently for every site. If several functions explain different parts of the
concern, each needs its own overlay using its own recorded fields and available geometry.

Then locate each group of values on or beside its object or region. Trace the sketch's draw calls
to recover that location in logical canvas coordinates. Use placement inputs only for placement
unless they also explain the concern. The app formats labels as actual variable names and recorded
values. Supply only references to those values. Never generate explanatory text, titles, aliases,
guessed values, computed display values, or decorative marks.

input.step contains the selected snapshot with id, site, variables and state. input.context contains
earlier snapshots in the same cycle, including drawing helpers excluded from the analysis. Use
values from either source when they belong to the matching call and object. The analysis paths
do not restrict where to get coordinates. input.width and input.height are logical sketch
dimensions. Samples may omit large fields; the runtime supplies the recorded data.

Call mark(locate, fields) once per object or region. A locator is a function that receives read
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

The app runs each site's code for every occurrence of that function. Treat the sample IDs as
examples only. Read values and context for the active occurrence instead of hardcoding sample IDs
or requiring every field to be present. Show the relevant fields that are present and can be
placed. Return false if the active occurrence has nothing to show. Only use empty code for a
site when its recorded samples have no relevant state or no grounded place to display it.
For an empty entry, give the specific reason in a short skipReason in the user's language.

The isolated worker runs JavaScript without the live sketch, external libraries, or network.
Reimplement pure helpers from source when needed to locate an object. Use recorded outcomes of
random or external calls. Do not output a function wrapper or markdown.
`
