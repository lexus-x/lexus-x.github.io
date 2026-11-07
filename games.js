// Two ideas from the research, as games. Neither runs the real model.
import { drawArm, themeColors } from './arm.mjs'
import { keepLargest } from './wavelet.mjs'

const ROUND_MS = 10000
const IDLE_MS = 2500 // with no input this long and no round running, the arm moves by itself so the game never looks dead
const TOUCH_LIFT = 56 // a finger hides what is under it, so on touch the arm aims just above
const HIT = 20
const KEEPS = [4, 8, 16, 128]

// what the arm is acting on now: the newest command at least `delay` old
export function delayed(commands, now, delay) {
  let seen = commands[0]
  for (const command of commands) {
    if (command.time > now - delay) break
    seen = command
  }
  return seen
}

function stage(host, html) {
  host.innerHTML = html
  const canvas = host.querySelector('canvas')
  const g = canvas.getContext('2d')
  const size = { w: 1, h: 1, fitted: null }
  const observer = new ResizeObserver(() => {
    const density = Math.min(devicePixelRatio || 1, 2)
    size.w = canvas.clientWidth
    size.h = canvas.clientHeight
    canvas.width = Math.round(size.w * density)
    canvas.height = Math.round(size.h * density)
    g.setTransform(density, 0, 0, density, 0, 0)
    size.fitted?.()
  })
  observer.observe(canvas)
  return { canvas, g, size, observer, colors: themeColors() }
}

/* Beat the delay: only the 6× ratio is measured, the delays themselves are chosen to be felt */

export function startDelay(host) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  const { canvas, g, size, observer, colors } = stage(host, `
    <div class="game-bar" role="group" aria-label="Action head">
      <button class="pill" type="button" data-delay="600" aria-pressed="true">slow head, 600 ms</button>
      <button class="pill" type="button" data-delay="100" aria-pressed="false">fast head, 100 ms</button>
    </div>
    <p class="score" aria-live="off"></p>
    <canvas tabindex="0" aria-label="Robot arm. Move the pointer or use the arrow keys to steer. Press Enter to start a round."></canvas>
    <p class="small">The arm follows you late; the dashed line is the delay. Tap to start a 10 s round, then touch the circles with the red tip. The delays are for feel: only the 6× ratio is measured.</p>
    <p class="sr" role="status"></p>`)
  const score = host.querySelector('.score')
  const status = host.querySelector('[role="status"]')
  const heads = [...host.querySelectorAll('[data-delay]')]
  const results = {}
  let delay = 600
  let commands = []
  let finger = null
  let lastInput = -Infinity
  let tips = []
  let target = null
  let round = null
  let flash = -Infinity
  let shown = ''
  let frame = 0

  const arm = () => ({ bx: size.w / 2, by: size.h - 10, a: Math.min(size.h * 0.5, size.w * 0.62), b: Math.min(size.h * 0.44, size.w * 0.55) })

  function newTarget() {
    const { bx, by, a, b } = arm()
    for (let tries = 0; tries < 40; tries++) {
      const angle = -Math.PI * (0.15 + Math.random() * 0.7)
      const r = (a + b) * (0.35 + Math.random() * 0.55)
      const x = bx + Math.cos(angle) * r
      const y = by + Math.sin(angle) * r
      if (x > 24 && x < size.w - 24 && y > 24 && y < size.h - 30) return { x, y }
    }
    return { x: size.w / 2, y: size.h / 2 }
  }

  function steer(x, y) {
    finger = { x: Math.min(size.w, Math.max(0, x)), y: Math.min(size.h, Math.max(0, y)) }
    lastInput = performance.now()
  }

  function begin() {
    if (round) return
    round = { delay, start: performance.now(), hits: 0 }
    target = newTarget()
    status.textContent = `Round started with the ${delay === 600 ? 'slow' : 'fast'} head.`
  }

  const at = event => {
    const box = canvas.getBoundingClientRect()
    steer(event.clientX - box.left, event.clientY - box.top - (event.pointerType === 'touch' ? TOUCH_LIFT : 0))
  }
  canvas.addEventListener('pointermove', at)
  canvas.addEventListener('pointerdown', event => {
    at(event)
    begin()
  })
  canvas.addEventListener('keydown', event => {
    const step = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key]
    if (step) {
      event.preventDefault()
      const from = finger ?? { x: size.w / 2, y: size.h / 2 }
      steer(from.x + step[0], from.y + step[1])
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      begin()
    }
  })
  heads.forEach(button => button.addEventListener('click', () => {
    delay = Number(button.dataset.delay)
    round = null
    target = null
    commands = []
    heads.forEach(other => other.setAttribute('aria-pressed', other === button))
  }))

  function tick(now) {
    frame = requestAnimationFrame(tick)
    const { w, h } = size
    const { bx, by, a, b } = arm()
    let hand = finger
    if (!round && now - lastInput > IDLE_MS && !calm) hand = { x: w / 2 + w * 0.3 * Math.sin(now / 1100), y: h * 0.47 + h * 0.15 * Math.sin(now / 700) }
    hand ??= { x: w * 0.7, y: h * 0.42 }
    commands.push({ time: now, x: hand.x, y: hand.y })
    while (commands.length > 2 && commands[1].time < now - 1500) commands.shift()
    const acting = delayed(commands, now, delay)

    g.clearRect(0, 0, w, h)
    g.strokeStyle = colors.hair
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(0, h - 10.5)
    g.lineTo(w, h - 10.5)
    g.stroke()
    if (target) {
      g.strokeStyle = colors.ink
      g.lineWidth = 1.5
      g.beginPath()
      g.arc(target.x, target.y, 14 + Math.sin(now / 160) * 2, 0, 2 * Math.PI)
      g.stroke()
    }
    g.setLineDash([3, 5])
    g.strokeStyle = colors.soft
    g.beginPath()
    g.moveTo(hand.x, hand.y)
    g.lineTo(acting.x, acting.y)
    g.stroke()
    g.setLineDash([])
    g.strokeStyle = colors.red
    g.lineWidth = 2
    for (let i = 1; i < tips.length; i++) {
      g.globalAlpha = (i / tips.length) * 0.6
      g.beginPath()
      g.moveTo(...tips[i - 1])
      g.lineTo(...tips[i])
      g.stroke()
    }
    g.globalAlpha = 1
    const [tx, ty] = drawArm(g, colors, bx, by, acting.x, acting.y, a, b)
    tips.push([tx, ty])
    if (tips.length > 50) tips.shift()
    g.save()
    g.strokeStyle = colors.blue
    g.shadowColor = colors.blue
    g.shadowBlur = 12
    g.lineWidth = 2
    g.beginPath()
    g.arc(hand.x, hand.y, 10, 0, 2 * Math.PI)
    g.stroke()
    g.restore()

    if (round) {
      if (target && Math.hypot(tx - target.x, ty - target.y) < HIT) {
        round.hits++
        target = newTarget()
        flash = now
      }
      if (now - round.start > ROUND_MS) {
        results[round.delay] = round.hits
        status.textContent = `${round.delay === 600 ? 'Slow' : 'Fast'} head: ${round.hits} hits in 10 seconds.`
        round = null
        target = null
      }
    }
    if (!calm && now - flash < 250) {
      g.fillStyle = colors.red
      g.globalAlpha = 0.12 * (1 - (now - flash) / 250)
      g.fillRect(0, 0, w, h)
      g.globalAlpha = 1
    }

    const both = 600 in results && 100 in results ? ' · same hand, only the delay changed' : ''
    const text = round
      ? `${Math.max(0, (ROUND_MS - (now - round.start)) / 1000).toFixed(1)} s left · ${round.hits} hits`
      : `hits in 10 s: slow head ${results[600] ?? '–'} · fast head ${results[100] ?? '–'}${both}`
    if (text !== shown) score.textContent = shown = text
  }

  frame = requestAnimationFrame(tick)
  canvas.focus({ preventScroll: true })
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}

