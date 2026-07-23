// Mount the clone UI in jsdom and capture the render crash behind the blank window.
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
const { window } = dom
global.window = window
global.document = window.document
global.getComputedStyle = window.getComputedStyle
// Expose the DOM constructors Radix/React reference as bare globals.
for (const k of [
  'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MutationObserver', 'Event',
  'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'NodeFilter', 'DOMParser',
  'HTMLInputElement', 'HTMLDivElement', 'DOMRect', 'Text', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'Blob', 'URL',
]) {
  if (window[k] !== undefined) global[k] = window[k]
}
global.requestAnimationFrame = global.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 0))
global.cancelAnimationFrame = global.cancelAnimationFrame || ((id) => clearTimeout(id))
window.ResizeObserver = global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
window.matchMedia = () => ({ matches: false, media: '', onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } })
window.scrollTo = () => {}
if (!window.PointerEvent) window.PointerEvent = window.MouseEvent
for (const m of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture', 'scrollIntoView']) {
  window.HTMLElement.prototype[m] = window.HTMLElement.prototype[m] || function () { return false }
}
window.api = {
  isElectron: true, platform: 'win32',
  clone: { list: async () => [], status: async () => ({ available: true, mode: 'dev' }), add: async () => ({ id: 'x', name: 'x', createdAt: 0, language: 'es', sampleFile: 'x.wav' }), remove: async () => [], rename: async () => [], synthesize: async () => ({ ok: false }), cancel() {}, onProgress: () => () => {} },
  dialog: { openAudio: async () => ({ canceled: true, paths: [] }) },
  tts: { listVoices: async () => [], readAudio: async () => new Uint8Array() },
  shell: { toMediaUrl: (p) => p },
}

const b = require('./_clone-bundle.cjs') // require AFTER jsdom globals are set
const { React, createRoot, QueryClient, QueryClientProvider, CloneVoiceModal, CloneSynthModal, VoicePanel, useVoiceStore, useCloneStore } = b
const h = React.createElement

let crash = null
async function renderOnce(label, el) {
  crash = null
  const container = window.document.createElement('div')
  window.document.body.appendChild(container)
  const root = createRoot(container, { onUncaughtError: (err) => { crash = err } })
  root.render(el)
  await new Promise((r) => setTimeout(r, 400))
  if (crash) {
    console.log(`${label}  CRASH: ${crash.message}`)
    console.log(String(crash.stack || '').split('\n').slice(1, 8).join('\n'))
  } else {
    console.log(`${label}  OK (rendered ${window.document.body.innerHTML.length} chars)`)
  }
  try { root.unmount() } catch {}
  container.remove()
}

;(async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await renderOnce('[CloneVoiceModal open]', h(CloneVoiceModal, { open: true, onClose: () => {} }))
  await renderOnce('[CloneSynthModal starting]', h(CloneSynthModal, { open: true, phase: 'starting', canceling: false, onCancel: () => {} }))
  await renderOnce('[CloneSynthModal loading]', h(CloneSynthModal, { open: true, phase: 'loading', canceling: true, onCancel: () => {} }))

  // Now simulate a CLONED VOICE SELECTED + a saved voice in the library.
  useCloneStore.setState({
    voices: [{ id: 'abc', name: 'Mi voz', createdAt: 1, language: 'es', sampleFile: 'a.wav', durationSec: 5 }],
    status: { available: true, mode: 'dev' },
    loaded: true,
  })
  useVoiceStore.setState({ settings: { voiceId: 'clone:abc', rate: 0, pitch: 0, volume: 100 } })
  await renderOnce('[VoicePanel + cloned voice selected]', h(QueryClientProvider, { client: qc }, h(VoicePanel, {})))

  // CloneVoiceModal with a saved voice listed (delete path).
  await renderOnce('[CloneVoiceModal w/ saved voice]', h(CloneVoiceModal, { open: true, onClose: () => {} }))
  process.exit(0)
})()
