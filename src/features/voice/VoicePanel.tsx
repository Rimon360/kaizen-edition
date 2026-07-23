import { useEffect, useRef, useState } from 'react'
import { Mic, Volume2, Gauge, Music, Play, Square, Loader2, AudioLines, Mic2, Sparkles, Captions } from 'lucide-react'
import { toast } from 'sonner'
import { SectionHeading, FieldGroupLabel } from '@/components/common/SectionHeading'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TranscribeOptions } from '@/components/common/TranscribeOptions'
import { electronApi } from '@/lib/electron'
import { countWords, estimateSpeechDuration, formatDuration } from '@/utils/format'
import { synthesize } from '@/services/media.service'
import { useVoiceStore } from '@/store/voiceStore'
import { useQueueStore } from '@/store/queueStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useCloneStore, CLONE_PREFIX, isCloneVoiceId, cloneIdOf } from '@/store/cloneStore'
import { useT } from '@/i18n'
import { useTranscription } from '@/hooks/useTranscription'
import type { CloneProgress } from '@/types'
import { useVoices } from './useVoices'
import { CloneVoiceModal } from './CloneVoiceModal'
import { CloneSynthModal } from './CloneSynthModal'
import { ModelDownloadModal } from './ModelDownloadModal'

function SliderRow({
  icon,
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  value: number
  display: string
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] text-foreground/70">
          <span className="text-[var(--neon-1)]/70">{icon}</span>
          {label}
        </span>
        <span className="numeric text-xs text-[var(--neon-1)]">{display}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  )
}

