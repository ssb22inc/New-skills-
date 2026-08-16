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

/** A reservation handle.
 *
 * THIS IS A CLASS, NOT A SHAPE, AND THAT IS THE POINT. The handle used to be a
 * plain object matched on `id` + `clientId`, with ids counting `r1, r2, r3…`
 * from a per-instance counter — guessable by construction, and colliding
 * *deterministically* between two instances serving the same client. A literal
 * `{ id: "r1", clientId: "pulsern", amountUsd: 0 }` released a live reservation.
 * Executed, that closed 200 open records: the 200 genuine settles for requests
 * that had already left the building found nothing and committed nothing, the
 * freed headroom admitted another $200, and $400 of real spend landed against
 * the approved $200/month ceiling while `monthUsd()` read exactly $200 the
 * whole time — a cap breach and a data lie in one operation (adversary finding
 * R5-01). The same sequence ran with no forgery at all across two meter
 * instances, which is the shape ledger L14 documents as expected after a
 * Durable Object restart.
 *
 * The meter now accepts only handles it minted itself, proved by membership in
 * a private WeakSet — the technique `models.ts` already uses to make an
 * `EvalAttestation` unforgeable. Identity, not resemblance. */
export class SpendReservation {
  readonly id: string;
  readonly clientId: string;
  readonly amountUsd: number;

  constructor(brand: symbol, id: string, clientId: string, amountUsd: number) {
    if (brand !== RESERVATION_BRAND) {
      throw new MeterUnavailableError("a reservation may only be minted by a meter — refusing spend (fail closed)");
    }
    this.id = id;
    this.clientId = clientId;
    this.amountUsd = amountUsd;
    Object.freeze(this);
  }
}

/** Module-private: not exported, so no other module can pass the constructor
 * check even with a direct import of the class. */
const RESERVATION_BRAND = Symbol("fullburn.reservation");

/** The two ceilings every reservation is checked against. */
export interface SpendCeilings {
  readonly dailyUsd: number;
  readonly monthlyUsd: number;
}

export interface SpendMeter {
  /** Committed spend today for the client, USD. Throws if unavailable. */
  todayUsd(clientId: string): number;
  /** Reserved-but-unsettled spend, USD, across EVERY day — not just today.
   * This reading exists so an operator staring at `todayUsd() === 0` while
   * every call is refused can see where the headroom went (R2-02). Scoping it
   * to the current day destroyed exactly that property across a rollover: a
   * reservation taken at 23:59 and still in flight at 00:01 was $0 in
   * `todayUsd()` AND $0 in `reservedUsd()`, so held money was invisible in both
   * readings with no interface to ask about another day (adversary finding
   * N-09). Optional in the type only so meters written against the pre-F1
   * interface still compile; `llm()` refuses a meter that lacks it. */
  reservedUsd?(clientId: string): number;
  /** Legacy direct write that performs NO CAP CHECK.
   *
   * It has no caller today, but it is on the interface `spend-meter.ts` tells
   * the Phase 5/6 ad-spend path to "adopt unchanged", and it moves money
   * (adversary finding R5-09). Stated here rather than left to be discovered:
   * anything routing real spend through `record()` is bypassing Law 2. Use
   * reserve/settle. */
  record(clientId: string, usd: number): void;
  /** Committed spend this month for the client, USD. The month is the real
   * exposure ceiling; the day is a sub-limit that stops a runaway loop
   * consuming it in an hour. */
  monthUsd?(clientId: string): number;
  /** Atomically validate + cap-check + reserve against BOTH ceilings. MUST be
   * synchronous: any await inside reopens the concurrency race. Throws CapError
   * when the reservation would breach either cap, MeterUnavailableError when
   * accounting is unusable.
   *
   * Both ceilings are passed together and checked together, deliberately. Two
   * separate calls would leave a window in which the daily check passed and the
   * monthly one had not run yet — the same read-check-write race the reserve
   * design exists to close.
   *
   * Optional in the type only so that meters written against the pre-F1
   * interface still compile; `llm()` refuses any meter that does not implement
   * it, so absence fails closed rather than silently skipping the cap. */
  reserve?(clientId: string, amountUsd: number, caps: SpendCeilings): SpendReservation;
  /** Commit a reservation: the request left the building and is billable. */
  settle?(reservation: SpendReservation): void;
  /** Release a reservation for a request that never left the building.
   *
   * MUST NOT THROW, and must be idempotent for a stale or foreign handle.
   * `llm()` calls this from a failure path where there is nothing left to
   * unwind: a `release()` that threw leaked the reservation silently, and 500
   * pre-departure failures consumed a $5.00 ceiling with zero provider calls
   * while `todayUsd()` read $0.00 (adversary finding N-07). The requirement was
   * asserted in gateway.ts and documented nowhere the implementer would read
   * it; it is part of the contract now. */
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

/** UTC day key. Client-LOCAL rollover needs the market registry's locale clock
 * (§2.5), which is per-client and unset until onboarding — tracked as a ledger
 * item rather than approximated here. */
export function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** UTC month key, same caveat as the day. */
export function utcMonthKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}

