// Two problems from the research, as games. Neither runs the real model.
import { joints, solve } from './arm.mjs'

/* Beat the delay: only the 6× ratio is measured, the delays themselves are chosen to be felt */

const ROUNDS = [
  { name: 'Slow head', delay: 600 },
  { name: 'Fast head, 6× quicker', delay: 100 },
]
const ARM_TINTS = ['#3f7bff', '#969caa', '#ff3149']
const LINK_WIDTHS = [0.075, 0.055, 0.03]
const LINK_THREADS = [7, 5, 3]
const REACH = 0.17
const TRAY = 0.3
const BLOCK = 0.09
const FLOOR = 0.06
const TILT = -1.57
const WORLD_WIDTH = 2.6
const WORLD_HEIGHT = 1.9
const GLOW = 16
const TOP_SPEED = 9 // world units per second: a motor's limit, only felt when a new touch lands far away
const FINGER_LIFT = 0.4 // on a touch screen the arm works above the finger, where it can be seen

// what the arm is acting on now: the newest command at least `delay` old
export function delayed(commands, now, delay) {
  let seen = commands[0]
  for (const command of commands) {
    if (command.time > now - delay) break
    seen = command
  }
  return seen
}

// moves toward a point by at most `most`
export function approach(from, to, most) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const share = distance > most ? most / distance : 1
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }
}

