import { describe, expect, it } from "vitest";
import {
  BindingError,
  GOLDEN_SETS,
  ROLE_BINDINGS,
  type EvalAttestation,
  attestEvalRun,
  bindRole,
  validateBindings,
} from "@fullburn/config/models";

/** Attestations are minted only by attestEvalRun, over the role's DECLARED
 * golden-set case ids (adversary finding R2-22). `passed` cases here stand in
 * for an executed run; config/test/adversary-phase0.test.ts proves that a
 * hand-written literal does not bind at all. */
const att = (role: string, modelId: string, passedCount: number): EvalAttestation =>
  attestEvalRun(
    role,
    modelId,
    GOLDEN_SETS[role]!.map((c, i) => ({ caseId: c.id, output: i < passedCount ? c.expected : {} })),
  );

describe("model layer (Law 13, §2.4, R9a)", () => {
  it("launch bindings satisfy family diversity", () => {
    expect(() => validateBindings(ROLE_BINDINGS)).not.toThrow();
  });

  it("a domain that builds must also be attacked — the pairing rule itself (R2-26)", () => {
    // The F11 fix was the pairing check, but its lock test passed for a
    // different reason (completeness), so deleting the pairing loop left the
    // suite green. This drives the rule directly, with a complete map.
    const cards = {
      "solo-builder": {
        role: "solo-builder", domain: "lonely", side: "builder" as const,
        task: "t", contextBudgetTokens: 1, latencyBudgetMs: 1, costBudgetUsdPerCall: 0.01,
        outputSchema: { type: "object" as const, required: [], properties: {} },
        goldenSet: "evals/none", evalThreshold: 1,
      },
    };
    expect(() => validateBindings({ "solo-builder": "qwen-72b" }, cards)).toThrow(/no adversary/);
  });

  it("binding a domain's builder and adversary to the same family is refused", () => {
    // genome-tagger (builder, creative) currently qwen; adversary is claude.
    // Moving the builder onto claude collides with the adversary's family.
    expect(() =>
      bindRole(ROLE_BINDINGS, "genome-tagger", "claude-sonnet", att("genome-tagger", "claude-sonnet", 5)),
    ).toThrow(/family-diversity/);
  });

  it("below-threshold eval score is refused: no pass, no bind", () => {
    expect(() =>
      bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", att("genome-tagger", "llama-70b", 1)),
    ).toThrow(/no pass, no bind/);
  });

  it("a bare number is not an eval result (a fixture cannot claim a pass)", () => {
    expect(() =>
      bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", Number.NaN as unknown as EvalAttestation),
    ).toThrow(BindingError);
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", 1 as unknown as EvalAttestation)).toThrow(
      BindingError,
    );
  });

  it("bindings are immutable; rebind returns a new frozen object", () => {
    expect(() => {
      (ROLE_BINDINGS as Record<string, string>)["genome-tagger"] = "gpt-5";
    }).toThrow(TypeError);
  });

  it("unknown role or model is refused", () => {
    expect(() => bindRole(ROLE_BINDINGS, "nonexistent-role", "qwen-72b", att("genome-tagger", "qwen-72b", 5))).toThrow(
      BindingError,
    );
    expect(() =>
      bindRole(ROLE_BINDINGS, "genome-tagger", "nonexistent-model", att("genome-tagger", "qwen-72b", 5)),
    ).toThrow(BindingError);
  });
});

/** X5-10 (GPT-6 Astra, 2026-10-06): `attestEvalRun` took per-case booleans, so
 * marking every case passed with no model output minted a binding attestation
 * for a model whose real answers fail. It now grades the outputs itself. */
describe("an eval attestation is graded, not reported (X5-10)", () => {
  it("booleans with no outputs earn nothing, and cannot bind", () => {
    const claimed = attestEvalRun(
      "genome-tagger",
      "llama-70b",
      GOLDEN_SETS["genome-tagger"]!.map((c) => ({ caseId: c.id, passed: true }) as unknown as { caseId: string; output: unknown }),
    );
    expect(claimed.passed, "a claimed pass with no output was counted").toBe(0);
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", claimed)).toThrow(BindingError);
  });

  it("outputs are graded field by field against the canonical set", () => {
    const set = GOLDEN_SETS["genome-tagger"]!;
    const nearMiss = attestEvalRun("genome-tagger", "qwen-72b", set.map((c) => ({ caseId: c.id, output: { ...c.expected, hook: "wrong" } })));
    expect(nearMiss.passed).toBe(0);
    const right = attestEvalRun("genome-tagger", "qwen-72b", set.map((c) => ({ caseId: c.id, output: c.expected })));
    expect(right.passed).toBe(set.length);
    expect(attestEvalRun("genome-tagger", "qwen-72b", set.map((c) => ({ caseId: c.id, output: null }))).passed).toBe(0);
  });
});
