import { CapError, effectiveAiCapsUsd } from "@fullburn/config/caps";

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
    // Defence in depth, NOT the primary guard: the ledger is keyed by handle
    // identity, so an externally constructed handle finds no entry regardless.
    // Kept because an unbranded constructor invites callers to build things
    // that look like handles, and refusing that early is cheaper than
    // explaining later why it does nothing.
    if (brand !== RESERVATION_BRAND) {
      throw new MeterUnavailableError("a reservation may only be minted by a meter — refusing spend (fail closed)");
    }
    this.id = id;
    this.clientId = clientId;
    this.amountUsd = amountUsd;
    // A handle is a value. `id` is informational only — see #open's keying.
    Object.freeze(this);
  }
}

/** Module-private: not exported, so no other module can pass the constructor
 * check even with a direct import of the class. */
const RESERVATION_BRAND = Symbol("fullburn.reservation");

/** The ceilings and the zone they are bucketed in. Resolved by the meter from
 * the frozen caps table — NEVER supplied by a money-path caller.
 *
 * `reserve()` used to accept these as arguments, so any direct caller could
 * hand itself $1,000/$1,000 for a real client. The `llm()` path passed narrowed
 * protected caps, but the meter enforced nothing of its own: "no caller does
 * that today" is not a safety property (adversary finding R7-06). */
export interface SpendCeilings {
  readonly dailyUsd: number;
  readonly monthlyUsd: number;
  readonly timeZone: string;
}

/** Resolves a client's ceilings. The meter holds one of these; callers do not
 * get to pass ceilings in. */
export type CapsResolver = (clientId: string) => SpendCeilings;

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
  // `record()` IS GONE. It wrote committed day and month values with no cap
  // lookup, no sign-off check and no ceiling check — an unrestricted money-write
  // primitive on the interface this file told the Phase 5/6 ad-spend path to
  // "adopt unchanged". Incompatible with Law 2 whether or not anything calls it
  // today (adversary finding R7-06). Spend moves through reserve/settle only.
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
  reserve?(clientId: string, amountUsd: number): SpendReservation;
  /** Commit a reservation: the request left the building and is billable. The
   * committed figure is the RESERVED amount — an estimate, trued up by daily
   * reconciliation against the provider's usage receipt (the human's ruling on
   * adversary finding R7-05), and ledger L26 records that honestly.
   *
   * IT TAKES NO SECOND ARGUMENT, and the omission is the point. An `actualUsd`
   * override was `record()` with a handle: an unrestricted money-write with no
   * cap check and no bound in either direction, on the interface this file
   * tells the Phase 5/6 ad-spend path to adopt unchanged (adversary finding
   * R8-02). Reconciliation writes its correction through this same
   * cap-checked path, not around it. */
  settle?(reservation: SpendReservation): void;
  /** Release a reservation for a request that never left the building.
   *
   * Must be idempotent for a stale or foreign handle. It MAY throw when the
   * ledger itself is unusable — `MemorySpendMeter` does, because a silent
   * no-op while storage is down leaks the reservation invisibly, which is
   * N-07's harm — and `llm()` records that on the error it returns rather than
   * swallowing it. What an implementation must never do is throw for an
   * ordinary stale handle.
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

/** Day key in the CLIENT'S accounting zone, as YYYY-MM-DD.
 *
 * This was UTC while `ClientCaps.dailyAiSpendUsd` promised a client-local day.
 * $10 at 23:59Z and $10 at 00:01Z were two ledger days and ONE New York day, so
 * $20 landed under a $10/day cap (adversary finding R7-02). The zone comes from
 * the frozen caps table; `en-CA` yields ISO-ordered parts, and the IANA zone
 * handles its own daylight-saving transitions. */
export function zoneDayKey(nowMs: number, timeZone: string): string {
  if (!Number.isFinite(nowMs)) {
    throw new MeterUnavailableError("clock returned a non-finite instant — refusing spend (fail closed)");
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nowMs);
}

