import { app, net } from 'electron'
import { existsSync, mkdirSync, createWriteStream, renameSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ModelStatus, ModelProgress, ModelResult } from '../shared/types'

// ---------------------------------------------------------------------------
// First-run model download. The ~3 GB Chatterbox model is NOT bundled in the
// installer (NSIS caps at ~2 GB, and a static model has no business inside an
// auto-updating installer). It downloads ONCE into userData/chatterbox-model as
// 6 flat files, which the sidecar then loads offline via `from_local`.
//
// Robustness: each file is fetched with RESUME (HTTP Range from the .part offset)
// and retried, and a .part is only promoted to the final name once its full
// Content-Length is on disk — so a dropped connection resumes instead of failing,
// and we never accept a truncated file.
//
// Speed: parallel/chunked downloading gave no gain — HF throttles per-IP
// (~2.4 MB/s), not per-connection. To go faster, host the model on your own CDN
// and set KAIZEN_MODEL_BASE (no per-IP throttle); it must serve the same 6 files.
// ---------------------------------------------------------------------------

const MODEL_BASE =
  process.env.KAIZEN_MODEL_BASE || 'https://huggingface.co/ResembleAI/chatterbox/resolve/main'

// The exact files ChatterboxMultilingualTTS.from_local() needs, with their REAL
// Content-Length (verified against HF) for an accurate progress bar + a correct
// "is it fully downloaded" check.
const FILES: { name: string; bytes: number }[] = [
  { name: 've.pt', bytes: 5_698_626 },
  { name: 't3_mtl23ls_v2.safetensors', bytes: 2_143_989_752 },
  { name: 's3gen.pt', bytes: 1_057_165_844 },
  { name: 'grapheme_mtl_merged_expanded_v1.json', bytes: 69_989 },
  { name: 'conds.pt', bytes: 107_374 },
  { name: 'Cangjie5_TC.json', bytes: 1_920_163 },
]
const TOTAL_BYTES = FILES.reduce((s, f) => s + f.bytes, 0)

export function installedModelDir(): string {
  return join(app.getPath('userData'), 'chatterbox-model')
}

// A file counts as present only at (near) its full size. The downloader promotes
// .part -> final only when complete, so finals are trustworthy; this also rejects
// any truncated file left by an older build.
function fileComplete(dir: string, f: { name: string; bytes: number }): boolean {
  try {
    const p = join(dir, f.name)
    return existsSync(p) && statSync(p).size >= Math.floor(f.bytes * 0.99)
  } catch {
    return false
  }
}

/** True only if EVERY model file is fully present in `dir`. Used both for the
 *  download target and to decide whether the engine can load a model from a dir
 *  (an incomplete set would crash the loader with a file-not-found / os error 2). */
export function modelFilesPresent(dir: string): boolean {
  return FILES.every((f) => fileComplete(dir, f))
}

export function isModelInstalled(): boolean {
  return modelFilesPresent(installedModelDir())
}

export function modelStatus(): ModelStatus {
  return { installed: isModelInstalled(), dir: installedModelDir(), totalBytes: TOTAL_BYTES }
}

/** Delete every model file (+ any .part) so the next download fetches a clean copy.
 *  Used to recover from a corrupted model (right size, bad bytes) that fails to load. */
export function clearModel(): void {
  const dir = installedModelDir()
  for (const f of FILES) {
    for (const p of [join(dir, f.name), join(dir, f.name + '.part')]) {
      try {
        if (existsSync(p)) rmSync(p, { force: true })
      } catch {
        /* best effort */
      }
    }
  }
}

let canceled = false
let currentReq: ReturnType<typeof net.request> | null = null
let currentReject: ((e: Error) => void) | null = null

export function cancelModelDownload(): void {
  canceled = true
  const reject = currentReject
  currentReject = null
  try {
    currentReq?.abort()
  } catch {
    /* best effort */
  }
  reject?.(new Error('canceled'))
}

const urlFor = (name: string) => `${MODEL_BASE}/${name}?download=true`
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
function header(res: { headers: Record<string, string | string[]> }, key: string): string {
  const v = res.headers[key]
  return Array.isArray(v) ? v[0] : v || ''
}

/**
 * One streaming attempt. Resumes from `offset` via a Range request (appending to
 * the .part); if the server ignores the Range (200), it restarts the file. Reports
 * the file's absolute on-disk size via onAbsolute and resolves with the total size.
 */
