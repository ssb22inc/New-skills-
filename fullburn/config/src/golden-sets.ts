import { deepFreeze } from "./freeze.ts";

/** THE CANONICAL GOLDEN SETS, OWNED BY CONFIG (cross-family finding X5-10,
 * GPT-6 Astra, 2026-10-06). They lived in engine/evals/, where config could
 * not see them, so `attestEvalRun` had to TAKE per-case pass/fail booleans
 * from its caller — and a caller could mark every case passed with no model
 * output at all. With the expectations here, `attestEvalRun` takes the model's
 * OUTPUTS and grades them itself. engine/evals/ re-exports these.
 *
 * Expected values are human-authored ground truth; each case asserts every
 * field its role card requires (DT-01). Deep-frozen (X3-11). */
export interface GoldenCase {
  readonly id: string;
  readonly input: unknown;
  /** Expected fields; a case passes when every expected field matches exactly. */
  readonly expected: Readonly<Record<string, unknown>>;
}

export const GOLDEN_SETS: Readonly<Record<string, readonly GoldenCase[]>> = deepFreeze({
  "hello-world": [
    { id: "h1", input: { say: "hi" }, expected: { greeting: "hello" } },
  ],
  "genome-tagger": [
    {
      id: "g1",
      input: { ad: "POV: your sunscreen doesn't feel like glue. CoralCove mineral SPF50." },
      expected: { hook: "pov", angle: "anti-greasy", emotion: "relief", format: "ugc-video", offer: "none" },
    },
    {
      id: "g2",
      input: { ad: "Dermatologist and dad of 3: here's what I put on my kids at the beach." },
      expected: { hook: "authority", angle: "derm-dad", emotion: "trust", format: "talking-head", offer: "none" },
    },
    {
      id: "g3",
      input: { ad: "Reef-safe or reef-wash? We publish our full ingredient list. 20% off first order." },
      expected: { hook: "callout", angle: "reef-guilt", emotion: "skepticism", format: "static", offer: "discount-20" },
    },
    {
      id: "g4",
      input: { ad: "The beach-bag test: 6 sunscreens, one winner, zero white cast." },
      expected: { hook: "comparison", angle: "beach-bag-test", emotion: "curiosity", format: "ugc-video", offer: "none" },
    },
    {
      id: "g5",
      input: { ad: "Kids cry about sunscreen. Ours goes on like lotion. Free travel size with every order." },
      expected: { hook: "pain-point", angle: "kids-wont-cry", emotion: "empathy", format: "ugc-video", offer: "gift-with-purchase" },
    },
  ],
  "creative-decision-adversary": [
    {
      id: "a1",
      input: { proposal: "KILL ad #12 after 1.8 days", spendUsd: 14, conversions: 0 },
      expected: { verdict: "BLOCK", reasons: ["protection window not closed"] },
    },
    {
      id: "a2",
      input: { proposal: "PROMOTE ad #7 on CTR 2.3%", warehouseRevenueUsd: 41 },
      expected: { verdict: "BLOCK", reasons: ["proxies kill, never promote"] },
    },
    {
      id: "a3",
      input: { proposal: "KILL ad #3 after 3.1 days", spendUsd: 62, conversions: 0 },
      expected: { verdict: "ALLOW", reasons: ["window closed, minimum spend met"] },
    },
  ],
});

/** Structural equality for an expected field (cross-family finding X-13):
 * JSON-shaped values only — that is what a schema-validated output is. */
export function structurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((v, i) => structurallyEqual(v, (b as unknown[])[i]));
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && structurallyEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Does one output pass one case? Every expected field must match; an output
 * that is not a plain object passes nothing. */
export function gradeCase(gcase: GoldenCase, output: unknown): boolean {
  if (typeof output !== "object" || output === null || Array.isArray(output)) return false;
  return Object.entries(gcase.expected).every(([k, v]) => structurallyEqual((output as Record<string, unknown>)[k], v));
}
