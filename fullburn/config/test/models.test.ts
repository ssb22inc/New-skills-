import { describe, expect, it } from "vitest";
import { BindingError, ROLE_BINDINGS, bindRole, validateBindings } from "@fullburn/config/models";

describe("model layer (Law 13, §2.4, R9a)", () => {
  it("launch bindings satisfy family diversity", () => {
    expect(() => validateBindings(ROLE_BINDINGS)).not.toThrow();
  });

  it("binding a domain's builder and adversary to the same family is refused", () => {
    // genome-tagger (builder, creative) currently qwen; adversary is claude.
    // Moving the builder onto claude collides with the adversary's family.
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "claude-sonnet", 1.0)).toThrow(/family-diversity/);
  });

  it("below-threshold eval score is refused: no pass, no bind", () => {
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", 0.2)).toThrow(/no pass, no bind/);
  });

  it("non-numeric harness score is refused (a fixture cannot claim a pass)", () => {
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", Number.NaN)).toThrow(BindingError);
  });

  it("bindings are immutable; rebind returns a new frozen object", () => {
    expect(() => {
      (ROLE_BINDINGS as Record<string, string>)["genome-tagger"] = "gpt-5";
    }).toThrow(TypeError);
  });

  it("unknown role or model is refused", () => {
    expect(() => bindRole(ROLE_BINDINGS, "nonexistent-role", "qwen-72b", 1)).toThrow(BindingError);
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "nonexistent-model", 1)).toThrow(BindingError);
  });
});
