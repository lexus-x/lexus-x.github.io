import { startArt } from './art.js'
import { amount, layout, LEVELS } from './levels.mjs'

const EMAIL = 'zailalith@gmail.com'
const SUGGEST_URL = '' // shortcut: the suggest panel stays hidden until the Worker in worker/ is deployed, then this holds its URL
const TOP = LEVELS - 1
const GLIDE = 9 // how quickly the level closes on its goal, per second
const WHEEL = 0.005 // levels per wheel pixel
const SETTLE_MS = 130
const BEAT_MS = 400 // one doubling per beat as the page arrives

const root = document.documentElement
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
const wide = matchMedia('(min-width: 62.5rem) and (min-height: 32rem)')
const clamp = value => Math.min(TOP, Math.max(0, value))

const list = document.querySelector('#lines')
const rows = [...list.children]
const labels = rows.map(row => row.querySelector('span'))
const slider = document.querySelector('#detail')
const readout = document.querySelector('#kept')

const canvas = document.querySelector('#art')
const art = startArt(canvas, { calm, light: root.dataset.theme === 'light' })
if (!art) root.classList.add('art-off')

/* Levels */

let level = calm ? TOP : 0
let goal = level
let dragging = false
let heights = []
let spaceHeight = 0

function place() {
  const { offsets, total } = layout(heights, level)
  const centre = wide.matches ? Math.max(0, (spaceHeight - total) / 2) : 0
  let label = ''
  rows.forEach((row, i) => {
    const share = amount(i, level)
    row.style.transform = `translate3d(0, ${(offsets[i] + centre).toFixed(2)}px, 0)`
    row.style.opacity = share
    row.inert = share < 0.5
    if (row.inert) return
    labels[i].classList.toggle('same', labels[i].textContent === label)
    label = labels[i].textContent
  })
  if (!wide.matches) list.style.height = `${total}px`

  const lines = Math.round(2 ** level)
  readout.textContent = `${lines} ${lines === 1 ? 'line' : 'lines'}, ${(lines ** 2).toLocaleString('en-US')} ${lines === 1 ? 'number' : 'numbers'}`
  slider.setAttribute('aria-valuetext', `${lines} of 32 lines`)
  if (!dragging) slider.value = level
}

function measure() {
  heights = rows.map(row => row.offsetHeight)
  spaceHeight = list.parentElement.clientHeight
  place()
  if (calm) draw(0) // a resize clears the canvas and no loop will repaint it
}

let last = performance.now()

function frame(time) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.05, (time - last) / 1000)
  last = time
  const moving = level !== goal
  if (moving) {
    level += (goal - level) * (1 - Math.exp(-GLIDE * dt))
    if (Math.abs(goal - level) < 0.002) level = goal
    place()
  }
  // the glide follows the visitor's own hand, so it stays under reduced motion; only the self-playing arm stops
  if ((!calm || moving) && !stopGame) draw(dt)
}

const draw = dt => art?.step(dt, 2 * level + 1) // numbers are then lines squared: 1 line, 1 number and 32 lines, 1,024

function setGoal(value) {
  goal = clamp(value)
}

// one line holds a single pose, so the page opens by itself and rests on the full plate
const opening = calm ? 0 : setInterval(() => {
  setGoal(goal + 1)
  if (goal === TOP) clearInterval(opening)
}, BEAT_MS)

for (const name of ['wheel', 'pointerdown', 'keydown']) {
  addEventListener(name, () => {
    clearInterval(opening)
    setGoal(TOP)
  }, { once: true, capture: true, passive: true })
}

slider.addEventListener('input', () => {
  dragging = true
  setGoal(Number(slider.value))
})
slider.addEventListener('change', () => {
  dragging = false
  setGoal(Math.round(goal))
})
slider.addEventListener('keydown', event => {
  const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, Home: -TOP, End: TOP }[event.key]
  if (!step) return
  event.preventDefault()
  setGoal(Math.round(goal) + step)
})

let settling

addEventListener('wheel', event => {
  if (!wide.matches || location.hash.length > 1 || event.ctrlKey) return
  event.preventDefault()
  const pixels = event.deltaMode ? event.deltaY * 33 : event.deltaY
  goal = clamp(goal - pixels * WHEEL) // the page rests fully open, so scrolling down distils it
  clearTimeout(settling)
  settling = setTimeout(() => setGoal(pixels > 0 ? Math.floor(goal + 0.1) : Math.ceil(goal - 0.1)), SETTLE_MS)
}, { passive: false })

