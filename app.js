import { startArt } from './art.js'
import { paint } from './plates.js'

const EMAIL = 'zailalith@gmail.com'
const LEVELS = 11 // 1,024 numbers in the wavelet plate
const EXPOSURE = { main: 1, research: 0.8, projects: 0.7, papers: 0.75, cv: 0.75 }

const root = document.documentElement
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = value => Math.min(1, Math.max(0, value))

const panels = [...document.querySelectorAll('.panel')]
const tabs = [...document.querySelectorAll('.tabs a')]
const marker = document.querySelector('.marker')
const progress = document.querySelector('.progress')
const toast = document.querySelector('.toast')

function panelFor(hash) {
  const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null
  return target?.closest('.panel') ?? panels[0]
}

const art = startArt(document.querySelector('#art'), {
  calm,
  light: root.dataset.theme === 'light',
  tab: panelFor(location.hash).id,
})

function transition(kind, update) {
  if (calm || !document.startViewTransition) {
    update()
    return null
  }
  root.dataset.vt = kind
  const run = document.startViewTransition(update)
  run.ready.catch(() => {}) // a skipped animation still runs update, so there is nothing to report
  run.finished.finally(() => delete root.dataset.vt)
  return run
}

/* Tabs */

let current = null

function moveMarker() {
  const tab = tabs.find(link => link.hash === `#${current}`)
  marker.style.width = `${tab.offsetWidth}px`
  marker.style.transform = `translateX(${tab.offsetLeft}px)`
}

function open(panel, animate) {
  const target = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null
  const swap = () => {
    panels.forEach(other => { other.hidden = other !== panel })
    current = panel.id
    root.dataset.tab = current
    tabs.forEach(link => {
      if (link.hash === `#${current}`) link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    })
    moveMarker()
    if (target && target !== panel) target.scrollIntoView({ behavior: 'instant' })
    else scrollTo({ top: 0, behavior: 'instant' })
    onScroll()
  }
  const from = panels.findIndex(other => other.id === current)
  root.style.setProperty('--dir', panels.indexOf(panel) > from ? 1 : -1)
  art.tab(panel.id, EXPOSURE[panel.id])
  if (animate && panel.id !== current) transition('tab', swap)
  else swap()
  document.title = panel.id === 'main' ? 'Devireddy Lalith Sai' : `${panel.dataset.title}, Devireddy Lalith Sai`
}

addEventListener('hashchange', () => {
  const panel = panelFor(location.hash)
  open(panel, true)
  panel.querySelector('[tabindex="-1"]')?.focus({ preventScroll: true })
})

/* Theme: a darkroom flip between the negative and the print */

const toggle = document.querySelector('#theme')
const themeColor = document.querySelector('meta[name="theme-color"]')

function applyTheme(theme) {
  root.dataset.theme = theme
  const other = theme === 'light' ? 'Dark' : 'Light'
  toggle.textContent = other
  toggle.setAttribute('aria-label', `Switch to ${other.toLowerCase()} theme`)
  themeColor.content = theme === 'light' ? '#e7e8ec' : '#08090c'
  art.theme(theme === 'light')
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // private windows can refuse storage, the toggle still works for this visit
  }
}

toggle.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light'
  const box = toggle.getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  const run = transition('theme', () => applyTheme(next))
  run?.ready.then(() => {
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    root.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 900, easing: 'cubic-bezier(.7, 0, .15, 1)', pseudoElement: '::view-transition-new(root)' },
    )
  })
})

/* Scroll */

const wave = document.querySelector('#wave')
const pin = wave.querySelector('.pin')
const hero = document.querySelector('.hero')
const slider = document.querySelector('#keep')
const readout = document.querySelector('#kept')
const steps = [...document.querySelectorAll('.step')]

