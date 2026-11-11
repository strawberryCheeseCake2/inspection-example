import React, { useState } from 'react'
import { Icon } from './Icon.jsx'
import { VisualizationOverlay } from './VisualizationOverlay.jsx'
import { overlaySite } from '../overlay.js'

export function Preview({ frame, run, ready, live, step, steps, overlayContextFor, report, seek, toggleLive, showAll, onReset,
  overlay, overlayBusy, busy, onGenerateOverlay, onCloseOverlay, canvasGeometry }) {
  const [overlayStatus, setOverlayStatus] = useState(null)
  const [showLabels, setShowLabels] = useState(true)
  const [accumulation, setAccumulation] = useState(null)
  const index = steps.findIndex(({ id }) => id === step?.id)
  const cycle = report?.cycles.indexOf(step?.cycle) ?? -1
  const annotation = report?.steps.find(({ id }) => id === step?.id)
  const sitePlan = annotation && overlay?.bySite?.[overlaySite(step)]
  const code = sitePlan?.code
  const accumulate = accumulation && accumulation.overlay === overlay ? accumulation.checked : Boolean(sitePlan?.accumulate)

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
      {ready && code && canvasGeometry && <VisualizationOverlay key={step.id} step={step} loadContext={overlayContextFor} code={code}
        accumulate={accumulate} showLabels={showLabels} geometry={canvasGeometry} onStatus={setOverlayStatus} />}
    </div>
    <div className="timeline">
      <div className="timeline-top">
        <div className="step-label">
          <span className="step-number">{step ? `#${String(step.id).padStart(3, '0')}` : '#–––'}</span>
          <strong title={step?.label}>{step?.label ?? (report ? '관련 실행 기록 없음' : '실행 기록 대기 중')}</strong>
        </div>
        <span className="trace-count" aria-live="polite">
          {cycle >= 0 && report.cycles.length > 1 && `사이클 ${cycle + 1}/${report.cycles.length} · `}
          {`${steps.length} STEPS`}{report && <> <button type="button" onClick={showAll}>최근 기록</button></>}
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
        {annotation && !overlay && <button className="button" type="button" disabled={busy || !ready}
          onClick={onGenerateOverlay}>{overlayBusy ? '오버레이 생성 중…' : '시각화 오버레이 생성'}</button>}
        {annotation && overlay && <button className="button" type="button" onClick={onCloseOverlay}>오버레이 닫기</button>}
      </div>
      {code && <div className="overlay-options">
        <label><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} />변수 라벨</label>
        <label title="선택한 스텝까지 같은 사이클의 같은 코드 위치에서 나온 가이드를 함께 표시">
          <input type="checkbox" checked={accumulate}
          onChange={(event) => setAccumulation({ overlay, checked: event.target.checked })} />같은 사이클의 가이드 누적</label>
      </div>}
      {annotation && overlay && !code && <p className="overlay-note">{sitePlan?.skipReason || '이 스텝의 기록으로 표시할 오버레이가 없어요.'}</p>}
      {code && !canvasGeometry && <p className="overlay-note">이 스텝의 캔버스 위치를 확인할 수 없어요.</p>}
      {code && overlayStatus?.step === step && overlayStatus.code === code &&
        overlayStatus.accumulate === accumulate && overlayStatus.message &&
        <p className="overlay-note" role="status">{overlayStatus.message}</p>}
    </div>
  </section>
}
