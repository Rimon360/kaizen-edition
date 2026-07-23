import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EditorPreferences } from '../shared/types'

// Durable editor preferences ("remember my settings"), stored alongside
// settings.json in userData. Kept separate from settings.json so the Settings
// page and the editor's last-used style/voice config never clobber each other.
const FILE = () => join(app.getPath('userData'), 'editor-prefs.json')

// `undefined` = not yet loaded from disk; `null` = loaded, nothing saved yet.
let cache: EditorPreferences | null | undefined

export function getPrefs(): EditorPreferences | null {
  if (cache !== undefined) return cache
  const file = FILE()
  if (existsSync(file)) {
    try {
      cache = JSON.parse(readFileSync(file, 'utf8')) as EditorPreferences
      return cache
    } catch {
      /* corrupt file — fall through to "no prefs" */
    }
  }
  cache = null
  return cache
}

export function setPrefs(prefs: EditorPreferences): EditorPreferences {
  // The renderer always sends the complete preference snapshot, so we overwrite
  // wholesale rather than merging partial patches.
  cache = prefs
  try {
    writeFileSync(FILE(), JSON.stringify(prefs, null, 2), 'utf8')
  } catch (err) {
    console.warn('[prefsStore] failed to persist editor preferences:', err)
  }
  return prefs
}
