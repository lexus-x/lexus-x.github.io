import { SCENES, buffer } from './scenes.mjs'

const $ = s => document.querySelector(s)
const root = document.documentElement
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
const hub = $('#hub')
const foot = $('#foot')
const stage = $('#stage')
const back = $('#back')
const snd = $('#snd')
const scenes = [...document.querySelectorAll('.scene')]
history.scrollRestoration = 'manual'

/* Sound: one track per place, crossfaded with Web Audio gains (iPhones ignore audio.volume) */

let ctx = null
let master = null
let playing = null
let soundOn = false
let place = 'menu'
const tracks = new Map()

function boot() {
  if (navigator.audioSession) navigator.audioSession.type = 'playback' // iPhones otherwise stay silent with the ringer switch off
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.7
    master.connect(ctx.destination)
    addEventListener('visibilitychange', () => (document.hidden ? ctx.suspend() : soundOn && ctx.resume()))
  }
  ctx.resume()
}

function load(name) {
  if (!tracks.has(name)) {
    tracks.set(name, fetch(`music/${name}.mp3`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then(b => ctx.decodeAudioData(b)))
  }
  return tracks.get(name)
}

function fadeOut() {
  if (!playing) return
  const { src, gain } = playing
  gain.gain.cancelScheduledValues(ctx.currentTime)
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.35)
  src.stop(ctx.currentTime + 1.6)
  playing = null
  showTrack()
}

async function music(name, loop = true) {
  if (!soundOn || playing?.name === name) return
  let track
  try {
    track = await load(name)
  } catch {
    tracks.delete(name)
    if (!loop) music(place) // no jingle: go straight to the place's music
    return
  }
  if (!soundOn || (loop && name !== place) || playing?.name === name) return // the visitor moved on, or the same track already started, while it loaded
  fadeOut()
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2)
  const src = ctx.createBufferSource()
  src.buffer = track
  src.loop = loop
  src.connect(gain).connect(master)
  src.start()
  playing = { name, src, gain }
  showTrack()
  if (!loop) src.onended = () => playing?.src === src && ((playing = null), music(place))
}

/* Now: the track that is playing and the time in Changwon, kept live */

const nowTrack = $('#now-track')
const nowTime = $('#now-time')
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
let titles = {}

function showTrack() {
  nowTrack.textContent = playing ? `♪ ${titles[playing.name] ?? playing.name}` : '♪ sound off'
}

const tickClock = () => { nowTime.textContent = `@ Changwon, ${clock.format(new Date())} KST` }
tickClock()
setInterval(tickClock, 15000)
fetch('music/credits.json')
  .then(r => r.json())
  .then(list => {
    titles = Object.fromEntries(list.map(c => [c.file.replace('.mp3', ''), `${c.title}, ${c.author}`]))
    showTrack()
  })
  .catch(() => {}) // without the list, the file name still shows

function setSound(on, first = place) {
  soundOn = on
  snd.setAttribute('aria-pressed', on)
  snd.textContent = on ? '♪ Sound on' : '♪ Sound off'
  if (on) {
    boot()
    music(first, first === place)
  } else if (ctx) fadeOut()
}

snd.addEventListener('click', () => setSound(!soundOn))

/* Scenes: each canvas is a small pixel buffer scaled up by whole device pixels */

const views = new Map()
const live = new Set()
const lean = { x: 0 }
let aim = 0

