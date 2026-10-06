import { GOLDEN_SETS, type GoldenCase } from "@fullburn/config/models";

/** Golden set for the genome-tagger role. Expected values are human-authored
 * ground truth. Recorded model outputs live beside this file, keyed by case id,
 * captured at the TRANSPORT level (adversary finding R6) — the harness computes
 * scores; nothing here stores a score.
 *
 * LEDGER ITEM: current recorded outputs are placeholders authored to exercise
 * the harness; they must be regenerated from live models once keys exist (H6).
 * Until then no production bind may rely on them (see LIVE_VERIFICATION_LEDGER). */
// The data lives in config/src/golden-sets.ts since X5-10 (2026-10-06).
export const GOLDEN: readonly GoldenCase[] = GOLDEN_SETS["genome-tagger"]!;
