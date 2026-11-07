import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approach, delayed, makeRound } from './games.js'

test('the arm acts on the newest command old enough to have arrived', () => {
  const commands = [{ time: 0, x: 0 }, { time: 100, x: 1 }, { time: 200, x: 2 }]
  assert.equal(delayed(commands, 250, 100).x, 1)
  assert.equal(delayed(commands, 250, 0).x, 2)
})

test('before any command has arrived the arm holds its first one', () => {
  assert.equal(delayed([{ time: 100, x: 7 }], 150, 600).x, 7)
})

test('exactly one fish on screen fits the description, every time', () => {
  for (let i = 0; i < 2000; i++) {
    const { fish, fits } = makeRound()
    assert.equal(fish.length, 6)
    assert.equal(fish.filter(fits).length, 1)
  }
})

test('a far touch is reached at top speed, a near one at once', () => {
  assert.deepEqual(approach({ x: 0, y: 0 }, { x: 0, y: 5 }, 1), { x: 0, y: 1 })
  assert.deepEqual(approach({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, 1), { x: 0.3, y: 0.4 })
})
