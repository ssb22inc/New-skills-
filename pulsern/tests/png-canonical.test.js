/* ops/png-canonical.mjs: the one PNG encoding the Astra review accepts
   (PR #134 review, round 11). Its deflate is our own code, so it is checked
   against zlib's inflate on varied data, and the canonical form against the
   real images already in the repository. */
import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { canonicalDeflate, decodePng, encodeCanonicalPng, canonicalPng, isCanonicalPng } from "../ops/png-canonical.mjs";

describe("canonical deflate", () => {
  it.each([
    ["empty", Buffer.alloc(0)],
    ["one byte", Buffer.from("a")],
    ["repetitive", Buffer.from("abcabcabc".repeat(5000))],
    ["random", randomBytes(70000)],
    ["long runs", Buffer.alloc(300000, 7)],
    ["far repeats", Buffer.concat([randomBytes(40000), randomBytes(1000), randomBytes(40000)])],
  ])("round-trips %s through zlib", (_, data) => {
    expect(inflateSync(canonicalDeflate(data)).equals(data)).toBe(true);
  });
  it("is deterministic", () => {
    const d = randomBytes(5000);
    expect(canonicalDeflate(d).equals(canonicalDeflate(Buffer.from(d)))).toBe(true);
  });
});

describe("canonical PNG", () => {
  it("keeps every pixel of the repository's real images", () => {
    const files = execFileSync("git", ["ls-files", "public"], { encoding: "utf8" }).split("\n").filter((f) => /\.png$/i.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const orig = decodePng(readFileSync(f));
      const canon = canonicalPng(readFileSync(f));
      const back = decodePng(canon);
      const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[orig.colour];
      // identical, except that fully transparent pixels carry colour 0
      let differ = -1;
      for (let p = 0; p < orig.pixels.length && differ < 0; p += ch) {
        if ((orig.colour === 4 || orig.colour === 6) && orig.pixels[p + ch - 1] === 0) continue;
        for (let k = 0; k < ch; k++) if (back.pixels[p + k] !== orig.pixels[p + k]) { differ = p; break; }
      }
      expect(differ, `${f}: first differing pixel byte`).toBe(-1);
      expect(isCanonicalPng(canon), f).toBe(true);
    }
  }, 120000);
  it("gives fully transparent pixels colour 0, and nothing else", () => {
    const png = encodeCanonicalPng({ width: 2, height: 1, colour: 6, pixels: Buffer.from([1, 2, 3, 0, 4, 5, 6, 7]) });
    expect([...decodePng(png).pixels]).toEqual([0, 0, 0, 0, 4, 5, 6, 7]);
  });
  /* Round 12: tRNS was ignored and a transparent background became
     opaque. Anything that changes how the image is drawn is refused
     before a byte is written. */
  it("refuses a source whose rendering depends on a chunk it would drop", () => {
    const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const body = Buffer.concat([Buffer.from(t, "latin1"), d]); const s = Buffer.alloc(4); s.writeUInt32BE(crc(body)); return Buffer.concat([l, body, s]); };
    const base = encodeCanonicalPng({ width: 2, height: 1, colour: 2, pixels: Buffer.from([255, 0, 0, 0, 0, 255]) });
    const insert = (type, data) => Buffer.concat([base.subarray(0, 33), chunk(type, data), base.subarray(33)]);
    for (const [type, data] of [
      ["tRNS", Buffer.from([0, 255, 0, 0, 0, 0])],      // red is transparent
      ["gAMA", Buffer.from([0, 0, 0xb1, 0x8f])],
      ["iCCP", Buffer.from("p\0\0x")],
      ["eXIf", Buffer.from("MM")],
      ["acTL", Buffer.alloc(8)],
      ["zzZz", Buffer.from("unknown")],
    ]) {
      expect(() => canonicalPng(insert(type, data)), type).toThrow(new RegExp(type));
    }
    // chunks that do not affect drawing are simply dropped
    expect(canonicalPng(insert("tEXt", Buffer.from("Comment\0x"))).equals(base)).toBe(true);
  });
  it("refuses what it cannot represent", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow();
    expect(isCanonicalPng(Buffer.from("GIF89a"))).toBe(false);
  });
});
