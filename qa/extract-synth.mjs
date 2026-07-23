// Extract the runtime value of SYNTH_SCRIPT from the built bundle and run it,
// to prove the bundled PowerShell (incl. the IAsyncOperation`1 backtick) works.
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const src = readFileSync('out/main/index.js', 'utf8')
const marker = 'SYNTH_SCRIPT = `'
const start = src.indexOf(marker) + marker.length
// Walk to the closing (unescaped) backtick, resolving template-literal escapes.
let i = start
let out = ''
while (i < src.length) {
  const c = src[i]
  if (c === '\\') {
    const n = src[i + 1]
    out += n === '`' ? '`' : n === '\\' ? '\\' : n === 'n' ? '\n' : n === 't' ? '\t' : n
    i += 2
    continue
  }
  if (c === '`') break
  out += c
  i++
}
out = out.trim()

const hasCleanBacktick = out.includes("IAsyncOperation`1") && !out.includes('IAsyncOperation\\`1')
console.log('SYNTH_SCRIPT has clean IAsyncOperation`1 :', hasCleanBacktick)

const dir = tmpdir()
const scriptPath = join(dir, 'kz_extracted_synth.ps1')
const textPath = join(dir, 'kz_extracted_text.txt')
const outWav = join(dir, 'kz_extracted_mark.wav')
writeFileSync(scriptPath, out, 'utf8')
writeFileSync(textPath, 'Bundled WinRT synthesis test. One two three.', 'utf8')

const ps = spawn('powershell.exe', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
  '-TextFile', textPath, '-Out', outWav, '-VoiceName', 'Microsoft Mark',
  '-Rate', '0', '-Volume', '100', '-Pitch', '0',
])
let err = ''
ps.stderr.on('data', (d) => (err += d))
ps.on('close', (code) => {
  const fs = require('node:fs')
  const ok = fs.existsSync(outWav)
  const b = ok ? fs.readFileSync(outWav) : null
  const valid = ok && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WAVE'
  console.log('exit', code, '| WAV exists', ok, '| valid', valid, '| size', ok ? b.length : 0)
  if (err.trim()) console.log('stderr:', err.trim().slice(0, 200))
  process.exit(valid ? 0 : 1)
})
