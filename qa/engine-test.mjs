// End-to-end test of the FFmpeg media engine.
// Faithfully replicates the pipeline logic from electron/main/ffmpeg.ts and runs
// it against real generated clips, validating real MP4/WAV/thumbnail/probe output.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

const FFMPEG = ffmpegStatic
const FFPROBE = ffprobeStatic.path
const DIR = mkdtempSync(join(tmpdir(), 'kaizen-qa-'))
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS  ${m}`) } else { fail++; console.log(`  FAIL  ${m}`) } }

function run(bin, args) {
  return new Promise((res) => {
    const p = spawn(bin, args)
    let stdout = '', stderr = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.stderr.on('data', (d) => (stderr += d))
    p.on('close', (code) => res({ code, stdout, stderr }))
    p.on('error', (e) => res({ code: -1, stdout, stderr: String(e) }))
  })
}

// ---- replicated helpers from ffmpeg.ts ----
function hexToAss(hex, alphaHex = '00') {
  const h = hex.replace('#', '').padEnd(6, '0')
  return `&H${alphaHex}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase()
}
function assTime(sec) {
  const cs = Math.round((sec - Math.floor(sec)) * 100)
  const s = Math.floor(sec) % 60, m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`
}
function escapeAssText(t) { return t.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\r?\n/g, '\\N') }
function buildCaptionChunks(text, duration) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length || duration <= 0) return []
  const chunks = []
  for (let i = 0; i < words.length; i += 6) chunks.push(words.slice(i, i + 6).join(' '))
  const slot = duration / chunks.length
  return chunks.map((t, i) => ({ start: i * slot, end: (i + 1) * slot, text: t }))
}
function buildAss(text, cfg, width, height, duration) {
  const alignment = cfg.position === 'top' ? 8 : cfg.position === 'middle' ? 5 : 2
  const primary = hexToAss(cfg.color)
  const outline = cfg.stroke ? hexToAss(cfg.strokeColor) : hexToAss('#000000')
  const back = cfg.backgroundEnabled ? hexToAss(cfg.backgroundColor, '40') : hexToAss('#000000', '80')
  const borderStyle = cfg.backgroundEnabled ? 3 : 1
  const outlineWidth = cfg.stroke ? cfg.strokeWidth : cfg.backgroundEnabled ? 0 : 2
  const marginV = Math.round(height * 0.06)
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${cfg.fontFamily || 'Arial'},${cfg.fontSize},${primary},&H000000FF,${outline},${back},-1,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},1,${alignment},60,60,${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
  const lines = buildCaptionChunks(text, duration)
    .map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${escapeAssText(c.text)}`).join('\n')
  return header + lines + '\n'
}
function escapeFilterPath(p) { return p.replace(/\\/g, '/').replace(/:/g, '\\:') }

function buildVideoArgs({ clips, narrationPath, assPath, W, H, normalize, out }) {
  const args = ['-y']
  clips.forEach((c) => args.push('-i', c))
  if (narrationPath) args.push('-i', narrationPath)
  const filters = []
  clips.forEach((_, i) => filters.push(
    `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v${i}]`))
  const vlabels = clips.map((_, i) => `[v${i}]`).join('')
  filters.push(`${vlabels}concat=n=${clips.length}:v=1:a=0[vcat]`)
  let videoLabel = '[vcat]'
  if (assPath) { filters.push(`[vcat]ass='${escapeFilterPath(assPath)}'[vsub]`); videoLabel = '[vsub]' }
  const aIdx = clips.length
  let audioLabel = null
  if (narrationPath) {
    if (normalize) { filters.push(`[${aIdx}:a]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`); audioLabel = '[aout]' }
    else audioLabel = `${aIdx}:a`
  }
  args.push('-filter_complex', filters.join(';'), '-map', videoLabel)
  if (audioLabel) args.push('-map', audioLabel)
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    ...(audioLabel ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : ['-an']), '-movflags', '+faststart', out)
  return args
}

async function probeJson(file) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file])
  return JSON.parse(stdout || '{}')
}
async function probeStreams(file) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,sample_rate', '-of', 'json', file])
  return JSON.parse(stdout || '{}').streams || []
}

