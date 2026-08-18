import { describe, expect, it } from "vitest";
import { CapError, effectiveAiCapsUsd, getCaps } from "@fullburn/config/caps";
import {
  FrozenCapsSpendMeter,
  MemorySpendMeter,
  MeterUnavailableError,
  type SpendReservation,
  isFrozenCapsMeter,
  zoneDayKey,
  zoneMonthKey,
} from "../src/spend-meter.ts";
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

  /** THE MONTH KEY, ON ITS OWN. R7-02 was locked at day granularity only: a
   * revert of `zoneMonthKey` alone to UTC survived the whole suite, because
   * every test drove a day boundary and nothing drove a client-local month
   * boundary (adversary finding R8-03). The month is the ceiling `caps.ts`
   * calls "the real exposure ceiling" — $200 against $10 — so the untested half
   * was the half that matters.
   *
   * Four hours early for New York; up to fourteen for a UTC+14 client.
   *
   * MUTATION: `zoneMonthKey` → `new Date(nowMs).toISOString().slice(0, 7)`. */
  it("a $200 New York month is not reopened by UTC's month boundary", () => {
    // 20:30 ET on Aug 31 — already September in UTC, still August in New York.
    let now = Date.parse("2026-08-16T16:00:00Z");
    const m = new MemorySpendMeter(() => now, pulsern);
    // Exhaust the month across twenty local days, staying under $10 each.
    for (let d = 0; d < 20; d++) {
      now = Date.parse(`2026-08-${String(d + 1).padStart(2, "0")}T16:00:00Z`);
      m.settle(m.reserve("pulsern", 10));
    }
    expect(m.monthUsd("pulsern")).toBeCloseTo(200, 6);

    now = Date.parse("2026-09-01T00:30:00Z"); // 20:30 ET, Aug 31 in New York
    expect(zoneMonthKey(now, "America/New_York")).toBe("2026-08");
    expect(() => m.reserve("pulsern", 1), "UTC's month boundary opened a fresh $200").toThrow(CapError);
  });

  /** The other half, or a meter that simply never rolls the month would pass
   * the test above. The month must roll on the CLIENT's own boundary. */
  it("the monthly ceiling does roll over at the client's month boundary", () => {
    let now = Date.parse("2026-08-16T16:00:00Z");
    const m = new MemorySpendMeter(() => now, pulsern);
    for (let d = 0; d < 20; d++) {
      now = Date.parse(`2026-08-${String(d + 1).padStart(2, "0")}T16:00:00Z`);
      m.settle(m.reserve("pulsern", 10));
    }
    now = Date.parse("2026-09-01T05:00:00Z"); // 01:00 ET on Sep 1
    expect(zoneMonthKey(now, "America/New_York")).toBe("2026-09");
    expect(() => m.reserve("pulsern", 1)).not.toThrow();
  });

  /** A month boundary in a zone whose offset changed mid-month, and a zone far
   * enough east that UTC and local disagree for most of a day. */
  it("the month key survives a DST change inside the month, and extreme zones", () => {
    // US DST ends Nov 1 2026. A Nov 30 evening is still November locally.
    expect(zoneMonthKey(Date.parse("2026-12-01T04:00:00Z"), "America/New_York")).toBe("2026-11");
    // …and March's transition, in the other direction.
    expect(zoneMonthKey(Date.parse("2026-04-01T03:00:00Z"), "America/New_York")).toBe("2026-03");
    // UTC+14: local is already the next month while UTC is not.
    expect(zoneMonthKey(Date.parse("2026-08-31T11:00:00Z"), "Pacific/Kiritimati")).toBe("2026-09");
    // …and a half-hour offset, because whole hours are an assumption.
    expect(zoneMonthKey(Date.parse("2026-08-31T18:15:00Z"), "Asia/Kolkata")).toBe("2026-08");
    expect(zoneMonthKey(Date.parse("2026-08-31T18:45:00Z"), "Asia/Kolkata")).toBe("2026-09");
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

  /** THE ADVANCING HALF. Deleting `|| day > seen` — so the mark pins only the
   * FIRST day the meter ever saw — survived the whole suite, because the lock
   * proved only the two-day case that starts at the mark (adversary finding
   * R8-08). With that revert a clock may move backwards into any day after the
   * first. Harmless in the in-memory meter, where every past day is still in
   * the map; L14 and L21 both say the meter becomes Durable-Object-backed and
   * day-keyed, where an evicted day IS a fresh ceiling.
   *
   * MUTATION: `if (seen === undefined || day > seen)` → `if (seen === undefined)`. */
  it("the mark advances with the clock — not just on the first day ever seen", () => {
    let now = Date.parse("2026-08-10T16:00:00Z");
    const m = new MemorySpendMeter(() => now, pulsern);
    m.settle(m.reserve("pulsern", 1)); // first day seen: Aug 10

    now = Date.parse("2026-08-20T16:00:00Z");
    m.settle(m.reserve("pulsern", 1)); // the mark must move to Aug 20

    // Aug 15 is after the first day ever seen and before the current one. A
    // mark that never advanced would accept it.
    now = Date.parse("2026-08-15T16:00:00Z");
    expect(() => m.reserve("pulsern", 1), "a closed day after the first was re-entered").toThrow(/backwards/);
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

describe("money — llm() takes its ceiling from the frozen table, by construction (R8-01)", () => {
  /** R7-06 removed the ceilings ARGUMENT from `reserve()`. That moved the seam
   * instead of closing it: the ceilings became the meter's, the meter became
   * `deps.meter`, and `llm()` accepted whatever resolver it was handed while
   * discarding the value it computed from the frozen table itself. Five
   * thousand calls committed $50 against a frozen $20/month with no CapError,
   * and deleting the surviving `effectiveAiCapsUsd()` call left all 277 tests
   * green (adversary finding R8-01).
   *
   * Human ruling: close it structurally. So this is the attack, run through
   * the real `llm()`.
   *
   * MUTATION: drop the `isFrozenCapsMeter` guard from llm(). */
  it("a meter built with a wide resolver cannot spend through llm() at all", async () => {
    const { makeDeps: mk, TEST_CLIENT: C } = await import("./helpers.ts");
    const { llm } = await import("../src/gateway.ts");
    const { TraceContext } = await import("../src/tracing.ts");
    const { ROLE_BINDINGS } = await import("@fullburn/config/models");
    const { deps } = mk();
    const frozen = getCaps(C).monthlyAiSpendUsd;

    const wide = new MemorySpendMeter(() => Date.parse("2026-08-17T16:00:00Z"), () => ({
      dailyUsd: 100_000,
      monthlyUsd: 100_000,
      timeZone: "UTC",
    }));
    let dispatched = 0;
    const transport = {
      async post() {
        dispatched += 1;
        return { greeting: "ok" };
      },
    };
    for (let i = 0; i < 50; i++) {
      await llm({ ...deps, meter: wide, transport, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: C,
        input: {},
        trace: new TraceContext(`wide-${i}`, C),
      }).catch(() => undefined);
    }
    expect(dispatched, "a caller-chosen ceiling reached the transport").toBe(0);
    expect(wide.monthUsd(C), "spend landed against a ceiling nobody approved").toBe(0);
    expect(frozen).toBeLessThan(100_000); // the attack was worth running
  });

  /** The brand cannot be forged, and it cannot be inherited. A subclass would
   * carry it and could override `reserve()` — the injection point in a hat.
   *
   * MUTATION: drop the `new.target` finality check, or the WeakSet membership
   * test in isFrozenCapsMeter. */
  it("the frozen-caps brand cannot be forged, subclassed, or patched on", () => {
    const genuine = new FrozenCapsSpendMeter();
    expect(isFrozenCapsMeter(genuine)).toBe(true);

    // A plain meter with a wide resolver — the R8-01 attack object.
    expect(isFrozenCapsMeter(new MemorySpendMeter(() => Date.now(), capsOf(1e9, 1e9)))).toBe(false);
    // A literal wearing the shape.
    expect(isFrozenCapsMeter({ reserve() {}, settle() {}, release() {}, todayUsd: () => 0 })).toBe(false);
    // The prototype without the constructor — this is what defeats a bare
    // `instanceof` check, and it has defeated one in this repo before (R5-01).
    expect(isFrozenCapsMeter(Object.create(FrozenCapsSpendMeter.prototype))).toBe(false);
    expect(isFrozenCapsMeter(null)).toBe(false);
    expect(isFrozenCapsMeter(undefined)).toBe(false);

    // A subclass is refused at construction, so it never gets a brand to carry.
    const Sub = class extends FrozenCapsSpendMeter {};
    expect(() => new Sub(), "a subclass could override reserve()").toThrow(MeterUnavailableError);

    // And a genuine instance whose reserve() was redefined is no longer proof:
    // the brand is on the object, but the ceiling-reading method is not ours.
    const patched = new FrozenCapsSpendMeter();
    Object.defineProperty(patched, "reserve", { value: () => ({}) as never });
    expect(isFrozenCapsMeter(patched), "a repointed reserve() kept its brand").toBe(false);
  });

  /** A CONSEQUENCE OF THE R8-01 FIX, caught by the harness rather than by a
   * review: the brand check runs before `requireReservingMeter`, and every
   * branded meter inherits all four methods — so nothing reaching that function
   * can fail it, and dropping the `reservedUsd` requirement left the suite
   * green where it had been caught since R5-07. The tests that used to reach it
   * passed hand-built meter objects, which the brand now refuses one line
   * earlier.
   *
   * The contract is real for any future implementation, so it is driven
   * directly. It is NOT a live guard on the llm() path, and ledger L28 says so.
   *
   * MUTATION: drop any of the four method checks from requireReservingMeter. */
  it("the reserving-meter contract refuses a meter missing any money method", async () => {
    const { requireReservingMeter } = await import("../src/gateway.ts");
    const whole = {
      todayUsd: () => 0,
      reservedUsd: () => 0,
      reserve: () => ({}) as never,
      settle: () => {},
      release: () => {},
    };
    expect(() => requireReservingMeter(whole)).not.toThrow();
    for (const missing of ["reserve", "settle", "release", "reservedUsd"] as const) {
      const partial = { ...whole, [missing]: undefined } as unknown as Parameters<typeof requireReservingMeter>[0];
      expect(() => requireReservingMeter(partial), `a meter with no ${missing}() was accepted`).toThrow(
        MeterUnavailableError,
      );
    }
  });

  /** THE CLOCK IS NOT A CALLER'S TO CHOOSE EITHER (R9-05).
   *
   * R8-01 closed the ceilings seam and left the clock one open beside it. The
   * cap is keyed by (client, local day) and (client, local month), so whoever
   * chooses the clock chooses how many ceilings exist: executed through the
   * real `llm()`, 12,000 dispatches committed $120 against a frozen $20/month
   * with no `CapError`.
   *
   * Human ruling: bind it by construction, not with a bounded-jump check.
   *
   * MUTATION: restore the `now` parameter on FrozenCapsSpendMeter. */
  it("a caller cannot hand the production meter a clock", async () => {
    const { makeDeps: mk, TEST_CLIENT: C } = await import("./helpers.ts");
    const { llm } = await import("../src/gateway.ts");
    const { TraceContext } = await import("../src/tracing.ts");
    const { ROLE_BINDINGS } = await import("@fullburn/config/models");

    // The constructor takes ONE argument, and it is the narrowing table.
    expect(FrozenCapsSpendMeter.length, "the production meter grew a second parameter").toBe(1);
    // A clock passed positionally is read as a narrowing table, which cannot
    // widen anything — so even the attempt buys nothing.
    const smuggled = new FrozenCapsSpendMeter((() => Date.parse("2030-01-01T00:00:00Z")) as never);
    const frozenMonth = getCaps("fixture-testco").monthlyAiSpendUsd;
    let committed = 0;
    for (let i = 0; i < 400; i++) {
      try {
        smuggled.settle(smuggled.reserve("fixture-testco", 0.25));
        committed += 0.25;
      } catch {
        break;
      }
    }
    expect(committed, "a smuggled clock minted fresh months").toBeLessThanOrEqual(frozenMonth);

    // And the same attack through the real llm(): a meter whose clock the
    // caller chose is not a meter llm() will accept at all.
    const withClock = new MemorySpendMeter(() => Date.parse("2030-01-01T00:00:00Z"), () => effectiveAiCapsUsd(C));
    const { deps } = mk();
    let dispatched = 0;
    const transport = {
      async post() {
        dispatched += 1;
        return { greeting: "ok" };
      },
    };
    for (let i = 0; i < 20; i++) {
      await llm({ ...deps, meter: withClock, transport, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: C,
        input: {},
        trace: new TraceContext(`clock-${i}`, C),
      }).catch(() => undefined);
    }
    expect(dispatched, "a caller-clocked meter reached the transport").toBe(0);
  });

  /** The narrowing table is the ONLY thing a caller may supply, and `caps.ts`
   * proves it can lower a ceiling and never raise one.
   *
   * MUTATION: pass the narrowing table as a full resolver instead. */
  it("the only caller input is a table that can narrow and never widen", () => {
    const frozenDay = getCaps("fixture-testco").dailyAiSpendUsd;

    const widened = new FrozenCapsSpendMeter({ "fixture-testco": { dailyAiSpendUsd: 1e9 } });
    widened.settle(widened.reserve("fixture-testco", frozenDay));
    expect(() => widened.reserve("fixture-testco", 0.01), "a table widened the frozen day").toThrow(CapError);

    const narrowed = new FrozenCapsSpendMeter({ "fixture-testco": { dailyAiSpendUsd: 0.05 } });
    narrowed.settle(narrowed.reserve("fixture-testco", 0.05));
    expect(() => narrowed.reserve("fixture-testco", 0.01), "the narrowing was ignored").toThrow(CapError);

    // An unsigned client cannot be handed a sign-off by the table either.
    const unsigned = new FrozenCapsSpendMeter({ "fixture-unsigned": { dailyAiSpendUsd: 1 } });
    expect(() => unsigned.reserve("fixture-unsigned", 0.01)).toThrow(/human sign-off/);
  });
});

describe("money — settle() commits the reservation and nothing else (R7-05 as ruled, R8-02)", () => {
  /** R7-05's fix added `settle(reservation, actualUsd)` so the provider's real
   * charge could be committed. It was `record()` with a handle: an unrestricted
   * money-write with no cap check and no bound in either direction, on the
   * interface the Phase 5/6 ad-spend path is told to adopt unchanged — and it
   * had zero production callers, so it bought nothing for it (R8-02).
   *
   * The human's reconciliation ruling is unchanged: the committed figure is an
   * ESTIMATE, trued up daily against the provider's usage receipt, and L26 says
   * so. The correction now goes through the same cap-checked path as every
   * other money mutation.
   *
   * MUTATION: restore the `actualUsd` parameter and the `toMicros` branch. */
  it("there is no second argument that can write an arbitrary committed value", () => {
    const m = new MemorySpendMeter(() => Date.parse("2026-08-17T16:00:00Z"), pulsern);
    const overreach = m.settle.bind(m) as unknown as (r: SpendReservation, actual?: number) => void;

    // $5,000 against a $10/day ceiling, through a handle the meter itself
    // minted. This is the exact call that succeeded before R8-02.
    overreach(m.reserve("pulsern", 0.01), 5000);
    expect(m.todayUsd("pulsern"), "an arbitrary figure was written to the ledger").toBeCloseTo(0.01, 6);

    // The other direction is the dangerous one: departed, billable calls that
    // the ledger reports as free.
    for (let i = 0; i < 50; i++) overreach(m.reserve("pulsern", 0.01), 0);
    expect(m.todayUsd("pulsern"), "billable calls were settled at zero").toBeCloseTo(0.51, 6);

    // And the signature itself carries the rule, so a future caller cannot be
    // invited to pass one by the type.
    expect(m.settle.length, "settle grew a parameter again").toBe(1);
  });

  /** The ceiling must actually bind through settle — the estimate is committed,
   * so spend accumulates and the cap engages.
   *
   * MUTATION: commit 0 instead of open.micros. */
  it("what settle commits is the reserved amount, and it consumes the ceiling", () => {
    const m = new MemorySpendMeter(() => Date.parse("2026-08-17T16:00:00Z"), pulsern);
    m.settle(m.reserve("pulsern", 9.5));
    expect(m.todayUsd("pulsern")).toBeCloseTo(9.5, 6);
    expect(() => m.reserve("pulsern", 0.6), "the committed estimate did not bind").toThrow(CapError);
  });

  /** The disclosure is load-bearing (Law 10): the ledger must SAY the live
   * number is an estimate trued up daily, or the reconciliation is folklore.
   *
   * MUTATION: delete L26 from the ledger. */
  it("the ledger records that the live figure is an estimate", async () => {
    const { readFileSync } = await import("node:fs");
    const ledger = readFileSync(new URL("../../reports/LIVE_VERIFICATION_LEDGER.md", import.meta.url), "utf8");
    const l26 = /\|\s*L26\s*\|[\s\S]*?\n\|/.exec(ledger)?.[0] ?? "";
    expect(l26, "L26 is missing from the ledger").not.toBe("");
    expect(l26.toLowerCase(), "L26 no longer calls the metered figure an estimate").toContain("estimate");
    expect(l26.toLowerCase(), "L26 no longer promises daily reconciliation").toContain("reconcil");
  });
});

describe("control plane — an approval cannot be minted by the agent it restrains (R7-07)", () => {
  /** The gate verified the bytes and never the author, so the same agent
   * changing caps could add a conforming approval file and satisfy the rule
   * forbidding it. This is the in-repo half only: a committer name is
   * self-asserted, so it raises the cost without proving a human. Ledger L27
   * records that every approval predating branch protection is unverified.
   *
   * MUTATION: drop the authorship check, or empty AUTOMATION_AUTHORS. */
  it("an approval committed by the automation principal is refused", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { checkClass2Approvals, checkApprovalAuthorship } = await import("../scripts/gate-lib.mjs");
    const capsPath = "fullburn/config/src/caps.ts";
    const doc = (authoredBy: string) => ({
      path: "fullburn/APPROVALS/x.md",
      status: "added",
      authoredBy,
      content: `approves: ${capsPath}\nbase-commit: b\nfrom-content-hash: old\ncontent-hash: new`,
    });
    const args = {
      changedFiles: [{ status: "modified", path: capsPath }],
      hashOf: () => "new",
      baseHashOf: () => "old",
      baseCommit: "b",
    };
    for (const who of ["Claude <noreply@anthropic.com>", "github-actions[bot] <bot@github.com>", "Claude Opus 5 <x@y.z>"]) {
      const res = checkClass2Approvals({ ...args, approvalDocs: [doc(who)] });
      expect(res.ok, `${who} minted its own approval`).toBe(false);
      expect(res.reason).toMatch(/automation principal/);
    }
    // A human-authored one is honoured.
    expect(checkClass2Approvals({ ...args, approvalDocs: [doc("A Human <a@example.com>")] }).ok).toBe(true);
    // …and an approval with no recorded author is not refused on that ground
    // alone — the gate has nothing to judge, which L27 is the record of.
    expect(checkApprovalAuthorship([{ path: "p", content: "" }]).ok).toBe(true);
  });

  /** EVERY Class-2 FILE, ENUMERATED — not six hard-coded strings.
   *
   * The previous version of this test asserted six paths appeared in the file
   * and was titled "covers the approval mechanism and everything it protects".
   * It covered 38 of 97 tracked Class-2 files. The unowned remainder was
   * `package.json` (redefined `npm test` into a no-op, R2-04),
   * `package-lock.json` ("the only executable thing left in the Class-1
   * surface", N-11), every `vitest.*` name (one silenced 165 of 168 tests with
   * every gate green, N-02), `PHASE` (decides whether the H20 expiry fires) and
   * every test file — the exact paths this project's own history records as
   * lethal (adversary finding R8-04). That is the `CLASS2_FILES` mistake H-03
   * already found once, in a new file.
   *
   * `isClass2` is the authority, so `isClass2` is what this drives.
   *
   * MUTATION: delete any rule from CODEOWNERS, or delete the file. */
  it("every tracked Class-2 file has a CODEOWNER", async () => {
    const { readFileSync } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { isClass2, codeownersCovers } = await import("../scripts/gate-lib.mjs");
    const repoRoot = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
    const owners = readFileSync(`${repoRoot}/.github/CODEOWNERS`, "utf8");

    const tracked = execFileSync("git", ["-C", repoRoot, "ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter((p) => p.length > 0);
    const class2 = tracked.filter((p: string) => isClass2(p));
    expect(class2.length, "isClass2 matched nothing — this test would pass vacuously").toBeGreaterThan(50);

    const unowned = class2.filter((p: string) => !codeownersCovers(p, owners));
    expect(unowned, `Class-2 files with no CODEOWNER:\n  ${unowned.join("\n  ")}`).toEqual([]);

    // …and the same file with every owner stripped must cover NOTHING. Without
    // this the enumeration passes on a CODEOWNERS that GitHub reads as empty.
    const ownerless = owners.replace(/@[\w.-]+(?:\/[\w.-]+)?/g, "");
    const stillOwned = class2.filter((p: string) => codeownersCovers(p, ownerless));
    expect(stillOwned, "an owner-stripped CODEOWNERS still reported coverage").toEqual([]);
  });

  /** The acceptance bar must be a STAGE, and it must be able to fail.
   *
   * `npm run mutate` is how this project enforces "a fix whose one-line revert
   * leaves the suite green is not protected by anything" — and it appeared in
   * package.json and in no CI job, and exited 0 whatever it found (adversary
   * finding R8-09). A bar nothing runs and that cannot fail is a ritual.
   *
   * MUTATION: remove the mutation-harness job, or the process.exit(1). */
  it("the mutation harness runs in CI and exits non-zero on a survivor", async () => {
    const { readFileSync } = await import("node:fs");
    const wf = readFileSync(new URL("../../../.github/workflows/fullburn-ci.yml", import.meta.url), "utf8");
    expect(wf, "the mutation harness is not a CI stage").toMatch(/run:\s*npm run mutate/);
    // Driven, not grepped: a regex over the harness source matched the
    // harness's own mutation ENTRY as readily as the guard, so the first
    // version of this test passed with the guard reverted.
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { harnessVerdict } = await import("../scripts/mutate-lib.mjs");
    expect(harnessVerdict(0, 0).ok, "a clean run should pass").toBe(true);
    expect(harnessVerdict(1, 0).ok, "an unprotected fix did not fail the build").toBe(false);
    expect(harnessVerdict(0, 1).ok, "a stale entry did not fail the build").toBe(false);
    expect(harnessVerdict(1, 0).reason).toMatch(/unprotected/);
    const harness = readFileSync(new URL("../scripts/mutate.mjs", import.meta.url), "utf8");
    expect(harness, "the verdict does not reach an exit code").toMatch(/process\.exit\(1\)/);
    // Imported from the RUNNER-FREE module: importing mutate.mjs for a helper is
    // what turned this very test into a nested mutation pass once.
    expect(harness, "the harness no longer delegates its verdict").toMatch(/from "\.\/mutate-lib\.mjs"/);

    /** THE SELF-REFERENCE RULE. An entry targeting the harness contains its own
     * target as a string, and `String.replace` takes the FIRST occurrence — the
     * entry, not the code. Three entries reported a survivor for that reason in
     * one session, each time because a guard had never actually been reverted:
     * the harness was lying about its own coverage, in the direction that reads
     * as safety.
     *
     * MUTATION: drop `searchFrom`, or apply with `original.replace(from, to)`. */
    /** DRIVEN, NOT GREPPED. The first version of this asserted
     * `toMatch(/searchFrom\(path\)/)` — and after the guard was reverted that
     * text was still in the file, inside the mutation table, as the string
     * literal of the very entry that reverts it. The grep matched the data and
     * the lock reported green with the fix removed (adversary finding R9-02):
     * the third time this repo has made exactly that mistake, in the check
     * written to prevent it.
     *
     * `applyEntry` is pure and takes `isSelf`/`tableEnd` as parameters for this
     * reason: a test can construct the case where the target appears BOTH in
     * the table and in the code, and assert which one is chosen. A table entry
     * cannot satisfy that.
     *
     * MUTATION: drop `searchFrom`/`isSelf` from applyEntry. */
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { applyEntry, tableEndOf } = await import("../scripts/mutate-lib.mjs");
    const TARGET = "if (guard) {";
    const fake = [
      "const MUTATIONS = [",
      `  ["some entry", "mutate.mjs", "${TARGET}", "if (false) {"],`,
      "];",
      "",
      `${TARGET} // the real code`,
    ].join("\n");
    const tableEnd = tableEndOf(fake);

    const self = applyEntry(fake, TARGET, "if (false) {", { isSelf: true, tableEnd });
    expect(self.at, "a self-targeting entry selected the table row, not the code").toBeGreaterThan(tableEnd);
    expect(self.next, "the table row was rewritten instead of the code").toContain(`"${TARGET}"`);
    expect(self.next.split("\n").pop(), "the real code was not mutated").toContain("if (false) {");

    // …and without the self flag it takes the first occurrence, which is the
    // table — that is the defect, reproduced here so the difference is visible.
    const naive = applyEntry(fake, TARGET, "if (false) {", { isSelf: false, tableEnd });
    expect(naive.at, "the naive path should hit the table first").toBeLessThan(tableEnd);

    // An unfindable table fails closed rather than guessing zero, which would
    // silently restore the defect.
    expect(() => tableEndOf("no table here")).toThrow(/fail closed/);
  });

  /** A CLASS-2 FILE THE OWNER CANNOT READ IS NOT UNDER REVIEW.
   *
   * `hardening.test.ts` carried three raw NUL bytes as test fixtures, so git
   * classified it as binary and rendered every change to it as "Binary files …
   * differ" — in the diff, in the PR, everywhere. CODEOWNERS can require the
   * human's review of a file whose contents they cannot see, which makes the
   * approval a signature on bytes nobody read (adversary finding R9-10). The
   * fixtures are now `\u0000` escapes: identical to the compiler, text to git.
   *
   * MUTATION: put a raw NUL back into any Class-2 file. */
  it("no tracked Class-2 file is binary to git", async () => {
    const { readFileSync } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { isClass2 } = await import("../scripts/gate-lib.mjs");
    const repoRoot = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
    const tracked = execFileSync("git", ["-C", repoRoot, "ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter((p) => p.length > 0);
    const class2 = tracked.filter((p: string) => isClass2(p));
    expect(class2.length, "isClass2 matched nothing — this test would pass vacuously").toBeGreaterThan(50);

    // A NUL in the first 8000 bytes is exactly what makes git call a file
    // binary, so that is what this looks for.
    const binary = class2.filter((p: string) => {
      try {
        return readFileSync(`${repoRoot}/${p}`).subarray(0, 8000).includes(0);
      } catch {
        return false;
      }
    });
    expect(binary, `Class-2 files git renders as binary, so a reviewer cannot read the diff:\n  ${binary.join("\n  ")}`).toEqual([]);
  });

  /** THE META-CHECK IS WHAT EVERY OTHER NUMBER RESTS ON, AND NOTHING ENFORCED IT.
   *
   * Deleting it whole left 292/292 green, typecheck and leak-check clean, and
   * no mutation entry named it (adversary finding R10-01). The standing rule
   * says every harness result is void without a passing meta-check; the rule
   * was prose.
   *
   * Driven, not grepped: the canary DEFINITIONS are exported and this asserts
   * what they are — a negative canary whose edit changes no behaviour, and a
   * positive canary whose target is a real guard — plus that the runner refuses
   * to report a number when either disagrees.
   *
   * MUTATION: delete a canary, invert an expectation, or drop the exit. */
  it("the harness cannot report a number without proving it can report both answers", async () => {
    const { readFileSync } = await import("node:fs");
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { META_CANARIES, metaCheckVerdict } = await import("../scripts/mutate-lib.mjs");

    // Both directions must be represented, or the check is half a check.
    expect(META_CANARIES.map((c: { expect: string }) => c.expect).sort()).toEqual(["CAUGHT", "SURVIVED"]);

    const negative = META_CANARIES.find((c: { expect: string }) => c.expect === "SURVIVED");
    const positive = META_CANARIES.find((c: { expect: string }) => c.expect === "CAUGHT");

    // The negative canary must genuinely change no behaviour — a comment. If it
    // ever became a real edit, it would be caught, the meta-check would fail,
    // and the harness would be unusable rather than wrong; but if it became a
    // no-op that the suite happens to fail on, R9-01 returns undetected.
    expect(negative.to.startsWith(negative.from), "the negative canary rewrites code rather than appending").toBe(true);
    expect(negative.to.slice(negative.from.length).trim(), "the negative canary is not a comment").toMatch(/^\/\//);

    // Both targets must still exist, or the meta-check is stale and the run is
    // void — which the runner reports rather than silently skipping.
    for (const c of [negative, positive]) {
      const src = readFileSync(new URL(`../../${c.file}`, import.meta.url), "utf8");
      expect(src.includes(c.from), `the ${c.expect} canary's target text is gone: ${c.file}`).toBe(true);
    }

    // And the verdict function refuses every disagreement.
    expect(metaCheckVerdict([{ name: "n", expect: "SURVIVED", got: "SURVIVED" }, { name: "p", expect: "CAUGHT", got: "CAUGHT" }]).ok).toBe(true);
    expect(metaCheckVerdict([{ name: "n", expect: "SURVIVED", got: "CAUGHT" }]).ok, "a red suite passed the meta-check").toBe(false);
    expect(metaCheckVerdict([{ name: "p", expect: "CAUGHT", got: "SURVIVED" }]).ok, "a blind harness passed the meta-check").toBe(false);
    expect(metaCheckVerdict([]).ok, "an empty meta-check passed").toBe(false);
    expect(metaCheckVerdict([{ name: "n", expect: "SURVIVED", got: "CAUGHT" }]).reason).toMatch(/VOID/);

    // The runner must actually consult it and stop.
    const harness = readFileSync(new URL("../scripts/mutate.mjs", import.meta.url), "utf8");
    const runner = harness.slice(harness.search(/^if \(process\.argv\[1\]/m));
    expect(runner, "the runner no longer runs the meta-check").toMatch(/metaCheckVerdict\(/);
    expect(runner, "a failed meta-check no longer stops the run").toMatch(/process\.exit\(1\)/);
  });

  /** The matcher itself, driven directly — a matcher that returned true for
   * everything would make the test above pass vacuously, and it is the kind of
   * helper that gets "simplified" later. */
  it("the CODEOWNERS matcher distinguishes covered from uncovered", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { codeownersCovers } = await import("../scripts/gate-lib.mjs");
    const rules = "/fullburn/engine/src/ @o\n/fullburn/PHASE @o\npackage.json @o\nvitest* @o\ne2e/ @o\n";
    expect(codeownersCovers("fullburn/engine/src/gateway.ts", rules)).toBe(true);
    expect(codeownersCovers("fullburn/PHASE", rules)).toBe(true);
    expect(codeownersCovers("fullburn/config/package.json", rules)).toBe(true);
    expect(codeownersCovers("fullburn/vitest.config.ts", rules)).toBe(true);
    expect(codeownersCovers("fullburn/engine/test/e2e/smoke.spec.ts", rules)).toBe(true);
    // …and the negative half, which is what makes the positives mean anything.
    expect(codeownersCovers("fullburn/engine/test/x.test.ts", rules)).toBe(false);
    expect(codeownersCovers("fullburn/README.md", rules)).toBe(false);
    expect(codeownersCovers("fullburn/PHASE.bak", rules)).toBe(false);
    // A rule inside a comment is not a rule.
    expect(codeownersCovers("fullburn/README.md", "# fullburn/README.md @o\n")).toBe(false);

    /** A RULE WITH NO OWNER OWNS NOTHING. Stripping every `@ssb22inc` from the
     * real file left the enumeration reporting 0 unowned of 98 Class-2 paths,
     * while GitHub considered nobody the owner of anything — the lock validated
     * patterns and never owners (adversary finding R9-04).
     *
     * MUTATION: drop the owner parse, or return `true` from it. */
    expect(codeownersCovers("fullburn/PHASE", "/fullburn/PHASE\n"), "a rule with no owner covered a path").toBe(false);
    expect(codeownersCovers("fullburn/PHASE", "/fullburn/PHASE   \n")).toBe(false);
    // …and a token that is not an owner is not an owner.
    expect(codeownersCovers("fullburn/PHASE", "/fullburn/PHASE notanowner\n")).toBe(false);
    expect(codeownersCovers("fullburn/PHASE", "/fullburn/PHASE @team/reviewers\n")).toBe(true);
    expect(codeownersCovers("fullburn/PHASE", "/fullburn/PHASE a@b.co\n")).toBe(true);

    /** LAST MATCH WINS, which is GitHub's rule — so a later ownerless rule
     * REVOKES an earlier owned one, and a lock that ORs every match would miss
     * exactly that revocation. */
    expect(
      codeownersCovers("fullburn/engine/src/gateway.ts", "/fullburn/engine/src/ @o\n/fullburn/engine/src/gateway.ts\n"),
      "a later ownerless rule did not revoke an earlier owner",
    ).toBe(false);
    expect(
      codeownersCovers("fullburn/engine/src/gateway.ts", "/fullburn/engine/src/gateway.ts\n/fullburn/engine/src/ @o\n"),
    ).toBe(true);
  });

  /** THE GATE MUST RUN WHEN CODEOWNERS CHANGES. `.github/**` is a Class-2
   * pattern, but the workflow's own `paths:` filter listed only `fullburn/**`
   * and the workflow file itself — so a PR touching only `.github/CODEOWNERS`
   * triggered no workflow, ran no gate, and never executed the test above. The
   * artifact created to make "human-only" real could be deleted by a diff that
   * ran nothing (adversary finding R8-04b).
   *
   * MUTATION: narrow the workflow's `paths:` filters back to fullburn/**. */
  it("CI runs on every Class-2 path, so no Class-2 diff can arrive ungated", async () => {
    const { readFileSync } = await import("node:fs");
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { isClass2, workflowPathFilters, globsAdmit } = await import("../scripts/gate-lib.mjs");
    const wf = readFileSync(new URL("../../../.github/workflows/fullburn-ci.yml", import.meta.url), "utf8");
    const filters = workflowPathFilters(wf);
    expect(filters.length, "no paths: filter found — this check is stale").toBeGreaterThan(0);

    const WITNESSES = [".github/CODEOWNERS", ".github/workflows/fullburn-ci.yml", "fullburn/config/src/caps.ts", "fullburn/PHASE"];
    for (const f of filters) {
      // UNREADABLE IS REFUSED, not assumed permissive.
      expect(f.globs, "a paths: filter this parser cannot read").not.toBe(null);
      for (const witness of WITNESSES) {
        expect(isClass2(witness), `${witness} is not Class-2 — the witness is stale`).toBe(true);
        // `paths-ignore` is the INVERSE: a witness it MATCHES is a witness the
        // workflow refuses to run for. Parsed as if it were `paths`, one line
        // (`paths-ignore: ["**"]`) satisfied this lock while the workflow ran on
        // no pull request at all (adversary finding R10-04).
        const admitted = f.negated ? !globsAdmit(f.globs!, witness) : globsAdmit(f.globs!, witness);
        expect(admitted, `a PR touching ${witness} would run no gate`).toBe(true);
      }
    }
  });

  /** THE PARSER ITSELF, DRIVEN. The previous version of the check above matched
   * only `paths: ["a"]`; the ordinary block-sequence spelling captured empty,
   * became `[]`, and `[]` was read as "no filter, everything runs" — so the
   * identical narrowing filter defeated the lock (adversary finding R9-06).
   *
   * MUTATION: drop the block-sequence branch, or return `[]` for an unreadable
   * filter instead of null. */
  it("the workflow paths parser reads both YAML spellings and refuses what it cannot read", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { workflowPathFilters, globsAdmit } = await import("../scripts/gate-lib.mjs");
    const flow = 'on:\n  pull_request:\n    paths: ["fullburn/**", ".github/**"]\n';
    const block = 'on:\n  pull_request:\n    paths:\n      - "fullburn/**"\n      - ".github/**"\n';
    const narrowed = 'on:\n  pull_request:\n    paths:\n      - "fullburn/**"\n';
    expect(workflowPathFilters(flow)[0]).toEqual({ negated: false, globs: ["fullburn/**", ".github/**"] });
    expect(workflowPathFilters(block)[0], "the block-sequence spelling was not read").toEqual({
      negated: false,
      globs: ["fullburn/**", ".github/**"],
    });

    /** `paths-ignore` IS THE INVERSE, and was read as if it were `paths`. One
     * ordinary line made the lock above pass while the workflow ran on no pull
     * request at all — adversary-gate and class2-gate never executing
     * (adversary finding R10-04).
     *
     * MUTATION: drop the `negated` flag, or set it to false unconditionally. */
    const ignoreAll = 'on:\n  pull_request:\n    paths-ignore:\n      - "**"\n';
    expect(workflowPathFilters(ignoreAll)[0]!.negated, "paths-ignore was read as paths").toBe(true);
    expect(workflowPathFilters(ignoreAll)[0]!.globs).toEqual(["**"]);
    // `**` matches every witness, so as a NEGATED filter it admits none of them.
    expect(globsAdmit(["**"], ".github/CODEOWNERS")).toBe(true);
    // The narrowing that R9-06 used: block spelling, .github/** dropped.
    expect(globsAdmit(workflowPathFilters(narrowed)[0]!.globs!, ".github/CODEOWNERS")).toBe(false);
    // Anything unmodelled is null, never an empty permissive list.
    expect(workflowPathFilters("on:\n  push:\n    paths: *anchor\n")[0]!.globs).toBe(null);
    expect(workflowPathFilters("on:\n  push:\n    paths: [oops\n")[0]!.globs).toBe(null);
    // `**` crosses directories; `*` does not.
    expect(globsAdmit(["fullburn/**"], "fullburn/engine/src/gateway.ts")).toBe(true);
    expect(globsAdmit(["fullburn/*"], "fullburn/engine/src/gateway.ts")).toBe(false);
  });
});

describe("observability — a refusal that was not recorded says so (R7-09)", () => {
  /** `traceFailure` swallowed every sink error while the file claimed every
   * exit is traced. Law 11 calls an untraced decision a bug, so the loss is now
   * surfaced on the error that reaches the caller.
   *
   * MUTATION: restore the bare `catch {}` in traceFailure. */
  it("a failed trace emission is reported on the thrown error", async () => {
    const { makeDeps: mk, TEST_CLIENT: C } = await import("./helpers.ts");
    const { llm } = await import("../src/gateway.ts");
    const { TraceContext } = await import("../src/tracing.ts");
    const { ROLE_BINDINGS } = await import("@fullburn/config/models");
    const { deps, sink } = mk({
      transport: {
        async post() {
          throw new Error("upstream 500");
        },
      },
    });
    sink.setFailing(true);
    const message = await llm({ ...deps, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: C,
      input: {},
      trace: new TraceContext("t-untraced", C),
    }).then(() => "", (e: Error) => e.message);
    expect(message, "an untraced refusal claimed nothing was wrong").toContain("UNTRACED");
  });

  /** MUTATION: emit the mismatched context's traceId instead of a fresh id.
   * One event naming two clients, into a sink keyed by traceId. */
  it("a cross-scoped trace context never lends its identity to another client", async () => {
    const { makeDeps: mk, TEST_CLIENT: C } = await import("./helpers.ts");
    const { llm } = await import("../src/gateway.ts");
    const { TraceContext } = await import("../src/tracing.ts");
    const { ROLE_BINDINGS } = await import("@fullburn/config/models");
    const { deps, sink } = mk();
    await llm({ ...deps, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: C,
      input: {},
      trace: new TraceContext("other-clients-trace", "someone-else"),
    }).catch(() => undefined);
    const emitted = sink.events.map((e) => e.traceId);
    expect(emitted, "the other client's traceId was reused").not.toContain("other-clients-trace");
    expect(emitted.every((id) => id.startsWith("unscoped-")), "the refusal kept a borrowed identity").toBe(true);
    // Two mismatches do not collide with each other.
    await llm({ ...deps, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: C,
      input: {},
      trace: new TraceContext("other-clients-trace", "someone-else"),
    }).catch(() => undefined);
    expect(new Set(sink.events.map((e) => e.traceId)).size, "two refusals shared an event identity").toBe(
      sink.events.length,
    );
  });
});

describe("grade registry — enforcement acts on evidence, not on assertion (R7-10)", () => {
  /** `enforcement([])` froze nothing, and a caller could pass an A for a
   * failing area or hand-build an AreaGrade. The registry did not guarantee
   * that below-A freezes autonomy; it translated an untrusted list.
   *
   * MUTATION: drop the COMPUTED WeakSet check from enforcement. */
  it("a fabricated or empty grade list cannot be enforced", async () => {
    const { computeGrades, enforcement, publishGradeReport, GradeRegistryError, gradeAndEnforce } = await import(
      "../src/grade-registry.ts"
    );
    expect(() => enforcement([]), "an empty list froze nothing, silently").toThrow(GradeRegistryError);
    const fabricated = [{ area: "marketing-engine", grade: "A" as const, failing: [], missing: [] }];
    expect(() => enforcement(fabricated), "a hand-built A was enforced").toThrow(GradeRegistryError);
    expect(() => publishGradeReport(fabricated, 0), "a fabricated report was published").toThrow(GradeRegistryError);

    // The genuine article works, and an empty snapshot freezes every area.
    const real = computeGrades({});

    // THE ATTACK THAT MATTERS: a fabrication of the RIGHT SHAPE. Rejecting the
    // empty list and the one-element list only proves the length check works —
    // a full-length hand-built all-A list is what an improver wanting its
    // autonomy back would actually pass, and only object identity refuses it.
    const forged = real.map((g: { area: string }) => ({ area: g.area, grade: "A" as const, failing: [], missing: [] }));
    expect(forged.length, "the forgery is not the same shape as the genuine article").toBe(real.length);
    expect(() => enforcement(forged), "a full-length fabricated all-A list was enforced").toThrow(GradeRegistryError);
    expect(() => publishGradeReport(forged, 0), "a full-length fabrication was published").toThrow(GradeRegistryError);
    // Nor does copying a genuine result launder it: the array is the evidence.
    expect(() => enforcement([...real]), "a shallow copy passed as the genuine result").toThrow(GradeRegistryError);

    /** THE ATTACK IDENTITY ALONE DOES NOT STOP: mutate the genuine array in
     * place. Same object, same length, every freeze gone — 24 actions became 0
     * and `publishGradeReport` printed all-A (adversary finding R8-05). Identity
     * proved the caller did not BUILD the array; it said nothing about what the
     * caller had since written into it.
     *
     * MUTATION: drop Object.freeze from computeGrades' elements or its array. */
    const before = enforcement(real).length;
    expect(before, "an empty snapshot should freeze every area").toBeGreaterThan(0);
    for (let i = 0; i < real.length; i++) {
      // Frozen: in a module without "use strict" this would fail silently, so
      // the assertion is on the OUTCOME, not on the throw.
      try {
        (real as { -readonly [K in number]: unknown })[i] = {
          area: real[i]!.area,
          grade: "A",
          failing: [],
          missing: [],
        };
      } catch {
        /* frozen arrays throw in strict mode — that is the fix working */
      }
    }
    expect(enforcement(real).length, "an in-place rewrite disarmed every autonomy freeze").toBe(before);
    expect(publishGradeReport(real, 0), "an in-place rewrite published an all-A report").toContain("BELOW_A");

    /** The freeze is what makes coverage structural, so it is what gets tested.
     * R7-10's length check was deleted rather than deepened: no input could
     * reach it, and `real[1] = real[0]` walked through it anyway (R8-05). A
     * genuine result is frozen at every level a forgery would need to touch. */
    expect(Object.isFrozen(real), "the grade array is writable").toBe(true);
    expect(Object.isFrozen(real[0]), "a grade object is writable").toBe(true);
    expect(Object.isFrozen(real[0]!.failing), "a failing-metric list is writable").toBe(true);
    // The duplicate-area forgery R8-05 used, refused by construction.
    expect(() => {
      Object.defineProperty(real, "1", { value: real[0], writable: true, configurable: true });
    }, "an area could be duplicated in place").toThrow();

    expect(() => enforcement(real)).not.toThrow();
    expect(enforcement(real).length).toBeGreaterThan(0);
    expect(publishGradeReport(real, 0)).toContain("BELOW_A");

    // A truncated copy of a genuine result is not the genuine result.
    expect(() => enforcement(real.slice(0, 1))).toThrow(GradeRegistryError);
    const { actions } = gradeAndEnforce({});
    expect(actions.length).toBeGreaterThan(0);
  });
});
