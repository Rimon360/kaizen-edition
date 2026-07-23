import { electronApi } from '@/lib/electron'
import type {
  EditorPreferences,
  Segment,
  SubtitleConfig,
  SubtitlePosition,
  VoiceSettings,
} from '@/types'
import { TEMPLATES, SUBTITLE_POSITIONS } from '@/features/config/constants'
import { useConfigStore, DEFAULT_CONFIG } from './configStore'
import { useVoiceStore, DEFAULT_VOICE_SETTINGS } from './voiceStore'

// "Remember my settings": the editor's style/voice configuration AND its
// work-in-progress (narration script, transcript, loaded voice-over) are mirrored
// to userData/editor-prefs.json (via IPC) and restored on the next launch, so an
// accidental close/reload never loses the transcript. In a plain browser dev
// server (no Electron) we fall back to localStorage. The video queue is NOT kept
// here — that's what saved Projects are for.

const LS_KEY = 'kaizen.editor-prefs'
const SAVE_DEBOUNCE_MS = 400

/** Snapshot only the remembered subset of editor state. */
function currentPrefs(): EditorPreferences {
  const c = useConfigStore.getState()
  const v = useVoiceStore.getState()
  return {
    subtitle: c.subtitle,
    format: c.format,
    extras: c.extras,
    template: c.template,
    voice: v.settings,
    // Work-in-progress: the narration script + transcript + loaded voice-over, so
    // an accidental close/reload doesn't lose it (New Project clears these).
    work: {
      voiceText: v.text,
      transcriptText: v.transcriptText,
      transcriptSegments: v.transcriptSegments,
      voiceOverFile: c.voiceOverFile,
    },
  }
}

// --- Validation -------------------------------------------------------------
// editor-prefs.json is written only by this app, but it's a plain JSON file a
// user could hand-edit (or that an older app version wrote in a different shape).
// Every restored value feeds the UI and the ffmpeg ASS subtitle pipeline, so we
// clamp/allowlist each field and fall back to the default on anything invalid —
// a bad value must never reach the renderer as a malformed directive.

const POSITIONS = new Set<SubtitlePosition>(SUBTITLE_POSITIONS.map((p) => p.value))
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
}
function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}
function asHex(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX_COLOR.test(v) ? v : fallback
}

function sanitizeSubtitle(raw: unknown): SubtitleConfig {
  const d = DEFAULT_CONFIG.subtitle
  const r = (raw ?? {}) as Partial<SubtitleConfig>
  return {
    enabled: asBool(r.enabled, d.enabled),
    position:
      typeof r.position === 'string' && POSITIONS.has(r.position as SubtitlePosition)
        ? (r.position as SubtitlePosition)
        : d.position,
    fontSize: clampNum(r.fontSize, 8, 300, d.fontSize),
    fontFamily: typeof r.fontFamily === 'string' && r.fontFamily.trim() ? r.fontFamily : d.fontFamily,
    color: asHex(r.color, d.color),
    backgroundColor: asHex(r.backgroundColor, d.backgroundColor),
    backgroundEnabled: asBool(r.backgroundEnabled, d.backgroundEnabled),
    stroke: asBool(r.stroke, d.stroke),
    strokeColor: asHex(r.strokeColor, d.strokeColor),
    strokeWidth: clampNum(r.strokeWidth, 0, 30, d.strokeWidth),
    wordHighlightEnabled: asBool(r.wordHighlightEnabled, d.wordHighlightEnabled),
    wordHighlightColor: asHex(r.wordHighlightColor, d.wordHighlightColor),
    wordHighlightRadius: clampNum(r.wordHighlightRadius, 0, 40, d.wordHighlightRadius),
    wordHighlightMode: r.wordHighlightMode === 'word' ? 'word' : 'line',
    // Neon glow from the futuristic styles — only carry it through when present so
    // a saved glowing caption survives a restart instead of resetting to flat.
    ...(typeof r.glow === 'number' && Number.isFinite(r.glow) && r.glow > 0
      ? { glow: Math.min(30, Math.round(r.glow)) }
      : {}),
  }
}

