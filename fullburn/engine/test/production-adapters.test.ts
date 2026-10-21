import { describe, expect, it } from "vitest";
import { ROLE_BINDINGS } from "@fullburn/config/models";
import { llm, PreDispatchError, servingTransportAllowed } from "../src/gateway.ts";
import { RecordedTransport } from "../src/transport-brand.ts";
import { AiGatewayHttpTransport, GatewayHttpError, type FetchLike } from "../src/gateway-http.ts";
import { LangfuseTraceSink, LangfuseSinkError } from "../src/langfuse-sink.ts";
import { TraceContext, TraceEmitError } from "../src/tracing.ts";
import { CANARY_SECRET, TEST_CLIENT, makeDeps } from "./helpers.ts";

/** X5-12 (GPT-6 Astra, 2026-10-06): Phase 0's hello-world AC had no production
 * transport and no Langfuse sink — only mocks. These drive the shipped
 * adapters through `llm()` against a stubbed fetch: the request each one sends,
 * provider errors, trace-delivery failures, and the returned schema. The live
 * round trip (AC1-live) still needs H2/H5. */

const BASE = "https://gateway.ai.cloudflare.com/v1/test-account/fullburn/";
type Call = { url: string; headers: Record<string, string>; body: string };

function stubFetch(reply: (call: Call) => { status: number; body: string } | Promise<never>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call = { url, headers: init.headers, body: init.body };
    calls.push(call);
    const r = await reply(call);
    return { status: r.status, text: async () => r.body };
  };
  return { fetch, calls };
}

const chat = (content: string) => JSON.stringify({ choices: [{ message: { role: "assistant", content } }] });
const trace = (id: string) => new TraceContext(id, TEST_CLIENT);

describe("AI Gateway HTTP transport (X5-12)", () => {
  /** MUTATION: X5-12a — send the vault key under `authorization` (to the provider) instead of the gateway header. */
  it("round-trips hello-world through the unified endpoint with the gateway credential", async () => {
    const gw = stubFetch(() => ({ status: 200, body: chat('{"greeting":"hello from the gateway"}') }));
    const { deps, sink } = makeDeps({ transport: new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw.fetch }) });
    const out = await llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: { name: "x" }, trace: trace("t-http") });
    expect(out).toEqual({ greeting: "hello from the gateway" });
    expect(gw.calls).toHaveLength(1);
    const [call] = gw.calls;
    expect(call!.url).toBe(`${BASE}compat/chat/completions`);
    expect(call!.headers["cf-aig-authorization"]).toBe(`Bearer ${CANARY_SECRET}`);
    expect(call!.headers["authorization"], "the gateway key was sent as a provider credential").toBeUndefined();
    const sent = JSON.parse(call!.body);
    expect(sent.model).toMatch(/^[a-z-]+\/[\w.-]+$/);
    expect(sent.messages[1].content).toBe(JSON.stringify({ name: "x" }));
    expect(sink.events.map((e) => e.outcome)).toEqual(["ok"]);
  });

  /** MUTATION: X5-12b — treat a non-2xx as success. */
  it("a provider error after dispatch is an error that is SETTLED, its body never echoed", async () => {
    const gw = stubFetch(() => ({ status: 502, body: `upstream said ${CANARY_SECRET}` }));
    const { deps, meter } = makeDeps({ transport: new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw.fetch }) });
    const err = await llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace("t-502") }).then(() => null, (e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toMatch(/HTTP 502/);
    expect(err!.message).not.toContain(CANARY_SECRET);
    expect(meter.todayUsd(TEST_CLIENT), "a dispatched call was released instead of settled").toBeGreaterThan(0);
  });

  it("a reply that is not a JSON object, or that violates the role schema, is refused", async () => {
    for (const content of ["not json", "[1,2]", '{"wrong":"field"}']) {
      const gw = stubFetch(() => ({ status: 200, body: chat(content) }));
      const { deps } = makeDeps({ transport: new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw.fetch }) });
      await expect(llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace("t-bad") })).rejects.toThrow();
    }
  });

  /** MUTATION: X5-12c — let the transport post outside its gateway. */
  it("a URL outside the transport's gateway is refused before dispatch, as PreDispatchError", async () => {
    const gw = stubFetch(() => ({ status: 200, body: chat('{"greeting":"x"}') }));
    const t = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw.fetch });
    await expect(t.post("https://gateway.ai.cloudflare.com/v1/other/gw/openai/gpt-5", { role: "r" }, { authorization: "Bearer k" })).rejects.toBeInstanceOf(PreDispatchError);
    await expect(t.post(`${BASE}openai/gpt-5`, { role: "r" }, {})).rejects.toBeInstanceOf(PreDispatchError);
    // Same path on another origin: the route would parse, so only the origin check refuses it.
    await expect(t.post("https://receiver.example.invalid/v1/test-account/fullburn/openai/gpt-5", { role: "r" }, { authorization: "Bearer k" }), "a URL on another origin was posted").rejects.toBeInstanceOf(PreDispatchError);
    expect(gw.calls, "a refused request was sent").toHaveLength(0);
    expect(() => new AiGatewayHttpTransport({ gatewayBaseUrl: "http://gateway.ai.cloudflare.com/v1/a/b/" })).toThrow(GatewayHttpError);
  });

  /** MUTATION: X5-12f — return a reply that is JSON but not an object. */
  it("the transport itself refuses a reply that is JSON but not an object", async () => {
    for (const content of ["[1,2]", '"a string"', "null", "42"]) {
      const t = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: stubFetch(() => ({ status: 200, body: chat(content) })).fetch });
      await expect(t.post(`${BASE}openai/gpt-5`, { role: "r" }, { authorization: "Bearer k" }), `${content} was returned as model output`).rejects.toThrow(/not a JSON object/);
    }
  });

  it("a network failure after dispatch is an error, not a pre-dispatch release", async () => {
    const t = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: async () => { throw new Error("socket hang up"); } });
    const err = await t.post(`${BASE}openai/gpt-5`, { role: "r" }, { authorization: "Bearer k" }).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(GatewayHttpError);
    expect(err).not.toBeInstanceOf(PreDispatchError);
  });
});

