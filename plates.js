// One-off generative plates for the gallery: a long exposure of the arm, seeded by the work's name.
import { joints, solve } from './arm.mjs'

const BLUE = '63,123,255'
const GREY = '150,156,170'
const RED = '255,49,73'
const POSES = 420
const BATCH = 6 // poses per stroke call, so a plate paints in a few milliseconds
const FISH_ROUNDS = 3

function generator(text) {
  let h = 2166136261
  for (const letter of text) h = Math.imul(h ^ letter.charCodeAt(0), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const figures = {
  sweep(random) {
    const [a, b, c, d] = [1 + random() * 3, 1 + random() * 4, random() * 6.3, random() * 6.3]
    return u => ({
      x: 1.25 * Math.sin(a * u * 6.3 + c),
      y: 1.05 + 0.65 * Math.sin(b * u * 6.3 + d),
      tilt: -1.2 + Math.sin(u * 9 + c),
    })
  },
  rose(random) {
    const petals = 2 + Math.floor(random() * 4)
    return u => {
      const angle = u * 6.3
      const radius = 0.85 * Math.cos(petals * angle)
      return { x: radius * Math.cos(angle), y: 1.1 + radius * Math.sin(angle), tilt: angle }
    }
  },
  spiral(random) {
    const turns = 3 + random() * 4
    return u => {
      const angle = u * 6.3 * turns
      return { x: u * 1.1 * Math.cos(angle), y: 1.15 + u * 0.8 * Math.sin(angle), tilt: -1.57 + u * 2 }
    }
  },
  // the mathematical fish curve, drawn in light for FishONet
  fish() {
    return u => {
      const angle = u * 6.3 * FISH_ROUNDS
      const sin = Math.sin(angle)
      const cos = Math.cos(angle)
      return { x: 1.15 * (cos - (sin * sin) / Math.SQRT2), y: 1.1 + 1.15 * cos * sin, tilt: -1.57 + 0.5 * Math.sin(angle) }
    }
  },
}

export function paint(canvas, seed, figure) {
  const box = canvas.getBoundingClientRect()
  const pixels = Math.min(devicePixelRatio || 1, 2)
  canvas.width = Math.round((box.width || canvas.clientWidth || 640) * pixels)
  canvas.height = Math.round((box.height || canvas.clientHeight || 480) * pixels)
  const context = canvas.getContext('2d')
  const random = generator(seed)
  const kinds = Object.keys(figures).filter(name => name !== 'fish')
  const path = figures[figure ?? kinds[Math.floor(random() * kinds.length)]](random)
  // every plate is its own crop of the motion: spun, moved and pushed in until it turns abstract
  const named = Boolean(figure)
  const unit = Math.min(canvas.height / 2.4, canvas.width / 3) * (named ? 1 : 1.25 + random() * 1.5)
  const spin = named ? 0 : random() * Math.PI * 2
  const driftX = named ? 0 : (random() - 0.5) * unit
  const driftY = named ? 0 : (random() - 0.5) * unit
  const tints = random() > 0.5 ? [BLUE, GREY, RED] : [RED, GREY, BLUE]
  const threads = named ? [3, 2, 7] : [3 + Math.floor(random() * 3), 2 + Math.floor(random() * 3), 2]
  const widths = named ? [0.075, 0.055, 0.09] : [0.075, 0.055, 0.03]
  const strength = named ? [0.035, 0.05, 0.42] : [0.16, 0.16, 0.16]

  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = '#08090c'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.globalCompositeOperation = 'lighter'
  context.lineWidth = Math.max(0.6, pixels * 0.5)
  context.translate(canvas.width / 2 + driftX, canvas.height / 2 + driftY)
  context.rotate(spin)
  context.translate(0, 1.1 * unit) // the workspace center, so each figure sits on the plate
  const baseX = 0
  const baseY = 0

  let q = null
  const passes = tints.map(() => new Path2D())
  for (let i = 0; i <= POSES; i++) {
    const { x, y, tilt } = path(i / POSES)
    const goal = solve(x, y, tilt)
    q = q ? q.map((angle, j) => angle + (goal[j] - angle) * 0.3) : goal
    const points = joints(q)
    for (let part = 0; part < 3; part++) {
      const [bx, by] = points[part + 1]
      // a named figure draws only the tool's end, so the tip's curve stays a line and not a wide ribbon
      const from = named && part === 2 ? 0.8 : 0
      const ax = points[part][0] + (bx - points[part][0]) * from
      const ay = points[part][1] + (by - points[part][1]) * from
      const length = Math.hypot(bx - ax, by - ay) || 1
      const nx = -(by - ay) / length
      const ny = (bx - ax) / length
      for (let t = 0; t < threads[part]; t++) {
        const offset = (t / Math.max(1, threads[part] - 1) - 0.5) * widths[part]
        passes[part].moveTo(baseX + (ax + nx * offset) * unit, baseY - (ay + ny * offset) * unit)
        passes[part].lineTo(baseX + (bx + nx * offset) * unit, baseY - (by + ny * offset) * unit)
      }
    }
    if (i % BATCH === 0) {
      passes.forEach((pass, part) => {
        context.strokeStyle = `rgba(${tints[part]},${strength[part]})`
        context.stroke(pass)
        passes[part] = new Path2D()
      })
    }
  }
}
