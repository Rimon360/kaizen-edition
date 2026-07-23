// Verify the offline Whisper path works under ELECTRON's runtime (the real risk:
// does onnxruntime-node's N-API binary load, and does dynamic import() of the
// ESM @xenova/transformers work in the main process). Mirrors electron/main/whisper.ts.
const { app } = require('electron')
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const ffmpeg = require('ffmpeg-static')

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  let code = 1
  try {
    const wav = process.argv.find((a) => a.endsWith('.wav')) || join(process.env.TEMP, 'whisper_test.wav')
    const r = spawnSync(ffmpeg, ['-i', wav, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], {
      maxBuffer: 1 << 28,
    })
    if (r.status !== 0) throw new Error('ffmpeg decode failed')
    const buf = r.stdout
    const audio = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4))

    const { pipeline, env } = await import('@xenova/transformers')
    env.cacheDir = join(app.getPath('userData'), 'whisper-models')
    env.allowRemoteModels = true
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny')
    const out = await transcriber(audio, { return_timestamps: true, chunk_length_s: 30 })

    const text = String(out.text || '')
    const chunks = out.chunks || []
    console.log('ELECTRON-WHISPER TEXT  :', JSON.stringify(text.trim()))
    console.log('ELECTRON-WHISPER CHUNKS:', chunks.length, JSON.stringify(chunks[0]?.timestamp))
    const ok = /testing|speech|text|check/i.test(text) && chunks.length > 0
    console.log(ok ? 'RESULT: PASS — onnxruntime + Whisper run under Electron.' : 'RESULT: FAIL')
    code = ok ? 0 : 1
  } catch (e) {
    console.error('RESULT: FAIL —', (e && e.message) || e)
    code = 1
  } finally {
    app.exit(code)
  }
})
