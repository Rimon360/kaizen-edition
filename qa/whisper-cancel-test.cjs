// Verify a transcription can be canceled mid-inference: killing the worker (what
// cancelTranscribe does) must terminate it promptly even though its JS thread is
// blocked in onnxruntime, and fire 'exit' (which the host turns into a canceled
// result). Transcribes a 61s clip with the slow model, kills it after 2.5s.
const { app, utilityProcess } = require('electron')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const ffmpeg = require('ffmpeg-static')

app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const worker = utilityProcess.fork(join(__dirname, '..', 'out', 'main', 'whisper-process.js'), [], {
    serviceName: 'cancel-test',
  })
  let exited = false
  let killedAt = 0
  worker.postMessage({ type: 'init', ffmpegPath: ffmpeg, cacheDir: join(tmpdir(), 'kz-whisper-cache') })
  worker.postMessage({
    type: 'transcribe',
    id: 1,
    audioPath: join(process.env.TEMP, 'whisper_long.wav'),
    model: 'accurate',
    language: 'en',
  })
  let sawTranscribing = false
  worker.on('message', (msg) => {
    if (msg.type === 'progress' && msg.payload.phase === 'transcribing' && !sawTranscribing) {
      sawTranscribing = true
      // Mid-inference: cancel by killing the worker (this is what cancelTranscribe does).
      setTimeout(() => {
        console.log('killing worker mid-inference…')
        killedAt = Date.now()
        worker.kill()
      }, 2500)
    } else if (msg.type === 'result') {
      console.log('unexpected: got a result before kill')
    }
  })
  worker.on('exit', () => {
    exited = true
    const ms = killedAt ? Date.now() - killedAt : -1
    console.log(`worker exited ${ms}ms after kill`)
    const ok = killedAt > 0 && ms < 3000
    console.log(ok
      ? 'RESULT: PASS — cancel terminates the worker mid-inference promptly.'
      : 'RESULT: FAIL — worker did not exit promptly after kill.')
    app.exit(ok ? 0 : 1)
  })
  setTimeout(() => {
    if (!exited) { console.log('RESULT: FAIL — never exited'); app.exit(1) }
  }, 120000)
})
