// Generates Touchline's three menu tracks: original jazzy lo-fi loops, synthesised from code
// (electric piano chords, walking bass, swung brush drums, a vibraphone melody, vinyl crackle).
// Nothing is sampled or copied, so there are no licence questions.
//
// Usage (lamejs, a pure-JS MP3 encoder, is only needed to regenerate, so it isn't a dependency):
//   npm install --no-save lamejs@1.2.1
//   node scripts/make-music.mjs assets/music
//
// Deterministic: the same script always writes the same notes (seeded random numbers).
// Each track is 32 bars and loops seamlessly (notes that ring past the end wrap round to the start).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';

const SR = 32000; // sample rate: plenty for a mellow, lo-fi sound, and small files
const KBPS = 64;
const BARS = 32;

// --- Small helpers -----------------------------------------------------------------------------

function rng(seed) {
  // mulberry32, as in src/utils/random.ts
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
const NOTE = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };

/** Chord symbols used below → intervals above the root (the root itself is played by the bass). */
const QUALITY = {
  maj7: [4, 7, 11],
  maj9: [4, 7, 11, 14],
  m7: [3, 7, 10],
  m9: [3, 7, 10, 14],
  '7': [4, 7, 10],
  '9': [4, 10, 14],
  '13': [4, 10, 14, 21],
  '7b9': [4, 10, 13],
  '7sus': [5, 7, 10, 14],
};
function chord(symbol) {
  const [, root, quality] = symbol.match(/^([A-G]b?)(.*)$/);
  return { root: NOTE[root], intervals: QUALITY[quality] };
}

// --- The mix: everything is added into one looping buffer --------------------------------------

function createMix(seconds) {
  const length = Math.round(seconds * SR);
  const buffer = new Float32Array(length);
  // Sounds that ring past the end wrap round to the start, so the loop has no seam.
  const add = (startSec, samples) => {
    const start = Math.round(startSec * SR);
    for (let i = 0; i < samples.length; i++) buffer[(start + i) % length] += samples[i];
  };
  return { buffer, add };
}

// --- Instruments (each returns the samples of one note) ----------------------------------------

/** Electric piano: two-operator FM (bell-like attack mellowing out), with a gentle tremolo. */
function epiano(midi, duration, velocity, detune) {
  const f = freq(midi) * (1 + detune);
  const n = Math.round((duration + 1.2) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const index = 0.25 + 1.1 * Math.exp(-t * 6);
    const mod = Math.sin(2 * Math.PI * f * t) * index;
    const body = Math.sin(2 * Math.PI * f * t + mod);
    const release = t > duration ? Math.exp(-(t - duration) * 7) : 1;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 1.6) * release;
    const tremolo = 1 - 0.12 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4.6 * t));
    out[i] = body * env * tremolo * velocity;
  }
  return out;
}

/** Upright-ish bass: fundamental plus a little second harmonic, plucked. */
function bass(midi, duration, velocity) {
  const f = freq(midi);
  const n = Math.round((duration + 0.15) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const release = t > duration ? Math.exp(-(t - duration) * 25) : 1;
    const env = Math.min(1, t / 0.008) * (0.35 + 0.65 * Math.exp(-t * 3.2)) * release;
    const thump = Math.exp(-t * 40) * 0.4;
    out[i] = (Math.sin(2 * Math.PI * f * t) + 0.28 * Math.sin(4 * Math.PI * f * t) + thump * Math.sin(2 * Math.PI * f * 3 * t)) * env * velocity;
  }
  return out;
}

/** Vibraphone: a sine with a soft bell partial and motor tremolo. */
function vibes(midi, duration, velocity) {
  const f = freq(midi);
  const n = Math.round((duration + 1.5) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const release = t > duration ? Math.exp(-(t - duration) * 4) : 1;
    const env = Math.min(1, t / 0.003) * Math.exp(-t * 1.3) * release;
    const tremolo = 1 - 0.3 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 5.5 * t));
    out[i] = (Math.sin(2 * Math.PI * f * t) + 0.22 * Math.sin(2 * Math.PI * f * 4.01 * t) * Math.exp(-t * 6)) * env * tremolo * velocity;
  }
  return out;
}

