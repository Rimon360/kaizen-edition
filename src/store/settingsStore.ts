import { create } from 'zustand'
import type { AppSettings } from '@/types'
import { electronApi } from '@/lib/electron'
import { setApiBaseUrl, getApiBaseUrl, applyApiKey } from '@/services/config'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<void>
}

const DEFAULTS: AppSettings = {
  backendUrl: getApiBaseUrl(),
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

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,

  load: async () => {
    if (!electronApi) {
      set({ loaded: true })
      return
    }
    try {
      const s = await electronApi.settings.getAll()
      // Baked default URL first, then let the API key override URL + secrets.
      if (s.backendUrl) setApiBaseUrl(s.backendUrl)
      if (s.apiKey) applyApiKey(s.apiKey)
      set({ settings: { ...DEFAULTS, ...s }, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  update: async (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    if (patch.backendUrl) setApiBaseUrl(patch.backendUrl)
    if (patch.apiKey !== undefined && patch.apiKey) applyApiKey(patch.apiKey)
    if (electronApi) {
      try {
        // Persist the patch only. We intentionally keep the optimistic value rather
        // than overwriting state with the full returned snapshot: with overlapping
        // writes (e.g. rapidly toggling several Selects on the Settings page) a
        // slower earlier response could otherwise clobber a newer change.
        await electronApi.settings.set(patch)
      } catch {
        /* keep optimistic value */
      }
    }
  },
}))
