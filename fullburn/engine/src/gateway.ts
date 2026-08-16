import { CapError, effectiveDailyAiCapUsd } from "@fullburn/config/caps";
import { MODELS, ROLE_CARDS, ownEntry, type RoleBindings, type OutputSchema, BindingError } from "@fullburn/config/models";
import { type ClientVault } from "./vault.ts";
import { MeterUnavailableError, assertUsableAmount, type SpendMeter, type SpendReservation } from "./spend-meter.ts";
import { redactError, redactValue } from "./redact.ts";
import { TraceContext, TraceEmitError, emitOrFail, type TraceEvent, type TraceSink } from "./tracing.ts";

/** THE only LLM call path (Law 11, §2.4). Everything below is deterministic
 * rule enforcement (Law 4) wrapped around one transport call:
 *   role card → binding → caps (signed? within AI cap?) → trace ctx required →
 *   ATOMIC reserve → gateway URL only → settle (billable) or release (never
 *   left) → schema-validated output → trace emitted or the call fails.
 *
 * Every exit is traced, including refusals (adversary finding R2-28): a decision
 * to refuse spend is still a decision, and an operator staring at a silent
 * engine has no way to tell a cap breach from an outage. Every error and every
 * traced payload is redacted against the vault secret (R2-14, R2-27). */

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
  /** NARROWING ONLY (R2-03). May lower this client's AI ceiling; can never
   * raise one, invent a client, or supply a sign-off — those come from the
   * frozen table in config/caps.ts and nowhere else. */
  readonly capsTable?: Readonly<Record<string, { readonly dailyAiSpendUsd?: number }>>;
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
  if (
    typeof meter.reserve !== "function" || typeof meter.settle !== "function" ||
    typeof meter.release !== "function" || typeof meter.reservedUsd !== "function"
  ) {
    throw new MeterUnavailableError(
      "spend meter does not support reserve/settle — refusing spend (fail closed): a read-then-write cap check cannot hold under concurrency",
    );
  }
  return { reserve: meter.reserve.bind(meter), settle: meter.settle.bind(meter), release: meter.release.bind(meter) };
}

