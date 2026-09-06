#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const REQUIRED_IMAGES = [
  "pulsern-adaptive-practice.png",
  "pulsern-today-dashboard.png",
  "pulsern-lab-reference.png",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, message) => ({ severity: "critical", code, message });

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature || buffer.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export async function auditProductImages({
  manifestFile = "public/product/product-screenshots.json",
  captureFile = "reports/seo/product-screenshots/capture.json",
  publicDirectory = "public/product",
  landingFile = "dist/index.html",
  outputFile = "reports/seo/product-images.json",
} = {}) {
  const findings = [];
  let manifest = null;
  let capture = null;
  let landing = "";
  try { manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")); }
  catch { findings.push(finding("PRODUCT_IMAGE_MANIFEST", `Missing or malformed product-image manifest: ${manifestFile}`)); }
  try { capture = JSON.parse(await fs.readFile(captureFile, "utf8")); }
  catch { findings.push(finding("PRODUCT_IMAGE_CAPTURE", `Missing or malformed exact-run screenshot capture: ${captureFile}`)); }
  try { landing = await fs.readFile(landingFile, "utf8"); }
  catch { findings.push(finding("PRODUCT_IMAGE_LANDING", `Built landing page is unavailable: ${landingFile}`)); }

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
    if (digest !== expected.sha256) findings.push(finding("PRODUCT_IMAGE_HASH", `${file} does not match its reviewed manifest hash.`));
    if (current.sha256 !== expected.sha256) findings.push(finding("PRODUCT_IMAGE_STALE", `${file} no longer matches a fresh deterministic capture of the current app.`));
    if (buffer.byteLength !== expected.bytes || current.bytes !== expected.bytes) findings.push(finding("PRODUCT_IMAGE_BYTES", `${file} byte length does not match reviewed capture evidence.`));
    if (!dimensions || dimensions.width !== expected.width || dimensions.height !== expected.height || current.width !== expected.width || current.height !== expected.height) {
      findings.push(finding("PRODUCT_IMAGE_DIMENSIONS", `${file} dimensions do not match reviewed capture evidence.`));
    }
    if (typeof expected.alt !== "string" || expected.alt.trim().length < 30 || !landing.includes(`alt="${expected.alt}"`)) {
      findings.push(finding("PRODUCT_IMAGE_ALT", `${file} lacks its reviewed descriptive alt text on the built homepage.`));
    }
    if (typeof expected.caption !== "string" || expected.caption.trim().length < 20 || !landing.includes(expected.caption)) {
      findings.push(finding("PRODUCT_IMAGE_CAPTION", `${file} lacks its reviewed visible caption on the built homepage.`));
    }
    if (!landing.includes(`src="/product/${file}"`) || !landing.includes(`width="${expected.width}"`) || !landing.includes(`height="${expected.height}"`)) {
      findings.push(finding("PRODUCT_IMAGE_MARKUP", `${file} is not published with explicit dimensions on the built homepage.`));
    }
    auditedImages.push({ file, sha256: digest, bytes: buffer.byteLength, ...dimensions, alt: expected.alt, caption: expected.caption });
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
