import { beforeEach, describe, expect, it } from "vitest";
import { llm } from "../src/gateway.ts";
import { FrozenCapsSpendMeter, MemorySpendMeter } from "../src/spend-meter.ts";
import { TraceContext } from "../src/tracing.ts";
import { MemoryVaultBackend, vaultForClient } from "../src/vault.ts";
import { ROLE_BINDINGS } from "@fullburn/config/models";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { parseNameStatus } from "../scripts/diff-lib.mjs";
import { CANARY_SECRET, LOW_CAP_NARROWING, TEST_CLIENT, capsOf, makeDeps, memoryMeter, testClock } from "./helpers.ts";
import { resetProcessLedgerForTests } from "../src/spend-ledger.ts";

/** ONE LEDGER PER PROCESS (R11-07): a meter is a handle onto shared state, so
 * one test's spend is the next test's opening balance unless the slate is
 * wiped. The reset cannot run outside a test runner — see spend-ledger.ts. */
beforeEach(resetProcessLedgerForTests);


/** Regression cover for hardening that previously shipped with none
 * (adversary findings R2-07, R2-19, R2-27, R2-28, R2-30, R2-33). Each test
 * fails if the protection it names is removed. */

const trace = (id = "h-1") => new TraceContext(id, TEST_CLIENT);

describe("money path — the transport-throw branch (R2-07)", () => {
  it("a call billed upstream then failing is METERED, so the cap still bounds it", async () => {
    // F3 named two paths; only the schema-invalid one had a lock test, so
    // changing this branch's settle() to release() restored unbounded spend
    // with the whole suite green.
    const { deps, meter } = makeDeps({ capsTable: LOW_CAP_NARROWING });
    let upstreamCalls = 0;
    const failing = {
      async post() {
        upstreamCalls += 1;
        throw new Error("upstream 504 after the provider processed the request");
      },
    };
    for (let i = 0; i < 50; i++) {
      await llm({ ...deps, transport: failing, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: trace(`h-throw-${i}`),
      }).catch(() => undefined);
    }
    expect(upstreamCalls).toBeGreaterThan(0);
    expect(upstreamCalls).toBeLessThanOrEqual(5); // $0.05 cap ÷ $0.01 per call
    expect(meter.todayUsd(TEST_CLIENT)).toBeCloseTo(upstreamCalls * 0.01, 10);
  });

  it("a failure BEFORE the request leaves returns the headroom (R2-02)", async () => {
    // A vault miss threw between reserve() and post(); nothing was ever sent,
    // yet the reservation was never released, so the client's day drained to
    // zero after cap/roleBudget failures.
    const backend = new MemoryVaultBackend(); // deliberately empty: no key
    // The production meter: llm() refuses any other kind (R8-01). testco's
    // frozen day is $5.00 and this loop spends at most $0.20, so the ceiling is
    // not what this test is about — the released headroom is.
    const meter = new FrozenCapsSpendMeter();
    const { deps } = makeDeps({ capsTable: LOW_CAP_NARROWING });
    for (let i = 0; i < 20; i++) {
      await llm({ ...deps, vault: vaultForClient(backend, TEST_CLIENT), meter, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: trace(`h-vault-${i}`),
      }).catch(() => undefined);
    }
    expect(meter.reservedUsd(TEST_CLIENT)).toBe(0);
    expect(meter.todayUsd(TEST_CLIENT)).toBe(0);
    // With the vault repaired the client can still spend its full day.
    backend.set(TEST_CLIENT, "ai-gateway-key", CANARY_SECRET);
    await expect(
      llm({ ...deps, vault: vaultForClient(backend, TEST_CLIENT), meter, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: trace("h-vault-ok"),
      }),
    ).resolves.toBeDefined();
  });

  it("overlapping reserve/settle cycles never corrupt the ledger (R2-01)", async () => {
    // Float accumulation left `reserved` at -3.47e-18 after three overlapping
    // $0.01 reservations, and the meter's own guard then refused everything.
    const m = memoryMeter(testClock, capsOf(25, 25));
    for (let round = 0; round < 40; round++) {
      const held = [m.reserve("c", 0.01), m.reserve("c", 0.01), m.reserve("c", 0.01)];
      for (const r of held) m.settle(r);
      expect(m.reservedUsd("c")).toBe(0);
    }
    expect(m.todayUsd("c")).toBeCloseTo(1.2, 10);
    expect(() => m.reserve("c", 0.01)).not.toThrow();
  });
});

