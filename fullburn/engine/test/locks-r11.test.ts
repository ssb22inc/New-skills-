import { beforeEach, describe, expect, it } from "vitest";
import { CapError, getCaps } from "@fullburn/config/caps";
import { ROLE_BINDINGS } from "@fullburn/config/models";
import { llm } from "../src/gateway.ts";
import { FrozenCapsSpendMeter, MeterUnavailableError } from "../src/spend-meter.ts";
import {
  SpendLedgerError,
  processLedger,
  resetProcessLedgerForTests,
} from "../src/spend-ledger.ts";
import { TraceContext } from "../src/tracing.ts";
import { MemoryTraceSink } from "../src/tracing.ts";
import { MemoryVaultBackend, vaultForClient } from "../src/vault.ts";
import { CANARY_SECRET, TEST_CLIENT, testClock } from "./helpers.ts";

/** R11 LOCKS — the ledger is not the meter's to own.
 *
 * Every fix from R7-06 onward asked WHICH meter may enforce a ceiling. R11-07
 * asked HOW MANY, and the answer was "as many as you like": the ledger lived in
 * the instance, so `new FrozenCapsSpendMeter()` per call minted a fresh $5/day.
 * These tests drive that attack and the fix's consequences. */

beforeEach(resetProcessLedgerForTests);

const FROZEN_DAY = getCaps(TEST_CLIENT).dailyAiSpendUsd;

function deps(transport: { post(): Promise<unknown> }) {
  const backend = new MemoryVaultBackend();
  backend.set(TEST_CLIENT, "ai-gateway-key", CANARY_SECRET);
  return {
    transport,
    vault: vaultForClient(backend, TEST_CLIENT),
    sink: new MemoryTraceSink(),
    bindings: ROLE_BINDINGS,
    gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/test-account/fullburn/",
    now: testClock,
  };
}

describe("money — a second meter is a second HANDLE, not a second ceiling (R11-07)", () => {
  /** THE MEASURED ATTACK, in the shape the adversary ran it: no mock, no
   * forgery, no prototype trick — construct the object the API asks you to
   * construct, once per dispatch. It put $30 through a frozen $5/day.
   *
   * MUTATION: give `MemorySpendMeter` back its own ledger by default in the
   * `FrozenCapsSpendMeter` super() call (`new InMemorySpendLedger()` instead of
   * `processLedger()`). */
  it("constructing a fresh production meter per dispatch cannot exceed the frozen day", async () => {
    let served = 0;
    const transport = {
      async post() {
        served += 1;
        return { greeting: "ok" };
      },
    };
    for (let i = 0; i < 300; i++) {
      await llm({ ...deps(transport), meter: new FrozenCapsSpendMeter() }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: new TraceContext(`r11-${i}`, TEST_CLIENT),
      }).catch(() => undefined);
    }
    // The reading is taken through a meter built AFTER the spend, which is the
    // same point from the other direction: a new handle sees the real balance.
    const spent = new FrozenCapsSpendMeter().todayUsd(TEST_CLIENT);
    expect(served, "no dispatch ever left the building — the test proves nothing").toBeGreaterThan(0);
    expect(spent, `300 fresh meters put $${spent} through a frozen $${FROZEN_DAY}/day`).toBeLessThanOrEqual(FROZEN_DAY);
  });

  /** The same thing without the gateway, stated directly. */
  it("a meter built after the ceiling is full refuses, and reads the real balance", () => {
    const first = new FrozenCapsSpendMeter();
    first.settle(first.reserve(TEST_CLIENT, FROZEN_DAY));
    const second = new FrozenCapsSpendMeter();
    expect(second.todayUsd(TEST_CLIENT), "a fresh handle read a fresh balance").toBe(FROZEN_DAY);
    expect(() => second.reserve(TEST_CLIENT, 0.01), "a fresh handle minted a fresh ceiling").toThrow(CapError);
  });

  /** Reservations are shared too, not just committed spend: headroom held by
   * one handle binds the next. Otherwise the same attack works in-flight.
   *
   * MUTATION: as above. */
  it("headroom held open by one handle is not available to another", () => {
    const first = new FrozenCapsSpendMeter();
    first.reserve(TEST_CLIENT, FROZEN_DAY); // held, never settled
    const second = new FrozenCapsSpendMeter();
    expect(second.reservedUsd(TEST_CLIENT)).toBe(FROZEN_DAY);
    expect(() => second.reserve(TEST_CLIENT, 0.01)).toThrow(CapError);
  });
});

describe("storage availability belongs to storage (R11-06)", () => {
  /** `setAvailable` was public and untraced on the meter: a way to halt a
   * client's spend permanently, sitting on the money path's public face. It
   * moved to the ledger, where the operator of the storage is the one who
   * knows. The lock is behavioural in both directions — the meter cannot be
   * made unavailable through its own API, and the ledger still can. */
  it("the meter exposes no way to halt a client's spend; the ledger does", () => {
    const m = new FrozenCapsSpendMeter();
    expect((m as unknown as Record<string, unknown>)["setAvailable"], "setAvailable is back on the meter").toBeUndefined();
    // …and it cannot be put back: production meters are frozen (R10-02).
    expect(() => {
      (m as unknown as Record<string, unknown>)["setAvailable"] = () => {};
    }).toThrow();
    const r = m.reserve(TEST_CLIENT, 0.01);
    processLedger().setAvailable(TEST_CLIENT, false, "R11-06 fixture");
    expect(() => m.settle(r)).toThrow(MeterUnavailableError);
  });
});

describe("the ledger reset cannot run where the money is (R11-07 fix, test seam)", () => {
  /** A reset IS R11-07 in one call: wipe the committed micros and the ceiling
   * is fresh. The fence is the runtime, not a comment — the deployed surface is
   * a Worker with no vitest marker, so the function cannot complete there.
   *
   * MUTATION: delete the marker check from `resetProcessLedgerForTests`. */
  it("resetProcessLedgerForTests refuses when no test runner is present", () => {
    const g = globalThis as Record<string, unknown>;
    const saved = g["__vitest_worker__"];
    const m = new FrozenCapsSpendMeter();
    m.settle(m.reserve(TEST_CLIENT, FROZEN_DAY));
    try {
      delete g["__vitest_worker__"];
      expect(() => resetProcessLedgerForTests()).toThrow(SpendLedgerError);
    } finally {
      g["__vitest_worker__"] = saved;
    }
    // The refusal was real: the ceiling is still full.
    expect(new FrozenCapsSpendMeter().todayUsd(TEST_CLIENT)).toBe(FROZEN_DAY);
    // And with the runner present it does its job, so the check above is a
    // discrimination rather than a function that refuses everything.
    resetProcessLedgerForTests();
    expect(new FrozenCapsSpendMeter().todayUsd(TEST_CLIENT)).toBe(0);
  });

});
