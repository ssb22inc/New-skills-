import type { GoldenCase } from "../../src/eval-harness.ts";

/** Golden set for the creative-domain decision adversary. Each case asserts
 * every field the role card requires (adversary finding DT-01). */
export const GOLDEN: readonly GoldenCase[] = [
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
];
