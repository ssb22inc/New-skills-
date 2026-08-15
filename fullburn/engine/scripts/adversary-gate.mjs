#!/usr/bin/env node
/** CI wrapper for the adversary-report gate (Law 9, §10.3; hardened per R5).
 * Usage: node adversary-gate.mjs <repo-root> [base-ref]
 * - report must exist for the current PHASE, verdict PASS, verified-tree fresh
 * - PRs may not modify existing ADVERSARY_REPORT files (append-only) */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { checkAdversaryReport, checkReportsAppendOnly } from "./gate-lib.mjs";

const repoRoot = process.argv[2] ?? ".";
const baseRef = process.argv[3] ?? null;

/** Tree hash of fullburn/ excluding reports/ and APPROVALS/ (a report cannot
 * invalidate itself by being committed). */
export function currentFullburnTreeHash(root) {
  const out = execSync(
    `git -C ${JSON.stringify(root)} ls-files -s -- fullburn/ ':!fullburn/reports/' ':!fullburn/APPROVALS/'`,
    { encoding: "utf8" },
  );
  return execSync(`git -C ${JSON.stringify(root)} hash-object --stdin`, { input: out, encoding: "utf8" }).trim();
}

const phase = readFileSync(join(repoRoot, "fullburn/PHASE"), "utf8").trim();
const reportPath = join(repoRoot, `fullburn/reports/ADVERSARY_REPORT_phase${phase}.md`);
const reportContent = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : null;

const res = checkAdversaryReport({ phase, reportContent, currentTreeHash: currentFullburnTreeHash(repoRoot) });
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
