import test from 'node:test'
import assert from 'node:assert/strict'
import { haar, pickAndPlace, rebuild } from './wavelet.mjs'

const signal = Array.from({ length: 128 }, (_, i) => pickAndPlace(i / 127))
const bands = haar(signal)

test('bands hold exactly one number per sample', () => {
  assert.deepEqual(bands.map(b => b.length), [1, 1, 2, 4, 8, 16, 32, 64])
})

test('keeping every band rebuilds the signal', () => {
  rebuild(bands, 8).forEach((value, i) => assert.ok(Math.abs(value - signal[i]) < 1e-12))
})

test('keeping one band gives the mean', () => {
  const mean = signal.reduce((a, b) => a + b) / signal.length
  rebuild(bands, 1).forEach(value => assert.ok(Math.abs(value - mean) < 1e-12))
})

test('a fractional keep lands halfway between two levels', () => {
  const low = rebuild(bands, 4)
  const high = rebuild(bands, 5)
  rebuild(bands, 4.5).forEach((value, i) => assert.ok(Math.abs(value - (low[i] + high[i]) / 2) < 1e-12))
})

test('each kept band moves the rebuild closer to the signal', () => {
  const error = keep => rebuild(bands, keep).reduce((sum, v, i) => sum + (v - signal[i]) ** 2, 0)
  for (let keep = 1; keep < 8; keep++) assert.ok(error(keep + 1) <= error(keep))
})
