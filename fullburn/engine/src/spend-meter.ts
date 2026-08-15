import { CapError } from "@fullburn/config/caps";

/** Per-client AI spend metering (R3; F1/F2/F3; R2-01, R2-02, R2-16).
 *
 * The cap check and the charge are ONE atomic operation: `reserve()` reads,
 * validates, checks against the cap and writes with no `await` in between, so
 * concurrent in-flight calls cannot all clear the same stale reading. A
 * reservation is taken BEFORE the request leaves and settled whether or not the
 * response pleases the validator — the provider bills for the request, not for
 * our satisfaction with it. Any out-of-domain accounting value refuses spend
 * rather than sliding through a comparison that is silently false.
 *
 * ALL INTERNAL ACCOUNTING IS INTEGER MICRO-DOLLARS (adversary finding R2-01).
 * Repeated float addition and per-reservation float subtraction round
 * differently: three overlapping $0.01 reservations settled in turn left
 * `reserved` at -3.47e-18, which the meter's own fail-closed guard then read as
 * corrupt and refused every subsequent call — a $25 budget bricked after $0.03,
 * permanently, on a long-lived Durable Object. Integers cannot drift, so the
 * guard never fires on the meter's own arithmetic.
 *
 * Production backing is the client's Durable Object (§2.2), which serialises per
 * client; this in-memory implementation has the same contract so the Phase 5/6
 * ad-spend path can adopt it unchanged. */

const MICROS_PER_USD = 1_000_000;

/** USD → integer micro-dollars, rejecting anything that cannot be money. */
export function toMicros(usd: unknown, label: string): number {
  assertUsableAmount(usd, label);
  const micros = Math.round(usd * MICROS_PER_USD);
  if (!Number.isSafeInteger(micros)) {
    throw new MeterUnavailableError(`${label} is out of range for micro-dollar accounting — refusing spend (fail closed)`);
  }
  return micros;
}

export function fromMicros(micros: number): number {
  return micros / MICROS_PER_USD;
}

export interface SpendReservation {
  readonly id: string;
  readonly clientId: string;
  readonly amountUsd: number;
}

export interface SpendMeter {
  /** Committed spend today for the client, USD. Throws if unavailable. */
  todayUsd(clientId: string): number;
  /** Reserved-but-unsettled spend, USD. Every real implementation must provide
   * it — an operator staring at `todayUsd() === 0` while every call is refused
   * needs to see where the headroom went (R2-02) — and `llm()` refuses a meter
   * that lacks it. Optional in the type only so meters written against the
   * pre-F1 interface still compile. */
  reservedUsd?(clientId: string): number;
  /** Legacy direct write. Retained for compatibility; the money path uses
   * reserve/settle. Implementations must keep it consistent with `todayUsd`. */
  record(clientId: string, usd: number): void;
  /** Atomically validate + cap-check + reserve. MUST be synchronous: any await
   * inside reopens the concurrency race. Throws CapError when the reservation
   * would breach the cap, MeterUnavailableError when accounting is unusable.
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

/** A value that is not a finite, non-negative number is unusable — refuse spend
 * rather than compare against it (F2). */
export function assertUsableAmount(n: unknown, label: string): asserts n is number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    throw new MeterUnavailableError(`${label} is not a finite non-negative number — refusing spend (fail closed)`);
  }
}

export class MemorySpendMeter implements SpendMeter {
  #committedMicros = new Map<string, number>();
  #reservedMicros = new Map<string, number>();
  #open = new Map<string, { clientId: string; micros: number }>();
  #available = true;
  #seq = 0;

  setAvailable(v: boolean): void {
    this.#available = v;
  }

  #assertAvailable(): void {
    if (!this.#available) throw new MeterUnavailableError("spend meter unavailable — refusing spend (fail closed)");
  }

  #read(map: Map<string, number>, clientId: string, label: string): number {
    const v = map.get(clientId) ?? 0;
    if (!Number.isSafeInteger(v) || v < 0) {
      throw new MeterUnavailableError(`${label} ledger is corrupt — refusing spend (fail closed)`);
    }
    return v;
  }

  todayUsd(clientId: string): number {
    this.#assertAvailable();
    return fromMicros(this.#read(this.#committedMicros, clientId, "committed spend"));
  }

  reservedUsd(clientId: string): number {
    this.#assertAvailable();
    return fromMicros(this.#read(this.#reservedMicros, clientId, "reserved spend"));
  }

  reserve(clientId: string, amountUsd: number, capUsd: number): SpendReservation {
    this.#assertAvailable();
    if (typeof clientId !== "string" || clientId.length === 0) {
      throw new MeterUnavailableError("reserve requires a clientId");
    }
    const amountMicros = toMicros(amountUsd, "reservation amount");
    const capMicros = toMicros(capUsd, "cap");
    if (amountMicros <= 0) throw new MeterUnavailableError("reservation amount must be positive");

    const committed = this.#read(this.#committedMicros, clientId, "committed spend");
    const reserved = this.#read(this.#reservedMicros, clientId, "reserved spend");
    const projected = committed + reserved + amountMicros;
    if (!Number.isSafeInteger(projected)) {
      throw new MeterUnavailableError("projected spend is out of range — refusing spend (fail closed)");
    }
    if (projected > capMicros) {
      throw new CapError(
        `AI spend cap breach refused: projected $${fromMicros(projected).toFixed(4)} > daily cap $${capUsd} for "${clientId}"`,
      );
    }

    // Single synchronous write completes the read-check-write cycle.
    this.#seq += 1;
    const id = `r${this.#seq}`;
    this.#reservedMicros.set(clientId, reserved + amountMicros);
    this.#open.set(id, { clientId, micros: amountMicros });
    return { id, clientId, amountUsd: fromMicros(amountMicros) };
  }

  #close(reservation: SpendReservation): { clientId: string; micros: number } | null {
    if (reservation === null || typeof reservation !== "object") return null;
    const open = this.#open.get(reservation.id);
    if (open === undefined) return null; // already settled/released — idempotent
    // A reservation handle from another meter, or a forged one, must not move
    // another client's ledger.
    if (open.clientId !== reservation.clientId) return null;
    this.#open.delete(reservation.id);
    const reserved = this.#read(this.#reservedMicros, open.clientId, "reserved spend");
    this.#reservedMicros.set(open.clientId, Math.max(0, reserved - open.micros));
    return open;
  }

  settle(reservation: SpendReservation): void {
    const open = this.#close(reservation);
    if (open === null) return;
    const committed = this.#read(this.#committedMicros, open.clientId, "committed spend");
    this.#committedMicros.set(open.clientId, committed + open.micros);
  }

  release(reservation: SpendReservation): void {
    this.#close(reservation);
  }

  record(clientId: string, usd: number): void {
    this.#assertAvailable();
    const micros = toMicros(usd, "recorded amount");
    const committed = this.#read(this.#committedMicros, clientId, "committed spend");
    this.#committedMicros.set(clientId, committed + micros);
  }
}