function streamFrom(
  name: string,
  tmp: string,
  offset: number,
  onAbsolute: (n: number) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = net.request(urlFor(name))
    if (offset > 0) req.setHeader('Range', `bytes=${offset}-`)
    currentReq = req
    let settled = false
    let total = 0
    let lastTick = Date.now()
    let out: ReturnType<typeof createWriteStream> | null = null
    let stall: ReturnType<typeof setInterval> | null = null
    const done = (err?: Error) => {
      if (settled) return
      settled = true
      currentReject = null
      if (stall) {
        clearInterval(stall)
        stall = null
      }
      if (err) {
        try {
          out?.destroy()
        } catch {
          /* ignore */
        }
        reject(err)
      } else {
        resolve(total)
      }
    }
    // Cancel aborts the socket AND settles immediately.
    currentReject = (e) => {
      try {
        req.abort()
      } catch {
        /* ignore */
      }
      done(e)
    }
    req.on('abort', () => done(new Error('canceled')))
    req.on('error', (e) => done(e))
    req.on('response', (res) => {
      const status = res.statusCode || 0
      let written = offset
      if (status === 206) {
        // Partial content. Content-Range: "bytes start-end/total".
        const m = /\/(\d+)\s*$/.exec(header(res, 'content-range'))
        total = m ? Number(m[1]) : 0
        out = createWriteStream(tmp, { flags: 'a' })
      } else if (status === 200) {
        // Full content (range ignored / fresh start) — restart the .part.
        total = Number(header(res, 'content-length')) || 0
        written = 0
        out = createWriteStream(tmp)
      } else {
        done(new Error(`HTTP ${status} for ${name}`))
        return
      }
      // Electron's net IncomingMessage emits 'data'/'end' but is NOT a Node
      // Readable (no .pipe), so we write manually. Robustness now comes from the
      // out 'error' handler + the stall guard + downloadOne's size check — the
      // old manual pause/resume backpressure could deadlock and hang at ~100%.
      out.on('error', (e) => done(e))
      res.on('error', (e: Error) => done(e))
      res.on('aborted', () => done(new Error('aborted')))
      res.on('data', (chunk: Buffer) => {
        if (settled) return
        lastTick = Date.now()
        written += chunk.length
        onAbsolute(written)
        out!.write(chunk)
      })
      res.on('end', () => {
        if (settled || !out) return
        out.end(() => done()) // flush remaining bytes to disk, then resolve
      })
      // Stall guard: if no bytes arrive for 30s, abort so downloadOne can resume —
      // guarantees we never hang forever on a dead/half-open connection.
      stall = setInterval(() => {
        if (Date.now() - lastTick > 30_000) {
          try {
            req.abort()
          } catch {
            /* ignore */
          }
          done(new Error('stalled'))
        }
      }, 5_000)
    })
    req.end()
  })
}

/** Download one file with resume + retry until its full size is on disk. */
async function downloadOne(
  name: string,
  dir: string,
  expectedBytes: number,
  onAbsolute: (abs: number) => void,
): Promise<void> {
  const dest = join(dir, name)
  const tmp = dest + '.part'
  for (let attempt = 0; attempt < 15; attempt++) {
    if (canceled) throw new Error('canceled')
    let partSize = 0
    try {
      if (existsSync(tmp)) partSize = statSync(tmp).size
    } catch {
      partSize = 0
    }
    // Already fully downloaded (e.g. the bytes arrived but a stream never signaled
    // completion) — promote it instead of pointlessly re-requesting forever.
    if (expectedBytes > 0 && partSize >= expectedBytes) {
      renameSync(tmp, dest)
      return
    }
    let total = 0
    try {
      total = await streamFrom(name, tmp, partSize, onAbsolute)
    } catch {
      if (canceled) throw new Error('canceled')
      await delay(Math.min(5000, 600 * (attempt + 1))) // back off, then resume
      continue
    }
    let size = 0
    try {
      size = statSync(tmp).size
    } catch {
      size = 0
    }
    if ((total > 0 && size >= total) || (expectedBytes > 0 && size >= expectedBytes)) {
      renameSync(tmp, dest) // only promote a COMPLETE file
      return
    }
    // Short read (HF dropped the connection) — loop to resume from the new offset.
    await delay(400)
  }
  throw new Error('clone.modelIncomplete')
}

/**
 * Download the whole model. Idempotent + resumable: complete files are skipped,
 * and a partial file resumes from its .part instead of restarting.
 */
export async function downloadModel(
  onProgress?: (p: ModelProgress) => void,
): Promise<ModelResult> {
  if (isModelInstalled()) return { ok: true }
  canceled = false
  const dir = installedModelDir()
  mkdirSync(dir, { recursive: true })

  // Bytes from files already fully present (so the bar starts where we left off).
  let completedBytes = 0
  for (const f of FILES) if (fileComplete(dir, f)) completedBytes += f.bytes

  // Throttle progress to ~5/sec — per-chunk events would flood IPC + jitter the ETA.
  let lastEmit = 0
  const emit = (currentFile: string, currentAbs: number) => {
    const now = Date.now()
    if (now - lastEmit >= 200) {
      lastEmit = now
      onProgress?.({ receivedBytes: completedBytes + currentAbs, totalBytes: TOTAL_BYTES, currentFile })
    }
  }

  try {
    for (const f of FILES) {
      if (canceled) return { ok: false, canceled: true }
      if (fileComplete(dir, f)) continue
      // An incomplete FINAL from an older build can be RESUMED rather than
      // refetched: move it to .part so downloadOne continues from its offset.
      try {
        const dest = join(dir, f.name)
        const tmp = dest + '.part'
        if (existsSync(dest) && !existsSync(tmp)) renameSync(dest, tmp)
      } catch {
        /* ignore */
      }
      emit(f.name, 0)
      await downloadOne(f.name, dir, f.bytes, (abs) => emit(f.name, abs))
      completedBytes += f.bytes
    }
  } catch (err) {
    if (canceled) return { ok: false, canceled: true }
    return { ok: false, error: 'clone.modelIncomplete' }
  } finally {
    currentReq = null
    currentReject = null
  }

  if (canceled) return { ok: false, canceled: true }
  if (!isModelInstalled()) return { ok: false, error: 'clone.modelIncomplete' }
  onProgress?.({ receivedBytes: TOTAL_BYTES, totalBytes: TOTAL_BYTES })
  return { ok: true }
}
