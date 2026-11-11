import React, { useEffect, useRef, useState } from 'react'
import { overlayContext, overlayLabels, overlayOccurrences, overlaySnapshot } from '../overlay.js'
import { overlayDocument } from '../overlayFrame.js'

const MAX_EARLIER_GUIDES = 1024

function Guide({ type, points, color }) {
  const [[x, y]] = points
  if (type === 'point') return <circle className="overlay-guide" cx={x} cy={y} r="3" stroke={color} />
  let path = `M ${points.map((point) => point.join(' ')).join(' L ')}`
  if (type === 'area' || type === 'outline') path += ' Z'
  if (type === 'dimension' || type === 'vector') {
    const [, [endX, endY]] = points
    const dx = endX - x
    const dy = endY - y
    const length = Math.hypot(dx, dy)
    const size = Math.min(7, length / 3)
    const nx = -dy / length * size
    const ny = dx / length * size
    if (type === 'dimension') {
      path += ` M ${x - nx} ${y - ny} L ${x + nx} ${y + ny} M ${endX - nx} ${endY - ny} L ${endX + nx} ${endY + ny}`
    } else {
      const backX = endX - dx / length * size
      const backY = endY - dy / length * size
      path += ` M ${backX - nx / 2} ${backY - ny / 2} L ${endX} ${endY} L ${backX + nx / 2} ${backY + ny / 2}`
    }
  }
  const fill = type === 'area' ? color ?? 'var(--overlay-area)' : 'none'
  return <>
    <path className="overlay-guide-halo" d={path} fill="none" />
    <path className="overlay-guide" d={path} fill={fill} stroke={type === 'area' ? undefined : color} />
  </>
}

export function VisualizationOverlay({ code, accumulate, showLabels, step, loadContext, geometry, onStatus }) {
  const [marks, setMarks] = useState([])
  const [earlierGuides, setEarlierGuides] = useState([])
  const [port, setPort] = useState(null)
  const frame = useRef(null)
  const requestId = useRef(0)
  const { width, height, left, top, viewWidth, viewHeight } = geometry

  function connect() {
    const channel = new MessageChannel()
    frame.current.contentWindow.postMessage('connectOverlay', '*', [channel.port2])
    setPort(channel.port1)
  }

  useEffect(() => () => port?.close(), [port])

  useEffect(() => {
    if (!port) return
    const controller = new AbortController()
    let recorded
    let targets
    const selected = overlaySnapshot(step)
    const seen = new Set()
    const earlier = []
    let current = []
    let inputs = []
    let offset = 0
    let activeId
    let failure

    function finish(message) {
      setEarlierGuides(earlier.reverse())
      onStatus({ step, code, accumulate, message })
    }

    function next() {
      if (earlier.length === MAX_EARLIER_GUIDES) return finish('이전 가이드는 최근 1,024개까지 표시해요.')
      if (offset === targets.length) {
        const hasOutput = current.length || earlier.length
        return finish(hasOutput ? (failure ? '일부 가이드를 계산할 수 없어요.' : '')
          : failure ?? '이 스텝에서 표시할 변수 또는 위치를 확인할 수 없어요.')
      }
      // Publish the selected step first, then evaluate earlier occurrences in bounded batches.
      inputs = targets.slice(offset, offset === 0 ? 1 : offset + 24).map((target) => ({
        step: target === step ? selected : overlaySnapshot(target),
        selected,
        context: overlayContext(recorded, target), width, height,
      }))
      offset += inputs.length
      activeId = ++requestId.current
      port.postMessage({ id: activeId, code, inputs })
    }

    function receive({ data: { id, results, error } }) {
      if (id !== activeId) return
      if (error) return finish(error)
      for (const [index, result] of results.entries()) {
        failure ??= result.error
        const input = inputs[index]
        const resolved = overlayLabels(result.marks, input)
        const isSelected = input.step.id === step.id
        if (isSelected) {
          current = resolved
          setMarks(current)
        }
        for (const guide of resolved.flatMap((mark) => mark.guides)) {
          const key = JSON.stringify(guide)
          if (!isSelected && !seen.has(key)) earlier.push(guide)
          seen.add(key)
          if (earlier.length === MAX_EARLIER_GUIDES) break
        }
        if (earlier.length === MAX_EARLIER_GUIDES) break
      }
      next()
    }

    port.addEventListener('message', receive)
    port.start()
    loadContext(step, accumulate, controller.signal).then((rows) => {
      if (controller.signal.aborted) return
      recorded = rows
      targets = overlayOccurrences(recorded, step, accumulate, width, height)
      next()
    }).catch(() => {
      if (!controller.signal.aborted) finish('이 스텝의 실행 기록을 불러올 수 없어요.')
    })
    return () => {
      controller.abort()
      port.removeEventListener('message', receive)
    }
  }, [port, code, accumulate, step, loadContext, width, height, onStatus])

  const position = { left: left * 100 + '%', top: top * 100 + '%', width: viewWidth * 100 + '%', height: viewHeight * 100 + '%' }
  const guides = [...(accumulate ? earlierGuides : []), ...marks.flatMap((mark) => mark.guides)]
  return <>
    <iframe hidden ref={frame} title="오버레이 계산 환경" sandbox="allow-scripts" srcDoc={overlayDocument} onLoad={connect} />
    {!!(guides.length || (showLabels && marks.length)) && <div className="canvas-overlay" style={position} aria-label="스케치 오버레이">
      {!!guides.length && <svg className="overlay-guides" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {guides.map((guide, index) => <Guide key={index} {...guide} />)}
      </svg>}
      {showLabels && marks.map(({ x, y, labels }, index) => {
        const anchor = {
          ...(x <= width / 2 ? { left: `${x / width * 100}%` } : { right: `${(1 - x / width) * 100}%` }),
          ...(y <= height / 2 ? { top: `${y / height * 100}%` } : { bottom: `${(1 - y / height) * 100}%` }),
        }
        return <div className="canvas-overlay-values" key={index} style={anchor}>
          {labels.map((label) => <div key={label}>{label}</div>)}
        </div>
      })}
    </div>}
  </>
}
