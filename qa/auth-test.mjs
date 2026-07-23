// End-to-end test of the auth transport against the LIVE appCBL backend.
// Replicates the renderer's HMAC signing (electron axiosConfig / src/utils/hmac.ts)
// and confirms the backend ACCEPTS the signature/secret/routing — without needing
// valid credentials (a "credentials invalid" reply proves the transport works).
import crypto from 'node:crypto'

const BASE = 'https://www.kaizzen.org/s/vHwxhS39x9wSS393xxhS3xhS9wxwxx3hh9wx9wxhS39'
const API_SECRET = 'e958bc1d7e33bf791b3cf3fdd76fa648001cda81cf0256beb3655c245134814a'
const HMAC_SECRET = '7b8c3461cb72b5074cee79360bd582fa3de805249192127c7ea9ffa570d921b3'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS  ${m}`) } else { fail++; console.log(`  FAIL  ${m}`) } }

function sign(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex')
}
function headers(bodyStr, { badSig = false, token, origin } = {}) {
  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()
  const signature = badSig ? 'deadbeef'.repeat(8) : sign(HMAC_SECRET, `${timestamp}:${nonce}:${bodyStr}`)
  const h = {
    'Content-Type': 'application/json',
    'x-api-secret': API_SECRET,
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-signature': signature,
  }
  if (token) h['Authorization'] = 'Bearer ' + token
  if (origin) h['Origin'] = origin
  return h
}
async function req(method, path, body, opts = {}) {
  const bodyStr = body ? JSON.stringify(body) : ''
  try {
    const r = await fetch(BASE + path, { method, headers: headers(bodyStr, opts), body: body ? bodyStr : undefined })
    let data = null
    try { data = await r.json() } catch { data = await r.text().catch(() => null) }
    return { status: r.status, msg: (data && data.message) || (typeof data === 'string' ? data.slice(0, 120) : JSON.stringify(data)?.slice(0, 120)) }
  } catch (e) {
    return { status: -1, msg: 'NETWORK: ' + String(e) }
  }
}

async function main() {
  console.log(`BASE = ${BASE}\n`)
  if (typeof fetch !== 'function') { console.log('  FAIL  global fetch unavailable (need Node 18+)'); process.exit(1) }

  // 1. Valid signature, dummy credentials → backend should reach the controller
  //    and reject CREDENTIALS (not the signature/secret/origin).
  const r1 = await req('POST', '/api/users/login', { email: 'qa-nonexistent@example.com', password: 'wrongpw-zzz', client: 'software' })
  console.log(`  [login valid-HMAC dummy-creds] ${r1.status} :: ${r1.msg}`)
  const credsRejected = r1.status === 400 || r1.status === 401 || r1.status === 403 || r1.status === 503
  ok(r1.status !== -1, 'backend reachable over HTTPS')
  ok(credsRejected && !/firma|signature|secret|api-secret|origen/i.test(r1.msg || ''),
    'valid HMAC accepted → request reached auth controller (credential-level rejection)')

  // 2. BAD signature → backend must REJECT it (proves HMAC is actually enforced).
  const r2 = await req('POST', '/api/users/login', { email: 'x@x.com', password: 'x' }, { badSig: true })
  console.log(`  [login bad-HMAC] ${r2.status} :: ${r2.msg}`)
  ok(r2.status === 401 || r2.status === 403, `bad signature rejected (status ${r2.status}) → HMAC is enforced`)

  // 3. verify-token with bogus bearer → token-level rejection (endpoint + HMAC ok).
  const r3 = await req('GET', '/api/verify-token', null, { token: 'bogus.jwt.token' })
  console.log(`  [verify-token bogus] ${r3.status} :: ${r3.msg}`)
  ok(r3.status === 401 || r3.status === 403, `verify-token rejects bogus JWT (status ${r3.status})`)

  // 4. Characterize the origin guard for the packaged renderer (file:// → Origin: null).
  const r4 = await req('POST', '/api/users/login', { email: 'q@q.com', password: 'x', client: 'software' }, { origin: 'null' })
  console.log(`  [login Origin:null] ${r4.status} :: ${r4.msg}`)
  const originNullOk = !/origen no permitido|acceso denegado/i.test(r4.msg || '')
  ok(originNullOk, `Origin:null (packaged file:// renderer) not blocked by origin guard (status ${r4.status})`)

  console.log(`\n==== AUTH TRANSPORT: ${pass} passed, ${fail} failed ====`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('FATAL', e); process.exit(2) })
