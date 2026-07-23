// ----------------------------------------------------------------------------
// KAIZEN EDITION — shared domain types (renderer side)
// ----------------------------------------------------------------------------

// --- Auth ------------------------------------------------------------------

export type UserRole =
  | 'admin'
  | 'manager'
  | 'appcbl_soft'
  | 'specific'
  | 'all_profile'
  | 'member'

/** Roles permitted to use the desktop software (mirrors backend `SOFTWARE_ROLES`). */
export const SOFTWARE_ROLES: UserRole[] = [
  'appcbl_soft',
  'admin',
  'specific',
  'all_profile',
  'manager',
]

export interface User {
  _id: string
  email: string
  username?: string
  role: UserRole
  email_verified?: boolean
  expiration?: number | string | boolean
  client?: string
  sessionId?: string
}

export interface LoginResponse {
  token: string
}

export interface RegisterResponse {
  message: string
  token: string
  user: User
}

export interface VerifyTokenResponse {
  message: string
  user: User
}

// --- Subtitle / format configuration --------------------------------------

export type SubtitlePosition = 'top' | 'upperMiddle' | 'middle' | 'lowerMiddle' | 'bottom'
export type VideoFormat = 'vertical' | 'horizontal'

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
  /** Neon glow radius (0/undefined = none). Renders as an ASS \blur + CSS text-shadow
   *  in the strokeColor — powers the futuristic subtitle styles. */
  glow?: number
  /** Karaoke word highlight: a colored rounded "pill" behind the word currently
   *  being spoken, synced to per-word transcript timing. */
  wordHighlightEnabled: boolean
  /** Pill background color (#RRGGBB). */
  wordHighlightColor: string
  /** Pill corner radius in video px (the preview scales it to its size). */
  wordHighlightRadius: number
  /** Karaoke display: 'line' = a phrase block (1–3 lines, current word pilled);
   *  'word' = one word at a time, centered. */
  wordHighlightMode: 'line' | 'word'
}

export interface ExtrasConfig {
  voiceOver: boolean
  soundEffects: boolean
  normalizeAudio: boolean
}

export interface EditConfig {
  subtitle: SubtitleConfig
  format: VideoFormat
  extras: ExtrasConfig
  /** Path to a user-uploaded voice-over audio file (mp3/wav/m4a/…), if any. */
  voiceOverFile: string | null
  /** Path to a user-uploaded background music / sound-effects track, if any. */
  musicFile: string | null
}

export type EditTemplate =
  | 'motivational'
  | 'youtuber'
  | 'fastMotion'
  | 'entertainment'
  | 'education'
  | 'cinematic'
  | 'vlog'
  | 'musicVideo'
  | 'gaming'
  | 'documentary'
  | 'dynamicVertical'
  | 'narrativeVertical'
  | 'proHorizontal'
  | 'extendedHorizontal'

// --- Video queue -----------------------------------------------------------

export interface QueueItem {
  id: string
  path: string
  name: string
  /** Duration in seconds (probed via ffprobe). */
  duration: number | null
  /** Local file path or data URL for the thumbnail image. */
  thumbnail: string | null
  width?: number | null
  height?: number | null
  status: 'idle' | 'probing' | 'ready' | 'error'
  error?: string
}

// --- Voice / TTS -----------------------------------------------------------

export interface Voice {
  /** Stable identifier used to select the voice (SAPI name or Azure ShortName). */
  id: string
  name: string
  culture: string
  gender: 'Male' | 'Female' | 'Neutral' | string
  /** 'local' = Windows SAPI, 'azure' = Azure Speech, 'backend' = remote TTS. */
  source: 'local' | 'backend' | 'azure'
}

export type TtsProvider = 'local' | 'azure'

// --- Voice cloning (offline Chatterbox) ------------------------------------

/** A locally-saved cloned voice the user can reuse for future synthesis. */
export interface CloneVoice {
  id: string
  name: string
  createdAt: number
  language: string
  sampleFile: string
  durationSec?: number
  /** Cached preview clip for instant playback when this voice is selected. */
  previewFile?: string
}

