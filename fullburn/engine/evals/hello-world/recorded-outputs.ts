/** Transport-level recordings per candidate model, keyed by golden-case id. */
export const RECORDED_CLAUDE_SONNET: Readonly<Record<string, unknown>> = {
  h1: { greeting: "hello" },
};
export const RECORDED_QWEN_72B: Readonly<Record<string, unknown>> = {
  h1: { greeting: "hi there" }, // diverges: the harness must score this 0
};
