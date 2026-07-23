// Confirm an explicit line break (ASS \N, produced from the caption layout's '\n'
// via escapeAssText) actually renders as a SECOND line in the burned video — i.e.
// a 2-line caption is ~2x the height of a 1-line caption (not literal "\N" text).
const { spawnSync } = require('node:child_process')
const { writeFileSync, mkdtempSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const FF = require('ffmpeg-static')
const W = 1080, H = 1920, M = Math.round(W * 0.06)

const assFor = (textWithBreaks) => `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,80,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,${M},${M},115,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,${textWithBreaks}
`
const esc = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:')

function heightOf(text) {
  const dir = mkdtempSync(join(tmpdir(), 'kz-cr-'))
  const ap = join(dir, 's.ass'); writeFileSync(ap, assFor(text), 'utf8')
  const r = spawnSync(FF, ['-y','-f','lavfi','-i',`color=c=black:s=${W}x${H}:d=1:r=5`,
    '-vf',`ass='${esc(ap)}',cropdetect=limit=24:round=2:skip=0:reset=1`,'-frames:v','5','-f','null','-'],
    { encoding: 'utf8' })
  const m = [...((r.stderr||'')+(r.stdout||'')).matchAll(/crop=(-?\d+):(\d+):(-?\d+):(\d+)/g)].pop()
  return m ? +m[2] : null
}

const one = heightOf('Hola mundo')                                  // 1 line
const two = heightOf('Hola mundo esto es\\Nuna linea mas')          // 2 lines (explicit \N)
const three = heightOf('Hola mundo esto es\\Nuna linea mas\\Ny otra') // 3 lines
console.log(`1-line caption height: ${one}px`)
console.log(`2-line caption height: ${two}px`)
console.log(`3-line caption height: ${three}px`)
// A real line break makes each extra line add ~one line-height. So heights must be
// strictly increasing, and the 2-line block must sit clearly between 1 and 3 lines.
const ok =
  one && two && three &&
  two > one * 1.6 &&   // the \N created a genuine second line
  three > two * 1.3 && // a 2nd \N adds a third line
  two < three          // 2-line caption is shorter than the 3-line one
console.log('')
console.log(ok
  ? 'RESULT: PASS — explicit \\N renders as real, countable lines (1 < 2 < 3).'
  : 'RESULT: FAIL')
process.exit(ok ? 0 : 1)
