// Runs as an Electron utilityProcess so the heavy Whisper work (model load +
// CPU-bound inference + JS pre/post-processing) NEVER blocks the main process or
// the window. Self-contained: no electron / app imports — config (ffmpeg path,
// model cache dir) arrives via the 'init' message; model + language per request.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import type { Segment } from '../shared/types'

// The utilityProcess message channel (Electron sets process.parentPort).
const parentPort = process.parentPort

// @xenova/transformers is ESM-only; force a real dynamic import the bundler can't rewrite.
const importEsm = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>

const MODELS: Record<string, string> = {
  fast: 'Xenova/whisper-base',
  accurate: 'Xenova/whisper-small',
  best: 'Xenova/whisper-medium',
}

let cfg = { ffmpegPath: 'ffmpeg', cacheDir: '' }
let transcriberPromise: Promise<unknown> | null = null
let loadedModel: string | null = null

function post(m: unknown): void {
  parentPort.postMessage(m)
}

function decodeAudio(path: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ff = spawn(cfg.ffmpegPath, ['-i', path, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'])
    const chunks: Buffer[] = []
    let err = ''
    ff.stdout.on('data', (d: Buffer) => chunks.push(d))
    ff.stderr.on('data', (d: Buffer) => {
      err += d.toString()
    })
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffmpeg decode failed: ' + err.slice(-300)))
      const buf = Buffer.concat(chunks)
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)))
    })
  })
}

function rms(audio: Float32Array): number {
  let sum = 0
  for (let i = 0; i < audio.length; i++) sum += audio[i] * audio[i]
  return Math.sqrt(sum / Math.max(1, audio.length))
}

const HALLUCINATIONS = new Set([
  'music', 'applause', 'thanks for watching', 'thank you for watching', 'thank you',
  'thanks', 'you', 'subscribe', 'silence', 'blank audio', 'foreign',
])
function looksLikeGarbage(text: string): boolean {
  const norm = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!norm) return true
  if (HALLUCINATIONS.has(norm)) return true
  // Reject ONLY pure repetition loops ("to to to to …") — valid speech rarely
  // drops below ~0.3 unique words, so a strict 0.2 threshold avoids falsely
  // rejecting real (e.g. Spanish) transcripts as "no speech".
  const words = norm.split(' ').filter(Boolean)
  if (words.length >= 8 && new Set(words).size / words.length < 0.2) return true
  return false
}

type Chunk = { timestamp?: [number, number | null]; text?: string }

/** Phrase-level segments (Whisper's native chunks) — the fallback when word-level
 *  timestamps aren't available. */
function buildPhraseSegments(chunks: Chunk[], durationSec: number): Segment[] {
  const raw = chunks ?? []
  return raw
    .map((c, i) => {
      const start = Number(c.timestamp?.[0] ?? 0)
      let end = Number(c.timestamp?.[1] ?? NaN)
      if (!Number.isFinite(end) || end <= start) {
        end = Number(raw[i + 1]?.timestamp?.[0] ?? durationSec)
      }
      return { start, end, text: String(c.text || '').trim() }
    })
    .filter((seg) => seg.text)
}

/** Group per-WORD chunks (return_timestamps:'word') into phrase segments that EACH
 *  carry the real word timings — so the karaoke highlight lands on the exact word. A
 *  phrase breaks on a pause (>0.6s), sentence punctuation, or ~14 words. */
function buildSegmentsFromWords(chunks: Chunk[], durationSec: number): Segment[] {
  const words = (chunks ?? [])
    .map((c) => ({
      text: String(c.text || '').trim(),
      start: Number(c.timestamp?.[0] ?? NaN),
      end: Number(c.timestamp?.[1] ?? NaN),
    }))
    .filter((w) => w.text)
  for (let i = 0; i < words.length; i++) {
    if (!Number.isFinite(words[i].start)) words[i].start = i > 0 ? words[i - 1].end : 0
    if (!Number.isFinite(words[i].end) || words[i].end <= words[i].start) {
      words[i].end = Number.isFinite(words[i + 1]?.start) ? words[i + 1].start : words[i].start + 0.3
    }
  }
  const segments: Segment[] = []
  let cur: typeof words = []
  const flush = () => {
    if (!cur.length) return
    segments.push({
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      text: cur.map((w) => w.text).join(' '),
      words: cur.map((w) => ({ start: w.start, end: w.end, text: w.text })),
    })
    cur = []
  }
  for (const w of words) {
    if (cur.length) {
      const prev = cur[cur.length - 1]
      if (w.start - prev.end > 0.6 || /[.!?]$/.test(prev.text) || cur.length >= 14) flush()
    }
    cur.push(w)
  }
  flush()
  return segments.length ? segments : buildPhraseSegments(chunks, durationSec)
}

