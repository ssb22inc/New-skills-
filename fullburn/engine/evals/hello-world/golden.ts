import type { GoldenCase } from "../../src/eval-harness.ts";

/** Golden set for the hello-world role. Small by design — it exists to prove
 * the Gateway round-trip, not model quality. Its case ids are the ones declared
 * in GOLDEN_SET_CASE_IDS (adversary finding DT-02: two roles declared case ids
 * that corresponded to no golden set anywhere in the repo, so the pre-write
 * coverage check was checking against nothing).
 *
 * LEDGER L2: recorded outputs are authored placeholders until live keys exist. */
export const GOLDEN: readonly GoldenCase[] = [
  { id: "h1", input: { say: "hi" }, expected: { greeting: "hello" } },
];
