import { describe, expect, it } from "vitest";
import { auditHtml } from "../ops/seo-guardian.mjs";
import { extractOutputText } from "../ops/seo-adversary-ai.mjs";

describe("SEO guardian", () => {
  it("rejects a homepage with no H1", () => {
    const page = auditHtml("/", `<html><head><title>PulseRN adaptive NCLEX-RN preparation</title><meta name="description" content="Adaptive NCLEX-RN practice built by a licensed RN with modern study tools, transparent limitations, and careful educational review for future nurses."><link rel="canonical" href="https://www.pulsern.app/"><script type="application/ld+json">{"@type":"WebApplication"}</script></head><body><main><a href="/learn/">Guides</a><a href="/about/">About</a><a href="/pricing/">Pricing</a></main></body></html>`);
    expect(page.findings.some((item) => item.code === "H1_COUNT" && item.severity === "critical")).toBe(true);
  });

  it("rejects a guide without accountable Person authorship", () => {
    const body = "clinical judgment ".repeat(520);
    const page = auditHtml("/learn/test/", `<html><head><title>NCLEX clinical judgment guide | PulseRN</title><meta name="description" content="A detailed educational guide to clinical judgment for NCLEX-RN candidates, with clear limitations, sources, and a practical study framework."><link rel="canonical" href="https://www.pulsern.app/learn/test/"><script type="application/ld+json">{"@type":"Article","author":{"@type":"Organization","name":"PulseRN"}}</script></head><body><main><h1>Clinical judgment</h1><a href="/learn/">Guides</a><a href="/about/">About</a><a href="https://www.nclex.com/test-plans.page">Source</a>${body}</main></body></html>`);
    expect(page.findings.some((item) => item.code === "HUMAN_ACCOUNTABILITY")).toBe(true);
  });

  it("extracts Responses API output text", () => {
    expect(extractOutputText({ output: [{ type: "message", content: [{ type: "output_text", text: "Adversarial result" }] }] })).toBe("Adversarial result");
  });

  it("extracts OpenRouter chat output text", () => {
    expect(extractOutputText({ choices: [{ message: { content: "Independent objection" } }] })).toBe("Independent objection");
  });
});
