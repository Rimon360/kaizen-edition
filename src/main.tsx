import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable fonts (offline, CSP-safe). Imported here so Vite bundles
// the woff2 assets. Upright weight axis only — no italics. Family names:
// "Inter Variable", "Space Grotesk Variable", "JetBrains Mono Variable".
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/space-grotesk/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
