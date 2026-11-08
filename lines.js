// The name rises out of stacked signal lines, the way a pulsar's pulses stack on the Unknown Pleasures cover.
const FONT = '"Archivo Black", "Arial Black", sans-serif'
const STEP = 3 // the mask is a third of the canvas size; sampling between its pixels rounds the letters into hills
const INTRO_MS = 1700

const ease = t => 1 - (1 - t) ** 3
const clamp = t => Math.min(1, Math.max(0, t))

export function startLines(canvas) {
  const box = canvas.parentElement
  const g = canvas.getContext('2d')
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  let w = 0
  let h = 0
  let mw = 0
  let mh = 0
  let mask = null
  let top = 0
  let bottom = 0
  let look = null
  let start = -Infinity // rests finished until play()
  let frame = 0

  function build() {
    w = box.clientWidth
    h = box.clientHeight
    if (!w || !h) return
    const density = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * density)
    canvas.height = Math.round(h * density)
    g.setTransform(density, 0, 0, density, 0, 0)
    const css = getComputedStyle(box)
    const v = name => css.getPropertyValue(name).trim()
    look = { ground: css.backgroundColor, line: v('--soft'), letters: v('--letters').split(/\s+/) }

    // the lines fill the space between the corner pill and the text, so neither ever sits on them
    const corner = box.querySelector('.corner')
    const text = box.querySelector('.hero-text')
    top = corner ? corner.offsetTop + corner.offsetHeight + 10 : h * 0.1
    bottom = text ? text.offsetTop - 16 : h * 0.9
    const words = { upper: 'LALITH SAI', lower: 'lalith sai' }[v('--name-case')] ?? 'Lalith Sai'
    const rows = w < h ? words.split(' ') : [words] // two rows on a phone, so every letter crosses enough lines to read
    mw = Math.ceil(w / STEP)
    mh = Math.ceil(h / STEP)
    const m = document.createElement('canvas')
    m.width = mw
    m.height = mh
    const c = m.getContext('2d', { willReadFrequently: true })
    c.font = `400 100px ${FONT}`
    const widest = Math.max(...rows.map(row => c.measureText(row).width))
    const size = Math.min((100 * mw * 0.84) / widest, ((bottom - top) / STEP) * (rows.length > 1 ? 0.36 : 0.5))
    c.font = `400 ${size}px ${FONT}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    rows.forEach((row, i) => c.fillText(row, mw / 2, (top + bottom) / 2 / STEP + (i - (rows.length - 1) / 2) * size * 0.98))
    const px = c.getImageData(0, 0, mw, mh).data
    mask = new Float32Array(mw * mh)
    for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4 + 3] / 255
    draw(performance.now())
  }

  function sample(x, y) {
    const mx = Math.min(mw - 1.001, Math.max(0, x / STEP))
    const my = Math.min(mh - 1.001, Math.max(0, y / STEP))
    const x0 = mx | 0
    const y0 = my | 0
    const fx = mx - x0
    const fy = my - y0
    const i = y0 * mw + x0
    return (mask[i] * (1 - fx) + mask[i + 1] * fx) * (1 - fy) + (mask[i + mw] * (1 - fx) + mask[i + mw + 1] * fx) * fy
  }

  // paints one moment and says whether there is more to show
  function draw(now) {
    if (!mask) return false
    const t = calm ? Infinity : now - start
    const time = calm ? 0 : now
    const gap = Math.max(3.5, h / 120)
    const amp = gap * 1.7
    const count = Math.floor((bottom - top) / gap)
    const x0 = w * 0.07
    const x1 = w * 0.93
    const rise = ease(clamp((t - 300) / (INTRO_MS - 300)))
    let ink = look.letters[0]
    if (look.letters.length > 1) {
      ink = g.createLinearGradient(x0, 0, x1, 0)
      look.letters.forEach((color, i) => ink.addColorStop(i / (look.letters.length - 1), color))
    }

    g.fillStyle = look.ground
    g.fillRect(0, 0, w, h)
    g.lineCap = 'round'
    for (let i = 0; i < count; i++) {
      const shown = clamp((t - i * 10) / 500)
      if (!shown) break
      const y = top + i * gap
      const points = []
      for (let x = x0; x <= x1 + 0.1; x += 4) {
        const v = sample(x, y)
        const taper = Math.exp(-(((x - w / 2) / (w * 0.3)) ** 2))
        const pulse = Math.max(0, Math.sin(x * 0.031 + i * 0.9 + time * 0.0011) * 0.6 + Math.sin(x * 0.083 - i * 1.7 + time * 0.0017) * 0.4)
        points.push([x, y - (amp * v * rise + pulse * pulse * 16 * taper * (1 - v)) * shown, v])
      }
      // each line hides the ones behind it, so the hills read as solid
      g.beginPath()
      points.forEach(([x, py], j) => (j ? g.lineTo(x, py) : g.moveTo(x, py)))
      g.lineTo(x1, h)
      g.lineTo(x0, h)
      g.closePath()
      g.fillStyle = look.ground
      g.fill()
      g.beginPath()
      points.forEach(([x, py], j) => (j ? g.lineTo(x, py) : g.moveTo(x, py)))
      g.strokeStyle = look.line
      g.lineWidth = 0.8
      g.stroke()
      // where a line crosses the name it turns thick and takes the album's colour
      g.beginPath()
      for (let j = 1; j < points.length; j++) {
        if (points[j][2] > 0.45 && points[j - 1][2] > 0.45) {
          g.moveTo(points[j - 1][0], points[j - 1][1])
          g.lineTo(points[j][0], points[j][1])
        }
      }
      g.strokeStyle = ink
      g.lineWidth = Math.min(2.4, gap * 0.6)
      g.stroke()
    }
    return !calm
  }

  function tick(now) {
    if (!box.closest('[inert]')) draw(now) // a panel covers the page, so nothing to repaint
    frame = requestAnimationFrame(tick)
  }

  const observer = new ResizeObserver(build)
  observer.observe(box)

  return {
    restyle: build,
    play() {
      start = performance.now()
      if (calm) draw(start)
      else if (!frame) frame = requestAnimationFrame(tick)
    },
    stop() {
      cancelAnimationFrame(frame)
      frame = 0
      observer.disconnect()
    },
  }
}
