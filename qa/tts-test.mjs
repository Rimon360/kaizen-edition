// End-to-end test of the Windows SAPI TTS engine.
// Runs the EXACT PowerShell scripts from electron/main/tts.ts to enumerate
// installed voices and synthesize a real WAV, then validates the output.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffprobeStatic from 'ffprobe-static'

const DIR = mkdtempSync(join(tmpdir(), 'kaizen-tts-qa-'))
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS  ${m}`) } else { fail++; console.log(`  FAIL  ${m}`) } }

const ENUM_SCRIPT = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
  $i = $_.VoiceInfo
  [pscustomobject]@{ name = $i.Name; culture = $i.Culture.Name; gender = $i.Gender.ToString() }
})
$s.Dispose()
ConvertTo-Json -InputObject $voices -Compress
`.trim()

const SYNTH_SCRIPT = `
param(
  [Parameter(Mandatory=$true)][string]$TextFile,
  [Parameter(Mandatory=$true)][string]$Out,
  [string]$VoiceName = "",
  [int]$Rate = 0,
  [int]$Volume = 100,
  [int]$Pitch = 0
)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($VoiceName -ne "") { try { $synth.SelectVoice($VoiceName) } catch {} }
if ($Rate -lt -10) { $Rate = -10 }
if ($Rate -gt 10) { $Rate = 10 }
if ($Volume -lt 0) { $Volume = 0 }
if ($Volume -gt 100) { $Volume = 100 }
$synth.Rate = $Rate
$synth.Volume = $Volume
$synth.SetOutputToWaveFile($Out)
$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
$escaped = [System.Security.SecurityElement]::Escape($text)
$culture = $synth.Voice.Culture.Name
$sign = "+"
if ($Pitch -lt 0) { $sign = "" }
$pitchStr = "$sign$Pitch%"
$ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='$culture'><prosody pitch='$pitchStr'>$escaped</prosody></speak>"
try { $synth.SpeakSsml($ssml) } catch { $synth.Speak($text) }
$synth.Dispose()
`.trim()

function ps(args) {
  return new Promise((res) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args])
    let stdout = '', stderr = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.stderr.on('data', (d) => (stderr += d))
    p.on('close', (code) => res({ code, stdout, stderr }))
    p.on('error', (e) => res({ code: -1, stdout, stderr: String(e) }))
  })
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('  SKIP  not on Windows — SAPI TTS test only runs on Windows')
    process.exit(0)
  }
  console.log(`workdir = ${DIR}\n`)

  // 1. Enumerate voices.
  const e = await ps(['-Command', ENUM_SCRIPT])
  let voices = []
  try { const parsed = JSON.parse((e.stdout || '').trim() || '[]'); voices = Array.isArray(parsed) ? parsed : [parsed] } catch { /* */ }
  ok(e.code === 0, 'enumVoices script ran (exit 0)')
  ok(voices.length >= 1, `enumerated ${voices.length} installed voice(s)`)
  if (voices.length) {
    const v = voices[0]
    ok(!!(v.name && v.culture && v.gender), `voice shape ok: ${v.name} (${v.culture}, ${v.gender})`)
    console.log('   voices: ' + voices.map((x) => x.name).join(', '))
  }

  // 2. Synthesize a WAV (exactly as tts.ts does: temp .ps1 + temp text + -File).
  const voiceName = voices[0]?.name ?? ''
  const scriptPath = join(DIR, 'synth.ps1')
  writeFileSync(scriptPath, SYNTH_SCRIPT, 'utf8')
  const textPath = join(DIR, 'text.txt')
  writeFileSync(textPath, 'Hola, esto es una prueba de voz en off generada por KAIZEN EDITION. Uno dos tres.', 'utf8')
  const out = join(DIR, 'voice.wav')
  const s = await ps(['-File', scriptPath, '-TextFile', textPath, '-Out', out,
    '-VoiceName', voiceName, '-Rate', '0', '-Volume', '100', '-Pitch', '5'])
  if (s.code !== 0) console.log('   synth stderr: ' + (s.stderr || '').slice(0, 300))
  ok(s.code === 0, 'synth script ran (exit 0)')
  ok(existsSync(out) && statSync(out).size > 1000, `WAV produced (${existsSync(out) ? statSync(out).size : 0} bytes)`)
  if (existsSync(out)) {
    const head = readFileSync(out).slice(0, 12)
    ok(head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE', 'WAV has valid RIFF/WAVE header')
    // probe duration with ffprobe
    const pr = await new Promise((res) => {
      const p = spawn(ffprobeStatic.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', out])
      let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('close', () => res(o.trim()))
    })
    ok(parseFloat(pr) > 0.5, `synthesized audio has duration (${pr}s)`)
  }

  console.log(`\n==== SAPI TTS: ${pass} passed, ${fail} failed ====`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('FATAL', e); process.exit(2) })
