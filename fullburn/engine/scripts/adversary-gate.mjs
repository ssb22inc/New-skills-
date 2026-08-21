#!/usr/bin/env node
/** CI wrapper for the adversary-report gate (Law 9, §10.3; F4, R2-06/09/10/18/19).
 * Usage: node adversary-gate.mjs <repo-root> [base-ref]
 * - a report for the current PHASE must exist, be bound to the current tree,
 *   and read PASS; any fresh FAIL blocks regardless
 * - PRs may not modify, delete or rename existing ADVERSARY_REPORT files */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import {
  VERIFIED_TREE_SCOPE,
  checkAdversaryReport,
  checkReportsAppendOnly,
  dirtyWorktreeLines,
  selectPhaseReports,
} from "./gate-lib.mjs";
import { parseNameStatusZ } from "./diff-lib.mjs";

const repoRoot = process.argv[2] ?? ".";
const baseRef = process.argv[3] ?? null;

/** THE SCOPE IS gate-lib's, NOT THIS FILE'S. It was a const literal here, and
 * dropping `.github/` from it restored adversary finding R2-18 in one line with
 * the whole default suite green. See `VERIFIED_TREE_SCOPE`. */
const TREE_SCOPE = VERIFIED_TREE_SCOPE;

/** `git ls-files -s` reports the INDEX, not the working tree, so unstaged edits
 * would leave the hash — and a report's freshness binding — looking valid while
 * the code has already moved. Untracked files are included in the check
 * (adversary finding R2-19): a brand-new unstaged module is exactly what the
 * index-based hash cannot see. */
export function assertCleanTree(root) {
  const scope = TREE_SCOPE.map((s) => JSON.stringify(s)).join(" ");
  // Reading git is this file's job; deciding which lines mean "moved ahead of
  // the index" is `dirtyWorktreeLines`', where a test can drive it.
  const dirty = dirtyWorktreeLines(
    execSync(`git -C ${JSON.stringify(root)} status --porcelain -- ${scope}`, { encoding: "utf8" }),
  );
  if (dirty.length > 0) {
    throw new Error(
      `working tree has unstaged or untracked changes in the verified scope — the verified-tree hash reads the git index, so it would not reflect them. Stage them first:\n${dirty.join("\n")}`,
    );
  }
}

export function currentFullburnTreeHash(root) {
  const scope = TREE_SCOPE.map((s) => JSON.stringify(s)).join(" ");
  const out = execSync(`git -C ${JSON.stringify(root)} ls-files -s -- ${scope}`, { encoding: "utf8" });
  return execSync(`git -C ${JSON.stringify(root)} hash-object --stdin`, { input: out, encoding: "utf8" }).trim();
}

const phase = readFileSync(join(repoRoot, "fullburn/PHASE"), "utf8").trim();
const reportsDir = join(repoRoot, "fullburn/reports");
// WHICH reports speak for this phase is `selectPhaseReports`' decision, driven
// by the default suite. Widened here to `/^ADVERSARY_REPORT_phase/`, a phase-1
// PASS opened the phase-0 gate with the suite green.
const reports = existsSync(reportsDir)
  ? selectPhaseReports(phase, readdirSync(reportsDir)).map((n) => ({
      name: n,
      content: readFileSync(join(reportsDir, n), "utf8"),
    }))
  : [];

try {
  assertCleanTree(repoRoot);
} catch (err) {
  console.error(`ADVERSARY GATE FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const res = checkAdversaryReport({ phase, reports, currentTreeHash: currentFullburnTreeHash(repoRoot) });
if (!res.ok) {
  console.error(`ADVERSARY GATE FAIL: ${res.reason}`);
  process.exit(1);
}
console.log(`adversary gate: ${res.reason}`);

if (baseRef) {
  // -z: NUL-separated, never quoted. A report path containing a space or a
  // non-ASCII byte was quoted by git and compared literally, walking out of the
  // append-only check (adversary finding R3-CP-08).
  const diff = execSync(`git -C ${JSON.stringify(repoRoot)} diff --name-status -z -M ${baseRef}...HEAD`, { encoding: "utf8" });
  const ao = checkReportsAppendOnly(parseNameStatusZ(diff));
  if (!ao.ok) {
    console.error(`ADVERSARY GATE FAIL: ${ao.reason}`);
    process.exit(1);
  }
  console.log(`adversary gate: ${ao.reason}`);
}
