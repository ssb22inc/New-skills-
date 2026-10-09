/** PRODUCTION-ELIGIBLE EVAL EVIDENCE (cross-family finding X7-09, GPT-6 Astra,
 * 2026-10-09).
 *
 * `attestEvalRun` grades whatever outputs its caller hands over, and
 * `bindRole` marked the result SERVABLE — so the golden set's own expected
 * answers, passed back in without any model being called, authorized
 * production serving. And there was no way to evaluate a candidate live at
 * all: `llm()` refuses a candidate map through any transport but recorded
 * outputs.
 *
 * Evidence is now two kinds:
 *   - RECORDED: any `runEval`/`attestEvalRun` result. `bindRole` still accepts
 *     it, but `llm()` serves the map it returns through `RecordedTransport`
 *     only.
 *   - LIVE: a `runLiveEval` result — the role's canonical golden set served to
 *     the candidate through the production `AiGatewayHttpTransport` (exactly
 *     that class, not a subclass), graded by `attestEvalRun`. Only
 *     `bindRoleLive` turns it into a binding, and only those maps (and the
 *     launch table) are served through a live transport.
 *
 * The capability removed: serving production traffic under a binding whose
 * only evidence is answers a caller supplied. NARROWING, stated (L12): this
 * is in-process provenance — a caller that builds the production adapter over
 * a FAKED fetch can still fabricate a live run. What it can no longer do is
 * promote fabricated answers by handing them to the grader.
 *
 * The brand, the live set and the production set are module-private; nothing
 * outside this file can add to them. */
import { ROLE_BINDINGS, BindingError, bindRole, type EvalAttestation, type GoldenCase, type RoleBindings } from "@fullburn/config/models";
import { AiGatewayHttpTransport } from "./gateway-http.ts";
import type { GatewayTransport, LlmDeps } from "./gateway.ts";
import { runEvalWith, type EvalResult } from "./eval-harness.ts";

const LIVE_EVAL_TRANSPORTS = new WeakSet<object>();
const LIVE_ATTESTED = new WeakSet<object>();
const PRODUCTION = new WeakSet<object>([ROLE_BINDINGS]);

/** Wraps the production adapter for ONE eval run. The wrapper is created
 * inside `runLiveEval` and handed only to `llm()`, which passes it to no
 * collaborator, so no caller ever holds one to serve a candidate map with. */
class LiveEvalTransport implements GatewayTransport {
  readonly #inner: AiGatewayHttpTransport;
  constructor(inner: AiGatewayHttpTransport) {
    this.#inner = inner;
    LIVE_EVAL_TRANSPORTS.add(this);
    Object.freeze(this);
  }
  async post(url: string, body: unknown, headers: Readonly<Record<string, string>>): Promise<unknown> {
    return this.#inner.post(url, body, headers);
  }
}
Object.freeze(LiveEvalTransport.prototype);

/** Read by `llm()`: a candidate map may be served through this transport. */
export function isLiveEvalTransport(t: unknown): boolean {
  return typeof t === "object" && t !== null && LIVE_EVAL_TRANSPORTS.has(t);
}

/** Read by `llm()`: may this map be served through a live transport? */
export function productionServable(bindings: unknown): boolean {
  return typeof bindings === "object" && bindings !== null && PRODUCTION.has(bindings);
}

/** Runs the role's canonical golden set against `modelId` through the
 * production AI Gateway adapter. Every case is a real, metered, traced
 * `llm()` call. */
export async function runLiveEval(
  baseDeps: Omit<LlmDeps, "transport" | "bindings">,
  role: string,
  modelId: string,
  goldenSet: readonly GoldenCase[],
  transport: AiGatewayHttpTransport,
  clientId: string,
): Promise<EvalResult> {
  if (typeof transport !== "object" || transport === null || Object.getPrototypeOf(transport) !== AiGatewayHttpTransport.prototype) {
    throw new BindingError("a live eval runs through the production AiGatewayHttpTransport itself — not a subclass or a look-alike (X7-09)");
  }
  const result = await runEvalWith(baseDeps, role, modelId, goldenSet, new LiveEvalTransport(transport), clientId);
  LIVE_ATTESTED.add(result.attestation);
  return result;
}

/** `bindRole`, for production: the evidence must come from `runLiveEval` and
 * the base map must itself be production-servable. */
export function bindRoleLive(bindings: RoleBindings, role: string, modelId: string, evalResult: EvalAttestation): RoleBindings {
  if (!LIVE_ATTESTED.has(evalResult)) {
    throw new BindingError(`production binding of "${role}" needs a live eval run — recorded or caller-supplied answers are not evidence a model gave them (X7-09)`);
  }
  if (!productionServable(bindings)) {
    throw new BindingError("bindRoleLive: the base map is not production-servable — a map earned on recorded evidence cannot be promoted through one live role (X7-09)");
  }
  const next = bindRole(bindings, role, modelId, evalResult);
  PRODUCTION.add(next);
  return next;
}
