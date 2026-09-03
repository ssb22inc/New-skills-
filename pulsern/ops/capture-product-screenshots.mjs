#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const OUTPUT = path.resolve(process.argv[2] || "reports/seo/product-screenshots");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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

async function screenshot(page, name, expectedText) {
  const file = path.join(OUTPUT, name);
  const bodyText = await page.locator("body").innerText();
  for (const text of expectedText) {
    if (!bodyText.toLocaleLowerCase("en-US").includes(text.toLocaleLowerCase("en-US"))) {
      throw new Error(`${name} is missing expected product text: ${text}`);
    }
  }
  await page.screenshot({ path: file, fullPage: false });
  const buffer = await fs.readFile(file);
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await page.addInitScript(() => { Math.random = () => 0.125; });
    await page.goto("http://127.0.0.1:4174/ops/product-screenshot.html", { waitUntil: "networkidle" });
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
    images.push(await screenshot(page, "pulsern-adaptive-practice.png", ["Question", "Submit answer"]));

    await page.setViewportSize({ width: 430, height: 932 });
    await page.getByRole("button", { name: "Open quick actions: lab values and help", exact: true }).click();
    await page.getByRole("button", { name: /Lab values/, exact: false }).click();
    await page.getByRole("complementary", { name: "Normal lab and vital-sign reference ranges" }).waitFor();
    images.push(await screenshot(page, "pulsern-lab-reference.png", ["Normal reference ranges", "Sodium", "Potassium"]));

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
