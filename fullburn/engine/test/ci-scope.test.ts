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
    expect([...CI_SCOPE_GLOBS].sort()).toEqual([".github/**", "fullburn/**"]);
  });
});