async function getTranscriber(modelId: string, id: number): Promise<unknown> {
  if (transcriberPromise && loadedModel !== modelId) transcriberPromise = null
  if (!transcriberPromise) {
    loadedModel = modelId
    transcriberPromise = (async () => {
      const { pipeline, env } = (await importEsm('@xenova/transformers')) as {
        pipeline: (task: string, model: string, opts?: unknown) => Promise<unknown>
        env: { cacheDir: string; allowRemoteModels: boolean }
      }
      env.cacheDir = cfg.cacheDir
      env.allowRemoteModels = true
      // Aggregate per-file download progress monotonically; once everything is
      // downloaded, switch to an indeterminate 'loading' phase (session creation
      // is slow and emits no events — this is why the bar looked stuck at 99%).
      const files = new Map<string, { loaded: number; total: number }>()
      let lastPct = 0
      return pipeline('automatic-speech-recognition', modelId, {
        progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
          if (p?.status === 'progress' && p.file) {
            files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
            let loaded = 0
            let total = 0
            for (const v of files.values()) {
              loaded += v.loaded
              total += v.total
            }
            const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
            if (pct >= 100) {
              post({ type: 'progress', id, payload: { phase: 'loading', percent: 0 } })
            } else {
              lastPct = Math.max(lastPct, pct)
              post({ type: 'progress', id, payload: { phase: 'downloading', percent: lastPct } })
            }
          }
        },
      })
    })().catch((e) => {
      transcriberPromise = null
      loadedModel = null
      throw e
    })
  }
  return transcriberPromise
}

interface TranscribeMsg {
  id: number
  audioPath: string
  model: string
  language: string
  /** Whisper task='translate' (X -> English). When false, same-language transcribe. */
  translate?: boolean
}

