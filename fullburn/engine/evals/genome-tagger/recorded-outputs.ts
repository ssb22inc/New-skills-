/** Recorded transport-level outputs per candidate model, keyed by golden-case
 * id. These are what the model RETURNED, not whether it passed — scoring is the
 * harness's job (R6). PLACEHOLDERS pending live regeneration (H6, ledger). */

export const RECORDED_CLAUDE_SONNET: Readonly<Record<string, unknown>> = {
  g1: { hook: "pov", angle: "anti-greasy", emotion: "relief", format: "ugc-video", offer: "none" },
  g2: { hook: "authority", angle: "derm-dad", emotion: "trust", format: "talking-head", offer: "none" },
  g3: { hook: "callout", angle: "reef-guilt", emotion: "skepticism", format: "static", offer: "discount-20" },
  g4: { hook: "comparison", angle: "beach-bag-test", emotion: "curiosity", format: "ugc-video", offer: "none" },
  g5: { hook: "pain-point", angle: "kids-wont-cry", emotion: "empathy", format: "ugc-video", offer: "gift-with-purchase" },
};

export const RECORDED_QWEN_72B: Readonly<Record<string, unknown>> = {
  g1: { hook: "pov", angle: "anti-greasy", emotion: "relief", format: "ugc-video", offer: "none" },
  g2: { hook: "authority", angle: "derm-dad", emotion: "trust", format: "talking-head", offer: "none" },
  g3: { hook: "callout", angle: "reef-guilt", emotion: "skepticism", format: "static", offer: "discount-20" },
  g4: { hook: "comparison", angle: "beach-bag-test", emotion: "curiosity", format: "ugc-video", offer: "none" },
  // g5: divergent output — the harness must count this as a failure, proving
  // scores are computed, not asserted.
  g5: { hook: "discount", angle: "kids-wont-cry", emotion: "empathy", format: "ugc-video", offer: "gift-with-purchase" },
};

/** A deliberately bad candidate used to prove bindRole refuses below-threshold. */
export const RECORDED_LLAMA_70B: Readonly<Record<string, unknown>> = {
  g1: { hook: "unknown", angle: "unknown", emotion: "unknown", format: "unknown", offer: "unknown" },
  g2: { hook: "unknown", angle: "unknown", emotion: "unknown", format: "unknown", offer: "unknown" },
  g3: { hook: "callout", angle: "reef-guilt", emotion: "skepticism", format: "static", offer: "discount-20" },
  g4: { hook: "unknown", angle: "unknown", emotion: "unknown", format: "unknown", offer: "unknown" },
  g5: { hook: "unknown", angle: "unknown", emotion: "unknown", format: "unknown", offer: "unknown" },
};
