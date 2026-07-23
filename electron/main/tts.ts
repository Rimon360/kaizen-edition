import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TtsRequest, TtsResult, Voice } from '../shared/types'

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

let tmp: string | null = null
function temp(): string {
  if (tmp && existsSync(tmp)) return tmp
  tmp = mkdtempSync(join(tmpdir(), 'kaizen-tts-'))
  return tmp
}

/** Remove the TTS temp dir (synthesized WAVs, scripts, text). Call on quit. */
export function cleanupTtsTemp(): void {
  if (tmp && existsSync(tmp)) {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
    tmp = null
  }
}

function ps(args: string[], input?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args])
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('error', reject)
    proc.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }))
    if (input !== undefined) {
      proc.stdin.write(input)
      proc.stdin.end()
    }
  })
}

// Enumerate via WinRT (Windows.Media.SpeechSynthesis) which exposes the full
// set of installed voices — the classic SAPI voices PLUS all the OneCore voices
// (Mark, Hazel, and every language pack's mobile voices). Falls back to the
// classic System.Speech list if WinRT isn't available.
const ENUM_SCRIPT = `
$ErrorActionPreference = 'Stop'
$voices = @()
try {
  [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime] | Out-Null
  foreach ($v in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) {
    $voices += [pscustomobject]@{ name = $v.DisplayName; culture = $v.Language; gender = $v.Gender.ToString() }
  }
} catch { }
if ($voices.Count -eq 0) {
  Add-Type -AssemblyName System.Speech
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  foreach ($iv in ($s.GetInstalledVoices() | Where-Object { $_.Enabled })) {
    $i = $iv.VoiceInfo
    $voices += [pscustomobject]@{ name = $i.Name; culture = $i.Culture.Name; gender = $i.Gender.ToString() }
  }
  $s.Dispose()
}
ConvertTo-Json -InputObject @($voices) -Compress
`.trim()

// Synthesize with smart routing: prefer System.Speech (SAPI) for the classic
// voices (higher sample rate), fall back to WinRT for the OneCore voices that
// SAPI can't drive, and finally to a System.Speech default. Voice names are
// matched fuzzily so a WinRT name ("Microsoft David") resolves to the SAPI
// "Microsoft David Desktop" and vice-versa.
const SYNTH_SCRIPT = `
param(
  [Parameter(Mandatory=$true)][string]$TextFile,
  [Parameter(Mandatory=$true)][string]$Out,
  [string]$VoiceName = "",
  [int]$Rate = 0,
  [int]$Volume = 100,
  [int]$Pitch = 0
)
$ErrorActionPreference = 'Stop'
if ($Rate -lt -10) { $Rate = -10 }
if ($Rate -gt 10) { $Rate = 10 }
if ($Volume -lt 0) { $Volume = 0 }
if ($Volume -gt 100) { $Volume = 100 }
if ($Pitch -lt -50) { $Pitch = -50 }
if ($Pitch -gt 50) { $Pitch = 50 }
$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
$done = $false

try {
  Add-Type -AssemblyName System.Speech
  $sapi = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $match = $null
  if ($VoiceName -ne "") {
    $match = $sapi.GetInstalledVoices() | Where-Object { $_.Enabled -and ($_.VoiceInfo.Name -eq $VoiceName -or $_.VoiceInfo.Name -like ('*' + $VoiceName + '*') -or $VoiceName -like ('*' + $_.VoiceInfo.Name + '*')) } | Select-Object -First 1
  }
  if ($match -or $VoiceName -eq "") {
    if ($match) { $sapi.SelectVoice($match.VoiceInfo.Name) }
    $sapi.Rate = $Rate
    $sapi.Volume = $Volume
    # Render at 48 kHz. The default SetOutputToWaveFile format is only 22 kHz —
    # telephone/"radio" bandwidth with nothing above 11 kHz — whereas 48 kHz lets
    # the engine emit real high-frequency detail and matches the export pipeline
    # (and the in-app Web Speech preview). Fall back to the default if a voice
    # rejects the explicit format.
    try {
      $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
      $sapi.SetOutputToWaveFile($Out, $fmt)
    } catch {
      $sapi.SetOutputToWaveFile($Out)
    }
    $escaped = [System.Security.SecurityElement]::Escape($text)
    $culture = $sapi.Voice.Culture.Name
    $sign = '+'
    if ($Pitch -lt 0) { $sign = '' }
    $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='$culture'><prosody pitch='$sign$Pitch%'>$escaped</prosody></speak>"
    try { $sapi.SpeakSsml($ssml) } catch { $sapi.Speak($text) }
    $done = $true
  }
  $sapi.Dispose()
} catch { }

if (-not $done) {
  try {
    [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
    function Await($op, $t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }
    $w = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::new()
    $rt = 1.0 + ($Rate / 10.0)
    if ($rt -lt 0.5) { $rt = 0.5 }
    if ($rt -gt 6.0) { $rt = 6.0 }
    $w.Options.SpeakingRate = $rt
    $w.Options.AudioPitch = [math]::Max(0.0, [math]::Min(2.0, 1.0 + ($Pitch / 100.0)))
    $w.Options.AudioVolume = [math]::Max(0.0, [math]::Min(1.0, $Volume / 100.0))
    if ($VoiceName -ne "") {
      $v = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq $VoiceName } | Select-Object -First 1
      if (-not $v) { $v = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like ('*' + $VoiceName + '*') } | Select-Object -First 1 }
      if ($v) { $w.Voice = $v }
    }
    $stream = Await ($w.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $size = [uint32]$stream.Size
    $dr = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
    Await ($dr.LoadAsync($size)) ([uint32]) | Out-Null
    $bytes = New-Object byte[] $size
    $dr.ReadBytes($bytes)
    [System.IO.File]::WriteAllBytes($Out, $bytes)
    $done = $true
  } catch { }
}

if (-not $done) {
  Add-Type -AssemblyName System.Speech
  $f = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $fmt2 = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $f.SetOutputToWaveFile($Out, $fmt2)
  } catch {
    $f.SetOutputToWaveFile($Out)
  }
  $f.Speak($text)
  $f.Dispose()
}
`.trim()

