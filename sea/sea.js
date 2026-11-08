import { startBeats } from '../beats.mjs'
import { ALBUMS } from '../albums.mjs'

// the card nearest the middle of the screen lights up
const cards = [...document.querySelectorAll('.card')]
const watch = new IntersectionObserver(entries => {
  entries.forEach(e => e.target.classList.toggle('lit', e.isIntersecting))
}, { rootMargin: '-35% 0px -35% 0px' })
cards.forEach(c => watch.observe(c))

// sound is off until tapped
const beats = startBeats()
const snd = document.querySelector('#snd')
snd.addEventListener('click', () => {
  if (beats.playing) beats.stop()
  else beats.play(ALBUMS.cur.beat)
  snd.setAttribute('aria-pressed', beats.playing)
  snd.textContent = beats.playing ? '♪ Sound on' : '♪ Sound off'
})
