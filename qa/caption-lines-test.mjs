// Verify caption layout produces a CONSISTENT line count (<= 2 lines), instead of
// the old fixed-6-word chunks that auto-wrapped to a random 1, 2 or 3 lines.
// Transpiles the real electron/main/captions.ts with esbuild and tests it directly.
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'kz-cap-'))
const out = join(dir, 'captions.mjs')
execSync(`npx esbuild electron/main/captions.ts --format=esm --outfile="${out}"`, { stdio: 'pipe' })
const { buildCaptionChunks } = await import(pathToFileURL(out).href)

const TEXT =
  'Hola a todos y bienvenidos a este video donde vamos a explicar paso a paso ' +
  'como crear contenido viral de manera sencilla rapida y completamente automatizada ' +
  'sin necesidad de conocimientos tecnicos avanzados ni equipos costosos de produccion.'

const W = 1080
let allOk = true
for (const fontSize of [48, 70, 100]) {
  const caps = buildCaptionChunks(TEXT, 30, fontSize, W)
  const lineCounts = caps.map((c) => c.text.split('\n').length)
  const dist = lineCounts.reduce((m, n) => ((m[n] = (m[n] || 0) + 1), m), {})
  const maxLines = Math.max(...lineCounts)
  const maxLineLen = Math.max(...caps.flatMap((c) => c.text.split('\n').map((l) => l.length)))
  // Time slots must be contiguous and ascending.
  const ordered = caps.every((c, i) => c.end > c.start && (i === 0 || c.start >= caps[i - 1].end - 1e-6))
  const ok = maxLines <= 2 && ordered
  allOk = allOk && ok
  console.log(
    `fontSize=${String(fontSize).padStart(3)} | captions=${String(caps.length).padStart(2)} | ` +
      `lineCounts ${JSON.stringify(dist)} | maxLines=${maxLines} | maxLineLen=${maxLineLen} | ${ok ? 'OK' : 'FAIL'}`,
  )
}

// Edge cases
const single = buildCaptionChunks('Hola', 5, 70, W)
const empty = buildCaptionChunks('   ', 5, 70, W)
const edgeOk = single.length === 1 && single[0].text === 'Hola' && empty.length === 0
console.log(`edge cases (single word / empty): ${edgeOk ? 'OK' : 'FAIL'}`)

console.log('')
console.log(allOk && edgeOk
  ? 'RESULT: PASS — captions are a consistent 1–2 lines (never 3).'
  : 'RESULT: FAIL')
process.exit(allOk && edgeOk ? 0 : 1)