/** Acknowledges every event of the posted batch, as Langfuse's ingestion
 * endpoint does on success. */
const ackAll = (call: Call) => ({
  status: 207,
  body: JSON.stringify({ successes: (JSON.parse(call.body) as { batch: { id: string }[] }).batch.map((e) => ({ id: e.id, status: 201 })), errors: [] }),
});
const lfEvent = (clientId = TEST_CLIENT, traceId = "t") => ({ traceId, clientId, role: "r", model: "m", startedAtMs: 0, input: {}, output: {}, costUsd: 0, outcome: "ok" as const });

describe("Langfuse trace sink (X5-12)", () => {
  const counter = () => { let n = 0; return () => `evt-${++n}`; };
  const opts = (fetchImpl: FetchLike) => ({ host: "https://langfuse.example.invalid", publicKey: "pk-lf-test", secretKey: "sk-lf-test", fetchImpl, newId: counter(), now: () => 0 });

  it("delivers every llm() decision as a namespaced trace plus a generation, with basic auth", async () => {
    const lf = stubFetch(ackAll);
    const gw = stubFetch(() => ({ status: 200, body: chat('{"greeting":"hi"}') }));
    const { deps } = makeDeps({ transport: new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw.fetch }) });
    await llm({ ...deps, sink: new LangfuseTraceSink(opts(lf.fetch)), bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace("t-lf") });
    expect(lf.calls).toHaveLength(1);
    expect(lf.calls[0]!.url).toBe("https://langfuse.example.invalid/api/public/ingestion");
    expect(lf.calls[0]!.headers["authorization"]).toBe(`Basic ${btoa("pk-lf-test:sk-lf-test")}`);
    const batch = JSON.parse(lf.calls[0]!.body).batch;
    expect(batch[0]).toMatchObject({ type: "trace-create", body: { id: `${TEST_CLIENT}/t-lf`, name: "hello-world", userId: TEST_CLIENT } });
    expect(batch[1]).toMatchObject({ type: "generation-create", body: { traceId: `${TEST_CLIENT}/t-lf`, name: "hello-world", output: { greeting: "hi" } } });
    expect(JSON.stringify(batch)).not.toContain(CANARY_SECRET);
  });

  /** MUTATION: X5-12d — ignore per-event errors in a 207. */
  it("a delivery failure fails the call: non-2xx, a rejected event, or the network", async () => {
    for (const reply of [
      () => ({ status: 401, body: "" }),
      () => ({ status: 207, body: JSON.stringify({ successes: [], errors: [{ id: "evt-1", status: 400 }] }) }),
      () => Promise.reject(new Error("offline")) as Promise<never>,
    ]) {
      const lf = stubFetch(reply);
      const sink = new LangfuseTraceSink(opts(lf.fetch));
      await expect(sink.emit(lfEvent())).rejects.toBeInstanceOf(LangfuseSinkError);
      const gw = stubFetch(() => ({ status: 200, body: chat('{"greeting":"hi"}') }));
      const { deps } = makeDeps({ transport: new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw.fetch }) });
      await expect(llm({ ...deps, sink, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace("t-lf-fail") }), "an untraced call succeeded").rejects.toBeInstanceOf(TraceEmitError);
    }
    expect(() => new LangfuseTraceSink({ host: "http://x.invalid", publicKey: "a", secretKey: "b" })).toThrow(LangfuseSinkError);
    expect(() => new LangfuseTraceSink({ host: "https://x.invalid", publicKey: "", secretKey: "b" })).toThrow(LangfuseSinkError);
  });

  /** X7-10 (GPT-6 Astra, 2026-10-09): a reply acknowledging nothing — or the
   * wrong event, or one event twice — passed as delivered.
   * MUTATION: X7-10a, X7-10b, LF-24. */
  it("only a positive acknowledgement of exactly the events sent counts as delivered", async () => {
    const ids = (call: Call) => (JSON.parse(call.body) as { batch: { id: string }[] }).batch.map((e) => e.id);
    for (const [name, reply] of [
      ["no acknowledgement at all", () => ({ status: 207, body: JSON.stringify({ successes: [], errors: [] }) })],
      ["a 200 with an empty body", () => ({ status: 200, body: "" })],
      ["a 200 with no successes field", () => ({ status: 200, body: JSON.stringify({ errors: [] }) })],
      ["an unrelated event id", (c: Call) => ({ status: 207, body: JSON.stringify({ successes: ids(c).map(() => ({ id: "someone-else" })), errors: [] }) })],
      ["one event acknowledged twice, the other not", (c: Call) => ({ status: 207, body: JSON.stringify({ successes: [{ id: ids(c)[0] }, { id: ids(c)[0] }], errors: [] }) })],
      ["every event plus an extra", (c: Call) => ({ status: 207, body: JSON.stringify({ successes: [...ids(c), "extra"].map((id) => ({ id })), errors: [] }) })],
    ] as const) {
      const sink = new LangfuseTraceSink(opts(stubFetch(reply as (c: Call) => { status: number; body: string }).fetch));
      await expect(sink.emit(lfEvent()), `${name} counted as delivered`).rejects.toBeInstanceOf(LangfuseSinkError);
    }
    await expect(new LangfuseTraceSink(opts(stubFetch(ackAll).fetch)).emit(lfEvent())).resolves.toBeUndefined();
  });

  /** X7-11 (GPT-6 Astra, 2026-10-09): two clients' contexts with the same
   * caller-chosen trace id targeted one remote trace. MUTATION: X7-11a, X7-11b. */
  it("two clients with the same trace id, and two decisions under one trace, never share a remote id", async () => {
    const lf = stubFetch(ackAll);
    const sink = new LangfuseTraceSink(opts(lf.fetch));
    await sink.emit(lfEvent("client-a", "shared-id"));
    await sink.emit(lfEvent("client-b", "shared-id"));
    await sink.emit(lfEvent("client-a", "shared-id"));
    const batches = lf.calls.map((c) => (JSON.parse(c.body) as { batch: { type: string; body: { id: string; traceId?: string } }[] }).batch);
    const traceIds = batches.map((b) => b[0]!.body.id);
    expect(traceIds[0], "two clients shared one remote trace").not.toBe(traceIds[1]);
    expect(traceIds[0], "one client's trace id was not stable").toBe(traceIds[2]);
    const decisionIds = batches.map((b) => b[1]!.body.id);
    expect(new Set(decisionIds).size, "two decisions shared one remote id").toBe(3);
    // The separator cannot be forged: a client id that embeds it maps elsewhere.
    await sink.emit(lfEvent("a/b", "c"));
    await sink.emit(lfEvent("a", "b/c"));
    const forged = lf.calls.slice(-2).map((c) => (JSON.parse(c.body) as { batch: { body: { id: string } }[] }).batch[0]!.body.id);
    expect(forged[0]).not.toBe(forged[1]);
  });
});

