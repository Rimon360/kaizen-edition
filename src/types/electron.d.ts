import type {
  AppSettings,
  CloneEngineStatus,
  CloneProgress,
  CloneResult,
  CloneSynthRequest,
  CloneVoice,
  ModelStatus,
  ModelProgress,
  ModelResult,
  EditorPreferences,
  Project,
  RenderProgress,
  RenderRequest,
  RenderResult,
  TranscribeProgress,
  TranscribeResult,
  TtsRequest,
  TtsResult,
  UpdateState,
  Voice,
} from './index'

export interface ProbeResult {
  duration: number | null
  width: number | null
  height: number | null
  thumbnail: string | null
  error?: string
}

export interface DialogFileResult {
  canceled: boolean
  paths: string[]
}

export interface DialogSaveResult {
  canceled: boolean
  path: string | null
}

export interface ProjectFileResult {
  canceled: boolean
  path: string | null
  project: Project | null
}

/** Surface exposed by the preload bridge as `window.api`. */
export interface KaizenApi {
  platform: NodeJS.Platform
  isElectron: true

  getPathForFile: (file: File) => string

  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (cb: (isMax: boolean) => void) => () => void
  }

  dialog: {
    openVideos: () => Promise<DialogFileResult>
    openAudio: () => Promise<DialogFileResult>
    saveOutput: (defaultName: string, ext: 'mp4' | 'wav') => Promise<DialogSaveResult>
    openDirectory: () => Promise<DialogFileResult>
  }

  tts: {
    listVoices: () => Promise<Voice[]>
    synthesize: (req: TtsRequest) => Promise<TtsResult>
    /** Read a synthesized audio file's raw bytes (for blob-URL playback). */
    readAudio: (path: string) => Promise<Uint8Array>
  }

  stt: {
    /** Transcribe an audio file to text + timed caption segments (offline Whisper). */
    transcribe: (audioPath: string) => Promise<TranscribeResult>
    /** Stop an in-progress transcription. */
    cancel: () => void
    onProgress: (cb: (p: TranscribeProgress) => void) => () => void
  }

  clone: {
    /** Is the cloning engine runnable on this build/machine? */
    status: () => Promise<CloneEngineStatus>
    /** List locally-saved cloned voices. */
    list: () => Promise<CloneVoice[]>
    /** Save a new cloned voice from a reference sample (normalized + stored). */
    add: (samplePath: string, name: string, language: string) => Promise<CloneVoice>
    remove: (id: string) => Promise<CloneVoice[]>
    rename: (id: string, name: string) => Promise<CloneVoice[]>
    /** Synthesize text in a saved cloned voice → output WAV path. */
    synthesize: (req: CloneSynthRequest) => Promise<CloneResult>
    /** Get (generating + caching once) a reusable preview clip for a voice. */
    preview: (voiceId: string) => Promise<CloneResult>
    cancel: () => void
    onProgress: (cb: (p: CloneProgress) => void) => () => void
    /** First-run download of the ~3 GB model (not bundled in the installer). */
    model: {
      status: () => Promise<ModelStatus>
      download: () => Promise<ModelResult>
      cancel: () => void
      /** Wipe the downloaded model so it can be re-fetched (repair corruption). */
      clear: () => Promise<void>
      onProgress: (cb: (p: ModelProgress) => void) => () => void
    }
  }

  ffmpeg: {
    probe: (filePath: string) => Promise<ProbeResult>
    render: (jobId: string, req: RenderRequest) => Promise<RenderResult>
    cancel: (jobId: string) => void
    onProgress: (cb: (p: RenderProgress) => void) => () => void
    onLog: (cb: (line: string) => void) => () => void
  }

  project: {
    save: (project: Project, path?: string | null) => Promise<DialogSaveResult>
    open: () => Promise<ProjectFileResult>
  }

  settings: {
    getAll: () => Promise<AppSettings>
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>
  }

  prefs: {
    /** Read the remembered editor preferences, or null if none saved yet. */
    getAll: () => Promise<EditorPreferences | null>
    /** Persist the full editor preference snapshot. */
    set: (prefs: EditorPreferences) => Promise<EditorPreferences>
  }

  updater: {
    check: () => void
    install: () => void
    getState: () => Promise<UpdateState>
    onStatus: (cb: (s: UpdateState) => void) => () => void
  }

  shell: {
    openPath: (path: string) => Promise<void>
    showInFolder: (path: string) => void
    /** Open an http(s) URL in the user's default browser. */
    openExternal: (url: string) => void
    /** Resolve a local file path to a `media://` URL the renderer can load. */
    toMediaUrl: (path: string) => string
  }
}

/** Encrypted token bridge exposed as `window.auth`. */
export interface AuthBridge {
  getToken: () => Promise<string | null>
  setToken: (token: string) => Promise<void>
  clearToken: () => Promise<void>
}

declare global {
  interface Window {
    api?: KaizenApi
    auth?: AuthBridge
  }
  /** App version injected at build time from package.json (see electron.vite.config.ts). */
  const __APP_VERSION__: string
}

export {}
