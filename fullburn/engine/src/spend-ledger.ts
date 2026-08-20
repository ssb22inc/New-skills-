import { CapError, assertUsableZone, effectiveAiCapsUsd } from "@fullburn/config/caps";
import { MeterUnavailableError } from "./money-errors.ts";
import { trustedClock, zoneDayKey, zoneMonthKey } from "./trusted-clock.ts";

/** THE SPEND LEDGER — the state a cap is enforced against, the clock that says
 * which period it lands in, the ceilings it is measured against, and the
 * arithmetic. All four, on this side of the boundary, because a caller who
 * supplies any one of them supplies the answer.
 *
 * WHAT EACH ROUND REMOVED, and what the next one found still reachable:
 *
 *   R7-06  the ceilings ARGUMENT on `reserve()`      → the resolver was the meter's
 *   R8-01  the caller-supplied meter                 → the clock was still the caller's
 *   R9-05  the clock argument                        → `Date.now` was still patchable
 *   R10-03 `Date.now`                                → the instance was still patchable
 *   R10-02 the mutable instance                      → a NEW instance minted a ceiling
 *   R11-07 the per-instance ledger                   → the ledger had public setters
 *   R12-01 the balance setters                       → `reserve(-N)` + `settle` was a setter
 *
 * R13-01 is the seventh in that list and the reason this file now looks the way
 * it does. `reserve` took a `ReserveRequest` carrying `micros`, `dailyCapMicros`,
 * `monthlyCapMicros`, `day` and `month`. A negative `micros` made the projection
 * SMALLER, so `projected > cap` could not fail, and `settle` then committed the
 * negative: $30 through the real `llm()` against a frozen $5/day, zero
 * `CapError`s, `todayUsd()` reading $0.00. The ceilings were the caller's too —
 * R7-06's seam, reintroduced one layer down on the interface Phase 2 is told to
 * implement unchanged — and so were the period keys, which is a fresh ceiling
 * for the asking.
 *
 * Human ruling 2026-08-20: "`ReserveRequest` carries no caps and no raw signed
 * amount. The ledger validates `micros` positive at the boundary and resolves
 * ceilings itself from the frozen table. Sign and ceiling stop being
 * caller-controlled inputs rather than being checked."
 *
 * THE PERIOD KEYS WENT WITH THEM, and that is a deliberate step past the letter
 * of the ruling, taken because the ruling's own principle applies to them
 * identically: a caller who names the day names how many ceilings exist. They
 * are computed here from this ledger's clock and this client's accounting zone,
 * and they never appear in the contract's signatures at all.
 *
 * WHICH CAPABILITY THIS REMOVED (standing rule, 2026-08-20): a caller can no
 * longer choose the sign of a balance change, the ceiling it is checked
 * against, or the period it lands in. What a caller may still supply is a
 * NARROWING table, which `caps.ts` proves can only lower a ceiling — R7-06's
 * one permitted input, unchanged.
 *
 * PHASE 2 DEPENDENCY, recorded so it cannot be forgotten: the production
 * implementation is the client's Durable Object (§2.2), which serialises per
 * client and survives a restart. It implements THIS interface. Because the
 * clock, the caps and the arithmetic are all on this side of it, the DO enforces
 * the ceiling out of process — which is what closes R11-01's in-process
 * prototype patch. Ledger L31 records the residuals. */

export { MeterUnavailableError } from "./money-errors.ts";

/** An open reservation, as the ledger holds it. */
export interface OpenEntry {
  readonly clientId: string;
  readonly micros: number;
  readonly day: string;
  readonly month: string;
}

/** The two spans a cap is enforced over. A caller names the SPAN, never the
 * KEY: `committedMicros(c, "day")` cannot ask about a day of its choosing. */
export type PeriodSpan = "day" | "month";

/** The ceilings and the zone they are bucketed in. */
export interface SpendCeilings {
  readonly dailyUsd: number;
  readonly monthlyUsd: number;
  readonly timeZone: string;
}

/** A table that may LOWER a client's ceiling and can never raise one, invent a
 * client, or supply a sign-off — `caps.ts` proves all three (R2-03). The one
 * caller input R7-06 left open, and still the only one. */
export type CapsNarrowingTable = Readonly<
  Record<string, { readonly dailyAiSpendUsd?: number; readonly monthlyAiSpendUsd?: number }>
