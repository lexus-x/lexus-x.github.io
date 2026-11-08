import assert from 'node:assert/strict'
import { test } from 'node:test'
import { delayed, realPath } from './games.js'

test('the arm acts on the newest command old enough to have arrived', () => {
  const commands = [{ time: 0, x: 0 }, { time: 100, x: 1 }, { time: 200, x: 2 }]
  assert.equal(delayed(commands, 250, 100).x, 1)
  assert.equal(delayed(commands, 250, 0).x, 2)
})

test('before any command has arrived the arm holds its first one', () => {
  assert.equal(delayed([{ time: 100, x: 7 }], 150, 600).x, 7)
})

test('with no noise the real robot follows the plan exactly', () => {
  const plan = Array.from({ length: 50 }, (_, i) => [i * 6, 0])
  assert.deepEqual(realPath(plan, 6, () => 0.5), plan)
})

test('the error piles up: a longer path ends further off', () => {
  const end = n => {
    const plan = Array.from({ length: n }, (_, i) => [i * 6, 0])
    const [x, y] = realPath(plan, 6, () => 0.9).at(-1)
    return Math.hypot(x - plan.at(-1)[0], y)
  }
  assert.ok(end(120) > end(40) * 2)
})
