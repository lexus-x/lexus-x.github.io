// Six pixel scenes, drawn into a small buffer and scaled up by whole pixels. Nothing here is a photo or a download.
// Each draw(B, t, v): B is { w, h, px: Uint32Array }, t is seconds, v.x is the parallax lean, -1..1.

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const pack = ([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16)
const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
const wrap = (x, span) => ((x % span) + span) % span
const drift = (t, period) => 0.5 - 0.5 * Math.cos((t / period) * Math.PI * 2) // the sky slowly breathes between two palettes
const pal = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rgb(v)]))
const stops = list => list.map(rgb)

export function buffer(w, h, data) {
  return { w, h, px: data ? new Uint32Array(data.buffer) : new Uint32Array(w * h) }
}

function rect(B, x, y, w, h, c) {
  const x0 = Math.max(0, Math.round(x)), x1 = Math.min(B.w, Math.round(x + w))
  const y0 = Math.max(0, Math.round(y)), y1 = Math.min(B.h, Math.round(y + h))
  const v = pack(c)
  for (let yy = y0; yy < y1; yy++) B.px.fill(v, yy * B.w + x0, yy * B.w + Math.max(x0, x1))
}

const dot = (B, x, y, c) => rect(B, x, y, 1, 1, c)

// a vertical gradient with ordered dithering between the stops: the retro banding
function gradient(B, list, y0, y1, x0 = 0, x1 = B.w) {
  const n = list.length - 1
  const packed = list.map(pack)
  const from = Math.max(0, Math.round(x0)), to = Math.min(B.w, Math.round(x1))
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(B.h, Math.round(y1)); y++) {
    const f = ((y - y0) / Math.max(1, y1 - y0 - 1)) * n
    const i = Math.min(n - 1, Math.floor(f))
    const frac = f - i
    for (let x = from; x < to; x++) B.px[y * B.w + x] = frac > BAYER[(y & 3) * 4 + (x & 3)] ? packed[i + 1] : packed[i]
  }
}

function sprite(B, rows, x, y, colors) {
  x = Math.round(x)
  y = Math.round(y)
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] !== '.') dot(B, x + c, y + r, colors[row[c]])
  })
}

function disc(B, cx, cy, r, c, below = Infinity, stripes = false) {
  for (let dy = -r; dy <= r; dy++) {
    if (cy + dy >= below) break
    if (stripes && dy > 0 && dy % 3 === 2) continue // the retro sun: gaps in its lower half
    const half = Math.round(Math.sqrt(r * r - dy * dy))
    rect(B, cx - half, cy + dy, half * 2 + 1, 1, c)
  }
}

// a crescent moon: one disc minus another
function crescent(B, cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy <= r * r && (dx - r * 0.5) ** 2 + (dy + r * 0.3) ** 2 > r * r * 0.8) dot(B, cx + dx, cy + dy, c)
  }
}

// a sprite turned a quarter clockwise, for things that tumble
const turn = rows => rows[0].split('').map((_, c) => rows.map(r => r[c]).reverse().join(''))

// a hill line made of two slow waves, filled down to the bottom
function ridge(B, base, amp, seed, freq, off, c) {
  for (let x = 0; x < B.w; x++) {
    const u = (x - off) * freq
    const top = Math.round(base - amp * (0.6 * Math.sin(u + seed) + 0.4 * Math.sin(u * 2.3 + seed * 2)))
    rect(B, x, top, 1, B.h - top, c)
  }
}

// buildings with windows that switch on and off slowly
function skyline(B, base, seed, low, high, off, c, lit, t, density) {
  let x = -12 + (off % 12)
  for (let i = 0; x < B.w; i++) {
    const w = 5 + Math.floor(rnd(seed + i) * 7)
    const h = Math.round(low + rnd(seed + i * 3.1) * (high - low))
    rect(B, x, base - h, w, h + 1, c)
    for (let wy = base - h + 2; wy < base - 1; wy += 3) {
      for (let wx = x + 1; wx < x + w - 1; wx += 2) {
        const id = seed * 7 + i * 31 + wx * 3 + wy
        if (rnd(id + Math.floor(t / 9 + rnd(id) * 9)) < density) dot(B, wx, wy, lit[Math.floor(rnd(id * 1.7) * lit.length)])
      }
    }
    x += w + (rnd(seed + i * 5.3) < 0.3 ? 1 : 0)
  }
}

function clouds(B, n, t, top, span, speed, colors, seed) {
  for (let i = 0; i < n; i++) {
    const shape = CLOUDS[i % CLOUDS.length]
    const w = shape[0].length
    const x = wrap(rnd(seed + i) * (B.w + w) + t * speed * (0.6 + rnd(seed + i * 2)), B.w + w * 2) - w
    sprite(B, shape, x, top + rnd(seed + i * 3) * span, colors)
  }
}

function flock(B, n, t, top, colors, seed) {
  for (let i = 0; i < n; i++) {
    const x = wrap(rnd(seed + i) * B.w + t * (3 + rnd(seed + i) * 2), B.w + 10) - 5
    const y = top + rnd(seed + i * 4) * 10 + Math.round(Math.sin(t * 0.7 + i) * 1.5)
    sprite(B, Math.floor(t * 3 + i) % 2 ? BIRD[0] : BIRD[1], x, y, colors)
  }
}

