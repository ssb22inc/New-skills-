#!/usr/bin/env node
/* The paid search review is for the public marketing pages. An app-only
   change does not call the model. The page set is the published HTML plus
   every local file the homepage and the page builders import. */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ROOTS = [
  "pulsern/ops/build-learn.mjs",
  "pulsern/ops/build-public-pages.mjs",
  "pulsern/src/landing.jsx",
];
const IMPORT_RE = /(?:from\s+|import\s*\(\s*)["'](\.[^"']+)["']|new URL\(\s*["'](\.[^"']+)["']/g;

function repoPath(rel) {
  return join(REPO, rel);
}

export function marketingSourcePaths() {
  const seen = new Set(ROOTS);
  const queue = [...ROOTS];
  while (queue.length) {
    const file = queue.pop();
    let text;
    try { text = readFileSync(repoPath(file), "utf8"); } catch { continue; }
    const dir = dirname(file);
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1] || match[2];
      const base = normalize(join(dir, spec)).replace(/\\/g, "/");
      if (!base.startsWith("pulsern/")) continue;
      const candidates = /\.[a-z0-9]+$/i.test(base) ? [base] : [`${base}.mjs`, `${base}.js`, `${base}.jsx`, `${base}.json`];
      for (const candidate of candidates) {
        if (seen.has(candidate) || !existsSync(repoPath(candidate))) continue;
        seen.add(candidate);
        queue.push(candidate);
        break;
      }
    }
  }
  return seen;
}

const SOURCES = marketingSourcePaths();

export function isMarketingPagePath(path) {
  const p = String(path ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (p === "pulsern/public/robots.txt" || p === "pulsern/public/llms.txt") return true;
  if (p.startsWith("pulsern/public/") && /\.(html|xml)$/.test(p)) return true;
  return SOURCES.has(p);
}

export function marketingPagesChanged(names) {
  return names.some((name) => isMarketingPagePath(name));
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
  const buf = await readStdin();
  const names = process.argv.includes("--nul") ? parseNulNames(buf) : buf.toString("utf8").split(/\r?\n/).filter((line) => line.length > 0);
  const changed = marketingPagesChanged(names);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  console.log(changed ? "public marketing page changed" : "no public marketing page changed");
}
