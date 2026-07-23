// Feasibility probe: can Whisper emit partial text via callback_function, and do
// those partials FLUSH to the host process live (vs. batching until inference
// ends)? Runs as a utilityProcess; posts each callback with a worker timestamp.
const { spawn } = require('node:child_process')
const { Buffer } = require('node:buffer')
const importEsm = new Function('s', 'return import(s)')
const parentPort = process.parentPort
let cfg = { ffmpegPath: 'ffmpeg', cacheDir: '' }
const post = (m) => parentPort.postMessage(m)

function decodeAudio(path) {
  return new Promise((resolve, reject) => {
    const ff = spawn(cfg.ffmpegPath, ['-i', path, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'])
    const chunks = []
    ff.stdout.on('data', (d) => chunks.push(d))
    ff.on('error', reject)
    ff.on('close', () => {
      const buf = Buffer.concat(chunks)
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)))
    })
  })
}

parentPort.on('message', async (e) => {
  const msg = e.data
  if (msg.type === 'init') { cfg = { ffmpegPath: msg.ffmpegPath, cacheDir: msg.cacheDir }; return }
  if (msg.type !== 'go') return
  try {
    const { pipeline, env } = await importEsm('@xenova/transformers')
    env.cacheDir = cfg.cacheDir
    env.allowRemoteModels = true
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base')
    const audio = await decodeAudio(msg.audioPath)
    post({ type: 'start', t: Date.now() })
    let calls = 0
    const out = await transcriber(audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      task: 'transcribe',
      callback_function: (beams) => {
        calls++
        let text = ''
        try {
          text = transcriber.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true })
        } catch (err) {
          text = '<decode-failed:' + (err && err.message) + '>'
        }
        // Only post occasionally to keep the log readable.
        if (calls % 8 === 0) post({ type: 'partial', t: Date.now(), calls, tail: text.slice(-50) })
      },
    })
    post({ type: 'done', t: Date.now(), calls, text: String(out.text || '').slice(0, 80) })
  } catch (err) {
    post({ type: 'error', error: err && err.message })
  }
})
