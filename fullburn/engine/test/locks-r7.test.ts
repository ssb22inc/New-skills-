import { describe, expect, it } from "vitest";
import { CapError, effectiveAiCapsUsd, getCaps } from "@fullburn/config/caps";
import { MemorySpendMeter, MeterUnavailableError, zoneDayKey } from "../src/spend-meter.ts";
import { capsOf } from "./helpers.ts";

/** LOCK TESTS — the cross-family review (r7). Each names the one-line revert it
 * dies on. These findings came from a NON-Claude reviewer reading source that
 * six Claude rounds had passed over, which is the reason §2.4 requires family
 * diversity at all. */

/** Client zero's real ceilings and its real accounting zone. */
const pulsern = () => effectiveAiCapsUsd("pulsern");

describe("money — the daily cap buckets on the client's day, not on UTC (R7-02)", () => {
  /** `ClientCaps.dailyAiSpendUsd` promised a client-local day while the ledger
   * keyed on UTC. $10 at 23:59Z and $10 at 00:01Z are two ledger days and ONE
   * New York day, so $20 landed under a $10/day cap. Ledger L14 had disclosed
   * the mismatch for three rounds; a disclosed wrong cap is still a wrong cap.
   *
   * MUTATION: key the periods on UTC again (Date#toISOString slices). */
  it("$20 cannot land in one New York day under a $10 ceiling", () => {
    let now = Date.parse("2026-08-16T23:59:00Z"); // 19:59 ET
    const m = new MemorySpendMeter(() => now, pulsern);
    m.settle(m.reserve("pulsern", 10));
    now = Date.parse("2026-08-17T00:01:00Z"); // 20:01 ET — still Aug 16 in New York
    expect(() => m.reserve("pulsern", 10), "UTC midnight opened a second daily ceiling").toThrow(CapError);
  });

  /** MUTATION: as above. The other half — the cap must still roll over on the
   * client's OWN midnight, or a UTC-keyed ledger would pass the test above by
   * simply never rolling over. */
  it("the ceiling does roll over at the client's midnight", () => {
    let now = Date.parse("2026-08-16T23:59:00Z");
    const m = new MemorySpendMeter(() => now, pulsern);
    m.settle(m.reserve("pulsern", 10));
    now = Date.parse("2026-08-17T04:01:00Z"); // 00:01 ET on Aug 17
    expect(() => m.reserve("pulsern", 10)).not.toThrow();
  });

  /** MUTATION: replace the IANA zone with a fixed offset. Eastern is UTC-5 in
   * winter and UTC-4 in summer; a fixed offset is wrong for half the year, and
   * a cap that is wrong for half the year is one nobody can reason about. */
  it("the zone handles its own daylight-saving transition", () => {
    const winter = Date.parse("2026-01-15T04:30:00Z"); // 23:30 ET Jan 14 (EST, -5)
    const summer = Date.parse("2026-07-15T03:30:00Z"); // 23:30 ET Jul 14 (EDT, -4)
    expect(zoneDayKey(winter, "America/New_York")).toBe("2026-01-14");
    expect(zoneDayKey(summer, "America/New_York")).toBe("2026-07-14");
  });

  /** MUTATION: drop assertUsableZone, or make ianaTimeZone optional. */
  it("a client with no resolvable accounting zone cannot spend", async () => {
    const { assertUsableZone } = await import("@fullburn/config/caps");
    expect(() => assertUsableZone("Mars/Olympus", "x")).toThrow(CapError);
    expect(() => assertUsableZone("", "x")).toThrow(/no accounting timezone/);
    expect(() => assertUsableZone(undefined, "x")).toThrow(CapError);
    // Every shipped client declares one.
    for (const id of ["pulsern", "fixture-testco", "fixture-unsigned"]) {
      expect(() => getCaps(id), `${id} has no usable zone`).not.toThrow();
    }
    const meter = new MemorySpendMeter(() => Date.now(), () => ({ dailyUsd: 5, monthlyUsd: 5, timeZone: "Mars/Olympus" }));
    expect(() => meter.reserve("x", 1)).toThrow();
  });

  it("the approved zone is the one the human declared", () => {
    expect(getCaps("pulsern").ianaTimeZone, "client zero's accounting zone changed").toBe("America/New_York");
  });
});

