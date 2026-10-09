/* Canonical PNG — the only raster form the Astra review accepts.
   ------------------------------------------------------------------
   A reviewer shown an image sees its pixels, not its bytes. Any byte that
   does not change what is drawn — a text or palette chunk, the colour of a
   fully transparent pixel, the low byte of a 16-bit sample, the padding
   bits of a low-depth row, the choice of Huffman tables in the compressed
   data — can carry something the review never sees (Astra, PR #134 review,
   rounds 10 and 11). So an accepted PNG must be EXACTLY what this module
   writes for its own pixels:

     signature · IHDR (8-bit, grey / grey+alpha / RGB / RGBA, no interlace)
     · one IDAT · IEND

   and the IDAT is this module's own deflate: every row unfiltered, one
   fixed-Huffman block, greedy LZ77 — deterministic code in this file, not
   a library whose output can change between versions. Transparent pixels
   carry colour 0. Given the pixels there is exactly one accepted file, so
   there is nowhere left to hide anything.

   To make an image acceptable:   node ops/png-canonical.mjs file.png …
   (rewrites each file in place; it must already be 8-bit grey/RGB(A)). */
import { inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };
const MAX_RAW = 64 * 1024 * 1024;

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, sum]);
}

/* Decodes an 8-bit, non-interlaced grey/RGB(A) PNG to its pixels.
   Throws on anything else. Only IHDR and IDAT are read; whether other
   chunks were present is settled by the canonical comparison. */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  let at = 8, ihdr = null;
  const idat = [];
  while (at + 12 <= buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.subarray(at + 4, at + 8).toString("latin1");
    if (at + 12 + len > buf.length) throw new Error("truncated chunk");
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") ihdr = data;
    if (type === "IDAT") idat.push(data);
    at += 12 + len;
    if (type === "IEND") break;
  }
  if (!ihdr || ihdr.length !== 13) throw new Error("no IHDR");
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const [depth, colour, comp, filter, interlace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
  const ch = CHANNELS[colour];
  if (depth !== 8 || !ch) throw new Error("only 8-bit grey, grey+alpha, RGB or RGBA PNGs are accepted");
  if (comp !== 0 || filter !== 0 || interlace !== 0) throw new Error("interlaced or non-standard PNG");
  if (!width || !height) throw new Error("empty image");
  const stride = width * ch;
  const rawSize = (stride + 1) * height;
  if (rawSize > MAX_RAW) throw new Error("image too large");
  const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: rawSize });
  if (raw.length !== rawSize) throw new Error("image data has the wrong size");
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const up = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[i - ch] : 0, b = up ? up[i] : 0, c = up && i >= ch ? up[i - ch] : 0;
      let p;
      if (f === 0) p = 0;
      else if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else throw new Error(`bad filter type ${f}`);
      out[i] = (src[i] + p) & 0xff;
    }
  }
  return { width, height, colour, pixels };
}

/* ---- Deterministic deflate: one fixed-Huffman block, greedy LZ77 ------ */
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

class BitWriter {
  constructor() { this.bytes = []; this.cur = 0; this.n = 0; }
  bits(value, count) {           // LSB first
    for (let i = 0; i < count; i++) {
      this.cur |= ((value >>> i) & 1) << this.n;
      if (++this.n === 8) { this.bytes.push(this.cur); this.cur = 0; this.n = 0; }
    }
  }
  code(value, count) {           // Huffman codes go MSB first
    for (let i = count - 1; i >= 0; i--) this.bits((value >>> i) & 1, 1);
  }
  done() { if (this.n) this.bytes.push(this.cur); return Buffer.from(this.bytes); }
}
function writeSymbol(w, s) {
  if (s < 144) w.code(0x30 + s, 8);
  else if (s < 256) w.code(0x190 + s - 144, 9);
  else if (s < 280) w.code(s - 256, 7);
  else w.code(0xc0 + s - 280, 8);
}
function upperIndex(table, v) { let i = table.length - 1; while (table[i] > v) i--; return i; }
function adler32(buf) {
  let a = 1, b = 0;
  for (const x of buf) { a = (a + x) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
export function canonicalDeflate(data) {
  const w = new BitWriter();
  w.bits(1, 1); w.bits(1, 2);                    // final block, fixed Huffman
  const head = new Int32Array(1 << 16).fill(-1);
  const key = (i) => (data[i] << 8 ^ data[i + 1] << 4 ^ data[i + 2]) & 0xffff;
  let i = 0;
  while (i < data.length) {
    let len = 0, dist = 0;
    if (i + 2 < data.length) {
      const k = key(i), cand = head[k];
      head[k] = i;
      if (cand >= 0 && i - cand <= 32768) {
        const max = Math.min(258, data.length - i);
        let l = 0;
        while (l < max && data[cand + l] === data[i + l]) l++;
        if (l >= 3) { len = l; dist = i - cand; }
      }
    }
    if (len) {
      const li = upperIndex(LEN_BASE, len);
      writeSymbol(w, 257 + li); w.bits(len - LEN_BASE[li], LEN_EXTRA[li]);
      const di = upperIndex(DIST_BASE, dist);
      w.code(di, 5); w.bits(dist - DIST_BASE[di], DIST_EXTRA[di]);
      for (let j = i + 1; j < i + len && j + 2 < data.length; j++) head[key(j)] = j;
      i += len;
    } else {
      writeSymbol(w, data[i]); i += 1;
    }
  }
  writeSymbol(w, 256);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(adler32(data));
  return Buffer.concat([Buffer.from([0x78, 0x01]), w.done(), sum]);
}

/* The one accepted file for these pixels. Transparent pixels get colour 0,
   since their colour is never drawn. */
export function encodeCanonicalPng({ width, height, colour, pixels }) {
  const ch = CHANNELS[colour];
  if (!ch) throw new Error("unsupported colour type");
  const px = Buffer.from(pixels);
  if (colour === 4 || colour === 6) {
    for (let p = 0; p < px.length; p += ch) if (px[p + ch - 1] === 0) px.fill(0, p, p + ch - 1);
  }
  const stride = width * ch;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = colour;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", canonicalDeflate(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export const canonicalPng = (buf) => encodeCanonicalPng(decodePng(buf));
export function isCanonicalPng(buf) {
  try { return canonicalPng(buf).equals(buf); } catch { return false; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let failed = 0;
  for (const f of process.argv.slice(2)) {
    try {
      const out = canonicalPng(readFileSync(f));
      writeFileSync(f, out);
      console.log(`canonical: ${f} (${out.length.toLocaleString()} bytes)`);
    } catch (e) { failed += 1; console.error(`${f}: ${e.message}`); }
  }
  process.exit(failed ? 1 : 0);
}
