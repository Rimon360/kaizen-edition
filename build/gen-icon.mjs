// Generates build/icon.png (256x256) — a branded KAIZEN EDITION icon with a
// blue→indigo diagonal gradient and a white play triangle. Pure Node (zlib),
// no dependencies. electron-builder auto-converts this PNG to .ico/.icns.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const S = 256
const __dirname = dirname(fileURLToPath(import.meta.url))

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}
// brand colors
const c1 = [59, 130, 246] // #3b82f6
const c2 = [99, 102, 241] // #6366f1

function inTriangle(x, y) {
  // Centered play triangle pointing right.
  const cx = S * 0.42
  const left = S * 0.36
  const right = S * 0.66
  const half = S * 0.17
  if (x < left || x > right) return false
  const progress = (x - left) / (right - left)
  const yHalf = half * (1 - progress)
  return Math.abs(y - S * 0.5) <= yHalf && x >= left && cx >= 0
}

const raw = Buffer.alloc(S * (S * 4 + 1))
let p = 0
for (let y = 0; y < S; y++) {
  raw[p++] = 0 // filter: none
  for (let x = 0; x < S; x++) {
    const t = (x + y) / (2 * S)
    let r = lerp(c1[0], c2[0], t)
    let g = lerp(c1[1], c2[1], t)
    let b = lerp(c1[2], c2[2], t)
    // rounded-corner mask → transparent outside radius
    const radius = 52
    let a = 255
    const corners = [
      [radius, radius],
      [S - radius, radius],
      [radius, S - radius],
      [S - radius, S - radius],
    ]
    for (const [cxr, cyr] of corners) {
      const outsideX = (x < radius && cxr === radius) || (x > S - radius && cxr === S - radius)
      const outsideY = (y < radius && cyr === radius) || (y > S - radius && cyr === S - radius)
      if (outsideX && outsideY) {
        const d = Math.hypot(x - cxr, y - cyr)
        if (d > radius) a = 0
      }
    }
    if (inTriangle(x, y)) {
      r = 255
      g = 255
      b = 255
    }
    raw[p++] = r
    raw[p++] = g
    raw[p++] = b
    raw[p++] = a
  }
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync(join(__dirname, 'icon.png'), png)
console.log('wrote build/icon.png', png.length, 'bytes')