function kick(velocity) {
  const n = Math.round(0.5 * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * (48 + 85 * Math.exp(-t * 30))) / SR;
    out[i] = Math.sin(phase) * Math.exp(-t * 8) * velocity;
  }
  return out;
}

/** Noise through a one-pole low-pass (`lp`, 0–1) and high-pass (difference) blend. */
function noiseBurst(random, seconds, decay, lp, hp, velocity) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  let low = 0;
  let previous = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const white = random() * 2 - 1;
    low += lp * (white - low);
    const high = low - previous;
    previous = low;
    out[i] = (low * (1 - hp) + high * hp * 3) * Math.exp(-t * decay) * velocity;
  }
  return out;
}

const brushSnare = (random, velocity) => noiseBurst(random, 0.35, 11, 0.45, 0.3, velocity);
const hat = (random, velocity) => noiseBurst(random, 0.08, 55, 0.9, 1, velocity);

// --- Writing parts -----------------------------------------------------------------------------

function render({ seed, bpm, key, progression, swing, voicingBase }) {
  const random = rng(seed);
  const beat = 60 / bpm;
  const bar = beat * 4;
  const mix = createMix(bar * BARS);
  // Swung 8ths: the off-beat 8th lands later than half-way.
  const at = (barIndex, beatPos) => {
    const whole = Math.floor(beatPos);
    const frac = beatPos - whole;
    const swung = frac === 0.5 ? swing : frac;
    return barIndex * bar + (whole + swung) * beat;
  };
  const chords = progression.map(chord);
  const scale = [0, 2, 3, 5, 7, 9, 10].map((s) => s + key); // dorian: jazzy and calm

  let melodyNote = 72 + key; // around C5
  for (let b = 0; b < BARS; b++) {
    const { root, intervals } = chords[b % chords.length];
    const section = Math.floor(b / 8); // 4 sections of 8 bars: a little arrangement
    const intro = b % 16 < 2; // the first bars of each half leave the kick out

    // Electric piano: voicing near `voicingBase`, comped on 1 and a syncopated hit.
    const notes = intervals.map((iv) => {
      let m = root + iv;
      while (m < voicingBase) m += 12;
      while (m > voicingBase + 14) m -= 12;
      return m;
    });
    const comps = b % 2 === 0 ? [[0, 1.6], [2.5, 1.2]] : [[0, 2.2], [3.5, 0.6]];
    for (const [pos, len] of comps) {
      notes.forEach((m, k) => mix.add(at(b, pos) + k * 0.012, epiano(m, len * beat, 0.11, (random() - 0.5) * 0.002)));
    }

    // Bass: root on 1, a passing note, the fifth, and an approach to the next chord's root.
    const next = chords[(b + 1) % chords.length].root;
    const low = (pc) => 36 + ((pc % 12) + 12) % 12;
    const line = [
      [0, low(root), 1.4],
      [1.5, low(root + (random() < 0.5 ? 7 : 3)), 0.45],
      [2, low(root + 7), 0.9],
      [3, low(next) + (random() < 0.5 ? 1 : -1), 0.9],
    ];
    for (const [pos, m, len] of line) mix.add(at(b, pos), bass(m, len * beat, 0.42));

    // Drums: boom-bap with brushes, swung hats, ghost notes.
    if (!intro) {
      mix.add(at(b, 0), kick(0.8));
      mix.add(at(b, 1.5 + (random() < 0.4 ? 1 : 0)), kick(0.55));
      if (random() < 0.35) mix.add(at(b, 3.5), kick(0.45));
    }
    mix.add(at(b, 1), brushSnare(random, 0.5));
    mix.add(at(b, 3), brushSnare(random, 0.55));
    if (random() < 0.5) mix.add(at(b, 2.5), brushSnare(random, 0.15));
    for (let e = 0; e < 8; e++) mix.add(at(b, e / 2), hat(random, e % 2 === 0 ? 0.16 : 0.1 + random() * 0.05));

    // Melody: sparse vibes phrases, busier in the middle sections, resting every other bar or so.
    const density = section === 0 ? 0.25 : section === 3 ? 0.35 : 0.5;
    if (b % 2 === 0 || random() < 0.3) {
      for (let e = 0; e < 8; e++) {
        if (random() > density) continue;
        // Step through the scale, leaning towards chord tones on the beat.
        const candidates = [];
        for (let m = 62 + key; m <= 84 + key; m++) {
          const pc = ((m % 12) + 12) % 12;
          if (!scale.some((s) => ((s % 12) + 12) % 12 === pc)) continue;
          const chordTone = [root, ...intervals.map((iv) => root + iv)].some((c) => ((c % 12) + 12) % 12 === pc);
          const weight = Math.exp(-Math.abs(m - melodyNote) / 2.2) * (chordTone && e % 2 === 0 ? 3 : 1);
          candidates.push([m, weight]);
        }
        const total = candidates.reduce((s, [, w]) => s + w, 0);
        let pick = random() * total;
        for (const [m, w] of candidates) {
          pick -= w;
          if (pick <= 0) {
            melodyNote = m;
            break;
          }
        }
        mix.add(at(b, e / 2), vibes(melodyNote, (random() < 0.3 ? 1 : 0.45) * beat, 0.13));
      }
    }
  }

  // Vinyl: soft noise bed and the odd crackle.
  const { buffer } = mix;
  let hiss = 0;
  for (let i = 0; i < buffer.length; i++) {
    hiss += 0.05 * (random() * 2 - 1 - hiss);
    buffer[i] += hiss * 0.02 + (random() < 0.00012 ? (random() - 0.5) * 0.25 : 0);
  }
  return master(buffer);
}

