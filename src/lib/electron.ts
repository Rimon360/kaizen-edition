import type { AuthBridge, KaizenApi } from '@/types/electron'

/** True when running inside the Electron shell (vs a plain browser dev server). */
export const isElectron = typeof window !== 'undefined' && !!window.api?.isElectron

/** The Electron API bridge, or null in a plain browser. */
export const electronApi: KaizenApi | null =
  typeof window !== 'undefined' ? (window.api ?? null) : null

/**
 * Token bridge — uses Electron safeStorage when available, otherwise falls back
 * to localStorage so the app still works in a browser dev server.
 */
export const tokenBridge: AuthBridge =
  typeof window !== 'undefined' && window.auth
    ? window.auth
    : {
        getToken: async () => localStorage.getItem('token'),
        setToken: async (t: string) => localStorage.setItem('token', t),
        clearToken: async () => localStorage.removeItem('token'),
      }
