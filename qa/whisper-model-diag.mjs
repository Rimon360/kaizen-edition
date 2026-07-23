// Diagnose which Whisper model/quantization actually transcribes correctly (vs
// the "To To To" repetition garbage). Same clean TTS clip through several configs.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ffmpeg = require('ffmpeg-static')
import { pipeline, env } from '@xenova/transformers'

env.cacheDir = join(tmpdir(), 'kz-whisper-cache')
env.allowRemoteModels = true

const wav = process.argv[2] || join(process.env.TEMP || tmpdir(), 'whisper_test.wav')
const r = spawnSync(ffmpeg, ['-i', wav, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 })
const buf = r.stdout
const audio = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4))
console.log(`audio ~${(audio.length / 16000).toFixed(1)}s\n`)

const configs = [
  ['Xenova/whisper-tiny', true],
  ['Xenova/whisper-base', true],
  ['Xenova/whisper-base', false],
]
for (const [model, quantized] of configs) {
  try {
    const t = await pipeline('automatic-speech-recognition', model, { quantized })
    const out = await t(audio, { return_timestamps: true, chunk_length_s: 30 })
    const text = String(out.text || '').trim()
    const words = text.split(/\s+/)
    const uniqueRatio = new Set(words.map((w) => w.toLowerCase())).size / Math.max(1, words.length)
    const looping = uniqueRatio < 0.4 // lots of repeated tokens => garbage
    console.log(`${model} quantized=${quantized}  ${looping ? 'GARBAGE/LOOP' : 'OK'}  uniq=${uniqueRatio.toFixed(2)}`)
    console.log(`   -> ${JSON.stringify(text.slice(0, 90))}`)
  } catch (e) {
    console.log(`${model} quantized=${quantized}  ERROR: ${(e && e.message) || e}`)
  }
}
