#!/usr/bin/env node
/** Prints the exact set of Class-2 approvals a PR owes, with the hashes an
 * approval entry has to carry (adversary finding H-17).
 *
 * HUMAN_TASKS.md used to carry this set as a hand-written list, and it drifted
 * in both directions inside a single commit: it named two files the diff never
 * touched, and it deferred eleven test-tree paths the gate demanded in that
 * very diff. The human would then `sha256sum` a set that was not the set they
 * changed — signing off on files they had not edited while the gate stayed red
 * on the ones they had. That is precisely the failure the approval mechanism
 * exists to prevent, so the list is no longer written by hand.
 *
 * This reads the same diff, through the same `isClass2`, as `class2-gate.mjs`.
 * Emitting it from any other source is how it drifts again.
 *
 * Usage: node owed-approvals.mjs <repo-root> <base-ref> */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { approvalTransition, class2TouchedPaths } from "./gate-lib.mjs";
import { parseNameStatusZ } from "./diff-lib.mjs";

const repoRoot = process.argv[2] ?? ".";
const baseRef = process.argv[3];
if (!baseRef) {
  console.error("owed-approvals requires a base ref (the commit this PR branches from)");
  process.exit(1);
}

const git = (cmd, encoding = "utf8") => execSync(`git -C ${JSON.stringify(repoRoot)} ${cmd}`, { encoding });
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const baseCommit = git(`rev-parse ${JSON.stringify(baseRef)}`).trim();

const changed = parseNameStatusZ(git(`diff --name-status -z -M ${baseRef}...HEAD`));
const touched = class2TouchedPaths(changed);

if (touched.length === 0) {
  console.log("No Class-2 paths changed. This PR owes no approval entries.");
  process.exit(0);
}

// The same hash functions class2-gate.mjs passes in, so the printed transition
// is byte-for-byte the one the gate will look for.
const hashOf = (p) => sha(readFileSync(join(repoRoot, p)));
const baseHashOf = (p) => sha(git(`show ${JSON.stringify(`${baseRef}:${p}`)}`, "buffer"));

console.log(`# Class-2 approvals owed — ${touched.length} entr(y|ies)`);
console.log(`# base-commit: ${baseCommit}`);
console.log("#");
console.log("# Paste these into a NEW file under fullburn/APPROVALS/, added by this same");
console.log("# PR. Format and rules: fullburn/APPROVALS/README.md.");
console.log("");
for (const entry of touched) {
  const { from, to } = approvalTransition(entry, { hashOf, baseHashOf });
  console.log(`# ${entry.status}`);
  console.log(`approves: ${entry.path}`);
  console.log(`base-commit: ${baseCommit}`);
  console.log(`from-content-hash: ${from}`);
  console.log(`content-hash: ${to}`);
  console.log("");
}
