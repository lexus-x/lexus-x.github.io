import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALBUMS } from './albums.mjs'

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
const palettes = Object.fromEntries([...css.matchAll(/\[data-album="(\w+)"\][^{]*\{([^}]*)\}/g)].map(([, id, body]) => [id, Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]))]))

const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('every album has a palette, and the page picks from the same list', () => {
  const picked = html.match(/const albums = \[([^\]]*)\]/)[1].match(/\w+/g)
  assert.deepEqual(Object.keys(palettes).sort(), Object.keys(ALBUMS).sort())
  assert.deepEqual(picked.sort(), Object.keys(ALBUMS).sort())
})

test('text and links stay readable on every album (WCAG AA, 4.5:1)', () => {
  for (const [id, p] of Object.entries(palettes)) {
    for (const surface of ['ground', 'panel']) {
      for (const text of ['ink', 'soft', 'blue']) {
        const ratio = contrast(p[text], p[surface])
        assert.ok(ratio >= 4.5, `${id}: --${text} on --${surface} is ${ratio.toFixed(2)}:1`)
      }
    }
  }
})

test('every album has a beat the sequencer can play', () => {
  for (const [id, { beat }] of Object.entries(ALBUMS)) {
    assert.ok(beat.bpm > 0 && beat.tones.length, `${id}: needs a tempo and at least one voice`)
    for (const part of ['kick', 'snare', 'hat']) if (beat[part]) assert.match(beat[part], /^[x.]+$/, `${id}: ${part} pattern`)
    for (const voice of beat.tones) assert.ok([voice.notes, voice.wave, voice.cut, voice.dur, voice.gain].every(v => v !== undefined), `${id}: voice is missing a setting`)
  }
})
