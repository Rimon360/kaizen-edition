// Web-Crypto HMAC-SHA256 signer — ported from the proven kaizen_desktop axiosConfig.
// The backend validates HMAC-SHA256(HMAC_SECRET, `${timestamp}:${nonce}:${body}`).

async function computeHmac(secret: string, message: string): Promise<string> {
  if (!secret) {
    throw new Error('VITE_HMAC_SECRET está vacío — configúralo para que coincida con el backend.')
  }
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function generateNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface SecurityHeaders {
  'x-api-secret': string
  'x-timestamp': string
  'x-nonce': string
  'x-signature': string
}

/** Build the four security headers for a request body string (empty for multipart). */
export async function buildSecurityHeaders(
  apiSecret: string,
  hmacSecret: string,
  bodyStr: string,
): Promise<SecurityHeaders> {
  const timestamp = Date.now().toString()
  const nonce = generateNonce()
  const signature = await computeHmac(hmacSecret, `${timestamp}:${nonce}:${bodyStr}`)
  return {
    'x-api-secret': apiSecret,
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-signature': signature,
  }
}
