// Two-link planar arm, drawn by the plotter that writes the name and by the delay game.

// Elbow and tool tip for a base at (bx, by) reaching for (x, y). Out of reach, it stretches toward the target.
export function reach(bx, by, x, y, a, b) {
  const distance = Math.min(Math.max(Math.hypot(x - bx, y - by), Math.abs(a - b) + 1e-6), a + b - 1e-6)
  const bend = Math.acos(Math.min(1, Math.max(-1, (a * a + distance * distance - b * b) / (2 * a * distance))))
  const shoulder = Math.atan2(y - by, x - bx) - bend
  const ex = bx + a * Math.cos(shoulder)
  const ey = by + a * Math.sin(shoulder)
  const forearm = Math.atan2(y - ey, x - ex)
  return { ex, ey, tx: ex + b * Math.cos(forearm), ty: ey + b * Math.sin(forearm) }
}

export function themeColors() {
  const style = getComputedStyle(document.documentElement)
  const color = name => style.getPropertyValue(name).trim()
  return { ink: color('--ink'), soft: color('--soft'), panel: color('--panel'), hair: color('--hair'), red: color('--red'), blue: color('--blue'), serif: color('--serif') }
}

function rails(g, x0, y0, x1, y1, gap) {
  const normal = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2
  const ox = Math.cos(normal) * gap
  const oy = Math.sin(normal) * gap
  g.moveTo(x0 + ox, y0 + oy)
  g.lineTo(x1 + ox, y1 + oy)
  g.moveTo(x0 - ox, y0 - oy)
  g.lineTo(x1 - ox, y1 - oy)
}

// Each link is two rails, like a technical drawing, and the tool tip glows. Returns where the tip landed.
export function drawArm(g, colors, bx, by, x, y, a, b) {
  const { ex, ey, tx, ty } = reach(bx, by, x, y, a, b)
  g.save()
  g.lineCap = 'round'
  g.strokeStyle = colors.soft
  g.lineWidth = 1.4
  g.beginPath()
  rails(g, bx, by, ex, ey, 4)
  rails(g, ex, ey, tx, ty, 2.5)
  g.stroke()
  g.fillStyle = colors.panel
  for (const [px, py, r] of [[bx, by, 9], [ex, ey, 6]]) {
    g.beginPath()
    g.arc(px, py, r, 0, 2 * Math.PI)
    g.fill()
    g.stroke()
  }
  g.fillStyle = colors.red
  g.shadowColor = colors.red
  g.shadowBlur = 14
  g.beginPath()
  g.arc(tx, ty, 4, 0, 2 * Math.PI)
  g.fill()
  g.restore()
  return [tx, ty]
}