export interface CloneEngineStatus {
  available: boolean
  mode: 'packaged' | 'dev' | 'none'
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
  /** Real 0-100 progress during generation (from the model's sampling steps). */
  percent?: number
  /** Estimated seconds remaining. */
  etaSec?: number
}

export interface CloneResult {
  ok: boolean
  outputPath?: string
  error?: string
  canceled?: boolean
}

/** Status of the separately-downloaded voice-cloning model. */
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

export interface VoiceSettings {
  voiceId: string | null
  /** Speaking rate, SAPI range -10..10 (UI maps 0.5x..2x → this). */
  rate: number
  /** Pitch as a percentage offset for SSML <prosody>, -50..50. */
  pitch: number
  /** Volume 0..100. */
  volume: number
}

// --- Rendering -------------------------------------------------------------

export type ExportFormat = 'mp4' | 'wav'

/** A timed caption segment (start/end in seconds) — from speech-to-text. */
export interface Segment {
  start: number
  end: number
  text: string
  /** Real per-word timings (Whisper word-level timestamps), when available — used for
   *  exact karaoke sync. Absent → word timing is estimated from the phrase. */
  words?: { start: number; end: number; text: string }[]
}

export interface RenderRequest {
  clips: string[]
  format: VideoFormat
  exportFormat: ExportFormat
  outputPath: string
  /** Path to a narration WAV to mux as the audio track. */
  narrationPath?: string | null
  /** Path to a background music / sound-effects track, mixed under the audio. */
  musicPath?: string | null
  /** Subtitle text + styling — burned in when provided & enabled. When `segments`
   *  is present, captions use those real timestamps (from transcription). */
  subtitle?: {
    text: string
    config: SubtitleConfig
    segments?: Segment[]
  } | null
  normalizeAudio: boolean
}

/** Speech-to-text result (Whisper transcription of uploaded audio). */
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
  /** Optional explicit output path; defaults to a temp WAV. */
  outputPath?: string
}

export interface TtsResult {
  ok: boolean
  outputPath?: string
  error?: string
}

// --- Project & settings ----------------------------------------------------

export interface Project {
  version: 1
  name: string
  createdAt: number
  updatedAt: number
  config: EditConfig
  template: EditTemplate
  queue: Array<Pick<QueueItem, 'path' | 'name'>>
  voiceText: string
  voiceSettings: VoiceSettings
}

/**
 * Persisted editor preferences ("remember my settings") — the style/voice
 * configuration restored on the next launch. Excludes per-job content (queued
 * clips, narration text, uploaded file paths), which belongs to a saved Project.
 */
export interface EditorPreferences {
  subtitle: SubtitleConfig
  format: VideoFormat
  extras: ExtrasConfig
  template: EditTemplate
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

export type ThemeMode = 'dark' | 'light' | 'system'

export interface AppSettings {
  /** Baked-in default backend URL (overridden by the API key's url). Not shown in the UI. */
  backendUrl: string
  /** Encoded connection key (url + secrets + client) entered by the operator. */
  apiKey: string | null
  /** UI language. */
  language: 'es' | 'en'
  theme: ThemeMode
  exportFolder: string | null
  /** Voice engine: 'local' = Windows SAPI (default, offline), 'azure' = Azure Speech. */
  ttsProvider: TtsProvider
  azureKey: string | null
  azureRegion: string | null
  /** Transcription model tier: fast=whisper-base, accurate=small, best=medium. */
  transcribeModel: TranscribeModel
  /** Transcription language: 'auto'-detect, or force 'es'/'en' for better accuracy. */
  transcribeLanguage: TranscribeLanguage
  /** Translate the transcript to English (Whisper's native task='translate', which
   *  targets English only). With a non-English source it yields English subtitles. */
  translateToEnglish: boolean
}

export type TranscribeModel = 'fast' | 'accurate' | 'best'
export type TranscribeLanguage = 'auto' | 'es' | 'en'

// --- Updater ---------------------------------------------------------------

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
