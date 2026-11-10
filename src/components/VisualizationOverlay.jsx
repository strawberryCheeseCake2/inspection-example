import React, { useEffect, useRef, useState } from 'react'
import { overlayContext, overlayLabels, overlaySnapshot } from '../overlay.js'
import { overlayDocument } from '../overlayFrame.js'

export function VisualizationOverlay({ code, step, recorded, geometry, onStatus }) {
  const [marks, setMarks] = useState([])
  const [port, setPort] = useState(null)
  const frame = useRef(null)
  const request = useRef({ id: 0 })
  const { width, height, left, top, viewWidth, viewHeight } = geometry

  function connect() {
    const channel = new MessageChannel()
    frame.current.contentWindow.postMessage('connectOverlay', '*', [channel.port2])
    setPort(channel.port1)
  }

  useEffect(() => () => port?.close(), [port])

  useEffect(() => {
    if (!port) return
    port.onmessage = ({ data: { id, marks, error } }) => {
      if (id !== request.current.id) return
      const result = overlayLabels(marks, request.current.input)
      setMarks(result)
      onStatus({ step, code, message: error ?? (result.length ? '' : '이 스텝에서 표시할 변수 또는 위치를 확인할 수 없어요.') })
    }
  }, [port, onStatus, step, code])

  useEffect(() => {
    if (!port) return
    const input = {
      step: overlaySnapshot(step), context: overlayContext(recorded, step), width, height,
    }
    request.current = { id: request.current.id + 1, input }
    port.postMessage({ ...request.current, code })
  }, [port, code, step, recorded, width, height])

  const position = { left: left * 100 + '%', top: top * 100 + '%', width: viewWidth * 100 + '%', height: viewHeight * 100 + '%' }
  return <>
    <iframe hidden ref={frame} title="오버레이 계산 환경" sandbox="allow-scripts" srcDoc={overlayDocument} onLoad={connect} />
    {!!marks.length && <div className="canvas-overlay" style={position} aria-label="스케치 오버레이">
      {marks.map(({ x, y, labels }, index) => {
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
