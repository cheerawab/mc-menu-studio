// Small deterministic PNG encoder (8-bit RGBA) and a matching decoder (used by tests and the client simulation).
// Deterministic: the per-row filter is chosen by the classic minimum-sum heuristic and deflate runs at a fixed level.
import { unzlibSync, zlibSync } from 'fflate';
import { PNG_DEFLATE_LEVEL } from './constants';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function filterByte(t: number, x: number, a: number, b: number, c: number): number {
  switch (t) {
    case 1: return (x - a) & 0xff;
    case 2: return (x - b) & 0xff;
    case 3: return (x - ((a + b) >> 1)) & 0xff;
    case 4: return (x - paeth(a, b, c)) & 0xff;
    default: return x;
  }
}

/** Encodes straight-alpha RGBA pixels as an 8-bit RGBA, non-interlaced PNG. */
export function encodePng(width: number, height: number, rgba: ArrayLike<number>): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error(`bad PNG size ${width}x${height}`);
  if (rgba.length !== width * height * 4) throw new Error('PNG pixel buffer has the wrong length');
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  const cand = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride, prev = row - stride;
    // the five filter sums in one pass; the first type with the smallest sum wins (classic min-sum heuristic)
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
    for (let i = 0; i < stride; i++) {
      const x = rgba[row + i];
      const a = i >= 4 ? rgba[row + i - 4] : 0;
      const b = y > 0 ? rgba[prev + i] : 0;
      const c = y > 0 && i >= 4 ? rgba[prev + i - 4] : 0;
      let v = x;
      s0 += v < 128 ? v : 256 - v;
      v = (x - a) & 0xff;
      s1 += v < 128 ? v : 256 - v;
      v = (x - b) & 0xff;
      s2 += v < 128 ? v : 256 - v;
      v = (x - ((a + b) >> 1)) & 0xff;
      s3 += v < 128 ? v : 256 - v;
      v = (x - paeth(a, b, c)) & 0xff;
      s4 += v < 128 ? v : 256 - v;
    }
    const sums = [s0, s1, s2, s3, s4];
    let bestType = 0;
    for (let t = 1; t < 5; t++) if (sums[t] < sums[bestType]) bestType = t;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? rgba[row + i - 4] : 0;
      const b = y > 0 ? rgba[prev + i] : 0;
      const c = y > 0 && i >= 4 ? rgba[prev + i - 4] : 0;
      cand[i] = filterByte(bestType, rgba[row + i], a, b, c);
    }
    const o = y * (stride + 1);
    raw[o] = bestType;
    raw.set(cand, o + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8); // bit depth 8, colour type 6 (RGBA), deflate, adaptive filtering, no interlace
  const parts = [
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: PNG_DEFLATE_LEVEL })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Decodes the PNGs this module writes (8-bit RGBA, non-interlaced, any filter). Verifies chunk CRCs. */
export function decodePng(png: Uint8Array): { width: number; height: number; data: Uint8Array } {
  for (let i = 0; i < 8; i++) if (png[i] !== SIGNATURE[i]) throw new Error('not a PNG');
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let off = 8, width = 0, height = 0;
  const idat: Uint8Array[] = [];
  while (off < png.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(...png.subarray(off + 4, off + 8));
    const data = png.subarray(off + 8, off + 8 + len);
    if (crc32(png.subarray(off + 4, off + 8 + len)) !== dv.getUint32(off + 8 + len)) throw new Error(`bad CRC in ${type}`);
    if (type === 'IHDR') {
      width = dv.getUint32(off + 8);
      height = dv.getUint32(off + 12);
      const [depth, colour, , , interlace] = data.subarray(8, 13);
      if (depth !== 8 || colour !== 6 || interlace !== 0) throw new Error('unsupported PNG format');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const joined = new Uint8Array(idat.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const d of idat) {
    joined.set(d, p);
    p += d.length;
  }
  const raw = unzlibSync(joined);
  const stride = width * 4;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const t = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, row = y * stride, prev = row - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? out[row + i - 4] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = y > 0 && i >= 4 ? out[prev + i - 4] : 0;
      const x = raw[src + i];
      const pred = t === 1 ? a : t === 2 ? b : t === 3 ? (a + b) >> 1 : t === 4 ? paeth(a, b, c) : 0;
      out[row + i] = (x + pred) & 0xff;
    }
  }
  return { width, height, data: out };
}
