import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listVoices } from '@/services/media.service'
import { useVoiceStore } from '@/store/voiceStore'
import { useSettingsStore } from '@/store/settingsStore'
import { isCloneVoiceId } from '@/store/cloneStore'

export function useVoices() {
  // Re-fetch when the provider (or Azure region) changes so the list reflects
  // local Windows voices vs Azure voices.
  const provider = useSettingsStore((s) => s.settings.ttsProvider)
  const region = useSettingsStore((s) => s.settings.azureRegion)

  const query = useQuery({
    queryKey: ['voices', provider, region],
    queryFn: listVoices,
    staleTime: Infinity,
  })

  const voiceId = useVoiceStore((s) => s.settings.voiceId)
  const setSettings = useVoiceStore((s) => s.setSettings)

  // Select the first voice once loaded, or re-select if the current voice isn't
  // in the new list (e.g. after switching provider, a local id is invalid for Azure).
  useEffect(() => {
    // A remembered cloned voice (`clone:<id>`) isn't in the system voice list —
    // don't auto-overwrite it with the first system voice on launch.
    if (isCloneVoiceId(voiceId)) return
    if (!query.data || query.data.length === 0) return
    const ids = new Set(query.data.map((v) => v.id))
    if (!voiceId || !ids.has(voiceId)) {
      setSettings({ voiceId: query.data[0].id })
    }
  }, [voiceId, query.data, setSettings])

  return query
}
