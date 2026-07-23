// Verifies the duration fix (#3): output length = max(video, narration); the
// shorter stream is padded (video holds last frame, audio gets silence) rather
// than truncated by -shortest. Replicates the NEW renderVideo logic from ffmpeg.ts.
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

const FFMPEG = ffmpegStatic, FFPROBE = ffprobeStatic.path
const DIR = mkdtempSync(join(tmpdir(), 'kaizen-dur-'))
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS  ${m}`) } else { fail++; console.log(`  FAIL  ${m}`) } }

function run(bin, args) {
  return new Promise((res) => { const p = spawn(bin, args); let e = ''; p.stderr.on('data', d => e += d); p.on('close', code => res({ code, e })) })
}
async function dur(file) {
  const { stdout } = await new Promise((res) => { const p = spawn(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]); let o = ''; p.stdout.on('data', d => o += d); p.on('close', () => res({ stdout: o })) })
  return parseFloat(stdout.trim()) || 0
}

// NEW pipeline (mirrors electron/main/ffmpeg.ts renderVideo)
function buildVideoArgs({ clips, narrationPath, W, H, videoTotal, narrationDur, normalize, out }) {
  const target = Math.max(videoTotal, narrationDur, 0.1)
  const args = ['-y']
  clips.forEach(c => args.push('-i', c))
  if (narrationPath) args.push('-i', narrationPath)
  const filters = []
  clips.forEach((_, i) => filters.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v${i}]`))
  filters.push(`${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[vcat]`)
  let vLabel = '[vcat]'
  if (narrationPath && target - videoTotal > 0.05) { filters.push(`[vcat]tpad=stop_mode=clone:stop_duration=${(target - videoTotal).toFixed(3)}[vpad]`); vLabel = '[vpad]' }
  let aLabel = null
  if (narrationPath) { const norm = normalize ? ',loudnorm=I=-16:TP=-1.5:LRA=11' : ''; filters.push(`[${clips.length}:a]apad${norm}[aout]`); aLabel = '[aout]' }
  args.push('-filter_complex', filters.join(';'), '-map', vLabel)
  if (aLabel) args.push('-map', aLabel)
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    ...(aLabel ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']), '-t', target.toFixed(3), '-movflags', '+faststart', out)
  return { args, target }
}

async function main() {
  // 3s video clip, 6s narration (LONGER), 1.5s narration (SHORTER)
  const clip = join(DIR, 'c.mp4')
  await run(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=30:duration=3', '-pix_fmt', 'yuv420p', clip])
  const nLong = join(DIR, 'long.wav'), nShort = join(DIR, 'short.wav')
  await run(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=6', nLong])
  await run(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=1.5', nShort])
  const videoTotal = await dur(clip)
  console.log(`video clip = ${videoTotal.toFixed(2)}s\n`)

  // Case A: narration LONGER (6s) than video (3s) → expect ~6s, video NOT truncated to 3s
  const longDur = await dur(nLong)
  const outA = join(DIR, 'a.mp4')
  const A = buildVideoArgs({ clips: [clip], narrationPath: nLong, W: 1080, H: 1920, videoTotal, narrationDur: longDur, normalize: true, out: outA })
  const rA = await run(FFMPEG, A.args)
  const dA = await dur(outA)
  if (rA.code !== 0) console.log(rA.e.split('\n').slice(-6).join('\n'))
  ok(rA.code === 0 && existsSync(outA), 'narration-longer render completed')
  ok(Math.abs(dA - 6) < 0.4, `narration-longer: output ~6s (video held, not cut to 3s) — got ${dA.toFixed(2)}s`)

  // Case B: narration SHORTER (1.5s) than video (3s) → expect ~3s, video NOT cut to 1.5s
  const shortDur = await dur(nShort)
  const outB = join(DIR, 'b.mp4')
  const B = buildVideoArgs({ clips: [clip], narrationPath: nShort, W: 1080, H: 1920, videoTotal, narrationDur: shortDur, normalize: false, out: outB })
  const rB = await run(FFMPEG, B.args)
  const dB = await dur(outB)
  if (rB.code !== 0) console.log(rB.e.split('\n').slice(-6).join('\n'))
  ok(rB.code === 0 && existsSync(outB), 'narration-shorter render completed')
  ok(Math.abs(dB - 3) < 0.4, `narration-shorter: output ~3s (audio padded, video not cut to 1.5s) — got ${dB.toFixed(2)}s`)

  console.log(`\n==== DURATION FIX: ${pass} passed, ${fail} failed ====`)
  process.exit(fail ? 1 : 0)
}
main().catch(e => { console.error('FATAL', e); process.exit(2) })
