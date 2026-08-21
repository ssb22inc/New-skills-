import { CapError } from "@fullburn/config/caps";
import { MODELS, ROLE_CARDS, ownEntry, type RoleBindings, type OutputSchema, BindingError } from "@fullburn/config/models";
import { type ClientVault } from "./vault.ts";
import {
  MeterUnavailableError,
  isFrozenCapsMeter,
  type SpendMeter,
  type SpendReservation,
} from "./spend-meter.ts";
import { redactError, redactInPlace, redactValue } from "./redact.ts";
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
  // `capsTable` IS GONE FROM HERE. It was the narrowing-only override, and
  // `llm()` called `effectiveAiCapsUsd(clientId, capsTable)` with it — then
  // DISCARDED the result, because R7-06 had moved the ceilings into the meter.
  // A caller-supplied meter with a wide resolver therefore set the only ceiling
  // that bound, and the surviving call was a guard nothing could fail: deleting
  // it left all 277 tests green, because the test that appeared to cover it was
  // caught by the meter's own duplicate check (adversary finding R8-01).
  //
  // The narrowing table now belongs to the meter, which is where the ceiling is
  // enforced, and `llm()` accepts only a meter whose ceilings provably come
  // from the frozen table. One place, one owner, no second copy to disagree.
}

export interface LlmRequest {
  readonly role: string;
  readonly clientId: string;
  readonly input: unknown;
  readonly trace: TraceContext;
}

export class SchemaError extends Error {}
export class GatewayError extends Error {}

/** A transport throws this to assert, deliberately and typed, that it did NOT
 * dispatch the request — no bytes left, nothing can have been billed.
 *
 * It is the only way to reach the release path once `post` has been called.
 * `post` throwing synchronously used to imply the same thing, but the interface
 * never promised it: a transport may dispatch and then throw during its own
 * bookkeeping, and inferring "not sent" from that returned headroom for calls
 * the provider had already served (adversary finding R7-04). */
export class PreDispatchError extends Error {}

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
 * not usable on a money path at all (F1/F2 fail-closed).
 *
 * EXPORTED SO IT CAN BE DRIVEN DIRECTLY, and the reason is a consequence of
 * R8-01 worth stating. `llm()` now refuses any meter that is not a
 * `FrozenCapsSpendMeter`, and every such meter inherits all four methods from
 * `MemorySpendMeter.prototype` — so nothing reaching this function can fail it,
 * and dropping the `reservedUsd` requirement left the whole suite green where
 * it had been caught for three rounds. The tests that used to reach it passed
 * hand-built meter objects, which the brand refuses one line earlier.
 *
 * The contract is still real for any future implementation of the interface —
 * `SpendMeter` declares all four optional so pre-F1 meters compile — so this is
 * unit-tested rather than deleted. What it is NOT is a live guard on the
 * `llm()` path; ledger L28 records that honestly instead of letting a mutation
 * entry imply otherwise. */
