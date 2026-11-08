import { startLines } from './lines.js'
import { ALBUMS, pick } from './albums.mjs'
import { startBeats } from './beats.mjs'

const EMAIL = 'zailalith@gmail.com'
// shortcut: the review tile and panel stay hidden until the Worker in worker/ is deployed, then this holds its URL.
// Showing that eighth tile also needs a slot in the wide grid in style.css, or it lands in a fourth row.
const SUGGEST_URL = ''

const root = document.documentElement
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
const main = document.querySelector('main')

/* Opening: the name rises out of signal lines in this visit's album colours */

const lines = startLines(document.querySelector('#lines'))
document.fonts?.load(`400 100px ${getComputedStyle(root).getPropertyValue('--heavy')}`).then(() => lines.restyle(), () => {}) // rebuild once the real face arrives
lines.play()

/* Sound: a beat in an album's mood, off until tapped; "New beat" moves to another */

const sound = document.querySelector('#now')
const another = document.querySelector('#shuffle')
const beatName = document.querySelector('#beat')
const memes = [...document.querySelectorAll('.meme')]
const beats = startBeats()
let album = ''

function wear(id) {
  album = id
  beatName.textContent = `Beat: ${ALBUMS[id].name} mood`
  if (beats.playing) beats.play(ALBUMS[id].beat)
  const meme = pick(memes)
  memes.forEach(item => { item.hidden = item !== meme })
  try {
    localStorage.setItem('album', id) // the next visit starts on a different beat
  } catch {
    // private windows can refuse storage; the next visit is just random
  }
}

sound.addEventListener('click', () => {
  if (beats.playing) beats.stop()
  else beats.play(ALBUMS[album].beat)
  sound.setAttribute('aria-pressed', beats.playing)
  sound.textContent = beats.playing ? '\u266a Sound on' : '\u266a Sound off'
})
another.addEventListener('click', () => wear(pick(Object.keys(ALBUMS).filter(id => id !== album))))

/* Panels: each tile opens its panel as a circle from where it was touched */

// the box stays out of the page, for no-script readers too, until it can really deliver
if (SUGGEST_URL) document.querySelectorAll('[href="#suggest"], #suggest').forEach(item => { item.hidden = false })

const panels = [...document.querySelectorAll('.panel:not([hidden])')]
const arena = document.querySelector('#arena')
const gameSpace = document.querySelector('#game')
const leave = document.querySelector('#leave')
const playPanel = document.querySelector('#play')
let stopGame = null
let gameButton = null
let tile = null // the tile that opened the panel, so closing returns there
let pointX = innerWidth / 2
let pointY = innerHeight / 2

addEventListener('pointerdown', event => {
  pointX = event.clientX
  pointY = event.clientY
}, { passive: true })

main.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]')
  if (!link?.hash) return
  tile = link
  if (event.detail) return
  const box = link.getBoundingClientRect() // from the keyboard, the circle starts at the tile itself
  pointX = box.left + box.width / 2
  pointY = box.top + box.height / 2
})

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
  playPanel.inert = false
}

function route() {
  const open = panels.find(panel => `#${panel.id}` === location.hash)
  panels.forEach(panel => panel.classList.toggle('open', panel === open))
  main.inert = Boolean(open)
  if (open?.id !== 'play') closeGame()
  if (open) {
    open.scrollTop = 0
    open.querySelector('h2').focus({ preventScroll: true })
  } else if (tile) {
    tile.focus({ preventScroll: true })
    tile = null
  }
}

addEventListener('hashchange', () => reveal(route))
addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  if (stopGame) leave.click()
  else if (location.hash.length > 1) location.hash = ''
})

/* Contact: the address fills the screen and one tap copies it */

const mail = document.querySelector('#mail')
const mailStatus = document.querySelector('#mail-status')

mail.addEventListener('click', async event => {
  const box = mail.getBoundingClientRect()
  mail.style.setProperty('--x', `${event.detail ? event.clientX - box.left : box.width / 2}px`)
  mail.style.setProperty('--y', `${event.detail ? event.clientY - box.top : box.height / 2}px`)
  try {
    await navigator.clipboard.writeText(EMAIL)
  } catch {
    location.href = `mailto:${EMAIL}`
    return
  }
  mailStatus.textContent = 'Email address copied.'
  mail.classList.add('copied')
  setTimeout(() => mail.classList.remove('copied'), 1600)
})

/* Review: anonymous, like peer review */

const form = document.querySelector('#review')
const sent = document.querySelector('#sent')

form.addEventListener('submit', async event => {
  event.preventDefault()
  const fields = new FormData(form)
  const verdict = fields.get('verdict') ?? ''
  const text = String(fields.get('text')).trim()
  if (!verdict && !text) {
    sent.textContent = 'Pick a verdict or write a comment first.'
    return
  }
  sent.textContent = 'sending'
  try {
    const reply = await fetch(SUGGEST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verdict, text, website: fields.get('website') }),
    })
    if (!reply.ok) throw new Error(`status ${reply.status}`)
    form.reset()
    sent.textContent = 'Sent. Thank you.'
  } catch {
    sent.textContent = 'Could not send. Your review is still here, please try again.'
  }
})

/* Play */

document.querySelectorAll('.game').forEach(button => button.addEventListener('click', async () => {
  const games = await import('./games.js')
  const start = { delay: games.startDelay, keep: games.startKeep, reviewer: games.startReviewer, grasp: games.startGrasp, sim: games.startSim, album: games.startAlbum }[button.dataset.game]
  gameButton = button
  reveal(() => {
    arena.hidden = false
    playPanel.inert = true
    stopGame = start(gameSpace)
    if (!arena.contains(document.activeElement)) leave.focus({ preventScroll: true })
  })
}))

leave.addEventListener('click', () => reveal(() => {
  closeGame()
  gameButton.focus({ preventScroll: true })
}))

route()
let last = null
try {
  last = localStorage.getItem('album')
} catch {
  // see wear()
}
wear(pick(Object.keys(ALBUMS).filter(id => id !== last)))
