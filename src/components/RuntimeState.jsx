import React, { useState } from 'react'
import { variableAt } from '../trace.js'
import { Icon } from './Icon.jsx'

const displayPath = (path) => path.replace(/^@/, '').replace(/\.(\d+)(?=\.|$)/g, '[$1]')

function Value({ path, value, onEdit, disabled }) {
  if (typeof value === 'boolean') {
    return <button className="value toggle" type="button" role="switch" aria-label={path}
      aria-checked={value} onClick={() => onEdit(!value)} disabled={disabled}>{String(value)}</button>
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const numeric = typeof value === 'number'
    return <input className="value" type={numeric ? 'number' : 'text'} step="any" aria-label={path}
      key={value} defaultValue={value} readOnly={disabled}
      onBlur={(e) => {
        const next = numeric ? e.target.valueAsNumber : e.target.value
        if ((!numeric || Number.isFinite(next)) && next !== value) onEdit(next)
        else e.target.value = value
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.currentTarget.value = value
          e.currentTarget.blur()
        }
      }} />
  }
  return <output className="value read-only">null</output>
}

function StateValue({ path, value, live, onEdit }) {
  const [open, setOpen] = useState(false)
  if (value === null || typeof value !== 'object') {
    return <Value path={displayPath(path.join('.'))} value={value} disabled={live}
      onEdit={(next) => onEdit(path, next)} />
  }
  const array = Array.isArray(value)
  const keys = Object.keys(value)
  return <details onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{array ? `[${value.length}]` : `{${keys.length}}`}</summary>
    {open && <dl>{keys.map((key) => <div key={key}>
      <dt>{key}</dt><dd><StateValue path={[...path, key]} value={value[key]} live={live} onEdit={onEdit} /></dd>
    </div>)}</dl>}
  </details>
}

export function RuntimeState({ step, report, live, onEdit }) {
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
    {report && <p className="analysis-note"><span>{report.source === 'ai' ? 'AI 분석' : '로컬 분석'}</span>{annotation?.note || report.summary}</p>}
    {focused && step && (fields.length ? <div className="variables" key={step.id}>
      {fields.map(({ path, value }) => <div className="variable" key={path}>
        <code title={path}>{displayPath(path)}</code>
        {path.startsWith('@')
          ? <output className="value read-only" title={value}>{value}</output>
          : <StateValue path={Object.hasOwn(step.state, path) ? [path] : path.split('.')}
            value={value} live={live} onEdit={onEdit} />}
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
      <strong>스케치 상태 {live ? '(일시정지 후 편집)' : '(편집 가능)'}</strong>
      <dl>{state.map(([name, value]) => <div key={name}>
        <dt>{name}</dt><dd><StateValue path={[name]} value={value} live={live} onEdit={onEdit} /></dd>
      </div>)}</dl>
    </div>}
  </section>
}
