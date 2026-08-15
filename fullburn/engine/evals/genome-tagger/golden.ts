import type { GoldenCase } from "../../src/eval-harness.ts";

/** Golden set for the genome-tagger role. Expected values are human-authored
 * ground truth. Recorded model outputs live beside this file, keyed by case id,
 * captured at the TRANSPORT level (adversary finding R6) — the harness computes
 * scores; nothing here stores a score.
 *
 * LEDGER ITEM: current recorded outputs are placeholders authored to exercise
 * the harness; they must be regenerated from live models once keys exist (H6).
 * Until then no production bind may rely on them (see LIVE_VERIFICATION_LEDGER). */
export const GOLDEN: readonly GoldenCase[] = [
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
];
