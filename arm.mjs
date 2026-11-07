// Planar three-link arm: the subject of every image on the site.

export const LINKS = [0.92, 0.78, 0.36]

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

// Joint angles that put the tool tip at (x, y) with the tool pointing along `tilt`.
// Out-of-reach targets stretch the arm toward them instead of failing.
export function solve(x, y, tilt, elbow = -1) {
  const [a, b, c] = LINKS
  const wristX = x - c * Math.cos(tilt)
  const wristY = y - c * Math.sin(tilt)
  const distance = Math.hypot(wristX, wristY) || 1e-6
  const reach = clamp(distance, Math.abs(a - b) + 1e-3, a + b - 1e-3)
  const bend = elbow * Math.acos(clamp((reach ** 2 - a ** 2 - b ** 2) / (2 * a * b), -1, 1))
  const shoulder = Math.atan2(wristY, wristX) - Math.atan2(b * Math.sin(bend), a + b * Math.cos(bend))
  return [shoulder, bend, tilt - shoulder - bend]
}

// Base, elbow, wrist and tool tip, with the base at the origin.
export function joints(q) {
  const points = [[0, 0]]
  let angle = 0
  LINKS.forEach((length, i) => {
    angle += q[i]
    const [x, y] = points[i]
    points.push([x + length * Math.cos(angle), y + length * Math.sin(angle)])
  })
  return points
}
