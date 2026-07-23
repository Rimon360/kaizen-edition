import { app } from 'electron'
import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FFMPEG_PATH } from './ffmpeg'
import { installedModelDir, modelFilesPresent } from './modelDownload'
import type {
  CloneVoice,
  CloneEngineStatus,
  CloneProgress,
  CloneResult,
  CloneSynthRequest,
} from '../shared/types'

// ---------------------------------------------------------------------------
// Local cloned-voice LIBRARY — every voice the user clones is saved so it can be
// reused later without re-uploading. Reference samples are normalized to 24 kHz
// mono WAV (best for Chatterbox) and stored under userData/cloned-voices/.
// ---------------------------------------------------------------------------

function libDir(): string {
  const d = join(app.getPath('userData'), 'cloned-voices')
  mkdirSync(d, { recursive: true })
  return d
}
const indexFile = () => join(libDir(), 'index.json')

function modelCacheDir(): string {
  const d = join(app.getPath('userData'), 'chatterbox-models')
  mkdirSync(d, { recursive: true })
  return d
}

/**
 * A model dir SHIPPED with the app (the 6 multilingual weight files), if present.
 * Packaged: resources/chatterbox-model (electron-builder extraResources).
 * Dev: python/model (staged via `npm run model:stage`).
 * When found, the sidecar loads it offline via `from_local` — users download
 * nothing. When absent, the engine falls back to a first-run Hugging Face download.
 */
function bundledModelDir(): string | null {
  // Order: the model the user downloaded on first run (userData/chatterbox-model),
  // then a model bundled in the installer (we don't ship one — NSIS size limit),
  // then a dev-staged copy (python/model). First hit with the T3 weights wins.
  const candidates = [
    installedModelDir(),
    app.isPackaged
      ? join(process.resourcesPath, 'chatterbox-model')
      : join(app.getAppPath(), 'python', 'model'),
  ]
  // Require EVERY model file present — a partial set (e.g. an interrupted download)
  // must not look "available", or the engine crashes with a file-not-found / os error 2.
  for (const d of candidates) {
    if (modelFilesPresent(d)) return d
  }
  return null
}

/** True when the engine has a model to load (downloaded, bundled, or dev-staged).
 *  Drives whether the UI prompts the first-run download. */
export function modelAvailable(): boolean {
  return bundledModelDir() !== null
}
function outDir(): string {
  const d = join(app.getPath('temp'), 'kaizen-clone')
  mkdirSync(d, { recursive: true })
  return d
}

function readIndex(): CloneVoice[] {
  try {
    if (existsSync(indexFile())) {
      const arr = JSON.parse(readFileSync(indexFile(), 'utf8')) as CloneVoice[]
      // Drop entries whose sample file vanished (e.g. user cleared appdata).
      return Array.isArray(arr) ? arr.filter((v) => v && v.sampleFile && existsSync(v.sampleFile)) : []
    }
  } catch {
    /* fall through */
  }
  return []
}
function writeIndex(list: CloneVoice[]): void {
  try {
    writeFileSync(indexFile(), JSON.stringify(list, null, 2), 'utf8')
  } catch (err) {
    console.warn('[clone] failed to write voice index:', err)
  }
}

export function listCloneVoices(): CloneVoice[] {
  return readIndex()
}

function ffmpeg(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG_PATH, args)
    p.on('error', () => resolve(-1))
    p.on('close', (c) => resolve(c ?? -1))
  })
}

/**
 * Save a new cloned voice from a user-provided sample (upload or recording).
 * The sample is normalized to a clean 24 kHz mono WAV and capped at 20 s (longer
 * references dilute the voice embedding). Returns the new library entry.
 */
