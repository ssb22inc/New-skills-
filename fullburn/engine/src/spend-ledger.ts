/** THE SPEND LEDGER — the state a cap is enforced against, deliberately NOT
 * owned by the meter.
 *
 * WHY THIS FILE EXISTS. Every fix from R7-06 onward asked *which* meter may
 * enforce a ceiling: the resolver seam (R7-06), the caller-supplied meter
 * (R8-01), the clock (R9-05, R10-03), the patched instance (R10-02). None asked
 * *how many*. The ledger lived in the meter's own fields, so
 * `new FrozenCapsSpendMeter()` on every call minted a fresh ceiling — no mock,
 * no forgery, no prototype trick, just constructing the object the API asks you
 * to construct. Measured: 3,000 dispatches, $30 against a frozen $5/day, and in
 * the builder's own reproduction $15 against $5 (adversary finding R11-07).
 *
 * Human ruling 2026-08-18: "A cap cannot be enforced by an object the caller
 * constructs at will — that's the root cause. Implement a process-wide ledger
 * keyed by client that all meters share, behind a storage interface. The meter
 * becomes a handle onto that ledger, not the owner of it."
 *
 * PHASE 2 DEPENDENCY, recorded here so it cannot be forgotten: the production
 * implementation is the client's Durable Object (§2.2), which serialises per
 * client and survives a restart. It lands in Phase 2 BEHIND THIS INTERFACE.
 * `InMemorySpendLedger` is the in-process stand-in — process-wide, so a second
 * meter cannot mint a ceiling, but still per-process, so two workers do not yet
 * share one. Ledger L31 records that residual and what closes it. */

/** Reservation records are opaque to the ledger; only the meter interprets them. */
export interface OpenEntry {
  readonly clientId: string;
  readonly micros: number;
  readonly day: string;
  readonly month: string;
}

/** The storage contract. Phase 2's Durable Object implements exactly this. */
export interface SpendLedger {
  committedMicros(period: string): number;
  reservedMicros(period: string): number;
  setCommittedMicros(period: string, micros: number): void;
  setReservedMicros(period: string, micros: number): void;
  /** Open reservations, keyed by the handle OBJECT — identity, not shape
   * (R5-01, R6-04). */
  open(handle: object): OpenEntry | undefined;
  openEntries(): Iterable<OpenEntry>;
  setOpen(handle: object, entry: OpenEntry): void;
  deleteOpen(handle: object): void;
  highWater(clientId: string): string | undefined;
  setHighWater(clientId: string, day: string): void;
  isAvailable(): boolean;
  /** Storage availability. NOT a public method on the meter: a way to halt a
   * client's spend permanently belongs to the storage layer and is traced by
   * whoever operates it (adversary finding R11-06). */
  setAvailable(v: boolean): void;
  nextSeq(): number;
}

export class InMemorySpendLedger implements SpendLedger {
  #committed = new Map<string, number>();
  #reserved = new Map<string, number>();
  #open = new Map<object, OpenEntry>();
  #highWater = new Map<string, string>();
  #available = true;
  #seq = 0;

  committedMicros(period: string): number {
    return this.#committed.get(period) ?? 0;
  }
  reservedMicros(period: string): number {
    return this.#reserved.get(period) ?? 0;
  }
  setCommittedMicros(period: string, micros: number): void {
    this.#committed.set(period, micros);
  }
  setReservedMicros(period: string, micros: number): void {
    this.#reserved.set(period, micros);
  }
  open(handle: object): OpenEntry | undefined {
    return this.#open.get(handle);
  }
  openEntries(): Iterable<OpenEntry> {
    return this.#open.values();
  }
  setOpen(handle: object, entry: OpenEntry): void {
    this.#open.set(handle, entry);
  }
  deleteOpen(handle: object): void {
    this.#open.delete(handle);
  }
  highWater(clientId: string): string | undefined {
    return this.#highWater.get(clientId);
  }
  setHighWater(clientId: string, day: string): void {
    this.#highWater.set(clientId, day);
  }
  isAvailable(): boolean {
    return this.#available;
  }
  setAvailable(v: boolean): void {
    this.#available = v;
  }
  nextSeq(): number {
    this.#seq += 1;
    return this.#seq;
  }

  /** NOT ON THE `SpendLedger` INTERFACE, deliberately. Wiping the state a cap is
   * enforced against is exactly the R11-07 attack in one call, so it is not part
   * of the contract the meter — or Phase 2's Durable Object — speaks. The only
   * caller is `resetProcessLedgerForTests`, which cannot run outside a test
   * runner. */
  clear(): void {
    this.#committed.clear();
    this.#reserved.clear();
    this.#open.clear();
    this.#highWater.clear();
    this.#available = true;
    this.#seq = 0;
  }
}

/** THE ONE LEDGER EVERY PRODUCTION METER WRITES TO.
 *
 * Module-scoped, so it exists once per process and cannot be constructed per
 * call. This is the whole of R11-07's fix: a second `FrozenCapsSpendMeter` is a
 * second HANDLE onto the same state, not a second ceiling. */
const PROCESS_LEDGER = new InMemorySpendLedger();

export function processLedger(): SpendLedger {
  return PROCESS_LEDGER;
}

export class SpendLedgerError extends Error {}

/** TEST ISOLATION, AND WHY IT IS NOT A HOLE IN THE CAP.
 *
 * A process-wide ledger means one test's spend is the next test's opening
 * balance. Something has to reset it — and a reset is R11-07 in a single call:
 * wipe the committed micros and the ceiling is fresh. So the reset is fenced by
 * the runtime rather than by a comment asking callers not to use it.
 *
 * The deployed surface is a Cloudflare Worker (§2.2). It has no `process` and no
 * vitest worker marker, so this function CANNOT COMPLETE THERE — the fence is a
 * property of where the code runs, not of who calls it. Ledger L31 records the
 * residual and the Phase 2 Durable Object that closes it.
 *
 * The companion invariant enumerates `engine/src` and `config/src` from the
 * filesystem and fails if any production module names this function. */
export function resetProcessLedgerForTests(): void {
  const marker = (globalThis as Record<string, unknown>)["__vitest_worker__"];
  if (marker === undefined || marker === null) {
    throw new SpendLedgerError(
      "resetProcessLedgerForTests ran outside a test runner — wiping the spend ledger would mint a fresh ceiling (fail closed)",
    );
  }
  PROCESS_LEDGER.clear();
}
