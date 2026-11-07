// Haar wavelet split and rebuild, plus the synthetic motion the home page plots.

const ease = t => t * t * (3 - 2 * t)
const ramp = (t, from, to, size) => size * ease(Math.min(1, Math.max(0, (t - from) / (to - from))))

// Arm height through one pick and place, t in [0, 1]. Synthetic, for illustration only.
export function pickAndPlace(t) {
  const reach = ramp(t, 0.04, 0.3, -0.48)
  const lift = ramp(t, 0.42, 0.62, 0.68)
  const lower = ramp(t, 0.72, 0.85, -0.5)
  const leave = ramp(t, 0.9, 1, 0.42)
  const grasp = t > 0.36 ? 0.06 : 0
  const release = t > 0.875 ? -0.07 : 0
  const sway = t > 0.62 && t < 0.72 ? 0.012 * Math.sin(2 * Math.PI * 12 * t) : 0
  return 0.6 + reach + lift + lower + leave + grasp + release + sway
}

// Returns bands coarsest first: [average, 1 detail, 1, 2, 4, ...]. Length of signal must be a power of 2.
export function haar(signal) {
  const details = []
  let average = signal
  while (average.length > 1) {
    const next = []
    const detail = []
    for (let i = 0; i < average.length; i += 2) {
      next.push((average[i] + average[i + 1]) / 2)
      detail.push((average[i] - average[i + 1]) / 2)
    }
    details.unshift(detail)
    average = next
  }
  return [average, ...details]
}

// Inverse transform using the first `keep` bands. A fractional keep fades the next band in,
// so scrolling morphs the line instead of jumping between levels.
export function rebuild(bands, keep) {
  let signal = bands[0]
  for (let band = 1; band < bands.length; band++) {
    const detail = bands[band]
    const weight = Math.min(1, Math.max(0, keep - band))
    signal = signal.flatMap((value, i) => [value + detail[i] * weight, value - detail[i] * weight])
  }
  return signal
}
