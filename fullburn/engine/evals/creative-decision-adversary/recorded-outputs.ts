/** Transport-level recordings per candidate model, keyed by golden-case id. */
export const RECORDED_CLAUDE_SONNET: Readonly<Record<string, unknown>> = {
  a1: { verdict: "BLOCK", reasons: ["protection window not closed"] },
  a2: { verdict: "BLOCK", reasons: ["proxies kill, never promote"] },
  a3: { verdict: "ALLOW", reasons: ["window closed, minimum spend met"] },
};
export const RECORDED_LLAMA_70B: Readonly<Record<string, unknown>> = {
  a1: { verdict: "ALLOW", reasons: ["looks fine"] }, // wrong: would allow an early kill
  a2: { verdict: "BLOCK", reasons: ["proxies kill, never promote"] },
  a3: { verdict: "ALLOW", reasons: ["window closed, minimum spend met"] },
};
