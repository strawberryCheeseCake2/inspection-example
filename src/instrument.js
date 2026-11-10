import { parse } from 'acorn'
import { fullAncestor } from 'acorn-walk'
import { analyze } from 'eslint-scope'

const renderWrapper = /^(?:render|redraw|draw)(?:Artwork|Scene|Frame|Canvas|Sketch|All|Everything)$/i

export function isDebugCandidate({ presentationOnly }) {
  return !presentationOnly
}

export function instrument(source) {
  const options = { ecmaVersion: 2024, sourceType: 'script' }
  const tree = parse(source, {
    ...options, locations: true, ranges: true, preserveParens: true, allowReturnOutsideFunction: true,
  })
  const scopes = analyze(tree, { ...options, fallback: 'iteration', ignoreEval: true })
  let hook = '__recordSketch'
  while (source.includes(hook)) hook += '_'
  const call = hook + 'Call'
  const edits = []
  const functions = []
  const functionNodes = new Set()
  const blocks = []
  const insert = (at, text) => edits.push({ at, text })

  function bindings(scope) {
    const names = new Set()
    for (let current = scope; current; current = current.upper) {
      for (const variable of current.variables) {
        if (variable.defs.length) names.add(variable.name)
      }
    }
    return [...names].map((name) => `[${JSON.stringify(name)},()=>${name}]`).join(',')
  }

  function functionName(node, parent) {
    if (node.id?.name) return node.id.name
    if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name
    if (parent?.type === 'AssignmentExpression') {
      return source.slice(parent.left.start, parent.left.end)
    }
    if (parent?.value === node && parent.key) return source.slice(parent.key.start, parent.key.end)
    return 'anonymous'
  }

  // Child suffixes must close before a parent suffix at the same offset.
  fullAncestor(tree, (node, _, ancestors) => {
    if (node.type === 'BlockStatement') {
      const scope = scopes.acquire(node)
      if (scope?.type !== 'block') return
      const owner = ancestors.findLast((ancestor) => ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(ancestor.type))
      if (!owner) return
      const locals = scope.variables.filter(({ defs }) => defs.length)
      if (['for', 'catch'].includes(scope.upper?.type) && scope.upper.block === ancestors.at(-2)) {
        for (const variable of scope.upper.variables) {
          if (variable.defs.length && !locals.some(({ name }) => name === variable.name)) locals.push(variable)
        }
      }
      if (locals.length) blocks.push({ owner, at: node.start + 1, locals })
      return
    }
    if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) return
    const scope = scopes.acquire(node, true)
    // Moving a merged function/var or function/parameter binding into a try block changes its scope.
    if (scope?.variables.some(({ defs }) => defs.length > 1
      && defs.some(({ node }) => node.type === 'FunctionDeclaration'))) return
    const parent = ancestors.slice(0, -1).findLast((ancestor) => ancestor.type !== 'ParenthesizedExpression')
    const id = node.start
    const name = functionName(node, parent)
    functionNodes.add(node)
    const { start, end } = node.loc
    const body = node.body
    const onlyStatement = body.body?.length === 1 ? body.body[0] : null
    const expression = node.expression ? body : onlyStatement?.expression
    const drawCallback = parent?.type === 'AssignmentExpression'
      && source.slice(parent.left.start, parent.left.end) === 'p.draw'
    const delegatesToRenderer = expression?.type === 'CallExpression' && renderWrapper.test(expression.callee.name ?? '')
    functions.push({
      functionId: id, name, line: start.line, column: start.column + 1, endLine: end.line,
      presentationOnly: renderWrapper.test(name) || (drawCallback && delegatesToRenderer),
    })

    const startCall = `;const ${call}=${hook}.enter();try{if(${call})${call}.bindings=()=>[${bindings(scope)}];`
    const finishCall = `\n}finally{${hook}.finish(${call},${id});}`
    if (node.expression) {
      insert(body.start, `{${startCall}return (`)
      insert(body.end, `);${finishCall}}`)
    } else {
      const lastDirective = body.body.findLast((statement) => statement.directive)
      insert(lastDirective?.end ?? body.start + 1, startCall)
      insert(body.end - 1, finishCall)
    }
  })

  for (const { owner, at, locals } of blocks) {
    if (!functionNodes.has(owner)) continue
    const reads = locals.map(({ name }) => `[${JSON.stringify(name)},()=>${name}]`).join(',')
    insert(at, `;if(${call})${hook}.block(${call},[${reads}]);`)
  }

  edits.sort((a, b) => a.at - b.at)
  let transformed = ''
  let offset = 0
  for (const { at, text } of edits) {
    transformed += source.slice(offset, at) + text
    offset = at
  }
  return { source: transformed + source.slice(offset), hook, functions: functions.sort((a, b) => a.functionId - b.functionId) }
}
