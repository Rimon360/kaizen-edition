// Validate the robustness fixes (mirrors electron/main/whisper.ts logic):
//   - silent audio rejected by RMS check (no "[Music]" hallucination)
//   - non-speech rejected by garbage/hallucination detector
//   - real speech still accepted, with no_repeat_ngram_size applied
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ffmpeg = require('ffmpeg-static')
import { pipeline, env } from '@xenova/transformers'

env.cacheDir = join(tmpdir(), 'kz-whisper-cache')

function decode(wav) {
  const r = spawnSync(ffmpeg, ['-i', wav, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 })
  const b = r.stdout
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4))
}
function rms(a) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * a[i]
  return Math.sqrt(s / Math.max(1, a.length))
}
const HALLUC = new Set(['music','applause','thanks for watching','thank you for watching','thank you','thanks','you','subscribe','silence','blank audio','foreign'])
function looksLikeGarbage(text) {
  const norm = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!norm) return true
  if (HALLUC.has(norm)) return true
  const w = norm.split(' ').filter(Boolean)
  if (w.length >= 8 && new Set(w).size / w.length < 0.35) return true
  return false
}

const T = process.env.TEMP || tmpdir()
const inputs = {
  speech: join(T, 'whisper_test.wav'),
  silence: join(T, 'kz_silence.wav'),
  noise: join(T, 'kz_noise.wav'),
}
const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base')

const results = {}
for (const [name, wav] of Object.entries(inputs)) {
  const audio = decode(wav)
  const amp = rms(audio)
  let decision, text = ''
  if (amp < 0.0008) {
    decision = 'REJECT(silence)'
  } else {
    const out = await transcriber(audio, { return_timestamps: true, chunk_length_s: 30, no_repeat_ngram_size: 3 })
    text = String(out.text || '').trim()
    decision = looksLikeGarbage(text) ? 'REJECT(garbage)' : 'ACCEPT'
  }
  results[name] = decision
  console.log(`[${name}] rms=${amp.toFixed(4)} -> ${decision}  ${JSON.stringify(text.slice(0, 60))}`)
}

const ok =
  results.speech === 'ACCEPT' &&
  results.silence.startsWith('REJECT') &&
  results.noise.startsWith('REJECT')
console.log('')
console.log(ok
  ? 'RESULT: PASS — real speech accepted; silence + non-speech rejected (no junk in the box).'
  : 'RESULT: FAIL')
process.exit(ok ? 0 : 1)
