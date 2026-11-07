// The figure beside the text: one robot motion held as wavelet numbers. Keeping more numbers sharpens
// the long exposure, and the bright arm plays whatever motion those numbers still hold.
import { joints, solve } from './arm.mjs'
import { haar, pickAndPlace, rebuild } from './wavelet.mjs'

const LINE_VERTEX = `#version 300 es
in vec2 point;
in vec3 tint;
out vec3 vTint;
void main() {
  vTint = tint;
  gl_Position = vec4(point, 0.0, 1.0);
}`

const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vTint;
out vec4 color;
void main() { color = vec4(vTint, 1.0); }`

const SCREEN_VERTEX = `#version 300 es
out vec2 uv;
void main() {
  uv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`

const FADE_FRAGMENT = `#version 300 es
precision highp float;
uniform float uKeep;
out vec4 color;
void main() { color = vec4(uKeep); }`

const SHOW_FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D uLive;
uniform sampler2D uPlate;
uniform float uLight;
uniform float uHalo;
out vec4 color;

// a ring of offset taps hides the square texels of the small mip levels
vec3 soft(sampler2D plate, float lod) {
  vec2 reach = 0.6 * pow(2.0, lod) / vec2(textureSize(plate, 0));
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float angle = float(i) * 0.5236;
    sum += textureLod(plate, uv + reach * vec2(cos(angle), sin(angle)), lod).rgb;
  }
  return sum / 12.0;
}

// sharp thread plus halation, the soft glow film gets around bright light
vec3 develop(sampler2D plate) {
  vec3 thread = texture(plate, uv).rgb;
  vec3 halo = soft(plate, uHalo) * 0.3 + soft(plate, uHalo + 1.5) * 0.18;
  return thread + halo * vec3(1.0, 0.7, 0.8);
}

void main() {
  vec3 light = develop(uLive) + develop(uPlate);

  // negative: light on a dark ground
  vec3 positive = pow(1.0 - exp(-light), vec3(0.4545));
  positive = vec3(0.031, 0.035, 0.047) + (1.0 - vec3(0.031, 0.035, 0.047)) * positive;

  // print: the same plate as ink, each color absorbing its complement
  vec3 ink = (light.r + light.g + light.b) - light;
  vec3 print = vec3(0.906, 0.91, 0.925) * pow(exp(-ink * 1.1), vec3(0.4545));

  color = vec4(mix(positive, print, uLight), 1.0);
}`

const PARTS = [
  { threads: 7, width: 0.075, tint: [0.09, 0.24, 1] },
  { threads: 5, width: 0.055, tint: [0.42, 0.44, 0.5] },
  { threads: 3, width: 0.03, tint: [1, 0.06, 0.13] },
]
const FINGER = 0.13
const LINES_PER_POSE = 17
const FLOATS_PER_LINE = 10
const POSES = 1024
const WAVELET_LEVELS = 11
const STAGE = { x: 0, y: -0.74, scale: 0.68 }
const SHARP_SHEET = 1900 // the plate brightness below was tuned at this many pixels across

// the live arm is timed in these units, so it runs the same on any screen
const TICK = 1 / 30
const SUBSTEPS = 6
const FADE = 0.82
const STROKE = 0.24
const STRIDE = 0.8

// the same motion as a set of wavelet bands, one per joint plus the gripper
function buildMotion() {
  const channels = [[], [], [], []]
  for (let i = 0; i < POSES; i++) {
    const u = i / (POSES - 1)
    const q = solve(-1.25 + 2.5 * u, 0.28 + 1.35 * pickAndPlace(u), -1.57 + 0.55 * Math.sin(u * Math.PI))
    q.forEach((angle, j) => channels[j].push(angle))
    channels[3].push(u > 0.36 && u < 0.875 ? 0.15 : 1)
  }
  return channels.map(haar)
}

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
  return shader
}

function link(gl, vertex, fragment) {
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  const spots = {}
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const { name } = gl.getActiveUniform(program, i)
    spots[name] = gl.getUniformLocation(program, name)
  }
  return { program, spots }
}

