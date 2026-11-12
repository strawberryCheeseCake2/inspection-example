import { parse } from 'acorn'
import { simple } from 'acorn-walk'
import { analyze } from 'eslint-scope'

const literal = (node) => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null
const argsOf = (node, type) => node?.type === 'NewExpression' && node.callee.name === type ? node.arguments : []
const location = (node) => ({ line: node.loc.start.line, endLine: node.loc.end.line })

function readArray(node, read) {
  if (node?.type !== 'ArrayExpression') return null
  const entries = node.elements.map(read)
  return entries.includes(null) ? null : entries
}

function readState(node) {
  const [id, list] = argsOf(node, 'State')
  const name = literal(id)
  const constraints = list ? readArray(list, (node) => {
    const [property, compute, description] = argsOf(node, 'Constraint')
    const name = literal(property)
    const text = literal(description)
    return name === null || text === null ? null : { name, description: text, compute: compute?.name, ...location(node) }
  }) : []
  return name !== null && constraints ? { name, constraints, ...location(node) } : null
}

function readMachine(node) {
  if (node?.type !== 'ObjectExpression') return null
  const fields = new Map(node.properties.filter((field) => field.type === 'Property' && !field.computed)
    .map(({ key, value }) => [key.name ?? literal(key), value]))
  const initial = literal(fields.get('initial'))
  const states = readArray(fields.get('states'), readState)
  if (!states) return null
  const names = new Set(states.map(({ name }) => name))
  if (!names.has(initial) || names.size !== states.length) return null
  const transitions = readArray(fields.get('transitions'), (node) => {
    const [from, to, event] = argsOf(node, 'Transition').map(literal)
    return names.has(from) && names.has(to) && event != null ? { from, to, event, ...location(node) } : null
  })
  return transitions ? { initial, states, transitions } : null
}

export function readFsmDiagrams(source) {
  let tree
  const options = { ecmaVersion: 2024, sourceType: 'script' }
  try {
    tree = parse(source, { ...options, locations: true, ranges: true, allowReturnOutsideFunction: true })
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return []
  }
  const declarations = new Map(tree.body.filter(({ type }) => type === 'VariableDeclaration')
    .flatMap(({ declarations }) => declarations.filter(({ id }) => id.type === 'Identifier')
      .map(({ id, init }) => [id.name, init])))
  const machineFor = (node) => readMachine(declarations.get(node?.name))
  const roots = new Map()
  const owners = new Map()
  for (const declaration of declarations.values()) {
    const [id, definition] = argsOf(declaration, 'Collection')
    const name = literal(id)
    const machine = machineFor(definition)
    if (name === null || !machine) continue
    const owner = { name, path: [name], machine, objects: new Map(), collections: new Map() }
    roots.set(declaration, owner)
    owners.set(declaration, owner)
  }
  if (!roots.size) return []

  const scopes = analyze(tree, { ...options, fallback: 'iteration', ignoreEval: true })
  const initializers = new Map()
  for (const scope of scopes.scopes) {
    for (const { identifier, resolved } of scope.references) {
      const declaration = resolved?.defs[0]?.node
      if (declaration?.type === 'VariableDeclarator') initializers.set(identifier, declaration.init)
    }
  }

  function collectionFor(node) {
    const expression = initializers.get(node) ?? node
    if (owners.has(expression)) return owners.get(expression)
    const callee = expression?.callee
    if (expression?.type !== 'CallExpression' || callee.type !== 'MemberExpression'
      || callee.computed || callee.property.name !== 'addCollection') return
    // Mark the expression before resolving its parent, which can reference another binding.
    owners.set(expression, undefined)
    const parent = collectionFor(callee.object)
    const [id, definition] = expression.arguments
    const name = literal(id)
    const machine = machineFor(definition)
    if (!parent || name === null || !machine) return
    if (!parent.collections.has(name)) {
      parent.collections.set(name, { name, path: [...parent.path, name], machine, objects: new Map(), collections: new Map() })
    }
    const collection = parent.collections.get(name)
    owners.set(expression, collection)
    return collection
  }

  simple(tree, {
    CallExpression(node) {
      const { callee, arguments: args } = node
      if (callee.type !== 'MemberExpression' || callee.computed) return
      if (callee.property.name === 'addCollection') collectionFor(node)
      if (callee.property.name !== 'addObject') return
      const collection = collectionFor(callee.object)
      if (!collection) return
      const name = literal(args[0])
      const machine = machineFor(args[1])
      if (name !== null && machine) collection.objects.set(name, { name, machine })
    },
  })
  function flatten(collection) {
    const { name, path, machine, objects, collections } = collection
    return [{ name, path, machine, objects: [...objects.values()] }, ...[...collections.values()].flatMap(flatten)]
  }
  return [...roots.values()].flatMap(flatten)
}

export function fsmSites(source) {
  let nextSite = 0
  return readFsmDiagrams(source).flatMap(({ name: collection, path, machine, objects }) =>
    [{ name: null, machine }, ...objects].flatMap(({ name: object, machine }) =>
      machine.states.map(({ name: state, constraints, ...location }) => ({
        site: ++nextSite, collection, ...(path.length > 1 && { collectionPath: path }), object, state, ...location,
        constraints: constraints.map((constraint) => ({ site: ++nextSite, ...constraint })),
        transitions: machine.transitions.filter(({ from }) => from === state)
          .map((transition) => ({ site: ++nextSite, ...transition })),
      }))))
}