export async function addCloneVoice(
  samplePath: string,
  name: string,
  language: string,
): Promise<CloneVoice> {
  if (!samplePath || !existsSync(samplePath)) throw new Error('La muestra de audio no existe.')
  const id = randomUUID()
  const dest = join(libDir(), `${id}.wav`)
  const code = await ffmpeg([
    '-y',
    '-i',
    samplePath,
    '-t',
    '20',
    '-ac',
    '1',
    '-ar',
    '24000',
    '-c:a',
    'pcm_s16le',
    dest,
  ])
  if (code !== 0 || !existsSync(dest)) {
    throw new Error('No se pudo procesar la muestra de audio.')
  }
  // 24 kHz mono 16-bit PCM ⇒ seconds ≈ (bytes − 44-byte header) / (24000 × 2).
  const sizeBytes = statSync(dest).size
  const durationSec = Math.max(0, Math.round(((sizeBytes - 44) / (24000 * 2)) * 10) / 10)
  const voice: CloneVoice = {
    id,
    name: (name || '').trim() || 'Voz clonada',
    createdAt: Date.now(),
    language: language || 'es',
    sampleFile: dest,
    durationSec,
  }
  const list = readIndex()
  list.unshift(voice)
  writeIndex(list)
  return voice
}

export function removeCloneVoice(id: string): CloneVoice[] {
  const list = readIndex()
  const v = list.find((x) => x.id === id)
  if (v) {
    try {
      rmSync(v.sampleFile, { force: true })
      if (v.previewFile) rmSync(v.previewFile, { force: true })
    } catch {
      /* best effort */
    }
  }
  const next = list.filter((x) => x.id !== id)
  writeIndex(next)
  return next
}

export function renameCloneVoice(id: string, name: string): CloneVoice[] {
  const list = readIndex()
  const v = list.find((x) => x.id === id)
  if (v && name.trim()) v.name = name.trim()
  writeIndex(list)
  return list
}

// ---------------------------------------------------------------------------
// Engine sidecar (Chatterbox via a bundled Python exe; in dev, the .py script).
// Communicates over line-delimited JSON on stdio (see python/chatterbox_sidecar.py).
// ---------------------------------------------------------------------------

function resolveSidecar(): { cmd: string; args: string[] } | null {
  const exe = process.platform === 'win32' ? 'chatterbox-sidecar.exe' : 'chatterbox-sidecar'
  if (app.isPackaged) {
    // Shipped via electron-builder extraResources → resources/chatterbox-sidecar/.
    const packaged = join(process.resourcesPath, 'chatterbox-sidecar', exe)
    return existsSync(packaged) ? { cmd: packaged, args: [] } : null
  }
  // Dev: a locally-built exe wins; otherwise run the .py with a Python that has
  // chatterbox-tts. We prefer, in order: the project venv (created by
  // `npm run sidecar:dev`), the KAIZEN_CLONE_PYTHON override, then system python.
  // (Any of them must be 3.11/3.12 — torch has no 3.13/3.14 wheels.)
  const devExe = join(app.getAppPath(), 'python', 'dist', 'chatterbox-sidecar', exe)
  if (existsSync(devExe)) return { cmd: devExe, args: [] }
  const script = join(app.getAppPath(), 'python', 'chatterbox_sidecar.py')
  if (!existsSync(script)) return null
  const venvPy =
    process.platform === 'win32'
      ? join(app.getAppPath(), 'python', '.venv', 'Scripts', 'python.exe')
      : join(app.getAppPath(), 'python', '.venv', 'bin', 'python')
  const py = existsSync(venvPy)
    ? venvPy
    : process.env.KAIZEN_CLONE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
  return { cmd: py, args: [script] }
}

// null = unknown; false = the engine launched but its Python deps (chatterbox /
// torch) aren't installed → cloning can't run until the sidecar is set up.
let engineUsable: boolean | null = null

/** Translate a raw sidecar error into a clean, user-facing message/key. A
 *  missing-dependency error means the engine just isn't set up on this machine. */
