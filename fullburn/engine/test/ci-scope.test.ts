import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { CI_SCOPE_GLOBS, changedFilesBetween, inScope } from "../scripts/ci-scope.mjs";

/** THE SCOPE DECISION THAT USED TO BE A `paths:` FILTER ON THE TRIGGER.
 *
 * It moved because a path-filtered workflow creates NO CHECK RUNS when it
 * skips, so the moment `fullburn-ci` becomes a required status check a skip
 * pins the pull request at "Expected — waiting for status" forever. Fail-open
 * would have been traded for permanently stuck (human ruling 2026-08-23).
 *
 * A filter on a trigger is unreachable from `npm test` by construction — it is
 * evaluated by GitHub, not by any code we run. Moving it into a module is what
 * makes it testable at all, which is the R14-06 rule paying out again. */
describe("ci-scope — whether a diff needs the fullburn gate", () => {
  it("a change inside the verdict's scope runs the gate", () => {
    expect(inScope(["fullburn/config/src/caps.ts"])).toBe(true);
    expect(inScope([".github/CODEOWNERS"])).toBe(true);
    expect(inScope([".github/workflows/fullburn-ci.yml"])).toBe(true);
    // X2-04: the primary scanner's configuration runs the gate it configures.
    expect(inScope([".gitleaks.toml"])).toBe(true);
    // X3-02 (2026-10-04): a Class-2 path is in scope wherever it lives.
    // MUTATION: X3-02.
    expect(inScope(["package.json"]), "a root package.json skipped the gate").toBe(true);
    expect(inScope([".npmrc"]), "a root .npmrc skipped the gate").toBe(true);
    expect(inScope(["vitest.config.ts"])).toBe(true);
    expect(inScope(["README.md"]), "an ordinary root file entered the scope").toBe(false);
    // X4-02 (2026-10-04): sibling builds are not Fullburn's — their configs are
    // neither Class-2 nor in Fullburn's CI scope. MUTATION: X4-02.
    expect(inScope(["haven/package.json"]), "a sibling build's package.json ran Fullburn's gates").toBe(false);
    expect(inScope(["pulsern/vite.config.js"])).toBe(false);
    expect(inScope(["fullburn/engine/package.json"])).toBe(true);
    expect(inScope([".gitleaksignore"])).toBe(true);
    expect(inScope(["fullburn/PHASE"])).toBe(true);
    // One relevant file among many irrelevant ones is still relevant.
    expect(inScope(["haven/README.md", "pulsern/x.ts", "fullburn/engine/src/gateway.ts"])).toBe(true);
  });

  /** The negative half. Without it a filter admitting everything passes, the
   * job never skips, and the change is pointless. */
  it("a change touching nothing fullburn is about does not", () => {
    expect(inScope(["haven/README.md"])).toBe(false);
    expect(inScope(["pulsern/src/app/page.tsx", "haven/terraform/aws/main.tf"])).toBe(false);
    expect(inScope(["README.md"])).toBe(false);
    // The exact shape of the throwaway PR that measured the fail-open: a
    // root-level file, which is what produced `mergeable_state: clean`.
    expect(inScope(["THROWAWAY-MEASUREMENT-DELETE-ME.md"])).toBe(false);
  });

  /** MUTATION: return false when the diff cannot be determined.
   *
   * This is the direction that matters. A gate that runs when it need not costs
   * minutes; a gate that skips when it was needed is the entire defect this
   * project exists to prevent — so every unknown resolves to RUN. */
  it("anything undeterminable is IN scope", () => {
    expect(inScope(null as unknown as string[]), "a failed diff skipped the gate").toBe(true);
    expect(inScope(undefined as unknown as string[])).toBe(true);
    expect(inScope([]), "an empty diff skipped the gate").toBe(true);
    expect(inScope("fullburn/x.ts" as unknown as string[]), "a non-array skipped the gate").toBe(true);
    // A malformed entry must not be silently treated as out of scope.
    expect(inScope([null as unknown as string])).toBe(false);
  });

  it("a renamed file is in scope by BOTH of its paths", () => {
    const git = (args: string[]) => {
      expect(args).toContain("--name-status");
      // A rename OUT of the scope: the old path is what matters.
      return ["R097", "fullburn/config/src/caps.ts", "haven/caps.ts", ""].join("\0");
    };
    const files = changedFilesBetween(".", "base", "head", git);
    expect(files, "a rename dropped one of its two paths").toEqual([
      "fullburn/config/src/caps.ts",
      "haven/caps.ts",
    ]);
    expect(inScope(files), "moving a Class-2 file OUT of scope escaped the gate").toBe(true);
  });

  it("a diff that cannot be run is null, not an empty result", () => {
    const files = changedFilesBetween(".", "base", "head", () => {
      throw new Error("fatal: bad revision");
    });
    expect(files, "a failed git diff was reported as 'no files changed'").toBe(null);
    expect(inScope(files), "and a failed diff must still run the gate").toBe(true);
  });

  it("the scope is the one the trigger used to carry", () => {
    // Widened 2026-09-24 by the primary scanner's configuration (X2-04): what
    // gitleaks reports is decided by these two files, so they run the gate.
    expect([...CI_SCOPE_GLOBS].sort()).toEqual([".claude/agents/**",".github/CODEOWNERS",".github/workflows/cross-family-read.yml",".github/workflows/fullburn-*",".gitleaks.toml",".gitleaksignore","DONE.md","fullburn/**"]);
    // The completion contract (DONE.md §3) — a change to what "done" means
    // must run the gate.
    expect(inScope(["DONE.md"])).toBe(true);
    // The agent-discovery tree is in scope: a change to the adversary's own
    // definition must run the gate that definition guards (2026-09-20).
    expect(inScope([".claude/agents/engine-adversary.md"])).toBe(true);
  });
});

