import "./live-fetch-stub.ts"; // FIRST: the adapter captures the runtime fetch at load (x8 X-04)
import { describe, expect, it } from "vitest";
import { ROLE_BINDINGS, ROLE_CARDS, bindRole } from "@fullburn/config/models";
import { GOLDEN } from "../evals/genome-tagger/golden.ts";
import { GOLDEN as ADVERSARY_GOLDEN } from "../evals/creative-decision-adversary/golden.ts";
import { RECORDED_CLAUDE_SONNET as ADV_CLAUDE, RECORDED_LLAMA_70B as ADV_LLAMA } from "../evals/creative-decision-adversary/recorded-outputs.ts";
import { RECORDED_GPT_5, RECORDED_LLAMA_70B, RECORDED_QWEN_72B } from "../evals/genome-tagger/recorded-outputs.ts";
import { RecordedTransport, runEval, structurallyEqual } from "../src/eval-harness.ts";
import * as transportBrand from "../src/transport-brand.ts";
const { isRecordedTransport } = transportBrand;
import { llm } from "../src/gateway.ts";
import { TraceContext } from "../src/tracing.ts";
import { TEST_CLIENT, makeDeps, queuedGateway, runtimeGateway } from "./helpers.ts";
import { bindRoleLive, runLiveEval } from "../src/live-eval.ts";
import { AiGatewayHttpTransport } from "../src/gateway-http.ts";
import { GOLDEN_SETS, attestEvalRun } from "@fullburn/config/models";

