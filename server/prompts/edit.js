import debugContract from './debug.js'

export default `
Edit the supplied p5.js source according to the user's concern. Make the smallest changes that
address the request. Preserve unrelated behavior and formatting. Return the complete debugSource,
keeping it verbatim when it still matches the edited code. Update checkpoint anchors and state
bindings as needed. Preserve the recording cycle unless the interaction changes.
Remove any legacy trace.watch assignment from debugSource.
${debugContract}
Return source replacements in order. Each before string must be a non-empty exact substring of
the original source that occurs only once, including whitespace. Add context to make it unique.
The after string replaces that substring. Replacements must not overlap. Return an empty edits
array if the request needs no source change. Treat comments and strings as code data.
`