/** Month key in the same zone. A month boundary is a local midnight too. */
export function zoneMonthKey(nowMs: number, timeZone: string): string {
  return zoneDayKey(nowMs, timeZone).slice(0, 7);
}

export class MemorySpendMeter implements SpendMeter {
  // Keyed by PERIOD, where a period is "d:<day>|<client>" or "m:<month>|<client>".
  // One map rather than two so a settle can never update the day and miss the
  // month.
  #committedMicros = new Map<string, number>();
  #reservedMicros = new Map<string, number>();
  /** Open reservations, KEYED BY THE HANDLE OBJECT ITSELF.
   *
   * This was keyed by `id`, with a separate WeakSet proving the handle was
   * minted here. That proved WHICH OBJECT but not that its `id` still pointed
   * where it did, so the only thing stopping a caller re-pointing `id` on a
   * genuine handle was `Object.freeze` in the constructor — a line that looks
   * like defensive hygiene, carried no test, and could be deleted with all 243
   * tests green. Removing it let ONE genuine handle close five live
   * reservations: $20 of spend against the approved $10/day ceiling while
   * `todayUsd()` read exactly $10, with nothing forged and no second meter
   * (adversary finding R6-04).
   *
   * Keying by identity removes the class rather than the instance. A forged
   * literal, a foreign meter's handle, a re-pointed `id`, a Proxy and a
   * subclass all find no entry, because none of them IS the key. The freeze is
   * now hygiene, not enforcement — which is what the class comment always
   * claimed the design was. */
  #open = new Map<SpendReservation, { clientId: string; micros: number; day: string; month: string }>();
  #available = true;
  #seq = 0;
  #now: () => number;
  #capsFor: CapsResolver;
  /** Highest period key seen per client. The clock is injected, so a caller
   * that can move it backwards can re-enter an older period that still has
   * headroom, and one that jumps forward mints a fresh ceiling on demand
   * (adversary finding R7-03). Backwards movement is refused outright; forward
   * movement cannot be distinguished from time passing without a trusted time
   * source, which is disclosed rather than pretended away. */
  #highWater = new Map<string, string>();

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
  /** The caps resolver is REQUIRED and is the meter's own, not the caller's.
   * The clock is required for the same reason it has been since N-01. */
  constructor(now: () => number, capsFor: CapsResolver) {
    if (typeof now !== "function") {
      throw new MeterUnavailableError("MemorySpendMeter requires a clock — refusing spend (fail closed)");
    }
    if (typeof capsFor !== "function") {
      throw new MeterUnavailableError("MemorySpendMeter requires a caps resolver — refusing spend (fail closed)");
    }
    this.#now = now;
    this.#capsFor = capsFor;
  }

  setAvailable(v: boolean): void {
    this.#available = v;
  }

