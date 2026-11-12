import debugContract from './debug.js'
import { fsmStructure } from './fsm.js'

export default `
Edit the supplied p5.js source according to the user's concern. Make the smallest changes that
address the request. Preserve unrelated behavior and formatting. Return the complete debugSource,
keeping it verbatim when it still matches the edited code. Preserve existing artwork behavior
and optional editing hooks unless the requested change makes them unnecessary.
Preserve the recording cycle unless the interaction changes. Keep changed behavior organized
into small named functions with one responsibility. Remove legacy trace.label calls and
trace.watch assignments from debugSource.
If the source already uses the injected FSM classes, preserve its declarative form and change
the affected definitions or constraint functions directly. Follow this contract for that code:
${fsmStructure}
${debugContract}
Return source replacements in order. Each before string must be a non-empty exact substring of
the original source that occurs only once, including whitespace. Add context to make it unique.
The after string replaces that substring. Replacements must not overlap. Return an empty edits
array if the request needs no source change. Treat comments and strings as code data.
`
