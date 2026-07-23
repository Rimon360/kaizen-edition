// ----------------------------------------------------------------------------
// Shared IPC payload types (Electron main + preload side).
// Kept in sync with src/types/index.ts — this is the cross-process contract.
// ----------------------------------------------------------------------------

export type SubtitlePosition = 'top' | 'upperMiddle' | 'middle' | 'lowerMiddle' | 'bottom'
export type VideoFormat = 'vertical' | 'horizontal'
export type ExportFormat = 'mp4' | 'wav'

export interface SubtitleConfig {
  enabled: boolean
  position: SubtitlePosition
  fontSize: number
  fontFamily: string
  color: string
  backgroundColor: string
  backgroundEnabled: boolean
  stroke: boolean
  strokeColor: string
  strokeWidth: number
  /** Neon glow radius (0/undefined = none) — ASS \blur in the strokeColor. */
  glow?: number
  /** Karaoke word highlight: a colored rounded "pill" behind the word being spoken. */
  wordHighlightEnabled: boolean
  /** Pill background color (#RRGGBB). */
  wordHighlightColor: string
  /** Pill corner radius in video px. */
  wordHighlightRadius: number
  /** Karaoke display: 'line' = phrase block (1–3 lines); 'word' = one word at a time. */
  wordHighlightMode: 'line' | 'word'
}

export interface ExtrasConfig {
  voiceOver: boolean
  soundEffects: boolean
  normalizeAudio: boolean
}

export interface VoiceSettings {
  voiceId: string | null
  rate: number
  pitch: number
  volume: number
}

/**
 * Persisted editor preferences ("remember my settings") — the style/voice
 * configuration restored on the next launch. Deliberately EXCLUDES per-job
 * content (queued clips, narration text, uploaded voice-over / music paths);
 * those belong to a saved Project, not to durable preferences. `template` is
 * stored loosely as a string; the renderer validates it against the known
 * templates on restore so an old/removed id can't break hydration.
 */
export interface EditorPreferences {
  subtitle: SubtitleConfig
  format: VideoFormat
  extras: ExtrasConfig
  template: string
  voice: VoiceSettings
  /** Restorable work-in-progress so an accidental close/reload doesn't lose the
   *  narration script or the transcript (cleared by New Project). */
  work?: {
    voiceText?: string
    transcriptText?: string | null
    transcriptSegments?: Segment[] | null
    voiceOverFile?: string | null
  }
}

/** A timed caption segment (start/end in seconds) — from speech-to-text. */
export interface Segment {
  start: number
  end: number
  text: string
  /** Real per-word timings (from Whisper word-level timestamps), when available —
   *  used for exact karaoke sync. Absent → word timing is estimated from the phrase. */
  words?: { start: number; end: number; text: string }[]
}

export interface RenderRequest {
  clips: string[]
  format: VideoFormat
  exportFormat: ExportFormat
  outputPath: string
  narrationPath?: string | null
  /** Background music / sound-effects track mixed under the audio. */
  musicPath?: string | null
  /** When `segments` is present, captions are burned with those real timestamps
   *  (from transcription); otherwise `text` is split evenly across the duration. */
  subtitle?: { text: string; config: SubtitleConfig; segments?: Segment[] } | null
  normalizeAudio: boolean
}

// --- Voice cloning (offline Chatterbox sidecar) ----------------------------

/** A locally-saved cloned voice the user can reuse. The reference sample is
 *  normalized to 24 kHz mono WAV and stored in userData/cloned-voices/. */
export interface CloneVoice {
  id: string
  name: string
  createdAt: number
  /** Default synthesis language for this voice (ISO 639-1, e.g. 'es'). */
  language: string
  /** Absolute path to the stored, normalized reference WAV. */
  sampleFile: string
  durationSec?: number
  /** Cached preview clip (a fixed phrase synthesized once) so selecting this
   *  voice plays an instant sample without re-running the model. */
  previewFile?: string
}

/** Whether the cloning engine can run on this machine/build. */
export interface CloneEngineStatus {
  available: boolean
  mode: 'packaged' | 'dev' | 'none'
  /** Human-readable reason when unavailable (shown as setup guidance). */
  reason?: string
}

export interface CloneSynthRequest {
  voiceId: string
  text: string
  language?: string
}

export interface CloneProgress {
  // 'done' is synthesized by the renderer to fill the bar to 100% before closing.
  phase: 'starting' | 'loading' | 'generating' | 'saving' | 'done'
  message?: string
  /** Real 0-100 progress during generation (parsed from the model's sampling steps). */
  percent?: number
  /** Estimated seconds remaining for the current phase. */
  etaSec?: number
}

export interface CloneResult {
  ok: boolean
  outputPath?: string
  error?: string
  canceled?: boolean
}

/** Status of the (separately-downloaded) voice-cloning model. */
export interface ModelStatus {
  installed: boolean
  dir: string
  totalBytes: number
}

/** Progress of the first-run model download. */
export interface ModelProgress {
  receivedBytes: number
  totalBytes: number
  currentFile?: string
}