export function startDelay(host) {
  const touch = matchMedia('(pointer: coarse)').matches
  host.innerHTML = `
    <p class="score" role="status"></p>
    <canvas tabindex="0" aria-label="Move the pointer to steer the arm. Hold to grip, release to drop. Arrow keys steer and space grips."></canvas>
    <p class="small">${touch
      ? 'Drag the arm to the block, carry it over the tray, then lift your finger.'
      : 'Move to steer. Hold to grip the block, release over the tray. Keys: arrows and space.'}</p>`
  const canvas = host.querySelector('canvas')
  const score = host.querySelector('.score')
  const context = canvas.getContext('2d')
  const style = getComputedStyle(document.documentElement)
  const color = name => style.getPropertyValue(name)
  const blend = document.documentElement.dataset.theme === 'light' ? 'multiply' : 'lighter' // light only adds up on a dark ground
  const plates = []

  let round = 0
  let running = true
  let hand = { x: 0.4, y: 1.1, grip: false }
  let tip = hand
  let commands = []
  let block
  let tray
  let held = false
  let began = 0
  let last = performance.now()
  let q = solve(hand.x, hand.y, TILT)
  let film
  let exposure

  // the whole round stays on this sheet, the same long exposure as the figure on the main page
  function loadFilm() {
    film = document.createElement('canvas')
    film.width = canvas.width
    film.height = canvas.height
    exposure = film.getContext('2d')
    exposure.fillStyle = color('--ground')
    exposure.fillRect(0, 0, film.width, film.height)
    exposure.lineCap = 'round'
    exposure.globalCompositeOperation = blend
  }

  function begin() {
    hand = { x: 0.4, y: 1.1, grip: false }
    tip = hand
    commands = [{ ...hand, time: performance.now() }]
    block = { x: -0.5 - Math.random() * 0.6, y: FLOOR }
    tray = 0.5 + Math.random() * 0.45
    held = false
    began = 0
    loadFilm()
    score.textContent = `${ROUNDS[round].name}. Go when ready.`
  }

  const send = () => {
    commands.push({ ...hand, time: performance.now() })
    began ||= performance.now()
  }

  function fit() {
    const box = canvas.getBoundingClientRect()
    const pixels = Math.min(devicePixelRatio || 1, 2)
    const width = Math.round(box.width * pixels)
    const height = Math.round(box.height * pixels)
    if (!width || !height || (width === canvas.width && height === canvas.height)) return
    canvas.width = width
    canvas.height = height
    loadFilm()
  }

  // the world is centred with the base on the floor, whatever shape the screen is
  const scale = () => Math.min(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT)
  const floor = () => (canvas.height + WORLD_HEIGHT * scale()) / 2
  const toX = x => canvas.width / 2 + x * scale()
  const toY = y => floor() - y * scale()
  const line = () => Math.max(1, canvas.width / 900)

  function steer(event) {
    const box = canvas.getBoundingClientRect()
    const ratio = canvas.width / box.width
    hand.x = ((event.clientX - box.left) * ratio - canvas.width / 2) / scale()
    hand.y = Math.max(FLOOR, (floor() - (event.clientY - box.top) * ratio) / scale() + (touch ? FINGER_LIFT : 0))
    send()
  }
  const grip = closed => {
    hand.grip = closed
    send()
  }

  canvas.addEventListener('pointermove', steer)
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId)
    steer(event)
    grip(true)
  })
  canvas.addEventListener('pointerup', () => grip(false))
  canvas.addEventListener('keydown', event => {
    const nudge = { ArrowLeft: [-0.06, 0], ArrowRight: [0.06, 0], ArrowUp: [0, 0.06], ArrowDown: [0, -0.06] }[event.key]
    if (nudge) {
      hand.x += nudge[0]
      hand.y = Math.max(FLOOR, hand.y + nudge[1])
      send()
    } else if (event.key === ' ') {
      grip(!hand.grip)
    } else return
    event.preventDefault()
  })

  // the same arm as the plate: each link a few parallel threads, blue, grey, then a red tool
  function strokeArm(target, angles, closed, width, alpha) {
    const points = joints(angles)
    target.globalAlpha = alpha
    target.lineWidth = width
    ARM_TINTS.forEach((tint, i) => {
      const ax = toX(points[i][0])
      const ay = toY(points[i][1])
      const bx = toX(points[i + 1][0])
      const by = toY(points[i + 1][1])
      const length = Math.hypot(bx - ax, by - ay) || 1
      const nx = (ay - by) / length
      const ny = (bx - ax) / length
      target.strokeStyle = target.shadowColor = tint
      target.beginPath()
      for (let t = 0; t < LINK_THREADS[i]; t++) {
        const offset = (t / (LINK_THREADS[i] - 1) - 0.5) * LINK_WIDTHS[i] * scale()
        target.moveTo(ax + nx * offset, ay + ny * offset)
        target.lineTo(bx + nx * offset, by + ny * offset)
      }
      target.stroke()
    })
    const [tipX, tipY] = points[3]
    const spread = closed ? 0.05 : 0.11
    target.beginPath()
    target.moveTo(toX(tipX - spread), toY(tipY - 0.09))
    target.lineTo(toX(tipX), toY(tipY))
    target.lineTo(toX(tipX + spread), toY(tipY - 0.09))
    target.stroke()
    target.globalAlpha = 1
  }

  function drawBlock() {
    const size = BLOCK * scale()
    context.fillStyle = context.shadowColor = color('--red')
    context.shadowBlur = GLOW * line()
    context.fillRect(toX(block.x) - size / 2, toY(block.y) - size / 2, size, size)
    context.shadowBlur = 0
  }

  function drawTray(ready) {
    const left = toX(tray - TRAY)
    const top = toY(0.2)
    const width = TRAY * 2 * scale()
    const height = 0.2 * scale()
    context.strokeStyle = context.fillStyle = color('--blue')
    context.lineWidth = line()
    context.globalAlpha = ready ? 0.3 : 0.08
    context.fillRect(left, top, width, height)
    context.globalAlpha = 1
    context.strokeRect(left, top, width, height)
  }

  function showPlates() {
    observer.disconnect()
    host.innerHTML = `
      <p class="score" role="status">Same hand. Only the delay changed.</p>
      <div class="plates"></div>
      <p class="small">Each plate is your whole motion, one exposure. The delays are for feel: only the 6× ratio is measured, end to end.</p>`
    const space = host.querySelector('.plates')
    plates.forEach(plate => {
      const figure = document.createElement('figure')
      const caption = document.createElement('figcaption')
      caption.textContent = `${plate.name}: ${plate.seconds.toFixed(1)}s`
      figure.append(plate.film, caption)
      space.append(figure)
    })
  }

  function finish(now) {
    plates.push({ film, name: ROUNDS[round].name, seconds: (now - began) / 1000 })
    round++
    if (round < ROUNDS.length) {
      begin()
      return
    }
    running = false
    showPlates()
  }

  function frame() {
    if (!running) return
    requestAnimationFrame(frame)
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const acting = delayed(commands, now, ROUNDS[round].delay)
    tip = approach(tip, acting, TOP_SPEED * dt)
    q = solve(tip.x, tip.y, TILT)
    const [tipX, tipY] = joints(q)[3]

    if (acting.grip && !held && Math.hypot(tipX - block.x, tipY - block.y) < REACH) held = true
    if (held && !acting.grip) {
      held = false
      if (Math.abs(tipX - tray) < TRAY) {
        finish(now)
        return
      }
    }
    if (held) {
      block.x = tipX
      block.y = tipY
    } else if (block.y > FLOOR) {
      block.y = Math.max(FLOOR, block.y - 0.04)
    }

    const thin = line()
    if (began) strokeArm(exposure, q, acting.grip, thin * 0.8, 0.05)

    context.globalCompositeOperation = 'source-over'
    context.drawImage(film, 0, 0)
    context.lineCap = 'round'
    context.strokeStyle = color('--hair')
    context.lineWidth = thin
    context.beginPath()
    context.moveTo(0, toY(0))
    context.lineTo(canvas.width, toY(0))
    context.stroke()
    drawTray(held && Math.abs(tipX - tray) < TRAY)

    context.globalCompositeOperation = blend
    strokeArm(context, solve(hand.x, hand.y, TILT), hand.grip, thin, 0.22) // where you told it to be
    context.shadowBlur = GLOW * thin
    strokeArm(context, q, acting.grip, thin * 1.5, 1) // where it is
    context.shadowBlur = 0
    drawBlock()

    if (began) score.textContent = `${ROUNDS[round].name}: ${((now - began) / 1000).toFixed(1)}s`
  }

  const observer = new ResizeObserver(fit)
  fit()
  begin()
  observer.observe(canvas)
  canvas.focus({ preventScroll: true })
  requestAnimationFrame(frame)

  return () => {
    running = false
    observer.disconnect()
    host.innerHTML = ''
  }
}

