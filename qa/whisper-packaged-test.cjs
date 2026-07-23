// De-risk packaging: prove utilityProcess.fork can load the worker script from
// INSIDE app.asar (the packaged layout) and that it still transcribes. The path
// below points at the script physically embedded in the packed asar.
const { app, utilityProcess } = require('electron')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const ffmpeg = require('ffmpeg-static')

const asarWorker = join(
  __dirname,
  '..',
  'release',
  'win-unpacked',
  'resources',
  'app.asar',
  'out',
  'main',
  'whisper-process.js',
)

app.disableHardwareAcceleration()
app.whenReady().then(() => {
  console.log('forking asar-internal worker:', asarWorker)
  const worker = utilityProcess.fork(asarWorker, [], { serviceName: 'pkg-whisper' })

  worker.postMessage({ type: 'init', ffmpegPath: ffmpeg, cacheDir: join(tmpdir(), 'kz-whisper-cache') })
  worker.postMessage({
    type: 'transcribe',
    id: 1,
    audioPath: join(process.env.TEMP, 'whisper_test.wav'),
    model: 'fast',
    language: 'auto',
  })

  worker.on('message', (msg) => {
    if (msg.type === 'progress') console.log('progress:', JSON.stringify(msg.payload))
    else if (msg.type === 'result') {
      console.log('TEXT     :', JSON.stringify(String(msg.result.text || '').slice(0, 80)))
      console.log('result.ok:', msg.result.ok, '| segments:', (msg.result.segments || []).length)
      console.log(msg.result.ok ? 'RESULT: PASS — worker ran from inside app.asar.' : 'RESULT: FAIL')
      worker.kill()
      app.exit(msg.result.ok ? 0 : 1)
    }
  })
  worker.on('exit', (code) => console.log('worker exited:', code))
  setTimeout(() => {
    console.log('RESULT: FAIL — timeout')
    app.exit(1)
  }, 200000)
})