describe("observability — refusals are decisions too (R2-28)", () => {
  const refusals: [string, (d: ReturnType<typeof makeDeps>) => Parameters<typeof llm>][] = [];

  it("a cap-breach refusal emits a trace", async () => {
    const { deps, sink } = makeDeps({ capsTable: LOW_CAP_NARROWING });
    const call = () =>
      llm({ ...deps, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: trace("h-cap"),
      });
    for (let i = 0; i < 5; i++) await call();
    sink.events.length = 0;
    await expect(call()).rejects.toThrow(/cap breach refused/);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]!.outcome).toBe("error");
    expect(sink.events[0]!.errorMessage).toMatch(/cap breach refused/);
  });

  it("a cross-tenant refusal emits a trace", async () => {
    const { deps, backend, sink } = makeDeps();
    await expect(
      llm({ ...deps, vault: vaultForClient(backend, "other-client"), bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: trace("h-cross"),
      }),
    ).rejects.toThrow(/cross-client/);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]!.outcome).toBe("error");
  });

  it("an unknown-role refusal emits a trace", async () => {
    const { deps, sink } = makeDeps();
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, {
        role: "no-such-role",
        clientId: TEST_CLIENT,
        input: {},
        trace: trace("h-role"),
      }),
    ).rejects.toThrow(/unknown role/);
    expect(sink.events).toHaveLength(1);
  });

  void refusals;
});

describe("secret containment (R2-14, R2-27)", () => {
  it("a hostile thrown value cannot smuggle the secret out through a getter", async () => {
    const { deps } = makeDeps();
    const hostile = {
      get message() {
        throw new Error("boom");
      },
      toString() {
        throw new Error("boom");
      },
    };
    const evilTransport = {
      async post(_u: string, _b: unknown, headers: Readonly<Record<string, string>>) {
        (hostile as Record<string, unknown>).leaked = JSON.stringify(headers);
        throw hostile;
      },
    };
    const msg = await llm({ ...deps, transport: evilTransport, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: TEST_CLIENT,
      input: {},
      trace: trace("h-hostile"),
    }).then(
      () => "",
      (e: Error) => `${e.name} ${e.message} ${e.stack ?? ""}`,
    );
    expect(msg).not.toContain(CANARY_SECRET);
  });

  it("trace payloads are redacted, not just error messages", async () => {
    const { deps, transport, sink } = makeDeps();
    // A provider that echoes the auth header back inside the response body.
    transport.response = { greeting: `ok ${CANARY_SECRET}` };
    await llm({ ...deps, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: TEST_CLIENT,
      input: { note: `carrying ${CANARY_SECRET}` },
      trace: trace("h-trace"),
    });
    expect(JSON.stringify(sink.events)).not.toContain(CANARY_SECRET);
    expect(JSON.stringify(sink.events)).toContain("[redacted]");
  });
});

describe("vault key composition (R2-30)", () => {
  it("no clientId can collide into another tenant's secret, whatever it contains", () => {
    const backend = new MemoryVaultBackend();
    backend.set("acme corp", "meta-oauth", "acme-secret");
    backend.set("acme\u0000corp", "meta-oauth", "nul-secret");
    // Every hostile shape resolves to its own tenant, or to nothing at all.
    expect(vaultForClient(backend, "acme corp").get("meta-oauth").value).toBe("acme-secret");
    expect(vaultForClient(backend, "acme\u0000corp").get("meta-oauth").value).toBe("nul-secret");
    expect(() => vaultForClient(backend, "acme").get("corp:meta-oauth")).toThrow();
    expect(() => vaultForClient(backend, "acme").get("corp\u0000meta-oauth")).toThrow();
  });
});

describe("diff parsing feeds every gate (R2-06)", () => {
  it("a rename keeps BOTH paths, so neither side escapes a check", () => {
    const parsed = parseNameStatus("R097\tfullburn/config/src/caps.ts\tfullburn/config/src/caps.v2.ts");
    expect(parsed).toEqual([
      { status: "renamed", oldPath: "fullburn/config/src/caps.ts", path: "fullburn/config/src/caps.v2.ts" },
    ]);
  });

  it("adds, deletes and modifies still parse", () => {
    const parsed = parseNameStatus(["A\ta.ts", "D\tb.ts", "M\tc.ts"].join("\n"));
    expect(parsed.map((p: { status: string }) => p.status)).toEqual(["added", "deleted", "modified"]);
  });
});
