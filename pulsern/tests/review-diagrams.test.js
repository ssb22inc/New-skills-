/* Astra's visual and clinical review of concept diagrams — the parts that
   decide what is sent and what a verdict means. No model is called. */
import { describe, it, expect } from "vitest";
import { imagePlan, diagramReviewPrompt, validateReview, verdictFor, reviewKey, renderReviewMarkdown, DIAGRAM_REVIEW_SCHEMA } from "../ops/review-diagrams-lib.mjs";
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
  it("both themes inline, then every explainer step — and only this diagram", () => {
    const plan = imagePlan(d, gallery);
    expect(plan.map((p) => p.file)).toEqual(["/l-static.png", "/d-static.png", ...d.steps.map((s) => `/l-${s.key}.png`)]);
  });
  it("labels each image so findings can point at one", () => {
    const p = diagramReviewPrompt(d, imagePlan(d, gallery), "rules");
    expect(p).toContain("Image 1: light theme — inline");
    expect(p).toContain(`Image 3: light theme — explainer step "${d.steps[0].key}"`);
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
