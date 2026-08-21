import { beforeEach, describe, expect, it } from "vitest";
import { ROLE_BINDINGS } from "@fullburn/config/models";
import { CapError } from "@fullburn/config/caps";
import { llm, PreDispatchError } from "../src/gateway.ts";
import { MeterUnavailableError } from "../src/money-errors.ts";
import { SpendLedgerError, resetProcessLedgerForTests } from "../src/spend-ledger.ts";
import { TraceContext } from "../src/tracing.ts";
import { TEST_CLIENT, makeDeps } from "./helpers.ts";

beforeEach(resetProcessLedgerForTests);

describe("a refusal traces what was CHARGED, not what was reserved (R14-12)", () => {
  /** `costUsd` reported `reservation?.amountUsd ?? 0` on every failure path,
   * including the ones whose reservation was RELEASED and never charged. Five
   * hundred released failures traced $5.00 of cost against a ledger reading
   * $0.00 (adversary finding R14-12). Law 10 makes every client-visible number
   * answerable to the warehouse; the field had no test and no mutation entry.
   *
   * MUTATION: put `reservation?.amountUsd ?? 0` back. */
  it("a released pre-dispatch failure traces $0, and the ledger agrees", async () => {
    const { deps, meter, sink } = makeDeps({
      transport: {
        post() {
          // Typed and deliberate: nothing left the building, so the reservation
          // is RELEASED rather than settled.
          throw new PreDispatchError("no bytes left");
        },
      },
    });
    for (let i = 0; i < 20; i++) {
      await llm({ ...deps, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: new TraceContext(`r14-${i}`, TEST_CLIENT),
      }).catch(() => undefined);
    }
    const traced = sink.events.filter((e) => e.outcome === "error");
    expect(traced.length, "no failure was traced — this test would prove nothing").toBe(20);
    const tracedTotal = traced.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
    expect(tracedTotal, "released reservations were traced as cost").toBe(0);
    expect(meter.todayUsd(TEST_CLIENT), "the ledger and the trace disagree").toBe(0);
  });

  /** …and a DEPARTED failure still traces its charge, so the fix is not
   * "always zero". The provider billed for the request whatever we think of
   * the response, and the trace has to say so (F3). */
  it("a departed failure traces the amount the ledger committed", async () => {
    const { deps, meter, sink } = makeDeps({
      transport: {
        post() {
          throw new Error("upstream 504");
        },
      },
    });
    await llm({ ...deps, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: TEST_CLIENT,
      input: {},
      trace: new TraceContext("r14-departed", TEST_CLIENT),
    }).catch(() => undefined);
    const failure = sink.events.find((e) => e.outcome === "error");
    expect(failure, "the departed failure was not traced").toBeDefined();
    expect(failure!.costUsd, "a billed request traced no cost").toBeGreaterThan(0);
    expect(failure!.costUsd, "the trace and the ledger disagree").toBeCloseTo(meter.todayUsd(TEST_CLIENT), 10);
  });
});

describe("money-path error identities survive a duplicated module (R14-05)", () => {
  /** The process ledger is one object shared by every module instance that
   * reaches for it, so it throws classes belonging to the registry that CREATED
   * it. Under a single-fork pool that turned eight money-path locks red with
   * "expected error to be instance of MeterUnavailableError" when the error WAS
   * one. In production the same shape appears if a bundler duplicates the
   * module — and `gateway.ts` classifies refusals with `instanceof CapError`.
   *
   * MUTATION: make the registry helper build a fresh class each time. */
  it("each class is the one in the process registry, not a per-instance copy", () => {
    const g = globalThis as unknown as Record<symbol, unknown>;
    expect(g[Symbol.for("fullburn.money-errors.MeterUnavailableError")]).toBe(MeterUnavailableError);
    expect(g[Symbol.for("fullburn.money-errors.CapError")]).toBe(CapError);
    expect(g[Symbol.for("fullburn.money-errors.SpendLedgerError")]).toBe(SpendLedgerError);
  });

  /** The property that matters is the one `gateway.ts` depends on: an error
   * thrown by a SECOND module instance is still `instanceof` the first one's
   * class. Driven through a real re-import rather than asserted. */
  it("an error from a re-imported module instance is instanceof the original class", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    const fresh = await import("../src/spend-ledger.ts");
    let thrown: unknown = null;
    try {
      new fresh.InMemorySpendLedger(() => 0, () => ({ dailyUsd: 1, monthlyUsd: 1, timeZone: "UTC" })).reserve(
        "pulsern",
        -1,
        {},
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown, "the fixture stopped throwing — it proves nothing").not.toBeNull();
    expect(
      thrown instanceof MeterUnavailableError,
      "a second module instance threw a class the first cannot recognise",
    ).toBe(true);
    // …and the same holds for the class gateway.ts branches on.
    expect(fresh.MeterUnavailableError).toBe(MeterUnavailableError);
    expect((await import("@fullburn/config/caps")).CapError).toBe(CapError);
  });
});
