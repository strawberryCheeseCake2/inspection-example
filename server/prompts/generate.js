import debugContract from './debug.js'
import { fsmStructure } from './fsm.js'

export default `
Create a complete editable p5.js instance-mode sketch for the user's description.
Return source and debugSource, with no markdown. Keep the sketch focused and the attachment small.
Do not import anything, instantiate p5, or use network APIs.

Model the artwork with one or more collections of objects and the FSM declarations below.
Avoid dummy states, fake transitions, redundant checks, error wrappers, and copies of the shared runtime.
${fsmStructure}

Keep p5 callbacks small and compose them from named helpers with a single responsibility.
Split substantial work into inspectable operations such as sampling input, deciding whether to
act, updating state, and drawing. Give meaningful array callbacks names when they represent
their own operation. Group related statements into the same function when they form one action.
Use named local variables for important outputs so they are visible when a helper exits.

In source, make useful runtime values visible to the debugger by declaring them as named
variables wherever their values help explain the sketch's behavior. Apply this throughout
the sketch, independently of the initial request. Prefer named bindings for:
- Inputs and external readings such as pointer coordinates (e.g. const mouseX = p.mouseX),
  keyboard state, time, canvas dimensions, and random or noise samples used in calculations.
- Behavior settings and thresholds, such as brush spacing, collision radius, or flood level.
- Intermediate calculations, indices, and lookups, such as drag distance, grid coordinates,
  neighboring cells, and previous and proposed values in a state update.
- Decision results and the values actually applied to drawing or state, such as shouldStamp,
  isOverlapping, clampedSize, or nextVelocity.

Use descriptive names and use those variables in the artwork logic. Declare them near where
they are computed and keep them in scope at the decision or update they explain. Prefer const
for values that are not reassigned. Preserve evaluation order and short-circuit behavior when
extracting expressions. Keep trivial literals and routine drawing boilerplate inline when naming
them would add no insight. These are ordinary sketch variables in source.
${debugContract}
`
