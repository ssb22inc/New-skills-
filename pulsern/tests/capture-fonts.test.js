/* REVIEW-3 B1: the product capture must refuse to run without its pinned
   fonts instead of silently drawing with system fallbacks. */
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertCaptureFontFiles, assertCaptureFontsLoaded, REQUIRED_CAPTURE_FONT_FILES, REQUIRED_CAPTURE_FACES } from "../ops/capture-product-screenshots.mjs";
import { launchBrowser } from "../ops/browser.mjs";

let browser;
afterAll(async () => { await browser?.close(); });

describe("product capture fonts", () => {
  it("the installed node_modules has every pinned capture font", async () => {
    await expect(assertCaptureFontFiles()).resolves.toBeUndefined();
  });

  it("a checkout missing one font package fails before capturing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "capfonts-"));
    for (const file of REQUIRED_CAPTURE_FONT_FILES.filter((f) => !f.includes("dejavu-sans"))) {
      await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await fs.writeFile(path.join(dir, file), "");
    }
    await expect(assertCaptureFontFiles(dir)).rejects.toThrow(/missing \(run npm ci\): @fontsource\/dejavu-sans/);
  });

  it("a face that fails to load in the page stops the capture", async () => {
    browser = await launchBrowser({ proxy: undefined });
    const page = await browser.newPage();
    const faces = Object.entries(REQUIRED_CAPTURE_FACES).flatMap(([family, n]) =>
      Array.from({ length: n }, (_, i) => `@font-face{font-family:"${family}";src:url("data:font/woff2;base64,AAAA${i}") format("woff2");font-weight:${400 + i * 100}}`));
    await page.setContent(`<style>${faces.join("")}</style><p>x</p>`);
    await expect(assertCaptureFontsLoaded(page)).rejects.toThrow(/Capture fonts did not load/);
    await expect(assertCaptureFontsLoaded(page, ["404 http://x/a.woff2"])).rejects.toThrow(/404/);
  }, 60_000);
});
