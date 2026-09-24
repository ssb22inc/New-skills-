import { describe, expect, it } from "vitest";
import { ROLE_BINDINGS, ROLE_CARDS, bindRole } from "@fullburn/config/models";
import { GOLDEN } from "../evals/genome-tagger/golden.ts";
import { GOLDEN as ADVERSARY_GOLDEN } from "../evals/creative-decision-adversary/golden.ts";
import { RECORDED_CLAUDE_SONNET as ADV_CLAUDE, RECORDED_LLAMA_70B as ADV_LLAMA } from "../evals/creative-decision-adversary/recorded-outputs.ts";
import { RECORDED_LLAMA_70B, RECORDED_QWEN_72B } from "../evals/genome-tagger/recorded-outputs.ts";
import { RecordedTransport, runEval, structurallyEqual } from "../src/eval-harness.ts";
import { llm } from "../src/gateway.ts";
import { TraceContext } from "../src/tracing.ts";
import { TEST_CLIENT, makeDeps } from "./helpers.ts";

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
    const { deps, transport } = makeDeps();
    const frontier = { ...ROLE_BINDINGS, "genome-tagger": "gpt-5" };
    transport.response = { hook: "pov", angle: "x", emotion: "y", format: "z", offer: "none" };
    await llm({ ...deps, bindings: frontier }, {
      role: "genome-tagger",
      clientId: TEST_CLIENT,
      input: { ad: "some ad" },
      trace: new TraceContext("t-frontier", TEST_CLIENT),
    });
    expect(transport.requests.at(-1)!.url).toContain("openai/gpt-5");

    const res = await runEval(deps, "genome-tagger", "qwen-72b", GOLDEN, new RecordedTransport(RECORDED_QWEN_72B), TEST_CLIENT);
    const rebound = bindRole(frontier, "genome-tagger", "qwen-72b", res.attestation);

    // Same call site, same everything — only the bindings object changed.
    await llm({ ...deps, bindings: rebound }, {
      role: "genome-tagger",
      clientId: TEST_CLIENT,
      input: { ad: "some ad" },
      trace: new TraceContext("t-oss", TEST_CLIENT),
    });
    expect(transport.requests.at(-1)!.url).toContain("workers-ai/qwen-72b");
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
    // And the valid map serves.
    await expect(call({ ...ROLE_BINDINGS })).resolves.toBeDefined();
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
    const vault = { clientId: TEST_CLIENT, get() { throw new Error("VAULT READ — the origin check did not come first"); } } as unknown as typeof deps.vault;
    const call = (gatewayBaseUrl: string) =>
      llm({ ...deps, vault, gatewayBaseUrl, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: new TraceContext("x05", TEST_CLIENT) });
    await expect(call("https://receiver.example.invalid/v1/a/b/")).rejects.toThrow(/is not the AI Gateway/);
    await expect(call("http://gateway.ai.cloudflare.com/v1/a/b/")).rejects.toThrow(/is not the AI Gateway/);
    await expect(call("https://gateway.ai.cloudflare.com.evil.example/v1/a/b/")).rejects.toThrow(/is not the AI Gateway/);
    await expect(call("https://user:pw@gateway.ai.cloudflare.com/v1/a/b/")).rejects.toThrow(/is not the AI Gateway/);
    await expect(call("https://gateway.ai.cloudflare.com/v2/a/b/")).rejects.toThrow(/is not the AI Gateway/);
    await expect(call("nonsense")).rejects.toThrow(/is not a URL/);
    expect(transport.requests.length, "a refused base still reached the transport").toBe(0);
    // The real base, with the real vault, serves.
    await expect(llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: new TraceContext("x05-ok", TEST_CLIENT) })).resolves.toBeDefined();
  });
});
