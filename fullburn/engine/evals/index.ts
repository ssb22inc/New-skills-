import { GOLDEN_SETS, type GoldenCase } from "@fullburn/config/models";

/** The canonical golden set per role (X2-09). `runEval` refuses any other.
 * Since X5-10 (2026-10-06) the sets are config's own, DEEP-frozen there
 * (cross-family finding X3-11); this is that same object, not a copy, so there
 * is exactly one authority and one freeze. */
export const CANONICAL_GOLDEN_SETS: Readonly<Record<string, readonly GoldenCase[]>> = GOLDEN_SETS;
