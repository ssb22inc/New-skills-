import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** INTEGRATION — the gate CLIs, executed as CI executes them, against a real
 * git repository.
 *
 * Every gate test before this one drove the pure library. That left the CLIs —
 * the only wiring between the library and CI — completely unexecuted, and two
 * separate reviews found defects living in exactly that gap: renaming
 * `baseCommit:` at its single call site disabled the whole pull-request binding
 * with the suite green (N-03 leg B), and swapping the NUL-separated diff parser
 * back to the text one was invisible for the same reason (R3-CP-08). A mutation
 * run confirmed both survived every unit test.
 *
 * This is also the first of §10.3's two missing pipeline stages (ledger L16). */

const SCRIPTS = fileURLToPath(new URL("../../scripts/", import.meta.url));
let repo: string;

const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

/** Runs a gate exactly as CI does. Returns exit code and combined output. */
function gate(script: string, ...args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("node", [join(SCRIPTS, script), ...args], { encoding: "utf8", stdio: "pipe" });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** The tree hash the gate itself computes: `git ls-files -s` over the verified
 * scope, hashed. reports/ and APPROVALS/ are excluded, which is what lets a
 * report bind to the tree it is then committed into. */
const currentTreeHash = () => {
  const scope = ['fullburn/', '.github/', ':!fullburn/reports/', ':!fullburn/APPROVALS/'];
  const listing = execFileSync("git", ["-C", repo, "ls-files", "-s", "--", ...scope], { encoding: "utf8" });
  return execFileSync("git", ["-C", repo, "hash-object", "--stdin"], { encoding: "utf8", input: listing }).trim();
};

const write = (rel: string, body: string) => {
  const abs = join(repo, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "fullburn-gate-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "gate test");
  write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 5 };\n");
  write("fullburn/README.md", "base\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("class2-gate CLI (N-03 leg B, R3-CP-08)", () => {
  it("blocks an unapproved Class-2 change", () => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    git("add", "-A");
    git("commit", "-q", "-m", "raise the cap");
    const res = gate("class2-gate.mjs", repo, base);
    expect(res.code).toBe(1);
    expect(res.out).toContain("caps.ts");
  });

  /** git QUOTES any path containing a space, a quote, a backslash or a
   * non-ASCII byte. With the human-readable diff the quoted form matched no
   * CLASS2_PATTERN, so the file walked straight out of the protected set. Only
   * the CLI knows which diff format it asks git for, so only the CLI can be
   * wrong about it — which is why no unit test could catch the regression.
   *
   * MUTATION: swap parseNameStatusZ back to parseNameStatus (and drop `-z`). */
  it("a Class-2 path containing a space does not walk out of the protected set", () => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/config/src/spend caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    git("add", "-A");
    git("commit", "-q", "-m", "add a spaced path");
    const res = gate("class2-gate.mjs", repo, base);
    expect(res.code, `a quoted path was treated as Class 1:\n${res.out}`).toBe(1);
    expect(res.out).toContain("spend caps.ts");
  });

  it("a non-ASCII Class-2 path is protected too", () => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/config/src/caps-café.ts", "export const CAPS = {};\n");
    git("add", "-A");
    git("commit", "-q", "-m", "add a non-ascii path");
    const res = gate("class2-gate.mjs", repo, base);
    expect(res.code, `a non-ASCII path was treated as Class 1:\n${res.out}`).toBe(1);
  });

  /** The CLI must hand the library a base commit. Renaming that one property
   * restored full approval replay with every unit test green (N-03 leg B). */
  it("a replayed approval from another pull request does not authorize the change", () => {
    const base = git("rev-parse", "HEAD").trim();
    const sha = (path: string) =>
      execFileSync("sha256sum", [join(repo, path)], { encoding: "utf8" }).split(" ")[0];
    const fromHash = sha("fullburn/config/src/caps.ts");
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    const toHash = sha("fullburn/config/src/caps.ts");

    // An approval naming a DIFFERENT pull request's base.
    write(
      "fullburn/APPROVALS/2026-01-02-caps.md",
      ["Approved-by: human", "approves: fullburn/config/src/caps.ts", "base-commit: " + "0".repeat(40),
       `from-content-hash: ${fromHash}`, `content-hash: ${toHash}`].join("\n") + "\n",
    );
    git("add", "-A");
    git("commit", "-q", "-m", "raise the cap with a replayed approval");
    const replayed = gate("class2-gate.mjs", repo, base);
    expect(replayed.code, `a replayed approval opened the gate:\n${replayed.out}`).toBe(1);

    // The same approval, naming THIS pull request's base, is honoured.
    git("rm", "-q", "fullburn/APPROVALS/2026-01-02-caps.md");
    write(
      "fullburn/APPROVALS/2026-08-16-caps.md",
      ["Approved-by: human", "approves: fullburn/config/src/caps.ts", `base-commit: ${base}`,
       `from-content-hash: ${fromHash}`, `content-hash: ${toHash}`].join("\n") + "\n",
    );
    git("add", "-A");
    git("commit", "-q", "-m", "correct the approval");
    const honoured = gate("class2-gate.mjs", repo, base);
    expect(honoured.code, honoured.out).toBe(0);
    expect(honoured.out).toContain(base);
  });

  it("refuses to run at all without a base ref", () => {
    expect(gate("class2-gate.mjs", repo).code).toBe(1);
  });
});

