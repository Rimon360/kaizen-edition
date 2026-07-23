import { create } from 'zustand'
import type { QueueItem } from '@/types'
import { electronApi } from '@/lib/electron'

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function makeItem(path: string): QueueItem {
  return {
    id: crypto.randomUUID(),
    path,
    name: basename(path),
    duration: null,
    thumbnail: null,
    width: null,
    height: null,
    status: 'idle',
  }
}

interface QueueState {
  items: QueueItem[]
  addPaths: (paths: string[]) => void
  remove: (id: string) => void
  duplicate: (id: string) => void
  move: (id: string, dir: -1 | 1) => void
  /** Sort clips by filename, alphanumerically (natural order: clip2 before clip10). */
  sort: () => void
  clear: () => void
  hydratePaths: (entries: Array<{ path: string; name: string }>) => void
  probe: (id: string) => Promise<void>
}

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],

  addPaths: (paths) => {
    const existing = new Set(get().items.map((i) => i.path))
    const fresh = paths.filter((p) => !existing.has(p)).map(makeItem)
    if (fresh.length === 0) return
    set((s) => ({ items: [...s.items, ...fresh] }))
    // Kick off probing for each new clip.
    fresh.forEach((item) => get().probe(item.id))
  },

  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  duplicate: (id) =>
    set((s) => {
      const idx = s.items.findIndex((i) => i.id === id)
      if (idx === -1) return s
      const copy: QueueItem = { ...s.items[idx], id: crypto.randomUUID() }
      const items = [...s.items]
      items.splice(idx + 1, 0, copy)
      return { items }
    }),

  move: (id, dir) =>
    set((s) => {
      const idx = s.items.findIndex((i) => i.id === id)
      const target = idx + dir
      if (idx === -1 || target < 0 || target >= s.items.length) return s
      const items = [...s.items]
      ;[items[idx], items[target]] = [items[target], items[idx]]
      return { items }
    }),

  sort: () =>
    set((s) => ({
      items: [...s.items].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      ),
    })),

  clear: () => set({ items: [] }),

  hydratePaths: (entries) =>
    set({
      items: entries.map((e) => ({ ...makeItem(e.path), name: e.name })),
    }),

  probe: async (id) => {
    const api = electronApi
    const item = get().items.find((i) => i.id === id)
    if (!item || !api) return
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, status: 'probing' } : i)),
    }))
    try {
      const res = await api.ffmpeg.probe(item.path)
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id
            ? {
                ...i,
                duration: res.duration,
                width: res.width,
                height: res.height,
                thumbnail: res.thumbnail ? api.shell.toMediaUrl(res.thumbnail) : null,
                status: res.error ? 'error' : 'ready',
                error: res.error,
              }
            : i,
        ),
      }))
    } catch (err) {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id ? { ...i, status: 'error', error: (err as Error).message } : i,
        ),
      }))
    }
  },
}))
