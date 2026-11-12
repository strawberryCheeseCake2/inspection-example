import { parse } from 'acorn'
import { fullAncestor } from 'acorn-walk'
import { analyze } from 'eslint-scope'

export function instrument(source, fsm = false) {
  const options = { ecmaVersion: 2024, sourceType: 'script' }
  const tree = parse(source, {
    ...options, locations: true, ranges: true, preserveParens: true, allowReturnOutsideFunction: true,
  })
  const scopes = analyze(tree, { ...options, fallback: 'iteration', ignoreEval: true })
  let hook = '__recordSketch'
  while (source.includes(hook)) hook += '_'
  const edits = []
  const lines = new Set()
  const insert = (at, text, order = 0, end = at) => edits.push({ at, text, order, end })
  const readersByScope = new Map()

  function readers(ancestors) {
    const owner = ancestors.findLast((node) => scopes.acquire(node))
    const scope = scopes.acquire(owner, true)
    if (!readersByScope.has(scope)) {
      const names = new Map()
      for (let current = scope; current; current = current.upper) {
        for (const variable of current.variables) {
          if (variable.defs.length && !names.has(variable.name)) names.set(variable.name, current !== scopes.globalScope)
        }
      }
      readersByScope.set(scope, '()=>[' + [...names].map(([name, local]) =>
        `[${JSON.stringify(name)},()=>${name}${fsm && local ? ',true' : ''}]`).join(',') + ']')
    }
    return readersByScope.get(scope)
  }

  function checkpoint(line, ancestors) {
    lines.add(line)
    return `${hook}.line(${line},${readers(ancestors)});`
  }

  function evaluated(expression, line, ancestors) {
    lines.add(line)
    insert(expression.start, `${hook}.value(${line},(`)
    // Close the expression before any enclosing statement checkpoint at the same offset.
    insert(expression.end, `),${readers(ancestors)})`, -2)
  }

  function statement(node, parent, probe, before) {
    const standalone = parent.type === 'Program' || parent.type === 'BlockStatement'
      || parent.type === 'SwitchCase' || parent.type === 'StaticBlock'
    if (!standalone) insert(node.start, '{')
    if (before) insert(node.start, probe)
    if (!before) insert(node.end, '\n;' + probe)
    if (!standalone) insert(node.end, '}')
  }

  function iteration(node, line, ancestors) {
    const probe = checkpoint(line, ancestors)
    // Keep the original body and its lexical scope inside the iteration checkpoint.
    insert(node.body.start, '{' + probe, -1)
    insert(node.body.end, '}', 1)
  }

  fullAncestor(tree, (node, _, ancestors) => {
    const parent = ancestors.at(-2)
    const line = node.loc.start.line
    if (fsm) {
      // Collect the constraint function's return bindings without making its lines steps.
      if (node.type === 'ReturnStatement' && node.argument) evaluated(node.argument, line, ancestors)
      if (node.type === 'ArrowFunctionExpression' && node.expression) evaluated(node.body, node.body.loc.start.line, ancestors)
      if (node.type === 'CallExpression' && !node.optional) {
        const { callee } = node
        const method = callee.property?.name
        const fsmMethod = ['evaluate', 'dispatch'].includes(method) && callee.object?.type === 'MemberExpression'
          && !callee.object.optional && !callee.object.computed && callee.object.property.name === 'fsm'
        if (callee.type === 'MemberExpression' && !callee.computed && !callee.optional
          && (fsmMethod || method === 'addObject' || method === 'addCollection')
          && !ancestors.some((part) => part.type === 'ChainExpression')) {
          insert(callee.start, `${hook}.fsmCall(`, 1)
          insert(callee.object.end, `,${JSON.stringify(method)},${readers(ancestors)})`, 0, callee.end)
        }
      }
      return
    }
    switch (node.type) {
      case 'VariableDeclaration':
        if (parent.init === node || parent.left === node) break
        statement(node, parent, checkpoint(line, ancestors), false)
        break
      case 'ExpressionStatement':
        if (!node.directive) statement(node, parent, checkpoint(line, ancestors), false)
        break
      case 'ReturnStatement':
      case 'ThrowStatement':
        if (node.argument) evaluated(node.argument, line, ancestors)
        else statement(node, parent, checkpoint(line, ancestors), true)
        break
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'DebuggerStatement':
        statement(node, parent, checkpoint(line, ancestors), true)
        break
      case 'IfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
        evaluated(node.test, node.test.loc.start.line, ancestors)
        break
      case 'ForStatement':
        if (node.test) evaluated(node.test, node.test.loc.start.line, ancestors)
        else iteration(node, line, ancestors)
        if (node.update && node.update.loc.start.line !== (node.test?.loc.start.line ?? line)) {
          evaluated(node.update, node.update.loc.start.line, ancestors)
        }
        break
      case 'ForInStatement':
      case 'ForOfStatement':
        iteration(node, line, ancestors)
        break
      case 'SwitchStatement':
        evaluated(node.discriminant, line, ancestors.slice(0, -1))
        break
      case 'SwitchCase':
        if (node.test) evaluated(node.test, line, ancestors)
        break
      case 'ArrowFunctionExpression':
        if (node.expression) evaluated(node.body, node.body.loc.start.line, ancestors)
        break
    }
  })

  if (fsm) {
    const directive = tree.body.findLast((node) => node.directive)
    insert(directive?.end ?? 0, `\n;${hook}.bind(${readers([tree])});\n`, -3)
  }

  edits.sort((a, b) => a.at - b.at || a.order - b.order)
  const chunks = []
  let offset = 0
  for (const { at, text, end } of edits) {
    chunks.push(source.slice(offset, at), text)
    offset = end
  }
  chunks.push(source.slice(offset))
  const sketchBindings = scopes.globalScope.variables.filter(({ defs }) => defs.some(({ type }) => type === 'Variable'))
    .map(({ name }) => name)
  return { source: chunks.join(''), hook, sketchBindings, lines: [...lines].sort((a, b) => a - b) }
}
