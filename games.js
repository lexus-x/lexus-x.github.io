// Two problems from the research, as games. Neither runs the real model.
import { joints, solve } from './arm.mjs'

/* Beat the delay: only the 6× ratio is measured, the delays themselves are chosen to be felt */

const ROUNDS = [
  { name: 'Slow head', delay: 600 },
  { name: 'Fast head, 6× quicker', delay: 100 },
]
const ARM_TINTS = ['#3f7bff', '#969caa', '#ff3149']
const REACH = 0.17
const TRAY = 0.3
const BLOCK = 0.09
const FLOOR = 0.06

// what the arm is acting on now: the newest command at least `delay` old
export function delayed(commands, now, delay) {
  let seen = commands[0]
  for (const command of commands) {
    if (command.time > now - delay) break
    seen = command
  }
  return seen
}

export function startDelay(host) {
  host.innerHTML = `
    <canvas tabindex="0" aria-label="Move the pointer to steer the arm. Hold to grip, release to drop. Arrow keys steer and space grips."></canvas>
    <p class="score" role="status"></p>
    <p class="small">Move to steer. Hold to grip the block, release over the tray. Keys: arrows and space. The delays are for feel: only the 6× ratio is measured, end to end.</p>`
  const canvas = host.querySelector('canvas')
  const score = host.querySelector('.score')
  const context = canvas.getContext('2d')
  const style = getComputedStyle(document.documentElement)
  const color = name => style.getPropertyValue(name)
  const times = []

  let round = 0
  let running = true
  let hand = { x: 0.4, y: 1.1, grip: false }
  let commands = []
  let block
  let tray
  let held = false
  let began = 0
  let q = solve(hand.x, hand.y, -1.57)

  function begin() {
    hand = { x: 0.4, y: 1.1, grip: false }
    commands = [{ ...hand, time: performance.now() }]
    block = { x: -0.5 - Math.random() * 0.7, y: FLOOR }
    tray = 0.5 + Math.random() * 0.7
    held = false
    began = 0
    score.textContent = `${ROUNDS[round].name}. Go when ready.`
  }

  const send = () => {
    commands.push({ ...hand, time: performance.now() })
    began ||= performance.now()
  }

  // the world is 3 wide with the base at the bottom centre
  function fit() {
    const width = canvas.getBoundingClientRect().width
    const pixels = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * pixels)
    canvas.height = Math.round(width * 0.56 * pixels)
  }
  const scale = () => canvas.width / 3
  const toX = x => canvas.width / 2 + x * scale()
  const toY = y => canvas.height - 6 - y * scale()

  function steer(event) {
    const box = canvas.getBoundingClientRect()
    hand.x = ((event.clientX - box.left) / box.width) * 3 - 1.5
    hand.y = Math.max(FLOOR, ((box.bottom - event.clientY) / box.width) * 3)
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

  // the same arm as the plate: blue upper link, grey forearm, red tool
  function drawArm(angles, width, closed) {
    const points = joints(angles)
    ARM_TINTS.forEach((tint, i) => {
      context.strokeStyle = tint
      context.lineWidth = width
      context.beginPath()
      context.moveTo(toX(points[i][0]), toY(points[i][1]))
      context.lineTo(toX(points[i + 1][0]), toY(points[i + 1][1]))
      context.stroke()
    })
    const [tipX, tipY] = points[3]
    const spread = closed ? 0.05 : 0.11
    context.beginPath()
    context.moveTo(toX(tipX - spread), toY(tipY - 0.09))
    context.lineTo(toX(tipX), toY(tipY))
    context.lineTo(toX(tipX + spread), toY(tipY - 0.09))
    context.stroke()
  }

  function finish() {
    times.push((performance.now() - began) / 1000)
    round++
    if (round < ROUNDS.length) {
      begin()
      return
    }
    running = false
    score.textContent = `${ROUNDS[0].name} ${times[0].toFixed(1)}s. ${ROUNDS[1].name} ${times[1].toFixed(1)}s. That gap is why a faster head matters to a robot.`
  }

  function frame() {
    if (!running) return
    requestAnimationFrame(frame)
    const now = performance.now()
    const acting = delayed(commands, now, ROUNDS[round].delay)
    q = solve(acting.x, acting.y, -1.57)
    const [tipX, tipY] = joints(q)[3]

    if (acting.grip && !held && Math.hypot(tipX - block.x, tipY - block.y) < REACH) held = true
    if (held && !acting.grip) {
      held = false
      if (Math.abs(tipX - tray) < TRAY) {
        finish()
        return
      }
    }
    if (held) {
      block.x = tipX
      block.y = tipY
    } else if (block.y > FLOOR) {
      block.y = Math.max(FLOOR, block.y - 0.04)
    }

    context.clearRect(0, 0, canvas.width, canvas.height)
    const line = Math.max(1, canvas.width / 900)
    context.lineCap = 'round'
    context.strokeStyle = color('--hair')
    context.lineWidth = line
    context.beginPath()
    context.moveTo(0, toY(0))
    context.lineTo(canvas.width, toY(0))
    context.stroke()

    context.strokeStyle = color('--blue')
    context.strokeRect(toX(tray - TRAY), toY(0.2), TRAY * 2 * scale(), 0.2 * scale())

    context.globalAlpha = 0.28
    drawArm(solve(hand.x, hand.y, -1.57), line * 2, hand.grip) // where you told it to be
    context.globalAlpha = 1
    drawArm(q, line * 3.5, acting.grip) // where it is

    context.fillStyle = color('--red')
    const size = BLOCK * scale()
    context.fillRect(toX(block.x) - size / 2, toY(block.y) - size / 2, size, size)

    if (began) score.textContent = `${ROUNDS[round].name}: ${((now - began) / 1000).toFixed(1)}s`
  }

  const observer = new ResizeObserver(fit)
  observer.observe(canvas)
  fit()
  begin()
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

function fishDrawing({ body, tail, stripes, fin }) {
  const depth = body === 'slim' ? 11 : 18
  const tails = {
    forked: 'M72 30 L96 14 L88 30 L96 46 Z',
    fan: 'M72 30 Q98 10 96 30 Q98 50 72 30 Z',
    square: 'M72 30 L74 15 L94 15 L94 45 L74 45 Z',
  }
  const top = 30 - depth
  const fins = fin === 'tall' ? `M28 ${top + 3} L40 ${top - 11} L54 ${top + 2}` : `M30 ${top + 2} L42 ${top - 3} L54 ${top + 2}`
  const bars = Array.from({ length: stripes }, (_, i) => {
    const x = 34 + i * 12
    return `<path d="M${x} ${30 - depth * 0.82} V${30 + depth * 0.82}"/>`
  }).join('')
  return `<svg viewBox="0 0 100 60" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2">
    <ellipse cx="42" cy="30" rx="32" ry="${depth}"/><path d="${tails[tail]}"/><path d="${fins}"/>${bars}<circle cx="20" cy="27" r="1.6" fill="currentColor"/></svg>`
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
      grid.innerHTML = ''
      prompt.textContent = `You named ${right} of ${FISH_ROUNDS} species you had never seen.`
      note.textContent = 'FishONet scored 23.77% on unseen species, choosing from 17,393. You chose from 6.'
      return
    }
    turn++
    const round = makeRound()
    prompt.textContent = `${turn}/${FISH_ROUNDS}. Find: ${round.named.map(trait => WORDS[trait](round.target[trait])).join(', ')}.`
    note.textContent = 'You have never seen this fish. The description is all you get.'
    grid.innerHTML = ''
    round.fish.forEach(fish => {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('aria-label', Object.keys(TRAITS).map(trait => WORDS[trait](fish[trait])).join(', '))
      button.innerHTML = fishDrawing(fish)
      button.addEventListener('click', () => {
        const hit = round.fits(fish)
        right += hit
        button.classList.add(hit ? 'right' : 'wrong')
        grid.querySelectorAll('button').forEach(other => { other.disabled = true })
        timer = setTimeout(next, 600)
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