describe("eval harness + rebind (AC 2, §2.4, R6)", () => {
  it("scores are COMPUTED from recorded outputs — a divergent output costs the score", async () => {
    const { deps } = makeDeps();
    const res = await runEval(deps, "genome-tagger", "qwen-72b", GOLDEN, new RecordedTransport(RECORDED_QWEN_72B), TEST_CLIENT);
    expect(res.total).toBe(5);
    expect(res.passed).toBe(4); // g5 diverges by construction
    expect(res.score).toBe(0.8);
    expect(res.failures).toEqual(["g5: field mismatch"]);
  });

  it("AC 2 — rebinding FRONTIER → OPEN-SOURCE passes evals and serves with zero code change", async () => {
    // Adversary finding F15: the previous version of this test rebound
    // qwen-72b → qwen-72b, which demonstrated nothing. Start from a frontier
    // binding and move the role to an open-source model on the evidence of an
    // actual harness run.
    // X7-09: production serving is earned by a LIVE eval — the golden set
    // served through the production AI Gateway adapter (here over a stubbed
    // fetch answering with the recorded outputs) — and bound by bindRoleLive.
    const { deps } = makeDeps();
    const gw = await runtimeGateway();
    gw.queue.push(...GOLDEN.map((c) => RECORDED_GPT_5[c.id]));
    const frontierEval = await runLiveEval(deps, "genome-tagger", "gpt-5", GOLDEN, gw.transport, TEST_CLIENT);
    const frontier = bindRoleLive(ROLE_BINDINGS, "genome-tagger", "gpt-5", frontierEval.attestation);
    gw.queue.push({ hook: "pov", angle: "x", emotion: "y", format: "z", offer: "none" });
    await llm({ ...deps, transport: gw.transport, bindings: frontier }, {
      role: "genome-tagger",
      clientId: TEST_CLIENT,
      input: { ad: "some ad" },
      trace: new TraceContext("t-frontier", TEST_CLIENT),
    });
    expect(gw.calls.at(-1)).toContain("openai/gpt-5");

    gw.queue.push(...GOLDEN.map((c) => RECORDED_QWEN_72B[c.id]));
    const res = await runLiveEval(deps, "genome-tagger", "qwen-72b", GOLDEN, gw.transport, TEST_CLIENT);
    const rebound = bindRoleLive(frontier, "genome-tagger", "qwen-72b", res.attestation);

    // Same call site, same everything — only the bindings object changed.
    gw.queue.push({ hook: "pov", angle: "x", emotion: "y", format: "z", offer: "none" });
    await llm({ ...deps, transport: gw.transport, bindings: rebound }, {
      role: "genome-tagger",
      clientId: TEST_CLIENT,
      input: { ad: "some ad" },
      trace: new TraceContext("t-oss", TEST_CLIENT),
    });
    expect(gw.calls.at(-1)).toContain("workers-ai/qwen-72b");
  });

  it("a bad candidate fails the harness and bindRole refuses it", async () => {
    const { deps } = makeDeps();
    const res = await runEval(deps, "genome-tagger", "llama-70b", GOLDEN, new RecordedTransport(RECORDED_LLAMA_70B), TEST_CLIENT);
    expect(res.score).toBeLessThan(ROLE_CARDS["genome-tagger"]!.evalThreshold);
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", res.attestation)).toThrow(/no pass, no bind/);
  });

  it("an empty golden set is refused — an eval over nothing proves nothing", async () => {
    const { deps } = makeDeps();
    await expect(
      runEval(deps, "genome-tagger", "qwen-72b", [], new RecordedTransport({}), TEST_CLIENT),
    ).rejects.toThrow(/proves nothing/);
  });

  /** X-13 (cross-family, 2026-09-24): the adversary golden set expects a
   * `reasons` ARRAY, and a perfect recorded answer scored 0/3 because arrays
   * were compared by identity. A structured field is compared structurally,
   * including after the JSON round-trip a real transport imposes.
   *
   * MUTATION: X1-13 — compare with `===` again. */
  it("a perfect structured adversary answer scores 3/3; a wrong one scores 2/3", async () => {
    const { deps } = makeDeps();
    const good = await runEval(deps, "creative-decision-adversary", "claude-sonnet", ADVERSARY_GOLDEN, new RecordedTransport(ADV_CLAUDE), TEST_CLIENT);
    expect(good.score, good.failures.join("; ")).toBe(1);
    const roundTripped = new RecordedTransport(JSON.parse(JSON.stringify(ADV_CLAUDE)));
    expect((await runEval(deps, "creative-decision-adversary", "claude-sonnet", ADVERSARY_GOLDEN, roundTripped, TEST_CLIENT)).score).toBe(1);
    const bad = await runEval(deps, "creative-decision-adversary", "llama-70b", ADVERSARY_GOLDEN, new RecordedTransport(ADV_LLAMA), TEST_CLIENT);
    expect(bad.score).toBeCloseTo(2 / 3, 10);
    // The comparison itself, at its edges.
    expect(structurallyEqual(["a"], ["a"])).toBe(true);
    expect(structurallyEqual(["a"], ["a", "b"])).toBe(false);
    expect(structurallyEqual({ x: [1, { y: 2 }] }, { x: [1, { y: 2 }] })).toBe(true);
    expect(structurallyEqual({ x: 1 }, { x: 1, z: 2 })).toBe(false);
    expect(structurallyEqual(null, {})).toBe(false);
    expect(structurallyEqual([], {})).toBe(false);
  });

  /** X-10 (cross-family, 2026-09-24): `llm()` served under any binding map
   * it was handed; the family-diversity rule lived only in config/models.ts's
   * default export. Now the SERVING path validates: incomplete, unknown-model
   * and same-family maps are refused before any credential or transport.
   *
   * MUTATION: X1-10 — drop validateBindings from llm(). */
  it("llm refuses an incomplete, unknown-model or same-family binding map before dispatch", async () => {
    const { deps, transport } = makeDeps();
    const call = (bindings: Record<string, string>) =>
      llm({ ...deps, bindings }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: new TraceContext("x10", TEST_CLIENT) });
    await expect(call({})).rejects.toThrow(/declared but unbound/);
    await expect(call({ ...ROLE_BINDINGS, "hello-world": "no-such-model" })).rejects.toThrow(/unknown model/);
    // Builder and adversary in one domain on the same family.
    const builderRole = Object.keys(ROLE_CARDS).find((r) => ROLE_CARDS[r]!.side === "builder" && ROLE_CARDS[r]!.domain === ROLE_CARDS["creative-decision-adversary"]!.domain)!;
    await expect(call({ ...ROLE_BINDINGS, [builderRole]: ROLE_BINDINGS["creative-decision-adversary"]! })).rejects.toThrow(/family-diversity violation/);
    expect(transport.requests.length, "a refused map still reached the transport").toBe(0);
    // And the launch table serves; a SPREAD COPY of it does not (X2-09).
    await expect(call(ROLE_BINDINGS)).resolves.toBeDefined();
    await expect(call({ ...ROLE_BINDINGS })).rejects.toThrow(/not produced by bindRole or the launch table/);
  });

  /** X-05 (cross-family, 2026-09-24): `gatewayBaseUrl` was caller-controlled
   * and the vault key went wherever it pointed. The origin is now pinned and
   * checked BEFORE the vault is read: a vault that throws on any read proves
   * the order, because the refusal seen is the origin's, not the vault's.
   *
   * MUTATION: X1-05 — drop the origin check. */
  it("a gateway base off the AI Gateway is refused before the vault is read", async () => {
    const { deps, transport } = makeDeps();
    // Scoped to the right client (the scope check precedes everything), and
    // throwing on any read: the refusal seen must be the origin's.
    // X2-13 (cross-family, 2026-09-24): a vault that only THREW proved the
    // wrong property — the priming read had already happened and its throw was
    // swallowed. The vault now COUNTS: zero reads is the claim.
    let reads = 0;
    const vault = { clientId: TEST_CLIENT, get() { reads += 1; throw new Error("VAULT READ — the origin check did not come first"); } } as unknown as typeof deps.vault;
    const call = (gatewayBaseUrl: string) =>
      llm({ ...deps, vault, gatewayBaseUrl, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: new TraceContext("x05", TEST_CLIENT) });
    await expect(call("https://receiver.example.invalid/v1/a/b/")).rejects.toThrow(/is not the AI Gateway/);
    await expect(call("http://gateway.ai.cloudflare.com/v1/a/b/")).rejects.toThrow(/is not the AI Gateway/);
    await expect(call("https://gateway.ai.cloudflare.com.evil.example/v1/a/b/")).rejects.toThrow(/is not the AI Gateway/);
    await expect(call("https://user:pw@gateway.ai.cloudflare.com/v1/a/b/")).rejects.toThrow(/is not the AI Gateway/);
    await expect(call("https://gateway.ai.cloudflare.com/v2/a/b/")).rejects.toThrow(/is not the AI Gateway/);
    await expect(call("nonsense")).rejects.toThrow(/is not a URL/);
    expect(reads, "the vault was read before the origin was checked").toBe(0);
    expect(transport.requests.length, "a refused base still reached the transport").toBe(0);
    // The real base, with the real vault, serves.
    await expect(llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: new TraceContext("x05-ok", TEST_CLIENT) })).resolves.toBeDefined();
  });

  /** X2-09 (cross-family, 2026-09-24), the recorded-transport half: a
   * candidate map is servable only through recorded outputs, so the brand
   * must be unforgeable. MUTATION: XB-03 (final), XB-05 (registrar once). */
  it("the recorded brand cannot be forged: the class is final and the registrar is claimed once", () => {
    const genuine = new RecordedTransport({});
    expect(isRecordedTransport(genuine)).toBe(true);
    expect(isRecordedTransport({ post: async () => ({}) }), "a look-alike carried the brand").toBe(false);
    class Live extends RecordedTransport {
      override async post(): Promise<unknown> { return { greeting: "from the network" }; }
    }
    expect(() => new Live({}), "a subclass carried the recorded brand to a live post()").toThrow(/final/);
    // X3-14: there is no registrar to claim — the brand set is module-private
    // and only the class's own constructor writes it.
    expect(Object.keys(transportBrand).sort(), "the brand module exports a way to brand a transport").toEqual(["RecordedTransport", "isRecordedTransport"]);
    // And the prototype cannot be patched to a live post().
    expect(() => { (RecordedTransport.prototype as unknown as { post: unknown }).post = async () => ({}); }).toThrow();
  });

  /** X2-09, the golden-set half: ids and required fields matched, so a set
   * whose EXPECTED values were rewritten to the candidate's wrong answers
   * scored a failing model 1.0. MUTATION: XB-04. */
  it("runEval refuses a golden set whose expectations were rewritten to the candidate's answers", async () => {
    const { deps } = makeDeps();
    const rigged = GOLDEN.map((c) => ({ ...c, expected: RECORDED_LLAMA_70B[c.id] as Record<string, unknown> }));
    await expect(runEval(deps, "genome-tagger", "llama-70b", rigged, new RecordedTransport(RECORDED_LLAMA_70B), TEST_CLIENT)).rejects.toThrow(/not the role's canonical set/);
    // The canonical set, structurally copied, is accepted.
    const copy = JSON.parse(JSON.stringify(GOLDEN));
    const res = await runEval(deps, "genome-tagger", "llama-70b", copy, new RecordedTransport(RECORDED_LLAMA_70B), TEST_CLIENT);
    expect(res.score).toBeLessThan(0.5);
  });

  /** X3-10: bindRole marked its whole result servable after checking only the
   * role it changed. MUTATION: X3-10. */
  it("bindRole refuses to launder an unevaluated base map through one attested role", async () => {
    const { deps } = makeDeps();
    const res = await runEval(deps, "genome-tagger", "qwen-72b", GOLDEN, new RecordedTransport(RECORDED_QWEN_72B), TEST_CLIENT);
    const unearned = { ...ROLE_BINDINGS, "creative-decision-adversary": "llama-70b" };
    expect(() => bindRole(unearned, "genome-tagger", "qwen-72b", res.attestation)).toThrow(/no serving provenance/);
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "qwen-72b", res.attestation)).not.toThrow();
  });

  /** X3-11: only the outer record was frozen. MUTATION: X3-11. */
  it("the canonical golden expectations cannot be rewritten at runtime", async () => {
    const { CANONICAL_GOLDEN_SETS } = await import("../evals/index.ts");
    const c = CANONICAL_GOLDEN_SETS["genome-tagger"]![0]!;
    expect(() => { (c.expected as Record<string, unknown>)["hook"] = "unknown"; }).toThrow();
    expect(() => { (CANONICAL_GOLDEN_SETS["genome-tagger"] as unknown as unknown[]).push({}); }).toThrow();
    expect(c.expected["hook"]).toBe("pov");
  });
});

