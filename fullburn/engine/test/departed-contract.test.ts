import { describe, expect, it, vi } from "vitest";

/** `departed` GUARDS A CONTRACT VIOLATION, AND HERE IS THE VIOLATION.
 *
 * The mutation harness found that deleting `departed = true` changes nothing
 * observable on any path today: the inner catch settles every
 * non-`PreDispatchError`, and a release after a settle is a no-op because
 * R6-04 made the ledger identity-keyed — `#close` deletes the entry, so the
 * second close finds nothing.
 *
 * Human ruling 2026-08-18: keep it, because the category is different from the
 * three dead guards this project deleted. Those were unreachable for any INPUT.
 * This one is reachable for a non-conforming IMPLEMENTATION — a future meter
 * whose `#close` does not delete would double-refund a settled reservation, and
 * `departed` is what stops `llm()` asking it to. "On money paths that asymmetry
 * favours keeping it: the cost is one branch, the cost of deleting is a future
 * meter change silently reintroducing double-refunds with no guard."
 *
 * The same ruling refused to let it sit as an explained survivor — "that
 * normalizes an unexplained survivor" — so this drives the violation.
 *
 * `llm()` accepts only a branded, frozen `FrozenCapsSpendMeter`, which conforms
 * by construction. The brand is therefore mocked HERE AND ONLY HERE, in a file
 * that exists to model a meter the brand would never admit. That is the point:
 * the guard's whole job is to be right about an implementation the type system
 * cannot yet refuse.
 *
 * MUTATION: delete `departed = true`, or drop `!departed` from the release
 * condition. Either lets `llm()` call `release` on a settled reservation, and
 * the non-conforming meter below refunds it. */
vi.mock("../src/spend-meter.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/spend-meter.ts")>();
  return { ...real, isFrozenCapsMeter: () => true };
});

const { llm } = await import("../src/gateway.ts");
const { TraceContext } = await import("../src/tracing.ts");
const { ROLE_BINDINGS } = await import("@fullburn/config/models");
const { CANARY_SECRET, TEST_CLIENT, testClock } = await import("./helpers.ts");
const { MemoryTraceSink } = await import("../src/tracing.ts");
const { MemoryVaultBackend, vaultForClient } = await import("../src/vault.ts");
const { SpendReservation } = await import("../src/spend-meter.ts");

/** A meter that CLOSES WITHOUT DELETING — the contract violation `departed`
 * exists for. Settle commits; release refunds; and because the entry is never
 * removed, releasing an already-settled reservation refunds it a second time.
 * A conforming meter cannot do this, which is exactly why the guard cannot be
 * proven against one. */
let refunds = 0;

function nonConformingMeter() {
  let committed = 0;
  let reserved = 0;
  // Reservations are never removed from this map — the violation.
  const open = new Map<object, number>();
  return {
    get committed() {
      return committed;
    },
    meter: {
      todayUsd: () => committed,
      monthUsd: () => committed,
      reservedUsd: () => reserved,
      reserve(clientId: string, amountUsd: number) {
        reserved += amountUsd;
        const handle = Object.create(SpendReservation.prototype) as object;
        Object.assign(handle, { id: `r${open.size + 1}`, clientId, amountUsd });
        open.set(handle, amountUsd);
        return handle as InstanceType<typeof SpendReservation>;
      },
      settle(r: object) {
        const amount = open.get(r);
        if (amount === undefined) return;
        // NOT deleted — that is the violation being modelled.
        reserved -= amount;
        committed += amount;
      },
      release(r: object) {
        const amount = open.get(r);
        if (amount === undefined) return;
        // The entry is still here after a settle, so this refunds a charge the
        // provider already served.
        committed -= amount;
        refunds += 1;
      },
    },
  };
}

describe("money — `departed` stops a non-conforming meter double-refunding (R7-04 contract half)", () => {
  it("a post-dispatch failure never asks the meter to release a settled charge", async () => {
    refunds = 0;
    const nc = nonConformingMeter();
    const backend = new MemoryVaultBackend();
    backend.set(TEST_CLIENT, "ai-gateway-key", CANARY_SECRET);
    const deps = {
      transport: {
        // Dispatches successfully, then the response fails validation — the one
        // path where a settle is followed by a throw, so the outer catch's
        // release decision is the thing under test.
        async post() {
          return { not_the_schema: true };
        },
      },
      vault: vaultForClient(backend, TEST_CLIENT),
      meter: nc.meter as never,
      sink: new MemoryTraceSink(),
      gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/test-account/fullburn/",
      now: testClock,
      bindings: ROLE_BINDINGS,
    };

    await llm(deps, {
      role: "hello-world",
      clientId: TEST_CLIENT,
      input: {},
      trace: new TraceContext("departed-contract", TEST_CLIENT),
    }).catch(() => undefined);

    expect(refunds, "llm() released a reservation it had already settled").toBe(0);
    expect(nc.committed, "a departed, billable request was refunded").toBeGreaterThan(0);
  });

  /** The other half: a request that provably never departed MUST still be
   * released, or the guard would be a blanket "never release" and the headroom
   * would leak (R2-02). */
  it("a proven pre-dispatch failure is still released", async () => {
    refunds = 0;
    const nc = nonConformingMeter();
    const { PreDispatchError } = await import("../src/gateway.ts");
    const backend = new MemoryVaultBackend();
    backend.set(TEST_CLIENT, "ai-gateway-key", CANARY_SECRET);
    await llm(
      {
        transport: {
          post() {
            throw new PreDispatchError("nothing was sent");
          },
        },
        vault: vaultForClient(backend, TEST_CLIENT),
        meter: nc.meter as never,
        sink: new MemoryTraceSink(),
        gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/test-account/fullburn/",
        now: testClock,
        bindings: ROLE_BINDINGS,
      },
      { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: new TraceContext("pre", TEST_CLIENT) },
    ).catch(() => undefined);
    expect(refunds, "an undispatched request's headroom was never returned").toBe(1);
  });
});
