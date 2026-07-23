import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir, totalmem, cpus } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import type {
  ProbeResult,
  RenderProgress,
  RenderRequest,
  RenderResult,
  Segment,
  SubtitleConfig,
} from '../shared/types'
import { buildCaptionChunks, captionsFromSegments } from './captions'

// ---------------------------------------------------------------------------
// Binary resolution (dev vs packaged asar)
// ---------------------------------------------------------------------------

function resolveBinary(p: string): string {
  if (!app.isPackaged) return p
  // Packaged binaries are extracted next to the asar via electron-builder asarUnpack.
  return p.replace('app.asar', 'app.asar.unpacked')
}

export const FFMPEG_PATH = resolveBinary((ffmpegStatic as unknown as string) ?? 'ffmpeg')
const FFPROBE_PATH = resolveBinary(
  (ffprobeStatic as unknown as { path: string }).path ?? 'ffprobe',
)

// ---------------------------------------------------------------------------
// ffprobe helpers
// ---------------------------------------------------------------------------

function run(bin: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const ps = spawn(bin, args)
    let stdout = ''
    let stderr = ''
    ps.stdout.on('data', (d) => (stdout += d.toString()))
    ps.stderr.on('data', (d) => (stderr += d.toString()))
    ps.on('error', reject)
    ps.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }))
  })
}

export async function probe(filePath: string): Promise<ProbeResult> {
  try {
    const { stdout } = await run(FFPROBE_PATH, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height:format=duration',
      '-of',
      'json',
      filePath,
    ])
    const parsed = JSON.parse(stdout || '{}') as {
      streams?: Array<{ width?: number; height?: number }>
      format?: { duration?: string }
    }
    const stream = parsed.streams?.[0]
    const duration = parsed.format?.duration ? parseFloat(parsed.format.duration) : null
    const thumbnail = await generateThumbnail(filePath).catch(() => null)
    return {
      duration: duration && !Number.isNaN(duration) ? duration : null,
      width: stream?.width ?? null,
      height: stream?.height ?? null,
      thumbnail,
    }
  } catch (err) {
    return {
      duration: null,
      width: null,
      height: null,
      thumbnail: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

let tempDir: string | null = null
function getTempDir(): string {
  if (tempDir && existsSync(tempDir)) return tempDir
  tempDir = mkdtempSync(join(tmpdir(), 'kaizen-'))
  return tempDir
}

async function generateThumbnail(filePath: string): Promise<string> {
  const out = join(getTempDir(), `thumb-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`)
  await run(FFMPEG_PATH, [
    '-y',
    '-ss',
    '0.5',
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-vf',
    'scale=360:-1',
    '-q:v',
    '4',
    out,
  ])
  return out
}

async function probeDuration(filePath: string): Promise<number> {
  const { stdout } = await run(FFPROBE_PATH, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ])
  const v = parseFloat(stdout.trim())
  return Number.isNaN(v) ? 0 : v
}

// ---------------------------------------------------------------------------
// Subtitle (.ass) generation
// ---------------------------------------------------------------------------

/** #RRGGBB → ASS &HAABBGGRR (alpha 00 = opaque). */
function hexToAss(hex: string, alphaHex = '00'): string {
  const h = hex.replace('#', '').padEnd(6, '0')
  const r = h.slice(0, 2)
  const g = h.slice(2, 4)
  const b = h.slice(4, 6)
  return `&H${alphaHex}${b}${g}${r}`.toUpperCase()
}

function assTime(sec: number): string {
  const cs = Math.round((sec - Math.floor(sec)) * 100)
  const s = Math.floor(sec) % 60
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\r?\n/g, '\\N')
}

/** #RRGGBB → ASS inline override color `&HBBGGRR&` (for \1c/\3c tags — distinct from
 *  the 8-digit &HAABBGGRR style-field form hexToAss() returns). */
function assColor(hex: string): string {
  const h = hex.replace('#', '').padEnd(6, '0')
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase()
}

