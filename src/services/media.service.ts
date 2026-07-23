import { electronApi } from '@/lib/electron'
import { tx } from '@/i18n'
import type { RenderRequest, RenderResult, TtsRequest, TtsResult, Voice } from '@/types'

/**
 * Media services. Local-first: these proxy to the Electron main process
 * (FFmpeg + Windows SAPI). The layer is intentionally thin so a remote backend
 * (/voices, /generate-tts, /render-video) can be swapped in later.
 */

const FALLBACK_VOICES: Voice[] = [
  { id: 'Microsoft David Desktop', name: 'Microsoft David (en-US, Male)', culture: 'en-US', gender: 'Male', source: 'backend' },
  { id: 'Microsoft Zira Desktop', name: 'Microsoft Zira (en-US, Female)', culture: 'en-US', gender: 'Female', source: 'backend' },
  { id: 'Microsoft Sabina Desktop', name: 'Microsoft Sabina (es-MX, Female)', culture: 'es-MX', gender: 'Female', source: 'backend' },
]

export async function listVoices(): Promise<Voice[]> {
  // In the desktop app, only ever offer voices that are actually installed —
  // returning the placeholder FALLBACK ids would synthesize in the wrong voice.
  // The static fallback is only for a plain browser (no Electron) preview.
  if (!electronApi) return FALLBACK_VOICES
  return electronApi.tts.listVoices()
}

export async function synthesize(req: TtsRequest): Promise<TtsResult> {
  if (!electronApi) return { ok: false, error: tx('common.desktopOnly') }
  return electronApi.tts.synthesize(req)
}

export async function renderJob(jobId: string, req: RenderRequest): Promise<RenderResult> {
  if (!electronApi) return { jobId, ok: false, error: tx('common.desktopOnly') }
  return electronApi.ffmpeg.render(jobId, req)
}
