import { useCallback } from 'react'
import { toast } from 'sonner'
import { electronApi } from '@/lib/electron'
import { listVoices, renderJob, synthesize } from '@/services/media.service'
import { useQueueStore } from '@/store/queueStore'
import { useConfigStore } from '@/store/configStore'
import { useVoiceStore } from '@/store/voiceStore'
import { useRenderStore } from '@/store/renderStore'
import { isCloneVoiceId, cloneIdOf, useCloneStore } from '@/store/cloneStore'
import { tx } from '@/i18n'
import type { CloneProgress, CloneResult, ExportFormat, RenderRequest } from '@/types'

export function useRender() {
  const isRunning = useRenderStore((s) => s.status === 'preparing' || s.status === 'rendering')

  const run = useCallback(async (exportFormat: ExportFormat, opts?: { applyEdits?: boolean }) => {
    const applyEdits = opts?.applyEdits ?? true
    const queue = useQueueStore.getState().items
    const config = useConfigStore.getState()
    const voice = useVoiceStore.getState()
    const store = useRenderStore.getState()

    if (!electronApi) {
      toast.error(tx('export.requiresDesktop'))
      return
    }
    if (exportFormat === 'mp4' && queue.length === 0) {
      toast.error(tx('export.addVideo'))
      return
    }

    // 1. Resolve narration (gated by the Voice-over extra; a WAV export always
    //    needs narration since it IS the audio).
    //    Precedence: a script the user typed (with a voice selected) is SYNTHESIZED
    //    (clone/TTS) and wins over a previously-uploaded voice-over file — UNLESS
    //    that script is merely the transcript of the upload (the "upload + transcribe"
    //    flow, where the upload itself is the narration). This stops a stale uploaded
    //    file from silently overriding a chosen cloned/system voice.
    const useNarration = config.extras.voiceOver || exportFormat === 'wav'
    const script = voice.text.trim()
    const hasUpload = useNarration && !!config.voiceOverFile
    // Explicit user choice ("Use the video's audio"): route the queued clip's OWN
    // audio in as the voice-over (ffmpeg pulls the track straight from the mp4) and
    // skip TTS — so the real speech is kept, synced to the burned captions, and the
    // export is never left muted. Keeping original sound isn't "adding a voice-over",
    // so it applies regardless of the Voice-over extra and wins over an upload/TTS.
    const useVideoAudio = voice.useVideoAudio && queue.length > 0
    const scriptIsCustom =
      !useVideoAudio &&
      script.length > 0 &&
      !(hasUpload && voice.transcriptText != null && script === voice.transcriptText.trim())
    let narrationPath: string | null = useVideoAudio
      ? queue[0]?.path ?? null
      : !scriptIsCustom && hasUpload
        ? config.voiceOverFile
        : null
    const wantsVoice = useNarration && scriptIsCustom

    const jobId = crypto.randomUUID()
    store.start(jobId)
    // The user can hit Cancel during the (pre-ffmpeg) voice-synth / save-dialog
    // phase. cancel() sets status='canceled'; we bail at each await boundary so
    // the pipeline doesn't keep running and re-lock the studio.
    const aborted = () => {
      const s = useRenderStore.getState()
      return s.status === 'canceled' || s.jobId !== jobId
    }

    try {
      if (!narrationPath && wantsVoice && voice.text.trim()) {
        const selVoiceId = voice.settings.voiceId
        if (selVoiceId && isCloneVoiceId(selVoiceId)) {
          // The ~3 GB model downloads on first run; without it, prompt instead of
          // silently failing the whole export.
          const ms = useCloneStore.getState().modelStatus
          if (ms && !ms.installed) {
            useCloneStore.getState().setModelModalOpen(true)
            throw new Error(tx('clone.model.needed'))
          }
          // Cloned voice → offline Chatterbox engine. Relay its REAL per-step
          // progress (model load → the sampling bar → save) into the export card,
          // so the bar moves with a live % + ETA instead of sitting frozen at 0%.
          const cloneLabel: Record<CloneProgress['phase'], string> = {
            starting: tx('clone.synth.starting'),
            loading: tx('clone.synth.loading'),
            generating: tx('clone.synth.generating'),
            saving: tx('clone.synth.saving'),
            done: tx('clone.synth.generating'),
          }
          store.setProgress(0, cloneLabel.starting)
          const offClone = electronApi.clone.onProgress((p) => {
            // Generating + saving carry a real % (the model's sampling/vocoder steps);
            // engine-start + model-load have none, so they show an indeterminate bar
            // (percent 0) under a phase label — the long first-run wait reads as
            // "working", not frozen.
            const pct = typeof p.percent === 'number' ? p.percent : 0
            store.setProgress(pct, cloneLabel[p.phase] ?? tx('export.generatingVoice'), p.etaSec)
          })
          let res: CloneResult
          try {
            res = await electronApi.clone.synthesize({
              voiceId: cloneIdOf(selVoiceId),
              text: voice.text,
            })
          } finally {
            offClone()
          }
          if (res.canceled || aborted()) return
          if (!res.ok || !res.outputPath) {
            void useCloneStore.getState().refreshStatus() // reflect "needs setup" if revealed
            throw new Error(tx(res.error || 'clone.synthFailed'))
          }
          narrationPath = res.outputPath
          useVoiceStore.getState().setNarrationPath(narrationPath)
        } else {
          // System voice (Windows SAPI / Azure). Validate against the active
          // engine's list and fall back to the first available if needed.
          const voices = await listVoices()
          let voiceId = selVoiceId
          if (!voiceId || !voices.some((v) => v.id === voiceId)) {
            voiceId = voices[0]?.id ?? null
            if (voiceId) useVoiceStore.getState().setSettings({ voiceId })
          }
          if (voiceId) {
            store.setProgress(0, tx('export.generatingVoice'))
            const tts = await synthesize({
              text: voice.text,
              voiceId,
              rate: voice.settings.rate,
              pitch: voice.settings.pitch,
              volume: voice.settings.volume,
            })
            if (!tts.ok || !tts.outputPath) throw new Error(tts.error ?? tx('export.voiceFailed'))
            narrationPath = tts.outputPath
            useVoiceStore.getState().setNarrationPath(narrationPath)
          }
        }
      }

      if (aborted()) return // canceled while synthesizing the voice

      if (exportFormat === 'wav' && !narrationPath) {
        throw new Error(tx('export.noAudio'))
      }

      // Keep the preview's narration in sync — covers an uploaded voice-over,
      // not just synthesized TTS.
      if (narrationPath) useVoiceStore.getState().setNarrationPath(narrationPath)

      // 2. Pick output destination. Suggest a unique, timestamped name so each
      //    export defaults to a distinct file (YYYYMMDD-HHMMSS, local time).
      const d = new Date()
      const p2 = (n: number) => String(n).padStart(2, '0')
      const stamp =
        `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}` +
        `-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
      const defaultName = `${exportFormat === 'mp4' ? 'kaizen-video' : 'kaizen-audio'}-${stamp}`
      const save = await electronApi.dialog.saveOutput(defaultName, exportFormat)
      if (aborted()) return // canceled while the save dialog was open
      if (save.canceled || !save.path) {
        store.reset()
        return
      }

      // 3. Build the request.
      const req: RenderRequest = {
        clips: queue.map((q) => q.path),
        format: config.format,
        exportFormat,
        outputPath: save.path,
        narrationPath,
        // Background music / sound-effects, only when the extra is on.
        musicPath: config.extras.soundEffects ? config.musicFile : null,
        subtitle:
          applyEdits && config.subtitle.enabled && voice.text.trim()
            ? {
                text: voice.text,
                config: config.subtitle,
                // Burn with REAL transcription timing when the text still matches
                // the transcript (i.e. it wasn't hand-edited after transcribing).
                ...(voice.transcriptSegments?.length &&
                voice.transcriptText != null &&
                voice.text.trim() === voice.transcriptText.trim()
                  ? { segments: voice.transcriptSegments }
                  : {}),
              }
            : null,
        normalizeAudio: config.extras.normalizeAudio,
      }

      // 4. Wire live progress + logs.
      const offProgress = electronApi.ffmpeg.onProgress((p) => {
        if (p.jobId === jobId) store.setProgress(p.percent, p.stage, p.etaSec)
      })
      const offLog = electronApi.ffmpeg.onLog((line) => store.appendLog(line))

      store.setProgress(0, tx('export.processing'))
      const result = await renderJob(jobId, req)
      offProgress()
      offLog()

      if (result.canceled) {
        // User cancelled — cancel() already moved the store to 'canceled'.
        return
      }
      if (result.ok && result.outputPath) {
        store.finish(result.outputPath)
        toast.success(tx('export.completed', { fmt: exportFormat.toUpperCase() }), {
          action: {
            label: tx('export.openFolder'),
            onClick: () => electronApi?.shell.showInFolder(result.outputPath!),
          },
        })
      } else {
        throw new Error(result.error ?? tx('export.failed'))
      }
    } catch (err) {
      store.fail((err as Error).message)
      toast.error((err as Error).message || tx('export.failed'))
    }
  }, [])

  const cancel = useCallback(() => {
    const { jobId } = useRenderStore.getState()
    if (electronApi) {
      // The job may be mid clone-synthesis (before ffmpeg starts) — cancel both so
      // Cancel is instant in either phase. Each is a no-op if that phase isn't live.
      electronApi.clone.cancel()
      if (jobId) electronApi.ffmpeg.cancel(jobId)
    }
    useRenderStore.getState().cancel()
  }, [])

  return { run, cancel, isRunning }
}
