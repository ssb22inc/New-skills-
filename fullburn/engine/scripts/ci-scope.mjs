#!/usr/bin/env node
/** DOES THIS CHANGE NEED THE FULLBURN GATE? — the trigger's `paths:` filter,
 * moved inside the job.
 *
 * WHY IT MOVED (human ruling 2026-08-23, §7.0 item 2). `fullburn-ci` filtered
 * on `paths: ["fullburn/**", ".github/**"]` at the trigger. That is correct
 * while the check is advisory and CATASTROPHIC the moment it becomes required:
 * a workflow skipped by path filtering never creates its check runs at all, so
 * GitHub leaves the pull request at *Expected — waiting for status* forever.
 * Fail-open would have been traded for permanently stuck.
 *
 * So the workflow now runs on EVERY push and EVERY pull request, and this
 * decides whether the expensive steps execute. The job still completes, still
 * reports SUCCESS, and still does so under the same check name — which is the
 * only shape a required check can take.
 *
 * FAIL-SAFE DIRECTION IS "RUN THE GATE". Anything this cannot determine — no
 * base ref, a new branch, an unreadable diff — returns true. A gate that runs
 * when it did not need to costs minutes; a gate that skips when it was needed
 * is the whole defect this project exists to prevent. */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { globsAdmit } from "./gate-lib.mjs";
import { parseNameStatusZ } from "./diff-lib.mjs";

/** The paths a fullburn verdict is a statement about. Identical to the globs
 * that used to sit in the trigger — the LOCATION changed, not the scope, and
 * `locks-r7` holds these to `CLASS2_PATTERNS` so a Class-2 path cannot fall
 * outside them (adversary finding R8-04b). */
export const CI_SCOPE_GLOBS = Object.freeze(["fullburn/**", ".github/**"]);

/** @param changedFiles paths relative to the repository root */
export function inScope(changedFiles, globs = CI_SCOPE_GLOBS) {
  // UNKNOWN IS IN SCOPE. Not an empty result, not a guess.
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return true;
  return changedFiles.some((f) => typeof f === "string" && globs.some((g) => globsAdmit([g], f)));
}

/** The changed files between two refs, or null when that cannot be determined. */
export function changedFilesBetween(repoRoot, baseRef, headRef, git = null) {
  const run =
    git ??
    ((args) => execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", maxBuffer: 1 << 28 }));
  try {
    return parseNameStatusZ(run(["diff", "--name-status", "-z", "-M", `${baseRef}...${headRef}`])).flatMap((e) =>
      e.oldPath === undefined ? [e.path] : [e.oldPath, e.path],
    );
  } catch {
    return null;
  }
}

// Runs only as a CLI, never on import — the standing rule for every tool in
// this directory, even one that writes nothing.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repoRoot = ".", baseRef, headRef = "HEAD"] = process.argv.slice(2);
  const files = baseRef ? changedFilesBetween(repoRoot, baseRef, headRef) : null;
  const relevant = inScope(files);
  // Machine-readable for `>> $GITHUB_OUTPUT`, and legible in the log.
  console.log(`relevant=${relevant}`);
  console.error(
    files === null
      ? `ci-scope: could not diff ${baseRef ?? "(no base ref)"}...${headRef} — running the gate (fail-safe)`
      : `ci-scope: ${files.length} changed file(s); ${relevant ? "IN SCOPE — running the gate" : "out of scope — the gate has nothing to check"}`,
  );
}
