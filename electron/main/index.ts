import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  IPC,
  type AppSettings,
  type CloneSynthRequest,
  type EditorPreferences,
  type RenderRequest,
  type TtsRequest,
} from '../shared/types'
import { clearToken, loadToken, saveToken } from './tokenStore'
import { getSettings, setSettings } from './settingsStore'
import { getPrefs, setPrefs } from './prefsStore'
import { cancelRender, cleanupTempDir, probe, render } from './ffmpeg'
import { transcribe, cancelTranscribe, cleanupWhisper } from './whisper'
import {
  listCloneVoices,
  addCloneVoice,
  removeCloneVoice,
  renameCloneVoice,
  cloneEngineStatus,
  cloneSynthesize,
  ensureClonePreview,
  cancelClone,
  cleanupClone,
  modelAvailable,
} from './voiceClone'
import { modelStatus, downloadModel, cancelModelDownload, clearModel } from './modelDownload'
import { cleanupTtsTemp, listVoices, synthesize } from './tts'
import { cleanupAzureTemp, listAzureVoices, synthesizeAzure } from './azureTts'
import { openAudio, openDirectory, openVideos, saveOutput } from './dialogs'
import { openProject, saveProject } from './projects'
import { checkForUpdates, getUpdateState, installUpdate, setupAutoUpdates } from './updater'
import { handleMediaProtocol, registerMediaScheme } from './mediaProtocol'

// `media://` must be registered as privileged before the app is ready.
registerMediaScheme()

// Match the installer's AppUserModelID (electron-builder derives it from appId) so
// Windows ties the running app to its Start-Menu/taskbar shortcut and pin/relaunch.
if (process.platform === 'win32') app.setAppUserModelId('com.kaizen.edition')

let mainWindow: BrowserWindow | null = null

/**
 * The packaged renderer loads via file://, so Chromium sends `Origin: null` on
 * cross-origin API calls — which the backend's origin guard rejects (403
 * "origen no permitido"). The backend treats requests with NO Origin as a
 * trusted non-browser client, so we strip the opaque `null` / `file://` Origin
 * to let production login work. http(s) origins (dev localhost) pass through
 * untouched. Verified against the live backend in qa/auth-test.mjs.
 */
function neutralizeOpaqueOrigin(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const h = details.requestHeaders
    const origin = h['Origin'] ?? h['origin']
    if (origin === 'null' || (typeof origin === 'string' && origin.startsWith('file://'))) {
      delete h['Origin']
      delete h['origin']
    }
    callback({ requestHeaders: h })
  })
}

