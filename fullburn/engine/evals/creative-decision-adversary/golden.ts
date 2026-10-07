import { GOLDEN_SETS, type GoldenCase } from "@fullburn/config/models";

/** Golden set for the creative-domain decision adversary. Each case asserts
 * every field the role card requires (adversary finding DT-01). */
// The data lives in config/src/golden-sets.ts since X5-10 (2026-10-06).
export const GOLDEN: readonly GoldenCase[] = GOLDEN_SETS["creative-decision-adversary"]!;
