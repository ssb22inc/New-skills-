#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { canonicalPng, decodePng, encodeCanonicalPng } from "./png-canonical.mjs";

/* The fixed moment every capture is taken at (UTC). */
export const CAPTURE_TIME = "2026-10-30T12:00:00Z";

const OUTPUT = path.resolve(process.argv[2] || "reports/seo/product-screenshots");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/* Applied before the app paints, so a screenshot cannot land on an ECG
   frame, a FAB intro, a focus ring, or a caret. The sticky header is laid out
   in place (it sits at the top either way): as its own composited layer its
   rounded chip edges rasterized ±1 level differently between runs. */
const CAPTURE_STYLE = `
  *,*::before,*::after{animation:none !important;transition:none !important;caret-color:transparent !important}
  .ecg-line{stroke-dashoffset:0 !important;animation:none !important}
  .pulse-dot,.blink{animation:none !important;opacity:1 !important}
  :focus,:focus-visible{outline:none !important}
  .top{position:relative !important}
`;

/* The init script can run before the parser has created <html>. Appending
   then throws and the freeze never lands. Install only once documentElement
   exists; otherwise watch for it, and also try again on DOMContentLoaded. */
export function installCaptureFreeze(css) {
  Math.random = () => 0.125;
  try { localStorage.setItem("pulsern-labfab-v1", JSON.stringify({ side: "right", y: 0.62 })); } catch { /* private mode */ }
  const install = () => {
    const root = document.documentElement;
    if (!root) return false;
    if (root.querySelector("style[data-pulsern-capture-freeze]")) return true;
    const style = document.createElement("style");
    style.setAttribute("data-pulsern-capture-freeze", "");
    style.textContent = css;
    root.appendChild(style);
    return true;
  };
  if (install()) return;
  const observer = new MutationObserver(() => { if (install()) observer.disconnect(); });
  observer.observe(document, { childList: true });
  document.addEventListener("DOMContentLoaded", () => { if (install()) observer.disconnect(); }, { once: true });
}

async function sourceHashes(directory = "src") {
  const files = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (/\.(?:js|jsx)$/.test(entry.name)) files.push(target.replace(/\\/g, "/"));
    }
  }
  await walk(directory);
  files.sort();
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await fs.readFile(file))])));
}

async function settle(page) {
  const result = await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    if (document.fonts?.load) await document.fonts.load("16px 'PulseRN Capture Symbols'");
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const style = document.querySelector("style[data-pulsern-capture-freeze]");
    const freeze = !!style && (style.textContent || "").includes("animation:none");
    const fabBox = () => {
      const fab = document.querySelector(".lab-fab");
      if (!fab) return "hidden";
      const r = fab.getBoundingClientRect();
      return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
    };
    let last = null;
    let stable = false;
    for (let i = 0; i < 12; i++) {
      await frame();
      const next = fabBox();
      if (last != null && next === last) { stable = true; break; }
      last = next;
    }
    return { freeze, stable, box: last };
  });
  if (!result.freeze || !result.stable) {
    throw new Error(`capture is not frozen: freeze style ${result.freeze ? "present" : "missing"}, study button ${result.stable ? "stable" : "still moving"} (${result.box ?? "unread"})`);
  }
}