function sanitizeVoice(raw: unknown): VoiceSettings {
  const d = DEFAULT_VOICE_SETTINGS
  const r = (raw ?? {}) as Partial<VoiceSettings>
  return {
    voiceId: typeof r.voiceId === 'string' && r.voiceId ? r.voiceId : d.voiceId,
    rate: clampNum(r.rate, -10, 10, d.rate),
    pitch: clampNum(r.pitch, -50, 50, d.pitch),
    volume: clampNum(r.volume, 0, 100, d.volume),
  }
}

/**
 * Restore remembered prefs into the stores. We write the saved subtitle/format
 * directly (NOT via setTemplate) so the user's exact tweaks are preserved rather
 * than being overwritten by the template's preset. Every field is validated and
 * falls back to its default when absent or invalid.
 */
function applyPrefs(p: EditorPreferences | null | undefined): void {
  if (!p || typeof p !== 'object') return
  const template = TEMPLATES.some((t) => t.value === p.template)
    ? p.template
    : useConfigStore.getState().template
  const extras = (p.extras ?? {}) as Partial<EditorPreferences['extras']>
  const w = (p.work ?? {}) as NonNullable<EditorPreferences['work']>
  const voiceOverFile = typeof w.voiceOverFile === 'string' && w.voiceOverFile ? w.voiceOverFile : null
  useConfigStore.setState({
    subtitle: sanitizeSubtitle(p.subtitle),
    format: p.format === 'horizontal' || p.format === 'vertical' ? p.format : DEFAULT_CONFIG.format,
    extras: {
      voiceOver: asBool(extras.voiceOver, DEFAULT_CONFIG.extras.voiceOver),
      soundEffects: asBool(extras.soundEffects, DEFAULT_CONFIG.extras.soundEffects),
      normalizeAudio: asBool(extras.normalizeAudio, DEFAULT_CONFIG.extras.normalizeAudio),
    },
    template,
    voiceOverFile,
  })
  // Prefs load during boot before any voice interaction, so saved values win.
  // Restore the narration script + transcript so a reload keeps the user's work.
  useVoiceStore.setState({
    settings: sanitizeVoice(p.voice),
    text: typeof w.voiceText === 'string' ? w.voiceText : '',
    transcriptText: typeof w.transcriptText === 'string' ? w.transcriptText : null,
    transcriptSegments: Array.isArray(w.transcriptSegments) ? (w.transcriptSegments as Segment[]) : null,
    narrationPath: voiceOverFile,
  })
}

let lastSerialized = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null

function flushSave(): void {
  const prefs = currentPrefs()
  const serialized = JSON.stringify(prefs)
  // Skip writes when nothing in the remembered snapshot changed (debounced, so a
  // burst of edits collapses to one write).
  if (serialized === lastSerialized) return
  lastSerialized = serialized
  if (electronApi?.prefs) {
    void electronApi.prefs.set(prefs).catch(() => {
      /* keep in-memory value; retry on next change */
    })
  } else {
    try {
      localStorage.setItem(LS_KEY, serialized)
    } catch {
      /* storage unavailable — ignore */
    }
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
}

/** Load remembered prefs on boot. Resolves even if nothing is saved or it fails. */
export async function loadPrefs(): Promise<void> {
  try {
    if (electronApi?.prefs) {
      applyPrefs(await electronApi.prefs.getAll())
    } else {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) applyPrefs(JSON.parse(raw) as EditorPreferences)
    }
  } catch {
    /* defaults stand */
  }
  // Baseline the dedupe so the first post-load change is what triggers a write,
  // not the restore itself.
  lastSerialized = JSON.stringify(currentPrefs())
}

let started = false

/** Begin mirroring config/voice changes to disk. Returns a stop function. */
export function startPrefsAutosave(): () => void {
  if (started) return () => {}
  started = true
  const unsubConfig = useConfigStore.subscribe(scheduleSave)
  const unsubVoice = useVoiceStore.subscribe(scheduleSave)
  return () => {
    unsubConfig()
    unsubVoice()
    if (saveTimer) clearTimeout(saveTimer)
    started = false
  }
}
