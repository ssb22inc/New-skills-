import { describe, expect, it } from "vitest";
import { ROLE_BINDINGS } from "@fullburn/config/models";
import { llm, PreDispatchError, servingTransportAllowed } from "../src/gateway.ts";
import { RecordedTransport } from "../src/transport-brand.ts";
import { AiGatewayHttpTransport, GatewayHttpError, unfenceJson, type FetchLike } from "../src/gateway-http.ts";
import { LangfuseTraceSink, LangfuseSinkError, otelTraceId } from "../src/langfuse-sink.ts";
import { TraceContext, TraceEmitError } from "../src/tracing.ts";
import { CANARY_SECRET, OPENROUTER_CANARY, TEST_CLIENT, makeDeps } from "./helpers.ts";

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
    // hello-world routes through OpenRouter (2026-10-21): the gateway's
    // OpenRouter endpoint, the gateway key as the gateway credential, the
    // OpenRouter key as the provider credential, and OpenRouter's model name.
    expect(call!.url).toBe(`${BASE}openrouter/chat/completions`);
    expect(call!.headers["cf-aig-authorization"]).toBe(`Bearer ${CANARY_SECRET}`);
    expect(call!.headers["authorization"], "the gateway key was sent as a provider credential").toBe(`Bearer ${OPENROUTER_CANARY}`);
    const sent = JSON.parse(call!.body);
    expect(sent.model).toBe("anthropic/claude-sonnet-4.5");
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

/** Langfuse's OTLP endpoint answers a 2xx with an empty body or a JSON object. */
const otlpOk = () => ({ status: 200, body: "{}" });
const lfEvent = (clientId = TEST_CLIENT, traceId = "t") => ({ traceId, clientId, role: "r", model: "m", startedAtMs: 0, input: {}, output: {}, costUsd: 0, outcome: "ok" as const });
type Span = { traceId: string; spanId: string; name: string; startTimeUnixNano: string; endTimeUnixNano: string; attributes: { key: string; value: { stringValue: string } }[]; status: { code: number } };
const spanOf = (call: Call): Span => (JSON.parse(call.body) as { resourceSpans: { scopeSpans: { spans: Span[] }[] }[] }).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
const attr = (sp: Span, k: string) => sp.attributes.find((a) => a.key === k)?.value.stringValue;