export function startArt(canvas, { calm, light }) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' })
  const renderable = gl && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
  if (!renderable) return null

  const lines = link(gl, LINE_VERTEX, LINE_FRAGMENT)
  const fade = link(gl, SCREEN_VERTEX, FADE_FRAGMENT)
  const show = link(gl, SCREEN_VERTEX, SHOW_FRAGMENT)

  const data = new Float32Array(POSES * LINES_PER_POSE * FLOATS_PER_LINE)
  let used = 0
  const threadVertices = gl.createVertexArray()
  gl.bindVertexArray(threadVertices)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  const point = gl.getAttribLocation(lines.program, 'point')
  const tint = gl.getAttribLocation(lines.program, 'tint')
  gl.enableVertexAttribArray(point)
  gl.enableVertexAttribArray(tint)
  gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 20, 0)
  gl.vertexAttribPointer(tint, 3, gl.FLOAT, false, 20, 8)
  const noVertices = gl.createVertexArray()

  let live
  let plate
  let shownKeep = -1

  function film(side) {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texStorage2D(gl.TEXTURE_2D, 1 + Math.floor(Math.log2(side)), gl.RGBA16F, side, side)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const frame = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return { texture, frame }
  }

  function discard(sheet) {
    if (!sheet) return
    gl.deleteTexture(sheet.texture)
    gl.deleteFramebuffer(sheet.frame)
  }

  function size() {
    const density = Math.min(devicePixelRatio || 1, innerWidth < 1000 ? 1.5 : 2) // a phone's figure is large for its GPU
    const side = Math.round(canvas.getBoundingClientRect().width * density)
    if (!side || side === canvas.width) return
    canvas.width = side
    canvas.height = side
    discard(live)
    discard(plate)
    live = film(side)
    plate = film(side)
    shownKeep = -1
  }

  function push(x0, y0, x1, y1, r, g, b) {
    data[used++] = x0
    data[used++] = y0
    data[used++] = r
    data[used++] = g
    data[used++] = b
    data[used++] = x1
    data[used++] = y1
    data[used++] = r
    data[used++] = g
    data[used++] = b
  }

  function pose(q, grip, brightness) {
    const { x, y, scale } = STAGE
    const points = joints(q)
    PARTS.forEach((part, i) => {
      const ax = x + points[i][0] * scale
      const ay = y + points[i][1] * scale
      const bx = x + points[i + 1][0] * scale
      const by = y + points[i + 1][1] * scale
      const length = Math.hypot(bx - ax, by - ay) || 1
      const nx = -(by - ay) / length
      const ny = (bx - ax) / length
      const [r, g, b] = part.tint
      for (let t = 0; t < part.threads; t++) {
        const offset = (t / (part.threads - 1) - 0.5) * part.width * scale
        push(ax + nx * offset, ay + ny * offset, bx + nx * offset, by + ny * offset, r * brightness, g * brightness, b * brightness)
      }
    })
    const [wx, wy] = points[2]
    const [tx, ty] = points[3]
    const heading = Math.atan2(ty - wy, tx - wx)
    const px = x + tx * scale
    const py = y + ty * scale
    for (const side of [-1, 1]) {
      const angle = heading + side * (0.15 + 0.5 * grip)
      push(px, py, px + Math.cos(angle) * FINGER * scale, py + Math.sin(angle) * FINGER * scale, brightness, brightness * 0.1, brightness * 0.15)
    }
  }

  function flush(sheet, keepLight) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sheet.frame)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.enable(gl.BLEND)
    if (keepLight < 1) {
      gl.useProgram(fade.program)
      gl.uniform1f(fade.spots.uKeep, keepLight)
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR)
      gl.bindVertexArray(noVertices)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    gl.useProgram(lines.program)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.bindVertexArray(threadVertices)
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, used), gl.DYNAMIC_DRAW)
    gl.drawArrays(gl.LINES, 0, used / 5)
    used = 0
    gl.bindTexture(gl.TEXTURE_2D, sheet.texture)
    gl.generateMipmap(gl.TEXTURE_2D)
  }

  const look = { light: light ? 1 : 0, lightGoal: light ? 1 : 0 }

  function display() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.disable(gl.BLEND)
    gl.useProgram(show.program)
    gl.bindVertexArray(noVertices)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, live.texture)
    gl.uniform1i(show.spots.uLive, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, plate.texture)
    gl.uniform1i(show.spots.uPlate, 1)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1f(show.spots.uLight, look.light)
    gl.uniform1f(show.spots.uHalo, Math.log2(canvas.width / 150)) // the same glow on the page at any pixel density
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  // every whole level up front, so a moving slider only blends two arrays and allocates nothing
  const sharp = buildMotion().map(bands => Array.from({ length: WAVELET_LEVELS }, (_, k) => Float32Array.from(rebuild(bands, k + 1))))
  const held = sharp.map(() => new Float32Array(POSES))

  function drawPlate(keep) {
    if (Math.abs(keep - shownKeep) < 0.002) return
    shownKeep = keep
    const low = Math.min(WAVELET_LEVELS - 2, Math.floor(keep - 1))
    const part = keep - 1 - low
    sharp.forEach((levels, channel) => {
      const from = levels[low]
      const to = levels[low + 1]
      for (let i = 0; i < POSES; i++) held[channel][i] = from[i] + (to[i] - from[i]) * part
    })
    const distinct = 2 ** (keep - 1)
    const repeats = POSES / distinct
    // one lone pose must read as a bright strobe, a full sweep as faint thread
    const eachPose = 1.3 * (0.05 / 1.3) ** ((keep - 1) / 10)
    const brightness = (eachPose / repeats) * (canvas.width / SHARP_SHEET)
    for (let i = 0; i < POSES; i++) pose([held[0][i], held[1][i], held[2][i]], held[3][i], brightness)
    gl.bindFramebuffer(gl.FRAMEBUFFER, plate.frame)
    gl.clear(gl.COLOR_BUFFER_BIT)
    flush(plate, 1)
  }

  let cursor = 0
  let owed = 0

  // plays the motion there and back, so the loop has no seam
  function advance(dt) {
    owed += (SUBSTEPS * dt) / TICK
    for (; owed >= 1; owed--) {
      cursor = (cursor + STRIDE) % (2 * (POSES - 1))
      const i = Math.floor(cursor < POSES ? cursor : 2 * (POSES - 1) - cursor)
      pose([held[0][i], held[1][i], held[2][i]], held[3][i], STROKE)
    }
    flush(live, FADE ** (dt / TICK))
  }

  size()
  new ResizeObserver(size).observe(canvas)

  return {
    step(dt, keep) {
      look.light += (look.lightGoal - look.light) * (1 - 0.91 ** (dt / TICK))
      drawPlate(keep)
      if (!calm) advance(dt)
      display()
    },
    theme(isLight) {
      look.lightGoal = isLight ? 1 : 0
      if (calm) look.light = look.lightGoal
    },
  }
}
