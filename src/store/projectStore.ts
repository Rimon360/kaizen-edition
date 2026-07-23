import { create } from 'zustand'

interface ProjectState {
  name: string
  path: string | null
  setMeta: (name: string, path: string | null) => void
  reset: () => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  // Empty = untitled; the UI renders a translated label when name is empty.
  name: '',
  path: null,
  setMeta: (name, path) => set({ name, path }),
  reset: () => set({ name: '', path: null }),
}))