const CLOUDS = [
  ['....aaaa......', '..aaaaaaaa.aa.', '.aaaaaaaaaaaaa', 'bbbbbbbbbbbbbb'],
  ['...aaa....', '.aaaaaaa..', 'aaaaaaaaaa', '.bbbbbbbb.'],
  ['......aaa.......', '..aaaaaaaaaa.aa.', 'bbbbbbbbbbbbbbbb'],
]
const BIRD = [['k...k', '.k.k.'], ['.k.k.', 'k...k']]
const TREE = ['...kkk...', '.kkkkkkk.', 'kkkkkkkkk', 'kkkkkkkkk', '.kkkkkkk.', '..kkkkk..', '....k....', '....k....', '....k....']
const CUP = ['kkkkkkkkkk..', 'kddddddddk..', 'kwwwwwwsskkk', 'kwwwwwwssk.k', 'kwwwwwwssk.k', 'kwwwwwwsskkk', 'kwwwwwwssk..', '.kkkkkkkk...', 'ssssssssssss']
const LAMP = ['...k...', '..kkk..', '.kaaak.', 'kaaaaak', '.lllll.']
const PLANT = ['.g..g..', 'gg.gg.g', '.ggggg.', 'g.ggg.g', '..ggg..', '.ppppp.', '.ppppp.', '..ppp..']
const JAR = ['.kk.', 'jjjj', 'jhjj', 'jjjj']
const BOAT = ['....w....', '...ww....', '..www....', '.wwww....', '....k....', 'kkkkkkkkk', '.kkkkkkk.']
const CASTLE = ['..r.....', '..rr....', '..k.....', '.ccc.ccc', '.cdc.cdc', 'cccccccc', 'ccdccdcc', 'cccccccc']
const CRAB = [['r.....r', '.rrrrr.', 'rrkrkrr', 'r.r.r.r'], ['.r...r.', '.rrrrr.', 'rrkrkrr', '.r.r.r.']]
const PALM = ['.....ff....ff...', '...ffffff.ffff..', '..ff...fffff.ff.', '.f....ffFff...f.', 'f....ff.T.ff....', '....f...T...f...']
const MAILBOX = ['.bbbbb.rr', 'bbbbbbbrr', 'bbbbbbbk.', 'bdddddbk.', 'bbbbbbb..', '...p.....', '...p.....', '...p.....', '...p.....', '...p.....', '...p.....']
const FLOWER = ['.p.', 'pcp', '.p.', '.g.']
const FLY = [['w.w', 'wkw'], ['.w.', '.k.']]

// on a tall phone screen the picture sits in the top part, above the text sheet, and the ground runs on below it
const view = B => (B.h > B.w ? Math.min(B.h, Math.round(B.w * 1.15)) : B.h)
const horizon = (B, f) => Math.round(view(B) * f)
const lean = v => d => Math.round(v.x * d)

/* Sunset: the CV. A road runs toward the hills under a striped sun. */

const SUNSET = {
  a: stops(['#2a2f4e', '#4b4468', '#76587a', '#a5687a', '#c98472', '#ddab7c', '#ead0a0']),
  b: stops(['#24284a', '#433d63', '#6c5176', '#985e74', '#bd786a', '#d59f72', '#e3c290']),
  c: pal({ sun: '#f0d9a8', far: '#6a4f6c', mid: '#4a3852', near: '#2c2236', road: '#4f3c4c', line: '#c99a78', a: '#d9a58f', b: '#b98480', k: '#2c2236', kb: '#3a2c40' }),
  draw(B, t, v) {
    const { c } = SUNSET
    const o = lean(v)
    const hz = horizon(B, 0.62)
    gradient(B, SUNSET.a.map((x, i) => mix(x, SUNSET.b[i], drift(t, 40))), 0, hz + 6)
    clouds(B, 3, t, 2, hz * 0.4, 1.2, { a: c.a, b: c.b }, 3)
    const r = Math.max(6, Math.min(22, Math.round(Math.min(B.w, B.h) * 0.16)))
    disc(B, Math.round(B.w * 0.62) + o(1), hz - Math.round(r * 0.3) + Math.round(drift(t, 40) * 2), r, c.sun, hz + 2, true)
    flock(B, 3, t, hz * 0.3, { k: c.kb }, 9)
    ridge(B, hz + 1, 3, 1, 0.09, o(2), c.far)
    ridge(B, hz + 5, 4, 4, 0.05, o(3.5), c.mid)
    const ground = hz + 9
    ridge(B, ground, 2, 7, 0.04, o(6), c.near)
    for (let y = ground; y < B.h; y++) { // the road widens toward the viewer
      const u = (y - ground) / Math.max(1, B.h - ground)
      const w = 2 + Math.round(u * B.w * 0.5)
      const cx = Math.round(B.w * 0.45 + o(6) + u * B.w * 0.08)
      rect(B, cx - w / 2, y, w, 1, c.road)
      if (Math.floor((y - ground) / (1 + u * 4) + t * 2) % 2 === 0) dot(B, cx, y, c.line)
    }
    sprite(B, TREE, Math.round(B.w * 0.12) + o(6), ground - 8, { k: c.k })
  },
}