export async function listVoices(): Promise<Voice[]> {
  if (isWin) {
    try {
      const { stdout } = await ps(['-Command', ENUM_SCRIPT])
      const raw = stdout.trim()
      if (!raw) return []
      const parsed = JSON.parse(raw) as
        | { name: string; culture: string; gender: string }
        | Array<{ name: string; culture: string; gender: string }>
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      return arr.map((v) => ({
        id: v.name,
        name: v.name,
        culture: v.culture,
        gender: v.gender,
        source: 'local' as const,
      }))
    } catch (err) {
      console.warn('[tts] listVoices failed:', err)
      return []
    }
  }
  if (isMac) {
    try {
      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        const proc = spawn('say', ['-v', '?'])
        let out = ''
        proc.stdout.on('data', (d) => (out += d.toString()))
        proc.on('error', reject)
        proc.on('close', () => resolve({ stdout: out }))
      })
      return stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const m = line.match(/^(.+?)\s+([a-z]{2}[_-][A-Z]{2})/)
          const name = m ? m[1].trim() : line.split('  ')[0].trim()
          return {
            id: name,
            name,
            culture: m ? m[2].replace('_', '-') : 'en-US',
            gender: 'Neutral',
            source: 'local' as const,
          }
        })
    } catch {
      return []
    }
  }
  return []
}

export async function synthesize(req: TtsRequest): Promise<TtsResult> {
  const out =
    req.outputPath ?? join(temp(), `tts-${Date.now()}-${Math.floor(Math.random() * 1e6)}.wav`)

  if (isWin) {
    try {
      const scriptPath = join(temp(), 'synth.ps1')
      writeFileSync(scriptPath, SYNTH_SCRIPT, 'utf8')
      const textPath = join(temp(), `text-${Date.now()}.txt`)
      writeFileSync(textPath, req.text, 'utf8')
      const { code, stderr } = await ps([
        '-File',
        scriptPath,
        '-TextFile',
        textPath,
        '-Out',
        out,
        '-VoiceName',
        req.voiceId,
        '-Rate',
        String(Math.round(req.rate)),
        '-Volume',
        String(Math.round(req.volume)),
        '-Pitch',
        String(Math.round(req.pitch)),
      ])
      if (code !== 0 || !existsSync(out)) {
        return { ok: false, error: stderr.trim() || 'Falló la síntesis de voz (SAPI).' }
      }
      return { ok: true, outputPath: out }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  if (isMac) {
    try {
      const aiff = out.replace(/\.wav$/i, '.aiff')
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('say', ['-v', req.voiceId || 'Alex', '-o', aiff, req.text])
        proc.on('error', reject)
        proc.on('close', (c) => (c === 0 ? resolve() : reject(new Error('say failed'))))
      })
      return { ok: true, outputPath: aiff }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return { ok: false, error: 'La síntesis de voz local solo está disponible en Windows/macOS.' }
}
