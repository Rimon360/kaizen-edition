import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC, type UpdateState } from '../shared/types'

const { autoUpdater } = electronUpdater

let state: UpdateState = { status: 'idle' }

function push(win: BrowserWindow | null, next: UpdateState): void {
  state = next
  win?.webContents.send(IPC.updaterStatus, next)
}

export function getUpdateState(): UpdateState {
  return state
}

export function checkForUpdates(): void {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdates().catch((err) => {
    console.warn('[updater] check failed:', err)
  })
}

export function installUpdate(): void {
  if (state.status === 'downloaded') {
    // isSilent=false → the assisted installer reopens its wizard (with a progress
    // window) so the user sees the ~775 MB sidecar unpack working — and clicks
    // through to reinstall into the previously chosen folder — instead of a silent
    // blank gap that looks like a hang. isForceRunAfter=true → relaunch when done.
    autoUpdater.quitAndInstall(false, true)
  }
}

export function setupAutoUpdates(win: BrowserWindow): void {
  // Auto-updates only run in a packaged build with a real publish channel.
  if (!app.isPackaged) {
    console.log('[updater] skipped (dev / not packaged)')
    return
  }

  autoUpdater.logger = console as never
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Always do a single full download. The differential (block-map) downloader
  // needs the PREVIOUS installer cached locally to diff against — which users who
  // installed manually from the download link never have. It then fails mid-way and
  // falls back to a full download, so the user sees the bar reach ~100%, reset, and
  // download a SECOND time. A 496 MB app doesn't benefit from diffing enough to
  // justify that; force one clean download instead.
  autoUpdater.disableDifferentialDownload = true

  autoUpdater.on('checking-for-update', () => push(win, { status: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    push(win, { status: 'available', version: info?.version }),
  )
  autoUpdater.on('update-not-available', () => push(win, { status: 'none' }))
  autoUpdater.on('download-progress', (p) =>
    push(win, { status: 'downloading', percent: Math.round(p?.percent ?? 0) }),
  )
  autoUpdater.on('update-downloaded', (info) =>
    push(win, { status: 'downloaded', version: info?.version }),
  )
  autoUpdater.on('error', (err) => push(win, { status: 'error', message: err?.message }))

  checkForUpdates()
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000)
}
