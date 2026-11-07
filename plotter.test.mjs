import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hatch } from './plotter.js'

test('rows of ink alternate direction so the pen snakes down the name', () => {
  const width = 5
  const rgba = new Uint8Array(width * 2 * 4)
  const inkAt = (x, y) => { rgba[(y * width + x) * 4 + 3] = 255 }
  for (const x of [1, 2, 3]) inkAt(x, 0)
  for (const x of [0, 1, 3, 4]) inkAt(x, 1)
  assert.deepEqual(hatch(rgba, width, 2, 1), [
    { x0: 1, x1: 3, y: 0.5 },
    { x0: 4, x1: 3, y: 1.5 },
    { x0: 1, x1: 0, y: 1.5 },
  ])
})

test('an empty mask gives nothing to draw', () => {
  assert.deepEqual(hatch(new Uint8Array(4 * 4 * 4), 4, 4, 1), [])
})