/* Keep 8 numbers: a drawn line rebuilt from only its largest Haar wavelet numbers */

export function startKeep(host) {
  const { canvas, g, size, observer, colors } = stage(host, `
    <div class="game-bar" role="group" aria-label="Numbers kept">
      ${KEEPS.map(k => `<button class="pill" type="button" data-keep="${k}" aria-pressed="${k === 8}">${k === 128 ? 'all 128' : `keep ${k}`}</button>`).join('')}
    </div>
    <p class="score" role="status"></p>
    <canvas aria-label="Drawing area. Draw a line and it is redrawn from only the wavelet numbers kept."></canvas>
    <p class="small">Your line is grey. The red line is rebuilt from only the largest of its 128 Haar wavelet numbers (64 points, x and y): keep only the numbers that matter. It doesn't run my model.</p>`)
  const score = host.querySelector('.score')
  const buttons = [...host.querySelectorAll('[data-keep]')]
  let keep = 8
  let line = null
  let mine = false
  let drawing = false

  const example = () => Array.from({ length: 201 }, (_, i) => {
    const t = i / 200
    return [size.w * (0.14 + 0.72 * t) + size.w * 0.05 * Math.sin(t * Math.PI * 9), size.h * 0.5 + size.h * 0.17 * Math.sin(t * Math.PI * 5) * Math.cos(t * Math.PI * 1.4)]
  })
  const path = points => {
    g.beginPath()
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
  }

  function draw() {
    g.clearRect(0, 0, size.w, size.h)
    if (!line || line.length < 2) return
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = colors.soft
    g.lineWidth = 2
    g.globalAlpha = 0.6
    path(line)
    g.globalAlpha = 1
    if (drawing || line.length < 4) return
    g.save()
    g.strokeStyle = colors.red
    g.shadowColor = colors.red
    g.shadowBlur = 10
    g.lineWidth = 3
    path(keepLargest(line, keep))
    g.restore()
    score.textContent = keep >= 128 ? 'Kept all 128 numbers: your line, evenly resampled.' : `Kept ${keep} of 128 numbers.${mine ? '' : ' Draw your own line.'}`
  }

  size.fitted = () => {
    if (!mine) line = example()
    draw()
  }
  const at = event => {
    const box = canvas.getBoundingClientRect()
    return [event.clientX - box.left, event.clientY - box.top]
  }
  canvas.addEventListener('pointerdown', event => {
    drawing = true
    mine = true
    line = [at(event)]
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {
      // without capture the stroke still works while the pointer stays on the canvas
    }
    draw()
  })
  canvas.addEventListener('pointermove', event => {
    if (!drawing) return
    line.push(at(event))
    draw()
  })
  for (const name of ['pointerup', 'pointercancel']) canvas.addEventListener(name, () => {
    if (!drawing) return
    drawing = false
    draw()
  })
  buttons.forEach(button => button.addEventListener('click', () => {
    keep = Number(button.dataset.keep)
    buttons.forEach(other => other.setAttribute('aria-pressed', other === button))
    draw()
  }))

  return () => observer.disconnect()
}
