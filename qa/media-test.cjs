// Real-Electron E2E test of the media:// protocol + <audio> playback.
// Reproduces the exact failing path: a file:// renderer loading a WAV via
// media://, and reports whether the audio element can actually play it.
const { app, protocol, BrowserWindow } = require('electron')
const { createReadStream, existsSync, statSync, writeFileSync } = require('node:fs')
const { extname, join } = require('node:path')
const { tmpdir } = require('node:os')
const { Readable } = require('node:stream')

const WAV = process.argv[2]
const MIME = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png' }
const mimeFor = (p) => MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
])

app.whenReady().then(() => {
  protocol.handle('media', (request) => {
    try {
      const url = new URL(request.url)
      const b64 = url.pathname.replace(/^\//, '') || url.host
      const filePath = Buffer.from(decodeURIComponent(b64), 'base64url').toString('utf8')
      if (!existsSync(filePath)) return new Response('Not found', { status: 404 })
      const size = statSync(filePath).size
      const mime = mimeFor(filePath)
      const range = request.headers.get('Range')
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range)
        const start = m ? parseInt(m[1], 10) : 0
        const end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1
        const stream = createReadStream(filePath, { start, end })
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: { 'Content-Type': mime, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) },
        })
      }
      return new Response(Readable.toWeb(createReadStream(filePath)), {
        status: 200,
        headers: { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': String(size) },
      })
    } catch (e) {
      return new Response('err ' + e.message, { status: 400 })
    }
  })

  const b64 = Buffer.from(WAV, 'utf8').toString('base64url')
  const htmlPath = join(tmpdir(), 'kz_media_test.html')
  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; media-src 'self' data: blob: file: media:; img-src 'self' data: blob: file: media:; script-src 'self' 'unsafe-inline'">
    </head><body><audio id="a"></audio><script>
      const a=document.getElementById('a');
      a.addEventListener('canplaythrough',()=>{document.title='OK:canplaythrough:'+a.duration.toFixed(2)+'s';});
      a.addEventListener('loadedmetadata',()=>{document.title='OK:loadedmetadata:'+a.duration.toFixed(2)+'s';});
      a.addEventListener('error',()=>{document.title='ERR:code'+(a.error&&a.error.code)+':'+(a.error&&a.error.message||'');});
      a.src='media://f/${b64}';
      a.load();
    </script></body></html>`,
    'utf8',
  )

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
  win.loadFile(htmlPath)
  let tries = 0
  const iv = setInterval(() => {
    tries++
    const t = win.getTitle()
    if (t.startsWith('OK') || t.startsWith('ERR') || tries > 40) {
      console.log('RESULT: ' + t)
      clearInterval(iv)
      app.quit()
    }
  }, 200)
})
