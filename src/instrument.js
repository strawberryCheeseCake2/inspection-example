import { parse } from 'acorn'
import { fullAncestor } from 'acorn-walk'
import { analyze } from 'eslint-scope'

export function instrument(source) {
  const options = { ecmaVersion: 2024, sourceType: 'script' }
  const tree = parse(source, { ...options, locations: true, ranges: true, allowReturnOutsideFunction: true })
  const scopes = analyze(tree, { ...options, fallback: 'iteration', ignoreEval: true })
  let hook = '__recordSketch'
  while (source.includes(hook)) hook += '_'
  const edits = []
  const anchors = Object.create(null)
  const lines = new Set()
  const insert = (at, text) => edits.push({ at, text, end: at })
  const replace = (node, text) => edits.push({ at: node.start, end: node.end, text })

  function bindingsAt(ancestors) {
    const names = new Set()
    for (let index = ancestors.length - 1; index >= 0; index--) {
      const scope = scopes.acquire(ancestors[index], true)
      if (!scope) continue
      for (let current = scope; current; current = current.upper) {
        for (const variable of current.variables) {
          if (variable.defs.length) names.add(variable.name)
        }
      }
      break
    }
    return names
  }

  function getters(ancestors) {
    const bindings = [...bindingsAt(ancestors)].map((name) => `[${JSON.stringify(name)},()=>${name}]`).join(',')
    return `()=>[${bindings}]`
  }

  function site(node, ancestors) {
    const line = node.loc.start.line
    lines.add(line)
    return `${line},${node.start},${getters(ancestors)}`
  }

  function anchor(node) {
    const text = source.slice(node.start, node.end).replace(/;$/, '').trim()
    anchors[text] = Object.hasOwn(anchors, text) && anchors[text] !== node.start ? null : node.start
  }

  const first = tree.body.find((node) => !node.directive)
  if (first) insert(first.start, `${hook}.register(${getters([tree])});`)

  // Acorn visits children first. At coincident offsets, add closing edits before opening edits.
  fullAncestor(tree, (node, _, ancestors) => {
    const parent = ancestors.at(-2)
    const type = node.type
    if (type === 'CallExpression' && node.callee.type === 'MemberExpression'
      && node.callee.object.name === 'trace' && !node.callee.computed
      && node.callee.property.name === 'step' && node.arguments.length && !node.optional && !node.callee.optional
      && !bindingsAt(ancestors).has('trace')) {
      replace(node.callee, `${hook}.step(${site(node, ancestors)})`)
    }
    const value = type === 'ArrowFunctionExpression' && node.expression ? node.body
      : type === 'ReturnStatement' ? node.argument
        : ['IfStatement', 'ForStatement', 'WhileStatement', 'DoWhileStatement', 'ConditionalExpression'].includes(type) ? node.test
          : null
    if (value) {
      anchor(value)
      insert(value.start, `${hook}.result((`)
      insert(value.end, `),${site(value, ancestors)})`)
    }
    if (type === 'BlockStatement' && parent && (
      parent.body === node && /Function|For|While|Catch/.test(parent.type)
      || ['IfStatement', 'TryStatement'].includes(parent.type)
    )) {
      const first = node.body.find((statement) => !statement.directive)
      if (first) insert(first.start, `${hook}.point(${site(node, ancestors)});`)
      else insert(node.end - 1, `;${hook}.point(${site(node, ancestors)});`)
    }

    const simple = ['VariableDeclaration', 'ClassDeclaration', 'ExpressionStatement', 'DebuggerStatement', 'EmptyStatement'].includes(type)
    const jump = ['ReturnStatement', 'ThrowStatement', 'BreakStatement', 'ContinueStatement'].includes(type)
    if ((!simple && !jump) || node.directive || !parent || (type === 'ReturnStatement' && node.argument)) return
    const inList = ['Program', 'BlockStatement', 'StaticBlock', 'SwitchCase'].includes(parent.type)
    const unbraced = parent.type === 'IfStatement' || (parent.body === node && /For|While|With/.test(parent.type))
    if (!inList && !unbraced) return
    anchor(node)
    const point = `${hook}.point(${site(node, ancestors)});`
    if (unbraced) {
      insert(node.start, jump ? `{${point}` : '{')
      insert(node.end, jump ? '}' : `;${point}}`)
    } else if (jump) {
      insert(node.start, point)
    } else {
      insert(node.end, `;${point}`)
    }
  })

  // Prefixes surround nested probes. Suffixes run from inner to outer.
  edits.sort((a, b) => a.at - b.at || a.end - b.end)
  let transformed = ''
  let offset = 0
  for (const edit of edits) {
    transformed += source.slice(offset, edit.at) + edit.text
    offset = edit.end
  }
  return { source: transformed + source.slice(offset), hook, anchors, lines }
}
