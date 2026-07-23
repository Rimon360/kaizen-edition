import { create } from 'zustand'
import type { Segment, VoiceSettings } from '@/types'

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voiceId: null,
  rate: 0,
  pitch: 0,
  volume: 100,
}

interface VoiceState {
  text: string
  settings: VoiceSettings
  /** Path to the most recently synthesized narration WAV (for muxing/preview). */
  narrationPath: string | null
  /** Live transcription progress (model download → inference), or null when idle. */
  transcribing: {
    phase: 'downloading' | 'loading' | 'transcribing'
    percent: number
    etaSec?: number
  } | null
  /** True while a cloned-voice synthesis is running (locks the studio like a render). */
  cloneSynthesizing: boolean
  /** The transcript text exactly as produced (to detect manual edits). */
  transcriptText: string | null
  /** Timed caption segments from transcription — used to burn synced subtitles. */
  transcriptSegments: Segment[] | null
  /** When true, the export uses the queued video's OWN audio as the voice-over
   *  (keeping the real speech) instead of an uploaded file or generated TTS. Driven
   *  by the "Use the video's audio" checkbox; auto-set by "Transcribe from video".
   *  Unchecking it after transcribing re-voices the transcript with TTS. */
  useVideoAudio: boolean
  /** Live partial transcript streamed from the model (shown in the modal). */
  transcribePartial: string
  /** True while a Stop request is in flight (modal shows a spinner). */
  transcribeCanceling: boolean
  setText: (text: string) => void
  setSettings: (patch: Partial<VoiceSettings>) => void
  setNarrationPath: (path: string | null) => void
  setTranscribing: (
    t: { phase: 'downloading' | 'loading' | 'transcribing'; percent: number; etaSec?: number } | null,
  ) => void
  setCloneSynthesizing: (b: boolean) => void
  setTranscript: (text: string, segments: Segment[]) => void
  setUseVideoAudio: (b: boolean) => void
  setTranscribePartial: (s: string) => void
  setTranscribeCanceling: (b: boolean) => void
  clearTranscript: () => void
  hydrate: (text: string, settings: VoiceSettings) => void
  /** Clear per-job content (text, narration, transcript) but keep voice settings. */
  clearContent: () => void
  reset: () => void
}

export const useVoiceStore = create<VoiceState>((set) => ({
  text: '',
  settings: DEFAULT_VOICE_SETTINGS,
  narrationPath: null,
  transcribing: null,
  cloneSynthesizing: false,
  transcriptText: null,
  transcriptSegments: null,
  useVideoAudio: false,
  transcribePartial: '',
  transcribeCanceling: false,

  setText: (text) =>
    set((s) => {
      // Editing a transcript invalidates its timed segments (we can't re-time
      // hand-edited text), so captions fall back to even distribution.
      const stillTranscript = s.transcriptText != null && text.trim() === s.transcriptText.trim()
      return {
        text,
        transcriptText: stillTranscript ? s.transcriptText : null,
        transcriptSegments: stillTranscript ? s.transcriptSegments : null,
      }
    }),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setNarrationPath: (narrationPath) => set({ narrationPath }),
  // Ending a run (null) also clears the modal's partial/cancel state in one place.
  setTranscribing: (transcribing) =>
    set(transcribing
      ? { transcribing }
      : { transcribing: null, transcribeCanceling: false, transcribePartial: '' }),
  setCloneSynthesizing: (cloneSynthesizing) => set({ cloneSynthesizing }),
  setTranscript: (text, segments) =>
    set({ text, transcriptText: text, transcriptSegments: segments, transcribing: null }),
  setUseVideoAudio: (useVideoAudio) => set({ useVideoAudio }),
  setTranscribePartial: (transcribePartial) => set({ transcribePartial }),
  setTranscribeCanceling: (transcribeCanceling) => set({ transcribeCanceling }),
  clearTranscript: () =>
    set({ transcriptText: null, transcriptSegments: null, transcribing: null }),
  hydrate: (text, settings) =>
    set({
      text,
      settings,
      transcriptText: null,
      transcriptSegments: null,
      useVideoAudio: false,
      transcribing: null,
    }),
  // "New Project" uses this: wipe the narration text/audio/transcript without
  // forgetting the remembered voice (voiceId/rate/pitch/volume).
  clearContent: () =>
    set({
      text: '',
      narrationPath: null,
      transcriptText: null,
      transcriptSegments: null,
      useVideoAudio: false,
      transcribing: null,
    }),
  reset: () =>
    set({
      text: '',
      settings: DEFAULT_VOICE_SETTINGS,
      narrationPath: null,
      transcribing: null,
      transcriptText: null,
      transcriptSegments: null,
      useVideoAudio: false,
    }),
}))
