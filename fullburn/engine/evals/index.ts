import type { GoldenCase } from "../src/eval-harness.ts";
import { GOLDEN as HELLO_WORLD } from "./hello-world/golden.ts";
import { GOLDEN as GENOME_TAGGER } from "./genome-tagger/golden.ts";
import { GOLDEN as CREATIVE_DECISION_ADVERSARY } from "./creative-decision-adversary/golden.ts";

/** The canonical golden set per role (X2-09). `runEval` refuses any other. */
export const CANONICAL_GOLDEN_SETS: Readonly<Record<string, readonly GoldenCase[]>> = Object.freeze({
  "hello-world": HELLO_WORLD,
  "genome-tagger": GENOME_TAGGER,
  "creative-decision-adversary": CREATIVE_DECISION_ADVERSARY,
});