/* Product shots must show the question, not the study button sitting on it. */
async function assertStudyButtonClear(page, selectors) {
  const hit = await page.evaluate((wanted) => {
    const fab = document.querySelector(".lab-fab");
    if (!fab) return "";
    const a = fab.getBoundingClientRect();
    const overlaps = (b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
    for (const sel of wanted) {
      for (const el of document.querySelectorAll(sel)) {
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        if (overlaps(b)) return `${sel} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 80)}"`;
      }
    }
    return "";
  }, selectors);
  if (hit) throw new Error(`study button covers ${hit}`);
}

function rgbCanonical(raw) {
  const decoded = decodePng(Buffer.from(raw));
  if (decoded.colour === 2) return canonicalPng(Buffer.from(raw));
  if (decoded.colour !== 6) throw new Error(`screenshot is not 8-bit RGB (colour type ${decoded.colour})`);
  const rgb = Buffer.alloc(decoded.width * decoded.height * 3);
  for (let i = 0, j = 0; i < decoded.pixels.length; i += 4, j += 3) {
    if (decoded.pixels[i + 3] !== 255) throw new Error("screenshot has partial transparency");
    rgb[j] = decoded.pixels[i];
    rgb[j + 1] = decoded.pixels[i + 1];
    rgb[j + 2] = decoded.pixels[i + 2];
  }
  return encodeCanonicalPng({ width: decoded.width, height: decoded.height, colour: 2, pixels: rgb });
}

async function screenshot(page, name, expectedText) {
  await settle(page);
  const file = path.join(OUTPUT, name);
  const bodyText = await page.locator("body").innerText();
  for (const text of expectedText) {
    if (!bodyText.toLocaleLowerCase("en-US").includes(text.toLocaleLowerCase("en-US"))) {
      throw new Error(`${name} is missing expected product text: ${text}`);
    }
  }
  const raw = await page.screenshot({ type: "png", fullPage: false });
  const buffer = rgbCanonical(raw);
  await fs.writeFile(file, buffer);
  const viewport = page.viewportSize();
  return {
    file: name,
    sha256: sha256(buffer),
    bytes: buffer.length,
    width: viewport.width,
    height: viewport.height,
    expectedText,
  };
}

export async function captureProductScreenshots() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    mode: "product-screenshot",
    logLevel: "error",
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://127.0.0.1:54321"),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("public-screenshot-placeholder"),
    },
    plugins: [
      {
        name: "pulsern-product-screenshot-supabase",
        enforce: "pre",
        resolveId(source, importer) {
          if ((importer ?? "").includes("/src/") && /(?:^|\/)supabase\.js(?:\?.*)?$/.test(source)) {
            return path.resolve("ops/product-supabase-mock.js");
          }
          return null;
        },
      },
      react(),
    ],
    server: { host: "127.0.0.1", port: 4174, strictPort: true },
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    /* Deterministic: the same chance, the same time zone and the same day
       on every run. The app picks the day's items from the local date, so
       a running clock gave a different question on a different day. */
    const page = await browser.newPage({ viewport: { width: 720, height: 1000 }, deviceScaleFactor: 1, timezoneId: "UTC" });
    await page.clock.setFixedTime(new Date(CAPTURE_TIME));
    await page.addInitScript(installCaptureFreeze, CAPTURE_STYLE);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("http://127.0.0.1:4174/ops/product-screenshot.html", { waitUntil: "networkidle" });
    await page.evaluate(installCaptureFreeze, CAPTURE_STYLE);
    if (!await page.evaluate(() => !!document.querySelector("style[data-pulsern-capture-freeze]"))) {
      const tag = await page.addStyleTag({ content: CAPTURE_STYLE });
      await tag.evaluate((el) => el.setAttribute("data-pulsern-capture-freeze", ""));
    }
    await settle(page);
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    try {
      await page.getByRole("button", { name: /Start today's round$/ }).waitFor();
    } catch (error) {
      console.error("Screenshot harness body after closing tour:\n", (await page.locator("body").innerText()).slice(0, 3000));
      await page.screenshot({ path: path.join(OUTPUT, "diagnostic-after-tour.png"), fullPage: false });
      throw error;
    }

    const images = [];
    images.push(await screenshot(page, "pulsern-today-dashboard.png", ["Start today's round", "CANDIDATE MONITOR", "Today's goal"]));

    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("button", { name: "New questions", exact: true }).click();
    await page.getByRole("main").waitFor();
    await page.setViewportSize({ width: 720, height: 620 });
    await settle(page);
    await assertStudyButtonClear(page, [".stem", ".opt", ".q-nav-wrap"]);
    images.push(await screenshot(page, "pulsern-adaptive-practice.png", ["Practice", "Check answer"]));

    await page.setViewportSize({ width: 430, height: 932 });
    await page.getByRole("button", { name: /Study toolkit/ }).click();
    await page.getByRole("tab", { name: /Labs/ }).click();
    await page.getByRole("button", { name: "Electrolytes" }).click();
    await page.getByRole("tabpanel", { name: "🧪 Labs & lookup" }).waitFor();
    images.push(await screenshot(page, "pulsern-lab-reference.png", ["Sodium", "Potassium"]));

    const sources = await sourceHashes();
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      renderer: "PulseRN App.jsx deterministic built-in-content harness",
      browser: await browser.version(),
      containsLearnerData: false,
      sourceFiles: sources,
      sourceSetSha256: sha256(JSON.stringify(sources)),
      images,
    };
    await fs.writeFile(path.join(OUTPUT, "capture.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ output: OUTPUT, images: images.length, sourceSetSha256: report.sourceSetSha256 }, null, 2));
    return report;
  } finally {
    await browser?.close();
    await server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await captureProductScreenshots();
}
