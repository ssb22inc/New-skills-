#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { createStaticServer } from "./seo-crawl.mjs";

const REQUIRED_IMAGES = [
  "pulsern-adaptive-practice.png",
  "pulsern-today-dashboard.png",
  "pulsern-lab-reference.png",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, message) => ({ severity: "critical", code, message });
const MAX_RASTER_CHANNEL_DELTA = 2;
const MAX_RASTER_NOISE_RATIO = 0.001;

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature || buffer.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function comparePngPixels(reviewedBuffer, recapturedBuffer) {
  try {
    const reviewed = PNG.sync.read(reviewedBuffer);
    const recaptured = PNG.sync.read(recapturedBuffer);
    if (reviewed.width !== recaptured.width || reviewed.height !== recaptured.height) return null;

    let changedPixels = 0;
    let maxChannelDelta = 0;
    for (let offset = 0; offset < reviewed.data.length; offset += 4) {
      let pixelChanged = false;
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(reviewed.data[offset + channel] - recaptured.data[offset + channel]);
        if (delta) pixelChanged = true;
        if (delta > maxChannelDelta) maxChannelDelta = delta;
      }
      if (pixelChanged) changedPixels += 1;
    }

    const totalPixels = reviewed.width * reviewed.height;
    return {
      equivalent: maxChannelDelta <= MAX_RASTER_CHANNEL_DELTA && changedPixels / totalPixels <= MAX_RASTER_NOISE_RATIO,
      changedPixels,
      totalPixels,
      maxChannelDelta,
    };
  } catch {
    return null;
  }
}

export async function renderReactLanding({ landingFile = "dist/index.html", browserType = chromium } = {}) {
  const server = await createStaticServer(path.dirname(path.resolve(landingFile)));
  let browser;
  try {
    browser = await browserType.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`${server.base}/`, { waitUntil: "networkidle" });
    const renderedMain = page.locator('main[data-pulsern-landing="rendered-react"]');
    await renderedMain.waitFor();
    return await renderedMain.evaluate((element) => element.outerHTML);
  } finally {
    await browser?.close();
    await server.close();
  }
}