export function VoicePanel() {
  const t = useT()
  const { data: voices, isLoading } = useVoices()
  const text = useVoiceStore((s) => s.text)
  const settings = useVoiceStore((s) => s.settings)
  const setText = useVoiceStore((s) => s.setText)
  const setSettings = useVoiceStore((s) => s.setSettings)
  const setNarrationPath = useVoiceStore((s) => s.setNarrationPath)
  const setCloneSynthesizing = useVoiceStore((s) => s.setCloneSynthesizing)
  const transcribing = useVoiceStore((s) => s.transcribing)
  const useVideoAudio = useVoiceStore((s) => s.useVideoAudio)
  const setUseVideoAudio = useVoiceStore((s) => s.setUseVideoAudio)
  // First queued clip — its audio is what "Transcribe from video" reads (matches
  // the Preview, which also shows the first clip).
  const firstClipPath = useQueueStore((s) => s.items[0]?.path)
  const { transcribe } = useTranscription()
  const ttsProvider = useSettingsStore((s) => s.settings.ttsProvider)
  const cloneVoices = useCloneStore((s) => s.voices)
  const modelModalOpen = useCloneStore((s) => s.modelModalOpen)
  const setModelModalOpen = useCloneStore((s) => s.setModelModalOpen)
  const [previewing, setPreviewing] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [cloneSynth, setCloneSynth] = useState<CloneProgress | null>(null)
  const [cloneCanceling, setCloneCanceling] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastBlobUrl = useRef<string | null>(null)
  const previewIdRef = useRef(0)
  // Caches the last cloned-voice preview so replaying the SAME voice+text doesn't
  // re-run the (slow) model — keyed by `${cloneId}|${text}`.
  const cloneCacheRef = useRef<{ key: string; bytes: Uint8Array; outputPath: string } | null>(null)
  const selectedIsClone = isCloneVoiceId(settings.voiceId)

  const stopPreview = () => {
    previewIdRef.current++ // invalidate any in-flight (e.g. Azure) preview
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    if (audioRef.current) {
      try {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      } catch {
        /* ignore */
      }
    }
    setSynthesizing(false)
    setPreviewing(false)
  }

  // Stop any preview + release the last blob URL on unmount.
  useEffect(
    () => () => {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
      if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current)
    },
    [],
  )

  const words = countWords(text)
  const est = estimateSpeechDuration(text)

  // Mirror clone-synth into the store so the titlebar + export lock during it
  // (same protection as a render/transcription), preventing an orphaned sidecar.
  useEffect(() => {
    setCloneSynthesizing(!!cloneSynth)
  }, [cloneSynth, setCloneSynthesizing])

  // Play raw WAV bytes through the shared <audio> element (revokes the prior URL).
  const playBytes = async (bytes: Uint8Array) => {
    if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current)
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }))
    lastBlobUrl.current = url
    const myId = ++previewIdRef.current
    if (!audioRef.current) return
    audioRef.current.src = url
    audioRef.current.onended = () => previewIdRef.current === myId && setPreviewing(false)
    audioRef.current.onerror = () => previewIdRef.current === myId && setPreviewing(false)
    setPreviewing(true)
    await audioRef.current.play()
  }

  // --- Cloned-voice preview (offline Chatterbox sidecar) ---
  const cancelCloneSynth = () => {
    setCloneCanceling(true)
    electronApi?.clone.cancel()
  }

  // On success, snap the bar to a full 100% with a "Done" tick and hold briefly so
  // the modal always finishes at 100% — instead of closing at whatever % the model's
  // (inherently estimated) progress happened to reach. The bar's CSS width transition
  // animates the final fill smoothly.
  const finishCloneSynth = async () => {
    setCloneSynth({ phase: 'done', percent: 100 })
    await new Promise((r) => setTimeout(r, 650))
    setCloneSynth(null)
  }

  // The ~3 GB model downloads on first run (separate from the app). If it isn't
  // installed yet, raise the download modal instead of attempting a clone.
  const modelReady = (): boolean => {
    const ms = useCloneStore.getState().modelStatus
    if (ms && !ms.installed) {
      setCloneSynth(null)
      setModelModalOpen(true)
      return false
    }
    return true
  }

  const handleClonePreview = async () => {
    if (!electronApi?.clone) return toast.error(t('clone.engineMissing'))
    const status = useCloneStore.getState().status
    if (status && !status.available) {
      toast.error(t('clone.setup.title'))
      setManageOpen(true)
      return
    }
    if (!modelReady()) return
    const cloneId = cloneIdOf(settings.voiceId as string)
    const previewText = text.slice(0, 800)
    const cacheKey = `${cloneId}|${previewText}`
    // Same voice + same text as last time → replay the cached clip instantly,
    // no model run (and no progress modal).
    const cached = cloneCacheRef.current
    if (cached && cached.key === cacheKey) {
      setNarrationPath(cached.outputPath)
      await playBytes(cached.bytes)
      return
    }
    setCloneCanceling(false)
    setCloneSynth({ phase: 'starting' })
    const off = electronApi.clone.onProgress((p) => setCloneSynth(p))
    try {
      const res = await electronApi.clone.synthesize({ voiceId: cloneId, text: previewText })
      off()
      if (res.canceled) return setCloneSynth(null)
      if (!res.ok || !res.outputPath) {
        setCloneSynth(null)
        if (res.error === 'clone.modelBroken') setManageOpen(true) // show the repair button
        throw new Error(t(res.error || 'clone.synthFailed'))
      }
      await finishCloneSynth() // fill the bar to 100% before the modal closes
      setNarrationPath(res.outputPath)
      const bytes = await electronApi.tts.readAudio(res.outputPath)
      cloneCacheRef.current = { key: cacheKey, bytes, outputPath: res.outputPath }
      await playBytes(bytes)
    } catch (err) {
      off()
      setCloneSynth(null)
      // A failure may reveal the engine isn't set up — refresh status so the UI
      // (and the manage modal) reflect it instead of inviting another failure.
      void useCloneStore.getState().refreshStatus()
      toast.error((err as Error).message || t('clone.synthFailed'))
    }
  }

  // Play a short, reusable SAMPLE of the selected cloned voice. Generated + cached
  // on first use (a fixed phrase), then replayed instantly with no model run.
  const handleListenVoice = async () => {
    if (previewing) return stopPreview()
    if (!electronApi?.clone) return toast.error(t('clone.engineMissing'))
    const id = cloneIdOf(settings.voiceId as string)
    const voice = useCloneStore.getState().voices.find((v) => v.id === id)
    if (voice?.previewFile) {
      // Cached sample → instant playback, no engine.
      try {
        const bytes = await electronApi.tts.readAudio(voice.previewFile)
        await playBytes(bytes)
        return
      } catch {
        /* cached file vanished — fall through and regenerate */
      }
    }
    const status = useCloneStore.getState().status
    if (status && !status.available) {
      toast.error(t('clone.setup.title'))
      setManageOpen(true)
      return
    }
    if (!modelReady()) return
    setCloneCanceling(false)
    setCloneSynth({ phase: 'starting' })
    const off = electronApi.clone.onProgress((p) => setCloneSynth(p))
    try {
      const res = await electronApi.clone.preview(id)
      off()
      if (res.canceled) return setCloneSynth(null)
      if (!res.ok || !res.outputPath) {
        setCloneSynth(null)
        if (res.error === 'clone.modelBroken') setManageOpen(true) // show the repair button
        throw new Error(t(res.error || 'clone.synthFailed'))
      }
      await finishCloneSynth() // fill the bar to 100% before the modal closes
      void useCloneStore.getState().load() // refresh so previewFile caches for next time
      const bytes = await electronApi.tts.readAudio(res.outputPath)
      await playBytes(bytes)
    } catch (err) {
      off()
      setCloneSynth(null)
      void useCloneStore.getState().refreshStatus()
      toast.error((err as Error).message || t('clone.synthFailed'))
    }
  }

  // Transcribe the first queued clip's AUDIO into the script + timed captions. The
  // Whisper worker decodes the mp4 directly (ffmpeg), and the export then keeps the
  // clip's own audio in sync with the burned subtitles — no separate upload needed.
  const handleTranscribeFromVideo = () => {
    if (!firstClipPath) return toast.error(t('voice.noClipsToTranscribe'))
    // Transcribing the video implies you want its audio — pre-select it. The user can
    // untick "Use the video's audio" afterward to re-voice the transcript with TTS.
    setUseVideoAudio(true)
    void transcribe(firstClipPath)
  }

  const handlePreview = async () => {
    // Toggle: if something is already playing, stop it.
    if (previewing) return stopPreview()
    if (!text.trim()) return toast.error(t('voice.errEmptyText'))
    // Cloned voices route through the offline cloning engine.
    if (selectedIsClone) return handleClonePreview()
    // Use the selected voice only if it belongs to the active engine; otherwise
    // fall back to the first available.
    let voiceId = settings.voiceId
    if (!voiceId || !voices?.some((v) => v.id === voiceId)) {
      voiceId = voices?.[0]?.id ?? null
      if (voiceId) setSettings({ voiceId })
    }
    if (!voiceId) return toast.error(t('voice.errNoVoices'))

    const myId = ++previewIdRef.current // claim this preview; stop invalidates it
    const stillMine = () => previewIdRef.current === myId
    const speech = typeof window !== 'undefined' ? window.speechSynthesis : null

    // LOCAL voices → speak directly with the renderer's Web Speech API. No file,
    // no IPC, no media:// — so it can't fail with "no handler" / "no source".
    if (ttsProvider !== 'azure' && speech) {
      try {
        speech.cancel()
        const u = new SpeechSynthesisUtterance(text.slice(0, 600))
        const list = speech.getVoices()
        const stripped = voiceId.replace(/ Desktop$/i, '')
        const match =
          list.find((x) => x.name === voiceId) ||
          list.find((x) => x.name.includes(stripped) || stripped.includes(x.name)) ||
          list[0]
        // The .voice setter rejects non-SpeechSynthesisVoice values — guard it,
        // and just fall back to the default voice if assignment fails.
        if (match) {
          try {
            u.voice = match
          } catch {
            /* keep default voice */
          }
        }
        u.rate = Math.max(0.5, Math.min(2, 1 + settings.rate / 12))
        u.pitch = Math.max(0, Math.min(2, 1 + settings.pitch / 100))
        u.volume = Math.max(0, Math.min(1, settings.volume / 100))
        setPreviewing(true)
        u.onend = () => stillMine() && setPreviewing(false)
        u.onerror = () => stillMine() && setPreviewing(false)
        speech.speak(u)
      } catch (err) {
        if (stillMine()) {
          setPreviewing(false)
          toast.error((err as Error).message)
        }
      }
      return
    }

    // AZURE (or no Web Speech) → synthesize and play from a blob URL.
    if (!electronApi) return toast.error(t('voice.errDesktop'))
    // Release any previous blob up front so neither the blob nor the media://
    // fallback path can leave a stale URL behind.
    if (lastBlobUrl.current) {
      URL.revokeObjectURL(lastBlobUrl.current)
      lastBlobUrl.current = null
    }
    setPreviewing(true)
    setSynthesizing(true) // network round-trip is in flight; show a spinner
    try {
      const res = await synthesize({
        text: text.slice(0, 600),
        voiceId,
        rate: settings.rate,
        pitch: settings.pitch,
        volume: settings.volume,
      })
      if (!stillMine()) return // stopped while synthesizing
      if (!res.ok || !res.outputPath) throw new Error(res.error ?? t('voice.errSynthFailed'))
      setNarrationPath(res.outputPath)
      let playUrl: string
      try {
        const bytes = await electronApi.tts.readAudio(res.outputPath)
        playUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }))
        lastBlobUrl.current = playUrl
      } catch {
        playUrl = electronApi.shell.toMediaUrl(res.outputPath)
      }
      if (!stillMine()) return
      if (audioRef.current) {
        audioRef.current.src = playUrl
        audioRef.current.onended = () => stillMine() && setPreviewing(false)
        audioRef.current.onerror = () => stillMine() && setPreviewing(false)
        setSynthesizing(false) // playback is starting
        await audioRef.current.play() // resolves at playback start; stays "playing" until onended
      } else {
        setSynthesizing(false)
        setPreviewing(false)
      }
    } catch (err) {
      if (stillMine()) {
        setSynthesizing(false)
        setPreviewing(false)
        toast.error((err as Error).message)
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="p-5 pb-3">
        <SectionHeading
          title={t('voice.title')}
          subtitle={t('voice.subtitle')}
          icon={<Mic className="h-5 w-5" />}
        />
      </div>

      <ScrollArea className="flex-1 px-5">
        <div className="space-y-4 pb-5">
          <div className="space-y-2">
            <FieldGroupLabel>{t('voice.textLabel')}</FieldGroupLabel>
            {/* Script field with a subtle HUD corner motif framing the input. */}
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute -left-px -top-px z-10 h-3 w-3 rounded-tl-[var(--radius)] border-l border-t border-[var(--neon-1)]/40"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-px -right-px z-10 h-3 w-3 rounded-br-[var(--radius)] border-b border-r border-[var(--neon-1)]/40"
              />
              <Textarea
                id="voice-script"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('voice.textPlaceholder')}
                className="min-h-[180px]"
              />
            </div>
            {/* Telemetry strip: uppercase mono captions over numeric readouts. */}
            <div className="flex items-stretch rounded-[var(--radius)] border border-border/60 bg-black/15">
              <div className="flex flex-1 flex-col items-center gap-0.5 px-2 py-1.5">
                <span className="display text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  CHARS
                </span>
                <span className="numeric text-sm text-[var(--neon-1)]">{text.length}</span>
              </div>
              <span aria-hidden className="my-1.5 w-px bg-border/60" />
              <div className="flex flex-1 flex-col items-center gap-0.5 px-2 py-1.5">
                <span className="display text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  WORDS
                </span>
                <span className="numeric text-sm text-[var(--neon-1)]">{words}</span>
              </div>
              <span aria-hidden className="my-1.5 w-px bg-border/60" />
              <div className="flex flex-1 flex-col items-center gap-0.5 px-2 py-1.5">
                <span className="display flex items-center gap-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  <AudioLines className="h-2.5 w-2.5" />
                  EST
                </span>
                <span className="numeric text-sm text-[var(--neon-1)]">
                  {text.trim() ? `~${formatDuration(est)}` : '—'}
                </span>
              </div>
            </div>

            {/* Source language + translate-to-English for the transcription below. */}
            <TranscribeOptions disabled={!!transcribing} />

            {/* Pull the script straight from the queued video's spoken audio. The
                result fills the field above + generates synced subtitles, keeping the
                clip's own audio on export. */}
            <Button
              type="button"
              variant="secondary"
              className="h-9 w-full text-xs"
              onClick={handleTranscribeFromVideo}
              disabled={!firstClipPath || !!transcribing}
              title={
                firstClipPath ? t('voice.transcribeFromVideoHint') : t('voice.noClipsToTranscribe')
              }
            >
              <Captions className="h-3.5 w-3.5" />
              {t('voice.transcribeFromVideo')}
            </Button>

            {/* Audio-source choice: the video's own voice vs. the uploaded/generated
                voice-over. Auto-ticked by "Transcribe from video"; untick to re-voice
                the transcript with TTS instead. */}
            <label
              className={`flex items-center gap-2.5 rounded-[var(--radius)] border border-border/60 bg-black/15 px-2.5 py-2 transition-colors ${
                firstClipPath ? 'cursor-pointer hover:border-white/15' : 'cursor-not-allowed opacity-50'
              }`}
              title={firstClipPath ? t('voice.useVideoAudioHint') : t('voice.noClipsToTranscribe')}
            >
              <Checkbox
                checked={useVideoAudio}
                onCheckedChange={(v) => setUseVideoAudio(!!v)}
                disabled={!firstClipPath}
                aria-label={t('voice.useVideoAudio')}
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-[12px] text-foreground/85">{t('voice.useVideoAudio')}</span>
                <span className="text-[10px] leading-snug text-muted-foreground">
                  {t('voice.useVideoAudioHint')}
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FieldGroupLabel>{t('voice.voiceLabel')}</FieldGroupLabel>
              {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
            <Select
              value={settings.voiceId ?? undefined}
              onValueChange={(v) => setSettings({ voiceId: v })}
              disabled={isLoading}
            >
              <SelectTrigger aria-label={t('voice.voiceLabel')}>
                <SelectValue placeholder={isLoading ? t('voice.loadingVoices') : t('voice.selectVoice')} />
              </SelectTrigger>
              <SelectContent>
                {(voices?.length ?? 0) > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('clone.group.system')}
                    </div>
                    {voices?.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </>
                )}
                {cloneVoices.length > 0 && (
                  <>
                    <div className="mt-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                      {t('clone.group.cloned')}
                    </div>
                    {cloneVoices.map((v) => (
                      <SelectItem key={v.id} value={CLONE_PREFIX + v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </>
                )}
                {!isLoading && (voices?.length ?? 0) === 0 && cloneVoices.length === 0 && (
                  <div className="px-2 py-1.5 text-center text-xs text-muted-foreground">
                    {t('voice.errNoVoices')}
                  </div>
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="secondary"
              className="h-9 w-full text-xs"
              onClick={() => setManageOpen(true)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {cloneVoices.length ? t('clone.manage') : t('clone.new')}
            </Button>
          </div>

          {/* Rate/pitch/volume apply to system voices only; cloned voices are
              driven by the reference sample. Both states share ONE fixed-height
              glass panel and cross-fade, so the Preview button never jumps. */}
          <div className="glass relative h-[148px] overflow-hidden rounded-[var(--radius)] p-3">
            {/* Clone sample state */}
            <div
              className={`absolute inset-3 flex flex-col gap-2 transition-opacity duration-300 ease-out ${
                selectedIsClone ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              aria-hidden={!selectedIsClone}
            >
              <p className="flex items-start gap-1.5 rounded-[var(--radius)] border border-[var(--neon-1)]/25 bg-[var(--neon-1)]/[0.06] px-3 py-2 text-[11px] leading-relaxed text-primary/80">
                <Mic2 className="mt-px h-3.5 w-3.5 shrink-0" />
                {t('clone.disclaimer')}
              </p>
              {/* Instant per-voice sample (cached after first generation). */}
              <Button
                variant="outline"
                className="mt-auto h-9 w-full text-xs"
                onClick={handleListenVoice}
                disabled={!!cloneSynth}
              >
                <Volume2 className="h-3.5 w-3.5" />
                {t('clone.listenVoice')}
              </Button>
            </div>

            {/* System voice sliders state */}
            <div
              className={`absolute inset-3 flex flex-col justify-center gap-3 transition-opacity duration-300 ease-out ${
                selectedIsClone ? 'pointer-events-none opacity-0' : 'opacity-100'
              }`}
              aria-hidden={selectedIsClone}
            >
              <SliderRow
                icon={<Gauge className="h-3.5 w-3.5" />}
                label={t('voice.rate')}
                value={settings.rate}
                display={settings.rate > 0 ? `+${settings.rate}` : `${settings.rate}`}
                min={-10}
                max={10}
                onChange={(v) => setSettings({ rate: v })}
              />
              <SliderRow
                icon={<Music className="h-3.5 w-3.5" />}
                label={t('voice.pitch')}
                value={settings.pitch}
                display={`${settings.pitch > 0 ? '+' : ''}${settings.pitch}%`}
                min={-50}
                max={50}
                onChange={(v) => setSettings({ pitch: v })}
              />
              <SliderRow
                icon={<Volume2 className="h-3.5 w-3.5" />}
                label={t('voice.volume')}
                value={settings.volume}
                display={`${settings.volume}%`}
                min={0}
                max={100}
                onChange={(v) => setSettings({ volume: v })}
              />
            </div>
          </div>

          <Button
            variant={previewing ? 'secondary' : 'outline'}
            className="w-full"
            onClick={handlePreview}
            disabled={isLoading}
            aria-pressed={previewing}
          >
            {synthesizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : previewing ? (
              <Square className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {synthesizing ? t('voice.synthesizing') : previewing ? t('voice.stop') : t('voice.preview')}
          </Button>
          <audio ref={audioRef} className="hidden" onEnded={() => setPreviewing(false)} />
        </div>
      </ScrollArea>

      <CloneVoiceModal open={manageOpen} onClose={() => setManageOpen(false)} />
      <CloneSynthModal
        open={!!cloneSynth}
        phase={cloneSynth?.phase ?? 'starting'}
        percent={cloneSynth?.percent}
        etaSec={cloneSynth?.etaSec}
        canceling={cloneCanceling}
        onCancel={cancelCloneSynth}
      />
      <ModelDownloadModal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        onInstalled={() => toast.success(t('clone.model.ready'))}
      />
    </div>
  )
}
