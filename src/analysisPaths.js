import { parse } from 'acorn'
import { ancestor, full } from 'acorn-walk'

const functionTypes = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const colorConcern = /색|colou?r|\brgb\b/i
const colorMethods = new Set(['fill', 'stroke', 'background', 'tint', 'color'])

function bindingPath(node) {
  if (node.type === 'Identifier') return '@' + node.name
  if (node.type !== 'MemberExpression') return null
  const key = node.computed && node.property.type === 'Literal' ? node.property.value
    : node.computed ? null : node.property.name
  const parent = bindingPath(node.object)
  return parent && key != null && !String(key).includes('.') ? parent + '.' + key : null
}

function referencedPaths(nodes) {
  const found = new Set()
  const shadowed = new Set()
  for (const node of nodes) {
    full(node, (part) => {
      const path = bindingPath(part)
      if (!path) return
      found.add(path)
      if (part.type === 'MemberExpression') {
        shadowed.add(bindingPath(part.object))
      }
    })
  }
  return [...found].filter((path) => !shadowed.has(path))
}

export function sourceVariablePaths(source, plan) {
  const functions = new Map(plan.functions?.map((item) => [item.functionId, item]) ?? [])
  if (!source || !functions.size) return new Map()
  const useColor = colorConcern.test(plan.concern ?? '')
  const focus = new Map()
  const colors = new Map()
  function add(node, ancestors, expressions, colorArgs = []) {
    const owner = ancestors.findLast((item) => functionTypes.has(item.type))
    const selection = functions.get(owner?.start)
    if (!selection) return
    function append(target, paths) {
      if (!paths.length) return
      if (!target.has(owner.start)) target.set(owner.start, new Set())
      for (const path of paths) target.get(owner.start).add(path)
    }
    if (selection.focusLines?.includes(node.loc.start.line)) {
      append(focus, referencedPaths(useColor && colorArgs.length ? colorArgs : expressions))
    }
    if (useColor && colorArgs.length) append(colors, referencedPaths(colorArgs))
  }
  const tree = parse(source, { ecmaVersion: 2024, locations: true, allowReturnOutsideFunction: true })
  ancestor(tree, {
    CallExpression(node, _, ancestors) {
      const { callee, arguments: args } = node
      const isColor = callee.type === 'MemberExpression' && !callee.computed && callee.object.name === 'p'
        && colorMethods.has(callee.property.name)
      add(node, ancestors, args, isColor ? args.slice(0, args.length < 3 ? 1 : 3) : [])
    },
    IfStatement(node, _, ancestors) { add(node, ancestors, [node.test]) },
    ReturnStatement(node, _, ancestors) { if (node.argument) add(node, ancestors, [node.argument]) },
  })
  return new Map([...functions].map(([id, selection]) => [id, {
    paths: [...(focus.get(id) ?? colors.get(id) ?? [])],
    // Older reports only stored paths. Recover directly applied color values from the source.
    replace: !Array.isArray(selection.focusLines) && colors.has(id),
  }]))
}