/* Coffee shop: the projects. Rain on the window, warm lamps, a laptop and a cup. */

const COFFEE = {
  out: stops(['#2f3656', '#4a4b6e', '#6f5f7f', '#9a7686', '#bf8d82']),
  outB: stops(['#283050', '#43456a', '#665a7c', '#8e7084', '#b2857e']),
  c: pal({ wall: '#2b201f', wall2: '#3d2c28', glow: '#5a4232', frame: '#5d4232', sill: '#6d4c3a', city: '#2a2e4a', cityLit: '#d8bb7a', rain: '#8e95b5', cord: '#1d1514', a: '#c9a46a', l: '#f0d9a0', top: '#9a6e52', wood: '#7a5440', front: '#4e3528', plank: '#3f2b21', k: '#1f2433', d: '#3d2a22', w: '#e8e0cc', s: '#c8bfa8', steam: '#cfc6b4', g: '#6f8f5e', p: '#a8664e', screen: '#1e2433', code1: '#8fa8bb', code2: '#c9b48a', code3: '#a4aab2', body: '#6a6f7c', j: '#7f9a8a', h: '#cfd8c8' }),
  draw(B, t, v) {
    const { c } = COFFEE
    const o = lean(v)
    const portrait = B.h > B.w
    const V = view(B)
    gradient(B, [c.wall, c.wall2, c.wall], 0, B.h)
    const ww = Math.round(B.w * (portrait ? 0.6 : 0.46))
    const wh = Math.round(V * 0.5)
    const wx = Math.round((B.w - ww) / 2) + o(1.5)
    const wy = Math.round(V * 0.08)
    gradient(B, COFFEE.out.map((x, i) => mix(x, COFFEE.outB[i], drift(t, 36))), wy, wy + wh, wx, wx + ww)
    const city = buffer(B.w, B.h) // draw the city into a scratch layer, then copy only what the window shows
    skyline(city, wy + wh, 21, 4, Math.round(wh * 0.45), o(0.8), c.city, [c.cityLit], t, 0.18)
    for (let y = wy; y < wy + wh; y++) for (let x = Math.max(0, wx); x < Math.min(B.w, wx + ww); x++) if (city.px[y * B.w + x]) B.px[y * B.w + x] = city.px[y * B.w + x]
    for (let i = 0; i < Math.round(ww * wh / 40); i++) {
      const x = wx + Math.floor(rnd(i) * ww)
      const y = wy + wrap(rnd(i * 2.3) * wh + t * (26 + rnd(i) * 10), wh)
      if (y + 2 < wy + wh) rect(B, x, y, 1, 2, c.rain)
    }
    rect(B, wx - 2, wy - 2, ww + 4, 2, c.frame)
    rect(B, wx - 2, wy + wh, ww + 4, 2, c.sill)
    rect(B, wx - 2, wy, 2, wh, c.frame)
    rect(B, wx + ww, wy, 2, wh, c.frame)
    rect(B, wx + Math.round(ww / 2) - 1, wy, 2, wh, c.frame)
    rect(B, wx, wy + Math.round(wh * 0.45), ww, 1, c.frame)
    const lamps = portrait ? [0.1, 0.9] : [0.14, 0.5, 0.86]
    lamps.forEach((f, i) => {
      const lx = Math.round(B.w * f) + o(2.5)
      const ly = Math.round(V * (portrait ? 0.24 : 0.18)) + (i % 2) * 3
      const pulse = 0.9 + 0.1 * Math.sin(t * 1.3 + i)
      for (let y = ly - 10; y < ly + 18; y++) for (let x = lx - 14; x < lx + 15; x++) { // warm light falling off by distance, in dither
        const d = Math.hypot(x - lx, (y - ly - 4) * 1.3) / 15
        if (x >= 0 && y >= 0 && x < B.w && y < B.h && d < 1 && (1 - d) * 0.8 * pulse > BAYER[(y & 3) * 4 + (x & 3)] && !(y >= wy && y < wy + wh && x >= wx && x < wx + ww)) B.px[y * B.w + x] = pack(c.glow)
      }
      rect(B, lx, 0, 1, ly, c.cord)
      sprite(B, LAMP, lx - 3, ly, c)
    })
    if (!portrait) {
      const sx = Math.round(B.w * 0.06) + o(2.5)
      const sy = Math.round(V * 0.52)
      rect(B, sx, sy, Math.round(B.w * 0.16), 1, c.sill)
      for (let i = 0; i < 4; i++) sprite(B, JAR, sx + 1 + i * 6, sy - 4, c)
    }
    const top = Math.round(V * 0.76)
    const x4 = o(4)
    rect(B, 0, top, B.w, 1, c.top)
    rect(B, 0, top + 1, B.w, 2, c.wood)
    rect(B, 0, top + 3, B.w, B.h - top - 3, c.front)
    for (let x = wrap(x4, 14); x < B.w; x += 14) rect(B, x, top + 3, 1, B.h - top - 3, c.plank)
    const px = Math.round(B.w * (portrait ? 0.08 : 0.22)) + x4 // the laptop: a few lines of code and a blinking cursor
    rect(B, px, top - 11, 18, 11, c.k)
    rect(B, px + 1, top - 10, 16, 9, c.screen)
    const lines = [[2, 7, c.code1], [4, 9, c.code2], [4, 5, c.code3], [2, 10, c.code1], [4, 6, c.code2]]
    const shown = Math.floor(t * 1.5) % (lines.length + 3)
    lines.slice(0, Math.min(shown, lines.length)).forEach(([x, w, col], i) => rect(B, px + 1 + x, top - 9 + i * 2, w, 1, col))
    if (Math.floor(t * 2) % 2) rect(B, px + 3, top - 9 + Math.min(shown, lines.length - 1) * 2, 2, 1, c.w)
    rect(B, px - 2, top - 1, 22, 1, c.body)
    const cx = Math.round(B.w * (portrait ? 0.6 : 0.62)) + x4
    sprite(B, CUP, cx, top - 9, c)
    for (let i = 0; i < 3; i++) { // steam rises and sways
      for (let k = 0; k < 4; k++) {
        const y = top - 11 - wrap(k * 3 + t * 4 + i * 2, 12)
        const x = cx + 2 + i * 3 + Math.round(Math.sin(y * 0.5 + t * 2 + i))
        if (rnd(i * 9 + k) > 0.3) dot(B, x, y, c.steam)
      }
    }
    sprite(B, PLANT, Math.round(B.w * (portrait ? 0.84 : 0.88)) + x4, top - 8, c)
  },
}

