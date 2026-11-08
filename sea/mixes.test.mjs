import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { MIXES } from './mixes.mjs'

test('every mix has a photo that exists, a caption and a well-formed beat', () => {
  assert.equal(new Set(MIXES.map(m => m.name)).size, MIXES.length)
  for (const m of MIXES) {
    assert.ok(existsSync(new URL(`./img/${m.photo}`, import.meta.url)), `${m.name}: photo`)
    assert.ok(m.alt && m.line, `${m.name}: alt and line`)
    const { bpm, kick, hat, tones, waves = 0, cafe = 0 } = m.beat
    assert.ok(bpm >= 40 && bpm <= 140, `${m.name}: bpm`)
    for (const level of [waves, cafe]) assert.ok(level >= 0 && level <= 1, `${m.name}: layer level`)
    for (const row of [kick, hat].filter(Boolean)) assert.match(row, /^[x.]+$/)
    for (const v of tones) {
      assert.ok(v.notes.length > 0 && v.dur > 0 && v.cut > 0 && v.gain > 0, `${m.name}: voice`)
      assert.ok(v.notes.some(Boolean), `${m.name}: voice plays something`)
    }
  }
})

test('the taste is covered: waves, coffee, sunset, blue hour', () => {
  const names = MIXES.map(m => m.name.toLowerCase())
  for (const word of ['sunset', 'blue hour', 'coffee']) assert.ok(names.includes(word))
  assert.ok(MIXES.some(m => m.beat.waves > 0))
  assert.ok(MIXES.some(m => m.beat.cafe > 0))
})
