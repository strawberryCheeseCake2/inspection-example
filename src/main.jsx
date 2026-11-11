import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor } from './components/Editor.jsx'
import { Icon } from './components/Icon.jsx'
import { Preview } from './components/Preview.jsx'
import { RuntimeState } from './components/RuntimeState.jsx'
import { sketches } from './sketches/index.js'
import { localPlan } from './trace.js'
import { hasDrawing, readHistory, replayForReport } from './historyRestore.js'
import { useInspector } from './useInspector.js'
import { overlayEvidence, overlaySite } from './overlay.js'
import './style.css'

const generatedSketch = { id: 'generated', file: 'generated-sketch.js', hint: '캔버스와 상호작용해 실행을 기록하세요.' }

async function request(task, body, signal) {
  const response = await fetch(`/api/${task}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}

function App() {
  const initial = sketches[0]
  const [source, setSource] = useState(initial.source)
  const [debugSource, setDebugSource] = useState(initial.debugSource)
  const [sketch, setSketch] = useState(initial)
  const [concern, setConcern] = useState(initial.concern)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [requestNotice, setRequestNotice] = useState('')
  const [overlay, setOverlay] = useState(null)
  const activeRequest = useRef(null)
  const historyFile = useRef(null)
  const inspector = useInspector(initial.source, initial.debugSource)
  const { recorded, step, run } = inspector

  useEffect(() => {
    fetch('/api/status').then((response) => response.json())
      .then((status) => setEnabled(Boolean(status.enabled))).catch(() => {})
    return () => activeRequest.current?.controller.abort()
  }, [])

  function cancelRequest() {
    activeRequest.current?.controller.abort()
    activeRequest.current = null
    setBusy('')
  }

  function cancelAiCall() {
    const pending = activeRequest.current
    if (!pending) return
    cancelRequest()
    if (pending.resumeOnCancel) inspector.toggleLive()
    setRequestNotice('AI 요청을 취소했어요.')
  }

  function restart(code, debugCode, replay) {
    cancelRequest()
    setError('')
    setRequestNotice('')
    try {
      inspector.restart(code, debugCode, replay)
      setOverlay(null)
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  async function restoreHistory(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const saved = readHistory(JSON.parse(await file.text()))
      if (!restart(saved.source, saved.debugSource, saved.replay)) return
      setSketch(generatedSketch)
      setSource(saved.source)
      setDebugSource(saved.debugSource)
      setConcern(saved.concern)
      const notice = saved.replay ? '스케치와 저장된 실행 스텝을 복구했어요.'
        : saved.task === 'analyze' ? '스케치 코드를 복구했어요. 이 기록에는 재생용 상태가 없어요.'
          : '기록의 스케치 코드를 복구하고 처음부터 실행했어요.'
      setRequestNotice(notice)
    } catch (err) {
      setRequestNotice('')
      setError(err instanceof SyntaxError ? 'AI 기록 JSON을 읽을 수 없어요.' : err.message)
    }
  }

  function changeSource(code) {
    if (busy === 'edit') cancelRequest()
    setRequestNotice('')
    setSource(code)
  }

  function chooseExample(id) {
    const example = sketches.find((item) => item.id === id)
    if (!example) return
    setSketch(example)
    setSource(example.source)
    setDebugSource(example.debugSource)
    setConcern(example.concern)
    restart(example.source, example.debugSource)
  }

  async function perform(task) {
    const prompt = (task === 'overlay' ? inspector.report?.concern ?? concern : concern).trim()
    if (!prompt || activeRequest.current || (task === 'edit' && !source.trim())) return
    setError('')
    setRequestNotice('')
    if (task !== 'analyze' && !enabled) {
      setError('AI를 사용하려면 .env에 OPENAI_API_KEY를 입력하고 서버를 다시 시작하세요.')
      return
    }
    if (task === 'analyze') {
      if (!recorded.length) return
      if (recorded.at(-1).functionId !== undefined) {
        setError('이 기록은 함수 단위로 저장됐어요. 줄 단위로 분석하려면 초기화 후 재실행해 주세요.')
        return
      }
      setOverlay(null)
      inspector.seek(step ?? recorded.at(-1))
    }

    if (task === 'overlay' && !inspector.report?.steps.length) return

    const controller = new AbortController()
    const pending = { controller, resumeOnCancel: task === 'analyze' && inspector.live }
    activeRequest.current = pending
    setBusy(task)
    try {
      const body = { concern: prompt }
      if (task === 'edit') Object.assign(body, { source, debugSource })
      if (task === 'analyze') Object.assign(body, { source: run.source, debugSource: run.debugSource })
      if (task === 'overlay') {
        const evidence = await overlayEvidence(inspector.matches, inspector.report, step, inspector.overlayContextFor, controller.signal)
        if (!evidence.length) return
        Object.assign(body, { source: run.source, debugSource: run.debugSource, evidence })
      }
      const result = task === 'analyze' && !enabled ? localPlan(prompt, run.source)
        : await request(task, body, controller.signal)
      if (controller.signal.aborted) return
      if (task === 'generate') {
        setSketch(generatedSketch)
        setSource(result.source)
        setDebugSource(result.debugSource)
        restart(result.source, result.debugSource)
      } else if (task === 'edit') {
        setSource(result.source)
        setDebugSource(result.debugSource)
        const changed = result.source !== source || result.debugSource !== debugSource
        setRequestNotice(changed ? '코드를 수정했습니다. 실행을 눌러 확인하세요.' : '현재 코드에 변경 사항이 없습니다.')
      } else if (task === 'overlay') {
        setOverlay(result)
        if (!step || !result.bySite[overlaySite(step)]?.code) {
          const target = inspector.steps.findLast((candidate) => result.bySite[overlaySite(candidate)]?.code)
          if (target) inspector.seek(target)
        }
      } else {
        const selection = await inspector.analyze({ ...result, concern: prompt }, controller.signal)
        controller.signal.throwIfAborted()
        const { report, recorded: selected, historical } = selection
        inspector.applyReport(report, selected)
        if (historical) setRequestNotice('최근 사이클에 해당 실행이 없어 이전 사이클에서 찾은 스텝을 표시해요.')
        if (!enabled) return
        const replay = replayForReport(run.debugSource, selected, report)
        try {
          const drawingSteps = replay.steps.filter(({ canvasCursor }) => Number.isInteger(canvasCursor))
          let missingDrawing = false
          if (drawingSteps.length) {
            replay.drawings = await inspector.exportDrawing(drawingSteps, controller.signal) ?? []
            replay.steps = replay.steps.map((step) => {
              if (!Number.isInteger(step.canvasCursor) || hasDrawing(replay.drawings, step.canvasCursor)) return step
              missingDrawing = true
              return { ...step, canvasCursor: null }
            })
          }
          controller.signal.throwIfAborted()
          await request('analyze/replay', { historyRef: result.historyRef, replay }, controller.signal)
          if (missingDrawing) setRequestNotice('스텝은 저장했지만 일부 화면의 캔버스 명령이 남아 있지 않아요.')
        } catch {
          if (!controller.signal.aborted) setRequestNotice('분석은 완료됐지만 재생 기록을 저장하지 못했어요.')
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message || '요청을 완료하지 못했습니다.')
    } finally {
      if (activeRequest.current === pending) {
        activeRequest.current = null
        setBusy('')
      }
    }
  }

  return <>
    <header className="topbar">
      <div className="top-inner">
        <div className="brand"><span className="brand-icon"><Icon name="logo" size={21} /></span>TRACE STUDIO</div>
        <span className="top-caption">P5.JS EXECUTION INSPECTOR</span>
        <span className="api-status"><i className={enabled ? 'connected' : ''} />{enabled ? 'GPT-6.1 SOL' : 'LOCAL MODE'}</span>
      </div>
    </header>
    <main>
      <div className="page-title">
        <div>
          <h1>스케치 실행 인스펙터<span>.</span></h1>
          <p>p5.js 코드를 실행하고, 기록된 스텝과 변수를 탐색하세요.</p>
        </div>
        <label className="example-picker">
          <span>예제</span>
          <select value={sketch.id} onChange={(e) => chooseExample(e.target.value)} aria-label="예제 스케치">
            {sketch.id === 'generated' && <option value="generated">생성한 스케치</option>}
            {sketches.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
          </select>
        </label>
      </div>
      <form className="concern panel" onSubmit={(e) => { e.preventDefault(); perform('analyze') }}>
        <div className="prompt-area">
          <label htmlFor="concern"><Icon name="spark" size={15} />요청</label>
          <textarea id="concern" value={concern} maxLength={2000} rows={2} onChange={(e) => setConcern(e.target.value)}
            placeholder="만들거나 수정하거나 디버깅하고 싶은 동작을 적어 주세요." />
        </div>
        <div className="prompt-actions">
          <button type="button" className="button" onClick={() => perform('generate')} disabled={!!busy || !concern.trim()}>
            {busy === 'generate' ? '생성 중…' : '초기 코드 생성'}
          </button>
          <button type="button" className="button" onClick={() => perform('edit')} disabled={!!busy || !concern.trim() || !source.trim()}>
            {busy === 'edit' ? '수정 중…' : '코드 수정'}
          </button>
          <button type="submit" className="button primary" disabled={!!busy || !concern.trim() || !recorded.length}>
            <Icon name="spark" size={15} />{busy === 'analyze' ? '분석 중…' : '디버깅 스텝 생성'}
          </button>
          {busy && <button type="button" className="button" onClick={cancelAiCall}>AI 요청 취소</button>}
          <button type="button" className="button" onClick={() => historyFile.current.click()}>AI 기록 복구</button>
          <input ref={historyFile} type="file" accept=".json,application/json" hidden onChange={restoreHistory} />
        </div>
        {error && <p className="request-error" role="alert">{error}</p>}
        {inspector.traceError && <p className="request-error" role="alert">{inspector.traceError}</p>}
        {requestNotice && <p className="request-notice" role="status">{requestNotice}</p>}
      </form>
      <div className="workspace">
        <Editor source={source} debugSource={debugSource} setSource={changeSource} file={sketch.file}
          line={inspector.live ? null : step?.line} endLine={step?.endLine}
          dirty={source !== run.source || debugSource !== run.debugSource}
          run={() => restart(source, debugSource)} />
        <div className="inspection" inert={busy === 'analyze' || busy === 'overlay' ? true : undefined}>
          <Preview {...inspector} overlay={overlay} overlayBusy={busy === 'overlay'} busy={Boolean(busy)}
            onGenerateOverlay={() => perform('overlay')} onCloseOverlay={() => setOverlay(null)}
            onReset={() => restart(run.source, run.debugSource)} />
          <p className="canvas-hint">{sketch.hint}</p>
          <RuntimeState step={step} report={inspector.report} />
        </div>
      </div>
    </main>
  </>
}

createRoot(document.getElementById('root')).render(<App />)