/* Zero-shot fish: name a species from its description alone, the way FishONet handled its 11,598 unseen species */

const TRAITS = {
  body: ['slim', 'round'],
  tail: ['forked', 'fan', 'square'],
  stripes: [0, 1, 2, 3],
  fin: ['low', 'tall'],
}
const SPECIES_ON_SCREEN = 6
const FISH_ROUNDS = 5
const CONTOURS = [0, 1, 2, 3, 4]
const ANSWER_MS = 900

const pick = (list, random) => list[Math.floor(random() * list.length)]
const makeFish = random => Object.fromEntries(Object.entries(TRAITS).map(([name, options]) => [name, pick(options, random)]))

// three of the four traits are named, and exactly one fish on screen fits all three
export function makeRound(random = Math.random) {
  const target = makeFish(random)
  const named = Object.keys(TRAITS).sort(() => random() - 0.5).slice(0, 3)
  const fits = fish => named.every(trait => fish[trait] === target[trait])
  const fish = [target]
  while (fish.length < SPECIES_ON_SCREEN) {
    const other = makeFish(random)
    if (!fits(other)) fish.push(other)
  }
  return { target, named, fits, fish: fish.sort(() => random() - 0.5) }
}

const WORDS = {
  body: value => `${value} body`,
  tail: value => `${value} tail`,
  stripes: value => (value === 0 ? 'no stripes' : `${value} stripe${value > 1 ? 's' : ''}`),
  fin: value => `${value} fin`,
}

