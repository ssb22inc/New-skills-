import { GOLDEN_SET_CASE_IDS, ROLE_CARDS, attestEvalRun, evalCandidateBindings, ownEntry, structurallyEqual, type EvalAttestation, type GoldenCase } from "@fullburn/config/models";
import { RecordedTransport } from "./transport-brand.ts";
import { CANONICAL_GOLDEN_SETS } from "../evals/index.ts";


/** Moved to config with the golden sets (X5-10); re-exported for callers. */
export { structurallyEqual };

import { type LlmDeps, llm, type GatewayTransport } from "./gateway.ts";
import { TraceContext } from "./tracing.ts";

/** Eval harness (§2.4, §11 Phase 0; R6, hardened per R2-23/R2-24). Scores are
 * COMPUTED here by executing the role's golden set through the same llm() path
 * everything else uses, and the set is checked against the ids the role card
 * declares — a caller cannot substitute a friendlier set, and a constant-output
 * transport cannot manufacture coverage it did not have. Fixtures are recorded
 * MODEL OUTPUTS at the transport level, never pre-computed scores. Generating
 * fresh outputs needs live keys (H6, ledger L2); the scoring logic does not.
 * Langfuse eval push sits behind the TraceSink adapter (H5, ledger L3). */

export type { GoldenCase };

/** Re-exported: the class lives beside its brand (X3-14). */
export { RecordedTransport };


export interface EvalResult {
  readonly role: string;
  readonly modelId: string;
  readonly score: number;
  readonly total: number;
  readonly passed: number;
  readonly failures: readonly string[];
  /** The binding evidence. Only this object binds a model to a role. */
  readonly attestation: EvalAttestation;
}

export async function runEval(
  baseDeps: Omit<LlmDeps, "transport" | "bindings">,
  role: string,
  modelId: string,
  goldenSet: readonly GoldenCase[],
  recorded: RecordedTransport,
  clientId: string,
): Promise<EvalResult> {
  const card = ownEntry(ROLE_CARDS, role);
  if (card === undefined) throw new Error(`unknown role "${role}"`);
  if (goldenSet.length === 0) throw new Error("empty golden set — an eval over nothing proves nothing");

  // The set must be the one the role card declares (R2-23). A caller-supplied
  // set that does not match the declared case ids is refused before any call.
  const declared = ownEntry(GOLDEN_SET_CASE_IDS, role);
  if (declared === undefined) throw new Error(`role "${role}" declares no golden set`);
  const supplied = goldenSet.map((c) => c.id).sort();
  const expected = [...declared].sort();
  if (supplied.length !== expected.length || expected.some((id, i) => id !== supplied[i])) {
    throw new Error(
      `golden set for "${role}" does not match the ids declared on its role card (expected ${expected.join(",")}; got ${supplied.join(",")})`,
    );
  }

  // Every case must assert EVERY field the role card requires (adversary
  // finding DT-01). `Object.entries({}).every(...)` is vacuously true, so a
  // golden set carrying the declared case ids with empty — or narrowed —
  // expectations scored a model 1.0 that honestly scores 0.2, and it bound.
  const required = [...card.outputSchema.required].sort();
  for (const gcase of goldenSet) {
    const asserted = Object.keys(gcase.expected ?? {}).sort();
    if (asserted.length !== required.length || required.some((k, i) => k !== asserted[i])) {
      throw new Error(
        `golden case "${gcase.id}" for "${role}" must assert exactly the fields the role card requires (${required.join(",")}); it asserts ${asserted.join(",") || "nothing"}`,
      );
    }
  }

  // The FULL map with the candidate substituted (cross-family finding X-10):
  // `llm()` now validates the bindings it serves under, so a candidate that
  // would break family diversity fails its eval here, with the reason — "no
  // pass, no bind" includes "cannot be bound at all".
  // CANDIDATE provenance (X2-09): servable only through this recorded
  // transport. Built per case inside the try below, so a candidate that breaks
  // family diversity fails its eval with the reason rather than aborting it.
  /** THE SET IS THE ROLE'S OWN, NOT A CALLER'S COPY (cross-family finding
   * X2-09): the id and field checks above passed a golden set whose EXPECTED
   * values had been rewritten to the candidate's wrong answers, so a failing
   * model scored 1.0 and bound. The expectations must equal the canonical set
   * in engine/evals/ — which is Class-2 and CODEOWNER-reviewed. */
  const canonical = ownEntry(CANONICAL_GOLDEN_SETS, role);
  if (canonical === undefined || !structurallyEqual(JSON.parse(JSON.stringify(goldenSet)), JSON.parse(JSON.stringify(canonical)))) {
    throw new Error(`golden set for "${role}" is not the role's canonical set in engine/evals/ — expectations may not be supplied by the caller`);
  }

  const results: { caseId: string; output: unknown }[] = [];
  const runId = crypto.randomUUID();
  const failures: string[] = [];

  for (const gcase of goldenSet) {
    recorded.setCase(gcase.id);
    // ONE TRACE PER DECISION (cross-family finding X6-13): `eval-<role>-<case>`
    // was the same id for every model, client and run, so a remote sink that
    // keys traces by id merged distinct decisions into one record.
    const trace = new TraceContext(`eval-${role}-${modelId}-${clientId}-${runId}-${gcase.id}`, clientId);
    try {
      const bindings = evalCandidateBindings(role, modelId);
      const output = (await llm(
        { ...baseDeps, transport: recorded, bindings },
        { role, clientId, input: gcase.input, trace },
      )) as Record<string, unknown>;
      const ok = Object.entries(gcase.expected).every(([k, v]) => structurallyEqual(output[k], v));
      results.push({ caseId: gcase.id, output });
      if (!ok) failures.push(`${gcase.id}: field mismatch`);
    } catch (err) {
      results.push({ caseId: gcase.id, output: null });
      failures.push(`${gcase.id}: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  // The outputs, not a verdict: attestEvalRun grades them itself (X5-10).
  const attestation = attestEvalRun(role, modelId, results);
  return {
    role,
    modelId,
    score: attestation.score,
    total: attestation.total,
    passed: attestation.passed,
    failures,
    attestation,
  };
}