export function requireReservingMeter(meter: SpendMeter): Required<Pick<SpendMeter, "reserve" | "settle" | "release">> {
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
  // A clock that throws must not be the one exit that escapes tracing and
  // redaction (adversary findings B3, M-05): every collaborator call belongs
  // inside the guarded region.
  let startedAtMs = 0;

  // Traceable identity is established before anything can fail, so a refusal is
  // never an untraced decision (R2-28). traceId may be absent on a bad request;
  // that is itself recorded.
  /** Two client scopes must never share an event identity. When the supplied
   * trace context belongs to a DIFFERENT client, the refusal used to emit
   * `traceId` from that context beside `clientId` from the request — one event
   * naming two clients, into a sink keyed by traceId, where it can misattribute
   * or overwrite (adversary finding R7-09, Law 3). A mismatch now gets a fresh
   * identity of its own and is marked, so it lands as a security event rather
   * than as either client's history. Unusable contexts get a collision-resistant
   * id too: `untraced-<role>` repeated across every invalid request. */
  const scopeMismatch = req?.trace instanceof TraceContext && req.trace.clientId !== req?.clientId;
  const traceId =
    req?.trace instanceof TraceContext && !scopeMismatch ? req.trace.traceId : `unscoped-${role}-${randomEventId()}`;
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
  /** WHAT WAS ACTUALLY CHARGED, for the trace. Not what was reserved.
   *
   * `costUsd` reported `reservation?.amountUsd ?? 0` on every failure path —
   * including the ones whose reservation was RELEASED and never charged. Five
   * hundred released failures traced $5.00 of cost against a ledger reading
   * $0.00 (adversary finding R14-12). Law 10 makes every client-visible number
   * answerable to the warehouse; a cost the ledger does not hold is a data lie
   * whichever direction it points. This is set where the money actually moves. */
  let committedUsd = 0;
  let releaseLeak: unknown = null;
  /** Set when the failure trace itself could not be emitted. */
  let traceLost: string | null = null;

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
        costUsd: committedUsd,
        outcome: "error",
        errorMessage: message,
      });
    } catch (sinkErr) {
      // A sink outage must not mask the root cause the operator needs, so this
      // does not throw — but it USED to discard the error silently while the
      // file claimed every exit is traced. Law 11 calls an untraced decision a
      // bug, so the loss is recorded on the error that does reach the caller
      // rather than swallowed (adversary finding R7-09).
      traceLost = sinkErr instanceof Error ? sinkErr.name : "a non-error";
    }
  };

  try {
    startedAtMs = deps.now();
    const card = ownEntry(ROLE_CARDS, role);
    if (card === undefined) throw new BindingError(`unknown role "${role}"`);
    const bound = ownEntry(deps.bindings, role);
    if (bound === undefined) throw new BindingError(`role "${role}" has no binding`);
    modelId = bound;
    const model = ownEntry(MODELS, bound);
    if (model === undefined) throw new BindingError(`bound model "${bound}" not in registry`);

    // Tracing is not optional (Law 11): a real TraceContext, scoped to this client.
    if (!(req.trace instanceof TraceContext)) throw new TraceEmitError("llm() requires a TraceContext");
    if (scopeMismatch) {
      // Emitted under the fresh identity assigned above, never under the other
      // client's traceId (R7-09).
      throw new TraceEmitError("trace context is scoped to a different client (Law 3)");
    }
    // Vault least-scope (R11): the vault handle must belong to this client.
    if (deps.vault?.clientId !== req.clientId) {
      throw new GatewayError("vault scope mismatch — cross-client secret access refused (Law 3)");
    }

    // Prime the redaction set before the money checks (adversary finding A1's
    // residue): a meter or caps error thrown while `secrets` was still empty
    // went out verbatim, redaction having nothing to redact against. This read
    // is deliberately non-fatal — a missing key must not mask a cap refusal, so
    // the authoritative read stays below, in its proper order.
    try {
      secrets = [deps.vault.get("ai-gateway-key").value];
    } catch {
      // Surfaced in order by the authoritative read below.
    }

    // Money safety before anything leaves the building (Law 2, R2, R3, F1–F3).
    // The ceiling comes from the frozen table; a caller may only narrow it.
    // The caps still resolve here for the sign-off and narrowing checks — an
    // unsigned client must refuse before anything else happens — but the
    // CEILINGS the meter enforces are the meter's own (R7-06). This call is the
    // gate on usability, not the source of the numbers.
    // THE ROLE-COST CHECK IS GONE. `card` comes from `ROLE_CARDS`, a frozen
    // table this module owns, and `ownEntry` has already refused an unknown
    // role above — so `costBudgetUsdPerCall` is always a finite positive number
    // from a constant, and no input could ever fail this. Third dead guard in
    // this function of the class L28 records, all three created by fixes that
    // moved a check upstream of it (adversary finding R10-07a). Deleted rather
    // than disclosed: unlike L28's it has no future contract, because the value
    // does not come from a collaborator.
    // LAW 2, STRUCTURALLY. The ceiling this call is checked against must come
    // from the frozen caps table, and the only way to know that is for the
    // meter to have no way of getting it from anywhere else. A meter built
    // with an arbitrary resolver is refused here — not compared against the
    // frozen table and refused on mismatch, which is a check, and checks on
    // this money path have now been bypassed twice (R7-06, then R8-01).
    if (!isFrozenCapsMeter(deps.meter)) {
      throw new MeterUnavailableError(
        "spend meter is not bound to the frozen caps table — refusing spend (fail closed): " +
          "ceilings come from config/caps.ts by construction (Law 2, adversary finding R8-01)",
      );
    }
    meter = requireReservingMeter(deps.meter);

    // ATOMIC: read + cap-check + write, no await in between.
    reservation = meter.reserve(req.clientId, card.costBudgetUsdPerCall);
    // THE POST-RESERVE VALIDATION IS GONE, AND ITS ABSENCE IS THE FIX.
    //
    // It checked that the returned reservation was an object, for this client,
    // with a finite amount — written when any meter could be passed in. Since
    // R8-01, `llm()` accepts only a `FrozenCapsSpendMeter`, whose `reserve` is
    // pinned to the prototype's own method and returns a branded, frozen
    // `SpendReservation` or throws. No input can fail these four conditions, so
    // the check was dead code that read as coverage, with no test and no
    // mutation entry — the second instance of the class L28 records, created by
    // the same fix (adversary finding R9-08a).
    //
    // Deleted rather than disclosed: L28's guard has a real contract for a
    // future meter implementation, and this one has none — `reserve` either
    // returns the branded handle or throws.

    const key = deps.vault.get("ai-gateway-key");
    secrets = [key.value];
    const url = new URL(model.gatewayRoute, deps.gatewayBaseUrl).toString();

    let output: unknown;
    // `departed` must mean what it says: the request reached the transport and
    // may have been billed. Setting it before the call made it true for things
    // that provably never left — an absent `post`, or a transport that threw
    // synchronously before any I/O — and both were settled as billable
    // (adversary finding N-08). Invoking `post` separately from awaiting it
    // splits those two cases apart: a synchronous throw happens on the first
    // line and leaves `departed` false; anything after the handoff is billable
    // whatever the promise does. The flag is still set BEFORE the await, so a
    // rejection is settled, never released (M-01/M-04).
    // An absent `post` is the ONLY failure that is provably pre-dispatch
    // without the transport's cooperation: there is nothing to call, so nothing
    // can have been sent. Checked before the flag, so it releases.
    if (typeof deps.transport?.post !== "function") {
      throw new GatewayError("transport has no post() — refusing spend (fail closed)");
    }

    // DEPARTED IS SET BEFORE THE CALL, NOT AFTER IT.
    //
    // N-08 concluded the opposite: a synchronous throw meant nothing had left
    // the building, so it should release. The cross-family review showed that
    // conclusion rests on a promise the interface never makes — a conforming
    // transport may dispatch the provider request and then throw synchronously
    // during its own bookkeeping, so `post` throwing proves nothing about
    // whether bytes went out (adversary finding R7-04). Repeated, that returned
    // headroom for calls the provider had already served: r3's failure shape at
    // a different boundary.
    //
    // The two errors are not symmetric. Releasing a departed request breaches
    // the cap; settling an undeparted one overcharges by one call and is caught
    // by the daily reconciliation L26 describes. Conservative means settle.
    //
    // A transport that KNOWS it did not dispatch says so with a typed
    // PreDispatchError, and only that releases. Proof, not inference.
    departed = true;
    try {
      output = await deps.transport.post(
        url,
        { role, input: req.input, contextBudgetTokens: card.contextBudgetTokens },
        { authorization: `Bearer ${key.value}`, "x-fullburn-client": req.clientId },
      );
    } catch (err) {
      if (err instanceof PreDispatchError) {
        // The transport asserts nothing was sent. Its word, typed and
        // deliberate, is the only thing that reopens the release path.
        departed = false;
        throw err;
      }
      // Anything else may have been billed upstream: SETTLE, never release (F3).
      settleOrFailClosed(meter, reservation);
      committedUsd = reservation.amountUsd;
      throw redactError(err, secrets, GatewayError);
    }

    // Billable regardless of what we think of the response.
    settleOrFailClosed(meter, reservation);
    committedUsd = reservation.amountUsd;

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
      } catch (releaseErr) {
        // A release that throws leaks the reservation: the headroom stays
        // consumed for a request that never left the building, and repeating it
        // burns a client's whole daily ceiling with zero provider calls while
        // `todayUsd()` still reads $0.00. This catch used to be silent, so the
        // leak was invisible in the trace as well as in the meter (adversary
        // finding N-07). It is still non-fatal — the original error is the one
        // the caller needs — but it is now on the record.
        releaseLeak = releaseErr;
      }
    }
    // The class is preserved so callers can still discriminate a cap breach
    // from an outage, but the MESSAGE is redacted like any other: a meter or a
    // caps module is a collaborator whose error text we do not control, and it
    // was being written verbatim into the trace AND thrown to the caller with
    // its original stack (adversary finding A1).
    const safe = err instanceof CapError || err instanceof MeterUnavailableError
      ? redactInPlace(err, secrets)
      : redactError(err, secrets, errorClassFor(err));
    await traceFailure(
      releaseLeak === null
        ? safe.message
        : `${safe.message} [reservation leaked: meter.release threw ${releaseLeak instanceof Error ? releaseLeak.name : "a non-error"}; ` +
          `$${reservation?.amountUsd ?? 0} of headroom remains consumed for a request that never departed]`,
    );
    if (traceLost !== null) {
      // The caller learns the decision was not recorded. Silence here is what
      // makes "untraced = bug" unfalsifiable.
      safe.message = `${safe.message} [UNTRACED: the failure sink threw ${traceLost}; this refusal is not in the audit record]`;
    }
    throw safe;
  }
}

/** Collision-resistant enough for an event id; not a secret. */
function randomEventId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
