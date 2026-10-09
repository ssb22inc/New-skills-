/* The content gate: every AI review of PulseRN content goes to GPT Astra.
   ------------------------------------------------------------------
   Owner decision (2026-10-08): Astra reviews all new content. These tests
   make that a property of the code, not of anyone's memory:

     - review() sends Astra enough room to think, no temperature, and
       records what each call cost;
     - no content script keeps a private reviewer or a private HTTP call, so
       a future edit cannot quietly route one gate back to the old model. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { review, parseJson, reviewSpend, resetReviewSpend, formatSpend, REVIEW_MIN_TOKENS, REVIEW_EFFORT } from "../ops/review.mjs";
import { REVIEW_MODEL } from "../ops/models.mjs";

let sent;
const reply = (content, usage = { prompt_tokens: 2000, completion_tokens: 900, cost: 0.065 }) => ({
  ok: true, status: 200, headers: { get: () => null },
  json: async () => ({ id: "g", model: REVIEW_MODEL, choices: [{ message: { content } }], usage }),
});
beforeEach(() => {
  sent = [];
  process.env.OPENROUTER_API_KEY = "k";
  resetReviewSpend();
  vi.spyOn(console, "log").mockImplementation(() => {});
  globalThis.fetch = vi.fn(async (_u, init) => { sent.push(JSON.parse(init.body)); return reply('[{"verdict":"pass"}]'); });
});
afterEach(() => vi.restoreAllMocks());

describe("review()", () => {
  it("asks Astra, not the old reviewer", async () => {
    await review("judge this");
    expect(sent[0].model).toBe("openai/gpt-6-astra");
  });

  /* Astra thinks before it answers and that thinking counts against
     max_tokens. The factories asked for 3,000–8,000, sized for a model that
     answers at once; at that ceiling Astra can return nothing, which the
     factories read as "unparseable" and drop a whole batch of good items. */
  it("never gives Astra less than the thinking headroom, whatever the caller asks", async () => {
    await review("x", 3000);
    expect(sent[0].max_tokens).toBe(REVIEW_MIN_TOKENS);
    await review("x", 40000);
    expect(sent[1].max_tokens).toBe(40000);
  });

  it("sends no temperature and a reasoning effort", async () => {
    await review("x");
    expect(sent[0]).not.toHaveProperty("temperature");
    expect(sent[0].reasoning).toEqual({ effort: REVIEW_EFFORT });
  });

  it("refuses to let a model review its own family's writing", async () => {
    await expect(review("x", 8000, { writer: "openai/gpt-4.1" })).rejects.toThrow(/Same-family/);
    expect(sent).toHaveLength(0); // refused before any money is spent
  });

  it("adds up what the run spent", async () => {
    await review("a"); await review("b");
    expect(reviewSpend()).toMatchObject({ calls: 2, costUsd: 0.13, uncosted: 0, promptTokens: 4000, completionTokens: 1800 });
    expect(formatSpend()).toBe("Astra review spend: $0.1300 across 2 calls · 4,000 in / 1,800 out");
  });

  /* An unreported cost must show as unknown, never be silently counted as $0. */
  it("counts calls with no reported cost separately", async () => {
    globalThis.fetch = vi.fn(async () => reply("[]", { prompt_tokens: 10, completion_tokens: 5 }));
    await review("a");
    expect(reviewSpend()).toMatchObject({ calls: 1, costUsd: 0, uncosted: 1 });
    expect(formatSpend()).toContain("+1 call with no cost reported");
  });
});

describe("parseJson()", () => {
  it("reads plain and fenced JSON", () => {
    expect(parseJson('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("tolerates a sentence of preamble before the JSON", () => {
    expect(parseJson('Here is my review:\n[{"verdict":"fail"}]')).toEqual([{ verdict: "fail" }]);
  });
  /* A review that cannot be read must never count as a pass. */
  it("throws on an answer with no JSON at all", () => {
    expect(() => parseJson("Looks fine to me.")).toThrow();
  });
  it("throws on truncated JSON rather than guessing", () => {
    expect(() => parseJson('[{"verdict":"pass"')).toThrow();
  });
});

describe("no content script escapes the gate", () => {
  const SCRIPTS = ["content-factory", "card-factory", "case-factory", "exam-factory", "audit-sweep", "copy-audit", "seed-visuals", "map-diagrams"];

  /* Discovery by what a script DOES — call a model — not by what its prompt
     happens to say. Every model-calling script must be a content reviewer on
     the list, shared infrastructure, a generator-only path, or named here with
     the reason it is outside this gate. A new script that calls a model fails
     this test until someone decides which it is. */
  const INFRA = { llm: "the shared client", review: "the gate itself", "astra-review": "code review, not content" };
  const OUTSIDE = {
    "seo-adversary-ai": "public-page SEO release gate; its model is set in its workflow and is a separate owner decision",
  };

  it("accounts for every ops script that calls a model", () => {
    const callers = readdirSync("ops").filter((f) => f.endsWith(".mjs"))
      .filter((f) => /openrouter\.ai\/api|\bllm\(|\bllmCall\(|\bawait review\(/.test(readFileSync(`ops/${f}`, "utf8")))
      .map((f) => f.replace(/\.mjs$/, ""));
    const unaccounted = callers.filter((c) => !SCRIPTS.includes(c) && !(c in INFRA) && !(c in OUTSIDE));
    expect(unaccounted, "calls a model but is neither on the gate list nor explained").toEqual([]);
    for (const s of SCRIPTS) expect(callers, `${s} is on the list but no longer calls a model`).toContain(s);
  });

  for (const name of SCRIPTS) {
    it(`${name} reviews through review() with no private reviewer`, () => {
      const src = readFileSync(`ops/${name}.mjs`, "utf8");
      expect(src).toMatch(/import \{[^}]*\breview\b[^}]*\} from "\.\/review\.mjs"/);
      expect(src).toMatch(/await review\(/);
      expect(src, "hard-coded old reviewer").not.toMatch(/openai\/gpt-4\.1/);
      expect(src, "private HTTP call to OpenRouter").not.toMatch(/openrouter\.ai\/api/);
      expect(src, "reviewer called through the generic client").not.toMatch(/llm\(REVIEW_MODEL/);
      expect(src, "local REVIEW_MODEL definition").not.toMatch(/const REVIEW_MODEL\s*=/);
    });
  }

  it("still records which model reviewed each item it publishes", () => {
    for (const name of ["content-factory", "card-factory", "case-factory", "seed-visuals"]) {
      expect(readFileSync(`ops/${name}.mjs`, "utf8"), name).toMatch(/review_model: REVIEW_MODEL/);
    }
  });
});
