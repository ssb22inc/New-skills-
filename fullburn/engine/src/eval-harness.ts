import { ROLE_CARDS, ownEntry } from "@fullburn/config/models";
import { type LlmDeps, llm, type GatewayTransport } from "./gateway.ts";
import { TraceContext } from "./tracing.ts";

/** Eval harness (§2.4, §11 Phase 0; adversary finding R6). Scores are COMPUTED
 * here, deterministically, by executing the role's golden set through the same
 * llm() path everything else uses. Fixtures are recorded MODEL OUTPUTS at the
 * transport level — never pre-computed scores. Generating fresh outputs needs
 * live keys (H6, ledger item); the scoring logic does not. Langfuse eval push
 * sits behind the TraceSink adapter (H5). */

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
    const out = this.#outputs[this.#currentCase];
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
}

export async function runEval(
  baseDeps: Omit<LlmDeps, "transport" | "bindings">,
  role: string,
  modelId: string,
  goldenSet: readonly GoldenCase[],
  recorded: RecordedTransport,
  clientId: string,
): Promise<EvalResult> {
  // Own-property lookup (adversary finding F17) — keeps the codebase-wide
  // discipline: no guard is defeated by a polluted prototype.
  if (ownEntry(ROLE_CARDS, role) === undefined) throw new Error(`unknown role "${role}"`);
  if (goldenSet.length === 0) throw new Error("empty golden set — an eval over nothing proves nothing");

  const bindings = { [role]: modelId };
  let passed = 0;
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
      if (ok) passed += 1;
      else failures.push(`${gcase.id}: field mismatch`);
    } catch (err) {
      failures.push(`${gcase.id}: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  return { role, modelId, score: passed / goldenSet.length, total: goldenSet.length, passed, failures };
}
