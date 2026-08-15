/** Worker entry (wrangler main). Phase 0 exposes nothing publicly — the engine
 * has no client surface until Phase 7 and no write paths until Phase 6. */
export { llm, validateOutput } from "./gateway.ts";
export { runEval, RecordedTransport } from "./eval-harness.ts";
export { computeGrades, enforcement, publishGradeReport } from "./grade-registry.ts";
export { vaultForClient, ClientVault, MemoryVaultBackend } from "./vault.ts";
export { MemorySpendMeter } from "./spend-meter.ts";
export { TraceContext, MemoryTraceSink } from "./tracing.ts";

export default {
  async fetch(): Promise<Response> {
    return new Response("fullburn: no public surface in phase 0", { status: 404 });
  },
};
