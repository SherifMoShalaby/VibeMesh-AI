/**
 * Generate public/og.png — the 1200×630 social-share card for link unfurls (OpenGraph / Twitter).
 * Self-contained: no image library (none is installed), just Node's built-in zlib for the PNG IDAT.
 * Re-run with `node scripts/gen-og.mjs` if the brand mark / wordmark changes.
 *
 * Draws: a vertical dark gradient (matching the app's #0d0e11 shell) + a faint accent glow, the
 * favicon's hexagon mark in the brand orange, the "VIBEMESH-AI" wordmark (a tiny inline 5×7 font),
 * a tagline, and an accent underline.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const W = 1200
const H = 630
const buf = Buffer.alloc(W * H * 3) // RGB

const ACCENT = [245, 121, 42] // #f5792a (favicon mark)
const INK = [237, 239, 243] // light wordmark
const SUB = [150, 156, 166] // muted tagline

const px = (x, y, [r, g, b], a = 1) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 3
  buf[i] = Math.round(buf[i] * (1 - a) + r * a)
  buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + g * a)
  buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + b * a)
}

// ── background: vertical gradient + a soft accent glow behind the mark ──
for (let y = 0; y < H; y++) {
  const t = y / H
  const r = Math.round(13 * (1 - t) + 7 * t)
  const g = Math.round(14 * (1 - t) + 8 * t)
  const b = Math.round(17 * (1 - t) + 10 * t)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b
  }
}
const glowCx = W / 2, glowCy = 232, glowR = 300
for (let y = glowCy - glowR; y < glowCy + glowR; y++) {
  for (let x = glowCx - glowR; x < glowCx + glowR; x++) {
    const d = Math.hypot(x - glowCx, y - glowCy)
    if (d < glowR) px(x, y, ACCENT, 0.08 * (1 - d / glowR))
  }
}

// ── hexagon mark (favicon geometry): flat-top hex outline ring ──
function hexPoly(cx, cy, R) {
  // matches favicon's pointy-side hex (vertices at top/bottom + 4 sides)
  const pts = []
  for (let k = 0; k < 6; k++) {
    const ang = Math.PI / 2 + (k * Math.PI) / 3 // start at top
    pts.push([cx + R * Math.cos(ang), cy + R * Math.sin(ang)])
  }
  return pts
}
function inPoly(x, y, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const hexCx = W / 2, hexCy = 232, hexR = 96
const outer = hexPoly(hexCx, hexCy, hexR)
const inner = hexPoly(hexCx, hexCy, hexR - 11)
for (let y = hexCy - hexR - 2; y <= hexCy + hexR + 2; y++) {
  for (let x = hexCx - hexR - 2; x <= hexCx + hexR + 2; x++) {
    if (inPoly(x, y, outer) && !inPoly(x, y, inner)) px(x, y, ACCENT)
  }
}
// two node dots, echoing the favicon
for (const [nx, ny] of [[hexCx + 34, hexCy - 40], [hexCx + 44, hexCy + 36]]) {
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 30) px(nx + x, ny + y, ACCENT)
}

// ── tiny 5×7 font (only the glyphs the card needs) ──
const FONT = {
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '&': ['01100', '10010', '10010', '01100', '10101', '10010', '01101'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}
function text(str, cx, top, scale, color, a = 1) {
  const gw = 5 * scale, gap = scale, adv = gw + gap
  const total = str.length * adv - gap
  let x0 = Math.round(cx - total / 2)
  for (const ch of str) {
    const g = FONT[ch] || FONT[' ']
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (g[r][c] === '1') for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) px(x0 + c * scale + dx, top + r * scale + dy, color, a)
    }
    x0 += adv
  }
}

text('VIBEMESH-AI', W / 2, 372, 13, INK)
// accent underline
for (let y = 372 + 7 * 13 + 24; y < 372 + 7 * 13 + 30; y++) for (let x = W / 2 - 150; x < W / 2 + 150; x++) px(x, y, ACCENT)
text('TEXT & IMAGE TO 3D-PRINTABLE CAD', W / 2, 372 + 7 * 13 + 54, 5, SUB)

// ── encode PNG (RGB, no alpha) ──
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff }

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 // 8-bit, RGB
// raw scanlines with filter byte 0
const raw = Buffer.alloc(H * (1 + W * 3))
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0
  buf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(new URL('../public/og.png', import.meta.url), png)
console.log(`wrote public/og.png — ${W}×${H}, ${(png.length / 1024).toFixed(1)} KB`)
