import { app, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { FFMPEG_PATH } from './ffmpeg'
import { getSettings } from './settingsStore'
import type { TranscribeProgress, TranscribeResult } from '../shared/types'

// Transcription (Whisper) runs in a separate utilityProcess so its heavy model
// load + CPU-bound inference never block the main process / window. This module is
// just the thin host: it forks the worker, relays progress, and resolves results.

type ProgressCb = (p: TranscribeProgress) => void

let child: UtilityProcess | null = null
let nextId = 0
let canceledByUser = false
const pending = new Map<number, { resolve: (r: TranscribeResult) => void; onProgress?: ProgressCb }>()

function modelCacheDir(): string {
  const dir = join(app.getPath('userData'), 'whisper-models')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* best effort */
  }
  return dir
}

function getWorker(): UtilityProcess {
  if (child) return child
  const proc = utilityProcess.fork(join(__dirname, 'whisper-process.js'), [], {
    serviceName: 'kaizen-whisper',
  })
  proc.postMessage({ type: 'init', ffmpegPath: FFMPEG_PATH, cacheDir: modelCacheDir() })
  proc.on(
    'message',
    (msg: { type: string; id: number; payload?: TranscribeProgress; result?: TranscribeResult }) => {
      const entry = pending.get(msg.id)
      if (!entry) return
      if (msg.type === 'progress' && msg.payload) entry.onProgress?.(msg.payload)
      else if (msg.type === 'result' && msg.result) {
        entry.resolve(msg.result)
        pending.delete(msg.id)
      }
    },
  )
  proc.on('exit', () => {
    // Worker died — resolve any in-flight requests so the UI never hangs. A
    // user-initiated cancel (we killed it on purpose) resolves as canceled rather
    // than an error, so no failure toast appears.
    const wasCanceled = canceledByUser
    canceledByUser = false
    for (const [, e] of pending)
      e.resolve(
        wasCanceled
          ? { ok: false, canceled: true }
          : { ok: false, error: 'El proceso de transcripción se cerró.' },
      )
    pending.clear()
    child = null
  })
  child = proc
  return proc
}

/**
 * Transcribe an audio file to text + timed segments using offline Whisper, in a
 * background process. The model downloads once to userData, then runs offline.
 */
export function transcribe(
  audioPath: string,
  opts?: { language?: string; onProgress?: ProgressCb },
): Promise<TranscribeResult> {
  try {
    const s = getSettings()
    const requested = opts?.language ?? s.transcribeLanguage
    // Whisper's built-in language auto-detection (transformers.js) is heavily
    // English-biased and routinely transcribes Spanish speech as English. So
    // 'auto' resolves to the app's UI language, which is reliable for this
    // Spanish-first app. Explicit 'es' / 'en' always force that language.
    const language = requested === 'auto' ? s.language : requested
    // Whisper's native task='translate' translates ANY source language to ENGLISH
    // (English-only target). With a non-English source this yields English captions.
    const translate = !!s.translateToEnglish
    const worker = getWorker()
    const id = ++nextId
    return new Promise<TranscribeResult>((resolve) => {
      pending.set(id, { resolve, onProgress: opts?.onProgress })
      worker.postMessage({
        type: 'transcribe',
        id,
        audioPath,
        model: s.transcribeModel,
        language,
        translate,
      })
    })
  } catch (err) {
    return Promise.resolve({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * Stop an in-progress transcription. The worker's event loop is blocked during
 * inference (it can't process a "cancel" message), so the only reliable stop is
 * to kill the process; its `exit` handler resolves the pending request as
 * canceled. The next transcribe re-forks and reloads the (cached) model.
 */
export function cancelTranscribe(): void {
  if (!child) return
  canceledByUser = true
  try {
    child.kill()
  } catch {
    /* best effort */
  }
}

/** Terminate the worker (call on app quit). */
export function cleanupWhisper(): void {
  if (child) {
    try {
      child.kill()
    } catch {
      /* best effort */
    }
    child = null
  }
}
