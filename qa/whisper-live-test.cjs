// Host for the live-transcription probe. Logs the HOST receive-time of each
// partial: if they arrive spread across the run, live streaming is feasible; if
// they all cluster at the end, partials batch (blocked event loop) and live
// token streaming is NOT feasible with this setup.
const { app, utilityProcess } = require('electron')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const ffmpeg = require('ffmpeg-static')

app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const worker = utilityProcess.fork(join(__dirname, 'whisper-live-worker.cjs'), [], { serviceName: 'live-test' })
  let hostStart = 0
  const recvTimes = []
  worker.postMessage({ type: 'init', ffmpegPath: ffmpeg, cacheDir: join(tmpdir(), 'kz-whisper-cache') })
  worker.postMessage({ type: 'go', audioPath: join(process.env.TEMP, 'whisper_long.wav') })
  worker.on('message', (msg) => {
    const now = Date.now()
    if (msg.type === 'start') { hostStart = now; console.log('inference started') }
    else if (msg.type === 'partial') {
      const recv = now - hostStart
      recvTimes.push(recv)
      console.log(`host +${recv}ms  | partial @callbacks=${msg.calls}  "...${msg.tail}"`)
    } else if (msg.type === 'error') { console.log('ERROR:', msg.error); worker.kill(); app.exit(1) }
    else if (msg.type === 'done') {
      const total = now - hostStart
      console.log(`host +${total}ms  | DONE (${msg.calls} callbacks) text="${msg.text}"`)
      // Live if partials are spread out: the earliest partial arrived well before
      // the end, and there's meaningful spread between first and last.
      const first = recvTimes[0] ?? total
      const last = recvTimes[recvTimes.length - 1] ?? total
      const spread = last - first
      const live = recvTimes.length >= 3 && first < total * 0.6 && spread > total * 0.3
      console.log(`\nfirst partial @${first}ms, last @${last}ms, done @${total}ms`)
      console.log(live
        ? 'RESULT: LIVE — partials flush across the run; live transcription is feasible.'
        : 'RESULT: BATCHED — partials cluster at the end; token-level live streaming is NOT feasible here.')
      worker.kill()
      app.exit(0)
    }
  })
  setTimeout(() => { console.log('timeout'); app.exit(1) }, 280000)
})