addEventListener('scroll', () => {
  canvas.style.opacity = wide.matches ? '' : Math.max(0.14, 1 - scrollY / (0.7 * innerHeight)) // on a phone the text scrolls over the figure
}, { passive: true })

new ResizeObserver(measure).observe(list.parentElement)
document.fonts?.ready.then(measure)
wide.addEventListener('change', () => {
  list.style.height = ''
  measure()
})

/* Panels */

// the box stays out of the page, for no-script readers too, until it can really deliver
if (SUGGEST_URL) document.querySelectorAll('[href="#suggest"], #suggest').forEach(item => { item.hidden = false })

const panels = [...document.querySelectorAll('.panel:not([hidden])')]
const navLinks = [...document.querySelectorAll('nav a')]
const gameButtons = [...document.querySelectorAll('.game')]
const arena = document.querySelector('#arena')
const gameSpace = document.querySelector('#game')
const leave = document.querySelector('#leave')
let stopGame = null
let opener = null
let pointX = innerWidth / 2
let pointY = innerHeight / 2

addEventListener('pointerdown', event => {
  pointX = event.clientX
  pointY = event.clientY
}, { passive: true })

// every change of view opens as a circle from where it was asked for
function reveal(change, x = pointX, y = pointY) {
  if (calm || !document.startViewTransition) {
    change()
    return
  }
  root.dataset.vt = 'reveal'
  const run = document.startViewTransition(change)
  run.finished.finally(() => delete root.dataset.vt)
  run.ready.then(() => {
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    root.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 800, easing: 'cubic-bezier(.7, 0, .15, 1)', pseudoElement: '::view-transition-new(root)' },
    )
  }, () => {}) // a skipped animation still made the change
}

function closeGame() {
  stopGame?.()
  stopGame = null
  arena.hidden = true
}

function route() {
  const open = panels.find(panel => `#${panel.id}` === location.hash)
  panels.forEach(panel => panel.classList.toggle('open', panel === open))
  navLinks.forEach(link => {
    if (open && link.hash === location.hash) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  if (open?.id !== 'play') closeGame()
  if (open) open.querySelector('h2').focus({ preventScroll: true })
  else measure()
}

addEventListener('hashchange', () => reveal(route))
addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  if (stopGame) leave.click()
  else if (location.hash.length > 1) location.hash = ''
})

/* Theme: a darkroom flip between the negative and the print */

const toggle = document.querySelector('#theme')
const themeColor = document.querySelector('meta[name="theme-color"]')

function applyTheme(theme) {
  root.dataset.theme = theme
  const other = theme === 'light' ? 'dark' : 'light'
  toggle.textContent = other
  toggle.setAttribute('aria-label', `Switch to ${other} theme`)
  themeColor.content = theme === 'light' ? '#e7e8ec' : '#08090c'
  art?.theme(theme === 'light')
  if (calm) draw(0)
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // private windows can refuse storage, the toggle still works for this visit
  }
}

toggle.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light'
  const box = toggle.getBoundingClientRect()
  reveal(() => applyTheme(next), box.left + box.width / 2, box.top + box.height / 2)
})

/* Contact */

const copy = document.querySelector('#copy')

copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(EMAIL)
    copy.textContent = 'copied'
    setTimeout(() => { copy.textContent = 'copy' }, 1800)
  } catch {
    location.href = `mailto:${EMAIL}`
  }
})

/* Suggest */

const form = document.querySelector('#suggestion')
const sent = document.querySelector('#sent')

form.addEventListener('submit', async event => {
  event.preventDefault()
  const fields = new FormData(form)
  sent.textContent = 'sending'
  try {
    const reply = await fetch(SUGGEST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: fields.get('text'), website: fields.get('website') }),
    })
    if (!reply.ok) throw new Error(`status ${reply.status}`)
    form.reset()
    sent.textContent = 'Sent. Thank you.'
  } catch {
    sent.textContent = 'Could not send. Your text is still here, please try again.'
  }
})

/* Play */

gameButtons.forEach(button => button.addEventListener('click', async () => {
  const { startDelay, startFish } = await import('./games.js')
  opener = button
  reveal(() => {
    arena.hidden = false
    stopGame = (button.dataset.game === 'delay' ? startDelay : startFish)(gameSpace)
  })
}))

leave.addEventListener('click', () => reveal(() => {
  closeGame()
  opener.focus({ preventScroll: true })
}))

measure()
route()
applyTheme(root.dataset.theme)
requestAnimationFrame(frame)