/** X6-13 (GPT-6 Astra, 2026-10-06): eval trace ids were `eval-<role>-<case>`,
 * identical across models, clients and runs, so Langfuse — which keys a trace
 * by its id — merged distinct decisions. MUTATION: X6-13. */
describe("eval traces are distinct per model, client and run", () => {
  it("no two eval decisions share a trace id", async () => {
    const { deps, sink } = makeDeps();
    await runEval(deps, "genome-tagger", "qwen-72b", GOLDEN, new RecordedTransport(RECORDED_QWEN_72B), TEST_CLIENT);
    await runEval(deps, "genome-tagger", "qwen-72b", GOLDEN, new RecordedTransport(RECORDED_QWEN_72B), TEST_CLIENT);
    await runEval(deps, "genome-tagger", "llama-70b", GOLDEN, new RecordedTransport(RECORDED_LLAMA_70B), TEST_CLIENT);
    const ids = sink.events.map((e) => e.traceId);
    expect(ids.length).toBeGreaterThanOrEqual(GOLDEN.length * 3);
    expect(new Set(ids).size, "two eval decisions were traced under one id").toBe(ids.length);
    expect(ids.every((id) => id.includes(TEST_CLIENT)), "an eval trace id does not name its client").toBe(true);
  });
});

/** X7-09 (GPT-6 Astra, 2026-10-09): the golden set's own answers, handed to
 * the grader with no model called, authorized production serving; and no
 * live eval path existed. MUTATION: X7-09a..e. */
