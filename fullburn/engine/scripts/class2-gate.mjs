#!/usr/bin/env node
/** CI wrapper for the Class-2 change-control gate (Law 2/14/15, §13; F14,
 * R2-05/06/31/32). Approvals must be added in this diff and must authorize the
 * exact transition (from-hash → to-hash), so a superseded approval cannot be
 * replayed to reinstate content a human already revoked.
 * Usage: node class2-gate.mjs <repo-root> <base-ref> */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { REGULAR_FILES_SCOPE, checkMoneyCapGate, checkRegularFilesOnly, selectApprovalDocs } from "./gate-lib.mjs";
import { fetchCommitAuth } from "./github-auth.mjs";
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
// NO SHELL, ANYWHERE IN THIS GATE (cross-family finding X7-04, 2026-10-09):
// paths and refs come from the pull request, and JSON.stringify is not shell
// quoting — `$(...)` and backticks still ran inside its double quotes, with the
// job's token in the environment. Every git call is an argument vector.
const git = (args, encoding = "utf8") => execFileSync("git", ["-C", repoRoot, ...args], { encoding });

// X7-01: a cap file or an approval that is a link reads content no approval
// binds. Refused before anything is read through the filesystem.
const regular = checkRegularFilesOnly(git(["ls-files", "-s", "-z", "--", ...REGULAR_FILES_SCOPE]));
if (!regular.ok) {
  console.error(`CLASS-2 GATE FAIL: ${regular.reason}`);
  process.exit(1);
}
const diff = git(["diff", "--name-status", "-z", "-M", `${baseRef}...HEAD`]);
const changedFiles = parseNameStatusZ(diff);

// Approval entries are only credible if they arrived with the change they
// approve. Who wrote them is H19's job: CODEOWNERS on APPROVALS/**.

// WHICH files are credible approval documents is `selectApprovalDocs`'
// decision, driven by the default suite. Inline here, dropping the "added"
// clause let a PR rewrite an approval that existed at the base and have the
// rewrite authorize a fresh transition, with the suite green.
const approvalDocs = selectApprovalDocs(changedFiles)
  .map((f) => ({
    path: f.path,
    status: f.status,
    content: readFileSync(join(repoRoot, f.path), "utf8"),
    // Who committed the approval. Self-asserted and therefore not proof of a
    // human — but it does refuse the automation principal signing its own work
    // (R7-07). CODEOWNERS + branch protection is the half that proves identity.
    authoredBy: git(["log", "-1", "--format=%an <%ae>", "--", f.path]).trim(),
  }));

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const resolvedBase = git(["rev-parse", "--verify", `${baseRef}^{commit}`]).trim();

// WHO added each approval, as GitHub records it (X5-03): the commit in this
// range that added the document, its signature verification and its author's
// account. Fetched here; decided by checkMoneyCapGate.
// X6-03: every commit in the range that touched the document, not only the
// one that added it — the bytes parsed are the current ones.
for (const d of approvalDocs) {
  const touchedIn = git(["log", "--format=%H", `${baseRef}..HEAD`, "--", d.path]).split("\n").map((l) => l.trim()).filter(Boolean);
  d.auth = [];
  for (const sha of touchedIn) {
    d.auth.push(await fetchCommitAuth({
      repo: process.env.GITHUB_REPOSITORY ?? "",
      sha,
      token: process.env.GITHUB_TOKEN ?? "",
      apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
    }));
  }
}

const res = checkMoneyCapGate({
  maintainer: process.env.FULLBURN_MAINTAINER ?? "",
  changedFiles,
  approvalDocs,
  hashOf: (p) => sha(readFileSync(join(repoRoot, p))),
  // The content this transition starts FROM, read at the PR base.
  baseHashOf: (p) =>
    sha(git(["show", `${baseRef}:${p}`], "buffer")),
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