>;

/** Resolves a client's ceilings. The LEDGER holds one; callers do not pass one
 * per call, and there is no argument by which they could. */
export type CapsResolver = (clientId: string, narrowing?: CapsNarrowingTable) => SpendCeilings;

/** One availability change, kept so the decision is auditable. A method that
 * permanently halts a client's spend with no record is an operator action
 * nobody can review (adversary findings R11-06, R12-07). */
export interface AvailabilityEvent {
  readonly clientId: string;
  readonly available: boolean;
  readonly reason: string;
  readonly seq: number;
}

/** THE STORAGE CONTRACT. Phase 2's Durable Object implements exactly this.
 *
 * Note what is NOT here, and that each absence is a capability rather than a
 * name: no balance setter; no ceiling argument; no period key, in or out; no
 * signed amount; no enumeration of another tenant's holdings; no high-water
 * setter. Every one of those was, at some round, the way past the cap. */
export interface SpendLedger {
  /** Open a reservation for `micros` — a POSITIVE integer count of
   * micro-dollars. Reads, checks BOTH ceilings and writes in one synchronous
   * block, so concurrent in-flight calls cannot all clear the same stale
   * reading. Throws `CapError` on a breach, `MeterUnavailableError` on an
   * unusable amount or unusable state. The handle is the caller's; the ledger
   * keys by its IDENTITY and never reads a field from it. */
  reserve(clientId: string, micros: number, handle: object, narrowing?: CapsNarrowingTable): void;
  /** Commits the reservation this handle opened — exactly the recorded amount,
   * against the periods it was recorded in. Returns null if the handle is not
   * open here (forged, foreign, or already closed). */
  settle(handle: object): OpenEntry | null;
  /** Drops the reservation without committing. */
  release(handle: object): OpenEntry | null;
  /** Committed micros for one client over one SPAN of its own accounting
   * calendar. There is no period-key parameter to forge. */
  committedMicros(clientId: string, span: PeriodSpan): number;
  /** Micros held open for this client, across every period. */
  reservedMicros(clientId: string): number;
  /** `isAvailable` IS GONE FROM THE CONTRACT. Nothing called it: the live guard
   * is the ledger's own `#assertAvailable`, which every money method runs. A
   * contract method no caller reaches is a guard that reads as coverage — the
   * unreachable-guard rule applies to interfaces too, and a mutation on it
   * survived by construction (measured this round). Deleted rather than
   * disclosed, because deleting it removes a capability from the surface Phase
   * 2's Durable Object has to implement. */
  /** Requires a reason, and records the change. */
  setAvailable(clientId: string, available: boolean, reason: string): void;
  availabilityAudit(): readonly AvailabilityEvent[];
  nextSeq(): number;
}

/** A stored total that is not a safe non-negative integer is corrupt storage,
 * not a small number. Shared by every read so no path can skip it. */
function usable(v: number, label: string): number {
  if (!Number.isSafeInteger(v) || v < 0) {
    throw new MeterUnavailableError(`${label} ledger is corrupt — refusing spend (fail closed)`);
  }
  return v;
}

export class InMemorySpendLedger implements SpendLedger {
  #committed = new Map<string, number>();
  #open = new Map<object, OpenEntry>();
  #highWater = new Map<string, string>();
  #down = new Map<string, string>();
  #audit: AvailabilityEvent[] = [];
  #seq = 0;
  #now: () => number;
  #capsFor: CapsResolver;

  /** BOTH ARE REQUIRED, and both belong here rather than to a caller. The clock
   * decides how many ceilings exist (R9-05); the resolver decides how big they
   * are (R7-06). Every round that left either one on the caller's side of a
   * boundary produced a money finding. */
  constructor(now: () => number, capsFor: CapsResolver) {
    if (typeof now !== "function") {
      throw new MeterUnavailableError("the spend ledger requires a clock — refusing spend (fail closed)");
    }
    if (typeof capsFor !== "function") {
      throw new MeterUnavailableError("the spend ledger requires a caps resolver — refusing spend (fail closed)");
    }
    this.#now = now;
    this.#capsFor = capsFor;
  }

