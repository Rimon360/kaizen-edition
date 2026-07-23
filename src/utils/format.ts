/** Seconds → "m:ss" (or "h:mm:ss"). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '--:--'
  const s = Math.floor(seconds % 60)
  const m = Math.floor(seconds / 60) % 60
  const h = Math.floor(seconds / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Estimate narration duration from word count (~150 wpm reading speed). */
export function estimateSpeechDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return (words / 150) * 60
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0
}

export function truncateMiddle(str: string, max = 32): string {
  if (str.length <= max) return str
  const half = Math.floor((max - 1) / 2)
  return `${str.slice(0, half)}…${str.slice(str.length - half)}`
}

/** Seconds-remaining → a short "~Ns / ~N min / ~N.N h" string (or '' if unknown). */
export function formatEta(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 1) return ''
  if (sec < 60) return `~${Math.max(1, Math.ceil(sec))} s`
  if (sec < 3600) return `~${Math.ceil(sec / 60)} min`
  return `~${(sec / 3600).toFixed(1)} h`
}