/* Blue hour: the achievements. Stars come out over a city with its lights on. */

const BLUE = {
  a: stops(['#0f1430', '#18214a', '#25336a', '#3b4d86', '#5d6a9e', '#8a88b0', '#b49bb0']),
  b: stops(['#0d1129', '#151d43', '#212e62', '#34467c', '#536194', '#7f7fa8', '#a993ab']),
  c: pal({ star: '#e6e1d0', dim: '#8f97bf', moon: '#dcd8c4', far: '#1d2546', near: '#11162c', warm: '#d8bb7a', cool: '#9fb0d0', farLit: '#6e7aa8', w1: '#1a2342', w2: '#121a34', shine: '#c9b48a' }),
  draw(B, t, v) {
    const { c } = BLUE
    const o = lean(v)
    const hz = horizon(B, 0.66)
    gradient(B, BLUE.a.map((x, i) => mix(x, BLUE.b[i], drift(t, 30))), 0, hz + 1)
    for (let i = 0; i < Math.round(B.w * hz / 70); i++) {
      const y = Math.floor(rnd(i * 1.3) * hz * 0.7)
      const on = rnd(i + Math.floor(t * 0.8 + rnd(i) * 10)) > 0.25
      dot(B, Math.floor(rnd(i) * B.w) + o(0.5), y, on ? c.star : c.dim)
    }
    const mx = Math.round(B.w * 0.78) + o(1)
    const my = Math.round(hz * 0.22)
    const r = Math.max(3, Math.round(Math.min(B.w, B.h) * 0.06))
    crescent(B, mx, my, r, c.moon)
    skyline(B, hz, 5, 4, Math.round(hz * 0.3), o(2), c.far, [c.farLit], t, 0.12)
    skyline(B, hz, 13, 3, Math.round(hz * 0.2), o(4), c.near, [c.warm, c.warm, c.cool], t, 0.3)
    gradient(B, [c.w1, c.w2], hz + 1, B.h)
    for (let i = 0; i < Math.round(B.w * (B.h - hz) / 30); i++) { // lights on the water shimmer
      const y = hz + 2 + Math.floor(rnd(i * 3.7) * (B.h - hz - 2))
      const x = Math.floor(rnd(i * 2.1) * B.w + Math.sin(t * 0.8 + i) * 2) + o(5)
      if (rnd(i + Math.floor(t * 2)) > 0.4) rect(B, x, y, 1 + Math.floor(rnd(i) * 3), 1, rnd(i * 5) > 0.5 ? c.shine : c.dim)
    }
  },
}

/* Sea shore: the games. A boat on the horizon, a crab, a sandcastle, a palm. */

