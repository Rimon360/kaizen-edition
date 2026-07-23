// Verify the REAL built worker (out/main/whisper-process.js) streams live partial
// transcript text during inference (throttled callback), with timestamps.
const { app, utilityProcess } = require('electron')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const ffmpeg = require('ffmpeg-static')

app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const worker = utilityProcess.fork(join(__dirname, '..', 'out', 'main', 'whisper-process.js'), [], {
    serviceName: 'live-real',
  })
  let start = 0
  const partials = []
  worker.postMessage({ type: 'init', ffmpegPath: ffmpeg, cacheDir: join(tmpdir(), 'kz-whisper-cache') })
  worker.postMessage({
    type: 'transcribe',
    id: 1,
    audioPath: join(process.env.TEMP, 'whisper_long.wav'),
    model: 'fast',
    language: 'en',
  })
  worker.on('message', (msg) => {
    const now = Date.now()
    if (msg.type === 'progress') {
      const p = msg.payload
      if (p.phase === 'transcribing' && p.percent === 1 && p.durationSec) start = now
      if (p.partialText !== undefined) {
        const t = now - start
        partials.push(t)
        console.log(`host +${t}ms  partial: "...${p.partialText.slice(-55)}"`)
      }
    } else if (msg.type === 'result') {
      const total = now - start
      console.log(`\nFINAL (+${total}ms): "${String(msg.result.text || '').slice(0, 90)}"`)
      const first = partials[0] ?? total
      const live = partials.length >= 3 && first < total * 0.7
      console.log(`partials: ${partials.length}, first @${first}ms of ${total}ms`)
      console.log(live
        ? 'RESULT: PASS — live partial transcript streamed during inference.'
        : 'RESULT: FAIL — partials did not stream live.')
      worker.kill()
      app.exit(live ? 0 : 1)
    }
  })
  setTimeout(() => { console.log('timeout'); app.exit(1) }, 280000)
})
