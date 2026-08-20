import { describe, expect, it } from "vitest";
import { CapError, getCaps } from "@fullburn/config/caps";
import { ROLE_BINDINGS } from "@fullburn/config/models";
import { llm } from "../src/gateway.ts";
import { TraceContext, TraceEmitError } from "../src/tracing.ts";
import { vaultForClient } from "../src/vault.ts";
import { CANARY_SECRET, LOW_CAP_NARROWING, TEST_CLIENT, makeDeps } from "./helpers.ts";

const trace = () => new TraceContext("t-1", TEST_CLIENT);

describe("llm() — the only call path (Law 11, AC 1 contract half)", () => {
  it("hello-world round-trips through the gateway URL with client key and traced", async () => {
    const { deps, transport, sink } = makeDeps();
    const out = await llm(
      { ...deps, bindings: ROLE_BINDINGS },
      { role: "hello-world", clientId: TEST_CLIENT, input: { say: "hi" }, trace: trace() },
    );
    expect(out).toEqual({ greeting: "hello from the mock gateway" });
    const req = transport.requests[0]!;
    expect(req.url).toBe("https://gateway.ai.cloudflare.com/v1/test-account/fullburn/anthropic/claude-sonnet");
    expect(req.headers["authorization"]).toBe(`Bearer ${CANARY_SECRET}`);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]!.role).toBe("hello-world");
  });

  it("refuses to run without a TraceContext (untraced decisions are bugs)", async () => {
    const { deps } = makeDeps();
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: null as unknown as TraceContext,
      }),
    ).rejects.toThrow(TraceEmitError);
  });

  it("fails closed when the trace sink is down (R8): the call itself fails", async () => {
    const { deps, sink } = makeDeps();
    sink.setFailing(true);
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace() }),
    ).rejects.toThrow(/refusing to proceed untraced/);
  });

  it("ATTACK cap breach: the call over the daily AI cap is refused (R3)", async () => {
    // The narrowing is the METER'S now, supplied at construction — a caller
    // cannot hand ceilings to reserve() any more (R7-06).
    const { deps } = makeDeps({ capsTable: LOW_CAP_NARROWING });
    const call = () =>
      llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace() });
    await call(); // 0.01
    await call(); // 0.02
    await call(); // 0.03
    await call(); // 0.04
    await call(); // 0.05 == cap
    await expect(call()).rejects.toThrow(/cap breach refused/); // 0.06 > 0.05
  });

  it("unsigned caps refuse ALL AI spend (R2, H8)", async () => {
    // Client zero is signed as of 2026-08-16, so this drives a client that is
    // genuinely unsigned. The secret is provisioned deliberately: without it the
    // call would fail on a missing key and the test would pass without the
    // sign-off check ever running.
    const { deps, backend } = makeDeps();
    backend.set("fixture-unsigned", "ai-gateway-key", "unused-by-this-path");
    await expect(
      llm({ ...deps, vault: vaultForClient(backend, "fixture-unsigned"), bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: "fixture-unsigned",
        input: {},
        trace: new TraceContext("t-p", "fixture-unsigned"),
      }),
    ).rejects.toThrow(/human sign-off/);
    expect(() => getCaps("pulsern")).not.toThrow(); // caps exist; they are just unusable
  });

  it("unavailable spend meter refuses spend (fail closed)", async () => {
    const { deps, ledger } = makeDeps();
    ledger.setAvailable(TEST_CLIENT, false, "storage outage fixture");
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace() }),
    ).rejects.toThrow(/fail closed/);
  });

  it("ATTACK cross-client: vault scoped to another client is refused (Law 3)", async () => {
    const { deps, backend } = makeDeps();
    const wrongVault = vaultForClient(backend, "other-client");
    await expect(
      llm({ ...deps, vault: wrongVault, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: trace(),
      }),
    ).rejects.toThrow(/cross-client secret access refused/);
  });

  it("ATTACK cross-client: trace context for another client is refused", async () => {
    const { deps } = makeDeps();
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: new TraceContext("t-x", "other-client"),
      }),
    ).rejects.toThrow(/scoped to a different client/);
  });

  it("schema-invalid output is rejected (§2.4 structured I/O)", async () => {
    const { deps, transport } = makeDeps();
    transport.response = { wrong: 1 };
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace() }),
    ).rejects.toThrow(/missing required field/);
  });

  it("no error path leaks the vault secret (§10.2 token invariant)", async () => {
    const { deps, transport, ledger, sink } = makeDeps();
    const attempts: (() => Promise<unknown>)[] = [
      () => llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: null as unknown as TraceContext }),
      async () => {
        transport.response = { wrong: 1 };
        return llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace() });
      },
      async () => {
        ledger.setAvailable(TEST_CLIENT, false, "storage outage fixture");
        return llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace() });
      },
    ];
    for (const attempt of attempts) {
      const msg = await attempt().then(
        () => "",
        (e: Error) => `${e.name} ${e.message} ${e.stack ?? ""}`,
      );
      expect(msg).not.toContain(CANARY_SECRET);
    }
    ledger.setAvailable(TEST_CLIENT, true, "fixture restored");
    // Traces carry no secrets either (Langfuse is a named leak surface):
    expect(JSON.stringify(sink.events)).not.toContain(CANARY_SECRET);
  });

  it("throws CapError for a client with no caps at all (no default spend)", async () => {
    const { deps, backend } = makeDeps();
    await expect(
      llm({ ...deps, vault: vaultForClient(backend, "ghost"), bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: "ghost",
        input: {},
        trace: new TraceContext("t-g", "ghost"),
      }),
    ).rejects.toThrow(CapError);
  });
});
