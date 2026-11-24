#!/usr/bin/env node
/* The paid search review is for the public marketing pages. An app-only
   change does not call the model. */

import { appendFileSync } from "node:fs";

const PAGE_SOURCES = new Set([
  "pulsern/ops/learn-content.mjs",
  "pulsern/ops/commercial-content.mjs",
  "pulsern/ops/build-learn.mjs",
  "pulsern/ops/build-public-pages.mjs",
  "pulsern/ops/seo-content-policy.mjs",
]);

export function isMarketingPagePath(path) {
  const p = String(path ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (p === "pulsern/public/robots.txt" || p === "pulsern/public/llms.txt") return true;
  if (p.startsWith("pulsern/public/") && /\.(html|xml)$/.test(p)) return true;
  return PAGE_SOURCES.has(p);
}

export function marketingPagesChanged(names) {
  return names.some((name) => isMarketingPagePath(name));
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = (await readStdin()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const changed = marketingPagesChanged(names);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  console.log(changed ? "public marketing page changed" : "no public marketing page changed");
}
