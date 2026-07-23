// Confirm the transcription progress ticker actually emits intermediate values
// during a SLOW (long-audio) inference — i.e. onnxruntime doesn't block the
// worker's event loop. Transcribes a ~60s clip with the 'accurate' model.
const { app, utilityProcess } = require('electron')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const ffmpeg = require('ffmpeg-static')

app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const worker = utilityProcess.fork(join(__dirname, '..', 'out', 'main', 'whisper-process.js'), [], {
    serviceName: 'prog-test',
  })
  const ticks = []
  worker.postMessage({ type: 'init', ffmpegPath: ffmpeg, cacheDir: join(tmpdir(), 'kz-whisper-cache') })
  worker.postMessage({
    type: 'transcribe',
    id: 1,
    audioPath: join(process.env.TEMP, 'whisper_long.wav'),
    model: 'accurate',
    language: 'en',
  })
  worker.on('message', (msg) => {
    if (msg.type === 'progress' && msg.payload.phase === 'transcribing') {
      ticks.push(msg.payload.percent)
      console.log('transcribing %:', msg.payload.percent)
    } else if (msg.type === 'result') {
      const intermediate = ticks.filter((p) => p > 1 && p < 100)
      console.log('all ticks:', JSON.stringify(ticks))
      const ok = intermediate.length >= 2
      console.log(
        ok
          ? `RESULT: PASS — ${intermediate.length} moving updates during inference (not stuck).`
          : 'RESULT: FAIL — no intermediate progress (event loop blocked).',
      )
      worker.kill()
      app.exit(ok ? 0 : 1)
    }
  })
  setTimeout(() => { console.log('RESULT: FAIL — timeout'); app.exit(1) }, 280000)
})
