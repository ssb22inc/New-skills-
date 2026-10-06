import { describe, expect, it } from "vitest";
import { ROLE_BINDINGS } from "@fullburn/config/models";
import { llm, PreDispatchError } from "../src/gateway.ts";
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

describe("Langfuse trace sink (X5-12)", () => {
  const opts = (fetchImpl: FetchLike) => ({ host: "https://langfuse.example.invalid", publicKey: "pk-lf-test", secretKey: "sk-lf-test", fetchImpl, newId: () => "evt-1", now: () => 0 });

  it("delivers every llm() decision as a trace-create with basic auth", async () => {
    const lf = stubFetch(() => ({ status: 207, body: JSON.stringify({ successes: [{ id: "evt-1", status: 201 }], errors: [] }) }));
    const gw = stubFetch(() => ({ status: 200, body: chat('{"greeting":"hi"}') }));
    const { deps } = makeDeps({ transport: new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw.fetch }) });
    await llm({ ...deps, sink: new LangfuseTraceSink(opts(lf.fetch)), bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace("t-lf") });
    expect(lf.calls).toHaveLength(1);
    expect(lf.calls[0]!.url).toBe("https://langfuse.example.invalid/api/public/ingestion");
    expect(lf.calls[0]!.headers["authorization"]).toBe(`Basic ${btoa("pk-lf-test:sk-lf-test")}`);
    const batch = JSON.parse(lf.calls[0]!.body).batch;
    expect(batch[0]).toMatchObject({ type: "trace-create", body: { id: "t-lf", name: "hello-world", userId: TEST_CLIENT, output: { greeting: "hi" } } });
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
      await expect(sink.emit({ traceId: "t", clientId: TEST_CLIENT, role: "r", model: "m", startedAtMs: 0, input: {}, output: {}, costUsd: 0, outcome: "ok" })).rejects.toBeInstanceOf(LangfuseSinkError);
      const gw = stubFetch(() => ({ status: 200, body: chat('{"greeting":"hi"}') }));
      const { deps } = makeDeps({ transport: new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw.fetch }) });
      await expect(llm({ ...deps, sink, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace("t-lf-fail") }), "an untraced call succeeded").rejects.toBeInstanceOf(TraceEmitError);
    }
    expect(() => new LangfuseTraceSink({ host: "http://x.invalid", publicKey: "a", secretKey: "b" })).toThrow(LangfuseSinkError);
    expect(() => new LangfuseTraceSink({ host: "https://x.invalid", publicKey: "", secretKey: "b" })).toThrow(LangfuseSinkError);
  });
});
