const GAP = 5
const ANCHOR_GAP = 8

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

function overlaps(a, b) {
  return a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x
    && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y
}

export function labelEdge(anchor, box) {
  return [clamp(anchor.x, box.x, box.x + box.width), clamp(anchor.y, box.y, box.y + box.height)]
}

export function placeOverlayLabels(labels, width, height) {
  const placed = []
  for (const { anchor, width: w, height: h } of labels) {
    const minX = GAP
    const minY = GAP
    const maxX = width - w - GAP
    const maxY = height - h - GAP
    if (maxX < minX || maxY < minY) return null
    const xs = [anchor.x + ANCHOR_GAP, anchor.x - w - ANCHOR_GAP, anchor.x - w / 2, minX, maxX]
    const ys = [anchor.y - h / 2, anchor.y - h - ANCHOR_GAP, anchor.y + ANCHOR_GAP, minY, maxY]
    for (const box of placed) {
      xs.push(box.x - w - GAP, box.x + box.width + GAP)
      ys.push(box.y - h - GAP, box.y + box.height + GAP)
    }
    let nearest
    let best = Infinity
    for (const left of xs) {
      for (const top of ys) {
        const box = { x: clamp(left, minX, maxX), y: clamp(top, minY, maxY), width: w, height: h }
        if (placed.some((other) => overlaps(box, other))) continue
        const [x, y] = labelEdge(anchor, box)
        const distance = Math.hypot(anchor.x - x, anchor.y - y)
        if (distance < ANCHOR_GAP - 0.01 || distance >= best) continue
        nearest = box
        best = distance
      }
    }
    if (!nearest) return null
    placed.push(nearest)
  }
  return placed
}

export function packOverlayLabels(labels, width, height) {
  const columns = Math.min(labels.length, width >= 180 ? 2 : 1)
  const rows = Math.ceil(labels.length / columns)
  const gap = Math.min(GAP, width / (columns + 1) / 2, height / (rows + 1) / 2)
  const cellWidth = (width - gap * (columns + 1)) / columns
  const cellHeight = (height - gap * (rows + 1)) / rows
  const sorted = labels.map(({ anchor }, index) => ({ anchor, index }))
    .sort((a, b) => a.anchor.y - b.anchor.y)
  const boxes = []
  for (let row = 0; row < rows; row++) {
    const entries = sorted.slice(row * columns, (row + 1) * columns)
      .sort((a, b) => a.anchor.x - b.anchor.x)
    entries.forEach(({ index }, column) => {
      boxes[index] = {
        x: gap + column * (cellWidth + gap),
        y: gap + row * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight,
      }
    })
  }
  return boxes
}
