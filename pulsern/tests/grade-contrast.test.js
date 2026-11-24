/* Grade buttons have to stay readable in both themes. Night mode paints
   --danger-ink as a pale coral; white text on it was about 2:1. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

function lin(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function contrast(fg, bg) {
  const hi = Math.max(lum(fg), lum(bg));
  const lo = Math.min(lum(fg), lum(bg));
  return (hi + 0.05) / (lo + 0.05);
}

function block(src, start) {
  const i = src.indexOf(start);
  return src.slice(i, src.indexOf("}", i) + 1);
}

describe("grade button contrast", () => {
  const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const light = block(src, ".app{");
  const dim = block(src, '.app[data-theme="dim"]{');
  const pick = (css, name) => css.match(new RegExp(`${name}:(#[0-9A-Fa-f]{6})`))[1];

  it("keeps every grade at least 4.5:1 in light and night mode", () => {
    const againDim = "#1C0E0C";
    expect(src).toMatch(/\.app\[data-theme="dim"\] \.grade\.again\{color:#1C0E0C\}/);
    const pairs = [
      ["#FFFFFF", pick(light, "--danger-ink")],
      [againDim, pick(dim, "--danger-ink")],
      ["#3A2A08", pick(light, "--amber")],
      ["#3A2A08", pick(dim, "--amber")],
      ["#FFFFFF", pick(light, "--teal")],
      [pick(dim, "--btn-ink"), pick(dim, "--teal")],
      ["#FFFFFF", "#0A5A4E"],
    ];
    for (const [fg, bg] of pairs) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("gives the lab search a focus ring of at least 3:1 against the card", () => {
    expect(src).toMatch(/\.lp-search:focus-within\{[^}]*box-shadow:0 0 0 3px var\(--accent-ink\)/);
    expect(contrast(pick(light, "--accent-ink"), pick(light, "--card"))).toBeGreaterThanOrEqual(3);
    expect(contrast(pick(dim, "--accent-ink"), pick(dim, "--card"))).toBeGreaterThanOrEqual(3);
  });
});
