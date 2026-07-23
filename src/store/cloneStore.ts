import { create } from 'zustand'
import type { CloneEngineStatus, CloneVoice, ModelStatus } from '@/types'
import { electronApi } from '@/lib/electron'

interface CloneState {
  /** Locally-saved cloned voices, reusable across sessions. */
  voices: CloneVoice[]
  /** Whether the cloning engine can run on this machine/build. */
  status: CloneEngineStatus | null
  /** Whether the (separately-downloaded) ~3 GB model is installed. */
  modelStatus: ModelStatus | null
  /** Controls the first-run model-download modal (any clone op can raise it). */
  modelModalOpen: boolean
  setModelModalOpen: (open: boolean) => void
  loaded: boolean
  load: () => Promise<void>
  /** Re-fetch just the engine status (e.g. after a synth revealed it's not set up). */
  refreshStatus: () => Promise<void>
  /** Re-fetch model-install status (after a download completes). */
  refreshModelStatus: () => Promise<void>
  /** Wipe a corrupted/partial model and re-open the download modal to re-fetch it. */
  repairModel: () => Promise<void>
  add: (samplePath: string, name: string, language: string) => Promise<CloneVoice | null>
  remove: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
}

/** voiceId convention: a cloned voice is selected as `clone:<id>` so the voice
 *  picker and synthesis can tell it apart from a Windows/Azure system voice. */
export const CLONE_PREFIX = 'clone:'
export const isCloneVoiceId = (id: string | null | undefined): boolean =>
  !!id && id.startsWith(CLONE_PREFIX)
export const cloneIdOf = (voiceId: string): string => voiceId.slice(CLONE_PREFIX.length)

export const useCloneStore = create<CloneState>((set) => ({
  voices: [],
  status: null,
  modelStatus: null,
  modelModalOpen: false,
  setModelModalOpen: (open) => set({ modelModalOpen: open }),
  loaded: false,

  load: async () => {
    if (!electronApi?.clone) {
      set({ loaded: true, status: { available: false, mode: 'none' } })
      return
    }
    try {
      const [voices, status, modelStatus] = await Promise.all([
        electronApi.clone.list(),
        electronApi.clone.status(),
        electronApi.clone.model.status(),
      ])
      set({ voices, status, modelStatus, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  refreshStatus: async () => {
    if (!electronApi?.clone) return
    try {
      set({ status: await electronApi.clone.status() })
    } catch {
      /* keep prior status */
    }
  },

  refreshModelStatus: async () => {
    if (!electronApi?.clone) return
    try {
      set({ modelStatus: await electronApi.clone.model.status() })
    } catch {
      /* keep prior status */
    }
  },

  repairModel: async () => {
    if (!electronApi?.clone) return
    try {
      await electronApi.clone.model.clear()
    } catch {
      /* best effort */
    }
    try {
      set({ modelStatus: await electronApi.clone.model.status() }) // now uninstalled
    } catch {
      /* ignore */
    }
    set({ modelModalOpen: true }) // re-open the setup modal to re-fetch a clean copy
  },

  add: async (samplePath, name, language) => {
    if (!electronApi?.clone) return null
    const v = await electronApi.clone.add(samplePath, name, language)
    set((s) => ({ voices: [v, ...s.voices.filter((x) => x.id !== v.id)] }))
    return v
  },

  remove: async (id) => {
    if (!electronApi?.clone) return
    const voices = await electronApi.clone.remove(id)
    set({ voices })
  },

  rename: async (id, name) => {
    if (!electronApi?.clone) return
    const voices = await electronApi.clone.rename(id, name)
    set({ voices })
  },
}))
