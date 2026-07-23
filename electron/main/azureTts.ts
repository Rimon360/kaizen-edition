import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TtsRequest, TtsResult, Voice } from '../shared/types'

// Azure Speech (Cognitive Services) TTS via the REST API. The subscription key
// + region live in Settings and are read here in the MAIN process, so the call
// never originates from the web/renderer layer. Opt-in only — the default voice
// engine remains local Windows SAPI.

let tmp: string | null = null
function temp(): string {
  if (tmp && existsSync(tmp)) return tmp
  tmp = mkdtempSync(join(tmpdir(), 'kaizen-azure-'))
  return tmp
}

export function cleanupAzureTemp(): void {
  if (tmp && existsSync(tmp)) {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
    tmp = null
  }
}

function host(region: string): string {
  return `https://${region.trim()}.tts.speech.microsoft.com`
}

interface AzureVoiceInfo {
  Name: string
  DisplayName: string
  ShortName: string
  Gender: string
  Locale: string
}

export async function listAzureVoices(region: string, key: string): Promise<Voice[]> {
  try {
    const res = await fetch(`${host(region)}/cognitiveservices/voices/list`, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    })
    if (!res.ok) {
      console.warn('[azureTts] voices/list failed:', res.status, await res.text().catch(() => ''))
      return []
    }
    const data = (await res.json()) as AzureVoiceInfo[]
    return data.map((v) => ({
      id: v.ShortName,
      name: `${v.DisplayName} (${v.Locale}, ${v.Gender})`,
      culture: v.Locale,
      gender: v.Gender,
      source: 'azure' as const,
    }))
  } catch (err) {
    console.warn('[azureTts] listAzureVoices error:', err)
    return []
  }
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function localeFromVoiceId(voiceId: string): string {
  const m = voiceId.match(/^([a-z]{2}-[A-Z]{2})/)
  return m ? m[1] : 'en-US'
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export async function synthesizeAzure(
  req: TtsRequest,
  region: string,
  key: string,
): Promise<TtsResult> {
  const out =
    req.outputPath ?? join(temp(), `azure-${Date.now()}-${Math.floor(Math.random() * 1e6)}.wav`)
  try {
    const locale = localeFromVoiceId(req.voiceId)
    // Map UI sliders → SSML prosody. rate: -10..10 → %, pitch: -50..50 → %, volume: 0..100.
    const ratePct = clamp(Math.round(req.rate * 8), -90, 200)
    const pitchPct = clamp(Math.round(req.pitch), -50, 50)
    const volume = clamp(Math.round(req.volume), 0, 100)
    const rateStr = `${ratePct >= 0 ? '+' : ''}${ratePct}%`
    const pitchStr = `${pitchPct >= 0 ? '+' : ''}${pitchPct}%`

    const ssml =
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
      `<voice name='${xmlEscape(req.voiceId)}'>` +
      `<prosody rate='${rateStr}' pitch='${pitchStr}' volume='${volume}'>${xmlEscape(req.text)}</prosody>` +
      `</voice></speak>`

    const res = await fetch(`${host(region)}/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
        'User-Agent': 'KAIZEN-EDITION',
      },
      body: ssml,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Azure TTS error ${res.status}: ${text.slice(0, 160) || res.statusText}`,
      }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 64) return { ok: false, error: 'Azure devolvió un audio vacío.' }
    writeFileSync(out, buf)
    return { ok: true, outputPath: out }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
