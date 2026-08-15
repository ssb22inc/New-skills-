import { getCaps, assertCapsUsable, CapError, type ClientCaps } from "@fullburn/config/caps";
import { MODELS, ROLE_CARDS, ownEntry, type RoleBindings, type OutputSchema, BindingError } from "@fullburn/config/models";
import { type ClientVault } from "./vault.ts";
import { type SpendMeter } from "./spend-meter.ts";
import { TraceContext, TraceEmitError, emitOrFail, type TraceSink } from "./tracing.ts";

/** THE only LLM call path (Law 11, §2.4). Everything below is deterministic
 * rule enforcement (Law 4) wrapped around one transport call:
 *   role card → binding → caps (signed? within AI cap?) → trace ctx required
 *   → gateway URL only → schema-validated output → trace emitted or the call
 *   fails (R8). Direct provider access anywhere else in the engine fails the
 *   structural scan (R4). */

export interface GatewayTransport {
  /** POST to an AI Gateway URL. Implementations must not know provider hosts. */
  post(url: string, body: unknown, headers: Readonly<Record<string, string>>): Promise<unknown>;
}

export interface LlmDeps {
  readonly bindings: RoleBindings;
  readonly transport: GatewayTransport;
  readonly vault: ClientVault;
  readonly meter: SpendMeter;
  readonly sink: TraceSink;
  /** e.g. https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/ — env-provided (H2). */
  readonly gatewayBaseUrl: string;
  readonly now: () => number;
  readonly capsTable?: Readonly<Record<string, ClientCaps>>;
}

export interface LlmRequest {
  readonly role: string;
  readonly clientId: string;
  readonly input: unknown;
  readonly trace: TraceContext;
}

export class SchemaError extends Error {}
export class GatewayError extends Error {}

/** Minimal deterministic validator for the §2.4 structured-I/O contract. */
export function validateOutput(schema: OutputSchema, output: unknown): void {
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    throw new SchemaError("output is not an object");
  }
  const obj = output as Record<string, unknown>;
  for (const key of schema.required) {
    if (!(key in obj)) throw new SchemaError(`output missing required field "${key}"`);
  }
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (!(key in obj)) continue;
    const v = obj[key];
    const ok =
      spec.type === "array" ? Array.isArray(v) :
      typeof v === spec.type;
    if (!ok) throw new SchemaError(`output field "${key}" is not ${spec.type}`);
  }
}

export async function llm(deps: LlmDeps, req: LlmRequest): Promise<unknown> {
  const card = ownEntry(ROLE_CARDS, req.role);
  if (card === undefined) throw new BindingError(`unknown role "${req.role}"`);
  const modelId = ownEntry(deps.bindings, req.role);
  if (modelId === undefined) throw new BindingError(`role "${req.role}" has no binding`);
  const model = ownEntry(MODELS, modelId);
  if (model === undefined) throw new BindingError(`bound model "${modelId}" not in registry`);

  // Tracing is not optional (Law 11): a real TraceContext, scoped to this client.
  if (!(req.trace instanceof TraceContext)) throw new TraceEmitError("llm() requires a TraceContext");
  if (req.trace.clientId !== req.clientId) {
    throw new TraceEmitError("trace context is scoped to a different client (Law 3)");
  }
  // Vault least-scope (R11): the vault handle must belong to this client.
  if (deps.vault.clientId !== req.clientId) {
    throw new GatewayError("vault scope mismatch — cross-client secret access refused (Law 3)");
  }

  // Money safety before anything leaves the building (Law 2, R2, R3):
  const caps = getCaps(req.clientId, deps.capsTable);
  assertCapsUsable(caps); // unsigned caps (H8 pending) refuse ALL spend
  const projected = deps.meter.todayUsd(req.clientId) + card.costBudgetUsdPerCall;
  if (projected > caps.dailyAiSpendUsd) {
    throw new CapError(
      `AI spend cap breach refused: projected $${projected.toFixed(4)} > daily cap $${caps.dailyAiSpendUsd} for "${req.clientId}"`,
    );
  }

  const key = deps.vault.get("ai-gateway-key");
  const url = new URL(model.gatewayRoute, deps.gatewayBaseUrl).toString();
  const startedAtMs = deps.now();

  const output = await deps.transport.post(
    url,
    { role: req.role, input: req.input, contextBudgetTokens: card.contextBudgetTokens },
    { authorization: `Bearer ${key.value}`, "x-fullburn-client": req.clientId },
  );

  validateOutput(card.outputSchema, output);
  deps.meter.record(req.clientId, card.costBudgetUsdPerCall);

  // Fail closed on trace loss (R8): the call is not a success until it is traced.
  await emitOrFail(deps.sink, {
    traceId: req.trace.traceId,
    clientId: req.clientId,
    role: req.role,
    model: modelId,
    startedAtMs,
    input: req.input,
    output,
    costUsd: card.costBudgetUsdPerCall,
  });

  return output;
}
