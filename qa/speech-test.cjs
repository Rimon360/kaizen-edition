// Does the renderer's Web Speech API work in this Electron? (voices + speak)
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

app.whenReady().then(() => {
  const html = `<!doctype html><html><body><script>
    function go(){
      const voices = speechSynthesis.getVoices();
      if(!voices.length) return false;
      const v = voices.find(x=>/Zira/i.test(x.name)) || voices.find(x=>/David/i.test(x.name)) || voices[0];
      const u = new SpeechSynthesisUtterance('Voice preview test. One two three.');
      u.voice = v; u.rate = 1; u.pitch = 1; u.volume = 1;
      u.onstart=()=>{document.title='OK:started|count='+voices.length+'|voice='+v.name;};
      u.onend=()=>{document.title='OK:ended|count='+voices.length+'|voice='+v.name;};
      u.onerror=(e)=>{document.title='ERR:'+(e.error||'unknown');};
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      return true;
    }
    window.__done=false;
    if(!go()){ speechSynthesis.onvoiceschanged=()=>{ if(!window.__done) window.__done=go(); }; }
    setTimeout(()=>{ if(document.title.indexOf('OK')<0 && document.title.indexOf('ERR')<0) document.title='NOVOICES:count='+speechSynthesis.getVoices().length; }, 4500);
  </script></body></html>`
  const p = join(tmpdir(), 'kz_speech.html')
  writeFileSync(p, html, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
  win.loadFile(p)
  let tries = 0
  const iv = setInterval(() => {
    tries++
    const t = win.getTitle()
    if (t.startsWith('OK') || t.startsWith('ERR') || t.startsWith('NOVOICES') || tries > 45) {
      console.log('RESULT: ' + t)
      clearInterval(iv)
      app.quit()
    }
  }, 200)
})
