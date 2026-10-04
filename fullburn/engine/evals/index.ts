import type { GoldenCase } from "../src/eval-harness.ts";
import { deepFreeze } from "@fullburn/config/freeze";
import { GOLDEN as HELLO_WORLD } from "./hello-world/golden.ts";
import { GOLDEN as GENOME_TAGGER } from "./genome-tagger/golden.ts";
import { GOLDEN as CREATIVE_DECISION_ADVERSARY } from "./creative-decision-adversary/golden.ts";

/** The canonical golden set per role (X2-09). `runEval` refuses any other. */
// DEEP-frozen (cross-family finding X3-11, 2026-10-04): only the outer record
// was frozen, so a caller could rewrite the canonical expectations at runtime
// and the canonical-set guard compared against the rewritten authority.
export const CANONICAL_GOLDEN_SETS: Readonly<Record<string, readonly GoldenCase[]>> = deepFreeze({
  "hello-world": HELLO_WORLD,
  "genome-tagger": GENOME_TAGGER,
  "creative-decision-adversary": CREATIVE_DECISION_ADVERSARY,
});
