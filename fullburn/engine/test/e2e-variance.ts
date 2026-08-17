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
 * instead of the work. Prose about a thing is not the thing.
 *
 * Strings are NOT stripped here: titles are strings and must stay readable for
 * the title match. `withoutStrings` handles the body separately (R7-08). */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Blanks string literals, keeping their delimiters so structure survives.
 * Applied to a test BODY only — titles are strings and must stay readable. */
function withoutStrings(source: string): string {
  return source
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

/** Does the runner point at the directory these specs live in — and ONLY there?
 *
 * This took the FIRST `testDir:` string in the comment-stripped config, so a
 * decoy const before the real one, a decoy inside a template string, or an
 * ordinary per-project `testDir` override all made it report true while
 * Playwright ran somewhere else (adversary finding R6-03). Two of those three
 * need no intent to deceive; `projects: [{ testDir }]` is standard Playwright.
 *
 * Every occurrence is now collected and every one must name the spec directory.
 * A config that mentions two different test directories is refused whichever is
 * authoritative — the check cannot tell, and guessing is how it was fooled. */
export function runnerTargets(playwrightConfig: string, specDir: string): boolean {
  const want = specDir.replace(/^\.\//, "").replace(/\/$/, "");
  const src = code(playwrightConfig);
  // Every spelling of the key, including the computed form. `["testDir"]: "x"`
  // overrides a literal `testDir:` and the check returned true anyway, so the
  // runner ran somewhere else while the variance reported as holding
  // (adversary finding R7-08).
  const keyed = /(?:\btestDir\s*:|\[\s*["'`]testDir["'`]\s*\]\s*:)\s*["'`]([^"'`]+)["'`]/g;
  const found = [...src.matchAll(keyed)].map((m) => m[1]!.replace(/^\.\//, "").replace(/\/$/, ""));
  // Every OCCURRENCE of the key must have yielded a literal. Counting rather
  // than a negative lookahead, because `\s*(?!["\'`])` backtracks to zero width
  // and matches the well-formed case too — a check that was wrong in the
  // direction that reports trouble, but wrong all the same.
  const keys = [...src.matchAll(/(?:\btestDir\s*:|\[\s*["'`]testDir["'`]\s*\]\s*:)/g)].length;
  // A value the check cannot read statically is refused, not assumed benign.
  if (keys !== found.length) return false;
  return found.length > 0 && found.every((d) => d === want);
}

/** The body of the first test whose title matches, or null.
 *
 * Whole-file regexes were ANDed — a named test anywhere and the substring
 * `page.` anywhere, unrelated to each other. A two-line file with an empty test
 * body and `const x = "page."` satisfied the Phase-1 expiry, as did a
 * commented-out real test beside a literal (adversary finding R6-02). The body
 * is what does the work, so the body is what gets read. */
function namedTestBody(source: string, title: RegExp): string | null {
  const re = /\b(?:test|it)\s*(\.\w+)?\s*\(\s*(["'`])([^"'`]*)\2/g;
  for (const m of source.matchAll(re)) {
    // `.skip`, `.todo`, `.fixme` do not run, so they do not count.
    if (m[1] !== undefined) continue;
    if (!title.test(m[3]!)) continue;
    // Start after the arrow, not after the title: `async ({ page }) => {` opens
    // a destructuring brace first, and matching that returns the parameter list
    // as the "body".
    const after = m.index! + m[0].length;
    const arrow = source.indexOf("=>", after);
    const open = source.indexOf("{", arrow === -1 ? after : arrow + 2);
    if (open === -1) continue;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(open + 1, i);
      }
    }
  }
  return null;
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

  const title = /intake[\s\S]*confirm|confirm[\s\S]*intake/i;
  return specs
    .filter((s) => s.name.endsWith(".spec.ts") && s.name !== "smoke.spec.ts")
    .some((s) => {
      const body = namedTestBody(code(s.source), title);
      if (body === null) return false;
      // Strings are blanked HERE, not before the title match: a body whose only
      // content was `const s = "await page.goto(); expect("` satisfied every
      // check while performing no page action and no assertion (R7-08).
      const real = withoutStrings(body);
      return /\bpage\s*\./.test(real) && /\bawait\b/.test(real) && /\bexpect\s*\(/.test(real);
    });
}