export class MemorySpendMeter implements SpendMeter {
  // Keyed by PERIOD, where a period is "d:<day>|<client>" or "m:<month>|<client>".
  // One map rather than two so a settle can never update the day and miss the
  // month.
  #committedMicros = new Map<string, number>();
  #reservedMicros = new Map<string, number>();
  #open = new Map<string, { clientId: string; micros: number; day: string; month: string }>();
  #available = true;
  #seq = 0;
  #now: () => number;
  /** Handles THIS meter minted. Per-instance, deliberately: a handle from
   * another instance must not move this ledger, and `r1` from a restarted
   * Durable Object is exactly that (R5-01). */
  #minted = new WeakSet<SpendReservation>();

  /** A DAILY cap needs a day (adversary finding M-03). Without one, a client
   * that spent its ceiling was refused forever — a $5/day budget was really
   * $5/lifetime, and the bracket could not kill losing ads on day two. Ledgers
   * are keyed by (client, UTC day) so the cap rolls over exactly once per day.
   *
   * THE CLOCK IS REQUIRED. It defaulted to `() => 0`, which pinned every day key
   * to 1970-01-01: thirteen of the sixteen construction sites took the default,
   * so the fix was opt-in and the default was the original bug, still live, in
   * the commit that claimed to have closed it (adversary finding N-01). A
   * missing clock is now a compile error, not a silently frozen day — there is
   * no default a caller can fall into.
   *
   * Persistence across a restart is a Durable Object concern and is NOT solved
   * here: a fresh meter still starts a fresh day (ledger L14). */
  constructor(now: () => number) {
    if (typeof now !== "function") {
      throw new MeterUnavailableError("MemorySpendMeter requires a clock — refusing spend (fail closed)");
    }
    this.#now = now;
  }

  setAvailable(v: boolean): void {
    this.#available = v;
  }

