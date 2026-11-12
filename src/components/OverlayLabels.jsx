import React, { useLayoutEffect, useRef, useState } from 'react'
import { labelEdge, packOverlayLabels, placeOverlayLabels } from '../overlayLayout.js'

function nameColor(color) {
  if (!color?.startsWith('#')) return color
  const channels = color.slice(1).match(/../g).map((hex) => {
    const srgb = parseInt(hex, 16) / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  const [red, green, blue] = channels
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue >= 0.29 ? color : undefined
}

export function OverlayLabels({ marks, colors, width, height }) {
  const layer = useRef(null)
  const [lines, setLines] = useState([])

  useLayoutEffect(() => {
    const element = layer.current
    function layout() {
      const viewWidth = element.clientWidth
      const viewHeight = element.clientHeight
      if (!viewWidth || !viewHeight) return
      const nodes = [...element.querySelectorAll('.canvas-overlay-values')]
      for (const node of nodes) {
        node.style.maxWidth = ''
        node.style.maxHeight = ''
        delete node.dataset.scrollable
        node.removeAttribute('tabindex')
      }
      const labels = marks.map(({ x, y }, index) => ({
        anchor: { x: x / width * viewWidth, y: y / height * viewHeight },
        width: Math.ceil(nodes[index].getBoundingClientRect().width),
        height: Math.ceil(nodes[index].getBoundingClientRect().height),
      }))
      const nearby = placeOverlayLabels(labels, viewWidth, viewHeight)
      const boxes = nearby ?? packOverlayLabels(labels, viewWidth, viewHeight)
      for (const [index, box] of boxes.entries()) {
        const node = nodes[index]
        node.style.left = `${box.x}px`
        node.style.top = `${box.y}px`
        if (!nearby) {
          node.style.maxWidth = `${box.width}px`
          node.style.maxHeight = `${box.height}px`
          node.dataset.scrollable = ''
          if (node.scrollHeight > node.clientHeight) node.tabIndex = 0
        }
      }
      setLines(boxes.map((box, index) => {
        const { anchor } = labels[index]
        const { width, height } = nodes[index].getBoundingClientRect()
        const [x, y] = labelEdge(anchor, { ...box, width, height })
        return { x1: anchor.x, y1: anchor.y, x2: x, y2: y }
      }))
    }
    layout()
    const observer = new ResizeObserver(layout)
    observer.observe(element)
    return () => observer.disconnect()
  }, [marks, width, height])

  return <div className="overlay-label-layer" ref={layer}>
    <svg className="overlay-guides" aria-hidden="true">
      {lines.map((line, index) => <line key={index} className="overlay-label-leader" {...line} />)}
    </svg>
    {marks.map(({ labels }, index) => <div key={index} className="canvas-overlay-values">
      {labels.map(({ key, name, value }) => {
        const color = colors.get(key)
        return <div className="overlay-label-field" key={JSON.stringify([key, value])}>
          {color && <span className="overlay-label-swatch" style={{ backgroundColor: color }} aria-hidden="true" />}
          <span><span style={{ color: nameColor(color) }}>{name}</span>{`: ${value}`}</span>
        </div>
      })}
    </div>)}
  </div>
}
