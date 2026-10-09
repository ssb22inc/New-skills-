/* Does canonical PNG conversion leave every image looking exactly the same?
   ------------------------------------------------------------------
   Checked by an independent decoder — Chromium — not by our own: each
   image and its canonical form are drawn to a canvas and every RGBA value
   compared (Astra, PR #134 review, round 12: the unit test compared two
   decodes by the same transparency-blind decoder, so it could not see a
   lost tRNS). Also confirms that an image whose rendering depends on a
   chunk the converter cannot carry is refused rather than converted.

   Runs every PNG tracked under pulsern/ plus built-in fixtures. Exit 1 on
   any difference. Needs Chromium (CI installs it for the player checks). */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { launchBrowser } from "./browser.mjs";
import { canonicalPng, encodeCanonicalPng } from "./png-canonical.mjs";

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, sum]);
};
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/* An ordinary (zlib, Paeth-filtered) RGBA image with soft and full transparency. */
function fixtureRgba() {
  const w = 16, h = 8, rows = [];
  for (let y = 0; y < h; y++) {
    const row = [4];   // Paeth filter on every row, to exercise the decoder
    const raw = [];
    for (let x = 0; x < w; x++) raw.push((x * 16) & 255, (y * 32) & 255, 128, x < 4 ? 0 : x < 8 ? 128 : 255);
    // Paeth-encode against the previous raw row
    const prev = rows.length ? rows[rows.length - 1].raw : null;
    for (let i = 0; i < raw.length; i++) {
      const a = i >= 4 ? raw[i - 4] : 0, b = prev ? prev[i] : 0, c = prev && i >= 4 ? prev[i - 4] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      row.push((raw[i] - p) & 255);
    }
    rows.push({ raw, row });
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(rows.flatMap((r) => r.row)))), chunk("tEXt", Buffer.from("Comment\0fixture")), chunk("IEND", Buffer.alloc(0))]);
}
/* RGB with a tRNS colour key: red is transparent. Must be refused. */
function fixtureColourKey() {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("tRNS", Buffer.from([0, 255, 0, 0, 0, 0])), chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 0, 0, 255]))), chunk("IEND", Buffer.alloc(0))]);
}

/* Astra's round-14 case: a credential in the red channel under alpha 1.
   Raw RGBA (filter 0), written by zlib — not canonical. */
function fixtureLowAlpha(text) {
  const bytes = Buffer.from(text, "latin1");
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(bytes.length, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const row = [0];
  for (const b of bytes) row.push(b, 0, 0, 1);
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(row))), chunk("IEND", Buffer.alloc(0))]);
}

const tracked = execFileSync("git", ["ls-files", "--", "*.png", "*.PNG"], { encoding: "utf8" }).split("\n").filter(Boolean);
const cases = [
  ...tracked.map((f) => ({ name: f, bytes: readFileSync(f) })),
  { name: "fixture: Paeth-filtered RGBA with transparency", bytes: fixtureRgba() },
  { name: "fixture: canonical grey+alpha", bytes: encodeCanonicalPng({ width: 3, height: 1, colour: 4, pixels: Buffer.from([10, 0, 20, 128, 30, 255]) }) },
];

const browser = await launchBrowser();
let failed = 0;
try {
  const page = await browser.newPage();
  const pixels = (bytes) => page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { colorSpace: "srgb" });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
    return { w: c.width, h: c.height, hash: h, n: d.length };
  }, bytes.toString("base64"));

  for (const { name, bytes } of cases) {
    const a = await pixels(bytes);
    const b = await pixels(canonicalPng(bytes));
    const same = a.w === b.w && a.h === b.h && a.hash === b.hash && a.n === b.n;
    if (!same) failed += 1;
    console.log(`${same ? "same" : "DIFFERENT"}  ${name}  ${a.w}×${a.h}`);
  }
  /* Two different hidden payloads under alpha 1 that the browser draws
     identically must canonicalise to the same bytes: nothing survives
     that the pixels do not show. */
  const secret = fixtureLowAlpha("KEY=s3cr3t!"), blank = fixtureLowAlpha("\0".repeat(11));
  const drawnSame = (await pixels(secret)).hash === (await pixels(blank)).hash;
  const bytesSame = canonicalPng(secret).equals(canonicalPng(blank));
  console.log(`${drawnSame ? "drawn alike" : "drawn differently"}, ${bytesSame ? "canonical bytes identical" : "CANONICAL BYTES DIFFER"}  fixture: credential under alpha 1`);
  if (drawnSame && !bytesSame) failed += 1;
  let refused = false;
  try { canonicalPng(fixtureColourKey()); } catch { refused = true; }
  if (!refused) failed += 1;
  console.log(`${refused ? "refused" : "CONVERTED"}  fixture: RGB with a tRNS colour key`);
} finally {
  await browser.close();
}
if (failed) { console.error(`${failed} image check(s) failed.`); process.exit(1); }
console.log("Canonical PNG conversion leaves every image looking the same.");
