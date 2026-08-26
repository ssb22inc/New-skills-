import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { auditGovernance, auditHtml } from "../ops/seo-guardian.mjs";
import { extractOutputText, parseReview, runAdversary } from "../ops/seo-adversary-ai.mjs";
import { enforceAdversary } from "../ops/seo-enforce-adversary.mjs";

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

  it("accepts a structured adversarial PASS with no blockers", () => {
    expect(parseReview(JSON.stringify({ verdict: "PASS", summary: "All supplied gates pass.", strongestObjections: [], releaseBlockers: [], nonBlockingExperiments: [] })).verdict).toBe("PASS");
  });

  it("preserves a structured adversarial FAIL for release enforcement", () => {
    const review = parseReview(JSON.stringify({ verdict: "FAIL", summary: "Evidence is incomplete.", strongestObjections: [], releaseBlockers: [{ code: "EVIDENCE", finding: "Missing evidence.", requiredAction: "Supply it." }], nonBlockingExperiments: [] }));
    expect(review.verdict).toBe("FAIL");
    expect(review.releaseBlockers).toHaveLength(1);
  });

  it("fails closed on malformed, unknown, empty, or contradictory model output", () => {
    expect(() => parseReview("")).toThrow(/no text/i);
    expect(() => parseReview("not json")).toThrow(/malformed JSON/i);
    expect(() => parseReview(JSON.stringify({ verdict: "MAYBE", summary: "x", strongestObjections: [], releaseBlockers: [], nonBlockingExperiments: [] }))).toThrow(/PASS or FAIL/i);
    expect(() => parseReview(JSON.stringify({ verdict: "PASS", summary: "x", strongestObjections: [], releaseBlockers: [{ code: "X", finding: "x", requiredAction: "x" }], nonBlockingExperiments: [] }))).toThrow(/cannot contain/i);
    expect(() => parseReview(JSON.stringify({ verdict: "FAIL", summary: "x", strongestObjections: [], releaseBlockers: [], nonBlockingExperiments: [] }))).toThrow(/at least one/i);
  });

  it("fails closed when the secret or provider response is unavailable", async () => {
    await expect(runAdversary({ apiKey: "" })).rejects.toThrow(/OPENROUTER_API_KEY/);
    await expect(runAdversary({ apiKey: "test", fetchImpl: async () => ({ ok: false, status: 503, text: async () => "provider unavailable" }) })).rejects.toThrow(/503/);
  });

  it("writes PASS evidence and rejects FAIL evidence at enforcement", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pulsern-adversary-"));
    const pass = { verdict: "PASS", summary: "All evidence passed.", strongestObjections: [], releaseBlockers: [], nonBlockingExperiments: [] };
    const passFetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(pass) } }] }) });
    const passJson = path.join(directory, "adversary.json");
    const result = await runAdversary({ reportDirectory: directory, outputFile: path.join(directory, "adversary.md"), jsonFile: passJson, apiKey: "test", fetchImpl: passFetch, now: () => "2026-08-26T00:00:00.000Z" });
    expect(result.verdict).toBe("PASS");
    await expect(enforceAdversary(passJson)).resolves.toMatchObject({ verdict: "PASS" });

    const failJson = path.join(directory, "fail.json");
    await fs.writeFile(failJson, JSON.stringify({ verdict: "FAIL", summary: "Blocked.", strongestObjections: [], releaseBlockers: [{ code: "BLOCK", finding: "Blocked.", requiredAction: "Fix it." }], nonBlockingExperiments: [] }));
    await expect(enforceAdversary(failJson)).rejects.toThrow(/failed/i);
  });

  it("keeps the required model gate and explicit outcome enforcement in workflow", async () => {
    const workflow = await fs.readFile(new URL("../../.github/workflows/pulsern-seo-guardian.yml", import.meta.url), "utf8");
    expect(workflow).toContain("Required adversarial model review");
    expect(workflow).not.toContain("env.OPENROUTER_API_KEY != ''");
    expect(workflow).toContain('test "${{ steps.adversary.outcome }}" = "success"');
    expect(workflow).toContain("npm run seo:enforce");
  });

  it("requires verified reviewer identity, exact digest binding, claims, sources, and intent", () => {
    const contentSha256 = "a".repeat(64);
    const sourceSetSha256 = "b".repeat(64);
    const reviewer = { id: "reviewer-1", displayName: "Test Reviewer", credential: "RN", licenseJurisdiction: "Test Board", licenseType: "Registered Nurse", verificationUrl: "https://www.nursys.com/", verifiedAt: "2026-08-26", verificationStatus: "verified" };
    const intent = { primary: "test clinical intent", secondary: ["secondary"], audience: "test learners", risk: "clinical" };
    const guide = { route: "/learn/test/", risk: "clinical", intent, contentSha256, sourceSetSha256, sources: [{ id: "source-1", title: "Official source", publisher: "NCSBN", url: "https://www.nclex.com/test-plans.page", sourceUpdated: "2026-04-01", accessedAt: "2026-08-26", locator: "Test Plan" }], review: { decision: "approved", reviewerId: "reviewer-1", reviewedAt: "2026-08-26", scope: "Full clinical and source review", evidenceMatchesContent: true, claims: [{ id: "claim-1", locator: "Section 1", sourceIds: ["source-1"] }] } };
    const pass = auditGovernance({ provenance: { schemaVersion: 1, reviewer, guides: [guide] }, intents: { schemaVersion: 1, intents: { test: intent } }, pages: [{ route: "/learn/test/", identifiers: [`sha256:${contentSha256}`] }], now: new Date("2026-08-26T12:00:00Z") });
    expect(pass.provenanceFindings).toEqual([]);
    expect(pass.intentFindings).toEqual([]);

    const fail = auditGovernance({ provenance: { schemaVersion: 1, reviewer: { ...reviewer, verificationStatus: "pending", verificationUrl: null }, guides: [{ ...guide, review: { decision: "pending", claims: [] } }] }, intents: { schemaVersion: 1, intents: { test: intent } }, pages: [{ route: "/learn/test/", identifiers: [] }], now: new Date("2026-08-26T12:00:00Z") });
    expect(fail.provenanceFindings.map((item) => item.code)).toEqual(expect.arrayContaining(["RN_VERIFICATION", "DIGEST_BINDING", "RN_REVIEW", "CLAIM_PROVENANCE"]));
  });
});