export async function auditProductImages({
  manifestFile = "public/product/product-screenshots.json",
  captureFile = "reports/seo/product-screenshots/capture.json",
  publicDirectory = "public/product",
  landingFile = "dist/index.html",
  renderedLandingMarkup,
  renderLanding = renderReactLanding,
  outputFile = "reports/seo/product-images.json",
} = {}) {
  const findings = [];
  let manifest = null;
  let capture = null;
  let fallbackLanding = "";
  let renderedLanding = "";
  try { manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")); }
  catch { findings.push(finding("PRODUCT_IMAGE_MANIFEST", `Missing or malformed product-image manifest: ${manifestFile}`)); }
  try { capture = JSON.parse(await fs.readFile(captureFile, "utf8")); }
  catch { findings.push(finding("PRODUCT_IMAGE_CAPTURE", `Missing or malformed exact-run screenshot capture: ${captureFile}`)); }
  try { fallbackLanding = await fs.readFile(landingFile, "utf8"); }
  catch { findings.push(finding("PRODUCT_IMAGE_LANDING_FALLBACK", `Built fallback landing page is unavailable: ${landingFile}`)); }
  try {
    renderedLanding = typeof renderedLandingMarkup === "string"
      ? renderedLandingMarkup
      : await renderLanding({ landingFile });
  } catch (error) {
    findings.push(finding("PRODUCT_IMAGE_LANDING_RENDER", `Rendered React landing page is unavailable: ${error.message}`));
  }
  if (renderedLanding && !renderedLanding.includes('data-pulsern-landing="rendered-react"')) {
    findings.push(finding("PRODUCT_IMAGE_LANDING_RENDER", "Product-image checks did not receive the rendered React homepage."));
  }

  if (manifest?.containsLearnerData !== false || capture?.containsLearnerData !== false) {
    findings.push(finding("PRODUCT_IMAGE_PRIVACY", "Product-image evidence must explicitly confirm that no learner data is present."));
  }
  if (manifest?.renderer !== "PulseRN App.jsx deterministic built-in-content harness" || capture?.renderer !== manifest?.renderer) {
    findings.push(finding("PRODUCT_IMAGE_RENDERER", "Product images must come from the approved real-App.jsx deterministic renderer."));
  }

  const manifestImages = new Map((manifest?.images ?? []).map((image) => [image.file, image]));
  const captureImages = new Map((capture?.images ?? []).map((image) => [image.file, image]));
  const auditedImages = [];
  for (const file of REQUIRED_IMAGES) {
    const expected = manifestImages.get(file);
    const current = captureImages.get(file);
    if (!expected) findings.push(finding("PRODUCT_IMAGE_REQUIRED", `Manifest is missing ${file}.`));
    if (!current) findings.push(finding("PRODUCT_IMAGE_RECAPTURE", `Exact-run capture is missing ${file}.`));
    if (!expected || !current) continue;
    let buffer = null;
    try { buffer = await fs.readFile(path.join(publicDirectory, file)); }
    catch { findings.push(finding("PRODUCT_IMAGE_FILE", `Published product image is missing: ${file}`)); }
    if (!buffer) continue;
    const digest = sha256(buffer);
    const dimensions = pngDimensions(buffer);
    let rasterComparison = null;
    if (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes) {
      try {
        rasterComparison = comparePngPixels(buffer, await fs.readFile(path.join(path.dirname(captureFile), file)));
      } catch {
        rasterComparison = null;
      }
    }
    if (digest !== expected.sha256) findings.push(finding("PRODUCT_IMAGE_HASH", `${file} does not match its reviewed manifest hash.`));
    if (current.sha256 !== expected.sha256 && !rasterComparison?.equivalent) findings.push(finding("PRODUCT_IMAGE_STALE", `${file} no longer matches a fresh deterministic capture of the current app.`));
    if ((buffer.byteLength !== expected.bytes || current.bytes !== expected.bytes) && !rasterComparison?.equivalent) findings.push(finding("PRODUCT_IMAGE_BYTES", `${file} byte length does not match reviewed capture evidence.`));
    if (!dimensions || dimensions.width !== expected.width || dimensions.height !== expected.height || current.width !== expected.width || current.height !== expected.height) {
      findings.push(finding("PRODUCT_IMAGE_DIMENSIONS", `${file} dimensions do not match reviewed capture evidence.`));
    }
    if (typeof expected.alt !== "string" || expected.alt.trim().length < 30 || !renderedLanding.includes(`alt="${expected.alt}"`)) {
      findings.push(finding("PRODUCT_IMAGE_ALT", `${file} lacks its reviewed descriptive alt text on the rendered React homepage.`));
    }
    if (typeof expected.caption !== "string" || expected.caption.trim().length < 20 || !renderedLanding.includes(expected.caption)) {
      findings.push(finding("PRODUCT_IMAGE_CAPTION", `${file} lacks its reviewed visible caption on the rendered React homepage.`));
    }
    if (!renderedLanding.includes(`src="/product/${file}"`) || !renderedLanding.includes(`width="${expected.width}"`) || !renderedLanding.includes(`height="${expected.height}"`)) {
      findings.push(finding("PRODUCT_IMAGE_MARKUP", `${file} is not published with explicit dimensions on the rendered React homepage.`));
    }
    if (!fallbackLanding.includes(`alt="${expected.alt}"`) || !fallbackLanding.includes(expected.caption)) {
      findings.push(finding("PRODUCT_IMAGE_FALLBACK_COPY", `${file} is missing its reviewed alt text or caption in the no-JavaScript fallback.`));
    }
    if (!fallbackLanding.includes(`src="/product/${file}"`) || !fallbackLanding.includes(`width="${expected.width}"`) || !fallbackLanding.includes(`height="${expected.height}"`)) {
      findings.push(finding("PRODUCT_IMAGE_FALLBACK_MARKUP", `${file} lacks explicit image dimensions in the no-JavaScript fallback.`));
    }
    auditedImages.push({
      file,
      sha256: digest,
      bytes: buffer.byteLength,
      ...dimensions,
      alt: expected.alt,
      caption: expected.caption,
      recapture: rasterComparison
        ? {
            sha256: current.sha256,
            bytes: current.bytes,
            equivalentWithinRasterTolerance: rasterComparison.equivalent,
            changedPixels: rasterComparison.changedPixels,
            totalPixels: rasterComparison.totalPixels,
            maxChannelDelta: rasterComparison.maxChannelDelta,
          }
        : { sha256: current.sha256, bytes: current.bytes, equivalentWithinRasterTolerance: current.sha256 === expected.sha256 },
    });
  }
  const extras = [...manifestImages.keys()].filter((file) => !REQUIRED_IMAGES.includes(file));
  if (extras.length) findings.push(finding("PRODUCT_IMAGE_SCOPE", `Unreviewed manifest images are present: ${extras.join(", ")}`));

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    verdict: findings.length ? "FAIL" : "PASS",
    renderer: capture?.renderer ?? null,
    browser: capture?.browser ?? null,
    containsLearnerData: capture?.containsLearnerData ?? null,
    manifestSourceCommitSha: manifest?.sourceCommitSha ?? null,
    manifestSourceSetSha256: manifest?.sourceSetSha256 ?? null,
    captureSourceSetSha256: capture?.sourceSetSha256 ?? null,
    landingEvidence: {
      renderedReact: renderedLanding.includes('data-pulsern-landing="rendered-react"'),
      fallbackChecked: Boolean(fallbackLanding),
    },
    images: auditedImages,
    findings,
  };
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await auditProductImages();
  console.log(JSON.stringify({ verdict: report.verdict, images: report.images.length, findings: report.findings.length, output: "reports/seo/product-images.json" }, null, 2));
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}
