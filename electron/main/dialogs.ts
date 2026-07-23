import { BrowserWindow, dialog } from 'electron'
import { getSettings } from './settingsStore'

export interface DialogFileResult {
  canceled: boolean
  paths: string[]
}
export interface DialogSaveResult {
  canceled: boolean
  path: string | null
}

export async function openVideos(win: BrowserWindow | null): Promise<DialogFileResult> {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Selecciona tus videos',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] }],
  })
  return { canceled: res.canceled, paths: res.filePaths }
}

export async function openAudio(win: BrowserWindow | null): Promise<DialogFileResult> {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Selecciona el audio de voz en off',
    properties: ['openFile'],
    // All formats ffmpeg decodes — the upload is always re-encoded (muxed for the
    // render, normalized to WAV for a clone sample, decoded for transcription), so
    // the input container/codec doesn't matter. m4a/aac are the common phone/iOS ones.
    filters: [
      { name: 'Audio', extensions: ['mp3', 'mpeg', 'mpga', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac', 'opus', 'wma'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  })
  return { canceled: res.canceled, paths: res.filePaths }
}

export async function openDirectory(win: BrowserWindow | null): Promise<DialogFileResult> {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Selecciona la carpeta de exportación',
    properties: ['openDirectory', 'createDirectory'],
  })
  return { canceled: res.canceled, paths: res.filePaths }
}

export async function saveOutput(
  win: BrowserWindow | null,
  defaultName: string,
  ext: 'mp4' | 'wav',
): Promise<DialogSaveResult> {
  const exportFolder = getSettings().exportFolder
  const res = await dialog.showSaveDialog(win!, {
    title: 'Guardar exportación',
    defaultPath: exportFolder ? `${exportFolder}/${defaultName}.${ext}` : `${defaultName}.${ext}`,
    filters:
      ext === 'mp4'
        ? [{ name: 'Video MP4', extensions: ['mp4'] }]
        : [{ name: 'Audio WAV', extensions: ['wav'] }],
  })
  return { canceled: res.canceled, path: res.filePath ?? null }
}
