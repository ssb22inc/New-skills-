#!/usr/bin/env node
/* The paid search review is for the public marketing pages. An app-only
   change does not call the model. The page set is the published HTML plus
   every local file the homepage and the page builders import. */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ROOTS = [
  "pulsern/ops/build-learn.mjs",
  "pulsern/ops/build-public-pages.mjs",
  "pulsern/src/landing.jsx",
];
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)["'](\.[^"']+)["']|new URL\(\s*["'](\.[^"']+)["']/g;

function repoPath(rel) {
  return join(REPO, rel);
}

export function collectSources(roots, read) {
  const seen = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop();
    let text;
    try { text = read(file); } catch { continue; }
    const dir = dirname(file);
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1] || match[2];
      if (!spec?.startsWith(".")) continue;
      const base = normalize(join(dir, spec)).replace(/\\/g, "/");
      if (!base.startsWith("pulsern/")) continue;
      const candidates = /\.[a-z0-9]+$/i.test(base)
        ? [base]
        : [`${base}.mjs`, `${base}.js`, `${base}.jsx`, `${base}.json`, `${base}/index.mjs`, `${base}/index.js`, `${base}/index.jsx`];
      for (const candidate of candidates) {
        if (seen.has(candidate)) continue;
        let body;
        try { body = read(candidate); } catch { continue; }
        if (body == null) continue;
        seen.add(candidate);
        queue.push(candidate);
        break;
      }
    }
  }
  return seen;
}

export function marketingSourcePaths() {
  return collectSources(ROOTS, (file) => {
    if (!existsSync(repoPath(file))) throw new Error("missing");
    return readFileSync(repoPath(file), "utf8");
  });
}

export function skippedReview() {
  return {
    verdict: "PASS",
    summary: "No public marketing page changed, so the model was not called. Owner order 2026-11-24.",
    guideCoverage: { totalGuides: 0, approvedGuides: 0, pendingGuides: 0, approvedRoutes: [], pendingRoutes: [] },
    strongestObjections: [],
    releaseBlockers: [],
    nonBlockingExperiments: [],
    model: null,
  };
}

const SOURCES = marketingSourcePaths();

export function isMarketingPagePath(path) {
  const p = String(path ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (p === "pulsern/index.html" || p === "pulsern/public/robots.txt" || p === "pulsern/public/llms.txt") return true;
  if (p.startsWith("pulsern/public/") && /\.(html|xml)$/.test(p)) return true;
  return SOURCES.has(p);
}

export function marketingPagesChanged(names) {
  return names.some((name) => isMarketingPagePath(name));
}

export function writeSkippedReview(jsonFile, mdFile) {
  const review = skippedReview();
  mkdirSync(dirname(jsonFile), { recursive: true });
  writeFileSync(jsonFile, JSON.stringify(review, null, 2) + "\n");
  if (mdFile) {
    writeFileSync(mdFile, `# PulseRN model-based adversarial review\n\nModel: not called\n\n## Verdict\n\n**PASS** — ${review.summary}\n`);
  }
  return review;
}

export function parseNulNames(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf ?? "");
  return text.split("\0").filter((name) => name.length > 0);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--assume-changed")) {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "changed=true\n");
    console.log("no commit range; model review required");
    process.exit(0);
  }
  const skipAt = process.argv.indexOf("--skip-report");
  if (skipAt >= 0) {
    writeSkippedReview(process.argv[skipAt + 1], process.argv[skipAt + 2]);
    console.log("public marketing page unchanged; model not called");
    process.exit(0);
  }
  const buf = await readStdin();
  const names = process.argv.includes("--nul") ? parseNulNames(buf) : buf.toString("utf8").split(/\r?\n/).filter((line) => line.length > 0);
  const changed = marketingPagesChanged(names);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  console.log(changed ? "public marketing page changed" : "no public marketing page changed");
}