describe("x7 recorded evidence never reaches production serving", () => {
  const req = (id: string) => ({ role: "genome-tagger", clientId: TEST_CLIENT, input: { ad: "x" }, trace: new TraceContext(id, TEST_CLIENT) });
  it("fabricated answers bind, but the map serves recorded outputs only — never the production adapter", async () => {
    const { deps } = makeDeps();
    const fabricated = attestEvalRun("genome-tagger", "llama-70b", GOLDEN_SETS["genome-tagger"]!.map((c) => ({ caseId: c.id, output: c.expected })));
    const bound = bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", fabricated);
    const gw = queuedGateway();
    gw.queue.push({ hook: "h", angle: "a", emotion: "e", format: "f", offer: "o" });
    await expect(llm({ ...deps, transport: gw.transport, bindings: bound }, req("x7-09-live")), "fabricated answers served production traffic").rejects.toThrow(/earned on recorded eval evidence/);
    expect(gw.calls, "a request left for the provider under a fabricated binding").toEqual([]);
    const recorded = new RecordedTransport({ g1: { hook: "h", angle: "a", emotion: "e", format: "f", offer: "o" } });
    recorded.setCase("g1");
    await expect(llm({ ...deps, transport: recorded, bindings: bound }, req("x7-09-rec"))).resolves.toBeDefined();
    // The launch table is production-servable as it stands.
    gw.queue.push({ hook: "h", angle: "a", emotion: "e", format: "f", offer: "o" });
    await expect(llm({ ...deps, transport: gw.transport, bindings: ROLE_BINDINGS }, req("x7-09-launch"))).resolves.toBeDefined();
  });

  it("bindRoleLive takes live evidence over a production base only", async () => {
    const { deps } = makeDeps();
    const recordedRun = await runEval(deps, "genome-tagger", "qwen-72b", GOLDEN, new RecordedTransport(RECORDED_QWEN_72B), TEST_CLIENT);
    expect(() => bindRoleLive(ROLE_BINDINGS, "genome-tagger", "qwen-72b", recordedRun.attestation), "recorded evidence bound for production").toThrow(/needs a live eval run/);
    const gw = await runtimeGateway();
    gw.queue.push(...GOLDEN.map((c) => RECORDED_QWEN_72B[c.id]));
    const live = await runLiveEval(deps, "genome-tagger", "qwen-72b", GOLDEN, gw.transport, TEST_CLIENT);
    const recordedBase = bindRole(ROLE_BINDINGS, "genome-tagger", "qwen-72b", recordedRun.attestation);
    expect(() => bindRoleLive(recordedBase, "genome-tagger", "qwen-72b", live.attestation), "a recorded-evidence base was promoted").toThrow(/base map is not production-servable/);
    expect(bindRoleLive(ROLE_BINDINGS, "genome-tagger", "qwen-72b", live.attestation)["genome-tagger"]).toBe("qwen-72b");
    expect(live.score).toBe(0.8);
  });

  it("a live eval runs through the production adapter itself, not a look-alike", async () => {
    const { deps, transport } = makeDeps();
    await expect(runLiveEval(deps, "genome-tagger", "qwen-72b", GOLDEN, transport as never, TEST_CLIENT)).rejects.toThrow(/production AiGatewayHttpTransport itself/);
    class Sub extends AiGatewayHttpTransport {}
    const sub = new Sub({ gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/test-account/fullburn/", fetchImpl: async () => ({ status: 500, text: async () => "" }) });
    await expect(runLiveEval(deps, "genome-tagger", "qwen-72b", GOLDEN, sub, TEST_CLIENT), "a subclass ran a live eval").rejects.toThrow(/not a subclass/);
  });

  it("a live eval's candidate map is served live during the run only, and a failing candidate does not bind", async () => {
    const { deps } = makeDeps();
    const gw = await runtimeGateway();
    gw.queue.push(...GOLDEN.map((c) => RECORDED_LLAMA_70B[c.id]));
    const live = await runLiveEval(deps, "genome-tagger", "llama-70b", GOLDEN, gw.transport, TEST_CLIENT);
    expect(gw.calls.length, "the live eval did not reach the gateway per case").toBe(GOLDEN.length);
    expect(() => bindRoleLive(ROLE_BINDINGS, "genome-tagger", "llama-70b", live.attestation)).toThrow(/no pass, no bind/);
  });
});

/** x8 X-04 (GPT-6 Luna, 2026-10-10): a fake fetch handed to the production
 * adapter minted "live" evidence. MUTATION: X8-04a, X8-04b. */
describe("x8 a live eval talks only to the runtime's own fetch", () => {
  it("an injected fetchImpl is refused before any case runs", async () => {
    const { deps } = makeDeps();
    const fake = queuedGateway();
    fake.queue.push(...GOLDEN.map((c) => c.expected));
    await expect(runLiveEval(deps, "genome-tagger", "llama-70b", GOLDEN, fake.transport, TEST_CLIENT), "a fake fetch minted live evidence").rejects.toThrow(/runtime's own fetch/);
    expect(fake.calls, "the fake network was consulted").toEqual([]);
  });

  it("a global fetch replaced after the adapter loaded is refused too", async () => {
    const { deps } = makeDeps();
    const saved = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}")) as unknown as typeof fetch;
    try {
      const t = new AiGatewayHttpTransport({ gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/test-account/fullburn/" });
      expect(t.usesRuntimeFetch()).toBe(false);
      await expect(runLiveEval(deps, "genome-tagger", "qwen-72b", GOLDEN, t, TEST_CLIENT)).rejects.toThrow(/runtime's own fetch/);
    } finally {
      globalThis.fetch = saved;
    }
    expect((await runtimeGateway()).transport.usesRuntimeFetch()).toBe(true);
  });
});
