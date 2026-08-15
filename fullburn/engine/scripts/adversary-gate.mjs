#!/usr/bin/env node
/** CI wrapper for the adversary-report gate (Law 9, §10.3; hardened per R5 and
 * adversary finding F4).
 * Usage: node adversary-gate.mjs <repo-root> [base-ref]
 * - a report for the current PHASE must exist, be bound to the current tree,
 *   and read PASS (re-runs add a new report; reports are never edited)
 * - PRs may not modify existing ADVERSARY_REPORT files (append-only) */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { checkAdversaryReport, checkReportsAppendOnly } from "./gate-lib.mjs";

const repoRoot = process.argv[2] ?? ".";
const baseRef = process.argv[3] ?? null;

/** Tree hash of fullburn/ excluding reports/ and APPROVALS/ (a report cannot
 * invalidate itself by being committed).
 *
 * `git ls-files -s` reports the INDEX, not the working tree, so unstaged edits
 * would leave the hash — and therefore a report's freshness binding — looking
 * valid while the code has already moved. CI checks out clean so index and
 * worktree agree there; locally they need not, so refuse to compute a hash
 * anyone might trust from a dirty tree. */
export function assertCleanTree(root) {
  const dirty = execSync(
    `git -C ${JSON.stringify(root)} status --porcelain -- fullburn/ ':!fullburn/reports/' ':!fullburn/APPROVALS/'`,
    { encoding: "utf8" },
  )
    .split("\n")
    // Porcelain "XY path": X is the index state, Y the worktree state. Staged
    // changes (Y === " ") are already in the index and therefore in the hash;
    // only an unstaged edit makes the hash lie about the code.
    .filter((l) => l.length > 1 && l[1] !== " " && !l.startsWith("??"));
  if (dirty.length > 0) {
    throw new Error(
      `working tree has unstaged changes under fullburn/ — the verified-tree hash reads the git index, so it would not reflect them. Stage them first:\n${dirty.join("\n")}`,
    );
  }
}

export function currentFullburnTreeHash(root) {
  const out = execSync(
    `git -C ${JSON.stringify(root)} ls-files -s -- fullburn/ ':!fullburn/reports/' ':!fullburn/APPROVALS/'`,
    { encoding: "utf8" },
  );
  return execSync(`git -C ${JSON.stringify(root)} hash-object --stdin`, { input: out, encoding: "utf8" }).trim();
}

const phase = readFileSync(join(repoRoot, "fullburn/PHASE"), "utf8").trim();
const reportsDir = join(repoRoot, "fullburn/reports");
const reports = existsSync(reportsDir)
  ? readdirSync(reportsDir)
      .filter((n) => new RegExp(`^ADVERSARY_REPORT_phase${phase}(?:[._-].*)?\\.md$`).test(n))
      .sort()
      .map((n) => ({ name: n, content: readFileSync(join(reportsDir, n), "utf8") }))
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
  const diff = execSync(`git -C ${JSON.stringify(repoRoot)} diff --name-status ${baseRef}...HEAD`, { encoding: "utf8" });
  const changed = diff
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return { status: status === "A" ? "added" : status === "D" ? "deleted" : "modified", path: rest[rest.length - 1] };
    });
  const ao = checkReportsAppendOnly(changed);
  if (!ao.ok) {
    console.error(`ADVERSARY GATE FAIL: ${ao.reason}`);
    process.exit(1);
  }
  console.log(`adversary gate: ${ao.reason}`);
}
