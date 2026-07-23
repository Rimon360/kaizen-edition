// Feasibility/regression test: decode an audio file to 16kHz mono via ffmpeg,
// then transcribe it with @xenova/transformers (Whisper) and print text + timed
// segments. Proves the offline STT path works (model download + onnxruntime + timestamps).
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ffmpegStatic = require('ffmpeg-static') // path string
import { pipeline, env } from '@xenova/transformers'

env.cacheDir = join(tmpdir(), 'kz-whisper-cache')
env.allowRemoteModels = true

const wav = process.argv[2] || join(process.env.TEMP || tmpdir(), 'whisper_test.wav')
const model = process.argv[3] || 'Xenova/whisper-tiny'

// 1. decode to 16kHz mono float32
const r = spawnSync(ffmpegStatic, ['-i', wav, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], {
  maxBuffer: 1 << 28,
})
if (r.status !== 0) {
  console.error('ffmpeg failed:', (r.stderr || '').toString().slice(-400))
  process.exit(1)
}
const buf = r.stdout
const audio = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4))
console.log(`audio: ${audio.length} samples (~${(audio.length / 16000).toFixed(1)}s)`)

// 2. transcribe
const t0 = Date.now()
const transcriber = await pipeline('automatic-speech-recognition', model)
console.log(`model "${model}" ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
const t1 = Date.now()
const out = await transcriber(audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 })
console.log(`transcribed in ${((Date.now() - t1) / 1000).toFixed(1)}s`)
console.log('TEXT  :', JSON.stringify((out.text || '').trim()))
console.log('CHUNKS:')
for (const c of (out.chunks || []).slice(0, 12)) {
  console.log(`  [${c.timestamp?.[0]}s -> ${c.timestamp?.[1]}s] ${JSON.stringify(c.text.trim())}`)
}

// 3. assert it recognized the spoken phrase (whisper-tiny normalizes "one two three"
//    to "12345" and may mishear the brand word, so check robust content words).
const text = (out.text || '').toLowerCase()
const hits = ['testing', 'speech', 'text', 'check'].filter((w) => text.includes(w))
const hasTiming = (out.chunks || []).some((c) => Array.isArray(c.timestamp) && c.timestamp[1] > 0)
const ok = hits.length >= 3 && hasTiming
console.log('')
console.log(`recognized keywords: ${hits.join(', ')} | has timestamps: ${hasTiming}`)
console.log(ok ? 'RESULT: PASS — offline Whisper transcription works with timestamps.' : 'RESULT: FAIL')
process.exit(ok ? 0 : 1)
