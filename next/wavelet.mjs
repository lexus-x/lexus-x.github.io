// Orthonormal Haar wavelet for arrays whose length is a power of two, and the "keep only the largest numbers" rebuild.

export function haar(signal) {
  const out = signal.slice()
  for (let n = out.length; n > 1; n >>= 1) {
    const part = out.slice(0, n)
    for (let i = 0; i < n / 2; i++) {
      out[i] = (part[2 * i] + part[2 * i + 1]) / Math.SQRT2
      out[n / 2 + i] = (part[2 * i] - part[2 * i + 1]) / Math.SQRT2
    }
  }
  return out
}

export function unhaar(coefficients) {
  const out = coefficients.slice()
  for (let n = 2; n <= out.length; n <<= 1) {
    const part = out.slice(0, n)
    for (let i = 0; i < n / 2; i++) {
      out[2 * i] = (part[i] + part[n / 2 + i]) / Math.SQRT2
      out[2 * i + 1] = (part[i] - part[n / 2 + i]) / Math.SQRT2
    }
  }
  return out
}

// n points evenly spaced along a path of at least two points
export function resample(points, n) {
  const along = [0]
  for (let i = 1; i < points.length; i++) along.push(along[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]))
  const total = along.at(-1) || 1
  const out = []
  let j = 0
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1)
    while (j < points.length - 2 && along[j + 1] < s) j++
    const f = (s - along[j]) / (along[j + 1] - along[j] || 1)
    out.push([points[j][0] + (points[j + 1][0] - points[j][0]) * f, points[j][1] + (points[j + 1][1] - points[j][1]) * f])
  }
  return out
}

// Rebuilds a path from only its `keep` largest wavelet numbers, ranked across x and y together.
export function keepLargest(points, keep, n = 64) {
  const even = resample(points, n)
  const xs = haar(even.map(p => p[0]))
  const ys = haar(even.map(p => p[1]))
  const ranked = [...xs.map((v, i) => [Math.abs(v), xs, i]), ...ys.map((v, i) => [Math.abs(v), ys, i])].sort((p, q) => q[0] - p[0])
  for (const [, band, i] of ranked.slice(keep)) band[i] = 0
  const x = unhaar(xs)
  const y = unhaar(ys)
  return x.map((value, i) => [value, y[i]])
}
