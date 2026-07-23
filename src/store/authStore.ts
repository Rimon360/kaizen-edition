import { create } from 'zustand'
import type { User } from '@/types'
import { tokenBridge } from '@/lib/electron'

interface AuthState {
  token: string | null
  user: User | null
  /** True once the persisted token has been read from secure storage. */
  hydrated: boolean

  hydrate: () => Promise<void>
  setToken: (token: string) => Promise<void>
  setUser: (user: User | null) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  hydrate: async () => {
    const token = await tokenBridge.getToken().catch(() => null)
    set({ token, hydrated: true })
  },

  setToken: async (token: string) => {
    await tokenBridge.setToken(token).catch(() => undefined)
    set({ token })
  },

  setUser: (user) => set({ user }),

  logout: async () => {
    await tokenBridge.clearToken().catch(() => undefined)
    set({ token: null, user: null })
  },
}))

/** Synchronous accessor for the axios interceptor. */
export const getToken = (): string | null => useAuthStore.getState().token
