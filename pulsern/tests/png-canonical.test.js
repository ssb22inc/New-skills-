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
  it("refuses what it cannot represent", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow();
    expect(isCanonicalPng(Buffer.from("GIF89a"))).toBe(false);
  });
});