export async function llm(deps: LlmDeps, req: LlmRequest): Promise<unknown> {
  const role = typeof req?.role === "string" ? req.role : "(unknown)";
  const clientId = typeof req?.clientId === "string" ? req.clientId : "(unknown)";
  const startedAtMs = deps.now();

  // Traceable identity is established before anything can fail, so a refusal is
  // never an untraced decision (R2-28). traceId may be absent on a bad request;
  // that is itself recorded.
  const traceId = req?.trace instanceof TraceContext ? req.trace.traceId : `untraced-${role}`;
  let modelId = "(unbound)";
  let secrets: string[] = [];
  let reservation: SpendReservation | null = null;
  let meter: ReturnType<typeof requireReservingMeter> | null = null;
  /** Set the instant before the request is handed to the transport. From that
   * moment the provider may bill us, so the reservation is NEVER releasable —
   * whatever happens next, including a settle() that itself throws.
   *
   * This is deliberately NOT "settle succeeded" (adversary findings M-01, M-04).
   * Ordering settle() before the flag meant a throwing settle left the flag
   * false, so the outer catch released the headroom for a request the provider
   * had already served: measured at 2000 billable calls against a $5 cap with
   * the cap never engaging once. The flag answers "did it leave the building",
   * which is the only question the release decision may depend on. */
  let departed = false;

  const traceFailure = async (message: string, output: unknown = null): Promise<void> => {
    try {
      await deps.sink.emit({
        traceId,
        clientId,
        role,
        model: modelId,
        startedAtMs,
        input: redactValue(req?.input, secrets),
        output: redactValue(output, secrets),
        costUsd: reservation?.amountUsd ?? 0,
        outcome: "error",
        errorMessage: message,
      });
    } catch {
      // The call has already failed; a sink outage must not mask the root cause
      // the operator actually needs. No decision proceeds untraced.
    }
  };

  try {
    const card = ownEntry(ROLE_CARDS, role);
    if (card === undefined) throw new BindingError(`unknown role "${role}"`);
    const bound = ownEntry(deps.bindings, role);
    if (bound === undefined) throw new BindingError(`role "${role}" has no binding`);
    modelId = bound;
    const model = ownEntry(MODELS, bound);
    if (model === undefined) throw new BindingError(`bound model "${bound}" not in registry`);

    // Tracing is not optional (Law 11): a real TraceContext, scoped to this client.
    if (!(req.trace instanceof TraceContext)) throw new TraceEmitError("llm() requires a TraceContext");
    if (req.trace.clientId !== req.clientId) {
      throw new TraceEmitError("trace context is scoped to a different client (Law 3)");
    }
    // Vault least-scope (R11): the vault handle must belong to this client.
    if (deps.vault?.clientId !== req.clientId) {
      throw new GatewayError("vault scope mismatch — cross-client secret access refused (Law 3)");
    }

    // Money safety before anything leaves the building (Law 2, R2, R3, F1–F3).
    // The ceiling comes from the frozen table; a caller may only narrow it.
    const capUsd = effectiveDailyAiCapUsd(req.clientId, deps.capsTable);
    assertUsableAmount(card.costBudgetUsdPerCall, "role cost budget");
    meter = requireReservingMeter(deps.meter);

    // ATOMIC: read + cap-check + write, no await in between.
    reservation = meter.reserve(req.clientId, card.costBudgetUsdPerCall, capUsd);
    if (
      reservation === null || typeof reservation !== "object" ||
      reservation.clientId !== req.clientId || !Number.isFinite(reservation.amountUsd)
    ) {
      throw new MeterUnavailableError("meter returned an invalid reservation — refusing spend (fail closed)");
    }

    const key = deps.vault.get("ai-gateway-key");
    secrets = [key.value];
    const url = new URL(model.gatewayRoute, deps.gatewayBaseUrl).toString();

    let output: unknown;
    // Everything from here is billable. The flag is set BEFORE the await, not
    // after a successful settle (M-01/M-04).
    departed = true;
    try {
      output = await deps.transport.post(
        url,
        { role, input: req.input, contextBudgetTokens: card.contextBudgetTokens },
        { authorization: `Bearer ${key.value}`, "x-fullburn-client": req.clientId },
      );
    } catch (err) {
      // The request left the building: the provider may well have billed it, so
      // the reservation is SETTLED, not released (F3).
      settleOrFailClosed(meter, reservation);
      throw redactError(err, secrets, GatewayError);
    }

    // Billable regardless of what we think of the response.
    settleOrFailClosed(meter, reservation);

    validateOutput(card.outputSchema, output);

    // Fail closed on trace loss (R8): not a success until it is traced.
    await emitOrFail(deps.sink, {
      traceId: req.trace.traceId,
      clientId: req.clientId,
      role,
      model: bound,
      startedAtMs,
      input: redactValue(req.input, secrets),
      output: redactValue(output, secrets),
      costUsd: reservation.amountUsd,
      outcome: "ok",
    });

    return output;
  } catch (err) {
    // Anything that threw before the request left the building never became
    // billable, so its headroom returns to the client (R2-02). `release` is
    // idempotent and never throws for a stale handle.
    if (reservation !== null && meter !== null && !departed) {
      try {
        meter.release(reservation);
      } catch {
        // A meter that cannot release is already reporting itself unusable;
        // the original error is the one worth surfacing.
      }
    }
    const safe = err instanceof CapError || err instanceof MeterUnavailableError
      ? err
      : redactError(err, secrets, errorClassFor(err));
    await traceFailure(safe.message);
    throw safe;
  }
}

/** A settle that fails leaves the charge unrecorded, which is a data lie about
 * money — but releasing the reservation instead would be worse, because the
 * provider already served the request. Fail closed: keep the headroom consumed
 * and surface the accounting failure (M-01). */
function settleOrFailClosed(
  meter: Required<Pick<SpendMeter, "reserve" | "settle" | "release">>,
  reservation: SpendReservation,
): void {
  try {
    meter.settle(reservation);
  } catch (err) {
    throw new MeterUnavailableError(
      `spend was incurred but could not be recorded — refusing to release the reservation (fail closed): ${err instanceof Error ? err.name : "settle failed"}`,
    );
  }
}

/** Preserve the error's identity through redaction so callers can still
 * discriminate (tests and the incident runbook both rely on the class). */
function errorClassFor(err: unknown): new (m: string) => Error {
  if (err instanceof SchemaError) return SchemaError;
  if (err instanceof TraceEmitError) return TraceEmitError;
  if (err instanceof BindingError) return BindingError;
  if (err instanceof GatewayError) return GatewayError;
  return GatewayError;
}

export type { TraceEvent };
