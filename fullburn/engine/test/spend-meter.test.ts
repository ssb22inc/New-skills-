import { testClock, capsOf, fixedCaps } from "./helpers.ts";
import { describe, expect, it } from "vitest";
import { CapError } from "@fullburn/config/caps";
import { MemorySpendMeter, MeterUnavailableError, assertUsableAmount } from "../src/spend-meter.ts";
import { InMemorySpendLedger } from "../src/spend-ledger.ts";

/** Reserve-then-settle is the shape every cap check must use, here and in the
 * Phase 5/6 ad-spend path (§2.2 client Durable Object). Findings F1–F3. */

describe("spend meter — reserve/settle (F1, F2, F3)", () => {
  it("reservations accumulate against the cap before any of them settle", () => {
    const m = new MemorySpendMeter(testClock, capsOf(0.05, 0.05));
    const r1 = m.reserve("c", 0.01);
    m.reserve("c", 0.01);
    m.reserve("c", 0.01);
    m.reserve("c", 0.01);
    m.reserve("c", 0.01);
    // Five reservations fill the cap even though nothing has settled yet.
    expect(m.reservedUsd("c")).toBeCloseTo(0.05, 10);
    expect(m.todayUsd("c")).toBe(0);
    expect(() => m.reserve("c", 0.01)).toThrow(CapError);
    // Settling moves reserved → committed without changing the total.
    m.settle(r1);
    expect(m.todayUsd("c")).toBeCloseTo(0.01, 10);
    expect(m.reservedUsd("c")).toBeCloseTo(0.04, 10);
    expect(() => m.reserve("c", 0.01)).toThrow(CapError);
  });

  it("releasing a reservation frees the headroom again", () => {
    const m = new MemorySpendMeter(testClock, capsOf(0.05, 0.05));
    const r = m.reserve("c", 0.05);
    expect(() => m.reserve("c", 0.01)).toThrow(CapError);
    m.release(r);
    expect(() => m.reserve("c", 0.01)).not.toThrow();
  });

  it("settle and release are idempotent — a double-settle cannot double-charge", () => {
    const m = new MemorySpendMeter(testClock, capsOf(0.05, 0.05));
    const r = m.reserve("c", 0.01);
    m.settle(r);
    m.settle(r);
    m.release(r);
    expect(m.todayUsd("c")).toBeCloseTo(0.01, 10);
  });

  it("caps are per client: one client's spend never consumes another's headroom (Law 3)", () => {
    const m = new MemorySpendMeter(testClock, capsOf(0.05, 0.05));
    m.settle(m.reserve("a", 0.05));
    expect(() => m.reserve("a", 0.01)).toThrow(CapError);
    expect(() => m.reserve("b", 0.01)).not.toThrow();
  });

  it("non-finite accounting refuses spend instead of sliding through a NaN comparison (F2)", () => {
    const m = new MemorySpendMeter(testClock, capsOf(0.05, 0.05));
    expect(() => m.reserve("c", Number.NaN)).toThrow(MeterUnavailableError);
    // A resolver that returns nothing is a meter with no ceilings, which must
    // refuse rather than treat "no limit" as the limit. Callers cannot supply
    // ceilings at all any more (R7-06), so this is the only shape left.
    const noCaps = new MemorySpendMeter(testClock, (() => undefined) as never);
    expect(() => noCaps.reserve("c", 0.01)).toThrow(MeterUnavailableError);
    const badZone = new MemorySpendMeter(testClock, () => ({ dailyUsd: 5, monthlyUsd: 5, timeZone: "Mars/Olympus" }));
    expect(() => badZone.reserve("c", 0.01)).toThrow();
    expect(() => m.reserve("c", Infinity)).toThrow(MeterUnavailableError);
    expect(() => m.reserve("c", -0.01)).toThrow(MeterUnavailableError);
    expect(() => m.reserve("c", 0)).toThrow(MeterUnavailableError);
    expect(() => m.reserve("", 0.01)).toThrow(MeterUnavailableError);
  });

  it("an unavailable meter refuses everything (fail closed)", () => {
    // Availability belongs to STORAGE, not to the meter's public face (R11-06).
    const ledger = new InMemorySpendLedger();
    const m = new MemorySpendMeter(testClock, capsOf(0.05, 0.05), ledger);
    ledger.setAvailable("c", false, "storage outage fixture");
    expect(() => m.reserve("c", 0.01)).toThrow(MeterUnavailableError);
    expect(() => m.todayUsd("c")).toThrow(MeterUnavailableError);
  });

  it("assertUsableAmount rejects exactly the values that make `>` comparisons lie", () => {
    for (const bad of [Number.NaN, undefined, null, "0.01", -1, Infinity]) {
      expect(() => assertUsableAmount(bad, "x")).toThrow(MeterUnavailableError);
    }
    expect(() => assertUsableAmount(0, "x")).not.toThrow();
  });
});