/** A clockwise rounded-rectangle path (origin 0,0, size w×h) for an ASS \p drawing.
 *  `0.5523` is the cubic-bezier kappa for a quarter-circle. */
function roundedRectPath(w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  const k = r * 0.5523
  const n = (x: number) => Math.round(x)
  return [
    `m ${n(r)} 0`,
    `l ${n(w - r)} 0`,
    `b ${n(w - r + k)} 0 ${n(w)} ${n(r - k)} ${n(w)} ${n(r)}`,
    `l ${n(w)} ${n(h - r)}`,
    `b ${n(w)} ${n(h - r + k)} ${n(w - r + k)} ${n(h)} ${n(w - r)} ${n(h)}`,
    `l ${n(r)} ${n(h)}`,
    `b ${n(r - k)} ${n(h)} 0 ${n(h - r + k)} 0 ${n(h - r)}`,
    `l 0 ${n(r)}`,
    `b 0 ${n(r - k)} ${n(r - k)} 0 ${n(r)} 0`,
  ].join(' ')
}

// Per-character advance as a fraction of font size (Arial-ish, bold). We lay the
// karaoke line out OURSELVES (each word \pos'd), so the pill and its word share
// coordinates and stay aligned regardless of estimate accuracy — the estimate only
// affects inter-word spacing, which this per-char table keeps looking natural.
const KARAOKE_WIDE = new Set(['m', 'w', 'M', 'W'])
const KARAOKE_NARROW = new Set(['i', 'j', 'l', 't', 'f', 'r', 'I', '.', ',', "'", ';', ':', '!', '|'])
function charAdvance(c: string): number {
  if (c === ' ') return 0.3
  if (KARAOKE_WIDE.has(c)) return 0.86
  if (KARAOKE_NARROW.has(c)) return 0.3
  if (/[A-Z]/.test(c)) return 0.7
  if (/[0-9]/.test(c)) return 0.56
  return 0.53
}
function measureWord(word: string, fontSize: number): number {
  let w = 0
  for (const c of word) w += charAdvance(c) * fontSize
  return Math.max(fontSize * 0.4, w)
}

interface KaraokeWord {
  word: string
  start: number
  end: number
}

/** Time each word within a phrase, anchored to the phrase START at a natural speaking
 *  pace. Crucially we NEVER stretch the highlight past that natural pace — Whisper
 *  often pads a segment's `end` with trailing silence (especially the LAST segment,
 *  which falls back to the whole audio length), and stretching to fill it makes the
 *  final words lag badly. We only COMPRESS when the phrase is tighter than natural. */
function spreadWords(text: string, start: number, end: number): KaraokeWord[] {
  const words = text.split(/\s+/).map((w) => w.trim()).filter(Boolean)
  if (!words.length) return []
  // Estimated spoken seconds per word: a floor for tiny words, gentle growth with
  // length, capped so one long word can't hog time.
  const natural = words.map((w) => Math.min(0.7, Math.max(0.18, 0.13 + 0.05 * w.length)))
  const naturalTotal = natural.reduce((a, b) => a + b, 0)
  const span = Math.max(0, end - start)
  // scale ≤ 1: fill a tight phrase (compress), but never exceed natural pace.
  const scale = naturalTotal > 0 && span > 0 ? Math.min(1, span / naturalTotal) : 1
  const out: KaraokeWord[] = []
  let t = start
  for (let i = 0; i < words.length; i++) {
    const dur = natural[i] * scale
    out.push({ word: words[i], start: t, end: t + dur })
    t += dur
  }
  return out
}

/** Per-word timings for a phrase: use Whisper's REAL word timestamps when present
 *  (exact sync), else the estimate. Either way, chain each word's highlight to end
 *  when the next begins — so the pill advances at the real word-start, with no gaps. */
function phraseWords(phrase: {
  start: number
  end: number
  text: string
  words?: { start: number; end: number; text: string }[]
}): KaraokeWord[] {
  const ws: KaraokeWord[] =
    phrase.words && phrase.words.length
      ? phrase.words.map((w) => ({ word: w.text, start: w.start, end: w.end }))
      : spreadWords(phrase.text, phrase.start, phrase.end)
  for (let i = 0; i < ws.length - 1; i++) {
    if (ws[i + 1].start > ws[i].start) ws[i].end = ws[i + 1].start
  }
  return ws
}

