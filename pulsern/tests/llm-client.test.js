/* The shared OpenRouter client, as seen on the wire.
   ------------------------------------------------------------------
   Every reviewer and generator now goes through this one client, so a fault
   here is a fault in every gate at once. These tests assert what is actually
   SENT, because the failure that motivated them is invisible from the caller:
   switching the reviewer to a reasoning model while the client still sends a
   sampling temperature it does not accept. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { llmCall, llm, FatalLlmError } from "../ops/llm.mjs";
import { REVIEW_MODEL, GEN_MODEL, assertCrossFamily, acceptsTemperature, familyOf } from "../ops/models.mjs";

const ok = (content, usage = { prompt_tokens: 120, completion_tokens: 40, cost: 0.0032 }) => ({
  ok: true, status: 200, headers: { get: () => null },
  json: async () => ({ id: "gen-1", model: "x", choices: [{ message: { content } }], usage }),
});
const fail = (status, message) => ({
  ok: false, status, headers: { get: () => null },
  json: async () => ({ error: { message } }),
});

let sent;
beforeEach(() => {
  sent = [];
  process.env.OPENROUTER_API_KEY = "test-key";
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function stubFetch(...responses) {
  const queue = [...responses];
  globalThis.fetch = vi.fn(async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return queue.shift();
  });
}
/* Retries sleep with jitter; run the timers so tests do not wait for real. */
async function settle(promise) {
  const done = promise.then((v) => ({ v }), (e) => ({ e }));
  for (let i = 0; i < 20; i++) await vi.runAllTimersAsync();
  return done;
}

describe("model registry", () => {
  it("makes Astra the reviewer and keeps the writer in another family", () => {
    expect(REVIEW_MODEL).toBe("openai/gpt-6-astra");
    expect(familyOf(GEN_MODEL)).not.toBe(familyOf(REVIEW_MODEL));
    expect(() => assertCrossFamily(GEN_MODEL, REVIEW_MODEL)).not.toThrow();
  });

  it("refuses a model reviewing its own family", () => {
    expect(() => assertCrossFamily("anthropic/claude-sonnet-4.6", "anthropic/claude-opus-5"))
      .toThrow(/Same-family review refused/);
    expect(() => assertCrossFamily("openai/gpt-4.1", "openai/gpt-6-astra"))
      .toThrow(/Same-family/);
  });

  it("refuses to guess when a family cannot be read", () => {
    expect(() => assertCrossFamily("", REVIEW_MODEL)).toThrow(/Cannot determine/);
  });

  it("knows Astra takes no sampling temperature", () => {
    expect(acceptsTemperature("openai/gpt-6-astra")).toBe(false);
    expect(acceptsTemperature("anthropic/claude-sonnet-4.6")).toBe(true);
  });
});

describe("what goes over the wire", () => {
  it("never sends temperature to Astra, even when a caller asks for it", async () => {
    stubFetch(ok("fine"));
    await llmCall({ model: REVIEW_MODEL, prompt: "x", temperature: 0.7 });
    expect(sent[0]).not.toHaveProperty("temperature");
  });

  /* The wrapper the factories call still passes 0.7. This is the exact path
     that would have broken when the reviewer switched. */
  it("drops temperature on the legacy llm() path too", async () => {
    stubFetch(ok("fine"));
    await llm(REVIEW_MODEL, "x");
    expect(sent[0]).not.toHaveProperty("temperature");
  });

  it("still sends temperature to a writer that accepts it", async () => {
    stubFetch(ok("fine"));
    await llm(GEN_MODEL, "x");
    expect(sent[0].temperature).toBe(0.7);
  });

  it("asks for usage accounting so every call can report its cost", async () => {
    stubFetch(ok("fine"));
    await llmCall({ model: REVIEW_MODEL, prompt: "x" });
    expect(sent[0].usage).toEqual({ include: true });
  });

  it("passes reasoning effort and a response schema through untouched", async () => {
    stubFetch(ok("{}"));
    const fmt = { type: "json_schema", json_schema: { name: "v", strict: true, schema: { type: "object" } } };
    await llmCall({ model: REVIEW_MODEL, prompt: "x", reasoningEffort: "high", responseFormat: fmt });
    expect(sent[0].reasoning).toEqual({ effort: "high" });
    expect(sent[0].response_format).toEqual(fmt);
  });
});

describe("what comes back", () => {
  it("returns the text and the real cost", async () => {
    stubFetch(ok("verdict", { prompt_tokens: 1000, completion_tokens: 200, cost: 0.02, completion_tokens_details: { reasoning_tokens: 150 } }));
    const r = await llmCall({ model: REVIEW_MODEL, prompt: "x" });
    expect(r.text).toBe("verdict");
    expect(r.usage).toEqual({ promptTokens: 1000, completionTokens: 200, reasoningTokens: 150, costUsd: 0.02 });
  });

  /* A missing cost must read as unknown, never as free. */
  it("reports an unknown cost as null, not zero", async () => {
    stubFetch(ok("verdict", { prompt_tokens: 10, completion_tokens: 5 }));
    const r = await llmCall({ model: REVIEW_MODEL, prompt: "x" });
    expect(r.usage.costUsd).toBeNull();
  });

  it("retries a rate limit and then succeeds", async () => {
    stubFetch(fail(429, "slow down"), ok("done"));
    const { v } = await settle(llmCall({ model: REVIEW_MODEL, prompt: "x" }));
    expect(v.text).toBe("done");
    expect(sent).toHaveLength(2);
  });

  it("stops at once on an empty balance instead of retrying", async () => {
    stubFetch(fail(402, "Insufficient credits"));
    const { e } = await settle(llmCall({ model: REVIEW_MODEL, prompt: "x" }));
    expect(e).toBeInstanceOf(FatalLlmError);
    expect(sent).toHaveLength(1);
  });

  it("does not retry a request the server rejected as malformed", async () => {
    stubFetch(fail(400, "bad parameter"));
    const { e } = await settle(llmCall({ model: REVIEW_MODEL, prompt: "x" }));
    expect(e.message).toMatch(/400 bad parameter/);
    expect(sent).toHaveLength(1);
  });

  it("refuses to run without a key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(llmCall({ model: REVIEW_MODEL, prompt: "x" })).rejects.toThrow(/OPENROUTER_API_KEY/);
  });
});
