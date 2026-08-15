import { describe, expect, it } from "vitest";
import { ROLE_BINDINGS, ROLE_CARDS, bindRole } from "@fullburn/config/models";
import { GOLDEN } from "../evals/genome-tagger/golden.ts";
import { RECORDED_LLAMA_70B, RECORDED_QWEN_72B } from "../evals/genome-tagger/recorded-outputs.ts";
import { RecordedTransport, runEval } from "../src/eval-harness.ts";
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
    const rebound = bindRole(frontier, "genome-tagger", "qwen-72b", res);

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
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", res)).toThrow(/no pass, no bind/);
  });

  it("an empty golden set is refused — an eval over nothing proves nothing", async () => {
    const { deps } = makeDeps();
    await expect(
      runEval(deps, "genome-tagger", "qwen-72b", [], new RecordedTransport({}), TEST_CLIENT),
    ).rejects.toThrow(/proves nothing/);
  });
});