/** X6-14 (GPT-6 Astra, 2026-10-06): llm() read req.input again for the trace
 * after awaiting the transport, so a caller could swap the input mid-flight
 * and the trace described a prompt the provider never received.
 * MUTATION: X6-14. */
describe("the traced input is the dispatched input", () => {
  it("an input changed while the request is in flight does not change the trace", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((r) => (release = r));
    let dispatched = "";
    const gw: FetchLike = async (_url, init) => {
      dispatched = JSON.parse(init.body).messages[1].content;
      await barrier;
      return { status: 200, text: async () => chat('{"greeting":"hi"}') };
    };
    const { deps, sink } = makeDeps({ transport: new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw }) });
    const req = { role: "hello-world", clientId: TEST_CLIENT, input: { ask: "original", nested: { v: 1 } } as Record<string, unknown>, trace: trace("t-x6-14") };
    const call = llm({ ...deps, bindings: ROLE_BINDINGS }, req);
    await new Promise((r) => setTimeout(r, 0));
    (req.input["nested"] as { v: number }).v = 2;
    req.input = { ask: "replaced" };
    release();
    await call;
    expect(dispatched).toBe(JSON.stringify({ ask: "original", nested: { v: 1 } }));
    expect(sink.events.at(-1)!.input, "the trace recorded an input the provider never received").toEqual({ ask: "original", nested: { v: 1 } });
  });
});

