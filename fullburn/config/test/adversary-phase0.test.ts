import { describe, expect, it } from "vitest";
import { GRADE_AREAS } from "@fullburn/config/grade-thresholds";
import { BindingError, type EvalAttestation, ROLE_BINDINGS, ROLE_CARDS, bindRole, validateBindings } from "@fullburn/config/models";

/** ┌─ BUILDER MODIFICATION — flagged for adversary re-review ─────────────────┐
 *  │ The three F9 cases below originally passed bare numbers to bindRole.     │
 *  │ The fix makes bindRole take the harness's EvalResult, so a bare number   │
 *  │ is now a COMPILE-time error — stronger than the finding asked for, but   │
 *  │ it stops this file typechecking. The casts below force the value past    │
 *  │ the types so the RUNTIME refusal (assertAttestation) is still proven,    │
 *  │ which is what F9 was actually about. No assertion was weakened.          │
 *  └──────────────────────────────────────────────────────────────────────────┘ */
const forced = (n: number) => n as unknown as EvalAttestation;

/** ADVERSARY PHASE 0 — Phase B lock tests (config half).
 *
 * Reproduces findings from reports/ADVERSARY_REPORT_phase0.md. Expected to FAIL
 * until the builder fixes the defect. Deterministic: no timers, no randomness. */

describe("FINDING F9 (model layer, Law 13/§2.4) — a binding score has no provenance", () => {
  it("an out-of-range score is not a possible harness result and must be refused", () => {
    // runEval() returns passed/total ∈ [0,1]. 42 cannot come from the harness.
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", forced(42))).toThrow(BindingError);
  });

  it("a negative score must be refused", () => {
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", forced(-1))).toThrow(BindingError);
  });

  it("a bare number is not proof an eval ran: bindRole must require the harness result", () => {
    // llama-70b scores 0.4 against the genome-tagger golden set (see
    // engine/test/eval-rebind.test.ts). Any caller can hand-write 1.0 instead
    // and bind a model that never passed its evals — "no pass, no bind" is
    // currently enforced against a number the caller chooses, not against
    // evidence the harness produced. Expected shape: bindRole(..., EvalResult)
    // whose role/modelId must match the rebind, so a fabricated pass is not
    // constructible without executing the golden set.
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", forced(1.0))).toThrow(BindingError);
  });
});

describe("FINDING F11 (model layer) — family diversity is vacuous when a side is unbound", () => {
  it("a domain that binds a builder must also bind that domain's adversary", () => {
    // Dropping the adversary binding satisfies validateBindings trivially, so
    // "builder and adversary always run on different families" can be defeated
    // by having no adversary at all (Law 13, §2.4).
    const builderOnly = { "genome-tagger": "claude-sonnet" };
    expect(() => validateBindings(builderOnly)).toThrow(BindingError);
  });

  it("every declared role card carries a launch binding", () => {
    for (const role of Object.keys(ROLE_CARDS)) {
      expect(Object.hasOwn(ROLE_BINDINGS, role)).toBe(true);
    }
  });
});

describe("FINDING F12 (data lies, Law 14) — the Grade Registry is missing two §12 areas", () => {
  it("every area in the §12 table has thresholds, or it can never drop below A", () => {
    // An area with no thresholds is never computed, never graded, never freezes
    // autonomy. "WordPress / SEO" and "Business health (ours)" — the latter
    // carries the guarantee-exposure cap that auto-pauses sales (§14) — are
    // absent from GRADE_AREAS entirely.
    const areas = GRADE_AREAS.map((a) => a.area);
    expect(areas).toContain("wordpress-seo");
    expect(areas).toContain("business-health");
    expect(areas).toHaveLength(8);
  });
});
