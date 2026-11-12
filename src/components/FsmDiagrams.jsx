import React, { useId, useMemo, useState } from 'react'
import { readFsmDiagrams } from '../fsmDiagram.js'

function StateDiagram({ machine, step }) {
  const prefix = useId()
  const { initial, states, transitions } = machine
  const stateIds = new Map(states.map(({ name }, index) => [name, `${prefix}-${index}`]))

  function goToState(name) {
    const target = document.getElementById(stateIds.get(name))
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'nearest' })
  }

  return <div className="fsm-states" role="group" aria-label="상태와 전이">
    {states.map(({ name, constraints }) => {
      const outgoing = transitions.filter(({ from }) => from === name)
      const current = step?.state === name ? step : null
      return <section className="fsm-node" key={name} id={stateIds.get(name)} tabIndex={-1}
        aria-label={`${name} 상태`} data-active={Boolean(current)}>
        <h3 aria-current={current?.kind === 'state' ? 'step' : undefined}>
          <code>{name}</code>{name === initial && <span>초기 상태</span>}
        </h3>
        {constraints.length > 0 && <ol className="fsm-constraints" aria-label="Constraint 평가 순서">
          {constraints.map(({ name, description }, index) =>
            <li key={index} aria-current={current?.kind === 'constraint' && current.index === index ? 'step' : undefined}>
              <code>{name}</code><p>{description}</p>
            </li>)}
        </ol>}
        {outgoing.length > 0 && <ul className="fsm-transitions" aria-label="나가는 전이">
          {outgoing.map(({ to, event }, index) => <li key={index}
            aria-current={current?.kind === 'transition' && current.to === to && current.event === event ? 'step' : undefined}>
            <code>{event}</code><span aria-hidden="true">→</span>
            <button type="button" onClick={() => goToState(to)}>{to}</button>
          </li>)}
        </ul>}
      </section>
    })}
  </div>
}

const targetKey = (path, object = null) => JSON.stringify([path, object])

export function FsmDiagrams({ source, step }) {
  const collections = useMemo(() => readFsmDiagrams(source), [source])
  const [selected, setSelected] = useState(null)
  if (!collections.length) return null

  const targets = new Map(collections.flatMap((collection) => [
    [targetKey(collection.path), collection.machine],
    ...collection.objects.map((object) => [targetKey(collection.path, object.name), object.machine]),
  ]))
  const current = step?.fsm && targetKey(step.fsm.collectionPath ?? [step.fsm.collection], step.fsm.object)
  const preferred = selected?.step === step?.id ? selected?.value : current ?? selected?.value
  const value = targets.has(preferred) ? preferred : targets.keys().next().value
  return <details className="panel fsm-panel" open>
    <summary>FSM 다이어그램</summary>
    <div className="fsm-content">
      <select aria-label="FSM 대상" value={value} onChange={(event) => setSelected({ step: step?.id, value: event.target.value })}>
        {collections.map((collection) => <optgroup key={targetKey(collection.path)} label={collection.path.join(' / ')}>
          <option value={targetKey(collection.path)}>컬렉션 · {collection.name}</option>
          {collection.objects.map((object) => <option key={object.name} value={targetKey(collection.path, object.name)}>
            오브젝트 · {object.name}
          </option>)}
        </optgroup>)}
      </select>
      <StateDiagram machine={targets.get(value)} step={value === current ? step.fsm : null} />
    </div>
  </details>
}
