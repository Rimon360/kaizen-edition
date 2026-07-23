// Verify transcription runs in the utilityProcess WITHOUT blocking the main thread.
// A 100ms timer ticks on the MAIN process during the run — if transcription blocked
// main (the old bug), the gaps between ticks would spike to seconds; with the worker
// they stay ~100ms. Also confirms the worker transcribes + emits progress/result.
const { app, utilityProcess } = require('electron')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const ffmpeg = require('ffmpeg-static')

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  const worker = utilityProcess.fork(join(__dirname, '..', 'out', 'main', 'whisper-process.js'), [], {
    serviceName: 'test-whisper',
  })

  // Main-thread responsiveness probe.
  let ticks = 0
  const gaps = []
  let last = Date.now()
  const iv = setInterval(() => {
    const now = Date.now()
    gaps.push(now - last)
    last = now
    ticks++
  }, 100)

  worker.postMessage({ type: 'init', ffmpegPath: ffmpeg, cacheDir: join(tmpdir(), 'kz-whisper-cache') })
  worker.postMessage({
    type: 'transcribe',
    id: 1,
    audioPath: join(process.env.TEMP, 'whisper_test.wav'),
    model: 'fast', // whisper-base, cached → quick
    language: 'auto',
  })

  worker.on('message', (msg) => {
    if (msg.type === 'progress') {
      console.log('progress:', JSON.stringify(msg.payload))
    } else if (msg.type === 'result') {
      clearInterval(iv)
      const maxGap = gaps.length ? Math.max(...gaps) : 0
      const text = String(msg.result.text || '').slice(0, 80)
      console.log('TEXT      :', JSON.stringify(text))
      console.log('result.ok :', msg.result.ok, '| segments:', (msg.result.segments || []).length)
      console.log('main ticks:', ticks, '| max gap between 100ms ticks:', maxGap + 'ms')
      const responsive = maxGap < 1000 // a blocked main would show multi-second gaps
      const ok = !!msg.result.ok && responsive
      console.log(
        ok
          ? 'RESULT: PASS — transcribed in the worker; main thread stayed responsive.'
          : `RESULT: FAIL (ok=${msg.result.ok}, responsive=${responsive}, maxGap=${maxGap}ms)`,
      )
      worker.kill()
      app.exit(ok ? 0 : 1)
    }
  })
  worker.on('exit', (code) => console.log('worker exited:', code))
  setTimeout(() => {
    console.log('RESULT: FAIL — timeout')
    app.exit(1)
  }, 200000)
})
