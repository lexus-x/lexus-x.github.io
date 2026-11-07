import assert from 'node:assert/strict'
import { test } from 'node:test'
import { amount, layout, levelOf, LEVELS, LINES } from './levels.mjs'

const positions = Array.from({ length: LINES }, (_, i) => i)

test('every level doubles the lines', () => {
  for (let level = 0; level < LEVELS; level++) {
    assert.equal(positions.filter(p => levelOf(p) <= level).length, 2 ** level)
  }
})

test('new lines land midway between the ones already there', () => {
  assert.deepEqual(positions.filter(p => levelOf(p) <= 2), [0, 8, 16, 24])
})

test('whole levels show lines fully or not at all', () => {
  for (const level of [0, 1, 2, 3, 4, 5]) {
    for (const p of positions) assert.equal(amount(p, level), levelOf(p) <= level ? 1 : 0)
  }
})

test('layout stacks only what is shown', () => {
  const heights = positions.map(() => 20)
  assert.equal(layout(heights, 0).total, 20)
  assert.equal(layout(heights, 5).total, 640)
  assert.equal(layout(heights, 1).offsets[16], 20)
})

test('the text never jumps as the level moves', () => {
  const heights = positions.map(() => 20)
  let before = layout(heights, 0).offsets
  for (let level = 0.01; level <= 5; level += 0.01) {
    const { offsets } = layout(heights, level)
    offsets.forEach((y, i) => assert.ok(Math.abs(y - before[i]) < 40))
    before = offsets
  }
})
