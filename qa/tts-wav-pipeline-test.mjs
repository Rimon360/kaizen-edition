// Run the REAL synth + the WAV-export ffmpeg encode for a SAPI-routed voice and a
// WinRT-routed voice, and report the resulting sample rate + high-freq energy.
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const PROBE = 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe'
const FF = 'node_modules/ffmpeg-static/ffmpeg.exe'
const m = await import(pathToFileURL(process.env.TTS_BUNDLE).href)

async function trial(label, voiceId) {
  const res = await m.synthesize({ text: 'Testing one two three four five, voice quality check.', voiceId, rate: 0, pitch: 0, volume: 100 })
  if (!res.ok) { console.log(`${label}: synth FAILED ${res.error}`); return }
  const srcRate = spawnSync(PROBE, ['-v','error','-select_streams','a:0','-show_entries','stream=sample_rate','-of','csv=p=0', res.outputPath]).stdout.toString().trim()
  // Mimic renderWav: pcm_s16le, native rate preserved (no -ar)
  const wav = res.outputPath.replace(/\.wav$/, '.export.wav')
  spawnSync(FF, ['-y','-i',res.outputPath,'-vn','-c:a','pcm_s16le', wav])
  const outRate = spawnSync(PROBE, ['-v','error','-select_streams','a:0','-show_entries','stream=sample_rate','-of','csv=p=0', wav]).stdout.toString().trim()
  const hf = (spawnSync(FF, ['-hide_banner','-nostats','-i',wav,'-af','highpass=f=11000,volumedetect','-f','null','-']).stderr.toString().split('\n').find((l)=>l.includes('mean_volume'))||'').trim()
  console.log(`${label}: voice="${voiceId}" | synth=${srcRate}Hz -> exported WAV=${outRate}Hz | ${hf}`)
}

await trial('SAPI voice ', 'Microsoft David')
await trial('WinRT voice', 'Microsoft Mark')
