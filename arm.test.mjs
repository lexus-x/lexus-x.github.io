import test from 'node:test'
import assert from 'node:assert/strict'
import { reach } from './arm.mjs'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`)

test('the tip lands on a reachable target and the upper link keeps its length', () => {
  for (const [x, y] of [[40, -60], [-70, -20], [10, -95]]) {
    const { ex, ey, tx, ty } = reach(0, 0, x, y, 60, 50)
    near(tx, x)
    near(ty, y)
    near(Math.hypot(ex, ey), 60)
  }
})

test('an unreachable target stretches the arm straight toward it', () => {
  const { tx, ty } = reach(0, 0, 300, -400, 60, 50)
  near(Math.hypot(tx, ty), 110)
  assert.ok(Math.abs(Math.atan2(ty, tx) - Math.atan2(-400, 300)) < 1e-3) // the reach is clamped just short of straight
})