const SHORE = {
  a: stops(['#6f8fa8', '#8eaabb', '#adc3c6', '#cfd6c8', '#e6dcc2']),
  b: stops(['#7a8bab', '#9aa6bd', '#bcbec6', '#dacbbd', '#e9d3b4']),
  sea: stops(['#557f92', '#4b7486', '#5f8d98', '#79a3a7']),
  sand: stops(['#d9c6a0', '#cdb68e', '#c2aa82']),
  c: pal({ sun: '#f3e7c6', a: '#ece6d8', b: '#cfd2cf', foam: '#ece6d6', wet: '#b9a585', spark: '#cfe0dc', w: '#ece4d3', k: '#5a4a52', gull: '#f0ebe0', f: '#5f8456', F: '#46663f', T: '#8a6a4e', t: '#6e5340', c: '#c9ad7f', d: '#9c825d', r: '#c4776a' }),
  draw(B, t, v) {
    const { c } = SHORE
    const o = lean(v)
    const hz = horizon(B, 0.5)
    const V = view(B)
    gradient(B, SHORE.a.map((x, i) => mix(x, SHORE.b[i], drift(t, 45))), 0, hz)
    disc(B, Math.round(B.w * 0.8) + o(0.5), Math.round(hz * 0.3), Math.max(3, Math.round(Math.min(B.w, B.h) * 0.06)), c.sun)
    clouds(B, 3, t, 3, hz * 0.5, 1.5, c, 11)
    flock(B, 2, t, hz * 0.45, { k: c.gull }, 4)
    const shore = hz + Math.round((V - hz) * 0.42)
    gradient(B, SHORE.sea, hz, shore + 4)
    sprite(B, BOAT, wrap(t * 1.2 + B.w * 0.3, B.w + 20) - 10 + o(1), hz - 6, c)
    for (let i = 0; i < Math.round(B.w * (shore - hz) / 25); i++) {
      const y = hz + 1 + Math.floor(rnd(i * 1.9) * (shore - hz))
      const x = wrap(rnd(i) * B.w + t * (2 + rnd(i * 3) * 2), B.w) + o(2)
      if (rnd(i + Math.floor(t * 1.5)) > 0.35) rect(B, x, y, 2, 1, c.spark)
    }
    gradient(B, SHORE.sand, shore + 2, B.h)
    const swash = Math.round(2 + 2 * Math.sin(t * 0.7)) // the wave runs up the sand and back
    for (let x = 0; x < B.w; x++) {
      const edge = shore + swash + Math.round(Math.sin(x * 0.15 + t * 0.9))
      rect(B, x, shore, 1, edge - shore, SHORE.sea[3])
      dot(B, x, edge, c.foam)
      if ((x + Math.floor(t * 3)) % 3) dot(B, x, edge + 1, c.wet)
    }
    const near = o(6)
    const px = Math.round(B.w * 0.1) + near
    const height = Math.round((V - hz) * 0.75)
    for (let i = 0; i < height; i++) { // the trunk leans, the fronds sway a pixel
      const x = px + 7 + Math.round(Math.sin((i / height) * 1.2) * 3)
      rect(B, x, V - 2 - i, 2, 1, i % 3 ? c.T : c.t)
    }
    sprite(B, PALM, px + 1 + Math.round(Math.sin(t * 0.9)), V - 2 - height - 4, c)
    const sand = shore + Math.round((V - shore) * 0.5)
    sprite(B, CASTLE, Math.round(B.w * 0.68) + near, sand, c)
    const walk = Math.sin(t * 0.35) * B.w * 0.18
    sprite(B, CRAB[Math.floor(t * 4) % 2], Math.round(B.w * 0.45 + walk) + near, V - Math.max(6, Math.round((V - shore) * 0.2)), c)
  },
}

/* Greenery and flowers: contact. Hills, a meadow, butterflies and a mailbox. */

const GARDEN = {
  a: stops(['#8fadb9', '#a9c1c2', '#c4d3c6', '#dbe0cb', '#e8e3cc']),
  b: stops(['#9aa9bf', '#b5bcc6', '#ccc9c6', '#e0d3c4', '#ecdcc6']),
  petals: ['#c99aa0', '#a99bc6', '#e6dcb6', '#d6bf7c', '#d4a49a'].map(rgb),
  c: pal({ a: '#f0ece0', b: '#d6dcd2', far: '#88a08c', mid: '#6c8a6b', near: '#557553', grass: '#45603f', blade: '#5f8456', g: '#3f5a3e', centre: '#e8d9a0', trunk: '#5d4636', leaf: '#5f8a5c', bloom: '#d9b3b5', b2: '#7d8fae', d: '#5b6a88', r: '#c98a7e', k: '#5a4a52', p: '#6b5345', w1: '#e8d6a8', w2: '#c8a2c4' }),
  draw(B, t, v) {
    const { c } = GARDEN
    const o = lean(v)
    const hz = horizon(B, 0.5)
    gradient(B, GARDEN.a.map((x, i) => mix(x, GARDEN.b[i], drift(t, 50))), 0, hz + 8)
    clouds(B, 3, t, 2, hz * 0.5, 1, c, 17)
    ridge(B, hz, 4, 2, 0.06, o(1), c.far)
    ridge(B, hz + 6, 5, 5, 0.04, o(2.5), c.mid)
    const meadow = hz + 14
    ridge(B, meadow, 3, 8, 0.03, o(4), c.near)
    const tx = Math.round(B.w * 0.16) + o(4)
    rect(B, tx, meadow - 10, 2, 12, c.trunk)
    for (let i = 0; i < 26; i++) { // a round tree with a few blossoms
      const a = rnd(i) * Math.PI * 2, d = Math.sqrt(rnd(i * 3)) * 7
      disc(B, Math.round(tx + 1 + Math.cos(a) * d), Math.round(meadow - 15 + Math.sin(a) * d * 0.7), 2, i % 6 ? c.leaf : c.bloom)
    }
    const near = o(6)
    for (let i = 0; i < Math.round(B.w * (B.h - meadow) / 60); i++) {
      const x = Math.floor(rnd(i * 1.1) * B.w) + near + Math.round(Math.sin(t * 1.4 + i) * 0.6)
      const y = meadow + 2 + Math.floor(rnd(i * 2.7) * (B.h - meadow - 6))
      sprite(B, FLOWER, x, y, { p: GARDEN.petals[i % GARDEN.petals.length], c: c.centre, g: c.g })
    }
    const mb = { ...c, b: c.b2 }
    sprite(B, MAILBOX, Math.round(B.w * 0.78) + near, meadow + Math.round((view(B) - meadow) * 0.25), mb)
    const grass = B.h - 3
    rect(B, 0, grass, B.w, 3, c.grass)
    for (let x = wrap(near, 2); x < B.w; x += 2) dot(B, x + (Math.floor(t * 2 + x * 0.3) % 2), grass - 1, c.blade)
    for (let i = 0; i < 2; i++) {
      const x = B.w * (0.35 + 0.3 * Math.sin(t * 0.21 + i * 2)) + near
      const y = meadow - 2 + Math.sin(t * 0.9 + i * 3) * 5
      sprite(B, FLY[Math.floor(t * 5 + i) % 2], x, y, { w: i ? c.w2 : c.w1, k: c.k })
    }
  },
}

