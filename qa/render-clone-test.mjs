// Mount the clone UI in jsdom and capture any render crash (React 19
// onUncaughtError) — to find the bug behind the blank window.
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
const { window } = dom
global.window = window
global.document = window.document
global.HTMLElement = window.HTMLElement
global.getComputedStyle = window.getComputedStyle
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

const React = (await import('react')).default
const { createElement: h } = React
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { pathToFileURL } = await import('node:url')
const mod = await import(pathToFileURL(process.env.CLONE_ENTRY).href)

let crash = null
async function renderOnce(label, el) {
  crash = null
  const container = window.document.createElement('div')
  window.document.body.appendChild(container)
  const root = createRoot(container, { onUncaughtError: (err) => { crash = err } })
  root.render(el)
  await new Promise((r) => setTimeout(r, 350))
  if (crash) {
    console.log(`${label}  CRASH: ${crash.message}`)
    console.log(String(crash.stack || '').split('\n').slice(1, 7).join('\n'))
  } else {
    console.log(`${label}  OK (rendered ${container.innerHTML.length + window.document.body.innerHTML.length} chars)`)
  }
  try { root.unmount() } catch {}
  container.remove()
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
await renderOnce('[CloneVoiceModal open=true]', h(mod.CloneVoiceModal, { open: true, onClose: () => {} }))
await renderOnce('[VoicePanel]', h(QueryClientProvider, { client: qc }, h(mod.VoicePanel, {})))
process.exit(0)
