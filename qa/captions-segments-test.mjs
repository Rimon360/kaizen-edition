// Verify captionsFromSegments(): real transcription segments become <=2-line
// captions that keep their timestamps (synced to the audio), splitting long
// segments and dividing the segment's time range across sub-captions by word count.
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'kz-seg-'))
const out = join(dir, 'captions.mjs')
execSync(`npx esbuild electron/main/captions.ts --format=esm --outfile="${out}"`, { stdio: 'pipe' })
const { captionsFromSegments } = await import(pathToFileURL(out).href)

// Realistic Whisper-style segments (sentence-ish, with timestamps).
const segments = [
  { start: 0, end: 2.4, text: 'Hola a todos y bienvenidos a este video.' },
  {
    start: 2.96,
    end: 8.2,
    text: 'Donde vamos a explicar como crear contenido viral de manera sencilla rapida y completamente automatica.',
  },
  { start: 8.5, end: 10, text: 'Suscribete para mas.' },
]

const caps = captionsFromSegments(segments, 70, 1080, 2)
console.log(`captions: ${caps.length}`)
for (const c of caps) {
  console.log(`  [${c.start.toFixed(2)} -> ${c.end.toFixed(2)}] (${c.text.split('\n').length} line) ${JSON.stringify(c.text)}`)
}

const segStart = segments[0].start
const segEnd = segments[segments.length - 1].end
const allTwoLines = caps.every((c) => c.text.split('\n').length <= 2)
const allForward = caps.every((c) => c.end > c.start)
const ascending = caps.every((c, i) => i === 0 || c.start >= caps[i - 1].start - 1e-6)
const withinRange = caps.every((c) => c.start >= segStart - 1e-6 && c.end <= segEnd + 1e-6)
// Long middle segment must have been split into multiple sub-captions.
const splitLong = caps.filter((c) => c.start >= 2.9 && c.end <= 8.3).length >= 2

const ok = caps.length >= 3 && allTwoLines && allForward && ascending && withinRange && splitLong
console.log('')
console.log(
  `<=2 lines:${allTwoLines} forward:${allForward} ascending:${ascending} inRange:${withinRange} splitLong:${splitLong}`,
)
console.log(ok
  ? 'RESULT: PASS — segments become synced, <=2-line captions.'
  : 'RESULT: FAIL')
process.exit(ok ? 0 : 1)
