import { CapError } from "@fullburn/config/caps";

/** Per-client AI spend metering (R3; hardened for adversary findings F1/F2/F3).
 *
 * The cap check and the charge are ONE atomic operation: `reserve()` reads,
 * validates, checks against the cap and writes the reservation with no `await`
 * in between, so concurrent in-flight calls cannot all clear the same stale
 * reading (F1). A reservation is taken BEFORE the request leaves the building
 * and is settled whether or not the response pleases the validator (F3) — the
 * provider bills for the request, not for our satisfaction with it. Any
 * non-finite or negative accounting value refuses spend instead of sliding
 * through a `NaN > cap` comparison that is silently false (F2).
 *
 * Production backing is the client's Durable Object (§2.2), which serialises
 * per client; this in-memory implementation has the same contract so the
 * Phase 5/6 ad-spend path can adopt it unchanged. */

export interface SpendReservation {
  readonly id: string;
  readonly clientId: string;
  readonly amountUsd: number;
}

export interface SpendMeter {
  /** Committed spend today for the client, USD. Throws if unavailable. */
  todayUsd(clientId: string): number;
  /** Legacy direct write. Retained for compatibility; the money path uses
   * reserve/settle. Implementations must keep it consistent with `todayUsd`. */
  record(clientId: string, usd: number): void;
  /** Atomically validate + cap-check + reserve. MUST be synchronous: any await
   * inside reopens the race in F1. Throws CapError when the reservation would
   * breach the cap, MeterUnavailableError when accounting is unusable.
   *
   * Optional in the type only so that meters written against the pre-F1
   * interface still compile; `llm()` refuses any meter that does not implement
   * it, so absence fails closed rather than silently skipping the cap. */
  reserve?(clientId: string, amountUsd: number, capUsd: number): SpendReservation;
  /** Commit a reservation: the request left the building and is billable. */
  settle?(reservation: SpendReservation): void;
  /** Release a reservation for a request that never left the building. */
  release?(reservation: SpendReservation): void;
}

export class MeterUnavailableError extends Error {}

/** A meter reading that is not a finite, non-negative number is unusable —
 * refuse spend rather than compare against it (F2). */
export function assertUsableAmount(n: unknown, label: string): asserts n is number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    throw new MeterUnavailableError(`${label} is not a finite non-negative number — refusing spend (fail closed)`);
  }
}

export class MemorySpendMeter implements SpendMeter {
  #committed = new Map<string, number>();
  #reservedTotal = new Map<string, number>();
  #open = new Map<string, SpendReservation>();
  #available = true;
  #seq = 0;

  setAvailable(v: boolean): void {
    this.#available = v;
  }

  #assertAvailable(): void {
    if (!this.#available) throw new MeterUnavailableError("spend meter unavailable — refusing spend (fail closed)");
  }

  todayUsd(clientId: string): number {
    this.#assertAvailable();
    const v = this.#committed.get(clientId) ?? 0;
    assertUsableAmount(v, "committed spend");
    return v;
  }

  /** Reserved-but-not-yet-settled spend, USD. Visible for tests/ops. */
  reservedUsd(clientId: string): number {
    return this.#reservedTotal.get(clientId) ?? 0;
  }

  reserve(clientId: string, amountUsd: number, capUsd: number): SpendReservation {
    this.#assertAvailable();
    if (typeof clientId !== "string" || clientId.length === 0) {
      throw new MeterUnavailableError("reserve requires a clientId");
    }
    assertUsableAmount(amountUsd, "reservation amount");
    assertUsableAmount(capUsd, "cap");
    if (amountUsd <= 0) throw new MeterUnavailableError("reservation amount must be positive");

    const committed = this.#committed.get(clientId) ?? 0;
    const reserved = this.#reservedTotal.get(clientId) ?? 0;
    assertUsableAmount(committed, "committed spend");
    assertUsableAmount(reserved, "reserved spend");

    const projected = committed + reserved + amountUsd;
    assertUsableAmount(projected, "projected spend");
    if (projected > capUsd) {
      throw new CapError(
        `AI spend cap breach refused: projected $${projected.toFixed(4)} > daily cap $${capUsd} for "${clientId}"`,
      );
    }

    // Single synchronous write completes the read-check-write cycle (F1).
    this.#seq += 1;
    const reservation: SpendReservation = { id: `r${this.#seq}`, clientId, amountUsd };
    this.#reservedTotal.set(clientId, reserved + amountUsd);
    this.#open.set(reservation.id, reservation);
    return reservation;
  }

  settle(reservation: SpendReservation): void {
    const open = this.#open.get(reservation.id);
    if (open === undefined) return; // already settled/released — idempotent
    this.#open.delete(reservation.id);
    this.#reservedTotal.set(open.clientId, (this.#reservedTotal.get(open.clientId) ?? 0) - open.amountUsd);
    this.#committed.set(open.clientId, (this.#committed.get(open.clientId) ?? 0) + open.amountUsd);
  }

  release(reservation: SpendReservation): void {
    const open = this.#open.get(reservation.id);
    if (open === undefined) return; // already settled/released — idempotent
    this.#open.delete(reservation.id);
    this.#reservedTotal.set(open.clientId, (this.#reservedTotal.get(open.clientId) ?? 0) - open.amountUsd);
  }

  record(clientId: string, usd: number): void {
    this.#assertAvailable();
    assertUsableAmount(usd, "recorded amount");
    this.#committed.set(clientId, (this.#committed.get(clientId) ?? 0) + usd);
  }
}
