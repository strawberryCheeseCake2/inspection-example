export const fsmStructure = `
Model the artwork as expressively as possible with declarative object and collection FSMs.
The declarations should reveal each meaningful phase of behavior, the events that move between
phases, and the relationships that determine properties in each phase. Keep the formulas in
named value functions.

Before generating the sketch, identify the distinct object roles, group behavior, interaction
phases, and lifecycle changes implied by the request. Put behavior for an individual member
in its object FSM and behavior shared by the group in its collection FSM. Give a phase its own
state when different relationships apply, different actions become possible, or the object
changes how it participates in the artwork. For example, an object that is active until it is
absorbed has distinct active and absorbed states, with a transition driven by the absorption event.
Use owner.fsm.dispatch(event) when the event occurs so the declared transition is taken before
any resulting removal. Declare these behavior changes explicitly in the FSM. Use flags and
branches for event detection and calculations within a phase. A single state is appropriate
when the owner has one mode of behavior throughout the sketch.

The generated sketch must follow these rules:
1. A Collection can contain primitive objects, child collections, or both. Child collections
   can contain further collections and objects at any depth. Use this hierarchy to compose
   groups when the artwork has distinct levels of behavior. Each collection and each object
   instance has its own FSM and current state, even when instances share a definition.
   Keep each object a very simple, indivisible primitive with one role and only the properties
   needed for that role. Objects are leaves. Put behavior shared by multiple primitives and
   relationships among groups in the collection that owns them.
2. Each FSM definition declares an initial state, a states array, and a transitions array.
   Give states and events names that describe the behavior. Declare the relevant constraints
   in each state and connect states with transitions the sketch actually dispatches.
3. Each Constraint expresses a relationship between objects, collections, or their members.
   Its name is exactly the object or collection property it controls, such as
   position, size, or rotation. Its value is a named function that returns the property value.
   Its description states how the property depends on the other objects, in the user's language.
   Keep neighbor lookup, contact tests, and intermediate calculations local to the value
   functions that use them. Keep unrelated drawing operations in ordinary code.
4. Give each meaningful constrained property its own constraint on the owner whose property
   changes. Review both the object and collection levels for relationships such as proximity,
   membership, ordering, alignment, attachment, and collision. Use the resulting properties
   in the update, transition, or rendering logic.
5. Declare constraints in evaluation order, with dependencies first. Call owner.fsm.evaluate(...inputs)
   at the sketch events or update passes where those relationships should apply. It calls each constraint's
   value function as computeProperty(owner, ...inputs) and immediately stores the returned
   value in owner.data[propertyName] before evaluating the next constraint.

Use the injected Collection, State, Transition and Constraint classes. Here is an example of an
object FSM definition with distinct properties and a dependency in evaluation order:
  const followerMachine = {
    initial: 'following',
    states: [
      new State('following', [
        new Constraint('position', computePosition, 'Stays a fixed distance behind the leader'),
        new Constraint('rotation', computeRotation, 'Faces the leader from its updated position'),
        new Constraint('size', computeSize, 'Stays half the size of the leader'), ...
      ]),
      new State('resting', [...]), ...
    ],
    transitions: [
      new Transition('following', 'resting', 'rest'),
      new Transition('resting', 'following', 'resume'), ...
    ],
  } // You can add more states, transitions, constraints. Be expressive rather than using few abstractions.

Declare each root collection as a top-level const binding initialized with
new Collection('rootRole', rootMachine, { ...initialData }). Create nested collections with
a direct binding such as const group = root.addCollection('groupRole', groupMachine, { ...initialData }).
Use that binding for descendant creation, for example
group.addObject('primitiveRole', primitiveMachine, { ...initialData }), or call group.addCollection(...)
to add another level. Creation calls can be inside functions or loops. Pass a named top-level
FSM definition and a literal role name to each creation call. Use the same role and definition
for repeated instances of a kind, and distinct names for distinct roles under the same parent.
Use literal state, event, property, and description strings and literal arrays in the definitions
so the inspector can read the diagram from source. Keep definitions shared and immutable.

Call owner.fsm.dispatch(event) to follow a transition. A collection exposes its direct objects
in .objects and its child collections in .collections. An object reaches its collection through
.collection, and a child collection reaches its parent through .parent. Properties live in .data.
Keep useful local variables in each constraint function.
`

export const fsmInspection = `
When source uses the injected FSM classes, owner.fsm.dispatch(event) changes currentState on a
matching transition. owner.fsm.evaluate(...inputs) calls the active state's Constraint value
functions in their declared order and assigns each returned value to owner.data[constraint.name].
The shared runtime itself is outside the sketch. Follow the declarations to the actual
constraint function, state transition call, or consumer of the resulting property.
`