  /** The ceilings for a client, checked into a usable shape before any
   * comparison is made against them. */
  #ceilings(clientId: string, narrowing?: CapsNarrowingTable): SpendCeilings {
    const caps = this.#capsFor(clientId, narrowing);
    if (caps === null || typeof caps !== "object") {
      throw new MeterUnavailableError("caps resolver returned no ceilings — refusing spend (fail closed)");
    }
    assertUsableZone(caps.timeZone, clientId);
    return caps;
  }

  /** BOTH period keys from ONE clock read. Reading the clock twice split the
   * pair across a month boundary: $7 committed to the August 31 day and the
   * September month, one tick apart (adversary finding R5-08). */
  #periods(clientId: string, narrowing?: CapsNarrowingTable): { day: string; month: string; caps: SpendCeilings } {
    const caps = this.#ceilings(clientId, narrowing);
    const nowMs = this.#now();
    return {
      day: `d:${zoneDayKey(nowMs, caps.timeZone)}|${clientId}`,
      month: `m:${zoneMonthKey(nowMs, caps.timeZone)}|${clientId}`,
      caps,
    };
  }

  /** Refuses a clock that has moved backwards into an already-closed day.
   * Internal: there is no `setHighWater` on the contract, because an unvalidated
   * one let a caller both brick a tenant and un-ratchet the ratchet (R13-01). */
  #assertForward(clientId: string, day: string): void {
    const seen = this.#highWater.get(clientId);
    if (seen !== undefined && day < seen) {
      throw new MeterUnavailableError(
        `clock moved backwards into a closed accounting day for "${clientId}" — refusing spend (fail closed)`,
      );
    }
    if (seen === undefined || day > seen) this.#highWater.set(clientId, day);
  }

  /** Headroom held open for one client in one period — DERIVED, never stored.
   * A stored figure needed a setter, and a setter is a money-write primitive. */
  #reservedIn(period: string): number {
    let micros = 0;
    for (const e of this.#open.values()) {
      if (e.day === period || e.month === period) micros += e.micros;
    }
    return usable(micros, "reserved spend");
  }

  #assertAvailable(clientId: string): void {
    if (this.#down.has(clientId)) {
      // DELIBERATELY DISTINCT from any other refusal text, so the sweep can tell
      // which guard fired rather than covering two by accident (R11-02).
      throw new MeterUnavailableError(
        `client storage is unavailable for "${clientId}" — refusing spend (fail closed)`,
      );
    }
  }

  reserve(clientId: string, micros: number, handle: object, narrowing?: CapsNarrowingTable): void {
    if (typeof clientId !== "string" || clientId.length === 0) {
      throw new MeterUnavailableError("reserve requires a clientId — refusing spend (fail closed)");
    }
    this.#assertAvailable(clientId);
    /** THE SIGN IS NOT THE CALLER'S. `reserve` accepted any integer, so a
     * negative made `projected > cap` a comparison that could not fail and
     * `settle` committed the negative — a balance setter assembled from two
     * contract calls (adversary finding R13-01). Validated at the boundary,
     * once, before any arithmetic touches it. */
    if (!Number.isSafeInteger(micros) || micros <= 0) {
      throw new MeterUnavailableError(
        "reservation amount must be a positive whole number of micro-dollars — refusing spend (fail closed)",
      );
    }
    if (typeof handle !== "object" || handle === null) {
      throw new MeterUnavailableError("a reservation needs a handle object — refusing spend (fail closed)");
    }
    if (this.#open.has(handle)) {
      throw new MeterUnavailableError("reservation handle is already open — refusing spend (fail closed)");
    }
    const { day, month, caps } = this.#periods(clientId, narrowing);
    this.#assertForward(clientId, day);

    const dailyCapMicros = capMicros(caps.dailyUsd, "daily cap");
    const monthlyCapMicros = capMicros(caps.monthlyUsd, "monthly cap");
    const project = (period: string): number => {
      const projected = usable(this.#committed.get(period) ?? 0, "committed spend") + this.#reservedIn(period) + micros;
      if (!Number.isSafeInteger(projected)) {
        throw new MeterUnavailableError("projected spend is out of range — refusing spend (fail closed)");
      }
      return projected;
    };
    const projectedDay = project(day);
    const projectedMonth = project(month);
    if (projectedDay > dailyCapMicros) {
      throw new CapError(
        `AI spend cap breach refused: projected $${(projectedDay / 1_000_000).toFixed(4)} > daily cap $${caps.dailyUsd} for "${clientId}"`,
      );
    }
    if (projectedMonth > monthlyCapMicros) {
      throw new CapError(
        `AI spend cap breach refused: projected $${(projectedMonth / 1_000_000).toFixed(4)} > monthly cap $${caps.monthlyUsd} for "${clientId}"`,
      );
    }
    // Single synchronous write completes the read-check-write cycle. Recording
    // the handle IS the reservation: the headroom it holds is derived from it.
    this.#open.set(handle, { clientId, micros, day, month });
  }

  /** IDENTITY, AND NOTHING ELSE. The lookup IS the guard: only a handle that is
   * open here is a key. No field is consulted, so no field can be tampered with
   * (R5-01, R6-04). */
  settle(handle: object): OpenEntry | null {
    const open = this.#open.get(handle);
    if (open === undefined) return null; // forged, foreign, or already closed
    // Availability is checked against the entry's OWN client, taken from the
    // ledger rather than from the handle, so a tampered field cannot pick the
    // tenant whose storage is up.
    this.#assertAvailable(open.clientId);
    this.#open.delete(handle);
    for (const period of [open.day, open.month]) {
      const committed = usable(this.#committed.get(period) ?? 0, "committed spend");
      this.#committed.set(period, committed + open.micros);
    }
    return open;
  }

  release(handle: object): OpenEntry | null {
    const open = this.#open.get(handle);
    if (open === undefined) return null;
    this.#assertAvailable(open.clientId);
    this.#open.delete(handle);
    return open;
  }

  committedMicros(clientId: string, span: PeriodSpan): number {
    this.#assertAvailable(clientId);
    const periods = this.#periods(clientId);
    return usable(this.#committed.get(span === "day" ? periods.day : periods.month) ?? 0, "committed spend");
  }

  reservedMicros(clientId: string): number {
    this.#assertAvailable(clientId);
    let micros = 0;
    for (const e of this.#open.values()) {
      if (e.clientId === clientId) micros += e.micros;
    }
    return usable(micros, "reserved spend");
  }

  setAvailable(clientId: string, available: boolean, reason: string): void {
    if (typeof clientId !== "string" || clientId.length === 0) {
      throw new MeterUnavailableError("setAvailable requires a clientId — a process-wide halt is not an operator action");
    }
    if (typeof reason !== "string" || reason.length === 0) {
      throw new MeterUnavailableError("setAvailable requires a reason — an unaudited halt of a client's spend is refused");
    }
    if (available) this.#down.delete(clientId);
    else this.#down.set(clientId, reason);
    this.#audit.push({ clientId, available, reason, seq: this.nextSeq() });
  }

  availabilityAudit(): readonly AvailabilityEvent[] {
    return this.#audit.slice();
  }

  nextSeq(): number {
    this.#seq += 1;
    return this.#seq;
  }

  /** NOT ON THE `SpendLedger` INTERFACE, deliberately. Wiping the state a cap is
   * enforced against is R11-07 in one call, so it is not part of the contract
   * the meter — or Phase 2's Durable Object — speaks. The only caller is
   * `resetProcessLedgerForTests`, which cannot run outside a test runner. */
  clear(): void {
    this.#committed.clear();
    this.#open.clear();
    this.#highWater.clear();
    this.#down.clear();
    this.#audit = [];
    this.#seq = 0;
  }
}

/** A ceiling that is not usable money refuses spend rather than sliding into a
 * comparison that is silently false. */
function capMicros(usd: unknown, label: string): number {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) {
    throw new MeterUnavailableError(`${label} is not a usable ceiling — refusing spend (fail closed)`);
  }
  const micros = Math.round(usd * 1_000_000);
  if (!Number.isSafeInteger(micros)) {
    throw new MeterUnavailableError(`${label} is out of range for micro-dollar accounting — refusing spend (fail closed)`);
  }
  return micros;
}

/** THE ONE LEDGER EVERY PRODUCTION METER WRITES TO.
 *
 * Keyed off the PROCESS's global symbol registry rather than off this module's
 * scope, because a module-scoped `const` is one ledger per MODULE INSTANCE and a
 * second instance is obtainable inside a single process (adversary findings
 * R12-05, R12-06).
 *
 * THAT FIX CREATED A CAPABILITY, and R13-02 measured it: `slot()` returned
 * whatever it found, so anything evaluated first — a polyfill, an instrumentation
 * shim, a bundler-injected chunk — owned every production meter's ledger. $30
 * against a frozen $5/day, through the real `llm()`. The slot is BRANDED now: an
 * occupant this module did not create is refused, never adopted. Fail closed, so
 * a hijack is a dead process rather than a silent one. Ledger L31 discloses the
 * slot as a capability the process boundary exposes. */
const LEDGER_SLOT = Symbol.for("fullburn.spend-ledger.process");
/** The mark a ledger this module built carries. `Symbol.for` so a re-imported
 * MODULE INSTANCE recognises the ledger the first instance created — that is
 * the whole point of the registry slot (R12-06). */
const LEDGER_MARK = Symbol.for("fullburn.spend-ledger.v1");
/** Module-private, so within one module instance the check needs no marker at
 * all. The marker is the fallback for a second module instance. */
const OURS = new WeakSet<object>();

export class SpendLedgerError extends Error {}

function slot(): InMemorySpendLedger {
  const g = globalThis as unknown as Record<symbol, unknown>;
  const existing = g[LEDGER_SLOT];
  if (existing !== undefined) {
    const marked =
      typeof existing === "object" &&
      existing !== null &&
      (OURS.has(existing) || (existing as Record<symbol, unknown>)[LEDGER_MARK] === true);
    if (!marked) {
      throw new SpendLedgerError(
        "the process spend-ledger slot is occupied by an object this module did not create — refusing spend (fail closed)",
      );
    }
    return existing as InMemorySpendLedger;
  }
  const fresh = new InMemorySpendLedger(trustedProcessClock(), (clientId, narrowing) =>
    effectiveAiCapsUsd(clientId, narrowing),
  );
  Object.defineProperty(fresh, LEDGER_MARK, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  OURS.add(fresh);
  // FROZEN, so the instance patch R13-02 leg B measured is refused. The state
  // lives in private `#` fields, which a freeze does not reach, so the ledger
  // keeps working and only method redefinition is refused.
  Object.freeze(fresh);
  /** NON-WRITABLE AND NON-CONFIGURABLE. This is the half that removes a
   * capability rather than narrowing one: once the slot is filled, it cannot be
   * swapped, deleted or redefined by anything, for the life of the process.
   *
   * The half that only NARROWS is the mark above. An impostor that sets
   * `globalThis[Symbol.for("fullburn.spend-ledger.v1")]`-marked object into the
   * slot BEFORE this module first runs is indistinguishable in-process — both
   * symbols are in the global registry and neither is a secret. Ledger L31
   * states that plainly rather than calling it closed; the Durable Object is
   * what ends it, because the state then lives outside the process entirely. */
  Object.defineProperty(g, LEDGER_SLOT, {
    value: fresh,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return fresh;
}

export function processLedger(): SpendLedger {
  return slot();
}

/** TEST ISOLATION, AND WHY IT IS NOT A HOLE IN THE CAP.
 *
 * A process-wide ledger means one test's spend is the next test's opening
 * balance. Something has to reset it — and a reset is R11-07 in a single call.
 * So the reset is fenced by the runtime rather than by a comment asking callers
 * not to use it: the deployed surface is a Cloudflare Worker (§2.2) with no
 * vitest worker marker, so this function CANNOT COMPLETE THERE. A companion
 * invariant fails if any module under `engine/src` or `config/src` names it. */
export function resetProcessLedgerForTests(): void {
  const marker = (globalThis as Record<string, unknown>)["__vitest_worker__"];
  if (marker === undefined || marker === null) {
    throw new SpendLedgerError(
      "resetProcessLedgerForTests ran outside a test runner — wiping the spend ledger would mint a fresh ceiling (fail closed)",
    );
  }
  slot().clear();
}


function frozenCeilings(clientId: string, narrowing?: CapsNarrowingTable): SpendCeilings {
  return effectiveAiCapsUsd(clientId, narrowing);
}

/** One clock per process, built on first use. `trustedClock()` cross-validates
 * three independent wall-clock sources and then advances monotonically. */
let PROCESS_CLOCK: (() => number) | null = null;
function trustedProcessClock(): () => number {
  PROCESS_CLOCK ??= trustedClock();
  return () => PROCESS_CLOCK!();
}
