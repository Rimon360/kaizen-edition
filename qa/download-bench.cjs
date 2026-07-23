// Decide whether parallel range downloads actually beat a single stream against
// HF's CDN. Handles truncation (re-requests short reads) so the comparison is fair.
const MODEL_URL =
  'https://huggingface.co/ResembleAI/chatterbox/resolve/main/t3_mtl23ls_v2.safetensors?download=true'

async function once(start, end) {
  const r = await fetch(MODEL_URL, { headers: { Range: `bytes=${start}-${end}` } })
  if (r.status !== 206) throw new Error('status ' + r.status)
  return (await r.arrayBuffer()).byteLength
}
// Fully fetch [start, start+len) even if the server truncates responses.
async function full(start, len) {
  let got = 0
  while (got < len) {
    let n = 0
    for (let i = 0; i < 6; i++) {
      try {
        n = await once(start + got, start + len - 1)
        break
      } catch {
        await new Promise((r) => setTimeout(r, 300))
      }
    }
    if (n === 0) throw new Error('no progress at offset ' + (start + got))
    got += n
  }
  return got
}

async function timed(label, fn) {
  const t = Date.now()
  const n = await fn()
  const s = (Date.now() - t) / 1000
  console.log(`${label}: ${(n / 1e6).toFixed(0)} MB in ${s.toFixed(1)}s = ${(n / 1e6 / s).toFixed(1)} MB/s`)
  return n / 1e6 / s
}

;(async () => {
  const SEG = 32 * 1024 * 1024
  // single: 128 MB as one logical stream
  const s = await timed('single (1 conn) ', () => full(0, 4 * SEG))
  // parallel: 128 MB as 4 concurrent 32 MB ranges (different bytes)
  const p = await timed('parallel (4 conn)', async () => {
    const r = await Promise.all([0, 1, 2, 3].map((k) => full((4 + k) * SEG, SEG)))
    return r.reduce((a, b) => a + b, 0)
  })
  console.log(`=> parallel is ${(p / s).toFixed(1)}x the single-stream throughput`)
  console.log(
    p / s > 1.5
      ? 'VERDICT: parallel HELPS — keep it (with truncation handling).'
      : 'VERDICT: parallel does NOT help (HF caps per-IP) — single-stream is the honest choice.',
  )
})().catch((e) => {
  console.log('ERR', e.message)
  process.exit(1)
})
