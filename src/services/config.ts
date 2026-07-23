// Runtime backend connection config.
//
// For public, multi-environment distribution the operator pastes a single
// "API key" (Clave API) in Settings. That key is an opaque, base64url-encoded
// bundle of everything an environment needs — { url, apiSecret, hmacSecret,
// client } — so there is no technical server-URL / secret field in the UI and
// the same build works against any deployment. Compile-time .env values are the
// fallback when no key has been entered yet.

const ENV_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const ENV_API_SECRET = (import.meta.env.VITE_API_SECRET as string | undefined) ?? ''
const ENV_HMAC_SECRET = (import.meta.env.VITE_HMAC_SECRET as string | undefined) ?? ''
const ENV_CLIENT_ID = (import.meta.env.VITE_CLIENT_ID as string | undefined) ?? 'software'

let baseUrl = ENV_URL
let apiSecret = ENV_API_SECRET
let hmacSecret = ENV_HMAC_SECRET
let clientId = ENV_CLIENT_ID

export function getApiBaseUrl(): string {
  return baseUrl
}
export function setApiBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '')
}
export function getApiSecret(): string {
  return apiSecret
}
export function getHmacSecret(): string {
  return hmacSecret
}
export function getClientId(): string {
  return clientId
}

/** True once a usable API key (or .env fallback) provides the connection secrets. */
export function isConfigured(): boolean {
  return Boolean(baseUrl && apiSecret && hmacSecret)
}

interface ApiKeyPayload {
  u?: string // url
  a?: string // apiSecret
  h?: string // hmacSecret
  c?: string // client
}

function b64urlDecode(input: string): string {
  let s = input.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  // handle any UTF-8 bytes safely
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(s), (ch: string) => '%' + ('00' + ch.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  )
}

/**
 * Decode + apply a Clave API. Accepts an optional `kzN.` version prefix.
 * Returns ok=false (without changing config) when the key is malformed.
 */
export function applyApiKey(key: string): { ok: boolean; error?: string } {
  // NOTE: returns i18n KEYS in `error` (config.ts can't import the translator
  // without a cycle); the caller resolves them with t(result.error).
  const trimmed = (key ?? '').trim()
  if (!trimmed) return { ok: false, error: 'settings.toast.invalidApiKey' }
  try {
    const body = trimmed.replace(/^kz\d*\./, '')
    const payload = JSON.parse(b64urlDecode(body)) as ApiKeyPayload
    if (!payload.a || !payload.h) {
      return { ok: false, error: 'settings.apiKey.missingCreds' }
    }
    apiSecret = payload.a
    hmacSecret = payload.h
    if (payload.u) setApiBaseUrl(payload.u)
    if (payload.c) clientId = payload.c
    return { ok: true }
  } catch {
    return { ok: false, error: 'settings.toast.invalidApiKey' }
  }
}