/** x9 X-02 (GPT-6 Luna, 2026-10-10): any object with post() received the
 * Gateway credential. MUTATION: X9-02a..c. */
describe("x9 outside the test runner, only the Gateway adapter on the runtime's fetch is served", () => {
  const outsideRunner = <T>(f: () => T): T => {
    const g = globalThis as Record<string, unknown>;
    const saved = g["__vitest_worker__"];
    delete g["__vitest_worker__"];
    try {
      return f();
    } finally {
      g["__vitest_worker__"] = saved;
    }
  };
  it("refuses a hand-built transport and an adapter over an injected fetch; accepts the adapter on the runtime fetch and a recorded transport", () => {
    const injected = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: async () => ({ status: 200, text: async () => "{}" }) });
    const runtime = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE });
    outsideRunner(() => {
      expect(servingTransportAllowed({ async post() { return {}; } }), "a hand-built transport would receive the credential").toBe(false);
      expect(servingTransportAllowed(injected), "an adapter over an injected fetch would receive the credential").toBe(false);
      expect(servingTransportAllowed(runtime)).toBe(true);
      // x10 X-03: a recorded transport serves an eval candidate only — never the launch map.
      expect(servingTransportAllowed(new RecordedTransport({}), "candidate")).toBe(true);
      expect(servingTransportAllowed(new RecordedTransport({}), "servable"), "a recorded transport would serve production").toBe(false);
      expect(servingTransportAllowed(new RecordedTransport({})), "a recorded transport would serve with no provenance").toBe(false);
      expect(servingTransportAllowed(null)).toBe(false);
    });
    expect(servingTransportAllowed({ async post() { return {}; } }), "the test runner lost its mock transports").toBe(true);
  });
});
