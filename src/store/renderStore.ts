import { create } from 'zustand'

export type RenderStatus = 'idle' | 'preparing' | 'rendering' | 'done' | 'error' | 'canceled'

interface LogLine {
  id: number
  text: string
}

interface RenderState {
  status: RenderStatus
  percent: number
  stage: string
  /** Estimated seconds remaining (from ffmpeg's encode speed); null when unknown. */
  etaSec: number | null
  jobId: string | null
  outputPath: string | null
  error: string | null
  logs: LogLine[]
  logCounter: number

  start: (jobId: string) => void
  setProgress: (percent: number, stage: string, etaSec?: number | null) => void
  appendLog: (text: string) => void
  finish: (outputPath: string) => void
  fail: (error: string) => void
  cancel: () => void
  reset: () => void
}

const MAX_LOGS = 200

export const useRenderStore = create<RenderState>((set) => ({
  status: 'idle',
  percent: 0,
  stage: '',
  etaSec: null,
  jobId: null,
  outputPath: null,
  error: null,
  logs: [],
  logCounter: 0,

  start: (jobId) =>
    set({ status: 'preparing', percent: 0, stage: 'Preparando…', etaSec: null, jobId, outputPath: null, error: null }),

  // Once a job is canceled, late progress/finish events from an in-flight
  // pipeline must NOT resurrect it to 'rendering'/'done' (which would re-lock the
  // UI). A fresh export calls start() → 'preparing' first, so this never blocks a
  // new job.
  setProgress: (percent, stage, etaSec) =>
    set((s) =>
      s.status === 'canceled' ? {} : { percent, stage, etaSec: etaSec ?? null, status: 'rendering' },
    ),

  appendLog: (text) =>
    set((s) => {
      const id = s.logCounter + 1
      const logs = [...s.logs, { id, text }].slice(-MAX_LOGS)
      return { logs, logCounter: id }
    }),

  finish: (outputPath) =>
    set((s) => (s.status === 'canceled' ? {} : { status: 'done', percent: 100, stage: 'Completado', outputPath })),
  fail: (error) => set({ status: 'error', error }),
  cancel: () => set({ status: 'canceled', stage: 'Cancelado' }),

  reset: () =>
    set({ status: 'idle', percent: 0, stage: '', jobId: null, outputPath: null, error: null, logs: [] }),
}))

/**
 * True while an export/render job is preparing or running. The whole studio UI
 * locks against this so the user can't mutate the queue, config, voice, or kick
 * off a second export mid-render — only the Cancel button stays live.
 */
export const useIsRendering = (): boolean =>
  useRenderStore((s) => s.status === 'preparing' || s.status === 'rendering')
