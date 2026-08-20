import { CapError, effectiveAiCapsUsd } from "@fullburn/config/caps";
import { MeterUnavailableError } from "./money-errors.ts";
import {
  processLedger,
  type CapsNarrowingTable,
  type SpendCeilings,
  type SpendLedger,
} from "./spend-ledger.ts";

/** Re-exported so every existing importer keeps ONE error identity, and so the
 * money path has one obvious place to import it from. It is DEFINED in
 * `money-errors.ts`, which depends on nothing — three rounds of moving it to
 * follow the arithmetic left a re-export chain behind each time. */
export { MeterUnavailableError } from "./money-errors.ts";
export { medianOfThree, assertMonotonic, trustedClock, zoneDayKey, zoneMonthKey } from "./trusted-clock.ts";
export { InMemorySpendLedger, processLedger, type CapsNarrowingTable, type SpendCeilings, type SpendLedger } from "./spend-ledger.ts";

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


/** A value that is not a finite, non-negative number is unusable — refuse spend
 * rather than compare against it (F2). */
export function assertUsableAmount(n: unknown, label: string): asserts n is number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    throw new MeterUnavailableError(`${label} is not a finite non-negative number — refusing spend (fail closed)`);
  }
}

export class MemorySpendMeter implements SpendMeter {
  /** A HANDLE, AND ONLY A HANDLE.
   *
   * This class used to own the clock, the caps resolver, the period keys and
   * the arithmetic. Each of those was, at some round, the thing a caller
   * supplied to choose its own answer — the list is in `spend-ledger.ts`. They
   * all live behind the storage contract now, so what is left here is what a
   * meter is actually for: unit conversion (USD ↔ integer micro-dollars),
   * minting a branded handle, and being the type `llm()` will accept.
   *
   * WHICH CAPABILITY THIS REMOVED: none on its own — this is a move, and the
   * removal is on the ledger's side. Said plainly because "the meter is
   * simpler now" is not a security property. */
  #ledger: SpendLedger;
  #narrowing: CapsNarrowingTable | undefined;

  constructor(ledger: SpendLedger, narrowing?: CapsNarrowingTable) {
    if (ledger === null || typeof ledger !== "object" || typeof ledger.reserve !== "function") {
      throw new MeterUnavailableError("MemorySpendMeter requires a spend ledger — refusing spend (fail closed)");
    }
    this.#ledger = ledger;
    this.#narrowing = narrowing;
  }

  todayUsd(clientId: string): number {
    return fromMicros(this.#ledger.committedMicros(clientId, "day"));
  }

  monthUsd(clientId: string): number {
    return fromMicros(this.#ledger.committedMicros(clientId, "month"));
  }

  /** Every open reservation for this client, whatever day it was taken on
   * (N-09). Held money must never be invisible. */
  reservedUsd(clientId: string): number {
    return fromMicros(this.#ledger.reservedMicros(clientId));
  }

  reserve(clientId: string, amountUsd: number): SpendReservation {
    // USD in, micro-dollars out, refusing anything that cannot be money. The
    // LEDGER independently refuses a non-positive integer, so this conversion
    // is a convenience rather than the guard (R13-01).
    const amountMicros = toMicros(amountUsd, "reservation amount");
    const handle = new SpendReservation(
      RESERVATION_BRAND,
      `r${this.#ledger.nextSeq()}`,
      clientId,
      fromMicros(amountMicros),
    );
    this.#ledger.reserve(clientId, amountMicros, handle, this.#narrowing);
    return handle;
  }

  /** Commits the reservation: the reserved amount, and only the reserved
   * amount.
   *
   * THERE IS NO `actualUsd` OVERRIDE. One existed for a fortnight to implement
   * the R7-05 reconciliation ruling, and it was `record()` wearing a handle:
   * `settle(r, 5000)` committed $5,000 against a $10/day ceiling with no error
   * (adversary finding R8-02). The reconciliation ruling stands and is
   * unchanged — the committed figure is an ESTIMATE, trued up daily against the
   * provider's receipt (ledger L26). What changed is the door it comes through. */
  settle(reservation: SpendReservation): void {
    this.#ledger.settle(reservation);
  }

  /** A RELEASE INTO UNAVAILABLE STORAGE THROWS, and that is the honest
   * behaviour rather than a contract violation. `llm()` records the leak on the
   * error it returns — that branch exists precisely for an implementation that
   * throws, so throwing reaches the recording rather than defeating it (N-07). */
  release(reservation: SpendReservation): void {
    this.#ledger.release(reservation);
  }
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
  /** NO CLOCK PARAMETER, NO RESOLVER PARAMETER, NO LEDGER PARAMETER.
   *
   * R8-01 closed the ceilings seam and left the clock one open beside it: a
   * caller that chooses the clock chooses how many ceilings exist, and 12,000
   * dispatches committed $120 against a frozen $20/month with no `CapError`
   * (adversary finding R9-05). Human ruling 2026-08-17: bind it by
   * construction, do not bound the jump.
   *
   * All three now live inside the process ledger, which this constructor
   * reaches by calling `processLedger()` — there is no argument here to hand
   * one in. A test that needs to drive time constructs its own
   * `InMemorySpendLedger` with its own clock and wraps it in a plain
   * `MemorySpendMeter`, which `llm()` refuses. Time control stays on the
   * test-only path, exactly where the ruling put it. */
  constructor(narrowing?: CapsNarrowingTable) {
    if (new.target !== FrozenCapsSpendMeter) {
      throw new MeterUnavailableError(
        "FrozenCapsSpendMeter is final — a subclass could override reserve() and reopen the ceiling seam (fail closed)",
      );
    }
    super(processLedger(), narrowing);
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
