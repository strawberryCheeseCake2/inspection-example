import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Prism from 'prismjs'
import { Icon } from './Icon.jsx'

const executionViews = {
  runtime: 'iframe 실행 코드',
  executable: '컴파일된 스케치와 추적 코드',
  library: 'p5.js 라이브러리 원문',
}

export function Editor({ source, execution, setSource, file, line, endLine, dirty, run }) {
  const input = useRef(null)
  const body = useRef(null)
  const [composing, setComposing] = useState(false)
  const [showExecution, setShowExecution] = useState(false)
  const [view, setView] = useState('runtime')
  const [library, setLibrary] = useState(null)
  const libraryUrl = execution.library
  const loaded = library?.url === libraryUrl ? library : null
  const visibleSource = !showExecution ? source : view === 'library' ? loaded?.text ?? '' : execution[view]
  const plain = showExecution && (view === 'library' || visibleSource.length > 150000)
  const lines = plain ? 0 : visibleSource.split('\n').length
  const activeLine = !showExecution && !dirty && line > 0 && line <= lines ? line : null
  const activeEnd = activeLine && Math.min(lines, endLine ?? activeLine)
  const highlighted = useMemo(() => plain ? '' : Prism.highlight(visibleSource, Prism.languages.javascript, 'javascript'),
    [visibleSource, plain])

  useEffect(() => {
    if (!showExecution || view !== 'library' || loaded?.text !== undefined) return
    const controller = new AbortController()
    fetch(libraryUrl, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error('Library source unavailable')
      return response.text()
    }).then((text) => setLibrary({ url: libraryUrl, text })).catch(() => {
      if (!controller.signal.aborted) setLibrary({ url: libraryUrl, error: true })
    })
    return () => controller.abort()
  }, [showExecution, view, libraryUrl, loaded?.text])

  function syncScroll() {
    const { scrollTop, scrollLeft } = input.current
    body.current.style.setProperty('--editor-scroll-y', `${-scrollTop}px`)
    body.current.style.setProperty('--editor-scroll-x', `${-scrollLeft}px`)
  }

  useLayoutEffect(() => {
    const editor = input.current
    if (activeLine) {
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight)
      const top = (activeLine - 1) * lineHeight
      if (top < editor.scrollTop || top + lineHeight * 2 > editor.scrollTop + editor.clientHeight) {
        editor.scrollTop = Math.max(0, top - editor.clientHeight / 3)
      }
    }
    syncScroll()
  }, [activeLine, visibleSource, showExecution, view])

  return <section className="panel editor-panel" aria-label="p5.js 코드 에디터">
    <div className="panel-header">
      <div className="panel-title"><Icon name="code" /><h2>코드 에디터</h2></div>
      <div className="editor-actions">
        <button type="button" className="button run-button" aria-pressed={showExecution} onClick={() => setShowExecution(!showExecution)}>
          전체 실행 코드
        </button>
        <button type="button" className="button run-button" onClick={run} disabled={!source.trim()}>
          <Icon name="run" size={14} />실행
        </button>
      </div>
    </div>
    <div className="editor-tab"><span className="js-mark">JS</span>
      {showExecution ? <select aria-label="실행 코드 종류" value={view} onChange={(event) => setView(event.target.value)}>
        {Object.entries(executionViews).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
      </select> : <span>{file}</span>}
      {dirty && !showExecution && <span className="dirty-mark" title="실행 대기 중인 변경사항" />}
      {showExecution && view === 'library' && !loaded?.text && <span role="status">
        {loaded?.error ? '라이브러리 코드를 불러올 수 없어요.' : '불러오는 중…'}
      </span>}
      <span className="editor-line">{showExecution ? '실행 중인 버전 · 읽기 전용' : activeLine
        ? activeEnd > activeLine ? `LINES ${activeLine}–${activeEnd}` : `LINE ${activeLine}` : 'p5.js'}</span>
    </div>
    <div ref={body} className={composing ? 'editor-body is-composing' : 'editor-body'}>
      {!plain && <div className="gutter" aria-hidden="true">
        <div className="gutter-lines">
          {Array.from({ length: lines }, (_, i) => <div key={i}
            className={activeLine && i + 1 >= activeLine && i + 1 <= activeEnd ? 'current-line' : ''}>{i + 1}</div>)}
        </div>
      </div>}
      {!plain && <pre className="source-highlight" aria-hidden="true">
        {activeLine && <span className="source-line-marker"
          style={{ '--line-index': activeLine - 1, '--line-count': activeEnd - activeLine + 1 }} />}
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>}
      <textarea key={showExecution ? view : 'sketch'} ref={input} className={plain ? 'source is-plain' : 'source'}
        aria-label={showExecution ? executionViews[view] : 'p5.js 소스 코드'} spellCheck={false} readOnly={showExecution}
        autoCapitalize="off" autoComplete="off" wrap="off" value={visibleSource} maxLength={showExecution ? undefined : 30000}
        onChange={(e) => setSource(e.target.value)}
        onScroll={syncScroll}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={(e) => {
          if (!e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            if (source.trim()) run()
          }
        }} />
    </div>
  </section>
}
