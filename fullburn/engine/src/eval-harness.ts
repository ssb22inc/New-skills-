import { GOLDEN_SET_CASE_IDS, ROLE_CARDS, attestEvalRun, ownEntry, type EvalAttestation } from "@fullburn/config/models";
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

export interface GoldenCase {
  readonly id: string;
  readonly input: unknown;
  /** Expected fields; a case passes when every expected field matches exactly. */
  readonly expected: Readonly<Record<string, unknown>>;
}

/** Transport that replays recorded model outputs keyed by golden-case id. */
export class RecordedTransport implements GatewayTransport {
  #outputs: Readonly<Record<string, unknown>>;
  #currentCase: string | null = null;

  constructor(outputs: Readonly<Record<string, unknown>>) {
    this.#outputs = outputs;
  }

  setCase(id: string): void {
    this.#currentCase = id;
  }

  async post(): Promise<unknown> {
    if (this.#currentCase === null) throw new Error("no golden case selected");
    // Own-property lookup (adversary finding R2-24): a polluted prototype must
    // not supply a recording for a case the candidate never answered.
    const out = Object.hasOwn(this.#outputs, this.#currentCase) ? this.#outputs[this.#currentCase] : undefined;
    if (out === undefined) throw new Error(`no recorded output for case "${this.#currentCase}"`);
    return out;
  }
}

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

  const bindings = { [role]: modelId };
  const outcomes: { caseId: string; passed: boolean }[] = [];
  const failures: string[] = [];

  for (const gcase of goldenSet) {
    recorded.setCase(gcase.id);
    const trace = new TraceContext(`eval-${role}-${gcase.id}`, clientId);
    try {
      const output = (await llm(
        { ...baseDeps, transport: recorded, bindings },
        { role, clientId, input: gcase.input, trace },
      )) as Record<string, unknown>;
      const ok = Object.entries(gcase.expected).every(([k, v]) => output[k] === v);
      outcomes.push({ caseId: gcase.id, passed: ok });
      if (!ok) failures.push(`${gcase.id}: field mismatch`);
    } catch (err) {
      outcomes.push({ caseId: gcase.id, passed: false });
      failures.push(`${gcase.id}: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  const attestation = attestEvalRun(role, modelId, outcomes);
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
