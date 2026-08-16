/** The H20 recorded variance's expiry rule, as a pure function.
 *
 * The rule lived inline in the invariant suite, where it early-returned at
 * PHASE 0 — so the branch that enforces the expiry never executed in any run,
 * and a mutation widening `phase < 1` to `phase < 99` was invisible. The whole
 * point of the variance is that it cannot outlive its terms by being
 * forgotten; a rule nothing exercises has already been forgotten.
 *
 * Approved 2026-08-16: substantive e2e defers to Phase 1, the Playwright stage
 * stays installed on a minimal smoke now, and the variance expires at Phase 1's
 * gate — no real e2e on the intake confirm flow, no Phase 1 pass. */
export const E2E_VARIANCE_EXPIRES_AT_PHASE = 1;

/** Comments are stripped before matching. Written naively this check passed at
 * PHASE 1 against a smoke-only suite, because the smoke spec's own doc-comment
 * promises "real coverage of the intake confirm flow" — it matched the promise
 * instead of the work. Prose about a thing is not the thing. */
export function e2eVarianceHolds(phase: number, specs: ReadonlyArray<{ name: string; source: string }>): boolean {
  // The stage must be installed and running NOW; that half is never deferred.
  if (!specs.some((s) => s.name === "smoke.spec.ts")) return false;
  if (phase < E2E_VARIANCE_EXPIRES_AT_PHASE) return true;
  const code = specs
    .filter((s) => s.name.endsWith(".spec.ts") && s.name !== "smoke.spec.ts")
    .map((s) => s.source)
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return /intake/i.test(code) && /confirm/i.test(code);
}