describe("Langfuse trace sink (X5-12) — OpenTelemetry since 2026-10-21", () => {
  const counter = () => { let n = 0; return () => (++n).toString(16).padStart(16, "0"); };
  const opts = (fetchImpl: FetchLike) => ({ host: "https://langfuse.example.invalid", publicKey: "pk-lf-test", secretKey: "sk-lf-test", fetchImpl, newId: counter(), now: () => 0 });

  /** MUTATION: LF-OT-01 (endpoint), LF-OT-02 (real-time header). */
  it("delivers every llm() decision as one root generation span on the OTLP endpoint, with basic auth and the v4 header", async () => {
    const lf = stubFetch(otlpOk);
    const gw = stubFetch(() => ({ status: 200, body: chat('{"greeting":"hi"}') }));
    const { deps } = makeDeps({ transport: new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw.fetch }) });
    await llm({ ...deps, sink: new LangfuseTraceSink(opts(lf.fetch)), bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace("t-lf") });
    expect(lf.calls).toHaveLength(1);
    expect(lf.calls[0]!.url).toBe("https://langfuse.example.invalid/api/public/otel/v1/traces");
    expect(lf.calls[0]!.headers["authorization"]).toBe(`Basic ${btoa("pk-lf-test:sk-lf-test")}`);
    expect(lf.calls[0]!.headers["x-langfuse-ingestion-version"]).toBe("4");
    const sp = spanOf(lf.calls[0]!);
    expect(sp.traceId).toBe(await otelTraceId(TEST_CLIENT, "t-lf"));
    expect(sp.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(sp.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(attr(sp, "langfuse.observation.type")).toBe("generation");
    expect(attr(sp, "langfuse.trace.name")).toBe("hello-world");
    expect(attr(sp, "langfuse.user.id")).toBe(TEST_CLIENT);
    expect(JSON.parse(attr(sp, "langfuse.observation.output")!)).toEqual({ greeting: "hi" });
    expect(lf.calls[0]!.body).not.toContain(CANARY_SECRET);
  });

  /** MUTATION: X5-12d, X5-12e. */
  it("a delivery failure fails the call: non-2xx, a rejected span, an unreadable body, or the network", async () => {
    for (const reply of [
      () => ({ status: 401, body: "" }),
      () => ({ status: 200, body: JSON.stringify({ partialSuccess: { rejectedSpans: 1, errorMessage: "bad span" } }) }),
      () => ({ status: 200, body: "<html>not json</html>" }),
      () => ({ status: 200, body: "[]" }),
      () => Promise.reject(new Error("offline")) as Promise<never>,
    ]) {
      const lf = stubFetch(reply);
      const sink = new LangfuseTraceSink(opts(lf.fetch));
      await expect(sink.emit(lfEvent())).rejects.toBeInstanceOf(LangfuseSinkError);
      const gw = stubFetch(() => ({ status: 200, body: chat('{"greeting":"hi"}') }));
      const { deps } = makeDeps({ transport: new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: gw.fetch }) });
      await expect(llm({ ...deps, sink, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: trace("t-lf-fail") }), "an untraced call succeeded").rejects.toBeInstanceOf(TraceEmitError);
    }
    // OTLP successes: an empty body and a JSON object with no rejected spans.
    for (const body of ["", "{}", JSON.stringify({ partialSuccess: {} }), JSON.stringify({ partialSuccess: { rejectedSpans: 0 } })]) {
      await expect(new LangfuseTraceSink(opts(stubFetch(() => ({ status: 200, body })).fetch)).emit(lfEvent()), `${JSON.stringify(body)} was refused`).resolves.toBeUndefined();
    }
    expect(() => new LangfuseTraceSink({ host: "http://x.invalid", publicKey: "a", secretKey: "b" })).toThrow(LangfuseSinkError);
    expect(() => new LangfuseTraceSink({ host: "https://x.invalid", publicKey: "", secretKey: "b" })).toThrow(LangfuseSinkError);
  });

  /** X7-11 (GPT-6 Luna, 2026-10-09): two clients with one caller-chosen trace
   * id must not share a remote trace; two decisions must not share a span.
   * MUTATION: X7-11a, X7-11b. */
  it("two clients with the same trace id, and two decisions under one trace, never share a remote id", async () => {
    const lf = stubFetch(otlpOk);
    const sink = new LangfuseTraceSink(opts(lf.fetch));
    await sink.emit(lfEvent("client-a", "shared-id"));
    await sink.emit(lfEvent("client-b", "shared-id"));
    await sink.emit(lfEvent("client-a", "shared-id"));
    const spans = lf.calls.map(spanOf);
    expect(spans[0]!.traceId, "two clients shared one remote trace").not.toBe(spans[1]!.traceId);
    expect(spans[0]!.traceId, "one client's trace id was not stable").toBe(spans[2]!.traceId);
    expect(new Set(spans.map((sp) => sp.spanId)).size, "two decisions shared one span").toBe(3);
    // The separator cannot be forged: a client id that embeds it maps elsewhere.
    expect(await otelTraceId("a:b", "c")).not.toBe(await otelTraceId("a", "b:c"));
  });

  it("a span id that is not 16 hex characters is refused before anything is sent", async () => {
    const lf = stubFetch(otlpOk);
    const sink = new LangfuseTraceSink({ ...opts(lf.fetch), newId: () => "evt-1" });
    await expect(sink.emit(lfEvent())).rejects.toThrow(/16 lowercase hex/);
    expect(lf.calls).toEqual([]);
  });
});

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

/** The first live check (2026-10-21) got a bare "HTTP 401" — a bad gateway
 * token and a missing provider key look the same. Codes cross; text never.
 * MUTATION: GH-12c. */
describe("a non-2xx reply names its machine error codes and nothing else", () => {
  it("reports Cloudflare and provider codes, drops free-text messages", async () => {
    const cf = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: async () => ({ status: 401, text: async () => JSON.stringify({ success: false, errors: [{ code: 2009, message: "Unauthorized: leaked-detail" }] }) }) });
    const err = await cf.post(`${BASE}openai/gpt-5`, { role: "r" }, { authorization: "Bearer k" }).then(() => null, (e: unknown) => e as Error);
    expect(err?.message).toBe("AI Gateway returned HTTP 401 (code 2009)");
    const provider = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: async () => ({ status: 401, text: async () => JSON.stringify({ type: "error", error: { type: "authentication_error", message: "x-api-key header is required: echo-of-prompt" } }) }) });
    const perr = await provider.post(`${BASE}openai/gpt-5`, { role: "r" }, { authorization: "Bearer k" }).then(() => null, (e: unknown) => e as Error);
    expect(perr?.message).toBe("AI Gateway returned HTTP 401 (authentication_error)");
    expect(perr?.message, "free text crossed").not.toMatch(/echo-of-prompt|x-api-key/);
    const plain = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: async () => ({ status: 502, text: async () => "<html>bad gateway with secret-ish text</html>" }) });
    expect((await plain.post(`${BASE}openai/gpt-5`, { role: "r" }, { authorization: "Bearer k" }).then(() => null, (e: unknown) => e as Error))?.message).toBe("AI Gateway returned HTTP 502");
    const sneaky = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: async () => ({ status: 400, text: async () => JSON.stringify({ error: { type: "Has Spaces And A Sentence", code: "this-identifier-is-far-too-long-to-be-an-error-code" } }) }) });
    expect((await sneaky.post(`${BASE}openai/gpt-5`, { role: "r" }, { authorization: "Bearer k" }).then(() => null, (e: unknown) => e as Error))?.message, "a non-identifier crossed").toBe("AI Gateway returned HTTP 400");
  });
});

