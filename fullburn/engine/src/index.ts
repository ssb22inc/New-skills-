/** Worker entry (wrangler main). Phase 0 exposes nothing publicly — the engine
 * has no client surface until Phase 7 and no write paths until Phase 6. */
export { llm, validateOutput } from "./gateway.ts";
export { runEval, RecordedTransport } from "./eval-harness.ts";
// The traced boundary only (X2-14): an untraced `enforcement` or
// `publishGradeReport` on the Worker surface is a decision path with no trace.
export { computeGrades, gradeAndEnforce } from "./grade-registry.ts";
export { vaultForClient, ClientVault, MemoryVaultBackend } from "./vault.ts";
export { MemorySpendMeter } from "./spend-meter.ts";
export { TraceContext, MemoryTraceSink } from "./tracing.ts";
// Production adapters (X5-12): the AI Gateway transport and the Langfuse sink.
export { AiGatewayHttpTransport } from "./gateway-http.ts";
export { LangfuseTraceSink } from "./langfuse-sink.ts";
export { EncryptedVaultBackend } from "./vault-crypto.ts";

export default {
  async fetch(): Promise<Response> {
    return new Response("fullburn: no public surface in phase 0", { status: 404 });
  },
};