function buildAss(
  text: string,
  cfg: SubtitleConfig,
  width: number,
  height: number,
  duration: number,
  segments?: Segment[] | null,
): string {
  // 5 vertical positions. ASS alignment anchors top(8)/center(5)/bottom(2); the
  // upper/lower "middle" positions reuse the top/bottom anchor pushed ~28% inward
  // via MarginV, landing roughly a quarter from each edge.
  const edge = Math.round(height * 0.06)
  const quarter = Math.round(height * 0.28)
  let alignment: number
  let marginV: number
  switch (cfg.position) {
    case 'top':
      alignment = 8
      marginV = edge
      break
    case 'upperMiddle':
      alignment = 8
      marginV = quarter
      break
    case 'middle':
      alignment = 5
      marginV = 0
      break
    case 'lowerMiddle':
      alignment = 2
      marginV = quarter
      break
    default: // 'bottom'
      alignment = 2
      marginV = edge
      break
  }
  // Karaoke draws its OWN rounded pill per word, so the line style must use outline
  // mode (never the opaque box) — the pill IS the highlight background.
  const karaoke = cfg.wordHighlightEnabled
  const primary = hexToAss(cfg.color)
  const outline = cfg.stroke ? hexToAss(cfg.strokeColor) : hexToAss('#000000')
  const back = cfg.backgroundEnabled ? hexToAss(cfg.backgroundColor, '40') : hexToAss('#000000', '80')
  const borderStyle = !karaoke && cfg.backgroundEnabled ? 3 : 1
  const outlineWidth = cfg.stroke ? cfg.strokeWidth : !karaoke && cfg.backgroundEnabled ? 0 : 2
  const font = cfg.fontFamily || 'Arial'

  // Wider side margins on the narrower vertical canvas so wrapped lines breathe.
  const marginH = Math.round(width * 0.06)

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${cfg.fontSize},${primary},&H000000FF,${outline},${back},-1,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},1,${alignment},${marginH},${marginH},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

  // Karaoke word highlight: show a phrase line, and put a rounded color pill behind
  // each word as it's spoken. We lay each word out ourselves (\pos), so the pill and
  // its word share coordinates and always stay aligned (the per-char width estimate
  // only affects inter-word spacing). Words are grouped into lines WITHIN each phrase
  // (transcript segment), so a line never mixes words from different time spans, and
  // greedy-wrapped so a line never exceeds the frame width.
  if (karaoke) {
    const fs = cfg.fontSize
    const space = fs * 0.34
    const padX = fs * 0.34
    const padY = fs * 0.22
    const pillH = fs + padY * 2
    const radius = Math.max(0, Math.min(cfg.wordHighlightRadius, pillH / 2))
    const maxLineW = width - marginH * 2
    const lineStep = pillH + fs * 0.1 // vertical gap between stacked lines
    const MAX_LINES = 3 // a block shows up to this many lines at once (1..3)
    const hl = assColor(cfg.wordHighlightColor)
    const glowInline = cfg.glow && cfg.glow > 0 ? `\\blur${Math.round(cfg.glow)}` : ''

    // Each phrase → words with timings → greedy-wrapped into frame-fitting lines →
    // those lines grouped into BLOCKS of up to MAX_LINES shown together. A short
    // phrase is 1 line; a longer one stacks 2–3 lines, like normal captions. Grouping
    // stays within a phrase so a block never mixes words from different time spans.
    const phrases =
      segments && segments.length
        ? segments.map((s) => ({
            start: Number(s.start) || 0,
            end: Number(s.end),
            text: String(s.text || ''),
            words: s.words,
          }))
        : [{ start: 0, end: duration > 0 ? duration : 10, text, words: undefined }]

    // "1 word" style: ONE word on screen at a time, centered, with its pill. Only the
    // active word shows, so the pill simply hugs that single centered word.
    if (cfg.wordHighlightMode === 'word') {
      const cx = Math.round(width / 2)
      let cy: number
      switch (cfg.position) {
        case 'top':
          cy = edge + fs * 0.7
          break
        case 'upperMiddle':
          cy = quarter + fs * 0.7
          break
        case 'middle':
          cy = height / 2
          break
        case 'lowerMiddle':
          cy = height - quarter - fs * 0.7
          break
        default: // 'bottom'
          cy = height - edge - fs * 0.7
          break
      }
      cy = Math.round(cy)
      const events: string[] = []
      for (const p of phrases) {
        for (const w of phraseWords(p)) {
          const start = assTime(w.start)
          const end = assTime(w.end > w.start ? w.end : w.start + 0.1)
          const pw = measureWord(w.word, fs) + padX * 2
          const px = Math.round(cx - pw / 2)
          const py = Math.round(cy - pillH / 2)
          events.push(
            `Dialogue: 0,${start},${end},Default,,0,0,0,,{\\an7\\pos(${px},${py})\\bord0\\shad0\\1c${hl}\\p1}${roundedRectPath(pw, pillH, radius)}{\\p0}`,
          )
          events.push(
            `Dialogue: 1,${start},${end},Default,,0,0,0,,{\\an5\\pos(${cx},${cy})${glowInline}}${escapeAssText(w.word)}`,
          )
        }
      }
      return header + events.join('\n') + '\n'
    }

    type LineWord = KaraokeWord & { w: number }
    const blocks: LineWord[][][] = [] // block → lines → words
    for (const p of phrases) {
      const segLines: LineWord[][] = []
      let cur: LineWord[] = []
      let curW = 0
      for (const kw of phraseWords(p)) {
        const w = measureWord(kw.word, fs)
        const add = cur.length ? space + w : w
        if (cur.length && curW + add > maxLineW) {
          segLines.push(cur)
          cur = []
          curW = 0
        }
        cur.push({ ...kw, w })
        curW += cur.length > 1 ? space + w : w
      }
      if (cur.length) segLines.push(cur)
      for (let i = 0; i < segLines.length; i += MAX_LINES) {
        blocks.push(segLines.slice(i, i + MAX_LINES))
      }
    }

    // y-center of each line in an L-line block, anchored so the block never leaves the
    // frame: top positions grow downward, bottom grow upward, middle centers the stack.
    const lineCenters = (L: number): number[] => {
      const ys: number[] = []
      for (let i = 0; i < L; i++) {
        let y: number
        switch (cfg.position) {
          case 'top':
            y = edge + fs * 0.7 + i * lineStep
            break
          case 'upperMiddle':
            y = quarter + fs * 0.7 + i * lineStep
            break
          case 'middle':
            y = height / 2 + (i - (L - 1) / 2) * lineStep
            break
          case 'lowerMiddle':
            y = height - quarter - fs * 0.7 - (L - 1 - i) * lineStep
            break
          default: // 'bottom'
            y = height - edge - fs * 0.7 - (L - 1 - i) * lineStep
            break
        }
        ys.push(Math.round(y))
      }
      return ys
    }

    const events: string[] = []
    for (const block of blocks) {
      const L = block.length
      const ys = lineCenters(L)
      const blockStart = assTime(block[0][0].start)
      const lastLine = block[L - 1]
      const lastWord = lastLine[lastLine.length - 1]
      const blockEnd = assTime(
        lastWord.end > block[0][0].start ? lastWord.end : block[0][0].start + 0.1,
      )
      block.forEach((line, li) => {
        const y = ys[li]
        const total = line.reduce((a, b) => a + b.w, 0) + space * (line.length - 1)
        let x = (width - total) / 2
        const centers = line.map((wd) => {
          const c = x + wd.w / 2
          x += wd.w + space
          return c
        })
        // Pills (Layer 0) — one per word, timed to that word.
        line.forEach((wd, i) => {
          const pw = wd.w + padX * 2
          const px = Math.round(centers[i] - pw / 2)
          const py = Math.round(y - pillH / 2)
          events.push(
            `Dialogue: 0,${assTime(wd.start)},${assTime(wd.end > wd.start ? wd.end : wd.start + 0.1)},Default,,0,0,0,,{\\an7\\pos(${px},${py})\\bord0\\shad0\\1c${hl}\\p1}${roundedRectPath(pw, pillH, radius)}{\\p0}`,
          )
        })
        // Words (Layer 1) — the whole block stays visible for its span.
        line.forEach((wd, i) => {
          events.push(
            `Dialogue: 1,${blockStart},${blockEnd},Default,,0,0,0,,{\\an5\\pos(${Math.round(centers[i])},${y})${glowInline}}${escapeAssText(wd.word)}`,
          )
        })
      })
    }
    return header + events.join('\n') + '\n'
  }

  // Prefer real per-segment timestamps (from transcription); otherwise spread the
  // typed script evenly across the duration.
  const chunks =
    segments && segments.length
      ? captionsFromSegments(segments, cfg.fontSize, width)
      : buildCaptionChunks(text, duration, cfg.fontSize, width)
  // Neon glow: blur the (colored) outline so it haloes around the text. The
  // futuristic styles set a bright color + a neon strokeColor + glow together.
  const glowTag = cfg.glow && cfg.glow > 0 ? `{\\blur${Math.round(cfg.glow)}}` : ''
  const lines = chunks
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${glowTag}${escapeAssText(c.text)}`,
    )
    .join('\n')

  return header + lines + '\n'
}

/** Escape a path for use inside the ffmpeg `ass=` / `subtitles=` filter. */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:')
}

// ---------------------------------------------------------------------------
// Render pipeline
// ---------------------------------------------------------------------------

const activeJobs = new Map<string, ChildProcessWithoutNullStreams>()
const canceledJobs = new Set<string>()

interface RenderHandlers {
  onProgress: (p: RenderProgress) => void
  onLog: (line: string) => void
}

export async function render(
  jobId: string,
  req: RenderRequest,
  handlers: RenderHandlers,
): Promise<RenderResult> {
  try {
    // Honor a cancel that arrived before ffmpeg even spawned (e.g. during the
    // renderer's voice-synth / save-dialog phase).
    if (canceledJobs.has(jobId)) {
      canceledJobs.delete(jobId)
      return { jobId, ok: false, canceled: true }
    }
    if (req.exportFormat === 'wav') {
      return await renderWav(jobId, req, handlers)
    }
    return await renderVideo(jobId, req, handlers)
  } catch (err) {
    return { jobId, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function renderWav(
  jobId: string,
  req: RenderRequest,
  handlers: RenderHandlers,
): Promise<RenderResult> {
  const source = req.narrationPath ?? req.clips[0]
  if (!source) return { jobId, ok: false, error: 'No hay fuente de audio para exportar.' }
  const total = await probeDuration(source)
  const args = [
    '-y',
    '-i',
    source,
    '-vn',
    ...(req.normalizeAudio ? ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'] : []),
    // Preserve the source's native sample rate (no -ar): resampling can only add
    // artifacts, never bandwidth. A 48 kHz SAPI voice stays a pristine 48 kHz WAV;
    // a 16 kHz OneCore voice (e.g. Mark) stays a clean 16 kHz WAV in its own voice
    // instead of being artifact-padded up to 48 kHz.
    '-c:a',
    'pcm_s16le',
    req.outputPath,
  ]
  return spawnFfmpeg(jobId, args, total, req.outputPath, handlers)
}

// libx264 speed/quality scales with the machine. On a weak box (the user's 8 GB
// desktop) a slow preset makes a short clip take minutes; ultrafast is ~3x faster
// than veryfast and, with a slightly higher CRF to keep the file reasonable, is
// plenty for short-form social video. Beefier machines keep the tighter encode.
function pickEncodeSettings(): { preset: string; crf: string } {
  const gb = totalmem() / 1024 ** 3
  const cores = cpus().length
  if (gb <= 9 || cores <= 4) return { preset: 'ultrafast', crf: '23' }
  return { preset: 'veryfast', crf: '20' }
}

async function renderVideo(
  jobId: string,
  req: RenderRequest,
  handlers: RenderHandlers,
): Promise<RenderResult> {
  const [W, H] = req.format === 'horizontal' ? [1920, 1080] : [1080, 1920]
  const clips = req.clips
  if (clips.length === 0) return { jobId, ok: false, error: 'La cola de videos está vacía.' }

  // Durations: the video runs as long as the longer of (clips, narration) so
  // neither is truncated. Video is held on its last frame (tpad) and audio is
  // silence-padded (apad) to reach the target, then both are clamped with -t.
  const durations = await Promise.all(clips.map(probeDuration))
  const videoTotal = durations.reduce((a, b) => a + b, 0)
  const narrationDur = req.narrationPath ? await probeDuration(req.narrationPath) : 0
  const target = Math.max(videoTotal, narrationDur, 0.1)
  // Captions span the narration (they ARE the script); fall back to clip length.
  const captionDuration = narrationDur > 0 ? narrationDur : videoTotal || 10

  const args: string[] = ['-y']
  clips.forEach((c) => args.push('-i', c))
  if (req.narrationPath) args.push('-i', req.narrationPath)
  // Loop the background music so it always covers the full video length.
  if (req.musicPath) args.push('-stream_loop', '-1', '-i', req.musicPath)

  const filters: string[] = []
  clips.forEach((_, i) => {
    filters.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v${i}]`,
    )
  })
  const vlabels = clips.map((_, i) => `[v${i}]`).join('')
  filters.push(`${vlabels}concat=n=${clips.length}:v=1:a=0[vcat]`)

  // Extend the video to the target by holding the last frame, when narration is longer.
  let videoLabel = '[vcat]'
  if (req.narrationPath && target - videoTotal > 0.05) {
    filters.push(`[vcat]tpad=stop_mode=clone:stop_duration=${(target - videoTotal).toFixed(3)}[vpad]`)
    videoLabel = '[vpad]'
  }

  if (req.subtitle?.config.enabled && req.subtitle.text.trim()) {
    const assPath = join(getTempDir(), `subs-${jobId}.ass`)
    writeFileSync(
      assPath,
      buildAss(req.subtitle.text, req.subtitle.config, W, H, captionDuration, req.subtitle.segments),
      'utf8',
    )
    filters.push(`${videoLabel}ass='${escapeFilterPath(assPath)}'[vsub]`)
    videoLabel = '[vsub]'
  }

  const narrIdx = clips.length
  const musicIdx = clips.length + (req.narrationPath ? 1 : 0)
  const norm = req.normalizeAudio ? ',loudnorm=I=-16:TP=-1.5:LRA=11' : ''
  let audioLabel: string | null = null
  if (req.narrationPath && req.musicPath) {
    // Narration on top + background music ducked underneath. apad keeps short
    // narration from cutting the video; normalize=0 keeps narration at full level.
    filters.push(`[${narrIdx}:a]apad${norm}[narr]`)
    filters.push(`[${musicIdx}:a]volume=0.18[mus]`)
    filters.push(`[narr][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`)
    audioLabel = '[aout]'
  } else if (req.narrationPath) {
    filters.push(`[${narrIdx}:a]apad${norm}[aout]`)
    audioLabel = '[aout]'
  } else if (req.musicPath) {
    // Music only — louder since it's the sole audio track.
    filters.push(`[${musicIdx}:a]volume=0.6${norm}[aout]`)
    audioLabel = '[aout]'
  }

  const { preset, crf } = pickEncodeSettings()
  args.push('-filter_complex', filters.join(';'))
  args.push('-map', videoLabel)
  if (audioLabel) args.push('-map', audioLabel)
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    preset,
    '-crf',
    crf,
    '-pix_fmt',
    'yuv420p',
    // Encode narration/music at 48 kHz so the high-fidelity TTS WAV (48 kHz from
    // SAPI) is preserved end-to-end instead of being implicitly downsampled.
    ...(audioLabel ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : ['-an']),
    // Clamp the (possibly padded) streams to the exact target length.
    '-t',
    target.toFixed(3),
    '-movflags',
    '+faststart',
    req.outputPath,
  )

  return spawnFfmpeg(jobId, args, target, req.outputPath, handlers)
}

