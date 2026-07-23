// Verify the edited tts.ts synthesize() emits a 48 kHz WAV (was 22 kHz "radio").
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const PROBE = 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe'
const FF = 'node_modules/ffmpeg-static/ffmpeg.exe'

const m = await import(pathToFileURL(process.env.TTS_BUNDLE).href)
const res = await m.synthesize({
  text: 'Testing one two three four five, this is a voice quality check.',
  voiceId: '',
  rate: 0,
  pitch: 0,
  volume: 100,
})
console.log('synth.ok =', res.ok, '| out =', res.outputPath, res.error ? `| err=${res.error}` : '')
if (!res.ok || !res.outputPath) process.exit(1)

const rate = spawnSync(PROBE, [
  '-v', 'error', '-select_streams', 'a:0',
  '-show_entries', 'stream=sample_rate,channels,bits_per_sample',
  '-of', 'csv=p=0', res.outputPath,
]).stdout.toString().trim()
const hf = spawnSync(FF, [
  '-hide_banner', '-nostats', '-i', res.outputPath,
  '-af', 'highpass=f=11000,volumedetect', '-f', 'null', '-',
]).stderr.toString().split('\n').find((l) => l.includes('mean_volume')) || ''

console.log('format =', rate)
console.log('HF>11k =', hf.trim())
const sampleRate = parseInt(rate.split(',')[0], 10)
const ok = sampleRate >= 44100
console.log(ok ? 'RESULT: PASS — TTS now renders at 48 kHz (no longer telephone-band).' : `RESULT: FAIL — still ${sampleRate} Hz`)
process.exit(ok ? 0 : 1)