async function handleTranscribe(msg: TranscribeMsg): Promise<void> {
  const id = msg.id
  try {
    const audio = await decodeAudio(msg.audioPath)
    if (!audio.length) {
      return post({ type: 'result', id, result: { ok: false, error: 'El audio está vacío o no se pudo leer.' } })
    }
    if (rms(audio) < 0.0008) {
      return post({ type: 'result', id, result: { ok: false, error: 'config.transcribeNoSpeech' } })
    }
    const durationSec = audio.length / 16000
    const modelId = MODELS[msg.model] ?? MODELS.accurate
    const languageName =
      msg.language === 'es' ? 'spanish' : msg.language === 'en' ? 'english' : undefined

    const transcriber = (await getTranscriber(modelId, id)) as ((
      audio: Float32Array,
      opts: unknown,
    ) => Promise<{ text?: string; chunks?: Array<{ timestamp?: [number, number | null]; text?: string }> }>) & {
      tokenizer?: { decode: (ids: number[], opts?: { skip_special_tokens?: boolean }) => string }
    }

    // Stream a live partial transcript. Macrotask timers stay blocked during
    // inference, but the per-token callback fires synchronously and its
    // postMessage DOES flush to the host — verified. Throttled to ~4/s; we decode
    // the running tokens and strip Whisper's <|timestamp|> markers for display.
    post({ type: 'progress', id, payload: { phase: 'transcribing', percent: 1, durationSec } })
    let startTime = Date.now()
    let lastPartial = 0
    let committed = '' // transcript from finished 30s chunks (the stream restarts per chunk)
    let lastChunkText = ''
    let processedChunks = 0 // finished 30s windows — gives the absolute audio position
    const callback_function = (beams: Array<{ output_token_ids?: number[] }>) => {
      const now = Date.now()
      if (now - lastPartial < 250) return
      lastPartial = now
      const ids = beams?.[0]?.output_token_ids
      if (!ids || !transcriber.tokenizer) return
      // Decode WITH special tokens so we can read the <|t.tt|> timestamp markers
      // (real position through the current 30s window) before stripping for display.
      let raw: string
      try {
        raw = transcriber.tokenizer.decode(ids, { skip_special_tokens: false })
      } catch {
        return
      }
      const ts = raw.match(/<\|(\d+\.\d+)\|>/g)
      const lastTs = ts && ts.length ? parseFloat(ts[ts.length - 1].slice(2, -2)) : 0
      const text = raw.replace(/<\|[^|]*\|>/g, '').replace(/\s+/g, ' ').trim()
      // Greedy decoding only ever appends, so a shorter text means a new 30s window
      // began — fold the finished one in + count it for absolute position.
      if (lastChunkText && text.length + 5 < lastChunkText.length) {
        committed = committed ? committed + ' ' + lastChunkText : lastChunkText
        processedChunks++
      }
      lastChunkText = text
      // Real, monotonic % through the audio + a rate-based ETA.
      const processedSec = Math.min(durationSec, processedChunks * 30 + lastTs)
      const percent =
        durationSec > 0 ? Math.min(99, Math.max(1, Math.round((processedSec / durationSec) * 100))) : 1
      const elapsed = (now - startTime) / 1000
      const rate = elapsed > 0.5 && processedSec > 0 ? processedSec / elapsed : 0
      const etaSec = rate > 0 ? Math.max(0, (durationSec - processedSec) / rate) : undefined
      const display = committed ? committed + ' ' + text : text
      post({
        type: 'progress',
        id,
        payload: { phase: 'transcribing', percent, etaSec, partialText: display || undefined },
      })
    }
    const baseOpts = {
      chunk_length_s: 30,
      stride_length_s: 5,
      // task='translate' makes Whisper output ENGLISH from any source language; the
      // source `language` still helps it decode the speech correctly.
      task: msg.translate ? 'translate' : 'transcribe',
      no_repeat_ngram_size: 3,
      ...(languageName ? { language: languageName } : {}),
      callback_function,
    }

    // Prefer REAL per-word timestamps (return_timestamps:'word') so the karaoke pill
    // lands on the exact word being spoken. It needs the model's alignment heads; if
    // unavailable transformers.js throws, so we fall back to phrase-level timestamps +
    // estimated word timing (never worse than before). Word mode isn't a second
    // generation — only the rare fallback re-runs.
    let out: { text?: string; chunks?: Chunk[] }
    let wordMode = true
    try {
      out = await transcriber(audio, { ...baseOpts, return_timestamps: 'word' })
      if (!out?.chunks?.length || !out.chunks.some((c) => Array.isArray(c.timestamp))) {
        throw new Error('no word-level timestamps')
      }
    } catch {
      wordMode = false
      committed = ''
      lastChunkText = ''
      processedChunks = 0
      startTime = Date.now()
      out = await transcriber(audio, { ...baseOpts, return_timestamps: true })
    }
    post({ type: 'progress', id, payload: { phase: 'transcribing', percent: 100 } })

    const text = String(out.text || '').trim()
    if (looksLikeGarbage(text)) {
      return post({ type: 'result', id, result: { ok: false, error: 'config.transcribeNoSpeech' } })
    }

    const segments: Segment[] = wordMode
      ? buildSegmentsFromWords(out.chunks ?? [], durationSec)
      : buildPhraseSegments(out.chunks ?? [], durationSec)

    post({ type: 'result', id, result: { ok: true, text, segments } })
  } catch (err) {
    post({ type: 'result', id, result: { ok: false, error: err instanceof Error ? err.message : String(err) } })
  }
}

parentPort.on('message', (e: { data: unknown }) => {
  const msg = e.data as { type?: string; ffmpegPath?: string; cacheDir?: string } & TranscribeMsg
  if (!msg || typeof msg.type !== 'string') return
  if (msg.type === 'init') {
    cfg = { ffmpegPath: msg.ffmpegPath || 'ffmpeg', cacheDir: msg.cacheDir || '' }
    try {
      mkdirSync(cfg.cacheDir, { recursive: true })
    } catch {
      /* best effort */
    }
  } else if (msg.type === 'transcribe') {
    void handleTranscribe(msg)
  }
})
