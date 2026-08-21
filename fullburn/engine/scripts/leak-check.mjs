#!/usr/bin/env node
/** CLI for the leak + structural scan (§10.2, §15). Rules live in scan-lib.mjs
 * so they can be unit-tested without a filesystem walk (adversary finding F18):
 * importing THIS file is safe — the walk runs only when it is the entry point.
 * Usage: node leak-check.mjs <repo-root> */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isScannedFile, isSkippedDir, leakVerdict, looksBinary, scanContent } from "./scan-lib.mjs";

/** THE WALK IS WIRING; WHAT IT LOOKS AT IS A DECISION, AND DECISIONS LIVE IN
 * scan-lib.mjs. `SCANNED` and `SKIP_DIRS` were const literals in this file, on
 * the import side of the entry-point guard, and both were measured surviving a
 * one-line revert with the whole default suite green — see the block above
 * `SKIP_DIRS` in scan-lib.mjs for what each revert switched off.
 *
 * The WHOLE repository is walked (adversary findings R2-29, H-16). Scanning
 * only fullburn/ + .github/ left the sibling product trees — including client
 * zero's app and its own workflows — unscanned: 346 files, any of which could
 * carry a real token. Structural rules still apply only to Fullburn's own code
 * (see scan-lib's STRUCTURAL_SCOPE); the secret rules apply everywhere. */
export function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (isSkippedDir(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (isScannedFile(name)) yield p;
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
  // A ROOT THAT DOES NOT EXIST IS AN ERROR, NOT AN EMPTY RESULT. This guard was
  // added one branch too late: `scanTree` returned `[]` for a missing root
  // before reaching it, so `leak-check /nonexistent-root` printed "clean" and
  // exited 0 (adversary finding R8-07) — the same class of defect the guard was
  // written to fix. A typo in a CI argument, a renamed checkout directory or a
  // changed working-directory all produce a green scan over zero files.
  if (!existsSync(repoRoot)) {
    throw new Error(`leak-check was given a root that does not exist: ${resolve(repoRoot)} — refusing (fail closed)`);
  }
  if (!existsSync(join(repoRoot, "fullburn"))) {
    throw new Error(
      `leak-check must be given the REPOSITORY root (the directory containing fullburn/), not ${resolve(repoRoot)} — ` +
        "every path-scoped rule is written against repo-relative paths and would silently match nothing",
    );
  }
}

export function scanTree(repoRoot) {
  const findings = [];
  assertScannableRoot(repoRoot);
  for (const file of walk(repoRoot)) {
    // READ THE BYTES, THEN DECIDE. A binary type the denylist does not name is
    // skipped by measurement rather than by being absent from a list.
    const bytes = readFileSync(file);
    if (looksBinary(bytes)) continue;
    findings.push(...scanContent(relative(repoRoot, file), bytes.toString("utf8")));
  }
  return findings;
}

// Run the walk only as a CLI, never on import.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // The verdict is `leakVerdict`'s, not this block's. Inverting the comparison
  // that used to stand here printed nothing and exited 0 with findings in hand,
  // and the default suite stayed green because nothing had ever executed this
  // CLI — the N-03 leg B gap, on the leak scan. It is executed now:
  // engine/test/integration/leak-cli.test.ts.
  const verdict = leakVerdict(scanTree(process.argv[2] ?? "."));
  if (!verdict.ok) {
    console.error(verdict.reason);
    process.exit(1);
  }
  console.log(verdict.reason);
}
