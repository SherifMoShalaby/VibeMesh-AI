// Dependency-light PNG cropper (8-bit RGB/RGBA, non-interlaced) — node:zlib only.
// Decodes a PNG, crops a rectangle, re-encodes. Used to tile a busy reference
// sheet into clean per-feature crops (the "reference preprocessing" lever).
//   node bench/imgcrop.mjs <in.png> <out.png> <x> <y> <w> <h>
import fs from 'node:fs'
import zlib from 'node:zlib'

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let off = 8
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]; interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (bitDepth !== 8) throw new Error('only 8-bit supported, got ' + bitDepth)
  if (interlace !== 0) throw new Error('interlaced PNG not supported')
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0
  if (!channels) throw new Error('unsupported colorType ' + colorType)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = channels
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++]
    for (let x = 0; x < stride; x++) {
      const filt = raw[pos++]
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let val
      switch (ft) {
        case 0: val = filt; break
        case 1: val = filt + a; break
        case 2: val = filt + b; break
        case 3: val = filt + ((a + b) >> 1); break
        case 4: val = filt + paeth(a, b, c); break
        default: throw new Error('bad filter ' + ft)
      }
      out[y * stride + x] = val & 0xff
    }
  }
  return { width, height, channels, data: out }
}

export function encodePng({ width, height, channels, data }) {
  const stride = width * channels
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter None
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const colorType = channels === 3 ? 2 : channels === 4 ? 6 : channels === 1 ? 0 : 4
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const chunk = (type, payload) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(payload.length, 0)
    const tb = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, payload])) >>> 0, 0)
    return Buffer.concat([len, tb, payload, crc])
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function crop(img, x, y, w, h) {
  x = Math.max(0, Math.min(img.width, Math.round(x)))
  y = Math.max(0, Math.min(img.height, Math.round(y)))
  w = Math.max(1, Math.min(img.width - x, Math.round(w)))
  h = Math.max(1, Math.min(img.height - y, Math.round(h)))
  const ch = img.channels
  const out = Buffer.alloc(w * h * ch)
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * img.width + x) * ch
    img.data.copy(out, row * w * ch, srcStart, srcStart + w * ch)
  }
  return { width: w, height: h, channels: ch, data: out }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inPath, outPath, x, y, w, h] = process.argv.slice(2)
  if (!outPath) { console.error('usage: imgcrop.mjs <in.png> <out.png> <x> <y> <w> <h>'); process.exit(1) }
  const img = decodePng(fs.readFileSync(inPath))
  const c = crop(img, +x, +y, +w, +h)
  fs.writeFileSync(outPath, encodePng(c))
  console.log(`cropped ${inPath} (${img.width}x${img.height}) -> ${outPath} (${c.width}x${c.height}) @ ${x},${y}`)
}
