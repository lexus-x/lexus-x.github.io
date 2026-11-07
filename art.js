// The living picture behind the site. Light from a moving robot arm collects in a float buffer,
// so its fans of thread fuse into real gradients, the way a long photographic exposure does.
import { joints, solve } from './arm.mjs'
import { paint } from './plates.js'
import { haar, pickAndPlace, rebuild } from './wavelet.mjs'

const LINE_VERTEX = `#version 300 es
in vec2 point;
in vec3 tint;
uniform float uAspect;
out vec3 vTint;
void main() {
  vTint = tint;
  gl_Position = vec4(point.x / uAspect, point.y, 0.0, 1.0);
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
uniform float uMix;
uniform float uExposure;
uniform float uLight;
uniform float uFlash;
uniform float uSeed;
out vec4 color;

float grain(vec2 p) {
  return fract(sin(dot(p + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
}

// four offset taps hide the square texels of the small mip levels
vec3 soft(sampler2D plate, float lod) {
  vec2 reach = 0.75 * pow(2.0, lod) / vec2(textureSize(plate, 0));
  return (textureLod(plate, uv + reach * vec2(-1.0, -1.0), lod).rgb + textureLod(plate, uv + reach * vec2(1.0, -1.0), lod).rgb
    + textureLod(plate, uv + reach * vec2(-1.0, 1.0), lod).rgb + textureLod(plate, uv + reach * vec2(1.0, 1.0), lod).rgb) * 0.25;
}

// sharp thread plus halation, the soft glow film gets around bright light
vec3 develop(sampler2D plate) {
  vec3 thread = texture(plate, uv).rgb;
  vec3 halo = soft(plate, 3.0) * 0.28 + soft(plate, 5.0) * 0.2 + soft(plate, 6.5) * 0.1;
  return thread + halo * vec3(1.0, 0.7, 0.8);
}

void main() {
  vec3 light = mix(develop(uLive), develop(uPlate), uMix) * uExposure + uFlash * 0.05;

  // negative: light on a dark ground
  vec3 positive = pow(1.0 - exp(-light), vec3(0.4545));
  positive = vec3(0.031, 0.035, 0.047) + (1.0 - vec3(0.031, 0.035, 0.047)) * positive;

  // print: the same plate as ink, each color absorbing its complement
  vec3 ink = (light.r + light.g + light.b) - light;
  vec3 print = vec3(0.906, 0.91, 0.925) * pow(exp(-ink * 1.1), vec3(0.4545));

  vec3 result = mix(positive, print, uLight);
  result += (grain(gl_FragCoord.xy) - 0.5) / 48.0;
  color = vec4(result, 1.0);
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
const SUBSTEPS = 6
const FRAME_MS = 33
const FADE = 0.9968
const STROKE = 0.03
const CHASE = 0.11 // how quickly the joints catch up with their goal, per substep
const POINTER_HOLD = 2600
const MAX_BUFFER_WIDTH = 2200
const CALM_STEPS = 1600

// where the tool tip travels on each tab, relative to the arm's base
const FIGURES = {
  main: t => ({
    x: 1.25 * Math.sin(0.23 * t) + 0.25 * Math.sin(0.71 * t),
    y: 1.02 + 0.55 * Math.sin(0.31 * t + 1) + 0.18 * Math.sin(0.97 * t),
    tilt: -1.2 + 0.9 * Math.sin(0.17 * t),
  }),
  research: t => {
    const u = (t / 16) % 1
    const there = u < 0.5 ? u * 2 : 2 - u * 2
    return { x: -1.1 + 2.2 * there, y: 0.3 + 1.2 * pickAndPlace(there), tilt: -1.57 + 0.4 * Math.sin(t * 0.4) }
  },
  projects: t => {
    const angle = t * 0.55
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    return { x: 1.1 * (cos - (sin * sin) / Math.SQRT2), y: 1.1 + 1.1 * cos * sin, tilt: -1.57 + 0.5 * sin }
  },
  papers: t => {
    const line = Math.floor(t / 7) % 5
    const u = (t / 7) % 1
    return { x: -1 + 2 * u, y: 1.65 - line * 0.3 + 0.06 * Math.sin(t * 9), tilt: -1.2 }
  },
  cv: t => {
    const angle = t * 0.28
    const radius = 0.85 * Math.cos(3 * angle)
    return { x: radius * Math.cos(angle), y: 1.1 + radius * Math.sin(angle), tilt: angle }
  },
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

const STILL = { tab() {}, pointer() {}, flash() {}, theme() {}, plate() {}, nudge() {} }

export function startArt(canvas, { calm, light, tab }) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' })
  const renderable = gl && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
  if (!renderable) {
    // no float buffers on this device, so hang one finished plate instead of the live picture
    paint(canvas, 'Devireddy Lalith Sai', 'rose')
    return STILL
  }

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
  let aspect = 1
  let stage = { x: 0, y: -1.04, scale: 1 }
  let center = { x: 0, y: -1.04, scale: 1 }
  let lastWidth = 0
  let shownKeep = -1

  function film(width, height) {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texStorage2D(gl.TEXTURE_2D, 1 + Math.floor(Math.log2(Math.max(width, height))), gl.RGBA16F, width, height)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const frame = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return { texture, frame, width, height }
  }

  function discard(sheet) {
    if (!sheet) return
    gl.deleteTexture(sheet.texture)
    gl.deleteFramebuffer(sheet.frame)
  }

  function size() {
    const height = Math.max(innerHeight, canvas.clientHeight)
    const width = innerWidth
    aspect = width / height
    const pixels = Math.min(devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(width * pixels)
    canvas.height = Math.round(height * pixels)
    const sheetWidth = Math.min(MAX_BUFFER_WIDTH, Math.round(width * 1.5))
    const sheetHeight = Math.round(sheetWidth / aspect)
    discard(live)
    discard(plate)
    live = film(sheetWidth, sheetHeight)
    plate = film(sheetWidth, sheetHeight)
    const wide = aspect > 1.15
    const scale = wide ? 1 : Math.min(1, aspect / 0.8)
    stage = { x: wide ? aspect * 0.42 : 0, y: wide ? -1.04 : 0.16, scale } // on a phone the words sit low, so the arm rises above them
    center = { x: 0, y: wide ? -1.04 : -0.5, scale: Math.min(1, aspect / 1.4) }
    lastWidth = width
    shownKeep = -1
  }

  function push(x0, y0, x1, y1, r, g, b) {
    data.set([x0, y0, r, g, b, x1, y1, r, g, b], used)
    used += FLOATS_PER_LINE
  }

  function pose(q, grip, brightness, place, white) {
    const points = joints(q)
    const at = ([x, y]) => [place.x + x * place.scale, place.y + y * place.scale]
    PARTS.forEach((part, i) => {
      const [ax, ay] = at(points[i])
      const [bx, by] = at(points[i + 1])
      const length = Math.hypot(bx - ax, by - ay) || 1
      const nx = -(by - ay) / length
      const ny = (bx - ax) / length
      const [r, g, b] = white ? [1, 1, 1] : part.tint
      for (let t = 0; t < part.threads; t++) {
        const offset = (t / (part.threads - 1) - 0.5) * part.width * place.scale
        push(ax + nx * offset, ay + ny * offset, bx + nx * offset, by + ny * offset, r * brightness, g * brightness, b * brightness)
      }
    })
    const [wx, wy] = points[2]
    const [tx, ty] = points[3]
    const heading = Math.atan2(ty - wy, tx - wx)
    const [px, py] = at([tx, ty])
    for (const side of [-1, 1]) {
      const angle = heading + side * (0.15 + 0.5 * grip)
      push(px, py, px + Math.cos(angle) * FINGER * place.scale, py + Math.sin(angle) * FINGER * place.scale, brightness, brightness * 0.1, brightness * 0.15)
    }
  }

  function flush(sheet, fadeFirst) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sheet.frame)
    gl.viewport(0, 0, sheet.width, sheet.height)
    gl.enable(gl.BLEND)
    if (fadeFirst) {
      gl.useProgram(fade.program)
      gl.uniform1f(fade.spots.uKeep, FADE)
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR)
      gl.bindVertexArray(noVertices)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    gl.useProgram(lines.program)
    gl.uniform1f(lines.spots.uAspect, aspect)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.bindVertexArray(threadVertices)
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, used), gl.DYNAMIC_DRAW)
    gl.drawArrays(gl.LINES, 0, used / 5)
    used = 0
    gl.bindTexture(gl.TEXTURE_2D, sheet.texture)
    gl.generateMipmap(gl.TEXTURE_2D)
  }

  const look = {
    exposure: 1, exposureGoal: 1, light: light ? 1 : 0, lightGoal: light ? 1 : 0,
    mix: 0, flash: 0,
  }

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
    gl.uniform1f(show.spots.uMix, look.mix)
    gl.uniform1f(show.spots.uExposure, look.exposure)
    gl.uniform1f(show.spots.uLight, look.light)
    gl.uniform1f(show.spots.uFlash, look.flash)
    gl.uniform1f(show.spots.uSeed, calm ? 1 : performance.now() % 100)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  let figure = FIGURES[tab] ?? FIGURES.main
  let clock = 40
  let speed = 0
  let q = solve(0.6, 1, -1.2)
  let target = null
  let targetAt = -Infinity
  let flashes = 0

  function advance(dt) {
    clock += dt * (1 + speed)
    speed *= 0.9
    const steered = performance.now() - targetAt < POINTER_HOLD && target
    const aim = steered
      ? { x: target.x, y: Math.max(0.08, target.y), tilt: -1.57 + 0.5 * Math.sin(clock * 0.5) }
      : figure(clock)
    const goal = solve(aim.x, aim.y, aim.tilt)
    for (let i = 0; i < SUBSTEPS; i++) {
      q = q.map((angle, j) => angle + (goal[j] - angle) * CHASE)
      pose(q, 1, STROKE, stage)
    }
    while (flashes > 0) {
      pose(q, 0.15, 2.2, stage, true)
      flashes--
    }
    flush(live, true)
  }

  function ease() {
    look.exposure += (look.exposureGoal - look.exposure) * 0.06
    look.light += (look.lightGoal - look.light) * 0.09
    look.flash *= 0.8
  }

  const motion = buildMotion()

  function drawPlate(keep) {
    if (Math.abs(keep - shownKeep) < 0.004) return
    shownKeep = keep
    const [first, second, third, grip] = motion.map(bands => rebuild(bands, keep))
    const distinct = 2 ** (keep - 1)
    const repeats = POSES / distinct
    // one lone pose must read as a bright strobe, a full sweep as faint thread
    const eachPose = 1.3 * (0.05 / 1.3) ** ((keep - 1) / 10)
    const brightness = eachPose / repeats
    for (let i = 0; i < POSES; i++) pose([first[i], second[i], third[i]], grip[i], brightness, center)
    gl.bindFramebuffer(gl.FRAMEBUFFER, plate.frame)
    gl.clear(gl.COLOR_BUFFER_BIT)
    flush(plate, false)
  }

  function clearPlate() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, plate.frame)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  let lastFrame = 0
  function frame(time) {
    requestAnimationFrame(frame)
    if (document.hidden || time - lastFrame < FRAME_MS) return
    const dt = Math.min(0.05, (time - lastFrame) / 1000)
    lastFrame = time
    advance(dt)
    ease()
    display()
  }

  function settle() {
    look.exposure = look.exposureGoal
    look.light = look.lightGoal
    display()
  }

  function expose() {
    for (let i = 0; i < CALM_STEPS; i++) {
      clock += 0.05
      advance(0)
    }
  }

  size()
  if (calm) {
    expose()
    settle()
  } else {
    requestAnimationFrame(frame)
  }

  addEventListener('resize', () => {
    // mobile browsers resize when the address bar slides, which must not wipe the picture
    if (innerWidth === lastWidth) return
    size()
    if (calm) {
      expose()
      settle()
    }
  })

  return {
    tab(id, exposure) {
      figure = FIGURES[id] ?? FIGURES.main
      look.exposureGoal = exposure
      if (calm) settle()
    },
    pointer(clientX, clientY) {
      if (calm) return
      target = {
        x: (((clientX / innerWidth) * 2 - 1) * aspect - stage.x) / stage.scale,
        y: (1 - (clientY / innerHeight) * 2 - stage.y) / stage.scale,
      }
      targetAt = performance.now()
    },
    flash() {
      if (calm) return
      flashes += 1
      look.flash = 1
    },
    theme(isLight) {
      look.lightGoal = isLight ? 1 : 0
      if (calm) settle()
    },
    plate(keep, mix) {
      look.mix = mix
      if (mix > 0) drawPlate(keep)
      else if (shownKeep !== -1) {
        clearPlate()
        shownKeep = -1
      }
      if (calm) settle()
    },
    nudge(pixels) {
      speed = Math.min(6, speed + pixels * 0.012)
    },
  }
}
