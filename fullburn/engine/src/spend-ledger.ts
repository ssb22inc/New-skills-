import { CapError } from "@fullburn/config/caps";

/** THE SPEND LEDGER — the state a cap is enforced against, AND the thing that
 * enforces it. Not the meter's, and not writable by anyone holding a reference.
 *
 * WHY THIS FILE EXISTS. Every fix from R7-06 onward asked *which* meter may
 * enforce a ceiling: the resolver seam (R7-06), the caller-supplied meter
 * (R8-01), the clock (R9-05, R10-03), the patched instance (R10-02). None asked
 * *how many*. The ledger lived in the meter's own fields, so
 * `new FrozenCapsSpendMeter()` on every call minted a fresh ceiling — no mock,
 * no forgery, just constructing the object the API asks you to construct
 * (adversary finding R11-07, measured at $30 against a frozen $5/day).
 *
 * R11 moved the state out of the instance and stopped there, so the ledger
 * arrived as a PUBLIC, UNFENCED MONEY-WRITE PRIMITIVE:
 * `processLedger().setCommittedMicros(period, 0)` minted a fresh ceiling on
 * every call, with no patch, no cast and no test marker — $30 against a frozen
 * $5/day, one meter, zero `CapError`s, `todayUsd()` reading $0.00 throughout
 * (adversary finding R12-01). The fences built for R11-07 guarded the RESET;
 * they had nothing to say about writing the balance directly. That is the same
 * root cause one level out: a fix that enumerates the spelling of the danger
 * instead of removing the capability.
 *
 * Human ruling 2026-08-19: "Move the reserve/settle arithmetic inside the
 * ledger — interface exposes `reserve(clientId, micros, caps)` and
 * `settle(handle)`, no balance-write primitive at all. The meter is a caller,
 * not an arithmetic owner. Fifth time in this place is enough — remove the
 * capability."
 *
 * So THERE IS NO SETTER FOR A BALANCE. The only ways the committed total moves
 * are `reserve` (which refuses a breach) and `settle` (which commits exactly
 * what `reserve` already checked). Reserved headroom is not stored at all — it
 * is DERIVED from the open handles, so there is no second number to drift and
 * no second number to overwrite.
 *
 * PHASE 2 DEPENDENCY, recorded here so it cannot be forgotten: the production
 * implementation is the client's Durable Object (§2.2), which serialises per
 * client and survives a restart. It lands in Phase 2 BEHIND THIS INTERFACE —
 * and because the arithmetic is now on this side of the boundary, the DO
 * enforces the ceiling itself, which is what closes R11-01's in-process
 * prototype patch. `InMemorySpendLedger` is the in-process stand-in. Ledger L31
 * records the residuals and what closes each. */

export class MeterUnavailableError extends Error {}

/** An open reservation, as the ledger holds it. */
export interface OpenEntry {
  readonly clientId: string;
  readonly micros: number;
  readonly day: string;
  readonly month: string;
}

/** Everything `reserve` needs to decide. The meter computes the period keys and
 * reads the ceilings from the frozen table; the LEDGER does the arithmetic and
 * owns the refusal, because the refusal is what a caller must not be able to
 * route around. */
export interface ReserveRequest {
  readonly clientId: string;
  readonly micros: number;
  readonly day: string;
  readonly month: string;
  readonly dailyCapMicros: number;
  readonly monthlyCapMicros: number;
  /** USD, for the refusal message only. Never used in a comparison. */
  readonly dailyCapUsd: number;
  readonly monthlyCapUsd: number;
}

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
 * Note what is NOT here: no `setCommittedMicros`, no `setReservedMicros`, no
 * `setOpen`/`deleteOpen`, no `openEntries`. Each of those was a way to move a
 * balance or read another tenant's holdings without going through a cap check. */
