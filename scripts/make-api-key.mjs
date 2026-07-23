// Mint a KAIZEN EDITION "Clave API" — a single opaque key that bundles a whole
// environment's connection config (backend URL + API/HMAC secrets + client).
// The operator pastes the printed key into Settings → Clave API. No technical
// fields are exposed in the app; one key fully configures one environment.
//
// Usage:
//   node scripts/make-api-key.mjs \
//     --url   https://www.kaizzen.org/s/<route-version> \
//     --api   <API_SECRET> \
//     --hmac  <HMAC_SECRET> \
//     [--client software]
//
// Tip: run without args to be shown this help.

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
      out[key] = val
    }
  }
  return out
}

function b64url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const args = parseArgs(process.argv.slice(2))
const url = args.url || args.u
const api = args.api || args.a
const hmac = args.hmac || args.h
const client = args.client || args.c || 'software'

if (!api || !hmac) {
  console.log(`KAIZEN EDITION — API key generator

Required:
  --api   <API_SECRET>     (must match the backend's API_SECRET)
  --hmac  <HMAC_SECRET>    (must match the backend's HMAC_SECRET)
Optional:
  --url   <backend base URL>   (e.g. https://www.kaizzen.org/s/<route-version>)
  --client <client>            (default: software)

Example:
  node scripts/make-api-key.mjs --url https://www.kaizzen.org/s/abc --api 1234... --hmac 5678...
`)
  process.exit(api && hmac ? 0 : 1)
}

const payload = { a: api, h: hmac }
if (url) payload.u = url.replace(/\/+$/, '')
if (client) payload.c = client

const key = 'kz1.' + b64url(JSON.stringify(payload))
console.log('\nClave API:\n')
console.log(key)
console.log(`\n(${key.length} chars — paste this into Settings → Clave API)\n`)
