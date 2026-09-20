import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { ENGINE_REQUIREMENTS, PHASE0_REQUIREMENTS, completionSentence, gateAck, isNonClaudeFamily, metaVerdict, mutateCondition, parseArgs, parseMutate, parseOwed, parseVitest, preflightRefusals, renderReport, reportPath, reviewerFamily, verdict } from "../scripts/done-lib.mjs";

/** THE COMPLETION CHECKER'S DECISIONS, DRIVEN (DONE.md §3).
 *
 * `done.mjs` is the only thing in this project allowed to say "complete", and
 * DONE.md §0 records that self-assessment has failed near-universally here. So
 * every decision it makes is a pure function with a negative case: a checker
 * whose only exercised inputs are passing ones is the r9 defect at the top
 * level. */
describe("done-lib — the completion checker cannot be talked into a verdict", () => {
  it("accepts exactly the two targets and one flag", () => {
    expect(parseArgs(["phase"])).toEqual({ target: "phase", skipMutate: false });
    expect(parseArgs(["--", "engine", "--skip-mutate"])).toEqual({ target: "engine", skipMutate: true });
    for (const bad of [[], ["phase0"], ["phase", "engine"], ["phase", "--force"], ["--skip-mutate"]]) {
      expect(parseArgs(bad).error, `${JSON.stringify(bad)} was accepted`).toMatch(/usage/);
    }
  });

  /** MUTATION: stop refusing a dirty tree, or a marker. */
  it("refuses a dirty tree and a mid-harness marker; accepts a clean one", () => {
    expect(preflightRefusals({ porcelain: "", markerExists: false })).toEqual([]);
    expect(preflightRefusals({ porcelain: "?? x.ts\n", markerExists: false }).join(" ")).toMatch(/dirty/);
    expect(preflightRefusals({ porcelain: " M fullburn/PHASE\n", markerExists: false }).join(" ")).toMatch(/dirty/);
    expect(preflightRefusals({ porcelain: "", markerExists: true }).join(" ")).toMatch(/marker/);
    expect(preflightRefusals({ porcelain: "\n\n", markerExists: false })).toEqual([]);
  });

  it("reads vitest's summary and returns null for anything else", () => {
    expect(parseVitest("      Tests  407 passed (407)\n")).toEqual({ failed: 0, passed: 407, skipped: 0, total: 407 });
    expect(parseVitest("      Tests  3 failed | 404 passed (407)\n")).toEqual({ failed: 3, passed: 404, skipped: 0, total: 407 });
    // The shape a `-t`-filtered run prints; unread, every filtered condition was "unparseable".
    expect(parseVitest("      Tests  2 passed | 405 skipped (407)\n")).toEqual({ failed: 0, passed: 2, skipped: 405, total: 407 });
    expect(parseVitest("      Tests  1 failed | 1 passed | 405 skipped (407)\n")).toEqual({ failed: 1, passed: 1, skipped: 405, total: 407 });
    expect(parseVitest("no summary here")).toBe(null);
    expect(parseVitest("")).toBe(null);
  });

  /** MUTATION: drop the meta-check requirement from mutateCondition. */
  it("the harness counts only when BOTH canaries reported in the same run", () => {
    const good = "  ok   negative canary — a comment-only edit must SURVIVE  |  got SURVIVED\n  ok   positive canary — a reverted guard must be CAUGHT  |  got CAUGHT\n214 mutations: 214 caught, 0 survived, 0 not found\n";
    expect(mutateCondition(parseMutate(good)).status).toBe("PASS");
    // A perfect summary with no meta-check is VOID, not a pass (DONE.md §1).
    expect(mutateCondition(parseMutate("214 mutations: 214 caught, 0 survived, 0 not found\n")).status).toBe("FAIL");
    expect(mutateCondition(parseMutate("  ok   positive canary\n214 mutations: 214 caught, 0 survived, 0 not found\n")).status).toBe("FAIL");
    // Survivors and stale entries fail.
    expect(mutateCondition(parseMutate(good.replace("0 survived", "1 survived"))).status).toBe("FAIL");
    expect(mutateCondition(parseMutate(good.replace("0 not found", "2 not found"))).status).toBe("FAIL");
    // No summary at all — the harness did not finish.
    expect(mutateCondition(parseMutate("  ok   negative canary\n  ok   positive canary\n")).status).toBe("FAIL");
    expect(mutateCondition(null).status).toBe("FAIL");
  });

  /** MUTATION: DN-16 — parseMutate stops collecting the stale names. */
  it("a failing harness names every stale and surviving entry, not only their counts", () => {
    const out =
      "  ok   negative canary  |  got SURVIVED\n  ok   positive canary  |  got CAUGHT\n" +
      "CAUGHT             R1-01 something  |  1 failed\n" +
      "PATTERN-NOT-FOUND  AD-02 the root .claude tree is Class-2  (engine/scripts/gate-lib.mjs)\n" +
      "*** SURVIVED ***   R9-09 a guard nobody tests\n" +
      "PATTERN-NOT-FOUND  AD-03 the root .claude tree is in the CI scope  (engine/scripts/ci-scope.mjs)\n" +
      "\n229 mutations: 226 caught, 1 survived, 2 not found\n";
    const p = parseMutate(out);
    expect(p.stale).toEqual(["AD-02 the root .claude tree is Class-2", "AD-03 the root .claude tree is in the CI scope"]);
    expect(p.survivors).toEqual(["R9-09 a guard nobody tests"]);
    const c = mutateCondition(p);
    expect(c.status).toBe("FAIL");
    for (const name of [...p.stale, ...p.survivors]) expect(c.observed, `the condition dropped ${name}`).toContain(name);
    // A clean run names nothing, and a CAUGHT line is never mistaken for either.
    const clean = parseMutate("  ok   negative canary\n  ok   positive canary\nCAUGHT   PATTERN-NOT-FOUND-looking name  |  x\n229 mutations: 229 caught, 0 survived, 0 not found\n");
    expect(clean.stale).toEqual([]);
    expect(clean.survivors).toEqual([]);
  });

  it("reads the owed-approvals count, or null", () => {
    expect(parseOwed("No Class-2 paths changed. This PR owes no approval entries.")).toBe(0);
    expect(parseOwed("# Class-2 approvals owed — 65 entr(y|ies)\n# base-commit: x")).toBe(65);
    expect(parseOwed("")).toBe(null);
  });

  /** MUTATION: let a Claude family count as cross-family. */
  it("a cross-family read must NAME a non-Claude family on its own line", () => {
    expect(reviewerFamily("# report\nReviewer-family: OpenAI GPT-5\nVerdict: PASS\n")).toBe("OpenAI GPT-5");
    expect(reviewerFamily("Independent cross-family review …")).toBe(null);
    expect(isNonClaudeFamily("OpenAI GPT-5")).toBe(true);
    expect(isNonClaudeFamily("Google Gemini 2.5")).toBe(true);
    expect(isNonClaudeFamily("Claude Fable 5.1")).toBe(false);
    expect(isNonClaudeFamily("anthropic/claude-opus-5")).toBe(false);
    expect(isNonClaudeFamily("")).toBe(false);
    expect(isNonClaudeFamily(null)).toBe(false);
  });

  /** MUTATION: accept an ack for a different tree. */
  it("a gate ack must name THIS tree and say yes", () => {
    const tree = "abcdef1234567890abcdef1234567890abcdef12";
    expect(gateAck(`tree: ${tree}\nack: yes\n`, tree).ok).toBe(true);
    expect(gateAck(`tree: ${tree.slice(0, 12)}\nack: yes\n`, tree).ok).toBe(true);
    expect(gateAck(`tree: 0000000000000000\nack: yes\n`, tree).ok, "an ack for another tree was accepted").toBe(false);
    expect(gateAck(`tree: ${tree}\n`, tree).ok, "silence was taken as consent").toBe(false);
    expect(gateAck(`tree: ${tree}\nack: no\n`, tree).ok).toBe(false);
    expect(gateAck("", tree).ok).toBe(false);
  });

  /** MUTATION: make verdict() ignore sub-results, or pass an empty list. */
  it("the verdict is PASS only when every condition AND sub-condition passes", () => {
    expect(verdict([{ id: "A", status: "PASS" }, { id: "B", status: "PASS", sub: [{ id: "B1", status: "PASS" }] }])).toEqual({ ok: true, failing: [] });
    expect(verdict([{ id: "A", status: "PASS" }, { id: "B", status: "PASS", sub: [{ id: "B1", status: "FAIL" }] }]).ok, "a failing sub-condition passed").toBe(false);
    expect(verdict([{ id: "A", status: "FAIL" }]).failing).toEqual(["A"]);
    // Nothing checked is not the same as everything passed.
    expect(verdict([]).ok, "an empty result set passed").toBe(false);
    expect(verdict(null).ok).toBe(false);
  });

  /** MUTATION: let the meta-check pass without the flip. */
  it("the meta-check needs the refusal AND a demonstrated PASS→FAIL flip", () => {
    expect(metaVerdict({ refusalTriggered: true, before: "PASS", after: "FAIL" }).ok).toBe(true);
    expect(metaVerdict({ refusalTriggered: false, before: "PASS", after: "FAIL" }).ok, "no refusal was accepted").toBe(false);
    expect(metaVerdict({ refusalTriggered: true, before: "PASS", after: "PASS" }).ok, "a checker blind to a planted failure passed its meta-check").toBe(false);
    // Already failing before the canary: the flip is not demonstrated, and a
    // checker that says FAIL to everything would look exactly like this.
    expect(metaVerdict({ refusalTriggered: true, before: "FAIL", after: "FAIL" }).ok, "an always-FAIL checker passed its meta-check").toBe(false);
    expect(metaVerdict({ refusalTriggered: true, before: "FAIL", after: "FAIL" }).reason).toMatch(/VOID/);
  });

  it("the requirement maps are non-empty and every unmeasurable entry says why", () => {
    expect(PHASE0_REQUIREMENTS.length).toBeGreaterThan(10);
    for (const r of PHASE0_REQUIREMENTS) {
      if (r.command === null) expect(r.why, `${r.id} is unmeasurable with no reason`).toMatch(/.{20,}/);
      else expect(r.command[0]).toBe("vitest");
    }
    expect(ENGINE_REQUIREMENTS.length).toBeGreaterThan(5);
    for (const e of ENGINE_REQUIREMENTS) expect(e.why).toMatch(/.{10,}/);
    // The five ACs are all present, by id.
    for (const ac of ["AC1-contract", "AC1-live", "AC2", "AC3", "AC4-gate", "AC4-enforced", "AC5"]) {
      expect(PHASE0_REQUIREMENTS.map((r: { id: string }) => r.id)).toContain(ac);
    }
  });

  it("the report names the tree, prints every row, and never prints the completion sentence on a FAIL", () => {
    const base = { target: "phase", phase: "0", tree: "abc123", branch: "b", startedAt: "t", meta: { ok: true, reason: "r" } };
    const failing = renderReport({ ...base, results: [{ id: "C1", title: "t1", status: "FAIL", command: "c", observed: "o" }], verdictOut: { ok: false, failing: ["C1"] }, artifact: null });
    expect(failing).toContain("INCOMPLETE");
    expect(failing).toContain("| C1 |");
    expect(failing, "a FAIL report printed the completion sentence").not.toContain("Requesting gate ack");
    expect(failing).toContain("status update, not a completion claim");
    const passing = renderReport({ ...base, results: [{ id: "C1", title: "t1", status: "PASS", command: "c", observed: "o" }], verdictOut: { ok: true, failing: [] }, artifact: "reports/x.md" });
    expect(passing).toContain(completionSentence("phase", "abc123", "reports/x.md"));
    expect(reportPath("phase", "0", "abcdef1234567890")).toBe("reports/DONE_phase0_abcdef123456.md");
    expect(reportPath("engine", "0", "abcdef1234567890")).toBe("reports/DONE_engine_abcdef123456.md");
  });
});
