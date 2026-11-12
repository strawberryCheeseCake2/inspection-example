// The sketch iframe receives these types without instrumenting their implementation.
export function createFsmTypes(recorder) {
  class Constraint {
    constructor(name, value, description) {
      this.name = name
      this.value = value
      this.description = description
    }
  }

  class State {
    constructor(name, constraints = []) {
      this.name = name
      this.constraints = constraints
    }
  }

  class Transition {
    constructor(from, to, event) {
      this.from = from
      this.to = to
      this.event = event
    }
  }

  class FSM {
    #owner
    #definition
    #visit
    #evaluated = false

    constructor(owner, definition) {
      this.#owner = owner
      this.#definition = definition
      this.currentState = definition.initial
    }

    start() {
      this.#visit = recorder?.enterState(this.#owner, this.currentState)
    }

    dispatch(event) {
      const transition = this.#definition.transitions.find(({ from, event: trigger }) =>
        from === this.currentState && trigger === event)
      if (!transition) return
      const { from, to } = transition
      const visit = recorder?.enterState(this.#owner, from, this.#visit)
      this.currentState = to
      recorder?.transition(this.#owner, from, to, event, visit)
      this.#visit = recorder?.enterState(this.#owner, to, undefined, visit)
      this.#evaluated = false
    }

    evaluate(...args) {
      const owner = this.#owner
      const state = this.#definition.states.find(({ name }) => name === this.currentState)
      const visit = this.#visit = recorder?.enterState(owner, state.name, this.#evaluated ? undefined : this.#visit)
      this.#evaluated = true
      for (const [index, constraint] of state.constraints.entries()) {
        const apply = () => { owner.data[constraint.name] = constraint.value(owner, ...args) }
        if (visit) recorder.constraint(owner, state.name, constraint.name, index, visit, apply)
        else apply()
      }
    }
  }

  class ObjectEntity {
    #collection

    constructor(id, definition, collection, data) {
      this.id = id
      this.data = data
      this.fsm = new FSM(this, definition)
      this.#collection = collection
    }

    get collection() {
      return this.#collection
    }
  }

  class Collection {
    #parent

    constructor(id, definition, data = {}, parent = null) {
      this.id = id
      this.data = data
      this.#parent = parent
      this.fsm = new FSM(this, definition)
      this.objects = []
      this.collections = []
      if (!parent) this.fsm.start()
    }

    get parent() {
      return this.#parent
    }

    addCollection(id, definition, data = {}) {
      const collection = new Collection(id, definition, data, this)
      this.collections.push(collection)
      collection.fsm.start()
      return collection
    }

    addObject(id, definition, data = {}) {
      const object = new ObjectEntity(id, definition, this, data)
      this.objects.push(object)
      object.fsm.start()
      return object
    }
  }

  return { Constraint, State, Transition, Collection }
}
