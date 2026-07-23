import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILE = () => join(app.getPath('userData'), 'auth.bin')

/**
 * Persist the JWT encrypted with the OS keychain (DPAPI on Windows) when
 * available, falling back to a plaintext file with a warning otherwise.
 */
export function saveToken(token: string): void {
  const file = FILE()
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(token).toString('base64')
    writeFileSync(file, JSON.stringify({ enc }), 'utf8')
  } else {
    console.warn('[tokenStore] safeStorage unavailable — storing token in plaintext')
    writeFileSync(file, JSON.stringify({ raw: token }), 'utf8')
  }
}

export function loadToken(): string | null {
  const file = FILE()
  if (!existsSync(file)) return null
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as { enc?: string; raw?: string }
    if (data.enc) {
      // Attempt decryption regardless of isEncryptionAvailable() — it throws
      // cleanly if genuinely unusable, which we surface instead of silently
      // logging the user out with no explanation.
      try {
        return safeStorage.decryptString(Buffer.from(data.enc, 'base64'))
      } catch (e) {
        console.warn('[tokenStore] could not decrypt stored token (safeStorage unavailable?):', e)
        return null
      }
    }
    if (data.raw) return data.raw
    return null
  } catch (err) {
    console.warn('[tokenStore] failed to read token:', err)
    return null
  }
}

export function clearToken(): void {
  const file = FILE()
  if (existsSync(file)) {
    try {
      rmSync(file)
    } catch {
      /* ignore */
    }
  }
}
