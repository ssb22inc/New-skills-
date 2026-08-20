import { MeterUnavailableError } from "./money-errors.ts";

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
  return medianOfThree(readings.map((r) => r.ms));
}

/** THE MEDIAN, AS A FUNCTION, BECAUSE IT IS A GUARD AND GUARDS GET DRIVEN.
 *
 * Inline, `readings.map(...).sort(...)[1]` could be replaced with
 * `readings[0]` and the whole 306-test suite stayed green (adversary findings
 * R11-03, R12-03) — while the attack narrowed from "move two sources
 * consistently" back to "move `Date.now`", which is R10-03's original target.
 * It is the load-bearing half of this file's claim that one tampered source
 * "can only fail the spread", and it had no test at all. */
export function medianOfThree(values: readonly number[]): number {
  return [...values].sort((a, b) => a - b)[1]!;
}

/** A monotonic source that has gone backwards refuses spend rather than
 * re-entering a closed period.
 *
 * Pulled out for the same reason as `medianOfThree`: `NATIVE.hrtime` is bound
 * at module load, so the guard could only be reached by re-importing the whole
 * module — which is why it was invisible to the sweep and to the harness. It
 * takes no injectable state; production still calls it with the native
 * readings, so this is a testable shape rather than a seam. */
export function assertMonotonic(mono: bigint, last: bigint): void {
  if (mono < last) {
    throw new MeterUnavailableError("monotonic time source moved backwards — refusing spend (fail closed)");
  }
}

/** A clock the meter owns. Anchored once, advanced monotonically thereafter. */
export function trustedClock(): () => number {
  const anchorWall = anchorWallMs();
  const anchorMono = NATIVE.hrtime();
  let lastMono = anchorMono;
  return () => {
    const mono = NATIVE.hrtime();
    assertMonotonic(mono, lastMono);
    lastMono = mono;
    return anchorWall + Number((mono - anchorMono) / 1_000_000n);
  };
}

/** Meters whose ceilings provably come from the frozen caps table.
 *

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