/* Lighthouse: the Now tile. A beam sweeps a night sea while two cargo ships cross. */

// light added over what is already drawn, so the beam glows instead of painting a block
function blend(B, x, y, c, a) {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || y < 0 || x >= B.w || y >= B.h || a <= 0) return
  const i = y * B.w + x
  const p = B.px[i]
  const k = Math.min(1, a)
  B.px[i] = pack([p & 255, (p >> 8) & 255, (p >> 16) & 255].map((v, j) => Math.round(v + (c[j] - v) * k)))
}

const SHIP = [
  '..m...........................',
  '..k...........................',
  '.kkkk.........................',
  '.kwwk..aabbcca.bbccaab........',
  '.kkkk..ccaabbc.aabbcca........',
  '.kwwk..bbccaab.ccaabbc........',
  'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
  'hhhhhhhhhhhhhhhhhhhhhhhhhhhhh.',
  '.hhhhhhhhhhhhhhhhhhhhhhhhhhh..',
  '..llllllllllllllllllllllllll..',
]
const SHIP_LEFT = SHIP.map(row => [...row].reverse().join(''))

const LIGHT = {
  a: stops(['#0b0f22', '#111833', '#1a2446', '#26335a', '#35406a']),
  b: stops(['#0a0d1e', '#0f152e', '#172040', '#222e53', '#303a62']),
  sea: stops(['#16203d', '#111930', '#0d1426']),
  c: pal({ star: '#e6e1d0', dim: '#7d86b0', rock: '#0a0d19', white: '#b8b2a4', red: '#7c4a46', dark: '#23283d', lamp: '#f0d9a0', beam: '#ecdcae', h: '#3a4260', l: '#5e3f40', k: '#2e3550', w: '#d8bb7a', m: '#ece4d3', a: '#8a5a4a', b: '#557a7e', cc: '#9a8656', port: '#b86a5e', stbd: '#7fa88a', shine: '#c9b48a' }),
  draw(B, t, v) {
    const { c } = LIGHT
    const o = lean(v)
    const hz = horizon(B, 0.66)
    gradient(B, LIGHT.a.map((x, i) => mix(x, LIGHT.b[i], drift(t, 34))), 0, hz + 1)
    for (let i = 0; i < Math.round(B.w * hz / 60); i++) {
      const on = rnd(i + Math.floor(t * 0.7 + rnd(i) * 10)) > 0.25
      dot(B, Math.floor(rnd(i * 1.7) * B.w) + o(0.5), Math.floor(rnd(i * 2.9) * hz * 0.85), on ? c.star : c.dim)
    }
    gradient(B, LIGHT.sea, hz, B.h)
    for (let i = 0; i < Math.round(B.w * (B.h - hz) / 28); i++) { // starlight on the water
      const y = hz + 2 + Math.floor(rnd(i * 3.3) * (B.h - hz - 2))
      const x = Math.floor(rnd(i * 1.9) * B.w + Math.sin(t * 0.7 + i) * 2) + o(3)
      if (rnd(i + Math.floor(t * 1.5)) > 0.55) rect(B, x, y, 1 + Math.floor(rnd(i) * 2), 1, c.dim)
    }
    const ships = [ // one far out heading right, one nearer heading left
      { rows: SHIP, speed: 1.6, start: 0.05, y: hz - 8, d: 1.5 },
      { rows: SHIP_LEFT, speed: -1, start: 0.6, y: hz - 2, d: 2.5 },
    ]
    ships.forEach(({ rows, speed, start, y, d }, i) => {
      const x = wrap(start * B.w + t * speed, B.w + 64) - 32 + o(d)
      sprite(B, rows, x, y, { ...c, c: c.cc })
      if (Math.floor(t * 1.2 + i) % 2) dot(B, speed > 0 ? x + 29 : x, y + 6, speed > 0 ? c.stbd : c.port) // the side light blinks
      for (let k = 0; k < 4; k++) if (rnd(i * 7 + k + Math.floor(t * 2)) > 0.35) rect(B, x + 3 + k * 7, y + 11 + (k % 2), 2, 1, c.shine) // its lights in the water
    })
    const lx = Math.round(B.w * 0.82) + o(4)
    for (let x = lx - 14; x <= lx + 14; x++) { // a small rocky island under the lighthouse
      const h = Math.round(Math.max(0, 6 - Math.abs(x - lx) * 0.45 + Math.sin(x * 0.9) * 0.8))
      if (h > 0) rect(B, x, hz + 2 - h, 1, h + 2, c.rock)
    }
    const height = Math.max(12, Math.round(hz * 0.5))
    const base = hz - 3
    for (let i = 0; i < height; i++) { // a tapering tower in muted red and white bands
      const w = Math.round(6 - 2 * (i / height))
      rect(B, lx - Math.floor(w / 2), base - i, w, 1, Math.floor(i / 3) % 2 ? c.red : c.white)
    }
    const top = base - height
    rect(B, lx - 3, top, 7, 1, c.dark)
    rect(B, lx - 2, top - 3, 5, 3, c.lamp)
    rect(B, lx - 1, top - 4, 3, 1, c.dark)
    dot(B, lx, top - 5, c.dark)
    const turn = t * 0.8
    const ly = top - 2
    const side = Math.cos(turn) < 0 ? -1 : 1
    const reach = Math.abs(Math.cos(turn)) * B.w * 0.95 // the beam looks longest side-on, shortest pointing at you
    for (let s = 3; s < reach; s++) {
      const half = 0.5 + s * 0.07
      for (let dy = -Math.ceil(half); dy <= Math.ceil(half); dy++) blend(B, lx + side * s, ly + dy, c.beam, 0.42 * (1 - s / B.w) * (1 - Math.abs(dy) / (half + 0.5)))
    }
    const face = Math.max(0, Math.sin(turn)) // it flashes when it turns toward you
    const r = 3 + face * 5
    for (let dy = -Math.ceil(r); dy <= r; dy++) for (let dx = -Math.ceil(r); dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / r
      if (d < 1) blend(B, lx + dx, ly + dy, c.beam, (1 - d) * (0.25 + face * 0.55))
    }
  },
}

