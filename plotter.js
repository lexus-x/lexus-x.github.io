// Writes the name the way a pen plotter would: row by row, with a two-link arm holding the pen.
import { drawArm, themeColors } from './arm.mjs'

const NAME = 'Lalith Sai'
const WRITE_MS = 2800
const LIFT_MS = 500 // the arm fades away after the last row
const TRAVEL = 0.3 // pen-up moves take less time than drawing

// Runs of ink along evenly spaced rows of an RGBA mask. Every other row runs backwards, so the pen never jumps back across the name.
export function hatch(rgba, width, height, gap) {
  const rows = []
  let backwards = false
  for (let y = gap / 2; y < height; y += gap) {
    const offset = Math.floor(y) * width
    const runs = []
    let start = -1
    for (let x = 0; x <= width; x++) {
      const ink = x < width && rgba[(offset + x) * 4 + 3] > 110
      if (ink && start < 0) start = x
      if (!ink && start >= 0) {
        runs.push([start, x - 1])
        start = -1
      }
    }
    if (!runs.length) continue
    if (backwards) runs.reverse().forEach(run => run.reverse())
    for (const [x0, x1] of runs) rows.push({ x0, x1, y })
    backwards = !backwards
  }
  return rows
}

const ease = t => (t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2)

function line(g, x0, y, x1) {
  g.beginPath()
  g.moveTo(x0, y)
  g.lineTo(x1, y)
  g.stroke()
}

export function startPlotter(canvas, onWritten) {
  const box = canvas.parentElement
  const g = canvas.getContext('2d')
  let w = 0
  let h = 0
  let colors
  let rows = []
  let total = 0
  let inked = 0
  let ink = null
  let inkG = null
  let gap = 3
  let frame = 0
  let written = true
  let start = -Infinity // the drawing rests finished until play()

  function build() {
    w = box.clientWidth
    h = box.clientHeight
    if (!w || !h) return
    const density = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * density)
    canvas.height = Math.round(h * density)
    g.setTransform(density, 0, 0, density, 0, 0)
    colors = themeColors()

    const mask = document.createElement('canvas')
    mask.width = Math.ceil(w)
    mask.height = Math.ceil(h * 0.62)
    const m = mask.getContext('2d', { willReadFrequently: true })
    m.font = `400 100px ${colors.serif}`
    const size = Math.min((100 * w * 0.84) / m.measureText(NAME).width, h * 0.3)
    m.font = `400 ${size}px ${colors.serif}`
    m.textAlign = 'center'
    m.textBaseline = 'middle'
    m.fillText(NAME, mask.width / 2, h * 0.36)
    gap = Math.max(2, size / 20)
    rows = hatch(m.getImageData(0, 0, mask.width, mask.height).data, mask.width, mask.height, gap)

    total = 0
    let px = rows[0]?.x0 ?? 0
    let py = rows[0]?.y ?? 0
    for (const row of rows) {
      Object.assign(row, { from: total, px, py, start: total + Math.hypot(row.x0 - px, row.y - py) * TRAVEL, length: Math.abs(row.x1 - row.x0) + 0.5 })
      total = row.start + row.length
      px = row.x1
      py = row.y
    }

    ink = document.createElement('canvas')
    ink.width = canvas.width
    ink.height = canvas.height
    inkG = ink.getContext('2d')
    inkG.setTransform(density, 0, 0, density, 0, 0)
    inkG.strokeStyle = colors.ink
    inkG.lineWidth = gap * 0.7
    inkG.lineCap = 'round'
    inked = 0
    draw(performance.now())
  }

  // paints one moment of the drawing and says whether there is more to show
  function draw(now) {
    const k = Math.min(1, (now - start) / WRITE_MS)
    const length = ease(k) * total
    while (inked < rows.length && rows[inked].start + rows[inked].length <= length) {
      const row = rows[inked++]
      line(inkG, row.x0, row.y, row.x1)
    }
    g.clearRect(0, 0, w, h)
    g.drawImage(ink, 0, 0, w, h)
    if (!rows.length) return false

    let pen = [rows.at(-1).x1, rows.at(-1).y]
    const row = rows[inked]
    if (row && length < row.start) {
      const f = (length - row.from) / Math.max(1, row.start - row.from)
      pen = [row.px + (row.x0 - row.px) * f, row.py + (row.y - row.py) * f]
    } else if (row) {
      pen = [row.x0 + ((row.x1 - row.x0) * (length - row.start)) / row.length, row.y]
      g.strokeStyle = colors.ink
      g.lineWidth = gap * 0.7
      g.lineCap = 'round'
      line(g, row.x0, row.y, pen[0])
    }
    if (k === 1 && !written) {
      written = true
      onWritten?.()
    }

    const shown = k < 1 ? 1 : 1 - (now - start - WRITE_MS) / LIFT_MS
    if (shown <= 0) return false
    const span = Math.max(h, w * 0.75)
    g.globalAlpha = shown
    drawArm(g, colors, w / 2, h + 6, pen[0], pen[1], span * 0.56, span * 0.5)
    g.globalAlpha = 1
    return true
  }

  function tick(now) {
    frame = draw(now) ? requestAnimationFrame(tick) : 0
  }

  new ResizeObserver(build).observe(box)

  return {
    restyle: build,
    play() {
      start = performance.now()
      written = false
      inked = 0
      inkG?.clearRect(0, 0, w, h)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(tick)
    },
  }
}