  /** Both period keys from ONE clock read. Reading the clock twice split the
   * pair across a month boundary: $7 committed to the August 31 day and the
   * September month, one tick apart (adversary finding R5-08). The window is a
   * tick per month, but the month ledger exists precisely to be right across
   * that boundary. */
  #periods(clientId: string, nowMs = this.#now()): { day: string; month: string } {
    return { day: `d:${utcDayKey(nowMs)}|${clientId}`, month: `m:${utcMonthKey(nowMs)}|${clientId}` };
  }

  #key(clientId: string): string {
    return this.#periods(clientId).day;
  }

  #monthKey(clientId: string): string {
    return this.#periods(clientId).month;
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
    return fromMicros(this.#read(this.#committedMicros, this.#key(clientId), "committed spend"));
  }

  monthUsd(clientId: string): number {
    this.#assertAvailable();
    return fromMicros(this.#read(this.#committedMicros, this.#monthKey(clientId), "committed spend"));
  }

  /** Every open reservation for this client, whatever day it was taken on
   * (N-09). Held money must never be invisible.  */
  reservedUsd(clientId: string): number {
    this.#assertAvailable();
    let micros = 0;
    for (const open of this.#open.values()) {
      if (open.clientId === clientId) micros += open.micros;
    }
    if (!Number.isSafeInteger(micros) || micros < 0) {
      throw new MeterUnavailableError("reserved spend ledger is corrupt — refusing spend (fail closed)");
    }
    return fromMicros(micros);
  }

  reserve(clientId: string, amountUsd: number, caps: SpendCeilings): SpendReservation {
    this.#assertAvailable();
    if (typeof clientId !== "string" || clientId.length === 0) {
      throw new MeterUnavailableError("reserve requires a clientId");
    }
    if (caps === null || typeof caps !== "object") {
      throw new MeterUnavailableError("reserve requires both ceilings — refusing spend (fail closed)");
    }
    const amountMicros = toMicros(amountUsd, "reservation amount");
    const dailyCapMicros = toMicros(caps.dailyUsd, "daily cap");
    const monthlyCapMicros = toMicros(caps.monthlyUsd, "monthly cap");
    if (amountMicros <= 0) throw new MeterUnavailableError("reservation amount must be positive");

    const { day, month } = this.#periods(clientId);

    // BOTH ceilings are read, checked and written inside one synchronous block.
    // Checking them in sequence with any await between would reopen the race
    // the reserve design exists to close.
    const project = (period: string): number => {
      const committed = this.#read(this.#committedMicros, period, "committed spend");
      const reserved = this.#read(this.#reservedMicros, period, "reserved spend");
      const projected = committed + reserved + amountMicros;
      if (!Number.isSafeInteger(projected)) {
        throw new MeterUnavailableError("projected spend is out of range — refusing spend (fail closed)");
      }
      return projected;
    };
    const projectedDay = project(day);
    const projectedMonth = project(month);
    if (projectedDay > dailyCapMicros) {
      throw new CapError(
        `AI spend cap breach refused: projected $${fromMicros(projectedDay).toFixed(4)} > daily cap $${caps.dailyUsd} for "${clientId}"`,
      );
    }
    if (projectedMonth > monthlyCapMicros) {
      throw new CapError(
        `AI spend cap breach refused: projected $${fromMicros(projectedMonth).toFixed(4)} > monthly cap $${caps.monthlyUsd} for "${clientId}"`,
      );
    }

    // Single synchronous write completes the read-check-write cycle.
    this.#seq += 1;
    const id = `r${this.#seq}`;
    this.#reservedMicros.set(day, projectedDay - this.#read(this.#committedMicros, day, "committed spend"));
    this.#reservedMicros.set(month, projectedMonth - this.#read(this.#committedMicros, month, "committed spend"));
    // The reservation remembers the periods it was taken in, so a settle that
    // lands after midnight commits against the day the spend belongs to.
    this.#open.set(id, { clientId, micros: amountMicros, day, month });
    const handle = new SpendReservation(RESERVATION_BRAND, id, clientId, fromMicros(amountMicros));
    this.#minted.add(handle);
    return handle;
  }

  #close(reservation: SpendReservation): { clientId: string; micros: number; day: string; month: string } | null {
    // IDENTITY FIRST. A handle this meter did not mint moves nothing here,
    // whatever its fields say — that is the whole guard, and matching on
    // `id` + `clientId` was not it (R5-01).
    if (!(reservation instanceof SpendReservation) || !this.#minted.has(reservation)) return null;
    const open = this.#open.get(reservation.id);
    if (open === undefined) return null; // already settled/released — idempotent
    if (open.clientId !== reservation.clientId) return null;
    this.#open.delete(reservation.id);
    for (const period of [open.day, open.month]) {
      const reserved = this.#read(this.#reservedMicros, period, "reserved spend");
      this.#reservedMicros.set(period, Math.max(0, reserved - open.micros));
    }
    return open;
  }

  settle(reservation: SpendReservation): void {
    const open = this.#close(reservation);
    if (open === null) return;
    for (const period of [open.day, open.month]) {
      const committed = this.#read(this.#committedMicros, period, "committed spend");
      this.#committedMicros.set(period, committed + open.micros);
    }
  }

  release(reservation: SpendReservation): void {
    this.#close(reservation);
  }

  record(clientId: string, usd: number): void {
    this.#assertAvailable();
    const micros = toMicros(usd, "recorded amount");
    const { day, month } = this.#periods(clientId);
    for (const period of [day, month]) {
      const committed = this.#read(this.#committedMicros, period, "committed spend");
      this.#committedMicros.set(period, committed + micros);
    }
  }
}