async function main() {
  console.log(`FFMPEG = ${FFMPEG}`)
  console.log(`FFPROBE = ${FFPROBE}`)
  console.log(`workdir = ${DIR}\n`)
  ok(existsSync(FFMPEG), 'ffmpeg binary exists')
  ok(existsSync(FFPROBE), 'ffprobe binary exists')

  // 1. Generate two clips of DIFFERENT resolutions, each with audio.
  const clip1 = join(DIR, 'clip1.mp4'), clip2 = join(DIR, 'clip2.mp4')
  const g1 = await run(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=30:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', clip1])
  const g2 = await run(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=660:duration=3', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', clip2])
  ok(g1.code === 0 && existsSync(clip1), 'generated clip1 (640x480, 2s)')
  ok(g2.code === 0 && existsSync(clip2), 'generated clip2 (1280x720, 3s)')

  // 2. Narration WAV.
  const narration = join(DIR, 'narration.wav')
  const gn = await run(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=4', narration])
  ok(gn.code === 0 && existsSync(narration), 'generated narration WAV (4s)')

  // 3. probe() replica — duration + dimensions + thumbnail.
  const pj = await probeJson(clip2)
  ok(pj.streams?.[0]?.width === 1280 && pj.streams?.[0]?.height === 720, `probe reads clip2 dims (got ${pj.streams?.[0]?.width}x${pj.streams?.[0]?.height})`)
  ok(parseFloat(pj.format?.duration) > 2.5, `probe reads duration (got ${pj.format?.duration})`)
  const thumb = join(DIR, 'thumb.jpg')
  const gt = await run(FFMPEG, ['-y', '-ss', '0.5', '-i', clip1, '-frames:v', '1', '-vf', 'scale=360:-1', '-q:v', '4', thumb])
  ok(gt.code === 0 && existsSync(thumb) && statSync(thumb).size > 0, 'thumbnail generated (jpg)')

  // 4. ASS subtitle generation.
  const subCfg = { position: 'bottom', fontSize: 70, fontFamily: 'Arial', color: '#ffff00', backgroundColor: '#000000', backgroundEnabled: false, stroke: true, strokeColor: '#000000', strokeWidth: 4 }
  const ass = buildAss('Esto es una prueba de subtitulos quemados en el video de salida', subCfg, 1080, 1920, 7)
  const assPath = join(DIR, 'subs.ass')
  writeFileSync(assPath, ass, 'utf8')
  ok(ass.includes('[Events]') && /Dialogue:/.test(ass), 'ASS has [Events] + Dialogue lines')
  ok(ass.includes('PlayResX: 1080') && ass.includes('PlayResY: 1920'), 'ASS PlayRes matches vertical canvas')
  ok(/&H0000FFFF/.test(ass), 'ASS primary colour = yellow (BGR order correct)')

  // 5. FULL VIDEO RENDER — vertical 1080x1920, concat + subtitles + narration + loudnorm.
  const outMp4 = join(DIR, 'output.mp4')
  const vArgs = buildVideoArgs({ clips: [clip1, clip2], narrationPath: narration, assPath, W: 1080, H: 1920, normalize: true, out: outMp4 })
  let sawProgress = false
  const rr = await new Promise((res) => {
    const p = spawn(FFMPEG, vArgs)
    let stderr = ''
    p.stderr.on('data', (d) => { stderr += d; if (/time=\d{2}:\d{2}:\d{2}\.\d{2}/.test(String(d))) sawProgress = true })
    p.on('close', (code) => res({ code, stderr }))
  })
  if (rr.code !== 0) console.log('  ffmpeg stderr tail:\n' + rr.stderr.split('\n').slice(-8).join('\n'))
  ok(rr.code === 0 && existsSync(outMp4), 'MP4 render pipeline completed (concat+scale+pad+ass+loudnorm+aac)')
  ok(sawProgress, 'progress (time=) parseable from stderr')
  const ms = await probeStreams(outMp4)
  const vS = ms.find((s) => s.codec_type === 'video'), aS = ms.find((s) => s.codec_type === 'audio')
  const od = await probeJson(outMp4)
  ok(vS?.codec_name === 'h264', `output video codec h264 (got ${vS?.codec_name})`)
  ok(od.streams?.[0]?.width === 1080 && od.streams?.[0]?.height === 1920, `output is 1080x1920 (got ${od.streams?.[0]?.width}x${od.streams?.[0]?.height})`)
  ok(aS?.codec_name === 'aac', `output audio codec aac (got ${aS?.codec_name})`)
  ok(statSync(outMp4).size > 10000, `output MP4 non-trivial size (${statSync(outMp4).size} bytes)`)

  // 6. HORIZONTAL render (1920x1080), no narration → silent (-an).
  const outH = join(DIR, 'output_h.mp4')
  const hArgs = buildVideoArgs({ clips: [clip1], narrationPath: null, assPath: null, W: 1920, H: 1080, normalize: false, out: outH })
  const rh = await run(FFMPEG, hArgs)
  const ohd = await probeJson(outH)
  ok(rh.code === 0 && ohd.streams?.[0]?.width === 1920 && ohd.streams?.[0]?.height === 1080, `horizontal render 1920x1080 (got ${ohd.streams?.[0]?.width}x${ohd.streams?.[0]?.height})`)

  // 7. WAV export path — narration → pcm_s16le @ 48000 with loudnorm.
  const outWav = join(DIR, 'output.wav')
  const wArgs = ['-y', '-i', narration, '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'pcm_s16le', '-ar', '48000', outWav]
  const rw = await run(FFMPEG, wArgs)
  const ws = await probeStreams(outWav)
  ok(rw.code === 0 && existsSync(outWav), 'WAV export completed')
  ok(ws[0]?.codec_name === 'pcm_s16le' && ws[0]?.sample_rate === '48000', `WAV is pcm_s16le @ 48000 (got ${ws[0]?.codec_name} @ ${ws[0]?.sample_rate})`)

  console.log(`\n==== FFMPEG ENGINE: ${pass} passed, ${fail} failed ====`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('FATAL', e); process.exit(2) })
