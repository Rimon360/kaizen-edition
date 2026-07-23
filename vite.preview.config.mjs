import { defineConfig } from 'vite'

// Standalone static preview of the built renderer (out/renderer) for visual QA
// in a browser. The real app runs under Electron via electron-vite.
export default defineConfig({
  build: { outDir: 'out/renderer' },
  preview: { port: 4188, strictPort: true },
})