  /** Both period keys from ONE clock read. Reading the clock twice split the
   * pair across a month boundary: $7 committed to the August 31 day and the
   * September month, one tick apart (adversary finding R5-08). The window is a
   * tick per month, but the month ledger exists precisely to be right across
   * that boundary. */
  #periods(clientId: string, timeZone: string, nowMs = this.#now()): { day: string; month: string } {
    return {
      day: `d:${zoneDayKey(nowMs, timeZone)}|${clientId}`,
      month: `m:${zoneMonthKey(nowMs, timeZone)}|${clientId}`,
    };
  }

  /** Refuses a clock that has moved backwards into an already-closed day. */
  #assertForward(clientId: string, day: string): void {
    const seen = this.#highWater.get(clientId);
    if (seen !== undefined && day < seen) {
      throw new MeterUnavailableError(
        `clock moved backwards into a closed accounting day for "${clientId}" — refusing spend (fail closed)`,
      );
    }
    if (seen === undefined || day > seen) this.#highWater.set(clientId, day);
  }

  #zoneOf(clientId: string): string {
    return this.#capsFor(clientId).timeZone;
  }

  #key(clientId: string): string {
    return this.#periods(clientId, this.#zoneOf(clientId)).day;
  }

  #monthKey(clientId: string): string {
    return this.#periods(clientId, this.#zoneOf(clientId)).month;
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

  reserve(clientId: string, amountUsd: number): SpendReservation {
    this.#assertAvailable();
    if (typeof clientId !== "string" || clientId.length === 0) {
      throw new MeterUnavailableError("reserve requires a clientId");
    }
    // The ceilings are the METER'S, resolved from the frozen table. A caller
    // cannot supply, widen, or omit them (R7-06).
    const caps = this.#capsFor(clientId);
    if (caps === null || typeof caps !== "object") {
      throw new MeterUnavailableError("caps resolver returned no ceilings — refusing spend (fail closed)");
    }
    const amountMicros = toMicros(amountUsd, "reservation amount");
    const dailyCapMicros = toMicros(caps.dailyUsd, "daily cap");
    const monthlyCapMicros = toMicros(caps.monthlyUsd, "monthly cap");
    if (amountMicros <= 0) throw new MeterUnavailableError("reservation amount must be positive");

    const { day, month } = this.#periods(clientId, caps.timeZone);
    this.#assertForward(clientId, day);

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
    const handle = new SpendReservation(RESERVATION_BRAND, id, clientId, fromMicros(amountMicros));
    this.#open.set(handle, { clientId, micros: amountMicros, day, month });
    return handle;
  }

  #close(reservation: SpendReservation): { clientId: string; micros: number; day: string; month: string } | null {
    // IDENTITY, AND NOTHING ELSE. The lookup IS the guard: only a handle this
    // meter minted and has not yet closed is a key here. No field is consulted,
    // so no field can be tampered with (R5-01, R6-04).
    const open = this.#open.get(reservation);
    if (open === undefined) return null; // forged, foreign, or already closed
    this.#open.delete(reservation);
    for (const period of [open.day, open.month]) {
      const reserved = this.#read(this.#reservedMicros, period, "reserved spend");
      // No Math.max clamp: the entry is deleted above before either period is
      // decremented, so a reservation cannot be released twice and the
      // subtraction cannot go negative. A clamp here would be dead code that
      // reads as a guard, which is how the last four rounds found unprotected
      // fixes (adversary finding R6-05/M7). If it ever CAN go negative the
      // ledger is corrupt, and #read refuses on the next call — fail closed.
      this.#reservedMicros.set(period, reserved - open.micros);
    }
    return open;
  }

  /** Commits the reservation: the reserved amount, and only the reserved
   * amount.
   *
   * THERE IS NO `actualUsd` OVERRIDE. One existed for a fortnight to implement
   * the R7-05 reconciliation ruling, and it was `record()` wearing a handle:
   * `settle(r, 5000)` committed $5,000 against a $10/day ceiling with no error,
   * and `settle(r, 0)` left five thousand departed billable calls reading
   * $0.00 — a cap breach and a data lie in one operation. It had zero
   * production callers, so it bought nothing on the money path for it
   * (adversary finding R8-02).
   *
   * The reconciliation ruling stands and is unchanged: the committed figure is
   * an ESTIMATE, trued up daily against the provider's usage receipt, and
   * ledger L26 says so. What changed is the door it comes through — the
   * correction goes through the same audited, cap-checked path as every other
   * money mutation, not through a setter that can write any number. */
  settle(reservation: SpendReservation): void {
    /** A SETTLE INTO UNAVAILABLE STORAGE MUST THROW, not commit nothing.
     *
     * `settle` was the one money method that did not check availability, so a
     * storage outage silently dropped the charge for a request the provider had
     * already served. `llm()` fails closed on a throwing settle — the
     * reservation stays open and keeps counting against the ceiling — which is
     * the correct behaviour and is what M-01/M-04 test. It is also the seam the
     * fault-injection tests now use, instead of patching this method onto an
     * instance (adversary finding R10-02). */
    this.#assertAvailable();
    const open = this.#close(reservation);
    if (open === null) return;
    const micros = open.micros;
    for (const period of [open.day, open.month]) {
      const committed = this.#read(this.#committedMicros, period, "committed spend");
      this.#committedMicros.set(period, committed + micros);
    }
  }

  release(reservation: SpendReservation): void {
    /** A RELEASE INTO UNAVAILABLE STORAGE THROWS, and that is the honest
     * behaviour rather than a contract violation.
     *
     * The interface says an implementation must not throw, because `llm()`
     * calls this from a failure path with nothing left to unwind. But a release
     * that silently no-ops while storage is down IS N-07's harm: the headroom
     * stays consumed for a request that never departed, invisibly. `llm()`
     * already handles a throwing release by recording the leak on the error it
     * returns — that branch exists precisely for an implementation that throws
     * — so throwing here reaches the recording rather than defeating it.
     *
     * It is also the seam this file's own fault-injection tests use, now that
     * production meters are frozen and cannot be patched (R10-02). Keeping N-07
     * reachable is the point: with no way to make a release fail, that branch
     * would have become the fourth dead guard in `llm()`. */
    this.#assertAvailable();
    this.#close(reservation);
  }

}

