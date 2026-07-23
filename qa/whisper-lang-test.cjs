// Prove the `language` parameter controls the transcription language. We run the
// SAME audio through the worker forced to English ('en') vs Spanish ('es'); the
// outputs must differ — which is exactly why forcing 'es' for Spanish audio (the
// fix: 'auto' -> app language) yields Spanish instead of English.
const { app, utilityProcess } = require('electron')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const ffmpeg = require('ffmpeg-static')

app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const worker = utilityProcess.fork(join(__dirname, '..', 'out', 'main', 'whisper-process.js'), [], {
    serviceName: 'lang-test',
  })
  const results = {}
  worker.postMessage({ type: 'init', ffmpegPath: ffmpeg, cacheDir: join(tmpdir(), 'kz-whisper-cache') })
  const audio = join(process.env.TEMP, 'whisper_test.wav')
  worker.postMessage({ type: 'transcribe', id: 1, audioPath: audio, model: 'fast', language: 'en' })
  worker.postMessage({ type: 'transcribe', id: 2, audioPath: audio, model: 'fast', language: 'es' })

  worker.on('message', (msg) => {
    if (msg.type !== 'result') return
    results[msg.id] = String(msg.result.text || '').trim()
    if (results[1] !== undefined && results[2] !== undefined) {
      console.log('forced EN:', JSON.stringify(results[1]))
      console.log('forced ES:', JSON.stringify(results[2]))
      const differ = results[1] !== results[2]
      console.log(
        differ
          ? 'RESULT: PASS — the language parameter changes the output language (forcing ES works).'
          : 'RESULT: FAIL — output identical regardless of language.',
      )
      worker.kill()
      app.exit(differ ? 0 : 1)
    }
  })
  setTimeout(() => { console.log('RESULT: FAIL — timeout'); app.exit(1) }, 200000)
})