/* Menu: the night sky behind the name, where four small stories take turns. */

const UFO = ['.....aaa.....', '....aeaea....', '...aaaaaaa...', '.sssssssssss.', 'sslssslssslss', '.sssssssssss.']
const COW = ['.......kk', 'wwkkwwwww', 'wkkwwwwkw', 'wwwwkkww.', '.k.k.k.k.']
const BOT = ['....a....', '....k....', '..ggggg..', '..gvgvg..', '..ggggg..', '...kkk...', '.jggggg..', '.jgkgkg..', '.jggggg..', '..gg.gg..']
const MUG = ['dddd..', 'wwwwww', 'wwww.w', 'wwwwww', 'wwww..']
const ASTRO = ['..www..', '.wooow.', '.wooow.', '..www..', '.wwwww.', 'w.www.w', '..w.w..', '..w.w..']
const CAT = ['k...k..', 'kkkkk..', 'kwkwk..', 'kkkkk.k', '.kkkkkk']
const STAR = ['.s.', 'sws', '.s.']

// each story enters and leaves within its own ten seconds, so the hand-over is clean; p runs 0 to 1
const STORIES = [
  (B, p, t, cy, c) => { // aliens: a saucer stops, beams up a cow, and zooms off
    const mid = Math.round(B.w * 0.55)
    const x = Math.round(p < 0.25 ? -14 + (mid + 14) * (p / 0.25) : p < 0.75 ? mid : mid + (B.w + 20 - mid) * ((p - 0.75) / 0.25) ** 2)
    const y = cy - 12 + Math.round(Math.sin(t * 2))
    if (p > 0.28 && p < 0.72) {
      for (let dy = 6; dy < 23; dy++) for (let dx = -2 - Math.floor(dy / 3); dx <= 2 + dy / 3; dx++) blend(B, x + 6 + dx, y + dy, c.beam, 0.2)
      const rise = (p - 0.3) / 0.38
      if (rise < 1) sprite(B, COW, x + 2, y + 18 - Math.round(Math.max(0, rise) * 13), c)
    }
    sprite(B, UFO, x, y, { ...c, l: Math.floor(t * 4) % 2 ? c.l1 : c.l2 })
  },
  (B, p, t, cy, c) => { // robots: a jetpack robot reaches for a floating cup and always just misses
    const mx = Math.round(-8 + p * (B.w + 30))
    const my = cy - 3 + Math.round(Math.sin(t * 1.5) * 2)
    const reach = Math.max(0, Math.sin(t * 2.5))
    const rx = mx - 16 - Math.round(reach * 2)
    const ry = cy - 7 + Math.round(Math.sin(t * 1.2 + 1) * 2)
    sprite(B, BOT, rx, ry, { ...c, a: Math.floor(t * 3) % 2 ? c.l1 : c.dim, v: c.l1 })
    rect(B, rx + 7, ry + 7, 1 + Math.round(reach * 8), 1, c.g) // the arm stops a pixel or two short, every time
    if (Math.floor(t * 8) % 2) dot(B, rx + 1, ry + 9, c.flame)
    dot(B, rx + 1, ry + 10, c.flame)
    sprite(B, MUG, mx, my, c)
    for (let i = 0; i < 2; i++) if (Math.floor(t * 3 + i) % 2) dot(B, mx + 1 + i * 2, my - 2 - i, c.dim)
  },
  (B, p, t, cy, c) => { // humans: an astronaut tumbles past on a tether from a station out of sight
    const x = Math.round(-10 + p * (B.w + 20))
    const y = Math.round(cy + 4 - p * 14 + Math.sin(t) * 2)
    let rows = ASTRO
    for (let i = 0; i < Math.floor(t * 1.5) % 4; i++) rows = turn(rows)
    for (let k = 0; k < x; k += 2) dot(B, k, y + 4 + Math.round(Math.sin(k * 0.3 + t) * 1.5), c.dim)
    sprite(B, rows, x, y, c)
  },
  (B, p, t, cy, c) => { // animals: a cat on the moon fishes a star out of the sky
    const slide = p < 0.15 ? 1 - p / 0.15 : p > 0.85 ? -(p - 0.85) / 0.15 : 0
    const mx = Math.round(B.w * 0.35 + slide * B.w * 0.75)
    const my = cy - 2
    crescent(B, mx, my, 6, c.moon)
    sprite(B, CAT, mx - 3, my - 10, { k: c.ginger, w: c.k })
    for (let i = 0; i < 4; i++) dot(B, mx + 3 + i, my - 8 - i, c.rod)
    const tipX = mx + 6
    const tipY = my - 11
    const length = p < 0.4 ? (p / 0.4) * 20 : p < 0.5 ? 20 : Math.max(3, 20 - ((p - 0.5) / 0.3) * 17)
    for (let i = 0; i < length; i++) dot(B, tipX, tipY + i, c.dim)
    const caught = p >= 0.4
    const sx = caught ? tipX - 1 : Math.round(B.w * 0.35 + 7 + Math.sin(t * 2) * 2) - 1
    sprite(B, STAR, sx, caught ? tipY + Math.round(length) : tipY + 20 + Math.round(Math.sin(t * 3)), { s: c.l1, w: c.w })
  },
]

