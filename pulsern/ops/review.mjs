/* The one way any PulseRN content is reviewed by AI.
   ------------------------------------------------------------------
   Seven scripts judge content — the question, card, case and exam factories,
   the exam re-audit, the visual-exhibit seeder, and the in-app copy audit.
   Each used to name its reviewer itself and four built their own HTTP call.
   They now all call review(), so the reviewer, its settings and its cost
   accounting are decided once.

   Why the settings are what they are:

   - THINKING HEADROOM. GPT Astra is a reasoning model: it works through the
     item before it answers, and that work is counted against max_tokens. The
     old reviewers asked for 3,000–8,000 tokens, sized for a model that answers
     straight away. Given that ceiling, Astra can spend it all thinking and
     return nothing — which the factories would read as "reviewer returned
     unparseable JSON" and drop a whole batch of good items. Every review gets
     at least REVIEW_MIN_TOKENS.

   - MEDIUM EFFORT. Enough to recompute a dosage and check a distractor against
     the stem; "high" is kept for code review, where one missed defect ships to
     every student at once.

   - CROSS-FAMILY, CHECKED. Owner's rule: nothing is reviewed by a model from
     the family that wrote it. Checked on every call, not assumed.

   - COST, ALWAYS. Astra costs several times what GPT-4.1 did. Every call logs
     what it spent, and the run prints a total on exit, so the price of the
     content gate is a number in the Actions log rather than a surprise on the
     invoice. */

import { llmCall } from "./llm.mjs";
import { GEN_MODEL, REVIEW_MODEL, assertCrossFamily } from "./models.mjs";

export const REVIEW_MIN_TOKENS = 24000;
export const REVIEW_EFFORT = "medium";

const spend = { calls: 0, costUsd: 0, uncosted: 0, promptTokens: 0, completionTokens: 0 };
let exitHookArmed = false;

export function reviewSpend() {
  return { ...spend, costUsd: Math.round(spend.costUsd * 1e6) / 1e6 };
}

export function formatSpend(s = reviewSpend()) {
  const cost = `$${s.costUsd.toFixed(4)}`;
  const gap = s.uncosted ? ` (+${s.uncosted} call${s.uncosted === 1 ? "" : "s"} with no cost reported)` : "";
  return `Astra review spend: ${cost} across ${s.calls} call${s.calls === 1 ? "" : "s"}${gap} · ${s.promptTokens.toLocaleString()} in / ${s.completionTokens.toLocaleString()} out`;
}

export function resetReviewSpend() {
  Object.assign(spend, { calls: 0, costUsd: 0, uncosted: 0, promptTokens: 0, completionTokens: 0 });
}

/* writer: the model that produced what is being judged. Defaults to the
   factories' generator; the copy audit judges strings written in this
   codebase, which a Claude model also wrote. */
export async function review(prompt, maxTokens = 8000, { writer = GEN_MODEL } = {}) {
  assertCrossFamily(writer, REVIEW_MODEL);
  const res = await llmCall({
    model: REVIEW_MODEL,
    prompt,
    maxTokens: Math.max(maxTokens, REVIEW_MIN_TOKENS),
    reasoningEffort: REVIEW_EFFORT,
  });

  spend.calls += 1;
  spend.promptTokens += res.usage.promptTokens ?? 0;
  spend.completionTokens += res.usage.completionTokens ?? 0;
  if (res.usage.costUsd == null) spend.uncosted += 1;
  else spend.costUsd += res.usage.costUsd;
  console.log(`  · astra review: ${res.usage.costUsd == null ? "cost not reported" : `$${res.usage.costUsd.toFixed(4)}`} (${res.usage.promptTokens ?? "?"} in / ${res.usage.completionTokens ?? "?"} out)`);

  if (!exitHookArmed) {
    exitHookArmed = true;
    process.on("exit", () => console.log(formatSpend()));
  }
  return res.text;
}

/* Reviewers are told to answer with raw JSON, and mostly do. Fences and a
   stray sentence of preamble are stripped; anything still unreadable throws,
   because a review that cannot be read must never count as a pass. */
export function parseJson(raw) {
  const text = String(raw ?? "").replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(text); } catch { /* fall through to extraction */ }
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in reviewer answer");
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  const end = text.lastIndexOf(close);
  if (end <= start) throw new Error("unterminated JSON in reviewer answer");
  return JSON.parse(text.slice(start, end + 1));
}