describe("owed-approvals CLI prints what class2-gate demands (H-17)", () => {
  it("its output, pasted verbatim into APPROVALS/, opens the gate", () => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    write("fullburn/config/src/models.ts", "export const MODELS = [];\n");
    git("add", "-A");
    git("commit", "-q", "-m", "touch two Class-2 files");

    const blocked = gate("class2-gate.mjs", repo, base);
    expect(blocked.code).toBe(1);

    const printed = gate("owed-approvals.mjs", repo, base);
    expect(printed.code, printed.out).toBe(0);
    expect(printed.out).toContain("caps.ts");
    expect(printed.out).toContain("models.ts");

    write("fullburn/APPROVALS/2026-08-16-generated.md", `Approved-by: human\n${printed.out}`);
    git("add", "-A");
    git("commit", "-q", "-m", "add the generated approvals");
    const opened = gate("class2-gate.mjs", repo, base);
    expect(opened.code, `the generated approvals did not satisfy the gate:\n${opened.out}`).toBe(0);
  });
});

describe("adversary-gate CLI — the tree hash reads the index, so the worktree must be clean", () => {
  /** `assertCleanTree` had NO test of any kind: deleting the call left the
   * suite 232/232 green and walked an untracked `engine/src/backdoor.ts` past a
   * PASS bound to a hash that structurally cannot see it (adversary findings
   * R2-19, R5-07). It is CLI-only — it shells out to `git status` — so only an
   * integration test can reach it, which is exactly why it had none.
   *
   * MUTATION: delete `assertCleanTree(repoRoot)` from adversary-gate.mjs. */
  it("an untracked module in the verified scope blocks a PASS bound to the index", () => {
    write("fullburn/PHASE", "0\n");
    // A tracked sibling, so git reports the new file by name rather than
    // collapsing a wholly-untracked directory to "?? fullburn/engine/src/".
    write("fullburn/engine/src/index.ts", "export const version = 0;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "declare the phase");
    const tree = currentTreeHash();
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", `# r\nVerdict: PASS\nverified-tree: ${tree}\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "add a PASS report");
    const base = git("rev-parse", "HEAD").trim();
    expect(gate("adversary-gate.mjs", repo, base).code, "a clean tree with a fresh PASS should open").toBe(0);

    // A brand-new module the index-based hash cannot see.
    write("fullburn/engine/src/backdoor.ts", "export const unmetered = () => 'no cap check here';\n");
    const res = gate("adversary-gate.mjs", repo, base);
    expect(res.code, `an untracked engine module sailed past the gate:\n${res.out}`).toBe(1);
    expect(res.out).toContain("backdoor.ts");

    // An unstaged EDIT to a tracked file is the same problem.
    rmSync(join(repo, "fullburn/engine/src/backdoor.ts"));
    expect(gate("adversary-gate.mjs", repo, base).code).toBe(0);
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 999999 };\n");
    expect(gate("adversary-gate.mjs", repo, base).code, "an unstaged cap edit sailed past").toBe(1);
  });

  /** MUTATION: relax the APPROVALS clause in checkReportsAppendOnly. */
  it("rewriting a signed approval is refused — APPROVALS is append-only too", () => {
    write("fullburn/PHASE", "0\n");
    write("fullburn/APPROVALS/2026-08-16-caps.md", "Approved-by: human\napproves: fullburn/config/src/caps.ts\n");
    git("add", "-A");
    git("commit", "-q", "-m", "sign the caps");
    const base = git("rev-parse", "HEAD").trim();
    const tree = currentTreeHash();
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", `# r\nVerdict: PASS\nverified-tree: ${tree}\n`);
    // Rewrite the signed approval to say something the human never signed.
    write("fullburn/APPROVALS/2026-08-16-caps.md", "Approved-by: someone else\napproves: everything, forever\n");
    git("add", "-A");
    git("commit", "-q", "-m", "quietly rewrite the approval");
    const res = gate("adversary-gate.mjs", repo, base);
    expect(res.code, `a signed approval was rewritten with the gate green:\n${res.out}`).toBe(1);
    expect(res.out).toContain("append-only");
  });
});

describe("adversary-gate CLI", () => {
  it("a FAIL report bound to the current tree blocks the gate", () => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/PHASE", "0\n");
    git("add", "-A");
    git("commit", "-q", "-m", "declare the phase");
    const tree = currentTreeHash();
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", `# r\nVerdict: FAIL\nverified-tree: ${tree}\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "add a FAIL report");
    const res = gate("adversary-gate.mjs", repo, base);
    expect(res.code).toBe(1);
  });

  it("editing an existing report is refused — reports are append-only", () => {
    write("fullburn/PHASE", "0\n");
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", "# r\nVerdict: FAIL\nverified-tree: x\n");
    git("add", "-A");
    git("commit", "-q", "-m", "add a report");
    const base = git("rev-parse", "HEAD").trim();
    // Bound to the CURRENT tree, so only the append-only rule can stop it —
    // otherwise this would pass for the wrong reason (staleness).
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", `# r\nVerdict: PASS\nverified-tree: ${currentTreeHash()}\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "edit the FAIL into a PASS");
    const res = gate("adversary-gate.mjs", repo, base);
    expect(res.code, `an edited report passed:\n${res.out}`).toBe(1);
    expect(res.out).toContain("append-only");
  });
});