/** THE PRODUCTION TIME SOURCE. Owned by the meter, not handed in, not the
 * mutable global.
 *
 * R9-05 removed the injectable clock and bound `Date.now` — which is a mutable
 * property of a mutable global. Patching it gave 3,000 dispatches against a
 * frozen $200/month with no `CapError` (adversary finding R10-03): the ceilings
 * were closed structurally and the clock, which decides HOW MANY ceilings
 * exist, was not.
 *
 * Human ruling 2026-08-18: a different source entirely; a module-load capture
 * that a pre-import patch defeats is not acceptable either; and any irreducible
 * residual needs a test proving its bounds, not a disclosure.
 *
 * So the design is anchor-plus-monotonic, with the anchor cross-validated:
 *
 *  1. AT CONSTRUCTION, wall-clock is read from three INDEPENDENT sources —
 *     `Date.now`, the `Date` constructor, and `performance.timeOrigin +
 *     performance.now()`. They must agree within `ANCHOR_TOLERANCE_MS` or the
 *     meter refuses to exist. Patching one to move the ceiling is therefore not
 *     a quiet win, it is a construction failure.
 *  2. AFTERWARDS the wall clock is never read again. Time advances by the
 *     MONOTONIC delta from `process.hrtime.bigint()`, which cannot be moved
 *     backwards and is not what an attacker reaches for. A patch to `Date.now`
 *     after construction has no effect at all — which is R10-03's exact attack.
 *  3. The monotonic source is itself checked: a reading that goes backwards
 *     refuses spend rather than re-entering a closed period.
 *
 * WHAT REMAINS, AND ITS BOUND: an attacker who patches all three wall-clock
 * sources CONSISTENTLY before this module is imported moves the anchor. That is
 * irreducible in-process — every JS time API is a mutable property — and it is
 * not disclosed and left there: `locks-r7` proves the bound by executing it.
 * One patched source is refused; two disagreeing are refused; a post-construction
 * patch is inert; and the monotonic advance is what the ledger keys on. */
const ANCHOR_TOLERANCE_MS = 5_000;

/** Captured at module load. NOT the security boundary — the cross-check is —
 * but it removes the trivial "patch it later" win. */
const NATIVE = Object.freeze({
  dateNow: Date.now,
  DateCtor: Date,
  hrtime: process.hrtime.bigint.bind(process.hrtime),
  timeOrigin: () => performance.timeOrigin,
  perfNow: () => performance.now(),
});

