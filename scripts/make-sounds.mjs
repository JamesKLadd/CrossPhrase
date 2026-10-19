// Synthesises the game's sound effects and music loop into assets/sounds/*.wav.
// Everything is generated from code here (no samples, nothing to license),
// and seeded, so running it again gives byte-identical files.
//
//   node scripts/make-sounds.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../assets/sounds/', import.meta.url);
const SFX_RATE = 22050;
const MUSIC_RATE = 11025;

// ---- Building blocks -------------------------------------------------------

/** A4 = 440 Hz. Names like "C5", "F#4", "Bb3". */
function freq(name) {
  const [, letter, accidental, octave] = /^([A-G])([#b]?)(\d)$/.exec(name);
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[letter];
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return 440 * 2 ** ((semis + shift) / 12 + (Number(octave) - 4));
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Track {
  /** `loop`: sound that runs past the end wraps round to the start, for seamless loops. */
  constructor(seconds, rate, loop = false) {
    this.rate = rate;
    this.loop = loop;
    this.data = new Float32Array(Math.round(seconds * rate));
  }

  add(i, value) {
    if (i >= this.data.length) {
      if (!this.loop) return;
      i %= this.data.length;
    }
    this.data[i] += value;
  }

  /**
   * A tone made of partials: [ratio, level, decay seconds]. Attack in seconds;
   * `glide` slides the pitch to that frequency; `vibrato` is [rate Hz, depth].
   */
  tone(start, seconds, hz, { partials = [[1, 1, 0.3]], attack = 0.005, volume = 1, glide, vibrato, release = 0.02 } = {}) {
    const n = Math.round(seconds * this.rate);
    const s0 = Math.round(start * this.rate);
    const phases = partials.map(() => 0);
    for (let k = 0; k < n; k++) {
      const t = k / this.rate;
      const f = (glide ? hz + (glide - hz) * (k / n) : hz) * (vibrato ? 1 + vibrato[1] * Math.sin(2 * Math.PI * vibrato[0] * t) : 1);
      const env = Math.min(1, t / attack) * Math.min(1, (seconds - t) / release);
      let v = 0;
      partials.forEach(([ratio, level, decay], p) => {
        phases[p] += (2 * Math.PI * f * ratio) / this.rate;
        v += level * Math.exp(-t / decay) * Math.sin(phases[p]);
      });
      this.add(s0 + k, v * env * volume);
    }
  }

  /** Filtered noise. `cutoff` goes from start to end value (0..1, higher is brighter). */
  noise(start, seconds, { volume = 1, attack = 0.002, decay = 0.05, cutoff = [0.3, 0.3], seed = 1 } = {}) {
    const random = mulberry32(seed);
    const n = Math.round(seconds * this.rate);
    const s0 = Math.round(start * this.rate);
    let low = 0;
    for (let k = 0; k < n; k++) {
      const t = k / this.rate;
      const alpha = cutoff[0] + (cutoff[1] - cutoff[0]) * (k / n);
      low += alpha * (random() * 2 - 1 - low);
      const env = Math.min(1, t / attack) * Math.exp(-Math.max(0, t - attack) / decay);
      this.add(s0 + k, low * env * volume);
    }
  }

  normalized(peak) {
    let max = 0;
    for (const v of this.data) max = Math.max(max, Math.abs(v));
    return this.data.map((v) => (max > 0 ? (v / max) * peak : 0));
  }
}

const BELL = [[1, 1, 0.5], [2, 0.35, 0.18], [3, 0.12, 0.08]];
const MUSIC_BOX = [[1, 1, 0.9], [3, 0.18, 0.12], [5, 0.05, 0.05]];
const PLUCK = [[1, 1, 0.16], [2, 0.3, 0.05]];
const WOOD = [[1, 1, 0.025], [3, 0.25, 0.01]];

function wav(samples, rate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return buffer;
}

// ---- Sound effects ---------------------------------------------------------

const effects = {
  /** A tile snapping onto the board: a small wooden tock. */
  place(t) {
    t.tone(0, 0.09, 330, { partials: WOOD, glide: 250 });
    t.noise(0, 0.02, { volume: 0.25, decay: 0.004, cutoff: [0.4, 0.2] });
  },
  /** Selecting a tile or pressing a button. */
  tap(t) {
    t.tone(0, 0.05, 880, { partials: [[1, 1, 0.012]], volume: 0.7 });
  },
  /** Swapping a word for a new one: a page-turn whoosh. */
  swap(t) {
    t.noise(0, 0.32, { volume: 1, attack: 0.12, decay: 0.08, cutoff: [0.04, 0.35], seed: 7 });
    t.tone(0.2, 0.05, 1250, { partials: [[1, 1, 0.01]], volume: 0.3 });
  },
  /** An OK line. */
  ok(t) {
    t.tone(0, 0.4, freq('D5'), { partials: PLUCK });
  },
  /** A great line: two rising bell notes. */
  great(t) {
    t.tone(0, 0.5, freq('D5'), { partials: BELL, volume: 0.8 });
    t.tone(0.1, 0.6, freq('A5'), { partials: BELL });
  },
  /** A poetic line: a sparkling arpeggio over a soft chord. */
  poetic(t) {
    ['D5', 'F#5', 'A5', 'D6'].forEach((n, i) => t.tone(i * 0.07, 0.8, freq(n), { partials: BELL, volume: 0.8 }));
    ['D4', 'F#4', 'A4'].forEach((n) => t.tone(0, 1.2, freq(n), { partials: [[1, 0.25, 0.7]], attack: 0.08 }));
    [2637, 2960, 3520].forEach((hz, i) => t.tone(0.3 + i * 0.08, 0.5, hz, { partials: [[1, 0.25, 0.15]], vibrato: [9, 0.01] }));
  },
  /** A rejected line: a comic double bonk. */
  invalid(t) {
    const partials = [[1, 1, 0.12], [3, 0.3, 0.05]];
    t.tone(0, 0.2, 196, { partials, glide: 150 });
    t.tone(0.15, 0.3, 165, { partials, glide: 120 });
  },
  /** Each star on the level-complete card. */
  star1: (t) => t.tone(0, 0.6, freq('C6'), { partials: BELL }),
  star2: (t) => t.tone(0, 0.6, freq('E6'), { partials: BELL }),
  star3: (t) => t.tone(0, 0.7, freq('G6'), { partials: BELL }),
  /** Level cleared: a little fanfare. */
  win(t) {
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => t.tone(i * 0.11, 0.5, freq(n), { partials: BELL, volume: 0.8 }));
    ['C5', 'E5', 'G5', 'C6'].forEach((n) => t.tone(0.5, 1.3, freq(n), { partials: [[1, 0.6, 0.6], [2, 0.2, 0.2]] }));
    t.tone(0.5, 1.3, freq('C3'), { partials: [[1, 0.8, 0.5]] });
  },
  /** Level failed: a sad trombone, owl-sized. */
  lose(t) {
    const partials = [[1, 1, 2], [3, 0.25, 2], [5, 0.08, 2]];
    ['G4', 'F#4', 'F4'].forEach((n, i) => t.tone(i * 0.3, 0.28, freq(n), { partials, attack: 0.03, release: 0.06, volume: 0.6 }));
    t.tone(0.9, 0.8, freq('E4'), { partials, attack: 0.03, release: 0.3, vibrato: [6, 0.012], volume: 0.6 });
  },
  /** Tapping the owl. */
  hoot(t) {
    const partials = [[1, 1, 5], [2, 0.08, 5]];
    t.tone(0, 0.22, 430, { partials, glide: 390, attack: 0.04, release: 0.08 });
    t.tone(0.32, 0.34, 410, { partials, glide: 350, attack: 0.04, release: 0.15 });
    t.noise(0, 0.6, { volume: 0.04, attack: 0.05, decay: 0.3, cutoff: [0.1, 0.1], seed: 3 });
  },
};

// ---- Music: an 8-bar loop in F major, music box over a soft pad ------------

function music() {
  const bpm = 92;
  const beat = 60 / bpm;
  const bars = 8;
  const t = new Track(bars * 4 * beat, MUSIC_RATE, true);
  const chords = [
    ['F2', 'F3', 'A3', 'C4'],
    ['D2', 'D3', 'F3', 'A3'],
    ['Bb1', 'Bb2', 'D3', 'F3'],
    ['C2', 'C3', 'E3', 'G3'],
    ['F2', 'F3', 'A3', 'C4'],
    ['A1', 'A2', 'C3', 'E3'],
    ['Bb1', 'Bb2', 'D3', 'F3'],
    ['C2', 'C3', 'E3', 'G3'],
  ];
  const melody = [
    [['A5', 0], ['C6', 1], ['A5', 1.5], ['G5', 2], ['F5', 3]],
    [['D5', 0], ['F5', 1], ['A5', 2], ['G5', 3], ['F5', 3.5]],
    [['F5', 0], ['D5', 1], ['F5', 2], ['G5', 2.5], ['A5', 3]],
    [['G5', 0], ['E5', 1], ['C5', 2], ['D5', 3.5]],
    [['A5', 0], ['C6', 1], ['D6', 1.5], ['C6', 2], ['A5', 3]],
    [['E5', 0], ['A5', 1], ['C6', 2], ['A5', 3], ['G5', 3.5]],
    [['F5', 0], ['D5', 1], ['F5', 1.5], ['G5', 2], ['A5', 3]],
    [['G5', 0], ['C5', 1], ['E5', 2], ['G5', 3]],
  ];
  chords.forEach(([bass, ...pad], bar) => {
    const start = bar * 4 * beat;
    for (const note of pad) {
      for (const detune of [-0.8, 0.8]) {
        t.tone(start, 4 * beat + 0.6, freq(note) + detune, {
          partials: [[1, 0.13, 30], [2, 0.03, 30]],
          attack: 0.5,
          release: 0.9,
        });
      }
    }
    for (const b of [0, 2]) t.tone(start + b * beat, 1.6, freq(bass), { partials: [[1, 0.5, 0.6], [2, 0.12, 0.2]], attack: 0.01 });
    // A quiet clock tick on beats 2 and 4: it's a study, after all.
    for (const b of [1, 3]) t.tone(start + b * beat, 0.03, 2400, { partials: [[1, 0.05, 0.006]] });
    for (const [note, at] of melody[bar]) t.tone(start + at * beat, 1.8, freq(note), { partials: MUSIC_BOX, volume: 0.3 });
  });
  return t;
}

// ---- Write ----------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const [name, build] of Object.entries(effects)) {
  const t = new Track(2, SFX_RATE);
  build(t);
  // Trim trailing silence.
  let end = t.data.length;
  while (end > 1 && Math.abs(t.data[end - 1]) < 1e-4) end--;
  t.data = t.data.slice(0, end);
  const file = wav(t.normalized(0.85), SFX_RATE);
  writeFileSync(new URL(`${name}.wav`, OUT), file);
  bytes += file.length;
}
const loop = wav(music().normalized(0.6), MUSIC_RATE);
writeFileSync(new URL('music.wav', OUT), loop);
console.log(
  `Wrote ${Object.keys(effects).length} effects (${Math.round(bytes / 1024)} KB) and music.wav ` +
    `(${Math.round(loop.length / 1024)} KB) to assets/sounds/.`,
);
