// Five moods from Lalith's taste: sunset, ocean waves, blue hour, coffee and music.
// beats.mjs plays each beat; `waves` and `cafe` (0 to 1) add sea and cafe sound on top.

// one chord per bar, struck on the steps in `hits` (16 steps a bar)
const prog = (chords, hits = [0, 10]) => chords.flatMap(chord => Array.from({ length: 16 }, (_, i) => (hits.includes(i) ? chord : null)))
// a slow tune: { step: note }
const tune = (notes, length = 64) => Array.from({ length }, (_, i) => notes[i] ?? null)

const keys = { wave: 'triangle', cut: 1100, dur: 1.6, gain: 0.06, attack: 0.02, detune: 7, q: 0.7 }
const pad = { wave: 'sine', cut: 700, dur: 3.8, gain: 0.07, attack: 0.9, detune: 5 }
const bell = { wave: 'sine', cut: 2400, dur: 1.4, gain: 0.07, attack: 0.01 }

export const MIXES = [
  {
    name: 'Golden hour',
    photo: 'golden.jpg',
    alt: 'A surfer waits in the sea under a golden sunset sky',
    line: 'warm keys and soft surf',
    beat: {
      bpm: 76, waves: 0.35,
      kick: 'x.......x.x.....', hat: '..x...x...x...x.',
      tones: [{ ...keys, notes: prog([[48, 55, 59, 64], [45, 52, 55, 60], [50, 57, 60, 65], [43, 50, 55, 59]]) }],
    },
  },
  {
    name: 'Sunset',
    photo: 'sunset.jpg',
    alt: 'The sun sets over a wide, calm estuary',
    line: 'slow chords, a simple tune, waves',
    beat: {
      bpm: 64, waves: 0.45,
      kick: 'x.........x.....',
      tones: [
        { ...keys, notes: prog([[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], [0]) },
        { ...bell, notes: tune({ 0: 76, 6: 72, 16: 74, 22: 71, 32: 72, 38: 69, 48: 67, 54: 71 }) },
      ],
    },
  },
  {
    name: 'Blue hour',
    photo: 'blue.jpg',
    alt: 'Two children wade into a pale blue sea, painted by P. S. Kroyer in 1908',
    line: 'long pads, no drums, deep waves',
    beat: {
      bpm: 56, waves: 0.7,
      tones: [{ ...pad, notes: prog([[50, 57, 60, 64], [46, 53, 57, 62], [43, 58, 62, 65], [45, 55, 60, 64]], [0]) }],
    },
  },
  {
    name: 'Coffee',
    photo: 'coffee.png', pixel: true,
    alt: 'Pixel art: a steaming mug of coffee on a table, with a sunset over the sea behind it',
    line: 'jazzy keys, cups clinking, a quiet room',
    beat: {
      bpm: 88, cafe: 0.7,
      kick: 'x.....x.........', hat: '..x...x...x...x.',
      tones: [{ ...keys, notes: prog([[50, 53, 57, 60], [43, 50, 53, 59], [48, 52, 55, 59], [45, 52, 55, 61]], [0, 6, 10]) }],
    },
  },
  {
    name: 'Dusk tide',
    photo: 'dusk.jpg',
    alt: 'A pink sky fades over a dark sea',
    line: 'only the sea',
    beat: { bpm: 60, waves: 1, tones: [] },
  },
]
