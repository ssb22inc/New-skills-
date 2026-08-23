import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { SECRET_PATTERNS, secretRuleHits } from "../scripts/scan-lib.mjs";
import { CREDENTIALS, PLACEHOLDERS } from "./credential-corpus.ts";

/** THE ACCEPTANCE BAR FOR THE SECRET RULES (human ruling 2026-08-22).
 *
 * The corpus in `credential-corpus.ts` was authored from credential FORMATS and
 * never from `SECRET_PATTERNS`. That direction is the whole point: the previous
 * round validated the rules against a canary built from the rules, concluded
 * `.npmrc`/`.netrc`/`.pgpass` were covered, and they were not.
 *
 * Three things are proven here, and the third is the one with teeth:
 *   1. every credential in the corpus is detected;
 *   2. every placeholder is NOT — otherwise a rule matching everything passes;
 *   3. REMOVING ANY ONE RULE TURNS THE CORPUS RED. That is simultaneously a
 *      red-proof for each rule (none is decorative) and a coverage proof for
 *      the corpus (no entry is carried by a rule that also carries another). */

type Entry = { readonly what: string; readonly path: string; readonly text: string };
type Rule = { readonly name: string; readonly re: RegExp };

describe("secret rules vs. an independently authored credential corpus", () => {
  it("the corpus is big enough and covers both directions", () => {
    expect(CREDENTIALS.length, "the credential half was emptied").toBeGreaterThan(15);
    expect(PLACEHOLDERS.length, "without the negative half, a match-everything rule passes").toBeGreaterThan(3);
  });

  it("every realistic credential is detected", () => {
    const missed = (CREDENTIALS as readonly Entry[]).filter((e) => secretRuleHits(e.path, e.text).length === 0);
    expect(
      missed.map((e) => `${e.what} (${e.path})`),
      "these credentials would sit in the repository unreported",
    ).toEqual([]);
  });

  it("every placeholder stays clean", () => {
    const noisy = (PLACEHOLDERS as readonly Entry[])
      .map((e) => ({ e, hits: secretRuleHits(e.path, e.text) }))
      .filter(({ hits }) => hits.length > 0);
    expect(
      noisy.map(({ e, hits }) => `${e.what} (${e.path}) matched ${hits.join(", ")}`),
      "a rule fires on a placeholder — false positives are how a scan gets ignored",
    ).toEqual([]);
  });

  /** WHICH RULES ARE NOT LOAD-BEARING, as a function so the check itself can be
   * driven with a ruleset that HAS an idle rule.
   *
   * Written inline, this was measured SURVIVING its own mutation: dropping the
   * `detected(e, without).length === 0` clause — the entire point of the
   * check — left the suite green, because every rule in the real ruleset is
   * load-bearing and so there is no negative case among the real inputs. That
   * is the same defect the runner audit found seven times, reproduced inside
   * the check written to enforce this ruling. The negative case is supplied
   * below instead. */
  const idleRules = (all: readonly Rule[], entries: readonly Entry[]): string[] => {
    const detected = (entry: Entry, patterns: readonly Rule[]) => secretRuleHits(entry.path, entry.text, patterns);
    const idle: string[] = [];
    for (const rule of all) {
      const without = all.filter((r) => r !== rule);
      const nowMissed = entries.some(
        (e) => detected(e, all).length > 0 && detected(e, without).length === 0,
      );
      if (!nowMissed) idle.push(rule.name);
    }
    return idle;
  };

  it("the load-bearing check can answer NO — a redundant or dead rule is named", () => {
    const entry: Entry = { what: "a token", path: "x.ts", text: "token=abcdef123456\n" };
    // `broad` catches everything `narrow` does, so removing `narrow` changes
    // nothing and it must be reported.
    const redundant: Rule[] = [
      { name: "broad", re: /token=\w+/ },
      { name: "narrow", re: /token=abcdef\d+/ },
    ];
    expect(idleRules(redundant, [entry]), "a rule fully covered by another was not named").toContain("narrow");
    // A rule no corpus entry reaches at all is idle too — that is the "dead
    // rule" half, and it must not be silently tolerated.
    expect(idleRules([{ name: "unreachable", re: /^__never__$/ }], [entry])).toEqual(["unreachable"]);
    // …and a ruleset where each rule uniquely catches its own entry is clean.
    expect(
      idleRules(
        [{ name: "a", re: /AAAA/ }, { name: "b", re: /BBBB/ }],
        [
          { what: "a", path: "a.ts", text: "AAAA" },
          { what: "b", path: "b.ts", text: "BBBB" },
        ],
      ),
    ).toEqual([]);
  });

  /** MUTATION: delete a rule from SECRET_PATTERNS, or widen one until it covers
   * another's corpus entry. */
  it("removing ANY ONE rule turns the corpus red", () => {
    const all = SECRET_PATTERNS as readonly Rule[];
    expect(all.length, "no rules to check").toBeGreaterThan(10);
    expect(
      idleRules(all, CREDENTIALS as readonly Entry[]),
      "removing each of these rules left the whole corpus still detected — the rule is either dead or " +
        "duplicated by another, and the corpus has no entry that only it can catch",
    ).toEqual([]);
  });

  /** The corpus is only an acceptance bar if it is bound to the rules by
   * EXECUTION rather than by a count someone maintains. A rule added without a
   * corpus entry fails the check above; an entry no rule covers fails the one
   * before it. This states the third edge: the two lists must stay the same
   * size as each other's coverage, which is what makes "every rule is
   * load-bearing" and "every credential is caught" one property. */
  it("names every rule it drives, so a new rule cannot arrive unmeasured", () => {
    const covered = new Set<string>();
    for (const e of CREDENTIALS as readonly Entry[]) for (const n of secretRuleHits(e.path, e.text)) covered.add(n);
    const undriven = (SECRET_PATTERNS as readonly Rule[]).map((r) => r.name).filter((n) => !covered.has(n));
    expect(undriven, "these rules are not exercised by any corpus entry").toEqual([]);
  });
});
