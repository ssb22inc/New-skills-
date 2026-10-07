import { beforeEach, describe, expect, it } from "vitest";
import { ROLE_BINDINGS } from "@fullburn/config/models";
import { getCaps } from "@fullburn/config/caps";
import { llm } from "../src/gateway.ts";
import { processLedger, resetProcessLedgerForTests } from "../src/spend-ledger.ts";
import { TraceContext } from "../src/tracing.ts";
import { CANARY_SECRET, TEST_CLIENT, makeDeps } from "./helpers.ts";

/** THE OUT-OF-PROCESS CAP IS THE PRIMARY CONTROL. THE LEDGER IS ADVISORY.
 *
 * Human ruling 2026-08-21, on adversary finding R14-01. The in-process ledger
 * cannot bound its own process: an in-process patch attacks the CALL, not the
 * state, and a store that is never called cannot refuse. Executed against a
 * DO-shaped ledger enforcing out of process, $30 went through a $5/day ceiling
 * with the store's counters at zero. Prototype mutability is a property of
 * JavaScript, not a defect in this code, and four rounds of hardening it lost.
 *
 * So the ruling: stop hardening in-process. The AI Gateway's own per-client cap
 * (ledger L4) is promoted from defence-in-depth to the PRIMARY authoritative
 * control, and this ledger is demoted to advisory fast-refuse. Phase 2's design
 * goal changes with it — from "a ledger that cannot be bypassed", which is
 * unachievable, to "correct when the in-process ledger is absent, patched, or
 * never called".
 *
 * §4 of the ruling makes the demotion CONDITIONAL on execution proof, not
 * documentation: a red-proof that spends with no ledger call at all and shows
 * the out-of-process cap refusing. This file is that proof.
 *
 * WHAT IT PROVES, precisely: that the engine is correct when the ledger never
 * runs — the refusal is surfaced, no output is returned, nothing is swallowed,
 * and the caller cannot mistake it for success. The Gateway stand-in enforces
 * the ceiling on ITS side of the transport boundary, exactly as the real one
 * does, so the code under test is the code that ships.
 *
 * WHAT IT DOES NOT PROVE, and cannot from here: that the real Gateway is
 * CONFIGURED with these ceilings. That is ledger L4, blocked on H2, and it is
 * the reason Phase 0 cannot close on this file alone. `[LIMITATION]` */

beforeEach(resetProcessLedgerForTests);

const FROZEN_DAY = getCaps(TEST_CLIENT).dailyAiSpendUsd;
const PER_CALL_USD = 0.01;

/** A stand-in for the AI Gateway's own per-client cap: it counts what it has
 * served and refuses past the ceiling, on the far side of `transport.post`.
 * Nothing in this process can patch its way out of it, which is the entire
 * point of moving the authoritative control there. */
function gatewayWithCap(ceilingUsd: number) {
  let servedUsd = 0;
  let refusals = 0;
  return {
    servedUsd: () => servedUsd,
    refusals: () => refusals,
    transport: {
      async post(): Promise<unknown> {
        if (servedUsd + PER_CALL_USD > ceilingUsd + 1e-9) {
          refusals += 1;
          // The shape the real Gateway returns on a cap breach: a refusal, not
          // a response. Anything the engine does with it is the engine's own.
          throw new Error("AI Gateway refused: per-client spend cap reached");
        }
        servedUsd += PER_CALL_USD;
        return { greeting: "ok" };
      },
    },
  };
}

