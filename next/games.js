// Six small games. Beat the delay and Keep 8 numbers come from the research; none of them runs the real model.
import { drawArm, themeColors } from './arm.mjs'
import { keepLargest, resample } from './wavelet.mjs'
import { ALBUMS, pick } from './albums.mjs'
import { startLines } from './lines.js'

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

/* Reviewer 2: comments arrive faster and faster; five open at once and the paper is rejected */

const COMMENTS = ['Add more baselines.', 'Why not use a transformer?', 'Typo in Eq. 3.', 'The novelty is unclear.', 'Please cite my 2009 paper.', 'Run it on a real robot.', 'Needs more seeds.', 'The figure is too small.', 'Is this just a regression head?', 'Define "action".', 'Ablate everything.', 'Compare with a bigger model.', 'The related work is thin.', 'Why wavelets?']
const PILE = 5

export function startReviewer(host) {
  host.innerHTML = `
    <div class="game-bar"><button class="pill" type="button" data-go>start</button></div>
    <p class="score" aria-live="off"></p>
    <div class="desk" aria-label="Reviewer comments"></div>
    <p class="small">Reviewer 2 keeps commenting. Tap a comment to answer it. Five open at once and the paper is rejected.</p>
    <p class="sr" role="status"></p>`
  const desk = host.querySelector('.desk')
  const go = host.querySelector('[data-go]')
  const score = host.querySelector('.score')
  const status = host.querySelector('[role="status"]')
  let answered = 0
  let best = 0
  let timer = 0

  const open = () => desk.childElementCount
  const show = () => { score.textContent = `${answered} answered · ${open()} of ${PILE} open · best ${best}` }

  function spawn() {
    const note = document.createElement('button')
    note.type = 'button'
    note.className = 'comment'
    const showing = [...desk.children].map(item => item.textContent)
    note.textContent = pick(COMMENTS.filter(text => !showing.includes(text)))
    note.addEventListener('click', () => {
      const focused = note === document.activeElement
      note.remove()
      answered++
      if (focused) (desk.lastElementChild ?? go).focus({ preventScroll: true })
      show()
    })
    desk.append(note)
    note.style.left = `${8 + Math.random() * Math.max(0, desk.clientWidth - note.offsetWidth - 16)}px` // anywhere it fits whole
    note.style.top = `${8 + Math.random() * Math.max(0, desk.clientHeight - note.offsetHeight - 16)}px`
    show()
    if (open() >= PILE) return end()
    timer = setTimeout(spawn, Math.max(450, 1500 - answered * 45))
  }

  function end() {
    best = Math.max(best, answered)
    desk.inert = true
    go.textContent = 'resubmit'
    go.hidden = false
    status.textContent = `Rejected with ${PILE} comments open. You answered ${answered}.`
    score.textContent = `Rejected. ${answered} answered · best ${best}`
    go.focus({ preventScroll: true })
  }

  go.addEventListener('click', () => {
    desk.replaceChildren()
    desk.inert = false
    answered = 0
    go.hidden = true
    status.textContent = 'Reviewer 2 is writing.'
    spawn()
    desk.firstElementChild.focus({ preventScroll: true })
  })
  score.textContent = `Answer before ${PILE} pile up.`
  go.focus({ preventScroll: true })
  return () => clearTimeout(timer)
}

/* Grasp: a claw-style timing game on the robot's own terms */

