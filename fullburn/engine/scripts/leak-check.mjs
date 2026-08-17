#!/usr/bin/env node
/** CLI for the leak + structural scan (§10.2, §15). Rules live in scan-lib.mjs
 * so they can be unit-tested without a filesystem walk (adversary finding F18):
 * importing THIS file is safe — the walk runs only when it is the entry point.
 * Usage: node leak-check.mjs <repo-root> */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scanContent } from "./scan-lib.mjs";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
/** Widened per adversary finding R2-29: evidence dumps, logs, CSV extracts and
 * shell scripts are exactly where a pasted token ends up, and they were not
 * scanned. */
const SCANNED = /\.(?:ts|tsx|mjs|cjs|js|jsx|json|jsonl|md|toml|ya?ml|txt|log|csv|tsv|sh|bash|sql|ini|conf|xml|html)$/;
/** The WHOLE repository is walked (adversary findings R2-29, H-16). Scanning
 * only fullburn/ + .github/ left the sibling product trees — including client
 * zero's app and its own workflows — unscanned: 346 files, any of which could
 * carry a real token. Structural rules still apply only to Fullburn's own code
 * (see scan-lib's STRUCTURAL_SCOPE); the secret rules apply everywhere.
 *
 * A denylist, not an allowlist: a directory nobody thought of fails CLOSED
 * into being scanned rather than silently skipped. */
const SKIP_TOP = new Set([]);

export function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (SCANNED.test(name) || name.startsWith(".env")) yield p;
  }
}

/** Every path-scoped rule in scan-lib — STRUCTURAL_SCOPE, the per-file evidence
 * exemptions — is written against repo-root-relative paths (`fullburn/...`).
 * Handed the WRONG root the scan does not fail: `STRUCTURAL_SCOPE` simply
 * matches nothing, so the entire structural half turns itself off and reports
 * "clean". `npm run leak-check` passed no root at all, defaulted to `.`, and
 * had been silently running with those rules inert while CI — which passes `..`
 * — ran the real scan. The two disagreed, and the local one was the reassuring
 * one. A scan that cannot see its own scope must say so, not pass. */
function assertScannableRoot(repoRoot) {
  if (!existsSync(join(repoRoot, "fullburn"))) {
    throw new Error(
      `leak-check must be given the REPOSITORY root (the directory containing fullburn/), not ${resolve(repoRoot)} — ` +
        "every path-scoped rule is written against repo-relative paths and would silently match nothing",
    );
  }
}

export function scanTree(repoRoot) {
  const findings = [];
  if (!existsSync(repoRoot)) return findings;
  assertScannableRoot(repoRoot);
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file);
    if (SKIP_TOP.has(rel.split("/")[0])) continue;
    findings.push(...scanContent(rel, readFileSync(file, "utf8")));
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
