import React, { useState } from 'react'
import { variableAt } from '../trace.js'
import { Icon } from './Icon.jsx'

const displayPath = (path) => path.replace(/^@/, '').replace(/\.(\d+)(?=\.|$)/g, '[$1]')

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
  const focused = report?.source === 'ai'
  const fields = [...new Set(annotation?.paths)].flatMap((path) => {
    const value = variableAt(step, path)
    return value === undefined ? [] : [{ path, value }]
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
        <code title={path}>{displayPath(path)}</code>
        <StateValue value={value} />
      </div>)}
    </div> : <p className="empty">이 스텝에서 AI가 선택한 변수가 없어요.</p>)}
    {!report && !variables.length && !state.length && <p className="empty">기록된 변수가 여기에 표시됩니다.</p>}
    {!focused && !!variables.length && <div className="bindings">
      <strong>선언 변수 ({variables.length})</strong>
      <dl>{variables.map(([name, value]) => <div key={name}>
        <dt>{name}</dt><dd>{value}</dd>
      </div>)}</dl>
    </div>}
    {!focused && !!state.length && <div className="bindings">
      <strong>스케치 상태</strong>
      <dl>{state.map(([name, value]) => <div key={name}>
        <dt>{name}</dt><dd><StateValue value={value} /></dd>
      </div>)}</dl>
    </div>}
  </section>
}
