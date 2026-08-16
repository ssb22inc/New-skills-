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
/** Strip comments so prose about the work cannot stand in for the work. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Does the runner actually point at the directory these specs live in?
 *
 * The check used to read the spec DIRECTORY and never the config that executes
 * it, so repointing `testDir` at a new folder holding a stub left the variance
 * "holding" while no browser ever launched (adversary finding R5-02). A suite
 * the runner does not run is not a suite. */
export function runnerTargets(playwrightConfig: string, specDir: string): boolean {
  const m = /testDir\s*:\s*["'`]([^"'`]+)["'`]/.exec(code(playwrightConfig));
  if (m === null) return false;
  const declared = m[1]!.replace(/^\.\//, "").replace(/\/$/, "");
  return declared === specDir.replace(/^\.\//, "").replace(/\/$/, "");
}

export function e2eVarianceHolds(
  phase: number,
  specs: ReadonlyArray<{ name: string; source: string }>,
  runnerPointsHere = true,
): boolean {
  // The stage must be installed AND WIRED AND running now; that half is never
  // deferred, and "installed" without "wired" is a stage that reports green
  // while launching nothing.
  if (!runnerPointsHere) return false;
  if (!specs.some((s) => s.name === "smoke.spec.ts")) return false;
  if (phase < E2E_VARIANCE_EXPIRES_AT_PHASE) return true;

  // A one-line `const _note = "intake confirm";` satisfied a bare keyword match
  // (adversary finding R5-06), which is the same "prose is not the thing" defect
  // one level down. Real coverage means a TEST whose name says what it covers
  // and a browser it actually drives.
  const real = specs.filter((s) => s.name.endsWith(".spec.ts") && s.name !== "smoke.spec.ts").map((s) => code(s.source));
  const named = /\b(?:test|it)\s*\(\s*["'`][^"'`]*intake[^"'`]*confirm[^"'`]*["'`]/i;
  const alt = /\b(?:test|it)\s*\(\s*["'`][^"'`]*confirm[^"'`]*intake[^"'`]*["'`]/i;
  return real.some((c) => (named.test(c) || alt.test(c)) && /\bpage\s*\./.test(c));
}
