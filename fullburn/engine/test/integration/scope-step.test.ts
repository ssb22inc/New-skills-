import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** INTEGRATION — the workflow's scope step, executed as CI executes it
 * (cross-family finding X5-01, GPT-6 Astra, 2026-10-06).
 *
 * Every job asks ci-scope.mjs whether the change is Fullburn's and skips its
 * gated steps on `relevant=false`. Run from the checkout under review, a PR
 * could replace that script with one printing `relevant=false`, change
 * caps.ts in the same diff, and skip every gate — the money-cap approval check
 * included — with the workflow itself untouched. The step now runs the BASE
 * commit's script against the PR's diff.
 *
 * This test extracts the step's shell text from the real workflow and runs it
 * in a scratch repository, so it measures the shipped step, not a copy. */

const SCRIPTS = fileURLToPath(new URL("../../scripts/", import.meta.url));
const WORKFLOW = fileURLToPath(new URL("../../../../.github/workflows/fullburn-ci.yml", import.meta.url));
let repo: string;
let temp: string;

const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

/** Every scope step's `run: |` body in the workflow, de-indented. */
function scopeSteps(): string[] {
  const lines = readFileSync(WORKFLOW, "utf8").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s+- id: scope\s*$/.test(lines[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && !/^\s+run: \|\s*$/.test(lines[j]!)) {
      if (/^\s+- /.test(lines[j]!)) throw new Error(`scope step at line ${i + 1} has no 'run: |' block`);
      j++;
    }
    const indent = /^(\s*)/.exec(lines[j + 1] ?? "")![1]!.length;
    const body: string[] = [];
    for (let k = j + 1; k < lines.length; k++) {
      const l = lines[k]!;
      if (l.trim() !== "" && /^(\s*)/.exec(l)![1]!.length < indent) break;
      body.push(l.slice(indent));
    }
    out.push(body.join("\n"));
  }
  return out;
}

function runStep(body: string, base: string, head: string): string {
  const output = join(temp, `out-${Math.random().toString(36).slice(2)}`);
  writeFileSync(output, "");
  execFileSync("bash", ["-e", "-c", body], {
    cwd: repo,
    env: { ...process.env, SCOPE_BASE: base, SCOPE_HEAD: head, RUNNER_TEMP: join(temp, `rt-${Math.random().toString(36).slice(2)}`), GITHUB_OUTPUT: output },
    stdio: "pipe",
  });
  return readFileSync(output, "utf8");
}

function write(rel: string, content: string) {
  const p = join(repo, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, content);
}

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), "fullburn-scope-"));
  repo = join(temp, "repo");
  mkdirSync(repo);
  execFileSync("git", ["init", "-q", repo]);
  git("config", "user.email", "t@example.invalid");
  git("config", "user.name", "test");
  git("config", "commit.gpgsign", "false");
});

afterEach(() => rmSync(temp, { recursive: true, force: true }));

describe("the CI scope step is decided by the base commit's script (X5-01)", () => {
  it("every job's scope step runs the base's script, never the checkout's", () => {
    const steps = scopeSteps();
    // verify and mutation-harness; the two gate jobs moved to fullburn-gates.yml (X6-02).
    expect(steps.length, "a job lost its scope step, or the parser lost them").toBe(2);
    for (const s of steps) {
      expect(s).toContain('"$RUNNER_TEMP/scope-base/fullburn/engine/scripts/ci-scope.mjs"');
      expect(s, "a scope step runs the checkout's own script").not.toMatch(/node (?:fullburn\/)?engine\/scripts\/ci-scope\.mjs/);
    }
  });

  /** MUTATION: run the checkout's ci-scope.mjs in the step. */
  it("a PR that rewrites ci-scope.mjs to say 'not relevant' while raising a cap still runs every gate", () => {
    for (const f of ["ci-scope.mjs", "gate-lib.mjs", "diff-lib.mjs"]) write(`fullburn/engine/scripts/${f}`, readFileSync(join(SCRIPTS, f), "utf8"));
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 10 };\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    write("fullburn/engine/scripts/ci-scope.mjs", 'console.log("relevant=false");\n');
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 10000 };\n");
    git("add", "-A");
    git("commit", "-q", "-m", "raise the cap and silence the scope");
    const head = git("rev-parse", "HEAD");
    for (const step of scopeSteps()) {
      expect(runStep(step, base, head), "the PR's own scope script switched the gates off").toContain("relevant=true");
    }
  });

  it("a change outside Fullburn is still out of scope, decided by the base's script", () => {
    for (const f of ["ci-scope.mjs", "gate-lib.mjs", "diff-lib.mjs"]) write(`fullburn/engine/scripts/${f}`, readFileSync(join(SCRIPTS, f), "utf8"));
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    write("someotherproject/readme.txt", "not fullburn\n");
    git("add", "-A");
    git("commit", "-q", "-m", "other project");
    const head = git("rev-parse", "HEAD");
    expect(runStep(scopeSteps()[0]!, base, head)).toContain("relevant=false");
  });

  it("no scope script at the base (the bootstrap merge) runs the gate", () => {
    write("README.md", "x\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base without fullburn");
    const base = git("rev-parse", "HEAD");
    write("fullburn/engine/scripts/ci-scope.mjs", 'console.log("relevant=false");\n');
    git("add", "-A");
    git("commit", "-q", "-m", "head");
    expect(runStep(scopeSteps()[0]!, base, git("rev-parse", "HEAD"))).toBe("relevant=true\n");
  });
});

/** X6-01/X6-02 (GPT-6 Astra; human decision 2026-10-06): the gates run on
 * `pull_request_target`, from main's code, with the pull request as data.
 * MUTATION: X6-02a (trigger), X6-02b (PR code executed). */
describe("the gates run from main, never from the pull request (X6-02)", () => {
  const GATES = fileURLToPath(new URL("../../../../.github/workflows/fullburn-gates.yml", import.meta.url));
  it("triggers on pull_request_target, checks out the base, and executes nothing from the PR", () => {
    const wf = readFileSync(GATES, "utf8");
    const on = /^on:\n((?:  .*\n)+)/m.exec(wf)?.[1] ?? "";
    expect(on, "the gates are not on pull_request_target").toMatch(/^  pull_request_target:/m);
    expect(on, "the gates also run from the branch").not.toMatch(/^  pull_request:|^  push:/m);
    expect(wf.match(/ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/g)?.length, "a gate job does not check out the base").toBe(2);
    const runs = [...wf.matchAll(/^\s+run: (.*)$/gm)].map((m) => m[1]!);
    expect(runs.some((r) => /\bnpm\b/.test(r)), "a gate job installs or runs the PR's packages").toBe(false);
    for (const r of runs.filter((x) => /\bnode\b/.test(x))) {
      expect(r, "a gate job runs a script that is not main's").toMatch(/^node trusted\/fullburn\/engine\/scripts\/[\w-]+\.mjs /);
    }
    expect(wf, "the job token is not read-only").not.toMatch(/: write/);
    const ci = readFileSync(WORKFLOW, "utf8");
    expect(ci, "fullburn-ci.yml still runs the branch's own copy of a gate").not.toMatch(/^  (?:adversary-gate|class2-gate):/m);
  });
});
