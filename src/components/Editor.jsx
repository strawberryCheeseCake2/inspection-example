import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import Prism from 'prismjs'
import { Icon } from './Icon.jsx'

export function Editor({ source, debugSource, setSource, file, line, dirty, run }) {
  const input = useRef(null)
  const body = useRef(null)
  const [composing, setComposing] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const visibleSource = showDebug ? debugSource || '// 별도 추적 코드 없음' : source
  const lines = visibleSource.split('\n').length
  const activeLine = !showDebug && !dirty && line > 0 && line <= lines ? line : null
  const highlighted = useMemo(() => Prism.highlight(visibleSource, Prism.languages.javascript, 'javascript'), [visibleSource])

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
  }, [activeLine, visibleSource, showDebug])

  return <section className="panel editor-panel" aria-label="p5.js 코드 에디터">
    <div className="panel-header">
      <div className="panel-title"><Icon name="code" /><h2>코드 에디터</h2></div>
      <div className="editor-actions">
        <button type="button" className="button run-button" aria-pressed={showDebug} onClick={() => setShowDebug(!showDebug)}>
          추적 코드
        </button>
        <button type="button" className="button run-button" onClick={run} disabled={!source.trim()}>
          <Icon name="run" size={14} />실행
        </button>
      </div>
    </div>
    <div className="editor-tab"><span className="js-mark">JS</span><span>{showDebug ? file.replace(/\.js$/, '.trace.js') : file}</span>
      {dirty && <span className="dirty-mark" title="실행 대기 중인 변경사항" />}
      <span className="editor-line">{showDebug ? '읽기 전용' : activeLine ? `LINE ${activeLine}` : 'p5.js'}</span>
    </div>
    <div ref={body} className={composing ? 'editor-body is-composing' : 'editor-body'}>
      <div className="gutter" aria-hidden="true">
        <div className="gutter-lines">
          {Array.from({ length: lines }, (_, i) => <div key={i} className={i + 1 === activeLine ? 'current-line' : ''}>{i + 1}</div>)}
        </div>
      </div>
      <pre className="source-highlight" aria-hidden="true">
        {activeLine && <span className="source-line-marker" style={{ '--line-index': activeLine - 1 }} />}
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
      <textarea key={showDebug ? 'trace' : 'sketch'} ref={input} className="source"
        aria-label={showDebug ? '추적 소스 코드' : 'p5.js 소스 코드'} spellCheck={false} readOnly={showDebug}
        autoCapitalize="off" autoComplete="off" wrap="off" value={visibleSource} maxLength={30000}
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