const MENU = {
  sky: stops(['#10121f', '#161a2e', '#1f2440', '#2b2f52', '#3d3a5e']),
  c: pal({ star: '#e6e1d0', dim: '#6b7096', ridge: '#141728', streak: '#ece4d3', a: '#7f9fae', e: '#9cc08a', s: '#a9adb8', l1: '#d9bd7c', l2: '#c98a7e', beam: '#d8e0c0', w: '#e6e0d2', k: '#3a3440', g: '#a9adb8', v: '#9fc0c4', j: '#7d8fae', o: '#cfb27a', d: '#5a3d2e', moon: '#dcd8c4', rod: '#8a6a4e', flame: '#d9a072', ginger: '#c4956a' }),
  draw(B, t, v) {
    const { c } = MENU
    const o = lean(v)
    gradient(B, MENU.sky, 0, B.h)
    for (let i = 0; i < Math.round(B.w * B.h / 90); i++) {
      const on = rnd(i + Math.floor(t * 0.6 + rnd(i) * 10)) > 0.3
      dot(B, Math.floor(rnd(i) * B.w) + o(1), Math.floor(rnd(i * 1.3) * B.h * 0.85), on ? c.star : c.dim)
    }
    const shot = t % 9 // a shooting star every nine seconds, for one second
    if (shot < 1) {
      const sx = Math.round(B.w * (0.2 + rnd(Math.floor(t / 9)) * 0.5) + shot * 30)
      const sy = Math.round(B.h * 0.15 + shot * 12)
      for (let k = 0; k < 6; k++) dot(B, sx - k * 2, sy - k, k < 2 ? c.streak : c.dim)
    }
    const story = 10 // seconds each, in the gap between the name and the text box
    STORIES[Math.floor(t / story) % STORIES.length](B, (t % story) / story, t, Math.round(B.h * 0.56), c)
    ridge(B, Math.round(B.h * 0.9), 2, 3, 0.05, o(3), c.ridge)
  },
}

export const SCENES = {
  menu: { ...MENU, track: 'menu' },
  lighthouse: { ...LIGHT, track: 'menu' }, // it lives on the grid, so it shares the grid's music
  sunset: { ...SUNSET, track: 'sunset' },
  coffee: { ...COFFEE, track: 'coffee' },
  bluehour: { ...BLUE, track: 'bluehour' },
  shore: { ...SHORE, track: 'shore' },
  garden: { ...GARDEN, track: 'garden' },
}

// every colour a scene can paint, for the brightness test
export function colours(scene) {
  const out = []
  const walk = x => (Array.isArray(x) && typeof x[0] === 'number' ? out.push(x) : Array.isArray(x) ? x.forEach(walk) : x && typeof x === 'object' && Object.values(x).forEach(walk))
  Object.entries(scene).forEach(([k, x]) => k !== 'draw' && walk(x))
  return out
}