// drawn like the plate: nested threads running blue to red, with the stripes picked out in red
function fishDrawing({ body, tail, stripes, fin }, index) {
  const depth = body === 'slim' ? 11 : 18
  const top = 30 - depth
  const tails = {
    forked: 'M72 30 L96 14 L88 30 L96 46 Z',
    fan: 'M72 30 Q98 10 96 30 Q98 50 72 30 Z',
    square: 'M72 30 L74 15 L94 15 L94 45 L74 45 Z',
  }
  const fins = fin === 'tall' ? `M28 ${top + 3} L40 ${top - 11} L54 ${top + 2}` : `M30 ${top + 2} L42 ${top - 3} L54 ${top + 2}`
  const threads = CONTOURS.map(i => {
    const fade = 1 - i * 0.17
    const shrink = 1 - i * 0.16
    return `<ellipse cx="42" cy="30" rx="${32 - i * 1.4}" ry="${depth * shrink}" opacity="${fade}"/>
      <path d="${tails[tail]}" opacity="${fade}" transform="translate(72 30) scale(${shrink}) translate(-72 -30)"/>
      <path d="${fins}" opacity="${fade}" transform="translate(42 ${top}) scale(${shrink}) translate(-42 ${-top})"/>`
  }).join('')
  const bars = Array.from({ length: stripes }, (_, i) => {
    const x = 34 + i * 12
    return `<path class="stripe" d="M${x} ${30 - depth * 0.82} V${30 + depth * 0.82}"/>`
  }).join('')
  return `<svg viewBox="0 0 100 60" aria-hidden="true" fill="none" stroke-width="0.6">
    <linearGradient id="fish-${index}" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="96" y2="0"><stop class="head"/><stop offset="0.55" class="middle"/><stop offset="1" class="tail"/></linearGradient>
    <g stroke="url(#fish-${index})">${threads}</g>${bars}<circle cx="20" cy="27" r="1.6" fill="currentColor"/></svg>`
}

export function startFish(host) {
  host.innerHTML = '<p class="score" role="status"></p><div class="fish-grid"></div><p class="small"></p>'
  const prompt = host.querySelector('.score')
  const grid = host.querySelector('.fish-grid')
  const note = host.querySelector('.small')
  let turn = 0
  let right = 0
  let timer

  function next() {
    if (turn === FISH_ROUNDS) {
      grid.remove()
      prompt.textContent = `You named ${right} of ${FISH_ROUNDS} species you had never seen.`
      note.textContent = 'FishONet scored 23.77% on unseen species, choosing from 17,393. You chose from 6.'
      return
    }
    turn++
    const round = makeRound()
    prompt.textContent = `${turn}/${FISH_ROUNDS}. Find: ${round.named.map(trait => WORDS[trait](round.target[trait])).join(', ')}.`
    note.textContent = 'You have never seen this fish. The description is all you get.'
    grid.innerHTML = ''
    round.fish.forEach((fish, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.style.setProperty('--turn', index)
      button.setAttribute('aria-label', Object.keys(TRAITS).map(trait => WORDS[trait](fish[trait])).join(', '))
      button.innerHTML = fishDrawing(fish, index)
      button.addEventListener('click', () => {
        const hit = round.fits(fish)
        right += hit
        if (!hit) button.classList.add('wrong')
        grid.querySelectorAll('button').forEach((other, i) => {
          other.disabled = true
          other.classList.toggle('right', round.fits(round.fish[i])) // a miss still shows the answer
        })
        timer = setTimeout(next, ANSWER_MS)
      })
      grid.append(button)
    })
  }

  next()
  return () => {
    clearTimeout(timer)
    host.innerHTML = ''
  }
}
