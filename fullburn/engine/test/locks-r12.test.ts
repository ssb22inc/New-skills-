import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { CapError, getCaps } from "@fullburn/config/caps";
import { FrozenCapsSpendMeter, MeterUnavailableError, medianOfThree, trustedClock } from "../src/spend-meter.ts";
import { processLedger, resetProcessLedgerForTests } from "../src/spend-ledger.ts";
import { TEST_CLIENT } from "./helpers.ts";

/** R12 LOCKS — the ledger enforces the ceiling, and exposes no way around it.
 *
 * R11 moved the state out of the meter and left it reachable: the ledger
 * arrived with public setters, so `setCommittedMicros(period, 0)` minted a
 * fresh ceiling on every call — $30 against a frozen $5/day, one meter, zero
 * `CapError`s, `todayUsd()` reading $0.00 (adversary finding R12-01). The
 * fences built for R11-07 guarded the RESET and had nothing to say about
 * writing the balance directly. */

beforeEach(resetProcessLedgerForTests);

const FROZEN_DAY = getCaps(TEST_CLIENT).dailyAiSpendUsd;

/** The method names the `SpendLedger` CONTRACT declares, read from the source.
 * Hard-coding them would go stale the day someone adds a setter — which is the
 * exact thing this file exists to catch. */
