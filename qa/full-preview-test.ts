// Definitive end-to-end test of the real Play-Preview chain using the ACTUAL
// source modules: synthesize() from tts.ts -> media:// (mediaProtocol.ts) ->
// <audio> playback, from both file:// (packaged) and http:// (dev) origins.
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { writeFileSync, existsSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import http from 'node:http'
import { synthesize } from '../electron/main/tts'
import { registerMediaScheme, handleMediaProtocol } from '../electron/main/mediaProtocol'

registerMediaScheme()

function makeHtml(mediaUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; media-src 'self' data: blob: file: media:; script-src 'self' 'unsafe-inline'">
</head><body><audio id="a"></audio><script>
const a=document.getElementById('a');
a.addEventListener('canplaythrough',()=>{document.title='OK:'+a.duration.toFixed(2);});
a.addEventListener('loadedmetadata',()=>{document.title='OK:'+a.duration.toFixed(2);});
a.addEventListener('error',()=>{document.title='ERR:code'+(a.error&&a.error.code);});
a.src=${JSON.stringify(mediaUrl)};
a.load();
</script></body></html>`
}

function testWin(label: string, url: string): Promise<string> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
    let settled = false
    const done = (v: string) => {
      if (settled) return
      settled = true
      try { win.destroy() } catch { /* */ }
      resolve(`${label}=${v}`)
    }
    win.webContents.on('page-title-updated', (_e, title) => {
      if (title.startsWith('OK') || title.startsWith('ERR')) done(title)
    })
    win.webContents.on('did-fail-load', (_e, code, desc) => done(`LOAD_FAIL:${code}:${desc}`))
    win.webContents.on('render-process-gone', (_e, d) => done(`RENDERER_GONE:${d.reason}`))
    setTimeout(() => done(`TIMEOUT(title=${(() => { try { return win.getTitle() } catch { return '?' } })()})`), 8000)
    win.loadURL(url).catch((e) => done('LOADURL_THROW:' + e.message))
  })
}

app.whenReady().then(async () => {
  handleMediaProtocol()
  const voiceId = process.argv[2] || 'Microsoft Zira'
  console.log('Voice:', voiceId)

  // 1) REAL synthesize()
  const res = await synthesize({
    text: 'End to end preview test. Uno dos tres. One two three.',
    voiceId,
    rate: 0,
    pitch: 0,
    volume: 100,
  })
  console.log('SYNTH:', JSON.stringify(res))
  if (!res.ok || !res.outputPath) {
    console.log('RESULT: SYNTH_FAILED')
    app.quit()
    return
  }
  console.log('WAV:', existsSync(res.outputPath) ? statSync(res.outputPath).size + ' bytes' : 'MISSING')

  // 2) Same URL the preload's toMediaUrl produces
  const mediaUrl = `media://f/${Buffer.from(res.outputPath, 'utf8').toString('base64url')}`

  // 3a) file:// origin (packaged app)
  const htmlFile = join(tmpdir(), 'kz_full_test.html')
  writeFileSync(htmlFile, makeHtml(mediaUrl), 'utf8')
  const fileRes = await testWin('file', 'file:///' + htmlFile.replace(/\\/g, '/'))

  // 3b) http:// origin (dev server) — wait for the server to actually listen
  const server = http.createServer((_rq, rs) => {
    rs.setHeader('Content-Type', 'text/html; charset=utf-8')
    rs.end(makeHtml(mediaUrl))
  })
  const port: number = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
  )
  const httpRes = await testWin('http', `http://127.0.0.1:${port}/`)
  server.close()

  // 3c) blob URL — exactly what VoicePanel now does (read bytes -> Blob -> play)
  const wavB64 = readFileSync(res.outputPath).toString('base64')
  const blobHtml = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; media-src 'self' data: blob:; script-src 'self' 'unsafe-inline'">
</head><body><audio id="a"></audio><script>
const bin=atob(${JSON.stringify(wavB64)});const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
const url=URL.createObjectURL(new Blob([u8],{type:'audio/wav'}));
const a=document.getElementById('a');
a.addEventListener('canplaythrough',()=>{document.title='OK:'+a.duration.toFixed(2);});
a.addEventListener('loadedmetadata',()=>{document.title='OK:'+a.duration.toFixed(2);});
a.addEventListener('error',()=>{document.title='ERR:code'+(a.error&&a.error.code);});
a.src=url;a.load();
</script></body></html>`
  const blobHtmlPath = join(tmpdir(), 'kz_blob_test.html')
  writeFileSync(blobHtmlPath, blobHtml, 'utf8')
  const blobRes = await testWin('blob', 'file:///' + blobHtmlPath.replace(/\\/g, '/'))

  console.log('RESULT:', fileRes, '|', httpRes, '|', blobRes)
  app.quit()
})