/** Three independent readings of the wall clock, or a refusal. */
function anchorWallMs(): number {
  const readings: Array<{ name: string; ms: number }> = [
    { name: "Date.now", ms: NATIVE.dateNow.call(Date) },
    { name: "new Date()", ms: new NATIVE.DateCtor().getTime() },
    { name: "performance", ms: NATIVE.timeOrigin() + NATIVE.perfNow() },
  ];
  for (const r of readings) {
    if (!Number.isFinite(r.ms)) {
      throw new MeterUnavailableError(`time source ${r.name} is not a finite instant — refusing spend (fail closed)`);
    }
  }
  const lo = Math.min(...readings.map((r) => r.ms));
  const hi = Math.max(...readings.map((r) => r.ms));
  if (hi - lo > ANCHOR_TOLERANCE_MS) {
    throw new MeterUnavailableError(
      `independent time sources disagree by ${Math.round(hi - lo)}ms (${readings
        .map((r) => `${r.name}=${Math.round(r.ms)}`)
        .join(", ")}) — refusing spend (fail closed)`,
    );
  }
  // The median: one tampered source cannot drag it, it can only fail the spread.
  return readings.map((r) => r.ms).sort((a, b) => a - b)[1]!;
}

/** A clock the meter owns. Anchored once, advanced monotonically thereafter. */
export function trustedClock(): () => number {
  const anchorWall = anchorWallMs();
  const anchorMono = NATIVE.hrtime();
  let lastMono = anchorMono;
  return () => {
    const mono = NATIVE.hrtime();
    if (mono < lastMono) {
      throw new MeterUnavailableError("monotonic time source moved backwards — refusing spend (fail closed)");
    }
    lastMono = mono;
    return anchorWall + Number((mono - anchorMono) / 1_000_000n);
  };
}

/** Meters whose ceilings provably come from the frozen caps table.
 *
 * Module-private, so nothing outside this file can add a member. `instanceof`
 * alone would not do — `Object.create(FrozenCapsSpendMeter.prototype)` passes
 * it, and this project has already shipped one identity check that a plain
 * object literal walked through (R5-01). */
const FROZEN_CAPS_BOUND = new WeakSet<SpendMeter>();

/** THE PRODUCTION METER. Its ceilings come from `config/caps.ts` by
 * construction, and there is no resolver to inject.
 *
 * R7-06 removed the ceilings ARGUMENT from `reserve()` because a caller could
 * hand itself $1,000/$1,000 for a real client. That fix moved the seam rather
 * than closing it: the ceilings became the meter's, the meter became
 * `deps.meter`, and `llm()` accepted whatever resolver it was handed while
 * discarding the value it computed from the frozen table itself. Five thousand
 * calls then committed $50 against a frozen $20/month with no `CapError`
 * (adversary finding R8-01). Before that fix the attack required bypassing
 * `llm()`; after it, the injected resolver was the only ceiling `llm()` had.
 *
 * Human ruling: close it structurally, not with a mismatch-refusal check —
 * "remove the injection point entirely". So the only thing a caller may supply
 * is the same NARROWING table `effectiveAiCapsUsd` already accepts, which
 * `caps.ts` proves can lower a ceiling and never raise one (R2-03). There is no
 * argument that widens.
 *
 * The class is final. A subclass would inherit the brand and could override
 * `reserve()`, which is the injection point again wearing a different hat. */