function followWave() {
  const box = wave.getBoundingClientRect()
  const travel = box.height - innerHeight
  const keep = 1 + (LEVELS - 1) * clamp(-box.top / travel)
  const arriving = clamp((innerHeight - box.top) / (innerHeight * 0.7))
  const leaving = clamp(box.bottom / (innerHeight * 0.75))
  art.plate(keep, Math.min(arriving, leaving))

  const whole = Math.round(keep)
  readout.textContent = Math.round(2 ** (keep - 1)).toLocaleString('en-US')
  slider.value = whole
  slider.setAttribute('aria-valuetext', `${(2 ** (whole - 1)).toLocaleString('en-US')} of 1,024 numbers`)
  const active = keep < 4 ? 0 : keep < 8 ? 1 : 2
  steps.forEach((step, i) => step.classList.toggle('on', i === active))
  pin.style.opacity = clamp((box.bottom / innerHeight - 0.2) / 0.5)
  root.classList.toggle('quiet', box.bottom < innerHeight * 0.55)
  if (!calm) hero.style.opacity = clamp(1 - scrollY / (innerHeight * 0.7))
}

slider.addEventListener('input', () => {
  const travel = wave.offsetHeight - innerHeight
  const top = wave.getBoundingClientRect().top + scrollY
  scrollTo({ top: top + ((slider.value - 1) / (LEVELS - 1)) * travel, behavior: 'instant' })
})

let queued = false
let lastY = scrollY

function onScroll() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    const span = root.scrollHeight - innerHeight
    progress.style.transform = `scaleX(${span > 0 ? scrollY / span : 0})`
    art.nudge(Math.abs(scrollY - lastY))
    lastY = scrollY
    if (current === 'main') followWave()
    else {
      art.plate(1, 0)
      root.classList.remove('quiet')
    }
  })
}

addEventListener('scroll', onScroll, { passive: true })
addEventListener('resize', () => {
  moveMarker()
  onScroll()
})

const sightings = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    entry.target.classList.add('in')
    sightings.unobserve(entry.target)
  }
}, { rootMargin: '0px 0px -8% 0px' })

document.querySelectorAll('.reveal').forEach(element => sightings.observe(element))

const hanging = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    hanging.unobserve(entry.target)
    const { seed, figure } = entry.target.dataset
    // shortcut: plates paint on idle, so a very fast scroll can show a blank plate for a moment
    const hang = () => paint(entry.target, seed, figure)
    if ('requestIdleCallback' in window) requestIdleCallback(hang, { timeout: 300 })
    else setTimeout(hang)
  }
}, { rootMargin: '300px 0px' })

document.querySelectorAll('canvas[data-seed]').forEach(plate => hanging.observe(plate))

/* Pointer and clicks */

addEventListener('pointermove', event => art.pointer(event.clientX, event.clientY), { passive: true })
addEventListener('pointerdown', event => {
  art.pointer(event.clientX, event.clientY)
  art.flash()
}, { passive: true })

const compareButtons = [...document.querySelectorAll('.segments button')]
const expertLabel = document.querySelector('#expert')
const headLabel = document.querySelector('#head')
const headBar = document.querySelector('#head-bar')

compareButtons.forEach(button => button.addEventListener('click', () => {
  compareButtons.forEach(other => other.setAttribute('aria-pressed', other === button))
  expertLabel.textContent = button.dataset.expert
  headLabel.textContent = button.dataset.head
  headBar.style.setProperty('--size', `${100 / Number(button.dataset.ratio)}%`)
}))

const chips = [...document.querySelectorAll('.chip')]
const works = [...document.querySelectorAll('.wall .work')]

chips.forEach(chip => chip.addEventListener('click', () => {
  // works only get their own transition names while filtering, so tab changes still move as one sheet
  works.forEach((work, i) => { work.style.viewTransitionName = `work-${i}` })
  const run = transition('filter', () => {
    chips.forEach(other => other.setAttribute('aria-pressed', other === chip))
    works.forEach(work => {
      work.hidden = chip.dataset.kind !== 'all' && work.dataset.kind !== chip.dataset.kind
      work.classList.add('in')
    })
  })
  const clear = () => works.forEach(work => { work.style.viewTransitionName = '' })
  if (run) run.finished.finally(clear)
  else clear()
}))

let toastTimer

document.querySelector('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(EMAIL)
    toast.textContent = 'Email copied'
    toast.classList.add('on')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toast.classList.remove('on'), 2200)
  } catch {
    location.href = `mailto:${EMAIL}`
  }
})

applyTheme(root.dataset.theme)
open(panelFor(location.hash), false)
document.fonts?.ready.then(moveMarker)