export interface ModelResult {
  ok: boolean
  error?: string
  canceled?: boolean
}

/** Speech-to-text result (Whisper transcription of an audio file). */
export interface TranscribeResult {
  ok: boolean
  text?: string
  segments?: Segment[]
  error?: string
  /** True when the user stopped the transcription (no error toast should show). */
  canceled?: boolean
}

/** Progress while transcribing — download → model load → inference. */
export interface TranscribeProgress {
  phase: 'downloading' | 'loading' | 'transcribing'
  percent: number
  file?: string
  /** Audio length (s), sent once when inference starts so the UI can size its
   *  time-based progress estimate (the worker can't report mid-inference). */
  durationSec?: number
  /** Streaming partial transcript decoded mid-inference (live preview). When set,
   *  this is a text-only update — phase/percent are unchanged. */
  partialText?: string
  /** Estimated seconds remaining. */
  etaSec?: number
}

export interface RenderProgress {
  jobId: string
  percent: number
  stage: string
  /** Estimated seconds remaining (from ffmpeg's encode speed). */
  etaSec?: number
}

export interface RenderResult {
  jobId: string
  ok: boolean
  outputPath?: string
  error?: string
  canceled?: boolean
}

export interface TtsRequest {
  text: string
  voiceId: string
  rate: number
  pitch: number
  volume: number
  outputPath?: string
}

export interface TtsResult {
  ok: boolean
  outputPath?: string
  error?: string
}

export interface Voice {
  id: string
  name: string
  culture: string
  gender: string
  source: 'local' | 'backend' | 'azure'
}

export type TtsProvider = 'local' | 'azure'

export interface ProbeResult {
  duration: number | null
  width: number | null
  height: number | null
  thumbnail: string | null
  error?: string
}

export type ThemeMode = 'dark' | 'light' | 'system'

export interface AppSettings {
  backendUrl: string
  apiKey: string | null
  language: 'es' | 'en'
  theme: ThemeMode
  exportFolder: string | null
  /** Voice engine: 'local' = Windows SAPI (default, offline), 'azure' = Azure Speech. */
  ttsProvider: TtsProvider
  azureKey: string | null
  azureRegion: string | null
  /** Transcription model tier: fast=whisper-base, accurate=small, best=medium. */
  transcribeModel: 'fast' | 'accurate' | 'best'
  /** Transcription language: 'auto'-detect, or force 'es'/'en' for better accuracy. */
  transcribeLanguage: 'auto' | 'es' | 'en'
  /** Translate the transcript to English (Whisper's native task='translate', which
   *  targets English only). With a non-English source it yields English subtitles. */
  translateToEnglish: boolean
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'none'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  version?: string
  percent?: number
  message?: string
}

/** IPC channel names — single source of truth for both sides. */
export const IPC = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizeChange: 'window:maximize-change',

  tokenGet: 'token:get',
  tokenSet: 'token:set',
  tokenClear: 'token:clear',

  dialogOpenVideos: 'dialog:open-videos',
  dialogOpenAudio: 'dialog:open-audio',
  dialogSaveOutput: 'dialog:save-output',
  dialogOpenDirectory: 'dialog:open-directory',

  ttsListVoices: 'tts:list-voices',
  ttsSynthesize: 'tts:synthesize',
  ttsReadAudio: 'tts:read-audio',

  sttTranscribe: 'stt:transcribe',
  sttProgress: 'stt:progress',
  sttCancel: 'stt:cancel',

  cloneStatus: 'clone:status',
  cloneList: 'clone:list',
  cloneAdd: 'clone:add',
  cloneRemove: 'clone:remove',
  cloneRename: 'clone:rename',
  cloneSynth: 'clone:synth',
  clonePreview: 'clone:preview',
  cloneProgress: 'clone:progress',
  cloneCancel: 'clone:cancel',
  cloneModelStatus: 'clone:model:status',
  cloneModelDownload: 'clone:model:download',
  cloneModelProgress: 'clone:model:progress',
  cloneModelCancel: 'clone:model:cancel',
  cloneModelClear: 'clone:model:clear',

  ffmpegProbe: 'ffmpeg:probe',
  ffmpegRender: 'ffmpeg:render',
  ffmpegCancel: 'ffmpeg:cancel',
  ffmpegProgress: 'ffmpeg:progress',
  ffmpegLog: 'ffmpeg:log',

  projectSave: 'project:save',
  projectOpen: 'project:open',

  settingsGetAll: 'settings:get-all',
  settingsSet: 'settings:set',

  prefsGetAll: 'prefs:get-all',
  prefsSet: 'prefs:set',

  updaterCheck: 'updater:check',
  updaterInstall: 'updater:install',
  updaterGetState: 'updater:get-state',
  updaterStatus: 'updater:status',

  shellOpenPath: 'shell:open-path',
  shellShowInFolder: 'shell:show-in-folder',
  shellOpenExternal: 'shell:open-external',
} as const