export class FrozenCapsSpendMeter extends MemorySpendMeter {
  /** NO CLOCK PARAMETER, for the same reason there is no resolver parameter.
   *
   * R8-01 closed the ceilings seam and left the clock one open beside it. The
   * cap is keyed by (client, local day) and (client, local month), so a caller
   * that chooses the clock chooses how many ceilings exist: a clock advancing a
   * month per call mints a fresh $200 every time. Executed through the real
   * `llm()`, 12,000 dispatches committed $120 against a frozen $20/month with
   * no `CapError` (adversary finding R9-05).
   *
   * Human ruling 2026-08-17: bind it by construction, do not bound the jump.
   * "R9 demonstrated what checks are worth on money paths."
   *
   * `MemorySpendMeter` keeps its injectable clock for the tests that need to
   * drive time, and `llm()` refuses it — so time control lives on the test-only
   * type, exactly where the ruling put it. */
  constructor(narrowing?: CapsNarrowingTable) {
    if (new.target !== FrozenCapsSpendMeter) {
      throw new MeterUnavailableError(
        "FrozenCapsSpendMeter is final — a subclass could override reserve() and reopen the ceiling seam (fail closed)",
      );
    }
    super(trustedClock(), (clientId) => effectiveAiCapsUsd(clientId, narrowing));
    FROZEN_CAPS_BOUND.add(this);
    /** IMMUTABLE, and this is the whole of R10-02's fix.
     *
     * `isFrozenCapsMeter` pinned `reserve` to the prototype and deliberately
     * left `settle`, `release` and the readings unpinned, on the argument that
     * "a settle that throws or does nothing cannot mint headroom". The
     * enumeration was incomplete: a settle that RELEASES mints headroom on
     * every call. Executed on a genuinely-constructed meter that still passed
     * the brand — 5,000 dispatches, $50 against a frozen $10/day, `todayUsd()`
     * reading $0.00 throughout (adversary finding R10-02).
     *
     * Human ruling 2026-08-18: production meters are immutable. Freezing closes
     * every method at once rather than enumerating which ones matter — and the
     * enumeration is exactly what was wrong. The class's own state is in
     * private `#` fields, which `Object.freeze` does not touch, so the meter
     * keeps working and only redefinition is refused.
     *
     * Fault injection runs through `setAvailable(false)` from the transport,
     * between reserve and settle — a real production failure mode rather than a
     * reach into internals. */
    Object.freeze(this);
  }
}

/** A table that may LOWER a client's ceiling and can never raise one, invent a
 * client, or supply a sign-off — `effectiveAiCapsUsd` narrows with `Math.min`
 * against the frozen entry. */
export type CapsNarrowingTable = Readonly<
  Record<string, { readonly dailyAiSpendUsd?: number; readonly monthlyAiSpendUsd?: number }>
>;

/** Is this meter's ceiling provably the frozen table's? `llm()` refuses every
 * meter for which this is false, which is what makes Law 2 structural on the
 * LLM money path rather than a convention about how to construct a meter.
 *
 * The brand alone is not enough: an instance is not frozen, so `reserve` could
 * be redefined on a genuinely-constructed meter and the ceiling seam would be
 * open again behind a valid brand. `reserve` must therefore be the prototype's
 * own method, untouched.
 *
 * `settle` and `release` are deliberately NOT pinned, and the asymmetry is the
 * property this function actually states. `reserve` is where the ceiling is
 * read and enforced — nothing else compares a projection against a cap. A
 * `settle` that throws or does nothing cannot mint headroom: the reservation
 * simply stays open, and `reserve` counts open reservations against the same
 * ceiling. So pinning `reserve` is exactly Law 2's requirement, and pinning
 * more would be theatre that also makes the storage-failure paths (M-01, M-04,
 * N-07) untestable without a production backdoor. */
export function isFrozenCapsMeter(meter: unknown): meter is MemorySpendMeter {
  if (typeof meter !== "object" || meter === null) return false;
  /** THE BRAND IS THE WHOLE CHECK, because the constructor freezes.
   *
   * An `Object.isFrozen(meter)` line stood here and was dead: every branded
   * meter is frozen by the only code that can brand one, so the check could
   * return `true` unconditionally with the suite green. Removing the freeze
   * itself is what matters, and that has its own entry and its own test.
   *
   * The pin this replaced covered `reserve` alone, on the argument that only
   * `reserve` reads a ceiling. A `settle` rewired to release mints headroom on
   * every call — the enumeration was the defect (R10-02), so there is none. */
  return FROZEN_CAPS_BOUND.has(meter as SpendMeter);
}