/** NO PROVIDER LOCK-IN (human instructions 2026-10-21). A route the gateway
 * credentials itself (BYOK / Unified Billing) carries NO provider credential
 * from Fullburn; an OpenRouter route carries exactly the OpenRouter key from
 * the client's vault — one aggregator key for every vendor's model. A route
 * with no OpenRouter key is refused before dispatch. MUTATION: NL-01, OR-01..03. */
describe("no request names a vendor credential — any model runs on the gateway token, or the one OpenRouter key", () => {
  const send = async (route: string, headers: Record<string, string>) => {
    const seen: Record<string, string>[] = [];
    const bodies: string[] = [];
    const urls: string[] = [];
    const t = new AiGatewayHttpTransport({
      gatewayBaseUrl: BASE,
      fetchImpl: async (u, init) => {
        urls.push(u);
        seen.push(init.headers);
        bodies.push(init.body);
        return { status: 200, text: async () => chat('{"greeting":"hi"}') };
      },
    });
    await t.post(new URL(route, BASE).toString(), { role: "r", input: {} }, headers);
    return { headers: seen[0]!, body: JSON.parse(bodies[0]!) as { model: string }, url: urls[0]! };
  };
  it("a gateway-credentialed route sends only the gateway's headers, even when a provider key is offered", async () => {
    const r = await send("workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast", { authorization: "Bearer gw-token", "x-fullburn-client": "c", "x-provider-authorization": "Bearer should-not-cross" });
    expect(Object.keys(r.headers).sort()).toEqual(["cf-aig-authorization", "cf-aig-metadata", "content-type"]);
    expect(r.url).toBe(`${BASE}compat/chat/completions`);
  });
  it("every registered model reaches its vendor through OpenRouter with the one OpenRouter key", async () => {
    const { MODELS } = await import("@fullburn/config/models");
    for (const m of Object.values(MODELS)) {
      expect(m.gatewayRoute, `${m.id} is not on the OpenRouter route`).toMatch(/^openrouter\//);
      const r = await send(m.gatewayRoute, { authorization: "Bearer gw-token", "x-fullburn-client": "c", "x-provider-authorization": "Bearer or-key" });
      expect(Object.keys(r.headers).sort(), `${m.id} sent an unexpected header`).toEqual(["authorization", "cf-aig-authorization", "cf-aig-metadata", "content-type"]);
      expect(r.headers["authorization"]).toBe("Bearer or-key");
      expect(r.url).toBe(`${BASE}openrouter/chat/completions`);
      expect(r.body.model, `${m.id}'s OpenRouter model name`).toBe(m.gatewayRoute.slice("openrouter/".length));
    }
  });
  it("an OpenRouter route without the OpenRouter key is refused before anything is sent", async () => {
    const calls: string[] = [];
    const t = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: async (u) => { calls.push(u); return { status: 200, text: async () => "{}" }; } });
    await expect(t.post(`${BASE}openrouter/openai/gpt-5`, { role: "r" }, { authorization: "Bearer gw" })).rejects.toBeInstanceOf(PreDispatchError);
    expect(calls).toEqual([]);
  });
});

/** The first live OpenRouter call (2026-10-21) answered with its JSON inside a
 * Markdown fence. One fence around the whole reply is unwrapped; nothing else
 * is forgiven. MUTATION: OR-05. */
describe("a fenced JSON reply is unwrapped; prose is not", () => {
  it("unwraps exactly one whole-reply fence, with or without the json tag", async () => {
    expect(unfenceJson('```json\n{"greeting":"hi"}\n```')).toBe('{"greeting":"hi"}');
    expect(unfenceJson('```\n{"a":1}\n```\n')).toBe('{"a":1}');
    expect(unfenceJson('{"a":1}')).toBe('{"a":1}');
    expect(unfenceJson('Sure! ```json\n{"a":1}\n```'), "prose before a fence was forgiven").toBe('Sure! ```json\n{"a":1}\n```');
    expect(unfenceJson('```json\n{"a":1}\n```\nHope this helps'), "prose after a fence was forgiven").toBe('```json\n{"a":1}\n```\nHope this helps');
    expect(unfenceJson('```json\n{"a":1}\n```\n```json\n{"b":2}\n```'), "two blocks were forgiven").toContain("```");
    const t = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: async () => ({ status: 200, text: async () => chat('```json\n{"greeting":"hi"}\n```') }) });
    await expect(t.post(`${BASE}openai/gpt-5`, { role: "r" }, { authorization: "Bearer k" })).resolves.toEqual({ greeting: "hi" });
    const prose = new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: async () => ({ status: 200, text: async () => chat('Here you go: {"greeting":"hi"}') }) });
    await expect(prose.post(`${BASE}openai/gpt-5`, { role: "r" }, { authorization: "Bearer k" })).rejects.toThrow(/not JSON/);
  });
});
