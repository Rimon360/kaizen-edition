// Verify the transcript "work" (script + transcript + loaded voice-over) is
// persisted and restored, so an accidental reload doesn't lose it.
import { pathToFileURL } from 'node:url'

const setCalls = []
let stored = null
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.window = {
  api: {
    isElectron: true,
    prefs: {
      getAll: async () => stored,
      set: async (p) => { setCalls.push(JSON.parse(JSON.stringify(p))); stored = p; return p },
    },
  },
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (name, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}`); if (!cond) failures++ }

const m = await import(pathToFileURL(process.env.PREFS_ENTRY).href)
const { loadPrefs, startPrefsAutosave, useConfigStore, useVoiceStore } = m

// --- Restore work from a saved snapshot (simulates reopening the app) ---
stored = {
  subtitle: { enabled: true, position: 'bottom', fontSize: 70, fontFamily: 'Arial', color: '#ffffff', backgroundColor: '#000000', backgroundEnabled: false, stroke: true, strokeColor: '#000000', strokeWidth: 3 },
  format: 'vertical',
  extras: { voiceOver: true, soundEffects: false, normalizeAudio: false },
  template: 'motivational',
  voice: { voiceId: null, rate: 0, pitch: 0, volume: 100 },
  work: {
    voiceText: 'Hola, esto es una prueba de transcripción.',
    transcriptText: 'Hola, esto es una prueba de transcripción.',
    transcriptSegments: [{ start: 0, end: 2.5, text: 'Hola, esto es una prueba de transcripción.' }],
    voiceOverFile: 'C:/audio/voz.mp3',
  },
}
await loadPrefs()
console.log('[A] restore transcript on reload')
check('voice text restored', useVoiceStore.getState().text === stored.work.voiceText)
check('transcriptText restored', useVoiceStore.getState().transcriptText === stored.work.transcriptText)
check('transcriptSegments restored', (useVoiceStore.getState().transcriptSegments || []).length === 1)
check('voiceOverFile restored', useConfigStore.getState().voiceOverFile === 'C:/audio/voz.mp3')
check('narrationPath set to the voice-over', useVoiceStore.getState().narrationPath === 'C:/audio/voz.mp3')

// --- Editing the script now persists (the key ask) ---
startPrefsAutosave()
console.log('\n[B] script edits are saved')
const base = setCalls.length
useVoiceStore.getState().setText('Texto editado por el usuario.')
await sleep(550)
check('a write occurred after editing text', setCalls.length > base)
check('saved work.voiceText reflects the edit', setCalls.at(-1)?.work?.voiceText === 'Texto editado por el usuario.')

console.log(`\n${failures === 0 ? 'RESULT: PASS — transcript work persists + restores.' : `RESULT: FAIL — ${failures} failed.`}`)
process.exit(failures === 0 ? 0 : 1)
