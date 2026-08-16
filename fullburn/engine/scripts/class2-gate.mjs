#!/usr/bin/env node
/** CI wrapper for the Class-2 change-control gate (Law 2/14/15, §13; F14,
 * R2-05/06/31/32). Approvals must be added in this diff and must authorize the
 * exact transition (from-hash → to-hash), so a superseded approval cannot be
 * replayed to reinstate content a human already revoked.
 * Usage: node class2-gate.mjs <repo-root> <base-ref> */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { checkClass2Approvals } from "./gate-lib.mjs";
import { parseNameStatusZ } from "./diff-lib.mjs";

const repoRoot = process.argv[2] ?? ".";
const baseRef = process.argv[3];
if (!baseRef) {
  console.error("class2-gate requires a base ref (PR context)");
  process.exit(1);
}

// -z: NUL-separated, never quoted. With the human-readable form, a Class-2 path
// containing a space or a non-ASCII byte arrived as `"fullburn/config/src/a b.ts"`
// and matched no CLASS2_PATTERN, so the file left the protected set entirely
// (adversary finding R3-CP-08).
const diff = execSync(`git -C ${JSON.stringify(repoRoot)} diff --name-status -z -M ${baseRef}...HEAD`, { encoding: "utf8" });
const changedFiles = parseNameStatusZ(diff);

// Approval entries are only credible if they arrived with the change they
// approve. Who wrote them is H19's job: CODEOWNERS on APPROVALS/**.
const approvalDocs = changedFiles
  .filter((f) => f.status === "added" && /^fullburn\/APPROVALS\/.*\.md$/.test(f.path) && !f.path.endsWith("README.md"))
  .map((f) => ({ path: f.path, status: f.status, content: readFileSync(join(repoRoot, f.path), "utf8") }));

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const resolvedBase = execSync(`git -C ${JSON.stringify(repoRoot)} rev-parse ${JSON.stringify(baseRef)}`, {
  encoding: "utf8",
}).trim();

const res = checkClass2Approvals({
  changedFiles,
  approvalDocs,
  hashOf: (p) => sha(readFileSync(join(repoRoot, p))),
  // The content this transition starts FROM, read at the PR base.
  baseHashOf: (p) =>
    sha(execSync(`git -C ${JSON.stringify(repoRoot)} show ${JSON.stringify(`${baseRef}:${p}`)}`, { encoding: "buffer" })),
  // The commit this PR branches from. An approval names it, so an approval
  // issued for one PR cannot be replayed into another (R3-CP-01).
  baseCommit: resolvedBase,
});

if (!res.ok) {
  console.error(`CLASS-2 GATE FAIL: ${res.reason}`);
  process.exit(1);
}
// Name the ref the approval had to be bound to. N-10: the README told humans to
// write `git merge-base`, CI computed `git rev-parse` of the tip, and an
// approval written exactly as documented was rejected with no hint why.
console.log(`class2 gate: ${res.reason} (base ${baseRef} = ${resolvedBase})`);