function mapEngineError(raw?: string): string {
  const e = (raw || '').toLowerCase()
  if (/no module named|modulenotfound|cannot import|could not import|importerror|dll load failed/.test(e)) {
    engineUsable = false
    return 'clone.setupNeeded'
  }
  // A damaged/incomplete model (right size, bad bytes, or a missing weight file)
  // surfaces as a load/parse error — point the user to re-download it.
  if (
    /os error 2|no such file|cannot find the (file|path)|deserializ|pytorchstreamreader|invalid load key|unexpected eof|central directory|corrupt|truncated|safetensor|checkpoint|errno 2/.test(
      e,
    )
  ) {
    return 'clone.modelBroken'
  }
  return raw || 'clone.synthFailed'
}

export function cloneEngineStatus(): CloneEngineStatus {
  const s = resolveSidecar()
  if (!s) return { available: false, mode: 'none', reason: 'clone.engineMissing' }
  const mode = app.isPackaged ? 'packaged' : 'dev'
  // Once we've learned the deps are missing, report it so the UI guides setup
  // instead of letting the user hit the same failure again.
  if (engineUsable === false) return { available: false, mode, reason: 'clone.setupNeeded' }
  return { available: true, mode }
}

type Pending = {
  resolve: (r: CloneResult) => void
  onProgress?: (p: CloneProgress) => void
  /** Expected token count for this text — the denominator for an accurate %/ETA. */
  estTokens?: number
}

let child: ChildProcessWithoutNullStreams | null = null
let starting: Promise<void> | null = null
let nextId = 0
let canceledByUser = false
const pending = new Map<number, Pending>()
// The onProgress of the request currently in its 'generating' phase — the tqdm
// sampling bar (on stderr) is relayed to it as a real percent + ETA.
let activeOnProgress: ((p: CloneProgress) => void) | null = null
// Expected total tokens for that request (its EOS point), used as the % denominator.
let activeEstTokens = 0
// Whether the T3 "Sampling" bar has started for the active request — lets us treat
// the SUBSEQUENT (desc-less) s3gen vocoder tqdm as the final 90->97% stretch.
let samplingSeen = false
// Long scripts are synthesized in sentence chunks (the sidecar runs one tqdm
// "Sampling" bar per chunk). To keep ONE smooth bar across the whole script we
// accumulate tokens: cumulativeTokens banks completed chunks, lastChunkPeak holds
// the in-flight chunk's latest count, activeChunks is the total chunk count.
let cumulativeTokens = 0
let lastChunkPeak = 0
let activeChunks = 1