function fit(canvas) {
  const view = views.get(canvas)
  const box = canvas.parentElement.getBoundingClientRect()
  if (!box.width || !box.height) return
  const dpr = devicePixelRatio || 1
  const scale = Math.max(2, Math.round((Math.min(box.width, box.height) * dpr) / (100 * (view.scene.res ?? 1))))
  const w = Math.ceil((box.width * dpr) / scale)
  const h = Math.ceil((box.height * dpr) / scale)
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${(w * scale) / dpr}px`
  canvas.style.height = `${(h * scale) / dpr}px`
  view.g = canvas.getContext('2d')
  view.img = view.g.createImageData(w, h)
  view.B = buffer(w, h, view.img.data)
  paint(canvas, performance.now() / 1000)
}

function paint(canvas, t) {
  const view = views.get(canvas)
  if (!view.B) return
  view.scene.draw(view.B, t, lean)
  view.g.putImageData(view.img, 0, 0)
}

const resized = new ResizeObserver(entries => entries.forEach(e => fit(e.target.querySelector('canvas'))))
const seen = new IntersectionObserver(entries => entries.forEach(e => {
  const canvas = e.target.querySelector('canvas')
  e.isIntersecting ? live.add(canvas) : live.delete(canvas)
}))

for (const tile of document.querySelectorAll('.tile[data-scene]')) {
  const canvas = tile.querySelector('canvas')
  views.set(canvas, { scene: SCENES[tile.dataset.scene] })
  resized.observe(tile.querySelector('.art'))
  seen.observe(tile)
}
const stageCanvas = stage.querySelector('canvas')
views.set(stageCanvas, { scene: SCENES.menu })
resized.observe(stage)

addEventListener('pointermove', e => { aim = (e.clientX / innerWidth) * 2 - 1 }, { passive: true })
addEventListener('deviceorientation', e => { if (e.gamma != null) aim = Math.max(-1, Math.min(1, e.gamma / 30)) }) // shortcut: no iOS motion prompt, so iPhones get the slow drift only; add requestPermission to the Start tap if tilt matters there

let lastPaint = 0
function frame(ms) {
  requestAnimationFrame(frame)
  const t = ms / 1000
  if (!calm) lean.x += (aim * 0.8 + 0.35 * Math.sin(t * 0.25) - lean.x) * 0.05 // the view leans toward the pointer and drifts on its own
  if (ms - lastPaint < 50) return // pixel scenes move at 20 fps, which reads as retro
  lastPaint = ms
  if (!stage.hidden) paint(stageCanvas, t)
  else if (!hub.hidden) {
    live.forEach(canvas => paint(canvas, t))
    const title = SCENES.menu.caption(t) // names the story playing in the name tile's sky
    if (caption.textContent !== title) caption.textContent = title
  }
}
const caption = $('#story')
requestAnimationFrame(frame)

/* Places: a tile opens its scene full screen, as a circle from where it was tapped */

let pointX = innerWidth / 2
let pointY = innerHeight / 2
let hubY = 0
let tile = null

addEventListener('pointerdown', e => { pointX = e.clientX; pointY = e.clientY }, { passive: true })

hub.addEventListener('click', e => {
  const link = e.target.closest('a[href^="#"]')
  if (!link?.hash) return
  tile = link
  hubY = scrollY
  if (e.detail) return
  const box = link.getBoundingClientRect() // from the keyboard, the circle starts at the tile itself
  pointX = box.left + box.width / 2
  pointY = box.top + box.height / 2
})

function reveal(change, x = pointX, y = pointY) {
  if (!document.startViewTransition) return change()
  if (calm) return document.startViewTransition(change) // a plain crossfade
  root.dataset.vt = 'reveal'
  const run = document.startViewTransition(change)
  run.finished.finally(() => delete root.dataset.vt)
  run.ready.then(() => {
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    root.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 850, easing: 'cubic-bezier(.7, 0, .15, 1)', pseudoElement: '::view-transition-new(root)' },
    )
  }, () => {}) // a skipped animation still made the change
}

function route() {
  const open = scenes.find(s => `#${s.id}` === location.hash)
  scenes.forEach(s => s.classList.toggle('open', s === open))
  hub.hidden = foot.hidden = Boolean(open)
  stage.hidden = back.hidden = !open
  if (open?.id !== 'play') closeGame()
  if (open) {
    views.get(stageCanvas).scene = SCENES[open.dataset.scene]
    fit(stageCanvas)
    scrollTo(0, 0)
    open.querySelector('h2').focus({ preventScroll: true })
  } else {
    scrollTo(0, hubY)
    tile?.focus({ preventScroll: true })
    tile = null
  }
  place = open ? SCENES[open.dataset.scene].track : 'menu'
  music(place)
}

addEventListener('hashchange', () => reveal(route))
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  if (stopGame) leave.click()
  else if (location.hash.length > 1) location.hash = ''
})

/* Games: the five from the old site, in full screen */

const arena = $('#arena')
const gameSpace = $('#game')
const leave = $('#leave')
let stopGame = null
let gameButton = null

function closeGame() {
  stopGame?.()
  stopGame = null
  arena.hidden = true
}

document.querySelectorAll('.game').forEach(button => button.addEventListener('click', async () => {
  const games = await import('../games.js')
  const start = { delay: games.startDelay, keep: games.startKeep, reviewer: games.startReviewer, grasp: games.startGrasp, sim: games.startSim }[button.dataset.game]
  gameButton = button
  reveal(() => {
    arena.hidden = false
    stopGame = start(gameSpace)
    leave.focus({ preventScroll: true })
  })
}))

leave.addEventListener('click', () => reveal(() => {
  closeGame()
  gameButton?.focus({ preventScroll: true })
}))

/* The opening: blank, the name types itself, a loading bar, then the choice. A tap skips the wait. */

const intro = $('#intro')
const start = $('#start')

function ready() {
  if (!start.hidden) return
  intro.classList.add('ready')
  start.hidden = false
  $('#with').focus({ preventScroll: true })
}
const wait = setTimeout(ready, 3300) // the opening plays even with reduced motion: typing and squares reveal in place, nothing travels
intro.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return
  clearTimeout(wait)
  ready()
})

// the intro breaks into squares that vanish in random order, like an old game screen
function dissolve(done) {
  const cell = 24
  const cols = Math.ceil(innerWidth / cell)
  const rows = Math.ceil(innerHeight / cell)
  const cover = document.createElement('canvas')
  cover.className = 'dissolve'
  cover.width = cols
  cover.height = rows
  cover.style.width = `${cols * cell}px`
  cover.style.height = `${rows * cell}px`
  const g = cover.getContext('2d')
  g.fillRect(0, 0, cols, rows)
  document.body.append(cover)
  intro.remove()
  const order = [...Array(cols * rows).keys()]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const begin = performance.now()
  let cleared = 0
  requestAnimationFrame(function step(now) {
    const upto = Math.min(order.length, Math.round(((now - begin) / 900) * order.length))
    for (; cleared < upto; cleared++) g.clearRect(order[cleared] % cols, Math.floor(order[cleared] / cols), 1, 1)
    if (upto < order.length) requestAnimationFrame(step)
    else {
      cover.remove()
      done()
    }
  })
}

function enter(withSound) {
  clearTimeout(wait)
  if (withSound) setSound(true, 'intro')
  dissolve(() => (location.hash.length > 1 ? $('.scene.open h2') : $('#name')).focus({ preventScroll: true }))
}
$('#with').addEventListener('click', () => enter(true))
$('#without').addEventListener('click', () => enter(false))

route()
