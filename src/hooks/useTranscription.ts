import { toast } from 'sonner'
import { electronApi } from '@/lib/electron'
import { useVoiceStore } from '@/store/voiceStore'
import { useT } from '@/i18n'

/**
 * Shared offline-transcription controller. It drives the GLOBAL voiceStore so a
 * single blocking modal (rendered by ConfigPanel) reflects a run started from
 * anywhere — the "Transcribe to subtitles" button (an uploaded audio file) or the
 * "Transcribe from video" button (a queued clip's audio).
 *
 * The Whisper worker decodes its input with `ffmpeg -i <path>`, which is container-
 * agnostic, so the SAME entry point handles an audio file or a video file with no
 * engine change — we just feed it the clip path. Whether the export then keeps the
 * clip's own audio is a separate, explicit choice (`useVideoAudio`).
 */
export function useTranscription() {
  const t = useT()

  /**
   * Transcribe an audio OR video file at `path` into text + timed caption segments.
   * Source-agnostic: whether the clip's own audio is kept on export is governed by the
   * separate `useVideoAudio` choice, which each caller sets as appropriate.
   */
  const transcribe = async (path: string) => {
    if (!electronApi) return
    // A failed / canceled run must NOT destroy an existing transcript (Re-transcribe);
    // only a fresh, successful run replaces it.
    const hadPrior = !!useVoiceStore.getState().transcriptText
    const store = useVoiceStore.getState()
    store.setTranscribePartial('')
    store.setTranscribeCanceling(false)
    store.setTranscribing({ phase: 'downloading', percent: 0 })
    const off = electronApi.stt.onProgress((p) => {
      // Each message carries the real phase/percent/ETA (and, mid-inference, the live
      // partial transcript) — apply both to the store so the modal updates.
      const s = useVoiceStore.getState()
      if (p.partialText !== undefined) s.setTranscribePartial(p.partialText)
      s.setTranscribing({ phase: p.phase, percent: p.percent, etaSec: p.etaSec })
    })
    try {
      const res = await electronApi.stt.transcribe(path)
      off()
      const s = useVoiceStore.getState()
      if (res.canceled) {
        // User stopped it — just close the modal, keep any prior state, no error.
        s.setTranscribing(null)
        toast(t('config.transcribeCanceled'))
        return
      }
      if (res.ok && res.text) {
        s.setTranscript(res.text, res.segments ?? [])
        toast.success(t('config.transcribeDone'))
      } else {
        // Keep the previous transcript on failure; just close the modal.
        if (hadPrior) s.setTranscribing(null)
        else s.clearTranscript()
        // res.error may be an i18n key (known cases) or a raw message; t() resolves
        // keys and passes raw strings through unchanged.
        toast.error(t(res.error || 'config.transcribeFailed'))
      }
    } catch (err) {
      off()
      const s = useVoiceStore.getState()
      if (hadPrior) s.setTranscribing(null)
      else s.clearTranscript()
      toast.error((err as Error).message || t('config.transcribeFailed'))
    }
  }

  const cancel = () => {
    useVoiceStore.getState().setTranscribeCanceling(true)
    electronApi?.stt.cancel()
    // Normally the in-flight transcribe() resolves as canceled → the modal closes.
    // Safety net: if the worker somehow never exits, don't trap the user behind it.
    setTimeout(() => {
      if (useVoiceStore.getState().transcribing) useVoiceStore.getState().setTranscribing(null)
    }, 7000)
  }

  return { transcribe, cancel }
}
