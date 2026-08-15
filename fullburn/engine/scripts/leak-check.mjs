#!/usr/bin/env node
/** CLI for the leak + structural scan (§10.2, §15). Rules live in scan-lib.mjs
 * so they can be unit-tested without a filesystem walk (adversary finding F18):
 * importing THIS file is safe — the walk runs only when it is the entry point.
 * Usage: node leak-check.mjs <repo-root> */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scanContent } from "./scan-lib.mjs";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const SCANNED = /\.(?:ts|tsx|mjs|js|json|md|toml|ya?ml|txt|env)$/;

export function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (SCANNED.test(name) || name.startsWith(".env")) yield p;
  }
}

export function scanTree(repoRoot) {
  const findings = [];
  for (const file of walk(join(repoRoot, "fullburn"))) {
    findings.push(...scanContent(relative(repoRoot, file), readFileSync(file, "utf8")));
  }
  return findings;
}

// Run the walk only as a CLI, never on import.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = scanTree(process.argv[2] ?? ".");
  if (findings.length > 0) {
    console.error("LEAK/STRUCTURAL SCAN FAIL:");
    for (const f of findings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("leak/structural scan: clean");
}
