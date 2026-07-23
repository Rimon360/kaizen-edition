import { create } from 'zustand'
import type { EditConfig, EditTemplate, SubtitleConfig } from '@/types'
import { TEMPLATE_PRESETS } from '@/features/config/constants'

export const DEFAULT_SUBTITLE: SubtitleConfig = {
  enabled: true,
  position: 'bottom',
  fontSize: 70,
  fontFamily: 'Arial',
  color: '#ffffff',
  backgroundColor: '#000000',
  backgroundEnabled: false,
  stroke: true,
  strokeColor: '#000000',
  strokeWidth: 3,
  wordHighlightEnabled: false,
  wordHighlightColor: '#22c55e',
  wordHighlightRadius: 12,
  wordHighlightMode: 'line',
}

const DEFAULT_TEMPLATE: EditTemplate = 'motivational'

export const DEFAULT_CONFIG: EditConfig = {
  // Start with the default template's look applied so the selected template and
  // the actual styling agree from the first render.
  subtitle: { ...DEFAULT_SUBTITLE, ...TEMPLATE_PRESETS[DEFAULT_TEMPLATE].subtitle },
  format: TEMPLATE_PRESETS[DEFAULT_TEMPLATE].format,
  extras: { voiceOver: true, soundEffects: false, normalizeAudio: false },
  voiceOverFile: null,
  musicFile: null,
}

interface ConfigState extends EditConfig {
  template: EditTemplate
  setSubtitle: (patch: Partial<SubtitleConfig>) => void
  setFormat: (format: EditConfig['format']) => void
  setExtras: (patch: Partial<EditConfig['extras']>) => void
  setVoiceOverFile: (path: string | null) => void
  setMusicFile: (path: string | null) => void
  setTemplate: (template: EditTemplate) => void
  hydrate: (config: EditConfig, template: EditTemplate) => void
  /** Clear only per-job content (uploaded files), keeping remembered style/template. */
  clearContent: () => void
  reset: () => void
}

export const useConfigStore = create<ConfigState>((set) => ({
  ...DEFAULT_CONFIG,
  template: DEFAULT_TEMPLATE,

  setSubtitle: (patch) => set((s) => ({ subtitle: { ...s.subtitle, ...patch } })),
  setFormat: (format) => set({ format }),
  setExtras: (patch) => set((s) => ({ extras: { ...s.extras, ...patch } })),
  setVoiceOverFile: (voiceOverFile) => set({ voiceOverFile }),
  setMusicFile: (musicFile) => set({ musicFile }),
  // Selecting a template APPLIES its preset: video format + caption style merged
  // over the current subtitle config (the user can still tweak afterwards).
  setTemplate: (template) =>
    set((s) => {
      const preset = TEMPLATE_PRESETS[template]
      if (!preset) return { template }
      // Templates define a complete caption look and never use glow, so clear any
      // neon glow left over from a previously-applied futuristic style — otherwise
      // the result is non-deterministic (glow stuck on a flat template).
      return {
        template,
        format: preset.format,
        subtitle: { ...s.subtitle, glow: undefined, ...preset.subtitle },
      }
    }),
  hydrate: (config, template) => set({ ...config, template }),
  // "New Project" uses this: a clean document without discarding the user's
  // remembered subtitle style, format, extras, or template.
  clearContent: () => set({ voiceOverFile: null, musicFile: null }),
  reset: () => set({ ...DEFAULT_CONFIG, template: DEFAULT_TEMPLATE }),
}))
