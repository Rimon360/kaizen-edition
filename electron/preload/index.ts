import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { Buffer } from 'node:buffer'
import { IPC } from '../shared/types'
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
  RenderProgress,
  RenderRequest,
  TranscribeProgress,
  TtsRequest,
  UpdateState,
} from '../shared/types'

/** Subscribe to an IPC event and return an unsubscribe fn. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  platform: process.platform,
  isElectron: true as const,

  /** Resolve the absolute path of a dropped File (Electron 32+ removed File.path). */
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized) as Promise<boolean>,
    onMaximizeChange: (cb: (isMax: boolean) => void) => on<boolean>(IPC.windowMaximizeChange, cb),
  },

  dialog: {
    openVideos: () => ipcRenderer.invoke(IPC.dialogOpenVideos),
    openAudio: () => ipcRenderer.invoke(IPC.dialogOpenAudio),
    openDirectory: () => ipcRenderer.invoke(IPC.dialogOpenDirectory),
    saveOutput: (defaultName: string, ext: 'mp4' | 'wav') =>
      ipcRenderer.invoke(IPC.dialogSaveOutput, defaultName, ext),
  },

  tts: {
    listVoices: () => ipcRenderer.invoke(IPC.ttsListVoices),
    synthesize: (req: TtsRequest) => ipcRenderer.invoke(IPC.ttsSynthesize, req),
    readAudio: (path: string) => ipcRenderer.invoke(IPC.ttsReadAudio, path) as Promise<Uint8Array>,
  },

  stt: {
    /** Transcribe an audio file to text + timed caption segments (offline Whisper). */
    transcribe: (audioPath: string) => ipcRenderer.invoke(IPC.sttTranscribe, audioPath),
    /** Stop an in-progress transcription. */
    cancel: () => ipcRenderer.send(IPC.sttCancel),
    onProgress: (cb: (p: TranscribeProgress) => void) =>
      on<TranscribeProgress>(IPC.sttProgress, cb),
  },

  clone: {
    status: () => ipcRenderer.invoke(IPC.cloneStatus) as Promise<CloneEngineStatus>,
    list: () => ipcRenderer.invoke(IPC.cloneList) as Promise<CloneVoice[]>,
    add: (samplePath: string, name: string, language: string) =>
      ipcRenderer.invoke(IPC.cloneAdd, samplePath, name, language) as Promise<CloneVoice>,
    remove: (id: string) => ipcRenderer.invoke(IPC.cloneRemove, id) as Promise<CloneVoice[]>,
    rename: (id: string, name: string) =>
      ipcRenderer.invoke(IPC.cloneRename, id, name) as Promise<CloneVoice[]>,
    synthesize: (req: CloneSynthRequest) =>
      ipcRenderer.invoke(IPC.cloneSynth, req) as Promise<CloneResult>,
    preview: (voiceId: string) =>
      ipcRenderer.invoke(IPC.clonePreview, voiceId) as Promise<CloneResult>,
    cancel: () => ipcRenderer.send(IPC.cloneCancel),
    onProgress: (cb: (p: CloneProgress) => void) => on<CloneProgress>(IPC.cloneProgress, cb),
    // First-run download of the ~3 GB model (not shipped in the installer).
    model: {
      status: () => ipcRenderer.invoke(IPC.cloneModelStatus) as Promise<ModelStatus>,
      download: () => ipcRenderer.invoke(IPC.cloneModelDownload) as Promise<ModelResult>,
      cancel: () => ipcRenderer.send(IPC.cloneModelCancel),
      clear: () => ipcRenderer.invoke(IPC.cloneModelClear) as Promise<void>,
      onProgress: (cb: (p: ModelProgress) => void) =>
        on<ModelProgress>(IPC.cloneModelProgress, cb),
    },
  },

  ffmpeg: {
    probe: (filePath: string) => ipcRenderer.invoke(IPC.ffmpegProbe, filePath),
    render: (jobId: string, req: RenderRequest) => ipcRenderer.invoke(IPC.ffmpegRender, jobId, req),
    cancel: (jobId: string) => ipcRenderer.send(IPC.ffmpegCancel, jobId),
    onProgress: (cb: (p: RenderProgress) => void) => on<RenderProgress>(IPC.ffmpegProgress, cb),
    onLog: (cb: (line: string) => void) => on<string>(IPC.ffmpegLog, cb),
  },

  project: {
    save: (project: unknown, path?: string | null) =>
      ipcRenderer.invoke(IPC.projectSave, project, path),
    open: () => ipcRenderer.invoke(IPC.projectOpen),
  },

  settings: {
    getAll: () => ipcRenderer.invoke(IPC.settingsGetAll) as Promise<AppSettings>,
    set: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settingsSet, patch),
  },

  prefs: {
    getAll: () => ipcRenderer.invoke(IPC.prefsGetAll) as Promise<EditorPreferences | null>,
    set: (prefs: EditorPreferences) =>
      ipcRenderer.invoke(IPC.prefsSet, prefs) as Promise<EditorPreferences>,
  },

  updater: {
    check: () => ipcRenderer.send(IPC.updaterCheck),
    install: () => ipcRenderer.send(IPC.updaterInstall),
    getState: () => ipcRenderer.invoke(IPC.updaterGetState) as Promise<UpdateState>,
    onStatus: (cb: (s: UpdateState) => void) => on<UpdateState>(IPC.updaterStatus, cb),
  },

  shell: {
    openPath: (p: string) => ipcRenderer.invoke(IPC.shellOpenPath, p),
    showInFolder: (p: string) => ipcRenderer.send(IPC.shellShowInFolder, p),
    openExternal: (url: string) => ipcRenderer.send(IPC.shellOpenExternal, url),
    toMediaUrl: (p: string) => `media://f/${Buffer.from(p, 'utf8').toString('base64url')}`,
  },
}

const auth = {
  getToken: () => ipcRenderer.invoke(IPC.tokenGet) as Promise<string | null>,
  setToken: (token: string) => ipcRenderer.invoke(IPC.tokenSet, token) as Promise<void>,
  clearToken: () => ipcRenderer.invoke(IPC.tokenClear) as Promise<void>,
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('auth', auth)
