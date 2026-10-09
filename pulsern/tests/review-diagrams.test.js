/* Astra's visual and clinical review of concept diagrams — the parts that
   decide what is sent and what a verdict means. No model is called. */
import { describe, it, expect } from "vitest";
import { imagePlan, diagramReviewPrompt, validateReview, verdictFor, reviewKey, renderReviewMarkdown, DIAGRAM_REVIEW_SCHEMA, canReuse, reviewOne, reviewAndRecord } from "../ops/review-diagrams-lib.mjs";
import { DIAGRAMS } from "../src/diagrams/index.js";

const d = DIAGRAMS.abg;
const gallery = [
  { id: "abg", theme: "light", key: "static", file: "/l-static.png" },
  { id: "abg", theme: "dark", key: "static", file: "/d-static.png" },
  ...d.steps.map((s) => ({ id: "abg", theme: "light", key: s.key, file: `/l-${s.key}.png` })),
  ...d.steps.map((s) => ({ id: "abg", theme: "dark", key: s.key, file: `/d-${s.key}.png` })),
  { id: "potassium", theme: "light", key: "static", file: "/k.png" },
];

describe("what Astra is shown", () => {
  /* PR #133 review, finding 14: dark-theme step frames were never shown. */
  it("every frame in both themes — overview and every step — and only this diagram", () => {
    const plan = imagePlan(d, gallery);
    expect(plan.map((p) => p.file)).toEqual([
      "/l-static.png", ...d.steps.map((s) => `/l-${s.key}.png`),
      "/d-static.png", ...d.steps.map((s) => `/d-${s.key}.png`),
    ]);
  });
  it("refuses to review with a frame missing", () => {
    expect(() => imagePlan(d, gallery.filter((g) => !(g.theme === "dark" && g.key === d.steps[1].key)))).toThrow(/missing rendered frames dark\//);
  });
  it("labels each image so findings can point at one", () => {
    const p = diagramReviewPrompt(d, imagePlan(d, gallery), "rules");
    expect(p).toContain("Image 1: light theme — inline");
    expect(p).toContain(`Image 2: light theme — explainer step "${d.steps[0].key}"`);
    expect(p).toContain(`dark theme — explainer step "${d.steps[0].key}"`);
  });
  it("gives every clinical claim, caption and narration script", () => {
    const p = diagramReviewPrompt(d, imagePlan(d, gallery), "rules");
    for (const f of d.facts) expect(p).toContain(f);
    for (const s of d.steps.filter((x) => !x.dynamic)) { expect(p).toContain(s.caption); expect(p).toContain(s.narration); }
  });
  it("shows the worked example's computed caption, and says it is never recorded", () => {
    const p = diagramReviewPrompt(d, imagePlan(d, gallery), "rules");
    expect(p).toContain(d.dynamicCaption(d.example));
    expect(p).toContain("(none — never recorded)");
  });
  it("judges against the project's rules", () => {
    expect(diagramReviewPrompt(d, [], "coral only for incorrect/critical")).toContain("coral only for incorrect/critical");
  });
});

describe("what a verdict means", () => {
  const f = (severity, area = "clinical") => ({ severity, area, where: "Image 1", title: "t", problem: "p", fix: "x", confidence: "high" });
  it("fails on any blocker or major", () => {
    expect(verdictFor([f("major", "visual")]).verdict).toBe("FAIL");
    expect(verdictFor([f("blocker")]).verdict).toBe("FAIL");
  });
  it("passes with minors only", () => { expect(verdictFor([f("minor")]).verdict).toBe("PASS"); });
  it("rejects a finding with an unknown area or no fix", () => {
    expect(() => validateReview({ assessment: "a", findings: [f("major", "vibes")] })).toThrow(/bad area/);
    expect(() => validateReview({ assessment: "a", findings: [{ ...f("major"), fix: "" }] })).toThrow(/missing fix/);
  });
  it("uses a strict schema", () => { expect(DIAGRAM_REVIEW_SCHEMA.json_schema.strict).toBe(true); });
});

describe("paying only when something changed", () => {
  const png = (b) => Buffer.from([b]);
  it("keeps the verdict for an identical render and identical words", () => {
    expect(reviewKey(d, [png(1), png(2)])).toBe(reviewKey(d, [png(1), png(2)]));
  });
  it("re-reviews when a single pixel of a render changes", () => {
    expect(reviewKey(d, [png(1), png(3)])).not.toBe(reviewKey(d, [png(1), png(2)]));
  });
  it("re-reviews when a clinical claim changes", () => {
    expect(reviewKey({ ...d, facts: [...d.facts, "new claim"] }, [png(1)])).not.toBe(reviewKey(d, [png(1)]));
  });
});

describe("the saved report", () => {
  it("records an unfinished review as a failure", () => {
    const md = renderReviewMarkdown({ title: "ABG", model: "m", reviewedAt: "t", images: 8, verdict: "FAIL", error: "timeout", findings: [] });
    expect(md).toContain("an unfinished review is not a pass");
  });
  it("says unknown, never $0, when the cost was not reported", () => {
    const md = renderReviewMarkdown({ title: "ABG", model: "m", reviewedAt: "t", images: 8, verdict: "PASS", counts: { blocker: 0, major: 0, minor: 0 }, findings: [], usage: { costUsd: null } });
    expect(md).toContain("| Cost | unknown |");
  });
});

/* PR #134 review, round 6: an operational error was cached as FAIL under the
   same key as a real verdict, and the normal re-run never retried it. */
describe("an error is retried, a verdict is reused", () => {
  const ok = { assessment: "Fine.", findings: [] };
  it("retries after an error and then reuses the completed review", async () => {
    const index = {};
    const run = async (ask) => {
      const prev = index.abg;
      if (canReuse(prev, "k1")) return "reused";
      const r = await reviewOne({ d, key: "k1", images: 2, model: "m", ask });
      index.abg = { key: "k1", verdict: r.verdict, completed: r.completed };
      return r.verdict;
    };
    expect(await run(async () => { throw new Error("timeout"); })).toBe("ERROR");
    expect(index.abg).toMatchObject({ verdict: "ERROR", completed: false });
    expect(await run(async () => ok)).toBe("PASS");        // same content: retried, not skipped
    expect(index.abg).toMatchObject({ verdict: "PASS", completed: true });
    expect(await run(async () => { throw new Error("should not be called"); })).toBe("reused");
  });
  it("never reuses a malformed answer as a verdict", async () => {
    const r = await reviewOne({ d, key: "k", images: 1, model: "m", ask: async () => ({ nonsense: true }) });
    expect(r).toMatchObject({ completed: false, verdict: "ERROR" });
    expect(canReuse({ key: "k", verdict: "ERROR", completed: false }, "k")).toBe(false);
    expect(canReuse({ key: "k", verdict: "FAIL" }, "k"), "an old entry with no completion record").toBe(false);
  });
  it("still reuses a completed FAIL — a real verdict is not re-bought", () => {
    expect(canReuse({ key: "k", verdict: "FAIL", completed: true }, "k")).toBe(true);
    expect(canReuse({ key: "k", verdict: "FAIL", completed: true }, "k", true)).toBe(false);
  });
});

/* Astra, PR #134 review, round 13: the report was written only after the
   paid call returned, so a hung or killed call left no record of it. */
describe("a paid diagram review is recorded before it is asked", () => {
  const d = { id: "abg", title: "ABG" };
  const store = () => { const files = {}; return { files, write: (p, s) => { files[p] = s; } }; };
  const answer = { assessment: "fine", findings: [] };
  it("writes a 'did not finish' checkpoint and index entry before the reviewer answers", async () => {
    const { files, write } = store();
    const index = {};
    let release;
    const pending = reviewAndRecord({ d, key: "k1", images: 2, model: "m", dir: "r", index, sourceKey: "s", write,
      now: () => "2026-10-09T12:00:00.000Z", ask: () => new Promise((res) => { release = res; }) });
    await new Promise((r) => setTimeout(r, 10));
    const json = Object.keys(files).find((p) => p.endsWith(".json") && p.startsWith("r/abg/"));
    expect(json).toBeTruthy();
    expect(JSON.parse(files[json])).toMatchObject({ verdict: "ERROR", completed: false });
    expect(JSON.parse(files["r/index.json"]).abg).toMatchObject({ key: "k1", verdict: "ERROR", completed: false });
    release(answer);
    const r = await pending;
    // the same attempt's files are finalised, not a second record
    expect(JSON.parse(files[json])).toMatchObject({ verdict: "PASS", completed: true });
    expect(JSON.parse(files["r/index.json"]).abg).toMatchObject({ verdict: "PASS", completed: true, report: r.report });
  });
  it("gives up on a reviewer that never answers, and keeps the record", async () => {
    const { files, write } = store();
    const index = {};
    const r = await reviewAndRecord({ d, key: "k2", images: 1, model: "m", dir: "r", index, sourceKey: "s", write,
      timeoutMs: 30, ask: () => new Promise(() => {}) });
    expect(r).toMatchObject({ verdict: "ERROR", completed: false });
    expect(r.error).toMatch(/no answer within/);
    expect(JSON.parse(files["r/index.json"]).abg).toMatchObject({ key: "k2", completed: false });
    expect(canReuse(index.abg, "k2")).toBe(false);   // retried next run, never cached
  });
  it("keeps every attempt under its own name", async () => {
    const { files, write } = store();
    const index = {};
    let t = 0;
    const now = () => `2026-10-09T12:00:0${t++}.000Z`;
    await reviewAndRecord({ d, key: "k", images: 1, model: "m", dir: "r", index, sourceKey: "s", write, now, ask: async () => { throw new Error("boom"); } });
    await reviewAndRecord({ d, key: "k", images: 1, model: "m", dir: "r", index, sourceKey: "s", write, now, ask: async () => answer });
    expect(Object.keys(files).filter((p) => p.endsWith(".json") && p.startsWith("r/abg/"))).toHaveLength(2);
  });
});
