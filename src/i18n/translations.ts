// Translation dictionaries. Flat namespaced keys (e.g. 'login.title').
// `es` is the source of truth; missing keys fall back to es, then to the key.
// Each UI area owns its own ./strings/<area>.ts file (no merge conflicts).
import type { Dict, Lang, LangPack } from './types'
import { common } from './strings/common'
import { titlebar } from './strings/titlebar'
import { auth } from './strings/auth'
import { config } from './strings/config'
import { preview } from './strings/preview'
import { queue } from './strings/queue'
import { voice } from './strings/voice'
import { exportStrings } from './strings/export'
import { settings } from './strings/settings'
import { clone } from './strings/clone'

function merge(...packs: LangPack[]): Record<Lang, Dict> {
  const out: Record<Lang, Dict> = { es: {}, en: {} }
  for (const p of packs) {
    Object.assign(out.es, p.es)
    Object.assign(out.en, p.en)
  }
  return out
}

export const translations: Record<Lang, Dict> = merge(
  common,
  titlebar,
  auth,
  config,
  preview,
  queue,
  voice,
  exportStrings,
  settings,
  clone,
)
