/**
 * P36a — the installable client's icons.
 *
 * Committed PNGs would be opaque binaries nobody can review, so the mark
 * is generated from code: INK field (Design Language token #0B1A26), an
 * ocean ring, and a warm-paper disc at the centre. Maskable-safe — the
 * mark sits inside the inner 80% so Android's circle crop never clips it.
 *
 *   node apps/web/scripts/generate-icons.mjs
 *
 * Written by hand against the PNG spec rather than adding an image
 * dependency for two files (Constitution §7, boring by default).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const INK = [0x0b, 0x1a, 0x26];
const OCEAN = [0x01, 0xba, 0xef];
const PAPER = [0xf7, 0xf3, 0xec];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function iconPng(size) {
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const ringOuter = size * 0.38;
  const ringInner = size * 0.32;
  const disc = size * 0.22;

  // One filter byte (0 = none) per scanline, then RGB triples.
  const raw = Buffer.alloc(size * (1 + size * 3));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const color = d <= disc ? PAPER : d <= ringOuter && d >= ringInner ? OCEAN : INK;
      raw[p++] = color[0];
      raw[p++] = color[1];
      raw[p++] = color[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, iconPng(size));
  console.info(`wrote ${file}`);
}
