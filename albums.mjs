// The albums the site wears, a different one each visit. Their colours live in style.css under [data-album]; index.html picks the first one before paint.
// Each beat is my own loop in the album's mood, never the record: 16 steps a bar, notes as MIDI numbers, 0 a rest, a list a chord.
const bars = (...chords) => chords.flatMap(chord => [chord, ...Array(15).fill(0)])

export const ALBUMS = {
  up: {
    name: 'Unknown Pleasures', artist: 'Joy Division',
    beat: { bpm: 136, kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', tones: [{ notes: [50, 0, 50, 57, 0, 57, 53, 0, 52, 0, 52, 57, 0, 55, 53, 0], wave: 'sawtooth', cut: 1100, q: 4, dur: 0.18, gain: 0.22 }] },
  },
  mm: {
    name: 'The Man-Machine', artist: 'Kraftwerk',
    beat: { bpm: 116, kick: 'x...x...x...x...', snare: '....x.......x...', tones: [{ notes: [57, 60, 64, 69, 64, 60, 57, 60, 55, 59, 62, 67, 62, 59, 55, 59], wave: 'square', cut: 2400, dur: 0.12, gain: 0.1 }, { notes: [33, 0, 0, 0, 0, 0, 0, 0, 31, 0, 0, 0, 0, 0, 0, 0], wave: 'square', cut: 500, dur: 0.9, gain: 0.25 }] },
  },
  dsotm: {
    name: 'The Dark Side of the Moon', artist: 'Pink Floyd',
    beat: { bpm: 72, deep: true, kick: 'x..x............', tones: [{ notes: bars([52, 55, 59, 64], [48, 52, 55, 64]), wave: 'triangle', cut: 1400, dur: 3.2, attack: 0.6, gain: 0.07, detune: 7 }] },
  },
  brat: {
    name: 'brat', artist: 'Charli XCX',
    beat: { bpm: 128, deep: true, kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', tones: [{ notes: [[57, 60, 64], 0, 0, 0, 0, 0, [57, 60, 64], 0, 0, 0, [55, 59, 62], 0, 0, 0, 0, 0], wave: 'sawtooth', cut: 3000, dur: 0.16, gain: 0.06, detune: 12 }] },
  },
  cur: {
    name: 'Currents', artist: 'Tame Impala',
    beat: { bpm: 100, kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', tones: [{ notes: [45, 0, 0, 45, 0, 0, 52, 0, 50, 0, 0, 50, 0, 0, 48, 0], wave: 'triangle', cut: 900, dur: 0.35, gain: 0.3 }, { notes: bars([57, 60, 64, 67], [53, 57, 60, 64]), wave: 'sawtooth', cut: 900, sweep: 700, q: 6, dur: 2.3, attack: 0.15, gain: 0.045, detune: 10 }] },
  },
}

export const pick = list => list[Math.floor(Math.random() * list.length)]