function contractMethods(): string[] {
  const src = readFileSync(new URL("../src/spend-ledger.ts", import.meta.url), "utf8");
  const body = /export interface SpendLedger \{([\s\S]*?)\n\}/.exec(src)?.[1];
  expect(body, "the SpendLedger interface could not be read — this test would pass vacuously").toBeDefined();
  const withoutComments = body!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return [...withoutComments.matchAll(/^\s*(\w+)\s*\(/gm)].map((m) => m[1]!);
}

describe("money — the ledger has no balance-write primitive (R12-01)", () => {
  /** THE WHOLE CONTRACT, FUZZED. Not "setCommittedMicros is gone" — that is the
   * spelling, and enumerating spellings is the defect this round is closing.
   * Every method the contract declares is CALLED, with argument shapes a caller
   * could plausibly reach for, and none of them may lower a committed balance.
   *
   * MUTATION: add any `setCommittedMicros`-shaped method back to the interface
   * and its implementation. */
  it("no method on the SpendLedger contract can lower a committed balance", () => {
    const meter = new FrozenCapsSpendMeter();
    meter.settle(meter.reserve(TEST_CLIENT, FROZEN_DAY));
    expect(meter.todayUsd(TEST_CLIENT)).toBe(FROZEN_DAY);

    const ledger = processLedger() as unknown as Record<string, (...a: unknown[]) => unknown>;
    const methods = contractMethods();
    expect(methods.length, "no contract methods found — this test would pass vacuously").toBeGreaterThan(8);

    // Period keys are `d:<day>|<client>` / `m:<month>|<client>`; an attacker
    // reads them straight out of this file's own source, so they are handed
    // over rather than hidden.
    const day = `d:${new Intl.DateTimeFormat("en-CA", { timeZone: getCaps(TEST_CLIENT).ianaTimeZone }).format(Date.now())}|${TEST_CLIENT}`;
    const month = `m:${day.slice(2, 9)}|${TEST_CLIENT}`;
    const argTuples: unknown[][] = [
      [],
      [TEST_CLIENT],
      [day],
      [TEST_CLIENT, day],
      [TEST_CLIENT, month],
      [day, 0],
      [month, 0],
      [TEST_CLIENT, 0],
      [TEST_CLIENT, day, 0],
      [{}, {}],
      [{ clientId: TEST_CLIENT, micros: 0, day, month, dailyCapMicros: 0, monthlyCapMicros: 0, dailyCapUsd: 0, monthlyCapUsd: 0 }, {}],
      [TEST_CLIENT, true, "fuzz"],
      [TEST_CLIENT, false, "fuzz"],
    ];

    const lowered: string[] = [];
    for (const name of methods) {
      for (const args of argTuples) {
        try {
          ledger[name]?.(...args);
        } catch {
          // A refusal is the correct answer; only a successful write matters.
        }
        let reading: number;
        try {
          reading = new FrozenCapsSpendMeter().todayUsd(TEST_CLIENT);
        } catch {
          continue; // the fuzz marked storage down; that is fail-closed, not loss
        }
        if (reading < FROZEN_DAY) lowered.push(`${name}(${args.map((a) => JSON.stringify(a)).join(", ")}) → $${reading}`);
      }
      // Undo any availability flag the fuzz set, so later methods are reachable.
      try {
        ledger["setAvailable"]?.(TEST_CLIENT, true, "fuzz cleanup");
      } catch {
        /* not this build's shape */
      }
    }
    expect(
      lowered,
      `a ledger method lowered a committed balance without a cap check — R12-01 is reopened:\n  ${lowered.join("\n  ")}`,
    ).toEqual([]);

    // …and the ceiling still binds after all of that.
    expect(() => new FrozenCapsSpendMeter().reserve(TEST_CLIENT, 0.01)).toThrow(CapError);
  });

  /** The runtime object may carry more than the contract. Anything extra is a
   * capability Phase 2's Durable Object will not implement and nothing on the
   * money path may depend on — today that is exactly `clear()`, which ledger
   * L31 discloses and `resetProcessLedgerForTests` fences.
   *
   * MUTATION: add a method to `InMemorySpendLedger` without adding it to the
   * interface. */
  it("the implementation carries nothing beyond the contract except the disclosed reset", () => {
    const ledger = processLedger() as object;
    const runtime = Object.getOwnPropertyNames(Object.getPrototypeOf(ledger)).filter(
      (n) => n !== "constructor" && typeof (ledger as Record<string, unknown>)[n] === "function",
    );
    const extra = runtime.filter((n) => !contractMethods().includes(n));
    expect(extra, "an undeclared capability appeared on the production ledger").toEqual(["clear"]);
  });

  /** The measured R12-01 attack, end to end: spend the frozen day, then try to
   * carry on. It is the same shape as R11-07's lock, one level down.
   *
   * MUTATION: any of the above. */
  it("a caller holding the process ledger cannot spend past the frozen day", () => {
    const meter = new FrozenCapsSpendMeter();
    let spent = 0;
    for (let i = 0; i < 3_000; i++) {
      try {
        meter.settle(meter.reserve(TEST_CLIENT, 0.01));
        spent += 0.01;
      } catch {
        break;
      }
    }
    expect(spent, `3,000 dispatches put $${spent} through a frozen $${FROZEN_DAY}/day`).toBeLessThanOrEqual(FROZEN_DAY);
    expect(meter.todayUsd(TEST_CLIENT), "the ledger under-reports what was spent").toBeCloseTo(spent, 10);
  });
});

describe("storage availability is per client and audited (R12-07)", () => {
  /** R11-06 moved `setAvailable` off the meter and onto a PROCESS-WIDE object,
   * so one tenant's storage flag halted every tenant's spend — measured against
   * an unrelated client. The method moved; every clause of R11-06's complaint
   * still held, and the blast radius grew.
   *
   * MUTATION: make `isAvailable`/`setAvailable` ignore their `clientId`. */
  it("halting one client's storage leaves another client spending", () => {
    processLedger().setAvailable(TEST_CLIENT, false, "R12-07 fixture");
    const meter = new FrozenCapsSpendMeter();
    expect(() => meter.reserve(TEST_CLIENT, 0.01), "the halted client kept spending").toThrow(MeterUnavailableError);
    // A DIFFERENT tenant is untouched.
    expect(() => meter.settle(meter.reserve("pulsern", 0.01)), "an unrelated tenant was halted too").not.toThrow();
    expect(meter.todayUsd("pulsern")).toBeCloseTo(0.01, 10);
  });

  /** An operator action with money consequences leaves a record, and cannot be
   * taken without a stated reason.
   *
   * MUTATION: drop the reason check, or stop recording the event. */
  it("a halt requires a reason and is recorded", () => {
    const ledger = processLedger();
    expect(() => ledger.setAvailable(TEST_CLIENT, false, ""), "an unaudited halt was accepted").toThrow(MeterUnavailableError);
    expect(() => ledger.setAvailable("", false, "no client"), "a process-wide halt was accepted").toThrow(MeterUnavailableError);
    expect(ledger.availabilityAudit(), "a refused halt was recorded as though it happened").toEqual([]);
    ledger.setAvailable(TEST_CLIENT, false, "simulated storage outage");
    const audit = ledger.availabilityAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ clientId: TEST_CLIENT, available: false, reason: "simulated storage outage" });
    // The audit is a COPY: a caller cannot rewrite the record it was handed.
    (audit as unknown as unknown[]).length = 0;
    expect(ledger.availabilityAudit(), "the audit log was editable through its own return value").toHaveLength(1);
  });

  /** The contract no longer hands a caller every tenant's open reservations.
   *
   * MUTATION: reintroduce `openEntries()`, or drop `assertOwnPeriod`. */
  it("one tenant cannot read another tenant's ledger through the contract", () => {
    const meter = new FrozenCapsSpendMeter();
    meter.settle(meter.reserve("pulsern", 1));
    const day = `d:${new Intl.DateTimeFormat("en-CA", { timeZone: getCaps("pulsern").ianaTimeZone }).format(Date.now())}|pulsern`;
    expect(
      () => processLedger().committedMicros(TEST_CLIENT, day),
      "a client read another client's period",
    ).toThrow(/cross-tenant/);
    expect(processLedger().reservedMicros(TEST_CLIENT), "another tenant's holdings leaked into this client's total").toBe(0);
  });
});

