// ---------------------------------------------------------------------------
// Caption layout — pure, no Electron deps (so it can be unit-tested directly).
// ---------------------------------------------------------------------------

export interface Caption {
  start: number
  end: number
  /** Caption text with '\n' line breaks (escapeAssText turns these into ASS '\N'). */
  text: string
}

export interface TimedSegment {
  start: number
  end: number
  text: string
}

/** Approx max characters per line for a bold caption font at the frame width. */
function charsPerLine(fontSize: number, width: number): number {
  const marginH = Math.round(width * 0.06)
  const usable = Math.max(1, width - 2 * marginH)
  // Conservative average glyph advance — erring wide keeps text inside the line.
  const charWidth = Math.max(1, fontSize * 0.6)
  return Math.max(8, Math.floor(usable / charWidth))
}

/** Greedily wrap a word list into lines no wider than maxCharsPerLine. */
function wrapLines(words: string[], maxCharsPerLine: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w
    if (candidate.length > maxCharsPerLine && line) {
      lines.push(line)
      line = w
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Group words into captions, closing a caption as soon as adding the next word
 * would make it wrap to MORE than `maxLines` lines — using the SAME wrap logic as
 * the final layout, so every caption is guaranteed <= maxLines. Keeps the on-screen
 * line count consistent (1–2 lines) instead of a random 1/2/3.
 */
function groupWords(words: string[], maxCharsPerLine: number, maxLines: number): string[][] {
  const groups: string[][] = []
  let cur: string[] = []
  for (const w of words) {
    if (cur.length && wrapLines([...cur, w], maxCharsPerLine).length > maxLines) {
      groups.push(cur)
      cur = [w]
    } else {
      cur.push(w)
    }
  }
  if (cur.length) groups.push(cur)
  return groups
}

/**
 * Split narration text into time-distributed captions, each laid out as AT MOST
 * `maxLines` balanced lines. Used when there is NO real timing (typed script):
 * captions are spread evenly across [0, duration].
 */
export function buildCaptionChunks(
  text: string,
  duration: number,
  fontSize: number,
  width: number,
  maxLines = 2,
): Caption[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0 || duration <= 0) return []
  const maxChars = charsPerLine(fontSize, width)
  const groups = groupWords(words, maxChars, maxLines)
  const slot = duration / groups.length
  return groups.map((ws, i) => ({
    start: i * slot,
    end: (i + 1) * slot,
    text: wrapLines(ws, maxChars).join('\n'),
  }))
}

/**
 * Build captions from transcription segments that already carry REAL timestamps.
 * Each segment keeps its [start, end]; if its text is too long for `maxLines`,
 * it is split into sub-captions and the segment's time range is divided across
 * them by word count — so captions stay <= maxLines AND stay synced to the audio.
 */
export function captionsFromSegments(
  segments: TimedSegment[],
  fontSize: number,
  width: number,
  maxLines = 2,
): Caption[] {
  const maxChars = charsPerLine(fontSize, width)
  const out: Caption[] = []
  for (const seg of segments) {
    const words = String(seg.text || '').trim().split(/\s+/).filter(Boolean)
    if (!words.length) continue
    const start = Number(seg.start) || 0
    const end = Number(seg.end) > start ? Number(seg.end) : start + 1
    const groups = groupWords(words, maxChars, maxLines)
    const totalWords = words.length
    let t = start
    for (const ws of groups) {
      const frac = ws.length / totalWords
      const gStart = t
      const gEnd = Math.min(end, t + frac * (end - start))
      t = gEnd
      out.push({ start: gStart, end: gEnd > gStart ? gEnd : gStart + 0.1, text: wrapLines(ws, maxChars).join('\n') })
    }
  }
  return out
}
