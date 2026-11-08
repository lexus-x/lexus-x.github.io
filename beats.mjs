// A tiny step sequencer for the album beats in albums.mjs. Every sound is made in the browser, so nothing is downloaded.
const hz = note => 440 * 2 ** ((note - 69) / 12)
const LOOK_AHEAD = 0.12 // seconds of notes queued ahead, so a busy page never makes the beat stumble

export function startBeats() {
  let ctx = null
  let master = null
  let bus = null // one per play, so stopping or switching fades out notes already queued
  let noise = null
  let timer = 0
  let beat = null
  let step = 0
  let at = 0

  function boot() {
    if (navigator.audioSession) navigator.audioSession.type = 'playback' // iPhones otherwise stay silent with the ringer switch off
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination)
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      addEventListener('visibilitychange', () => {
        if (timer) document.hidden ? ctx.suspend() : ctx.resume()
      })
    }
    ctx.resume()
  }

  function envelope(t, peak, length, attack = 0.005) {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    gain.connect(bus)
    return gain
  }

  function kick(t, deep) {
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(deep ? 90 : 150, t)
    osc.frequency.exponentialRampToValueAtTime(deep ? 32 : 45, t + 0.15)
    osc.connect(envelope(t, 0.9, deep ? 0.6 : 0.28))
    osc.start(t)
    osc.stop(t + 0.7)
  }

  function hiss(t, from, peak, length) {
    const source = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    source.buffer = noise
    filter.type = 'highpass'
    filter.frequency.value = from
    source.connect(filter).connect(envelope(t, peak, length))
    source.start(t, Math.random() * 0.5)
    source.stop(t + length + 0.05)
  }

  function tone(t, notes, voice) {
    for (const note of [].concat(notes)) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.Q.value = voice.q ?? 1
      filter.frequency.value = voice.sweep ? voice.cut + voice.sweep * Math.sin(t * 0.9) : voice.cut
      filter.connect(envelope(t, voice.gain, voice.dur, voice.attack))
      for (const cents of voice.detune ? [-voice.detune, voice.detune] : [0]) {
        const osc = ctx.createOscillator()
        osc.type = voice.wave
        osc.frequency.value = hz(note)
        osc.detune.value = cents
        osc.connect(filter)
        osc.start(t)
        osc.stop(t + voice.dur + 0.05)
      }
    }
  }

  function tick() {
    const length = 60 / beat.bpm / 4
    if (at < ctx.currentTime) at = ctx.currentTime + 0.05 // after a throttled pause, skip what was missed instead of playing it all at once
    while (at < ctx.currentTime + LOOK_AHEAD) {
      const hit = part => beat[part]?.[step % beat[part].length] === 'x'
      if (hit('kick')) kick(at, beat.deep)
      if (hit('snare')) hiss(at, 1500, 0.3, 0.14)
      if (hit('hat')) hiss(at, 7000, 0.07, 0.04)
      for (const voice of beat.tones) {
        const note = voice.notes[step % voice.notes.length]
        if (note) tone(at, note, voice)
      }
      at += length
      step++
    }
  }

  function fade() {
    if (!bus) return
    const old = bus
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
    setTimeout(() => old.disconnect(), 600)
    bus = null
  }

  return {
    // call from a tap or click: browsers allow sound only after one
    play(next) {
      boot()
      fade()
      bus = ctx.createGain()
      bus.connect(master)
      beat = next
      step = 0
      at = ctx.currentTime + 0.05
      clearInterval(timer)
      timer = setInterval(tick, 25)
      tick()
    },
    stop() {
      clearInterval(timer)
      timer = 0
      fade()
    },
    get playing() {
      return Boolean(timer)
    },
  }
}
