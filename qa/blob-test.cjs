// Verifies the exact VoicePanel preview path: read WAV bytes -> Blob -> blob URL
// -> <audio>.play(), under the app's CSP. Standalone (reliable) Electron test.
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const WAV = process.argv[2]

app.whenReady().then(() => {
  const b64 = readFileSync(WAV).toString('base64')
  const htmlPath = join(tmpdir(), 'kz_blob_only.html')
  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; media-src 'self' data: blob: file: media:; script-src 'self' 'unsafe-inline'">
</head><body><audio id="a"></audio><script>
const bin=atob(${JSON.stringify(b64)});const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
const url=URL.createObjectURL(new Blob([u8],{type:'audio/wav'}));
const a=document.getElementById('a');
a.addEventListener('canplaythrough',()=>{document.title='OK:canplaythrough:'+a.duration.toFixed(2)+'s';});
a.addEventListener('loadedmetadata',()=>{document.title='OK:loadedmetadata:'+a.duration.toFixed(2)+'s';});
a.addEventListener('error',()=>{document.title='ERR:code'+(a.error&&a.error.code);});
a.src=url;a.load();a.play().catch(e=>{document.title='PLAYERR:'+e.message;});
</script></body></html>`,
    'utf8',
  )
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
  win.loadFile(htmlPath)
  let tries = 0
  const iv = setInterval(() => {
    tries++
    const t = win.getTitle()
    if (t.startsWith('OK') || t.startsWith('ERR') || t.startsWith('PLAYERR') || tries > 40) {
      console.log('RESULT: ' + t)
      clearInterval(iv)
      app.quit()
    }
  }, 200)
})
