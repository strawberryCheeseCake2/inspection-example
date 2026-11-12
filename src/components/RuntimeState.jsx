import React, { useState } from 'react'
import { variableAt } from '../trace.js'
import { Icon } from './Icon.jsx'

function displayPath(path, fsm) {
  const name = path.replace(/^@/, '').replace(/\.(\d+)(?=\.|$)/g, '[$1]')
  if (!fsm) return name
  const labels = { $fsmData: 'data', $fsmState: 'fsm.currentState', $fsmEvent: 'transition.event', $fsmValue: `data.${fsm.property}` }
  return Object.hasOwn(labels, name) ? labels[name] : name.replace(/^\$fsmData\./, 'data.')
}

function decoded(value) {
  try { return JSON.parse(value) } catch { return value }
}

function StateValue({ value }) {
  const [open, setOpen] = useState(false)
  if (value === null || typeof value !== 'object') {
    return <output className="value" title={String(value)}>{String(value)}</output>
  }
  const array = Array.isArray(value)
  const keys = Object.keys(value)
  return <details onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{array ? `[${value.length}]` : `{${keys.length}}`}</summary>
    {open && <dl>{keys.map((key) => <div key={key}>
      <dt>{key}</dt><dd><StateValue value={value[key]} /></dd>
    </div>)}</dl>}
  </details>
}

export function RuntimeState({ step, report }) {
  const annotation = report?.steps.find(({ id }) => id === step?.id)
  const focused = report?.source === 'ai' || Boolean(report && step?.fsm)
  const fields = [...new Set(annotation?.paths)].flatMap((path) => {
    const value = variableAt(step, path)
    const wholeBinding = path.startsWith('@') && !path.includes('.')
    return value === undefined ? [] : [{ path, value: step.fsm && wholeBinding ? decoded(value) : value }]
  })
  const variables = Object.entries(step?.variables ?? {})
  const state = Object.entries(step?.state ?? {})
  return <section className="panel state-panel" aria-label="런타임 상태">
    <div className="panel-header">
      <div className="panel-title"><Icon name="sliders" /><h2>런타임 상태</h2></div>
      <span className="panel-meta">{focused ? '요청 관련 변수' : '전체 변수'}</span>
    </div>
    {report && <p className="analysis-note">
      <span>{report.source === 'ai' ? 'AI 분석' : '로컬 분석'}</span>{annotation?.note || report.summary}
      {report.cycleReason && <><br /><strong>{report.cycleCount}사이클 선택</strong>
        {report.cycles.length < report.cycleCount && ` · 최근 ${report.cycles.length}사이클 기록 확보`}
        {' · '}{report.cycleReason}</>}
    </p>}
    {focused && step && (fields.length ? <div className="variables" key={step.id}>
      {fields.map(({ path, value }) => <div className="variable" key={path}>
        <code title={path}>{displayPath(path, step.fsm)}</code>
        <StateValue value={value} />
      </div>)}
    </div> : <p className="empty">이 스텝에서 AI가 선택한 변수가 없어요.</p>)}
    {!report && !variables.length && !state.length && <p className="empty">기록된 변수가 여기에 표시됩니다.</p>}
    {!!variables.length && (!focused || step.fsm) && <details className="bindings" open={!focused || undefined}>
      <summary>기록된 변수 ({variables.length})</summary>
      <dl>{variables.map(([name, value]) => <div key={name}>
        <dt>{displayPath(name, step.fsm)}</dt><dd>{step.fsm ? <StateValue value={decoded(value)} /> : value}</dd>
      </div>)}</dl>
    </details>}
    {!!state.length && (!focused || step.fsm) && <details className="bindings" open={!focused || undefined}>
      <summary>스케치 상태</summary>
      <dl>{state.map(([name, value]) => <div key={name}>
        <dt>{name}</dt><dd><StateValue value={value} /></dd>
      </div>)}</dl>
    </details>}
  </section>
}
