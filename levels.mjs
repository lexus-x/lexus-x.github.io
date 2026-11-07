// The text refines the way a wavelet does: each level adds lines midway between the ones already shown.
export const LEVELS = 6 // 1, 2, 4, 8, 16, 32 lines
export const LINES = 2 ** (LEVELS - 1)

// the level at which the line at this position (from 0) first appears
export function levelOf(position) {
  if (position === 0) return 0
  let level = LEVELS - 1
  for (let i = position; i % 2 === 0; i /= 2) level--
  return level
}

// 0 while the line is out of the text, 1 once it is fully in
export function amount(position, level) {
  const t = Math.min(1, Math.max(0, level - levelOf(position) + 1))
  return position === 0 ? 1 : t * t * (3 - 2 * t)
}

// where every line sits at a level, so lines open continuously as the level moves
export function layout(heights, level) {
  let total = 0
  const offsets = heights.map((height, position) => {
    const top = total
    total += height * amount(position, level)
    return top
  })
  return { offsets, total }
}
