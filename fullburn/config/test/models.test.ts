import { describe, expect, it } from "vitest";
import { BindingError, ROLE_BINDINGS, type EvalAttestation, bindRole, validateBindings } from "@fullburn/config/models";

/** A well-formed harness result. Only the harness can produce one honestly —
 * these tests hand-build it to exercise bindRole's acceptance path, and
 * config/test/adversary-phase0.test.ts proves malformed ones are refused. */
const att = (role: string, modelId: string, passed: number, total: number): EvalAttestation => ({
  role,
  modelId,
  passed,
  total,
  score: passed / total,
});

describe("model layer (Law 13, §2.4, R9a)", () => {
  it("launch bindings satisfy family diversity", () => {
    expect(() => validateBindings(ROLE_BINDINGS)).not.toThrow();
  });

  it("binding a domain's builder and adversary to the same family is refused", () => {
    // genome-tagger (builder, creative) currently qwen; adversary is claude.
    // Moving the builder onto claude collides with the adversary's family.
    expect(() =>
      bindRole(ROLE_BINDINGS, "genome-tagger", "claude-sonnet", att("genome-tagger", "claude-sonnet", 5, 5)),
    ).toThrow(/family-diversity/);
  });

  it("below-threshold eval score is refused: no pass, no bind", () => {
    expect(() =>
      bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", att("genome-tagger", "llama-70b", 1, 5)),
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
    expect(() => bindRole(ROLE_BINDINGS, "nonexistent-role", "qwen-72b", att("nonexistent-role", "qwen-72b", 5, 5))).toThrow(
      BindingError,
    );
    expect(() =>
      bindRole(ROLE_BINDINGS, "genome-tagger", "nonexistent-model", att("genome-tagger", "nonexistent-model", 5, 5)),
    ).toThrow(BindingError);
  });
});
