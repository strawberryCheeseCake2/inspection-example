import React from 'react'
import { Icon } from './Icon.jsx'

export function Preview({ frame, run, ready, live, step, steps, report, seek, toggleLive, showAll, onReset }) {
  const index = steps.findIndex(({ id }) => id === step?.id)

  return <section className="panel preview-panel" aria-label="스케치 및 실행 스텝">
    <div className="panel-header">
      <div className="panel-title"><Icon name="eye" /><h2>스케치</h2></div>
      <div className="preview-actions">
        <button type="button" className="button run-button" onClick={onReset}>초기화 후 재실행</button>
        <span className={`live-status ${live && ready ? 'is-live' : ''}`}>
          <span />{!ready ? 'STARTING' : live ? 'LIVE' : 'PAUSED'}
        </span>
      </div>
    </div>
    <div className="canvas-shell">
      <iframe key={run.id} ref={frame} sandbox="allow-scripts" title="p5.js 스케치 캔버스" srcDoc={run.document} />
    </div>
    <div className="timeline">
      <div className="timeline-top">
        <div className="step-label">
          <span className="step-number">{step ? `#${String(step.id).padStart(3, '0')}` : '#–––'}</span>
          <strong title={step?.label}>{step?.label ?? (report ? '선택한 줄의 실행 기록 없음' : '실행 기록 대기 중')}</strong>
        </div>
        <span className="trace-count" aria-live="polite">
          {`${steps.length} STEPS`}{report && <> <button type="button" onClick={showAll}>전체 기록</button></>}
        </span>
      </div>
      <div className="timeline-controls">
        <button className="button icon-button" type="button" onClick={toggleLive} disabled={(live && !step) || !ready}
          title={live ? '일시정지' : '라이브 재개'} aria-label={live ? '일시정지' : '라이브 재개'}>
          <Icon name={live ? 'pause' : 'run'} size={15} />
        </button>
        <button className="button icon-button" type="button" onClick={() => seek(steps[index - 1])}
          disabled={index < 1} title="이전 스텝" aria-label="이전 스텝"><Icon name="left" size={15} /></button>
        <input type="range" aria-label="실행 스텝" min={0} max={Math.max(0, steps.length - 1)}
          value={Math.max(0, index)} disabled={steps.length < 2}
          onChange={(e) => seek(steps[e.target.valueAsNumber])} />
        <button className="button icon-button" type="button" onClick={() => seek(steps[index + 1])}
          disabled={index < 0 || index >= steps.length - 1} title="다음 스텝" aria-label="다음 스텝"><Icon name="right" size={15} /></button>
      </div>
    </div>
  </section>
}