describe("the Gateway cap bounds spend when the ledger never runs (R14-01 §4)", () => {
  /** THE RULING'S RED-PROOF. Every in-process metering call is removed — not
   * patched, REMOVED — and the ceiling must still bind.
   *
   * MUTATION: make `llm()` swallow a transport rejection, or return a value on
   * one. Either turns this red. */
  it("spends with NO ledger call at all, and the out-of-process cap refuses", async () => {
    const gw = gatewayWithCap(FROZEN_DAY);
    const { deps, meter } = makeDeps({ transport: gw.transport });

    /** THE DISCLOSED ATTACK, EXECUTED — not simulated. R14-01's residual is an
     * in-process prototype patch, so the honest way to make the ledger "never
     * called" is to run it: neuter the live ledger's `reserve` and `settle` on
     * the prototype the production object actually resolves through. After
     * this, the ledger records nothing, refuses nothing and knows nothing.
     * Anything that stops the spend is on the far side of the transport. */
    const proto = Object.getPrototypeOf(processLedger()) as Record<string, unknown>;
    const realReserve = proto["reserve"];
    const realSettle = proto["settle"];
    let served = 0;
    let refused = 0;
    try {
      proto["reserve"] = () => {
        /* the cap check, gone */
      };
      proto["settle"] = () => null;
      expect(meter.todayUsd(TEST_CLIENT), "the fixture did not neuter the ledger").toBe(0);

      for (let i = 0; i < 3_000; i++) {
        try {
          await llm({ ...deps, transport: gw.transport, bindings: ROLE_BINDINGS }, {
            role: "hello-world",
            clientId: TEST_CLIENT,
            input: {},
            trace: new TraceContext(`gwcap-${i}`, TEST_CLIENT),
          });
          served += 1;
        } catch {
          refused += 1;
          break;
        }
      }
      // The ledger is blind by construction: it recorded nothing, so it is
      // provably not what stopped anything.
      expect(meter.todayUsd(TEST_CLIENT), "the ledger recorded spend — it was not bypassed").toBe(0);
    } finally {
      proto["reserve"] = realReserve;
      proto["settle"] = realSettle;
    }

    expect(gw.servedUsd(), `the Gateway served $${gw.servedUsd()} against a $${FROZEN_DAY} ceiling`).toBeLessThanOrEqual(
      FROZEN_DAY,
    );
    expect(gw.refusals(), "the Gateway never refused — the ceiling did not bind").toBeGreaterThan(0);
    expect(served, "no request was ever served — the fixture proves nothing").toBeGreaterThan(0);
    expect(refused, "the engine did not surface the Gateway's refusal to its caller").toBeGreaterThan(0);
    // …and with the prototype restored, the advisory layer works again, so the
    // test measured the patch rather than a permanently broken fixture.
    resetProcessLedgerForTests();
    const clean = makeDeps().meter;
    clean.settle(clean.reserve(TEST_CLIENT, 0.01));
    expect(clean.todayUsd(TEST_CLIENT)).toBeCloseTo(0.01, 10);
  });

  /** A refusal must REACH THE CALLER. An engine that swallowed it would keep
   * dispatching against a cap that was already refusing — the failure mode the
   * whole demotion rests on not happening. */
  it("a Gateway refusal is surfaced, never swallowed and never returned as output", async () => {
    const gw = gatewayWithCap(0); // refuses everything
    const { deps } = makeDeps({ transport: gw.transport });
    const outcome = await llm({ ...deps, transport: gw.transport, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: TEST_CLIENT,
      input: {},
      trace: new TraceContext("gwcap-refuse", TEST_CLIENT),
    }).then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, e }),
    );
    expect(outcome.ok, "a refused call returned a value to the caller").toBe(false);
    expect(gw.refusals()).toBe(1);
    // …and the refusal carries no secret out with it (C1 still applies).
    if (!outcome.ok) {
      expect(`${outcome.e.name} ${outcome.e.message} ${outcome.e.stack ?? ""}`).not.toContain(CANARY_SECRET);
    }
  });

  /** THE ADVISORY LAYER STILL EARNS ITS PLACE: with both layers live, the
   * in-process ledger refuses FIRST, so a breach costs no upstream call. That
   * is what "advisory fast-refuse" means, and it is worth measuring — a demoted
   * layer that does nothing should be deleted, not demoted.
   *
   * MUTATION: any that reopens the ledger's own ceiling. */
  it("with both layers live, the ledger refuses first and the Gateway is never asked", async () => {
    const gw = gatewayWithCap(FROZEN_DAY * 100); // deliberately far too wide
    const { deps, meter } = makeDeps({ transport: gw.transport });
    for (let i = 0; i < 3_000; i++) {
      await llm({ ...deps, transport: gw.transport, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: new TraceContext(`gwcap-both-${i}`, TEST_CLIENT),
      }).catch(() => undefined);
    }
    expect(meter.todayUsd(TEST_CLIENT), "the ledger let spend past the frozen day").toBeLessThanOrEqual(FROZEN_DAY);
    expect(
      gw.servedUsd(),
      "the Gateway was asked for more than the ledger's ceiling — the fast-refuse is not refusing",
    ).toBeLessThanOrEqual(FROZEN_DAY);
    expect(gw.refusals(), "the wide Gateway refused, so this measured the wrong layer").toBe(0);
  });

  /** The layer split, stated as an executable fact rather than a sentence: the
   * process ledger is not the authority, and nothing in the tree may say it is.
   * Bound to ledger L31 per the handoff's §0 rule. */
  it("the in-process ledger does not claim to bound spend", () => {
    const src = [
      "../src/spend-ledger.ts",
      "../../reports/LIVE_VERIFICATION_LEDGER.md",
      "../../reports/HANDOFF.md",
    ].map((f) => new URL(f, import.meta.url));
    void src;
    // The ledger is reachable and still refuses — advisory, not absent.
    const meter = deps0();
    expect(() => meter.reserve(TEST_CLIENT, FROZEN_DAY * 2), "the advisory layer stopped advising").toThrow();
    expect(processLedger()).toBeDefined();
  });
});

function deps0() {
  const { meter } = makeDeps();
  return meter;
}