export function startGrasp(host) {
  const { canvas, g, size, observer, colors } = stage(host, `
    <p class="score" aria-live="off"></p>
    <canvas tabindex="0" aria-label="Gripper over a cup. Press Space or tap to drop the gripper."></canvas>
    <p class="small">The gripper slides along the rail. Tap, or press Space, to drop it. Land it over the cup to pick it up; every catch makes it faster.</p>
    <p class="sr" role="status"></p>`)
  const score = host.querySelector('.score')
  const status = host.querySelector('[role="status"]')
  let phase = 'slide'
  let clock = 0
  let speed = 1
  let x = 0
  let reach = 0 // where the jaws are, in px from the top
  let cupAt = 0.7 // across the floor, 0 to 1
  let caught = false
  let tipped = 0 // -1 or 1 once knocked over
  let tippedAt = 0
  let streak = 0
  let best = 0
  let last = performance.now()
  let frame = 0
  let shown = ''

  const drop = () => { if (phase === 'slide') phase = 'drop' }
  canvas.addEventListener('pointerdown', drop)
  canvas.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    drop()
  })

  function land(now, off) {
    phase = 'up'
    if (Math.abs(off) < 15) {
      caught = true
      streak++
      best = Math.max(best, streak)
      speed += 0.35
      status.textContent = `Caught it. Streak ${streak}.`
      return
    }
    if (Math.abs(off) < 36) {
      tipped = off > 0 ? -1 : 1
      tippedAt = now
    }
    status.textContent = tipped ? 'Knocked it over.' : 'Missed.'
    streak = 0
    speed = 1
  }

  function tick(now) {
    frame = requestAnimationFrame(tick)
    const seconds = Math.min(0.05, (now - last) / 1000)
    last = now
    const { w, h } = size
    const rail = 22
    const hang = 76
    const floor = h - 14
    const cupTop = floor - 36
    const cx = 20 + cupAt * (w - 40)
    reach ||= hang
    if (phase === 'slide') {
      clock += seconds * (1 + speed)
      x = w / 2 + (w / 2 - 34) * Math.sin(clock)
    }
    if (phase === 'drop') {
      const off = x - cx
      const bottom = Math.abs(off) < 36 ? cupTop + (Math.abs(off) < 15 ? 10 : 0) : floor
      reach = Math.min(bottom, reach + seconds * 560)
      if (reach >= bottom) land(now, off)
    }
    if (phase === 'up') {
      reach = Math.max(hang, reach - seconds * 380)
      if (reach <= hang && (!tipped || now - tippedAt > 700)) {
        if (caught || tipped) cupAt = (cupAt + 0.25 + Math.random() * 0.5) % 1
        caught = false
        tipped = 0
        phase = 'slide'
      }
    }

    g.clearRect(0, 0, w, h)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = colors.hair
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(12, rail)
    g.lineTo(w - 12, rail)
    g.moveTo(0, floor + 0.5)
    g.lineTo(w, floor + 0.5)
    g.stroke()
    const jaw = caught ? 11 : 15
    g.strokeStyle = colors.ink
    g.lineWidth = 2.5
    g.beginPath()
    g.moveTo(x, rail)
    g.lineTo(x, reach - 14)
    g.moveTo(x - jaw, reach)
    g.lineTo(x - jaw, reach - 14)
    g.lineTo(x + jaw, reach - 14)
    g.lineTo(x + jaw, reach)
    g.stroke()
    g.fillStyle = colors.ink
    g.fillRect(x - 9, rail - 5, 18, 10)

    // the cup rides up with the gripper when caught, and falls away from it when knocked
    const bottom = caught ? reach + 26 : floor
    const pivot = cx + tipped * 11
    g.save()
    g.translate(pivot, bottom)
    g.rotate(tipped * (Math.PI / 2) * Math.min(1, (now - tippedAt) / 260))
    g.translate(cx - pivot, 0)
    g.fillStyle = colors.red
    g.beginPath()
    g.moveTo(-14, -36)
    g.lineTo(14, -36)
    g.lineTo(11, 0)
    g.lineTo(-11, 0)
    g.closePath()
    g.fill()
    g.restore()

    const text = `streak ${streak} · best ${best}`
    if (text !== shown) score.textContent = shown = text
  }

  frame = requestAnimationFrame(tick)
  canvas.focus({ preventScroll: true })
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}

/* Sim to real: every step adds a little error nobody corrects, so it piles up along the path (compounding error) */

