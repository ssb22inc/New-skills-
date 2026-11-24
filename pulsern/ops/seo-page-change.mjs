#!/usr/bin/env node
/* The paid search review runs only for a public marketing page or an SEO
   file. The list is the paths named in pulsern/CLAUDE.md, not a guess at
   every file a bundler might import. */

import { appendFileSync } from "node:fs";

export function isMarketingPagePath(path) {
  const p = String(path ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (p === "pulsern/index.html" || p === "pulsern/public/robots.txt" || p === "pulsern/public/llms.txt" || p === "pulsern/public/sitemap.xml") return true;
  if (p.startsWith("pulsern/public/") && p.endsWith(".html")) return true;
  if (/^pulsern\/ops\/seo-.*\.mjs$/.test(p)) return true;
  if (/^pulsern\/ops\/learn-.*\.mjs$/.test(p)) return true;
  if (p === "pulsern/ops/build-learn.mjs" || p === "pulsern/ops/build-public-pages.mjs" || p === "pulsern/ops/commercial-content.mjs" || p === "pulsern/ops/seo-content-policy.mjs") return true;
  if (p === ".github/workflows/pulsern-seo-guardian.yml") return true;
  return false;
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
  console.log(changed ? "public marketing page or SEO file changed" : "no public marketing page or SEO file changed");
}