function startEngine(): Promise<void> {
  if (child) return Promise.resolve()
  if (starting) return starting
  const s = resolveSidecar()
  if (!s) return Promise.reject(new Error('clone.engineMissing'))

  starting = new Promise<void>((resolve, reject) => {
    let proc: ChildProcessWithoutNullStreams
    try {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        HF_HOME: modelCacheDir(),
        HF_HUB_DISABLE_TELEMETRY: '1',
      }
      const model = bundledModelDir()
      if (model) {
        // Use the shipped model and forbid any network — no download, ever.
        env.KAIZEN_MODEL_DIR = model
        env.HF_HUB_OFFLINE = '1'
        env.TRANSFORMERS_OFFLINE = '1'
      }
      proc = spawn(s.cmd, s.args, { env })
    } catch (err) {
      starting = null
      return reject(err instanceof Error ? err : new Error(String(err)))
    }
    let helloed = false
    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => {
      let msg: {
        id?: number
        type?: string
        stage?: string
        output?: string
        error?: string
        chunk?: number
        chunks?: number
      }
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      if (msg.type === 'hello') {
        helloed = true
        child = proc
        resolve()
        return
      }
      const entry = msg.id != null ? pending.get(msg.id) : undefined
      if (!entry) return
      if (msg.type === 'progress') {
        const phase =
          msg.stage === 'loading' ? 'loading' : msg.stage === 'saving' ? 'saving' : 'generating'
        if (phase === 'generating') {
          // Route the stderr tqdm bar to THIS request while it generates.
          const chunk = typeof msg.chunk === 'number' ? msg.chunk : 1
          activeOnProgress = entry.onProgress ?? null
          activeEstTokens = entry.estTokens ?? 0
          activeChunks = typeof msg.chunks === 'number' ? msg.chunks : 1
          samplingSeen = false
          if (chunk <= 1) {
            // First chunk → fresh run.
            cumulativeTokens = 0
            lastChunkPeak = 0
            entry.onProgress?.({ phase })
          } else {
            // Next chunk → bank the finished chunk's tokens; hold the last percent
            // (no flicker) until the next tqdm line refines it.
            cumulativeTokens += lastChunkPeak
            lastChunkPeak = 0
          }
        } else {
          activeOnProgress = null
          activeEstTokens = 0
          cumulativeTokens = 0
          lastChunkPeak = 0
          activeChunks = 1
          // Carry the bar to 99% for the brief WAV-writing phase so it never lingers
          // at a lower number, then 'done' closes the modal at 100%.
          entry.onProgress?.(phase === 'saving' ? { phase, percent: 99 } : { phase })
        }
      } else if (msg.type === 'done' && msg.output) {
        engineUsable = true
        activeOnProgress = null
        entry.resolve({ ok: true, outputPath: msg.output })
        pending.delete(msg.id!)
      } else if (msg.type === 'error') {
        activeOnProgress = null
        entry.resolve({ ok: false, error: mapEngineError(msg.error) })
        pending.delete(msg.id!)
      }
    })
    proc.stderr.on('data', (d: Buffer) => {
      const t = d.toString()
      // Generation emits two tqdm bars to stderr, in order:
      //   1. T3 token sampling:  "Sampling:  4%|...| 40/1000 [00:08<03:12, 4.98it/s]"
      //   2. s3gen vocoder (no desc): "  50%|...| 5/10 [00:02<00:02, ...]"
      // The "/1000" denominator is a FIXED cap; the model stops early at end-of-
      // speech, so the bar's raw %/ETA are wildly off. We can't know the exact stop
      // point, so we map token count through our per-text estimate with an ASYMPTOTIC
      // curve: it eases toward (but never reaches) 90% even when the estimate is too
      // low, so the bar keeps inching instead of slamming into 99% and sitting there.
      // The vocoder bar then fills the reserved 90->97% band, and 'saving' -> 98%.
      const last = t.split(/[\r\n]+/).filter(Boolean).pop() || ''
      const cm = activeOnProgress ? /(\d+)\/(\d+)\s*\[/.exec(last) : null
      if (cm) {
        const n = parseInt(cm[1], 10)
        const cap = parseInt(cm[2], 10)
        if (/Sampling/.test(last)) {
          samplingSeen = true
          // The per-chunk bar resets to 0 each sentence; bank finished chunks in
          // cumulativeTokens so the overall count keeps climbing. estTokens is the
          // FULL-script estimate (not clamped to the per-chunk 1000 cap anymore).
          if (n > lastChunkPeak) lastChunkPeak = n
          const overallN = cumulativeTokens + n
          const est = activeEstTokens || cap
          const r = est > 0 ? overallN / est : 0
          // r<1: near-linear up to ~85%. r>=1 (estimate undershot): ease toward 96%
          // over a WIDE band (85->96), so the "extra" tokens still move the bar a few
          // points each instead of pinning it — no 99% stall, no hard freeze near the top.
          const raw = r < 1 ? 5 + 80 * r : 97 - 12 / (1 + (r - 1) * 1.2)
          const percent = Math.max(1, Math.min(96, Math.round(raw)))
          // Live token rate from the bar ("4.98it/s", or "1.2s/it" when slow). ETA only
          // while we're still within the estimate — past it, remaining is unknowable.
          let rate = 0
          const im = /([\d.]+)\s*it\/s/.exec(last)
          if (im) rate = parseFloat(im[1])
          else {
            const sm = /([\d.]+)\s*s\/it/.exec(last)
            if (sm && parseFloat(sm[1]) > 0) rate = 1 / parseFloat(sm[1])
          }
          const etaSec = rate > 0 && overallN < est ? Math.round((est - overallN) / rate) : undefined
          activeOnProgress!({ phase: 'generating', percent, etaSec })
        } else if (samplingSeen && cap > 0 && activeChunks <= 1) {
          // The vocoder pass (when it reports) — nudges the reserved 96->98% tail so
          // the bar keeps moving after sampling instead of freezing during synthesis.
          const percent = Math.max(96, Math.min(98, Math.round(96 + 2 * (n / cap))))
          activeOnProgress!({ phase: 'generating', percent })
        }
      }
      const trimmed = t.trim()
      if (trimmed) console.warn('[clone:py]', trimmed.split('\n').pop())
    })
    proc.on('error', (err) => {
      if (!helloed) {
        starting = null
        reject(err)
      }
    })
    proc.on('exit', () => {
      const wasCanceled = canceledByUser
      canceledByUser = false
      for (const [, e] of pending)
        e.resolve(wasCanceled ? { ok: false, canceled: true } : { ok: false, error: 'clone.engineClosed' })
      pending.clear()
      child = null
      starting = null
    })
    // The sidecar emits `hello` immediately at startup (before any model work),
    // so a short timeout is enough to detect a failure to launch.
    setTimeout(() => {
      if (!helloed) {
        try {
          proc.kill()
        } catch {
          /* ignore */
        }
        starting = null
        reject(new Error('clone.engineStartTimeout'))
      }
    }, 20000)
  })
  return starting
}