// Where the real robot goes when it follows `plan`, points `step` apart. It wanders; with random() always 0.5 it is the plan.
export function realPath(plan, step, random = Math.random) {
  let vx = 0
  let vy = 0
  let dx = 0
  let dy = 0
  return plan.map(([x, y], i) => {
    if (i) {
      vx = vx * 0.97 + (random() - 0.5) * step * 0.07
      vy = vy * 0.97 + (random() - 0.5) * step * 0.07
      dx += vx
      dy += vy
    }
    return [x + dx, y + dy]
  })
}

const RUN_MS = 1600

export function startSim(host) {
  const { canvas, g, size, observer, colors } = stage(host, `
    <div class="game-bar"><button class="pill" type="button" data-straight>try a straight line</button></div>
    <p class="score" role="status"></p>
    <canvas aria-label="Drawing area. Draw a path from the robot to the cup; the real robot then follows it with small errors."></canvas>
    <p class="small">Draw a path from the robot to the cup. In sim it follows you exactly (dashed). The real robot adds a small error at every step and the errors pile up, so short, simple paths do best.</p>`)
  const score = host.querySelector('.score')
  const straight = host.querySelector('[data-straight]')
  const font = `500 12px ${getComputedStyle(document.documentElement).getPropertyValue('--mono').trim()}`
  let drawn = null
  let plan = null
  let real = null
  let ran = 0
  let caught = 0
  let tries = 0
  let frame = 0
  let goal = null

  const unit = () => Math.max(4, Math.min(size.w, size.h) / 60)
  const robot = () => [size.w * 0.1, size.h * 0.82]
  const newGoal = () => { goal = [size.w * (0.55 + Math.random() * 0.33), size.h * (0.15 + Math.random() * 0.6)] }

  function run(points) {
    const path = [robot(), ...points]
    let length = 0
    for (let i = 1; i < path.length; i++) length += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
    plan = resample(path, Math.max(2, Math.round(length / unit())))
    real = realPath(plan, unit())
    ran = performance.now()
    drawn = null
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(tick)
  }

  function judge() {
    const radius = unit() * 3.8
    const [px, py] = plan.at(-1)
    const [rx, ry] = real.at(-1)
    const miss = Math.hypot(rx - goal[0], ry - goal[1]) - radius
    tries++
    if (Math.hypot(px - goal[0], py - goal[1]) > radius) score.textContent = `Your plan stops short of the cup. Cups: ${caught} of ${tries}.`
    else if (miss < 0) {
      caught++
      score.textContent = `Got the cup: sim and real agreed. Cups: ${caught} of ${tries}.`
      newGoal()
    } else score.textContent = `In sim it reached the cup; the real robot missed by ${Math.round(miss)} px. Cups: ${caught} of ${tries}.`
  }

  function paint(now) {
    const { w, h } = size
    const [bx, by] = robot()
    const line = (points, dashed) => {
      g.setLineDash(dashed ? [5, 6] : [])
      g.beginPath()
      points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
      g.setLineDash([])
    }
    g.clearRect(0, 0, w, h)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = colors.hair
    g.lineWidth = 1.5
    g.setLineDash([3, 4])
    g.beginPath()
    g.arc(goal[0], goal[1], unit() * 3.8, 0, 2 * Math.PI)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = colors.red
    g.beginPath()
    g.moveTo(goal[0] - 10, goal[1] - 13)
    g.lineTo(goal[0] + 10, goal[1] - 13)
    g.lineTo(goal[0] + 8, goal[1] + 13)
    g.lineTo(goal[0] - 8, goal[1] + 13)
    g.closePath()
    g.fill()
    g.lineWidth = 2
    g.strokeStyle = colors.soft
    if (drawn) line([[bx, by], ...drawn], true)
    let head = [bx, by]
    if (plan) {
      line(plan, true)
      const reached = Math.max(1, Math.ceil(real.length * Math.min(1, (now - ran) / RUN_MS)))
      g.strokeStyle = colors.ink
      g.lineWidth = 2.5
      line(real.slice(0, reached), false)
      head = real[reached - 1]
    }
    g.fillStyle = colors.ink
    g.beginPath()
    g.arc(head[0], head[1], 6, 0, 2 * Math.PI)
    g.fill()
    g.font = font
    g.fillText('robot', bx - 18, by + 24)
  }

  function tick(now) {
    paint(now)
    if (now - ran < RUN_MS) frame = requestAnimationFrame(tick)
    else judge()
  }

  size.fitted = () => {
    if (!goal) newGoal()
    paint(Infinity)
  }

  const at = event => {
    const box = canvas.getBoundingClientRect()
    return [event.clientX - box.left, event.clientY - box.top]
  }
  canvas.addEventListener('pointerdown', event => {
    cancelAnimationFrame(frame)
    plan = null
    drawn = [at(event)]
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {
      // without capture the stroke still works while the pointer stays on the canvas
    }
    paint(performance.now())
  })
  canvas.addEventListener('pointermove', event => {
    if (!drawn) return
    drawn.push(at(event))
    paint(performance.now())
  })
  for (const name of ['pointerup', 'pointercancel']) canvas.addEventListener(name, () => {
    if (drawn?.length > 1) run(drawn)
    else drawn = null
  })
  straight.addEventListener('click', () => run([goal]))
  score.textContent = 'Draw from the robot to the cup.'
  straight.focus({ preventScroll: true })

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}

