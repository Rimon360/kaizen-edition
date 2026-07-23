import { useCallback } from 'react'
import { toast } from 'sonner'
import { electronApi } from '@/lib/electron'
import { tx } from '@/i18n'
import type { Project } from '@/types'
import { useConfigStore, DEFAULT_CONFIG } from '@/store/configStore'
import { TEMPLATES } from '@/features/config/constants'
import { useQueueStore } from '@/store/queueStore'
import { useVoiceStore, DEFAULT_VOICE_SETTINGS } from '@/store/voiceStore'
import { useProjectStore } from '@/store/projectStore'

function gatherProject(name: string): Project {
  const config = useConfigStore.getState()
  const voice = useVoiceStore.getState()
  const queue = useQueueStore.getState().items
  return {
    version: 1,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    config: {
      subtitle: config.subtitle,
      format: config.format,
      extras: config.extras,
      voiceOverFile: config.voiceOverFile,
      musicFile: config.musicFile,
    },
    template: config.template,
    queue: queue.map((q) => ({ path: q.path, name: q.name })),
    voiceText: voice.text,
    voiceSettings: voice.settings,
  }
}

export function useProject() {
  const newProject = useCallback(() => {
    // A new project gives a clean document but KEEPS the user's remembered
    // style/voice preferences (so "remember my settings" survives New Project).
    // Only per-job content — clips, narration, uploaded files — is cleared.
    useConfigStore.getState().clearContent()
    useQueueStore.getState().clear()
    useVoiceStore.getState().clearContent()
    useProjectStore.getState().reset()
    toast.success(tx('titlebar.toast.newProject'))
  }, [])

  const saveProject = useCallback(async () => {
    if (!electronApi) return toast.error(tx('common.desktopOnly'))
    try {
      const { name, path } = useProjectStore.getState()
      const project = gatherProject(name)
      const res = await electronApi.project.save(project, path)
      if (!res.canceled && res.path) {
        const finalName =
          res.path.split(/[\\/]/).pop()?.replace(/\.(keproj|cmproj|json)$/i, '') ?? name
        useProjectStore.getState().setMeta(finalName, res.path)
        toast.success(tx('titlebar.toast.projectSaved'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx('titlebar.toast.saveFailed'))
    }
  }, [])

  const openProject = useCallback(async () => {
    if (!electronApi) return toast.error(tx('common.desktopOnly'))
    try {
      const res = await electronApi.project.open()
      if (res.canceled || !res.project) return
      const project = res.project as Project
      if (project.version !== 1) return toast.error(tx('titlebar.toast.unsupportedFormat'))

      // Deep-merge nested config so missing/older fields fall back to defaults
      // (a shallow spread would replace subtitle/extras wholesale). Opening a
      // project makes its style the current (and thus remembered "last-used")
      // editor state — the app reopens where you left off.
      const cfg = project.config ?? ({} as Project['config'])
      // Fall back to a valid template if the file used an old/unknown id.
      const template = TEMPLATES.some((t) => t.value === project.template)
        ? project.template
        : 'motivational'
      useConfigStore.getState().hydrate(
        {
          ...DEFAULT_CONFIG,
          ...cfg,
          subtitle: { ...DEFAULT_CONFIG.subtitle, ...cfg.subtitle },
          extras: { ...DEFAULT_CONFIG.extras, ...cfg.extras },
        },
        template,
      )
      useQueueStore.getState().hydratePaths(project.queue ?? [])
      useVoiceStore.getState().hydrate(project.voiceText ?? '', {
        ...DEFAULT_VOICE_SETTINGS,
        ...project.voiceSettings,
      })
      // Re-probe restored clips for thumbnails/durations.
      useQueueStore.getState().items.forEach((i) => useQueueStore.getState().probe(i.id))

      const name =
        res.path?.split(/[\\/]/).pop()?.replace(/\.(keproj|cmproj|json)$/i, '') ?? project.name
      useProjectStore.getState().setMeta(name, res.path)
      toast.success(tx('titlebar.toast.projectOpened'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx('titlebar.toast.openFailed'))
    }
  }, [])

  return { newProject, saveProject, openProject }
}
