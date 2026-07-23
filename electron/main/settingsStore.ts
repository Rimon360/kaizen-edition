import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '../shared/types'

const FILE = () => join(app.getPath('userData'), 'settings.json')

const DEFAULTS: AppSettings = {
  backendUrl: 'https://www.kaizzen.org/s/vHwxhS39x9wSS393xxhS3xhS9wxwxx3hh9wx9wxhS39',
  apiKey: null,
  language: 'es',
  theme: 'dark',
  exportFolder: null,
  ttsProvider: 'local',
  azureKey: null,
  azureRegion: null,
  transcribeModel: 'accurate',
  transcribeLanguage: 'auto',
  translateToEnglish: false,
}

let cache: AppSettings | null = null

export function getSettings(): AppSettings {
  if (cache) return cache
  const file = FILE()
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>
      cache = { ...DEFAULTS, ...parsed }
      return cache
    } catch {
      /* fall through to defaults */
    }
  }
  cache = { ...DEFAULTS }
  return cache
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  cache = next
  try {
    writeFileSync(FILE(), JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    console.warn('[settingsStore] failed to persist settings:', err)
  }
  return next
}