describe("money — the injected clock cannot mint fresh ceilings (R7-03)", () => {
  /** The cap is keyed by a caller-supplied assertion about time. Moving the
   * clock backwards re-enters a closed day that still has headroom.
   *
   * MUTATION: drop #assertForward, or make it compare with > instead of <. */
  it("a clock moving backwards into a closed day is refused", () => {
    let now = Date.parse("2026-08-17T16:00:00Z");
    const m = new MemorySpendMeter(() => now, pulsern);
    m.settle(m.reserve("pulsern", 10));
    now = Date.parse("2026-08-16T16:00:00Z");
    expect(() => m.reserve("pulsern", 10), "an older day was re-entered").toThrow(/backwards/);
    // Returning to the day it was on is fine; only going back is refused.
    now = Date.parse("2026-08-17T18:00:00Z");
    expect(() => m.reserve("pulsern", 1)).toThrow(CapError); // spent, not corrupt
  });

  /** MUTATION: drop the Number.isFinite check from zoneDayKey. */
  it("a non-finite instant refuses spend rather than throwing somewhere else", () => {
    expect(() => zoneDayKey(Number.NaN, "UTC")).toThrow(MeterUnavailableError);
    expect(() => zoneDayKey(Number.POSITIVE_INFINITY, "UTC")).toThrow(/non-finite/);
    const m = new MemorySpendMeter(() => Number.NaN, pulsern);
    expect(() => m.reserve("pulsern", 1)).toThrow(MeterUnavailableError);
  });

  it("the high-water mark is per client — one client's clock is not another's", () => {
    let now = Date.parse("2026-08-17T16:00:00Z");
    const m = new MemorySpendMeter(() => now, capsOf(10, 10));
    m.settle(m.reserve("a", 1));
    now = Date.parse("2026-08-16T16:00:00Z");
    // "b" has never been seen, so it has no closed day to re-enter.
    expect(() => m.reserve("b", 1)).not.toThrow();
  });
});

describe("money — ceilings are the meter's, never the caller's (R7-06)", () => {
  /** `reserve()` took its ceilings as arguments, so a direct caller could hand
   * itself $1,000/$1,000 for a real client; and `record()` wrote committed day
   * and month values with no cap lookup at all — an unrestricted money-write
   * primitive on the interface this file told the Phase 5/6 path to adopt
   * unchanged. "No caller does that today" is not a safety property.
   *
   * MUTATION: restore the ceilings parameter on reserve, or re-add record(). */
  it("a caller cannot widen its own ceiling, and record() does not exist", () => {
    const meter = new MemorySpendMeter(() => Date.parse("2026-08-17T16:00:00Z"), pulsern);
    expect(typeof (meter as unknown as Record<string, unknown>)["record"], "record() is back").toBe("undefined");
    // A ceilings argument is ignored, not honoured: the $10/day ceiling holds.
    const widen = meter.reserve.bind(meter) as unknown as (c: string, a: number, caps?: unknown) => unknown;
    const forged = { dailyUsd: 1000, monthlyUsd: 1000 };
    widen("pulsern", 10, forged);
    expect(() => widen("pulsern", 1, forged), "a caller widened its own ceiling").toThrow(CapError);
  });

  /** MUTATION: drop the resolver requirement from the constructor. */
  it("a meter cannot be built without a caps resolver", () => {
    const build = MemorySpendMeter as unknown as new (...a: unknown[]) => MemorySpendMeter;
    expect(() => new build(() => 0)).toThrow(MeterUnavailableError);
    expect(() => new build(() => 0, "not a function")).toThrow(/caps resolver/);
  });
});
