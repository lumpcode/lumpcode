import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'
import { chromium } from 'playwright-core'
import { synthesizeMusic } from './music.mjs'

const execFileAsync = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, 'out')
const audioDir = path.join(outDir, 'audio')

const args = new Set(process.argv.slice(2))
const stillsOnly = args.has('--stills')
const audioOnly = args.has('--audioOnly')
const fps = Number(process.env.FPS ?? 30)
const voice = process.env.VOICE ?? 'Samantha'
const rate = process.env.RATE ?? '178'
const spacing = { lead: 0.6, gap: 0.45, tail: 1.1 }
const sampleRate = 44100

async function sayToWav(text) {
  const key = createHash('sha256').update(`${voice}|${rate}|${text}`).digest('hex').slice(0, 16)
  const file = path.join(audioDir, `${key}.wav`)
  if (!existsSync(file)) {
    await execFileAsync('say', [
      '-v', voice, '-r', rate,
      '--file-format=WAVE', `--data-format=LEI16@${sampleRate}`,
      '-o', file, text,
    ])
  }
  return readPcm(await readFile(file))
}

function readPcm(buf) {
  let offset = 12
  while (offset < buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    if (id === 'data') return buf.subarray(offset + 8, offset + 8 + size)
    offset += 8 + size + (size % 2)
  }
  throw new Error('WAV has no data chunk')
}

function wavFile(pcm, channels) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2 * channels, 28)
  header.writeUInt16LE(2 * channels, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

async function main() {
  await mkdir(audioDir, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  await page.addInitScript(() => { window.__RENDER__ = true })
  await page.goto(pathToFileURL(path.join(here, 'scenes.html')).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)

  const narration = await page.evaluate(() => window.NARRATION)
  const clips = []
  for (const scene of narration) {
    clips.push(await Promise.all(scene.cues.map(cue => sayToWav(cue.say))))
  }
  const durations = clips.map(scene => scene.map(pcm => pcm.length / 2 / sampleRate))

  const timeline = await page.evaluate(
    ([d, s]) => {
      const tl = window.buildTimeline(d, s)
      window.setup(tl)
      return { total: tl.total, scenes: tl.scenes.map(({ id, start, duration, cues }) => ({ id, start, duration, cues })) }
    },
    [durations, spacing],
  )
  console.log(`timeline: ${timeline.total.toFixed(1)}s, ${timeline.scenes.length} scenes`)

  if (stillsOnly) {
    const stillsDir = path.join(outDir, 'stills')
    await mkdir(stillsDir, { recursive: true })
    for (const [i, s] of timeline.scenes.entries()) {
      const t = s.start + s.duration - spacing.tail + 0.2
      await page.evaluate(x => window.seek(x), t)
      await page.screenshot({ path: path.join(stillsDir, `${String(i + 1).padStart(2, '0')}-${s.id}.png`) })
    }
    await browser.close()
    console.log(`stills written to ${stillsDir}`)
    return
  }

  const musicWav = path.join(outDir, 'music.wav')
  await writeFile(musicWav, wavFile(synthesizeMusic({ seconds: timeline.total, sampleRate }), 2))

  const outFile = path.join(outDir, 'lumpcode-intro.mp4')
  if (audioOnly) {
    await browser.close()
    const remuxed = path.join(outDir, 'lumpcode-intro.remux.mp4')
    await execFileAsync(ffmpegPath, [
      '-y', '-loglevel', 'error',
      '-i', outFile, '-i', musicWav,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
      remuxed,
    ])
    await rename(remuxed, outFile)
    console.log(`replaced audio in ${outFile}`)
    return
  }

  const ffmpeg = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-i', musicWav,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outFile,
  ], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((resolve, reject) => {
    ffmpeg.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))))
  })

  const frames = Math.ceil(timeline.total * fps)
  for (let f = 0; f < frames; f++) {
    await page.evaluate(x => window.seek(x), f / fps)
    const jpeg = await page.screenshot({ type: 'jpeg', quality: 92 })
    if (!ffmpeg.stdin.write(jpeg)) await new Promise(r => ffmpeg.stdin.once('drain', r))
    if (f % (fps * 5) === 0) process.stdout.write(`\rframe ${f}/${frames}`)
  }
  ffmpeg.stdin.end()
  await done
  await browser.close()
  console.log(`\nwrote ${outFile}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