/**
 * Estimate how many speech tokens the model will generate for `text` — i.e. where
 * it hits end-of-speech and stops, well before its 1000-token ceiling. Chatterbox
 * emits ~25 tokens per second of audio, and a 4-point CPU calibration fits the EOS
 * point to `tokens ≈ 16 + 1.17·chars` within a few %. This is the denominator that
 * turns the model's "N/1000" sampling bar into an accurate synthesis % + ETA.
 */
function estimateCloneTokens(text: string): number {
  const chars = (text || '').trim().length
  return Math.max(20, Math.round(16 + 1.17 * chars))
}

/** Synthesize `text` in a saved cloned voice. First call downloads/loads the
 *  model (slow); progress phases are relayed to `onProgress`. */
export async function cloneSynthesize(
  req: CloneSynthRequest,
  opts?: { onProgress?: (p: CloneProgress) => void },
): Promise<CloneResult> {
  try {
    const voice = readIndex().find((v) => v.id === req.voiceId)
    if (!voice) return { ok: false, error: 'clone.voiceNotFound' }
    if (!(req.text || '').trim()) return { ok: false, error: 'clone.emptyText' }
    if (!resolveSidecar()) return { ok: false, error: 'clone.engineMissing' }

    opts?.onProgress?.({ phase: 'starting' })
    await startEngine()
    if (!child) return { ok: false, error: 'clone.engineClosed' }

    const output = join(outDir(), `clone-${Date.now()}-${Math.floor(Math.random() * 1e6)}.wav`)
    const id = ++nextId
    return await new Promise<CloneResult>((resolve) => {
      pending.set(id, { resolve, onProgress: opts?.onProgress, estTokens: estimateCloneTokens(req.text) })
      child!.stdin.write(
        JSON.stringify({
          id,
          cmd: 'clone',
          reference: voice.sampleFile,
          text: req.text,
          language: req.language || voice.language || 'es',
          output,
        }) + '\n',
      )
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

// A short, fixed phrase per language, used to generate a reusable voice sample.
const PREVIEW_TEXT: Record<string, string> = {
  es: 'Hola, esta es mi voz clonada. Así sonará en tus vídeos.',
  en: 'Hi, this is my cloned voice. This is how it will sound in your videos.',
  pt: 'Olá, esta é a minha voz clonada. É assim que vai soar nos teus vídeos.',
  fr: 'Bonjour, voici ma voix clonée. Voilà comment elle sonnera dans vos vidéos.',
  de: 'Hallo, das ist meine geklonte Stimme. So klingt sie in deinen Videos.',
  it: 'Ciao, questa è la mia voce clonata. Ecco come suonerà nei tuoi video.',
}

// Don't generate the same voice's preview twice at once (creation + manual click).
const previewInFlight = new Map<string, Promise<CloneResult>>()

/**
 * Return a cached preview clip for a cloned voice — generating + persisting it
 * once (a fixed phrase synthesized in that voice) if it doesn't exist yet. Lets
 * the UI replay an instant sample on later selections without re-running the model.
 */
export async function ensureClonePreview(
  voiceId: string,
  opts?: { onProgress?: (p: CloneProgress) => void },
): Promise<CloneResult> {
  const voice = readIndex().find((v) => v.id === voiceId)
  if (!voice) return { ok: false, error: 'clone.voiceNotFound' }
  if (voice.previewFile && existsSync(voice.previewFile)) {
    return { ok: true, outputPath: voice.previewFile }
  }
  const existing = previewInFlight.get(voiceId)
  if (existing) return existing

  const run = (async (): Promise<CloneResult> => {
    const lang = voice.language || 'es'
    const text = PREVIEW_TEXT[lang] || PREVIEW_TEXT.es
    const res = await cloneSynthesize({ voiceId, text, language: lang }, opts)
    if (!res.ok || !res.outputPath) return res
    // Persist the clip in the library so it survives restarts + voice reuse.
    const dest = join(libDir(), `${voiceId}-preview.wav`)
    try {
      copyFileSync(res.outputPath, dest)
    } catch {
      return { ok: false, error: 'clone.synthFailed' }
    }
    const list = readIndex()
    const v = list.find((x) => x.id === voiceId)
    if (v) {
      v.previewFile = dest
      writeIndex(list)
    }
    return { ok: true, outputPath: dest }
  })()
  previewInFlight.set(voiceId, run)
  try {
    return await run
  } finally {
    previewInFlight.delete(voiceId)
  }
}

/** Stop an in-progress clone immediately. The sidecar blocks inside the model
 *  download / torch load, so a soft child.kill() is IGNORED (Stop would hang) — we
 *  must detach the pipes and FORCE-kill the whole process tree (PyInstaller
 *  bootloader + any torch / download workers). proc.on('exit') then resolves the
 *  pending synth as { canceled: true } and the modal closes.
 *  No-op when the engine is warm but idle (no pending generation) — so an export
 *  Cancel on a non-clone job doesn't needlessly tear down a reusable engine. */
export function cancelClone(): void {
  if (!child || pending.size === 0) return
  canceledByUser = true
  const pid = child.pid
  try {
    child.stdout?.destroy()
    child.stderr?.destroy()
    child.stdin?.destroy()
  } catch {
    /* best effort */
  }
  try {
    if (process.platform === 'win32' && pid) {
      // /T kills the tree, /F forces it — non-blocking so the UI stays responsive.
      spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
    } else {
      child.kill('SIGKILL')
    }
  } catch {
    /* best effort */
  }
}

/**
 * Terminate the engine (call on quit). FORCE-kills the whole sidecar process
 * tree and detaches its stdio. A soft kill can be ignored by a sidecar that's
 * mid-model-load, leaving it alive — which (a) keeps the main process's event
 * loop alive via the open stdout pipe, so the app becomes a zombie still holding
 * the single-instance lock (breaking the update relaunch → "nothing opens"), and
 * (b) locks files in the install dir, hanging the NSIS uninstaller on reinstall.
 */
export function cleanupClone(): void {
  if (!child) return
  const pid = child.pid
  try {
    child.stdout?.destroy()
    child.stderr?.destroy()
    child.stdin?.destroy()
  } catch {
    /* ignore */
  }
  try {
    if (process.platform === 'win32' && pid) {
      // /T kills the tree (PyInstaller bootloader + any torch workers); /F forces it.
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: 4000 })
    } else {
      child.kill('SIGKILL')
    }
  } catch {
    /* best effort */
  }
  child = null
}
