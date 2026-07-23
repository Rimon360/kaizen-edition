// Verify burned subtitles WRAP (WrapStyle 0) instead of running off-screen
// (WrapStyle 2). Renders a long caption on a black 1080x1920 frame and uses
// ffmpeg cropdetect to measure the text's bounding box for each WrapStyle.
const { spawnSync } = require('node:child_process')
const { writeFileSync, mkdtempSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const FF = require('ffmpeg-static')
const W = 1080
const H = 1920
const MARGIN = Math.round(W * 0.06) // matches ffmpeg.ts marginH
const CAPTION =
  'Esto es un ejemplo de subtitulo bastante largo para comprobar el ajuste automatico de linea'

function ass(wrapStyle) {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: ${wrapStyle}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,80,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,${MARGIN},${MARGIN},115,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,${CAPTION}
`
}

function escapeFilterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:')
}

function measure(wrapStyle) {
  const dir = mkdtempSync(join(tmpdir(), 'kz-wrap-'))
  const assPath = join(dir, `s${wrapStyle}.ass`)
  writeFileSync(assPath, ass(wrapStyle), 'utf8')
  const r = spawnSync(
    FF,
    [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=black:s=${W}x${H}:d=1:r=5`,
      // skip=0 so the (few) frames are actually analyzed; cropdetect defaults to skip=2.
      '-vf', `ass='${escapeFilterPath(assPath)}',cropdetect=limit=24:round=2:skip=0:reset=1`,
      '-frames:v', '5',
      '-f', 'null', '-',
    ],
    { encoding: 'utf8' },
  )
  const out = (r.stderr || '') + (r.stdout || '')
  // cropdetect can report a degenerate/negative width when content runs across the
  // full frame (the unwrapped overflow case), so allow a leading minus.
  const matches = [...out.matchAll(/crop=(-?\d+):(\d+):(-?\d+):(\d+)/g)]
  const last = matches[matches.length - 1]
  if (!last) return { wrapStyle, error: 'no cropdetect output', tail: out.split('\n').slice(-6).join('\n') }
  // overflow = content spanned the full width (negative/degenerate crop width).
  const w = +last[1]
  return { wrapStyle, w, h: +last[2], x: +last[3], y: +last[4], overflow: w <= 0 || w >= W - 8 }
}

const wrap2 = measure(2) // old behaviour (no wrap)
const wrap0 = measure(0) // new behaviour (smart wrap)
console.log('WrapStyle 2 (old, no wrap):', JSON.stringify(wrap2))
console.log('WrapStyle 0 (new, wrap)   :', JSON.stringify(wrap0))

const maxTextWidth = W - 2 * MARGIN
const oneLineMax = 140 // a single 80px line is < ~140px tall
const ok =
  wrap0.w > 0 &&
  wrap0.w <= maxTextWidth + 8 && // wrapped text stays within the side margins
  !wrap0.overflow && // wrapped text does NOT run across the full width
  wrap0.h > oneLineMax && // wrapped text spans multiple lines
  wrap0.h > wrap2.h && // taller than the unwrapped single line
  wrap2.overflow // the old single line ran across the full width (off-screen)

console.log('')
console.log(`maxTextWidth(within margins)=${maxTextWidth}`)
console.log(
  ok
    ? 'RESULT: PASS — captions now wrap within the frame instead of running off-screen.'
    : 'RESULT: FAIL — wrapping not confirmed.',
)
process.exit(ok ? 0 : 1)