function spawnFfmpeg(
  jobId: string,
  args: string[],
  totalSec: number,
  outputPath: string,
  handlers: RenderHandlers,
): Promise<RenderResult> {
  return new Promise((resolve) => {
    // `-progress pipe:1` writes machine-readable key=value progress to stdout —
    // far more reliable than scraping the stderr stats line (which could leave the
    // bar stuck at 0). `-nostats` silences the noisy stderr counterpart; stderr is
    // kept only for real log lines / errors. `out_time_us` (microseconds) + `speed`
    // give an exact % and a true ETA.
    const fullArgs = ['-nostats', '-progress', 'pipe:1', ...args]
    handlers.onLog(`ffmpeg ${fullArgs.join(' ')}`)
    const ff = spawn(FFMPEG_PATH, fullArgs)
    activeJobs.set(jobId, ff)

    // If the duration couldn't be probed, % is uncomputable — show an indeterminate
    // (percent 0) bar so the UI reflects activity instead of a frozen blank one.
    if (totalSec <= 0) handlers.onProgress({ jobId, percent: 0, stage: 'rendering' })

    let stdoutBuf = ''
    let speed = 0 // last reported encode speed (e.g. 2.5 = 2.5x realtime)
    ff.stdout.on('data', (buf: Buffer) => {
      stdoutBuf += buf.toString()
      let nl: number
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim()
        stdoutBuf = stdoutBuf.slice(nl + 1)
        const eq = line.indexOf('=')
        if (eq < 0) continue
        const key = line.slice(0, eq)
        const val = line.slice(eq + 1)
        if (key === 'speed') {
          const s = parseFloat(val) // "2.5x" -> 2.5; "N/A"/"0x" -> NaN/0
          if (Number.isFinite(s) && s > 0) speed = s
        } else if (key === 'out_time_us' && totalSec > 0) {
          const cur = Number(val) / 1e6 // microseconds -> seconds
          if (Number.isFinite(cur)) {
            const percent = Math.min(99, Math.max(0, Math.round((cur / totalSec) * 100)))
            const etaSec = speed > 0 ? Math.max(0, (totalSec - cur) / speed) : undefined
            handlers.onProgress({ jobId, percent, stage: 'rendering', etaSec })
          }
        }
      }
    })

    ff.stderr.on('data', (buf: Buffer) => {
      const trimmed = buf.toString().trim()
      if (trimmed) handlers.onLog(trimmed.split('\n').pop() ?? trimmed)
    })

    ff.on('error', (err) => {
      activeJobs.delete(jobId)
      resolve({ jobId, ok: false, error: err.message })
    })

    ff.on('close', (code) => {
      activeJobs.delete(jobId)
      if (canceledJobs.has(jobId)) {
        canceledJobs.delete(jobId)
        resolve({ jobId, ok: false, canceled: true })
        return
      }
      if (code === 0) {
        handlers.onProgress({ jobId, percent: 100, stage: 'done' })
        resolve({ jobId, ok: true, outputPath })
      } else {
        resolve({ jobId, ok: false, error: `ffmpeg salió con código ${code}` })
      }
    })
  })
}

export function cancelRender(jobId: string): void {
  // Record the cancel unconditionally so a job that hasn't spawned ffmpeg yet
  // (still in the renderer's prepare phase) is rejected the moment render() runs.
  canceledJobs.add(jobId)
  const ff = activeJobs.get(jobId)
  if (ff) {
    ff.kill('SIGKILL')
    activeJobs.delete(jobId)
  }
}

/** Remove all temp render artifacts (thumbnails, .ass, padded outputs). Call on quit. */
export function cleanupTempDir(): void {
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
    tempDir = null
  }
}
