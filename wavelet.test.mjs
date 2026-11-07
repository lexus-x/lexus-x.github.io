import test from 'node:test'
import assert from 'node:assert/strict'
import { haar, keepLargest, resample, unhaar } from './wavelet.mjs'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`)

test('the wavelet split rebuilds exactly', () => {
  const signal = [3, 1, 4, 1, 5, 9, 2, 6]
  unhaar(haar(signal)).forEach((value, i) => near(value, signal[i]))
})

test('resampling spaces points evenly from end to end', () => {
  const points = resample([[0, 0], [2, 0], [10, 0]], 6)
  assert.equal(points.length, 6)
  points.forEach(([x, y], i) => { near(x, i * 2); near(y, 0) })
})

test('keeping every number gives the resampled path back', () => {
  const path = [[0, 0], [5, 8], [9, 3], [14, 11]]
  const even = resample(path, 64)
  keepLargest(path, 128).forEach(([x, y], i) => { near(x, even[i][0]); near(y, even[i][1]) })
})

test('keeping one number collapses a flat line to its average point', () => {
  keepLargest([[0, 0], [10, 0]], 1).forEach(([x, y]) => { near(x, 5); near(y, 0) })
})
