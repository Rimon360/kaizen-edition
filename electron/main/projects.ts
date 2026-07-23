import { BrowserWindow, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'

export interface SaveResult {
  canceled: boolean
  path: string | null
}
export interface OpenResult {
  canceled: boolean
  path: string | null
  project: unknown | null
}

const FILTERS = [{ name: 'Proyecto KAIZEN', extensions: ['keproj', 'cmproj', 'json'] }]

export async function saveProject(
  win: BrowserWindow | null,
  project: unknown,
  existingPath?: string | null,
): Promise<SaveResult> {
  let target = existingPath ?? null
  if (!target) {
    const res = await dialog.showSaveDialog(win!, {
      title: 'Guardar proyecto',
      defaultPath: 'proyecto.keproj',
      filters: FILTERS,
    })
    if (res.canceled || !res.filePath) return { canceled: true, path: null }
    target = res.filePath
  }
  try {
    writeFileSync(target, JSON.stringify(project, null, 2), 'utf8')
  } catch (err) {
    throw new Error(`No se pudo guardar el proyecto: ${err instanceof Error ? err.message : err}`)
  }
  return { canceled: false, path: target }
}

export async function openProject(win: BrowserWindow | null): Promise<OpenResult> {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Abrir proyecto',
    properties: ['openFile'],
    filters: FILTERS,
  })
  if (res.canceled || res.filePaths.length === 0) {
    return { canceled: true, path: null, project: null }
  }
  const path = res.filePaths[0]
  try {
    const project = JSON.parse(readFileSync(path, 'utf8'))
    return { canceled: false, path, project }
  } catch (err) {
    throw new Error(`No se pudo leer el proyecto: ${err instanceof Error ? err.message : err}`)
  }
}
