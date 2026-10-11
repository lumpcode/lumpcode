// Calm ambient bed synthesized from scratch: slow pad chords, a soft bass, and sparse bell notes
// through a small feedback-delay reverb. Deterministic (seeded) so re-renders sound identical.

const CHORD_SECONDS = 8
const PROGRESSION = [
  { root: 48, notes: [60, 64, 67, 71] }, // Cmaj7
  { root: 45, notes: [57, 60, 64, 67] }, // Am7
  { root: 41, notes: [57, 60, 65, 69] }, // Fmaj7
  { root: 43, notes: [59, 62, 67, 69] }, // G6
]

function midiToHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12)
}

function mulberry32(seed) {
  let a = seed
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Raised-cosine swell spanning 1.5 chords so neighbouring chords crossfade.
function chordEnvelope(localT) {
  const span = CHORD_SECONDS * 1.5
  if (localT < 0 || localT > span) return 0
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * localT) / span)
}

export function synthesizeMusic({ seconds, sampleRate }) {
  const frames = Math.ceil(seconds * sampleRate)
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  const bells = new Float32Array(frames)
  const twoPi = 2 * Math.PI

  const chordCount = Math.ceil(seconds / CHORD_SECONDS) + 1
  for (let c = -1; c < chordCount; c++) {
    const chord = PROGRESSION[((c % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length]
    const t0 = c * CHORD_SECONDS
    const from = Math.max(0, Math.floor(t0 * sampleRate))
    const to = Math.min(frames, Math.ceil((t0 + CHORD_SECONDS * 1.5) * sampleRate))
    const padHz = chord.notes.map(midiToHz)
    const bassHz = midiToHz(chord.root)
    for (let i = from; i < to; i++) {
      const t = i / sampleRate
      const env = chordEnvelope(t - t0)
      let l = 0
      let r = 0
      for (const f of padHz) {
        l += Math.sin(twoPi * f * 0.997 * t) + 0.12 * Math.sin(twoPi * f * 2 * t)
        r += Math.sin(twoPi * f * 1.003 * t) + 0.12 * Math.sin(twoPi * f * 2 * t)
      }
      const bass = 0.9 * Math.sin(twoPi * bassHz * t)
      left[i] += env * (0.09 * l + 0.16 * bass)
      right[i] += env * (0.09 * r + 0.16 * bass)
    }
  }

  const rand = mulberry32(7)
  for (let t0 = 2; t0 < seconds - 4; t0 += 1.4 + rand() * 1.8) {
    if (rand() < 0.3) continue
    const chord = PROGRESSION[Math.floor(t0 / CHORD_SECONDS) % PROGRESSION.length]
    const f = midiToHz(chord.notes[Math.floor(rand() * chord.notes.length)] + 12)
    const gain = 0.05 + rand() * 0.04
    const from = Math.floor(t0 * sampleRate)
    const to = Math.min(frames, from + Math.floor(3 * sampleRate))
    for (let i = from; i < to; i++) {
      const dt = (i - from) / sampleRate
      const env = Math.min(1, dt / 0.01) * Math.exp(-dt * 1.8)
      bells[i] += gain * env * (Math.sin(twoPi * f * dt) + 0.25 * Math.sin(twoPi * f * 3 * dt) * Math.exp(-dt * 4))
    }
  }

  const delayL = Math.floor(0.37 * sampleRate)
  const delayR = Math.floor(0.53 * sampleRate)
  const wetL = new Float32Array(frames)
  const wetR = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    wetL[i] = bells[i] + (i >= delayL ? 0.42 * wetL[i - delayL] : 0)
    wetR[i] = bells[i] + (i >= delayR ? 0.42 * wetR[i - delayR] : 0)
    left[i] += 0.7 * bells[i] + 0.35 * wetL[i]
    right[i] += 0.7 * bells[i] + 0.35 * wetR[i]
  }

  const fadeIn = 3 * sampleRate
  const fadeOut = 4 * sampleRate
  let peak = 0
  for (let i = 0; i < frames; i++) {
    const g = Math.min(1, i / fadeIn, (frames - i) / fadeOut)
    left[i] *= g
    right[i] *= g
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  }

  const target = Math.pow(10, -4 / 20)
  const scale = peak > 0 ? target / peak : 0
  const pcm = Buffer.alloc(frames * 4)
  for (let i = 0; i < frames; i++) {
    pcm.writeInt16LE(Math.round(left[i] * scale * 32767), i * 4)
    pcm.writeInt16LE(Math.round(right[i] * scale * 32767), i * 4 + 2)
  }
  return pcm
}
