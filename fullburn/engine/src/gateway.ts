import { getCaps, assertCapsUsable, type ClientCaps } from "@fullburn/config/caps";
import { MODELS, ROLE_CARDS, ownEntry, type RoleBindings, type OutputSchema, BindingError } from "@fullburn/config/models";
import { type ClientVault } from "./vault.ts";
import { MeterUnavailableError, assertUsableAmount, type SpendMeter, type SpendReservation } from "./spend-meter.ts";
import { redactError } from "./redact.ts";
import { TraceContext, TraceEmitError, emitOrFail, type TraceEvent, type TraceSink } from "./tracing.ts";

/** THE only LLM call path (Law 11, §2.4). Everything below is deterministic
 * rule enforcement (Law 4) wrapped around one transport call:
 *   role card → binding → caps (signed?) → trace ctx required → ATOMIC
 *   reserve against the cap → gateway URL only → settle (billable either way)
 *   → schema-validated output → trace emitted or the call fails.
 * Direct provider access anywhere else in the engine fails the structural scan
 * (R4). Every error leaving this function is redacted (F7). */

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

/** A meter that cannot reserve cannot enforce a cap under concurrency, so it is
 * not usable on a money path at all (F1/F2 fail-closed). */
function requireReservingMeter(meter: SpendMeter): Required<Pick<SpendMeter, "reserve" | "settle" | "release">> {
  if (typeof meter.reserve !== "function" || typeof meter.settle !== "function" || typeof meter.release !== "function") {
    throw new MeterUnavailableError(
      "spend meter does not support reserve/settle — refusing spend (fail closed): a read-then-write cap check cannot hold under concurrency",
    );
  }
  return { reserve: meter.reserve.bind(meter), settle: meter.settle.bind(meter), release: meter.release.bind(meter) };
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

  // Money safety before anything leaves the building (Law 2, R2, R3, F1–F3):
  const caps = getCaps(req.clientId, deps.capsTable);
  assertCapsUsable(caps); // unsigned caps (H8 pending) refuse ALL spend
  assertUsableAmount(card.costBudgetUsdPerCall, "role cost budget");
  const meter = requireReservingMeter(deps.meter);

  // ATOMIC: read + cap-check + write, no await in between (closes F1).
  const reservation: SpendReservation = meter.reserve(req.clientId, card.costBudgetUsdPerCall, caps.dailyAiSpendUsd);
  if (
    reservation === null || typeof reservation !== "object" ||
    reservation.clientId !== req.clientId || !Number.isFinite(reservation.amountUsd)
  ) {
    throw new MeterUnavailableError("meter returned an invalid reservation — refusing spend (fail closed)");
  }

  const key = deps.vault.get("ai-gateway-key");
  const secrets = [key.value];
  const url = new URL(model.gatewayRoute, deps.gatewayBaseUrl).toString();
  const startedAtMs = deps.now();

  const traceBase = {
    traceId: req.trace.traceId,
    clientId: req.clientId,
    role: req.role,
    model: modelId,
    startedAtMs,
    input: req.input,
    costUsd: reservation.amountUsd,
  } as const;

  let output: unknown;
  try {
    output = await deps.transport.post(
      url,
      { role: req.role, input: req.input, contextBudgetTokens: card.contextBudgetTokens },
      { authorization: `Bearer ${key.value}`, "x-fullburn-client": req.clientId },
    );
  } catch (err) {
    // The request left the building: the provider may well have billed it, so
    // the reservation is SETTLED, not released (F3).
    meter.settle(reservation);
    const safe = redactError(err, secrets, GatewayError);
    await traceFailure(deps.sink, { ...traceBase, output: null, outcome: "error", errorMessage: safe.message });
    throw safe;
  }

  // From here the call is billable regardless of what we think of the response.
  meter.settle(reservation);

  try {
    validateOutput(card.outputSchema, output);
  } catch (err) {
    const safe = redactError(err, secrets, SchemaError);
    await traceFailure(deps.sink, { ...traceBase, output, outcome: "error", errorMessage: safe.message });
    throw safe;
  }

  // Fail closed on trace loss (R8): the call is not a success until it is traced.
  try {
    await emitOrFail(deps.sink, { ...traceBase, output, outcome: "ok" });
  } catch (err) {
    throw redactError(err, secrets, TraceEmitError);
  }

  return output;
}

/** Emit a failure trace on a best-effort basis. The call has already failed, so
 * no decision proceeds untraced (Law 11); a sink outage here must not mask the
 * root cause the operator actually needs. */
async function traceFailure(sink: TraceSink, event: TraceEvent): Promise<void> {
  try {
    await sink.emit(event);
  } catch {
    // Swallowed deliberately: the original error is thrown by the caller.
  }
}
