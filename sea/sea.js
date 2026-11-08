import { startBeats } from '../beats.mjs'
import { MIXES } from './mixes.mjs'

// the card nearest the middle of the screen lights up
const watch = new IntersectionObserver(entries => {
  entries.forEach(e => e.target.classList.toggle('lit', e.isIntersecting))
}, { rootMargin: '-35% 0px -35% 0px' })
document.querySelectorAll('.card').forEach(c => watch.observe(c))

// every visit gets a random mood: the hero photo and, once you tap Sound, the music match
const beats = startBeats()
const snd = document.querySelector('#snd')
const another = document.querySelector('#mix')
const photo = document.querySelector('.hero-photo img')
const line = document.querySelector('#mixline')
let mix = null

function show(next) {
  mix = next
  photo.src = `img/${mix.photo}`
  photo.style.imageRendering = mix.pixel ? "pixelated" : "" // keep pixel art crisp
  photo.alt = mix.alt
  photo.closest(".photo").classList.toggle("pixel", Boolean(mix.pixel))
  line.textContent = `Now: ${mix.name}, ${mix.line}`
  if (beats.playing) beats.play(mix.beat)
}

function other() {
  const rest = MIXES.filter(m => m !== mix)
  return rest[Math.floor(Math.random() * rest.length)]
}

photo.addEventListener('load', () => photo.closest('.photo').classList.add('ready'))
photo.addEventListener('error', () => photo.closest('.photo').classList.add('ready'))
show(other())
if (photo.complete) photo.closest('.photo').classList.add('ready') // the same photo again fires no load event

snd.addEventListener('click', () => {
  if (beats.playing) beats.stop()
  else beats.play(mix.beat)
  snd.setAttribute('aria-pressed', beats.playing)
  snd.textContent = beats.playing ? '♪ Sound on' : '♪ Sound off'
})
another.addEventListener('click', () => show(other()))
