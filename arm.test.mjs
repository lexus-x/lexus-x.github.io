import test from 'node:test'
import assert from 'node:assert/strict'
import { joints, LINKS, solve } from './arm.mjs'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`)

test('solve puts the tool tip on a reachable target', () => {
  for (const [x, y, tilt] of [[0.8, 0.9, -1.2], [-1.1, 0.6, -1.57], [0.2, 1.5, -0.4]]) {
    const tip = joints(solve(x, y, tilt)).at(-1)
    near(tip[0], x)
    near(tip[1], y)
  }
})

test('an unreachable target stretches the arm toward it', () => {
  const tilt = Math.atan2(30, 40)
  const tip = joints(solve(40, 30, tilt)).at(-1)
  near(Math.atan2(tip[1], tip[0]), tilt)
  assert.ok(Math.hypot(...tip) <= LINKS.reduce((a, b) => a + b) + 1e-9)
})