describe("the verified tree covers the scanner configuration (X3-06)", () => {
  /** MUTATION: X3-06. A change to what gitleaks reports must stale a PASS. */
  it("VERIFIED_TREE_SCOPE includes the root gitleaks files", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { VERIFIED_TREE_SCOPE } = await import("../scripts/gate-lib.mjs");
    expect(VERIFIED_TREE_SCOPE).toContain(".gitleaks.toml");
    expect(VERIFIED_TREE_SCOPE).toContain(".gitleaksignore");
    // X4-02b: the root .gitignore is Class-2 and decides what is tracked.
    expect(VERIFIED_TREE_SCOPE).toContain(".gitignore");
  });
});

/** NO CROSS-CONTAMINATION (human instruction 2026-10-06; measured 2026-10-07
 * when main's PulseRN workflows, GitHub's exercise workflows and an unrelated
 * skill turned out to sit in the shared `.github/` and `.claude/`): another
 * project's files are not Fullburn Class-2, do not trigger Fullburn's gates,
 * and are not part of the tree a Fullburn review binds to.
 * MUTATION: XC-01 (Class-2), XC-02 (CI scope), XC-03 (verified tree). */
describe("other projects' files are outside every Fullburn gate", () => {
  it("is decided by Fullburn's own paths only", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { isClass2, VERIFIED_TREE_SCOPE } = await import("../scripts/gate-lib.mjs");
    const foreign = [".github/workflows/pulsern-ci.yml", ".github/workflows/0-start-exercise.yml", ".github/steps/x-review.md", ".claude/skills/ox-alpha/SKILL.md"];
    for (const p of foreign) {
      expect(isClass2(p), `${p} is Fullburn Class-2`).toBe(false);
      expect(inScope([p]), `${p} runs Fullburn's gates`).toBe(false);
    }
    for (const p of [".github/workflows/fullburn-ci.yml", ".github/workflows/fullburn-gates.yml", ".github/workflows/cross-family-read.yml", ".github/CODEOWNERS", ".claude/agents/engine-adversary.md"]) {
      expect(isClass2(p), `${p} left Fullburn's Class-2 set`).toBe(true);
      expect(inScope([p]), `${p} left Fullburn's CI scope`).toBe(true);
    }
    // The verified tree, measured through git on a scratch repository.
    const { execFileSync } = await import("node:child_process");
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join, dirname } = await import("node:path");
    const repo = mkdtempSync(join(tmpdir(), "scope-"));
    try {
      execFileSync("git", ["init", "-q", repo]);
      for (const p of [...foreign, ".github/workflows/fullburn-ci.yml", ".github/CODEOWNERS", ".claude/agents/engine-adversary.md", "fullburn/PHASE"]) {
        mkdirSync(join(repo, dirname(p)), { recursive: true });
        writeFileSync(join(repo, p), "x\n");
      }
      execFileSync("git", ["-C", repo, "add", "-A"]);
      const listed = execFileSync("git", ["-C", repo, "ls-files", "--", ...VERIFIED_TREE_SCOPE], { encoding: "utf8" }).split("\n").filter(Boolean);
      for (const p of foreign) expect(listed, `${p} is in Fullburn's verified tree`).not.toContain(p);
      for (const p of [".github/workflows/fullburn-ci.yml", ".github/CODEOWNERS", ".claude/agents/engine-adversary.md", "fullburn/PHASE"]) expect(listed).toContain(p);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