export interface SpendLedger {
  /** Read, check BOTH ceilings, and write — one synchronous block, no `await`
   * in the middle, so concurrent in-flight calls cannot all clear the same
   * stale reading. Throws `CapError` on a breach and `MeterUnavailableError` on
   * unusable state. The handle is the caller's; the ledger keys by its
   * IDENTITY and never reads a field from it. */
  reserve(req: ReserveRequest, handle: object): void;
  /** Commits the reservation this handle opened — exactly the reserved amount,
   * against the periods it was reserved in. Returns null if the handle is not
   * open here (forged, foreign, or already closed). */
  settle(handle: object): OpenEntry | null;
  /** Drops the reservation without committing. */
  release(handle: object): OpenEntry | null;
  /** Committed micros for one client in one of ITS periods. A period belonging
   * to another client is refused, not returned. */
  committedMicros(clientId: string, period: string): number;
  /** Micros held open for this client, across every period. */
  reservedMicros(clientId: string): number;
  highWater(clientId: string): string | undefined;
  setHighWater(clientId: string, day: string): void;
  /** Per CLIENT. It was process-wide, so one storage flag halted every tenant's
   * spend (adversary finding R12-07). */
  isAvailable(clientId: string): boolean;
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

/** A period key is `d:<day>|<client>` or `m:<month>|<client>`. The client is in
 * the key, so a read for the wrong client is detectable rather than trusted. */
function assertOwnPeriod(clientId: string, period: string): void {
  if (!period.endsWith(`|${clientId}`)) {
    throw new MeterUnavailableError(
      `period "${period}" does not belong to client "${clientId}" — refusing cross-tenant ledger access (Law 3)`,
    );
  }
}

export class InMemorySpendLedger implements SpendLedger {
  #committed = new Map<string, number>();
  #open = new Map<object, OpenEntry>();
  #highWater = new Map<string, string>();
  #down = new Map<string, string>();
  #audit: AvailabilityEvent[] = [];
  #seq = 0;

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
      // DELIBERATELY DISTINCT from the meter's own refusal. Both guards exist
      // and both are reachable, but with identical text the sweep could not
      // tell which one fired, and one of the two would have been covered by
      // accident — the same blindness R11-02's fix removed at the predicate level.
      throw new MeterUnavailableError(
        `client storage is unavailable for "${clientId}" — refusing spend (fail closed)`,
      );
    }
  }

  reserve(req: ReserveRequest, handle: object): void {
    this.#assertAvailable(req.clientId);
    assertOwnPeriod(req.clientId, req.day);
    assertOwnPeriod(req.clientId, req.month);
    if (this.#open.has(handle)) {
      throw new MeterUnavailableError("reservation handle is already open — refusing spend (fail closed)");
    }
    // BOTH ceilings are read, checked and written inside one synchronous block.
    const project = (period: string): number => {
      const projected = usable(this.#committed.get(period) ?? 0, "committed spend") + this.#reservedIn(period) + req.micros;
      if (!Number.isSafeInteger(projected)) {
        throw new MeterUnavailableError("projected spend is out of range — refusing spend (fail closed)");
      }
      return projected;
    };
    const projectedDay = project(req.day);
    const projectedMonth = project(req.month);
    if (projectedDay > req.dailyCapMicros) {
      throw new CapError(
        `AI spend cap breach refused: projected $${(projectedDay / 1_000_000).toFixed(4)} > daily cap $${req.dailyCapUsd} for "${req.clientId}"`,
      );
    }
    if (projectedMonth > req.monthlyCapMicros) {
      throw new CapError(
        `AI spend cap breach refused: projected $${(projectedMonth / 1_000_000).toFixed(4)} > monthly cap $${req.monthlyCapUsd} for "${req.clientId}"`,
      );
    }
    // Single synchronous write completes the read-check-write cycle. Recording
    // the handle IS the reservation: the headroom it holds is derived from it.
    this.#open.set(handle, { clientId: req.clientId, micros: req.micros, day: req.day, month: req.month });
  }

  /** IDENTITY, AND NOTHING ELSE. The lookup IS the guard: only a handle that is
   * open here is a key. No field is consulted, so no field can be tampered with
   * (R5-01, R6-04).
   *
   * There is no `#close` helper doing the lookup a second time. There was, and
   * the second lookup could never fail — dead code reading as a guard, which is
   * the pattern this project deletes rather than keeps. */
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

  committedMicros(clientId: string, period: string): number {
    this.#assertAvailable(clientId);
    assertOwnPeriod(clientId, period);
    return usable(this.#committed.get(period) ?? 0, "committed spend");
  }

  reservedMicros(clientId: string): number {
    this.#assertAvailable(clientId);
    let micros = 0;
    for (const e of this.#open.values()) {
      if (e.clientId === clientId) micros += e.micros;
    }
    return usable(micros, "reserved spend");
  }

  highWater(clientId: string): string | undefined {
    return this.#highWater.get(clientId);
  }

  setHighWater(clientId: string, day: string): void {
    this.#highWater.set(clientId, day);
  }

  isAvailable(clientId: string): boolean {
    return !this.#down.has(clientId);
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

/** THE ONE LEDGER EVERY PRODUCTION METER WRITES TO.
 *
 * Keyed off the PROCESS's global symbol registry rather than off this module's
 * scope. A module-scoped `const` is one ledger per MODULE INSTANCE, and a second
 * instance is obtainable inside a single process — `vi.resetModules()` and a
 * re-import minted a full second ceiling, $10 against a frozen $5/day, and the
 * project's own suite did it (adversary findings R12-05, R12-06). A bundler
 * chunk duplication or a dual-resolution alias does the same in production.
 * `Symbol.for` resolves in the process-wide registry, so every module instance
 * finds the same object. */
const LEDGER_SLOT = Symbol.for("fullburn.spend-ledger.process");

function slot(): InMemorySpendLedger {
  const g = globalThis as unknown as Record<symbol, InMemorySpendLedger | undefined>;
  const existing = g[LEDGER_SLOT];
  if (existing !== undefined) return existing;
  const fresh = new InMemorySpendLedger();
  g[LEDGER_SLOT] = fresh;
  return fresh;
}

export function processLedger(): SpendLedger {
  return slot();
}

export class SpendLedgerError extends Error {}

/** TEST ISOLATION, AND WHY IT IS NOT A HOLE IN THE CAP.
 *
 * A process-wide ledger means one test's spend is the next test's opening
 * balance. Something has to reset it — and a reset is R11-07 in a single call.
 * So the reset is fenced by the runtime rather than by a comment asking callers
 * not to use it.
 *
 * The deployed surface is a Cloudflare Worker (§2.2). It has no vitest worker
 * marker, so this function CANNOT COMPLETE THERE — the fence is a property of
 * where the code runs, not of who calls it. The companion invariant enumerates
 * `engine/src` and `config/src` from the filesystem and fails if any production
 * module names it. Ledger L31 records what neither fence covers. */
export function resetProcessLedgerForTests(): void {
  const marker = (globalThis as Record<string, unknown>)["__vitest_worker__"];
  if (marker === undefined || marker === null) {
    throw new SpendLedgerError(
      "resetProcessLedgerForTests ran outside a test runner — wiping the spend ledger would mint a fresh ceiling (fail closed)",
    );
  }
  slot().clear();
}