function createWindow(): void {
  // On Windows, use a hidden title bar with the NATIVE window-controls overlay so
  // minimize/maximize/close are drawn by the OS — always visible and functional even
  // if the web UI is black/crashed (fixes "first run shows a black screen, no way to
  // close"). macOS traffic-lights would overlap our left-aligned logo and Linux has
  // no overlay support, so those stay fully frameless + use the custom React buttons.
  const winControls =
    process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { color: '#0c1019', symbolColor: '#e8ecf4', height: 44 },
        }
      : { frame: false }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    show: false,
    ...winControls,
    backgroundColor: '#0a0e17',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: !app.isPackaged,
    },
  })

  // A minimal native menu guarantees OS-level accelerators exist INDEPENDENT of the
  // React renderer — so even if the web layer is black/crashed (the "no way to close"
  // bug), the user can always minimize (Ctrl+M), reload to recover (Ctrl+R), or quit
  // (Ctrl+Q, plus Alt+F4). The bar stays hidden (autoHideMenuBar); Alt reveals it.
  // editMenu keeps the standard cut/copy/paste/select-all accelerators in text fields.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'KAIZEN',
        submenu: [
          { role: 'minimize', accelerator: 'CmdOrCtrl+M' },
          {
            label: 'Toggle Full Screen',
            accelerator: 'F11',
            click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()),
          },
          { type: 'separator' },
          { role: 'reload', accelerator: 'CmdOrCtrl+R' },
          { role: 'forceReload' },
          { type: 'separator' },
          { role: 'quit', accelerator: 'CmdOrCtrl+Q' },
        ],
      },
      { role: 'editMenu' },
    ]),
  )

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  mainWindow.on('maximize', () => mainWindow?.webContents.send(IPC.windowMaximizeChange, true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send(IPC.windowMaximizeChange, false))

  // External links open in the user's browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  // --- Window controls ---
  ipcMain.on(IPC.windowMinimize, () => mainWindow?.minimize())
  ipcMain.on(IPC.windowToggleMaximize, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on(IPC.windowClose, () => mainWindow?.close())
  ipcMain.handle(IPC.windowIsMaximized, () => mainWindow?.isMaximized() ?? false)

  // --- Secure token storage ---
  ipcMain.handle(IPC.tokenGet, () => loadToken())
  ipcMain.handle(IPC.tokenSet, (_e, token: string) => saveToken(token))
  ipcMain.handle(IPC.tokenClear, () => clearToken())

  // --- Dialogs ---
  ipcMain.handle(IPC.dialogOpenVideos, () => openVideos(mainWindow))
  ipcMain.handle(IPC.dialogOpenAudio, () => openAudio(mainWindow))
  ipcMain.handle(IPC.dialogOpenDirectory, () => openDirectory(mainWindow))
  ipcMain.handle(IPC.dialogSaveOutput, (_e, name: string, ext: 'mp4' | 'wav') =>
    saveOutput(mainWindow, name, ext),
  )

  // --- TTS — routed by the selected provider (local Windows SAPI / Azure) ---
  ipcMain.handle(IPC.ttsListVoices, () => {
    const s = getSettings()
    if (s.ttsProvider === 'azure' && s.azureKey && s.azureRegion) {
      return listAzureVoices(s.azureRegion, s.azureKey)
    }
    return listVoices()
  })
  ipcMain.handle(IPC.ttsSynthesize, (_e, req: TtsRequest) => {
    const s = getSettings()
    if (s.ttsProvider === 'azure' && s.azureKey && s.azureRegion) {
      return synthesizeAzure(req, s.azureRegion, s.azureKey)
    }
    return synthesize(req)
  })
  // Return raw audio bytes so the renderer can play a synthesized clip from an
  // in-memory blob URL (bulletproof — never hits the media:// loader).
  ipcMain.handle(IPC.ttsReadAudio, (_e, path: string) => readFileSync(path))

  // --- Speech-to-text (offline Whisper) — transcribe uploaded audio to captions ---
  ipcMain.handle(IPC.sttTranscribe, (_e, audioPath: string) =>
    transcribe(audioPath, {
      onProgress: (p) => mainWindow?.webContents.send(IPC.sttProgress, p),
    }),
  )
  ipcMain.on(IPC.sttCancel, () => cancelTranscribe())

  // --- Voice cloning (offline Chatterbox sidecar) ---
  ipcMain.handle(IPC.cloneStatus, () => cloneEngineStatus())
  ipcMain.handle(IPC.cloneList, () => listCloneVoices())
  ipcMain.handle(IPC.cloneAdd, (_e, samplePath: string, name: string, language: string) =>
    addCloneVoice(samplePath, name, language),
  )
  ipcMain.handle(IPC.cloneRemove, (_e, id: string) => removeCloneVoice(id))
  ipcMain.handle(IPC.cloneRename, (_e, id: string, name: string) => renameCloneVoice(id, name))
  ipcMain.handle(IPC.cloneSynth, (_e, req: CloneSynthRequest) =>
    cloneSynthesize(req, { onProgress: (p) => mainWindow?.webContents.send(IPC.cloneProgress, p) }),
  )
  ipcMain.handle(IPC.clonePreview, (_e, voiceId: string) =>
    ensureClonePreview(voiceId, {
      onProgress: (p) => mainWindow?.webContents.send(IPC.cloneProgress, p),
    }),
  )
  ipcMain.on(IPC.cloneCancel, () => cancelClone())
  // First-run model download (the ~3 GB model isn't bundled in the installer).
  // `installed` reflects whether the ENGINE has a usable model anywhere (downloaded,
  // or dev-staged in python/model), not just the download target.
  ipcMain.handle(IPC.cloneModelStatus, () => ({ ...modelStatus(), installed: modelAvailable() }))
  ipcMain.handle(IPC.cloneModelDownload, () =>
    downloadModel((p) => mainWindow?.webContents.send(IPC.cloneModelProgress, p)),
  )
  ipcMain.on(IPC.cloneModelCancel, () => cancelModelDownload())
  ipcMain.handle(IPC.cloneModelClear, () => clearModel())

  // --- FFmpeg ---
  ipcMain.handle(IPC.ffmpegProbe, (_e, filePath: string) => probe(filePath))
  ipcMain.handle(IPC.ffmpegRender, (_e, jobId: string, req: RenderRequest) =>
    render(jobId, req, {
      onProgress: (p) => mainWindow?.webContents.send(IPC.ffmpegProgress, p),
      onLog: (line) => mainWindow?.webContents.send(IPC.ffmpegLog, line),
    }),
  )
  ipcMain.on(IPC.ffmpegCancel, (_e, jobId: string) => cancelRender(jobId))

  // --- Projects ---
  ipcMain.handle(IPC.projectSave, (_e, project: unknown, path?: string | null) =>
    saveProject(mainWindow, project, path),
  )
  ipcMain.handle(IPC.projectOpen, () => openProject(mainWindow))

  // --- Settings ---
  ipcMain.handle(IPC.settingsGetAll, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<AppSettings>) => setSettings(patch))

  // --- Editor preferences (remembered style/voice config, restored on launch) ---
  ipcMain.handle(IPC.prefsGetAll, () => getPrefs())
  ipcMain.handle(IPC.prefsSet, (_e, prefs: EditorPreferences) => setPrefs(prefs))

  // --- Updater ---
  ipcMain.on(IPC.updaterCheck, () => checkForUpdates())
  ipcMain.on(IPC.updaterInstall, () => installUpdate())
  ipcMain.handle(IPC.updaterGetState, () => getUpdateState())

  // --- Shell ---
  ipcMain.handle(IPC.shellOpenPath, (_e, p: string) => shell.openPath(p))
  ipcMain.on(IPC.shellShowInFolder, (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.on(IPC.shellOpenExternal, (_e, url: string) => {
    // Only allow real web URLs to be opened externally.
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}

// Single-instance lock — focus the existing window instead of opening a second.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    neutralizeOpaqueOrigin()
    handleMediaProtocol()
    registerIpc()
    createWindow()
    if (mainWindow) setupAutoUpdates(mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Remove temp render/TTS artifacts on exit (thumbnails, .ass, WAVs), and tear
  // down child processes (sidecar, Whisper utility) so the app exits cleanly.
  app.on('will-quit', () => {
    cleanupTempDir()
    cleanupTtsTemp()
    cleanupAzureTemp()
    cleanupWhisper()
    cleanupClone()
    // Safety net: if any lingering handle (a child's pipe, a utility process)
    // still holds the event loop, force-exit so we ALWAYS release the
    // single-instance lock — otherwise the update relaunch can't acquire it and
    // "nothing opens". unref() means this never delays a clean quit.
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