describe("the process ledger survives a module reset (R12-06, L31(a))", () => {
  /** A module-scoped `const` is one ledger per MODULE INSTANCE, and a second
   * instance is obtainable inside a single process: `vi.resetModules()` plus a
   * re-import minted a full second ceiling, $10 against a frozen $5/day. The
   * project's own suite did it, which is why four of six shuffle seeds were red.
   *
   * MUTATION: replace the `Symbol.for` slot with a module-scoped `const`. */
  it("a re-imported module instance finds the same ledger, not a fresh ceiling", async () => {
    const meter = new FrozenCapsSpendMeter();
    meter.settle(meter.reserve(TEST_CLIENT, FROZEN_DAY));

    const { vi } = await import("vitest");
    vi.resetModules();
    const freshMeter = await import("../src/spend-meter.ts");
    const freshLedger = await import("../src/spend-ledger.ts");

    expect(freshLedger.processLedger(), "the re-imported module built its own ledger").toBe(processLedger());
    const second = new freshMeter.FrozenCapsSpendMeter();
    expect(second.todayUsd(TEST_CLIENT), "a re-imported module read a fresh balance").toBe(FROZEN_DAY);
    expect(() => second.reserve(TEST_CLIENT, 0.01), "a re-imported module minted a second ceiling").toThrow();
  });
});

describe("the trusted clock's median is a guard, and guards get driven (R12-03)", () => {
  /** `readings.map(...).sort(...)[1]` was inline, and replacing it with
   * `readings[0]` left the whole suite green — while the attack narrowed from
   * "move two sources consistently" back to "move `Date.now`", which is
   * R10-03's original target. It is the load-bearing half of `spend-meter.ts`'s
   * claim that one tampered source "can only fail the spread", and it had no
   * test at all (adversary findings R11-03, R12-03).
   *
   * MUTATION: `medianOfThree` returns `values[0]`. */
  it("one tampered source cannot drag the anchor, whichever position it takes", () => {
    // A tampered reading in each slot in turn; the honest pair is 100/101.
    expect(medianOfThree([100, 101, 5_000]), "a high outlier dragged the anchor").toBe(101);
    expect(medianOfThree([5_000, 100, 101]), "a leading outlier dragged the anchor").toBe(101);
    expect(medianOfThree([100, 5_000, 101]), "a middle outlier dragged the anchor").toBe(101);
    expect(medianOfThree([1, 100, 101]), "a low outlier dragged the anchor").toBe(100);
    // It does not sort in place: the caller's array is evidence, not scratch.
    const readings = [3, 1, 2];
    medianOfThree(readings);
    expect(readings, "the reading order was mutated by the median").toEqual([3, 1, 2]);
  });

  /** The other half of the same claim, which the spread check enforces: a
   * source far enough out fails construction rather than being medianed away.
   * Together these two make "one tampered source is refused" true rather than
   * merely stated.
   *
   * MUTATION: drop the spread check from anchorWallMs. */
  it("a source outside the tolerance is refused rather than out-voted", () => {
    const realPerfNow = performance.now.bind(performance);
    try {
      performance.now = () => realPerfNow() + 3 * 24 * 3600 * 1000;
      expect(() => trustedClock(), "one tampered time source was out-voted instead of refused").toThrow(/disagree/);
    } finally {
      performance.now = realPerfNow;
    }
  });
});
