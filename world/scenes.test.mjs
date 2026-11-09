import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { SCENES, buffer, colours } from './scenes.mjs'

const sizes = [[98, 211], [211, 100], [154, 96], [40, 30]] // phone, desktop, tile, tiny

test('every scene paints every pixel at every size, at any time and lean', () => {
  for (const [name, scene] of Object.entries(SCENES)) {
    for (const [w, h] of sizes) {
      for (const t of [0, 7.3, 13, 20, 28, 36, 44, 52, 60, 1234.5]) { // 0-64 s walks through all eight menu stories, 8 s each
        const B = buffer(w, h)
        scene.draw(B, t, { x: t ? 1 : -1 })
        assert.equal(B.px.indexOf(0), -1, `${name} ${w}x${h} at t=${t} left a hole`)
      }
    }
  }
})

test('no disturbingly bright colours: muted chroma, no pure white', () => {
  for (const [name, scene] of Object.entries(SCENES)) {
    for (const c of colours(scene)) {
      const hex = `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
      assert.ok((Math.max(...c) - Math.min(...c)) / 255 <= 0.42, `${name}: ${hex} is too saturated`)
      assert.ok(Math.max(...c) <= 245, `${name}: ${hex} is too close to white`)
    }
  }
})

test('every place has its music file and a credit on the page', () => {
  const credits = JSON.parse(readFileSync(new URL('./music/credits.json', import.meta.url), 'utf8'))
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
  for (const track of [...new Set(Object.values(SCENES).map(s => s.track))]) {
    assert.ok(existsSync(new URL(`./music/${track}.mp3`, import.meta.url)), `${track}.mp3 is missing`)
    const credit = credits.find(c => c.file === `${track}.mp3`)
    assert.ok(credit, `${track}.mp3 has no credit`)
    assert.ok(page.includes(credit.author), `${credit.author} is not credited on the page`)
  }
})