/* Name that album: the opening's signal lines, wearing one album at a time */

const ROUNDS = 5
const shuffled = list => list.map(item => [Math.random(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item)

export function startAlbum(host) {
  host.innerHTML = `
    <p class="score" role="status"></p>
    <div class="quiz-box"><canvas aria-hidden="true"></canvas></div>
    <div class="game-bar" role="group" aria-label="Which album is this?"></div>
    <p class="small">Each visit this site wears one album's colours. Which album is this one?</p>`
  const box = host.querySelector('.quiz-box')
  const bar = host.querySelector('.game-bar')
  const score = host.querySelector('.score')
  const lines = startLines(box.querySelector('canvas'))
  const ids = Object.keys(ALBUMS)
  let order = []
  let round = 0
  let right = 0
  let timer = 0

  function ask() {
    const id = order[round]
    box.dataset.album = id
    lines.restyle()
    lines.play()
    const options = shuffled([id, ...shuffled(ids.filter(other => other !== id)).slice(0, 3)])
    bar.innerHTML = options.map(option => `<button class="pill" type="button" data-id="${option}" aria-pressed="false">${ALBUMS[option].name}</button>`).join('')
    score.textContent = `Round ${round + 1} of ${ROUNDS} · ${right} right`
    bar.firstElementChild.focus({ preventScroll: true })
  }

  function begin() {
    order = shuffled(ids).slice(0, ROUNDS)
    round = 0
    right = 0
    ask()
  }

  bar.addEventListener('click', event => {
    const button = event.target.closest('button')
    if (!button) return
    if (button.dataset.again) return begin()
    if (timer) return // already answered; the next round is on its way
    const id = order[round]
    const album = ALBUMS[id]
    const correct = button.dataset.id === id
    if (correct) right++
    for (const option of bar.children) {
      if (option.dataset.id === id) option.textContent = `✓ ${option.textContent}`
      else if (option === button) option.textContent = `✗ ${option.textContent}`
      option.setAttribute('aria-pressed', option.dataset.id === id)
    }
    score.textContent = `${correct ? 'Yes' : 'No'}: ${album.name}, ${album.artist}. ${right} of ${round + 1} right.`
    timer = setTimeout(() => {
      timer = 0
      round++
      if (round < ROUNDS) return ask()
      score.textContent = `${right} of ${ROUNDS} right.${right === ROUNDS ? ' You know your records.' : ''}`
      bar.innerHTML = '<button class="pill" type="button" data-again="yes">play again</button>'
      bar.firstElementChild.focus({ preventScroll: true })
    }, 1400)
  })

  begin()
  return () => {
    clearTimeout(timer)
    lines.stop()
  }
}