/** Warm low-pass, soft saturation, normalised a little below full scale. */
function master(buffer) {
  let low = 0;
  const cutoff = 1 - Math.exp((-2 * Math.PI * 5200) / SR);
  // Two passes round the loop so the filter has settled where the loop starts.
  const out = new Float32Array(buffer.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < buffer.length; i++) {
      low += cutoff * (buffer[i] - low);
      out[i] = Math.tanh(low * 1.3);
    }
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = 0.85 / peak;
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return out;
}

// --- The three tracks --------------------------------------------------------------------------

const TRACKS = [
  {
    file: 'halftime-lounge.mp3',
    seed: 1101,
    bpm: 84,
    key: NOTE.D,
    swing: 0.62,
    voicingBase: 57,
    progression: ['Dm9', 'G13', 'Cmaj9', 'A7b9'],
  },
  {
    file: 'late-kick-off.mp3',
    seed: 2202,
    bpm: 76,
    key: NOTE.D,
    swing: 0.6,
    voicingBase: 55,
    progression: ['Fmaj9', 'Em7', 'Dm9', 'Cmaj7', 'Bbmaj7', 'Am7', 'Gm7', 'C7sus'],
  },
  {
    file: 'extra-time.mp3',
    seed: 3303,
    bpm: 92,
    key: NOTE.C,
    swing: 0.64,
    voicingBase: 56,
    progression: ['Ebmaj9', 'Cm9', 'Fm9', 'Bb13', 'Gm7', 'C7b9', 'Fm9', 'Bb7sus'],
  },
];

/**
 * lamejs 1.2.1's package entry point is broken (its source files miss their imports), but it
 * ships a working single-file build, lame.all.js, that defines a global `lamejs` instead of
 * exporting it: run that file in its own context and take the global.
 */
function loadLame() {
  const file = createRequire(import.meta.url).resolve('lamejs/lame.all.js');
  return vm.runInNewContext(`${readFileSync(file, 'utf8')}\n;lamejs`, { console });
}

function encodeMp3(samples) {
  const lamejs = loadLame();
  const encoder = new lamejs.Mp3Encoder(1, SR, KBPS);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
  const chunks = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const chunk = encoder.encodeBuffer(pcm.subarray(i, i + 1152));
    if (chunk.length) chunks.push(Buffer.from(chunk));
  }
  const end = encoder.flush();
  if (end.length) chunks.push(Buffer.from(end));
  return Buffer.concat(chunks);
}

const outDir = process.argv[2] ?? 'assets/music';
mkdirSync(outDir, { recursive: true });
for (const track of TRACKS) {
  const samples = render(track);
  const mp3 = encodeMp3(samples);
  writeFileSync(join(outDir, track.file), mp3);
  console.log(`${track.file}: ${(samples.length / SR).toFixed(0)} s, ${(mp3.length / 1024).toFixed(0)} KB`);
}
