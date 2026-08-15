#!/usr/bin/env node
/** CI wrapper for the Class-2 change-control gate (Law 2/14/15, §13; R1).
 * Usage: node class2-gate.mjs <repo-root> <base-ref> */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { checkClass2Approvals } from "./gate-lib.mjs";

const repoRoot = process.argv[2] ?? ".";
const baseRef = process.argv[3];
if (!baseRef) {
  console.error("class2-gate requires a base ref (PR context)");
  process.exit(1);
}

const diff = execSync(`git -C ${JSON.stringify(repoRoot)} diff --name-status ${baseRef}...HEAD`, { encoding: "utf8" });
const changedFiles = diff
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, ...rest] = line.split("\t");
    return { status: status === "A" ? "added" : status === "D" ? "deleted" : "modified", path: rest[rest.length - 1] };
  });

const approvalsDir = join(repoRoot, "fullburn/APPROVALS");
const approvalDocs = existsSync(approvalsDir)
  ? readdirSync(approvalsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => readFileSync(join(approvalsDir, f), "utf8"))
  : [];

const res = checkClass2Approvals({
  changedFiles,
  approvalDocs,
  hashOf: (p) => createHash("sha256").update(readFileSync(join(repoRoot, p))).digest("hex"),
});

if (!res.ok) {
  console.error(`CLASS-2 GATE FAIL: ${res.reason}`);
  process.exit(1);
}
console.log(`class2 gate: ${res.reason}`);
