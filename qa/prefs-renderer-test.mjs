// Runtime test of the renderer prefs logic (no Electron, no auth gate):
//  A. Restore sanitizes garbage off disk (bad position/font/color/numbers/template).
//  B. Autosave dedupe: typing narration text does NOT write; a style change DOES.
//  C. "New Project" (clearContent) keeps remembered style/voice and triggers no write.
import { pathToFileURL } from 'node:url'

const setCalls = []
let stored = null

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.window = {
  api: {
    isElectron: true,
    prefs: {
      getAll: async () => stored,
      set: async (p) => {
        setCalls.push(JSON.parse(JSON.stringify(p)))
        stored = p
        return p
      },
    },
  },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
function check(name, cond) {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

const m = await import(pathToFileURL(process.env.PREFS_ENTRY).href)
const { loadPrefs, startPrefsAutosave, useConfigStore, useVoiceStore, DEFAULT_CONFIG } = m
// Invalid fields fall back to the app's real default editor state, which is
// DEFAULT_SUBTITLE merged with the default template's preset — not the bare
// SubtitleConfig defaults. Assert against that.
const D = DEFAULT_CONFIG.subtitle

// ---- A. Restore from deliberately corrupt prefs ----
stored = {
  subtitle: {
    enabled: true,
    position: 'NONSENSE',
    fontSize: NaN,
    fontFamily: '',
    color: 'red',
    backgroundColor: '#000000',
    backgroundEnabled: 'yes',
    stroke: true,
    strokeColor: '#000000',
    strokeWidth: 999,
  },
  format: 'sideways',
  extras: { voiceOver: 'nope', soundEffects: true },
  template: 'unknown-template',
  voice: { voiceId: 42, rate: 999, pitch: -999, volume: 5000 },
}
await loadPrefs()
const sub = useConfigStore.getState().subtitle
const cfg = useConfigStore.getState()
const vs = useVoiceStore.getState().settings
console.log('\n[A] sanitize on restore')
check('position falls back from NONSENSE', sub.position === D.position)
check('fontSize falls back from NaN', sub.fontSize === D.fontSize)
check('fontFamily falls back from empty', sub.fontFamily === D.fontFamily)
check('color falls back from non-hex "red"', sub.color === D.color)
check('strokeWidth clamped 999 -> 30', sub.strokeWidth === 30)
check('backgroundEnabled coerced (string "yes" -> default)', sub.backgroundEnabled === D.backgroundEnabled)
check('format falls back from "sideways"', cfg.format === 'vertical' || cfg.format === 'horizontal')
check('template falls back from unknown', cfg.template !== 'unknown-template')
check('extras.soundEffects (valid bool) kept', cfg.extras.soundEffects === true)
check('voiceId falls back from number (=null)', vs.voiceId === null)
check('rate clamped 999 -> 10', vs.rate === 10)
check('pitch clamped -999 -> -50', vs.pitch === -50)
check('volume clamped 5000 -> 100', vs.volume === 100)

// ---- B. Autosave dedupe ----
startPrefsAutosave()
console.log('\n[B] autosave dedupe')
const baseline = setCalls.length
useVoiceStore.getState().setText('hello world this is narration text')
await sleep(550)
check('typing narration text writes nothing', setCalls.length === baseline)

useConfigStore.getState().setSubtitle({ position: 'top' })
await sleep(550)
check('changing subtitle position writes once', setCalls.length === baseline + 1)
check('written prefs reflect new position', setCalls.at(-1)?.subtitle.position === 'top')

// ---- C. New Project keeps remembered style/voice ----
console.log('\n[C] New Project keeps style')
useConfigStore.getState().setSubtitle({ position: 'middle' })
useVoiceStore.getState().setSettings({ volume: 33 })
useConfigStore.getState().setVoiceOverFile('C:/tmp/voice.wav')
await sleep(550)
const beforeClear = setCalls.length
useConfigStore.getState().clearContent()
useVoiceStore.getState().clearContent()
const sub2 = useConfigStore.getState().subtitle
const vs2 = useVoiceStore.getState().settings
check('subtitle style preserved through New Project', sub2.position === 'middle')
check('voice volume preserved through New Project', vs2.volume === 33)
check('voiceOverFile cleared', useConfigStore.getState().voiceOverFile === null)
check('narration text cleared', useVoiceStore.getState().text === '')
await sleep(550)
check('New Project does not rewrite prefs (dedupe)', setCalls.length === beforeClear)

console.log(`\n${failures === 0 ? 'RESULT: PASS — all renderer prefs checks passed.' : `RESULT: FAIL — ${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
