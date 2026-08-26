import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { auditGovernance, auditHtml } from "../ops/seo-guardian.mjs";
import { extractOutputText, guideCoverageFromEvidence, parseReview, runAdversary } from "../ops/seo-adversary-ai.mjs";
import { enforceAdversary } from "../ops/seo-enforce-adversary.mjs";
import { articleJsonLd } from "../ops/build-learn.mjs";
import { CLINICAL_ARTICLES } from "../ops/learn-clinical.mjs";
import { sourcesFor } from "../ops/seo-content-policy.mjs";

describe("SEO guardian", () => {
  const emptyCoverage = { totalGuides: 0, approvedGuides: 0, pendingGuides: 0, approvedRoutes: [], pendingRoutes: [] };
  it("rejects a homepage with no H1", () => {
    const page = auditHtml("/", `<html><head><title>PulseRN adaptive NCLEX-RN preparation</title><meta name="description" content="Adaptive NCLEX-RN practice built by a licensed RN with modern study tools, transparent limitations, and careful educational review for future nurses."><link rel="canonical" href="https://www.pulsern.app/"><script type="application/ld+json">{"@type":"WebApplication"}</script></head><body><main><a href="/learn/">Guides</a><a href="/about/">About</a><a href="/pricing/">Pricing</a></main></body></html>`);
    expect(page.findings.some((item) => item.code === "H1_COUNT" && item.severity === "critical")).toBe(true);
  });

  it("rejects a guide without an accountable Person reviewer", () => {
    const body = "clinical judgment ".repeat(520);
    const page = auditHtml("/learn/test/", `<html><head><title>NCLEX clinical judgment guide | PulseRN</title><meta name="description" content="A detailed educational guide to clinical judgment for NCLEX-RN candidates, with clear limitations, sources, and a practical study framework."><link rel="canonical" href="https://www.pulsern.app/learn/test/"><script type="application/ld+json">{"@type":"Article","author":{"@type":"Organization","name":"PulseRN"}}</script></head><body><main><h1>Clinical judgment</h1><a href="/learn/">Guides</a><a href="/about/">About</a><a href="https://www.nclex.com/test-plans.page">Source</a>${body}</main></body></html>`);
    expect(page.findings.some((item) => item.code === "HUMAN_ACCOUNTABILITY")).toBe(true);
  });

  it("accepts an Organization author with a resolved accountable Person reviewer", () => {
    const body = "clinical judgment ".repeat(520);
    const schema = { "@context": "https://schema.org", "@graph": [
      { "@type": "Article", datePublished: "2026-08-03", dateModified: "2026-08-26", author: { "@id": "https://www.pulsern.app/#org" }, reviewedBy: { "@id": "https://www.pulsern.app/about/#reviewer" }, citation: ["https://www.nclex.com/test-plans.page"] },
      { "@type": "Organization", "@id": "https://www.pulsern.app/#org", name: "PulseRN" },
      { "@type": "Person", "@id": "https://www.pulsern.app/about/#reviewer", name: "Test Reviewer, RN", jobTitle: "Registered Nurse" },
    ] };
    const page = auditHtml("/learn/test/", `<html><head><title>NCLEX clinical judgment guide | PulseRN</title><meta name="description" content="A detailed educational guide to clinical judgment for NCLEX-RN candidates, with clear limitations, sources, and a practical study framework."><link rel="canonical" href="https://www.pulsern.app/learn/test/"><script type="application/ld+json">${JSON.stringify(schema)}</script></head><body><main><h1>Clinical judgment</h1><time datetime="2026-08-26">2026-08-26</time><a href="/learn/">Guides</a><a href="/about/">About</a><a href="https://www.nclex.com/test-plans.page">Source</a>${body}</main></body></html>`);
    expect(page.findings.some((item) => item.code === "HUMAN_ACCOUNTABILITY")).toBe(false);
    expect(page.findings.some((item) => item.code === "REVIEW_DATES")).toBe(false);
  });

  it("keeps pending-guide revision metadata without publishing an RN reviewer entity", () => {
    const article = { title: "Pending guide", description: "Pending clinical guide", published: "2026-08-03", updated: "2026-08-26" };
    const provenance = { contentSha256: "a".repeat(64), sources: [], review: { decision: "pending" } };
    const graph = articleJsonLd(article, "https://www.pulsern.app/learn/pending/", provenance)["@graph"];
    const schemaArticle = graph.find((node) => node["@type"] === "Article");
    expect(schemaArticle).toMatchObject({ datePublished: "2026-08-03", dateModified: "2026-08-26" });
    expect(schemaArticle).not.toHaveProperty("reviewedBy");
    expect(graph.some((node) => node["@type"] === "Person")).toBe(false);
  });

  it("keeps Guide 2 tables accessible and its dated sources section-bound", () => {
    const guide = CLINICAL_ARTICLES.find((article) => article.slug === "electrolyte-imbalances");
    expect(guide.body.match(/<caption>/g)).toHaveLength(4);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(12);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(11);
    expect(guide.body.match(/class="table-wrap" role="region" aria-label=/g)).toHaveLength(4);
    expect(guide.body).toContain("Findings that change the priority");
    const datedSources = sourcesFor(guide).filter((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.sourceUpdated ?? ""));
    expect(datedSources).toHaveLength(sourcesFor(guide).length);
  });

  it("extracts Responses API output text", () => {
    expect(extractOutputText({ output: [{ type: "message", content: [{ type: "output_text", text: "Adversarial result" }] }] })).toBe("Adversarial result");
  });

  it("extracts OpenRouter chat output text", () => {
    expect(extractOutputText({ choices: [{ message: { content: "Independent objection" } }] })).toBe("Independent objection");
  });

  it("accepts a structured adversarial PASS with no blockers", () => {
    expect(parseReview(JSON.stringify({ verdict: "PASS", summary: "All supplied gates pass.", guideCoverage: emptyCoverage, strongestObjections: [], releaseBlockers: [], nonBlockingExperiments: [] })).verdict).toBe("PASS");
  });

  it("preserves a structured adversarial FAIL for release enforcement", () => {
    const review = parseReview(JSON.stringify({ verdict: "FAIL", summary: "Evidence is incomplete.", guideCoverage: emptyCoverage, strongestObjections: [], releaseBlockers: [{ code: "EVIDENCE", finding: "Missing evidence.", requiredAction: "Supply it." }], nonBlockingExperiments: [] }));
    expect(review.verdict).toBe("FAIL");
    expect(review.releaseBlockers).toHaveLength(1);
  });

  it("fails closed on malformed, unknown, empty, or contradictory model output", () => {
    expect(() => parseReview("")).toThrow(/no text/i);
    expect(() => parseReview("not json")).toThrow(/malformed JSON/i);
    expect(() => parseReview(JSON.stringify({ verdict: "MAYBE", summary: "x", guideCoverage: emptyCoverage, strongestObjections: [], releaseBlockers: [], nonBlockingExperiments: [] }))).toThrow(/PASS or FAIL/i);
    expect(() => parseReview(JSON.stringify({ verdict: "PASS", summary: "x", guideCoverage: emptyCoverage, strongestObjections: [], releaseBlockers: [{ code: "X", finding: "x", requiredAction: "x" }], nonBlockingExperiments: [] }))).toThrow(/cannot contain/i);
    expect(() => parseReview(JSON.stringify({ verdict: "FAIL", summary: "x", guideCoverage: emptyCoverage, strongestObjections: [], releaseBlockers: [], nonBlockingExperiments: [] }))).toThrow(/at least one/i);
  });

  it("binds model wording to deterministic approved and pending guide counts", () => {
    const evidence = {
      "report.json": { pages: [
        { route: "/learn/approved/", findings: [] },
        { route: "/learn/pending/", findings: [{ code: "HUMAN_ACCOUNTABILITY", route: "/learn/pending/" }] },
      ] },
      "provenance.json": { findings: [{ code: "RN_REVIEW", route: "/learn/pending/" }] },
    };
    const coverage = guideCoverageFromEvidence(evidence);
    expect(coverage).toEqual({ totalGuides: 2, approvedGuides: 1, pendingGuides: 1, approvedRoutes: ["/learn/approved/"], pendingRoutes: ["/learn/pending/"] });
    const base = { verdict: "FAIL", summary: "One guide is approved; one remains pending.", guideCoverage: coverage, strongestObjections: [], releaseBlockers: [{ code: "RN_REVIEW", finding: "The pending guide lacks approval.", requiredAction: "Review the pending route." }], nonBlockingExperiments: [] };
    expect(parseReview(JSON.stringify(base), coverage).guideCoverage).toEqual(coverage);
    expect(() => parseReview(JSON.stringify({ ...base, summary: "All clinical guides lack RN approval." }), coverage)).toThrow(/narrative contradicts/i);
    expect(() => parseReview(JSON.stringify({ ...base, guideCoverage: { ...coverage, approvedGuides: 0, pendingGuides: 2, approvedRoutes: [], pendingRoutes: ["/learn/approved/", "/learn/pending/"] } }), coverage)).toThrow(/deterministic evidence/i);
  });

  it("fails closed when the secret or provider response is unavailable", async () => {
    await expect(runAdversary({ apiKey: "" })).rejects.toThrow(/OPENROUTER_API_KEY/);
    await expect(runAdversary({ apiKey: "test", fetchImpl: async () => ({ ok: false, status: 503, text: async () => "provider unavailable" }) })).rejects.toThrow(/503/);
  });

  it("writes PASS evidence and rejects FAIL evidence at enforcement", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pulsern-adversary-"));
    const pass = { verdict: "PASS", summary: "All evidence passed.", guideCoverage: emptyCoverage, strongestObjections: [], releaseBlockers: [], nonBlockingExperiments: [] };
    const passFetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(pass) } }] }) });
    const passJson = path.join(directory, "adversary.json");
    const result = await runAdversary({ reportDirectory: directory, outputFile: path.join(directory, "adversary.md"), jsonFile: passJson, apiKey: "test", fetchImpl: passFetch, now: () => "2026-08-26T00:00:00.000Z" });
    expect(result.verdict).toBe("PASS");
    await expect(enforceAdversary(passJson)).resolves.toMatchObject({ verdict: "PASS" });

    const failJson = path.join(directory, "fail.json");
    await fs.writeFile(failJson, JSON.stringify({ verdict: "FAIL", summary: "Blocked.", guideCoverage: emptyCoverage, strongestObjections: [], releaseBlockers: [{ code: "BLOCK", finding: "Blocked.", requiredAction: "Fix it." }], nonBlockingExperiments: [] }));
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
    const reviewer = { id: "reviewer-1", displayName: "Test Reviewer", credential: "RN", licenseJurisdiction: "Test Board", licenseType: "Registered Nurse", verificationUrl: "https://mqa-internet.doh.state.fl.us/MQASearchServices/HealthcareProviders/LicenseVerification?LicInd=1&Procde=1701", verifiedAt: "2026-08-26", verificationStatus: "verified" };
    const intent = { primary: "test clinical intent", secondary: ["secondary"], audience: "test learners", risk: "clinical" };
    const guide = { route: "/learn/test/", risk: "clinical", intent, contentSha256, sourceSetSha256, sources: [{ id: "source-1", title: "Official source", publisher: "NCSBN", url: "https://www.nclex.com/test-plans.page", sourceUpdated: "2026-04-01", accessedAt: "2026-08-26", locator: "Test Plan" }], review: { decision: "approved", reviewerId: "reviewer-1", reviewedAt: "2026-08-26", scope: "Full clinical and source review", evidenceMatchesContent: true, claims: [{ id: "claim-1", locator: "Section 1", sourceIds: ["source-1"] }] } };
    const pass = auditGovernance({ provenance: { schemaVersion: 1, reviewer, guides: [guide] }, intents: { schemaVersion: 1, intents: { test: intent } }, pages: [{ route: "/learn/test/", identifiers: [`sha256:${contentSha256}`] }], now: new Date("2026-08-26T12:00:00Z") });
    expect(pass.provenanceFindings).toEqual([]);
    expect(pass.intentFindings).toEqual([]);

    const fakeFloridaRecord = auditGovernance({ provenance: { schemaVersion: 1, reviewer: { ...reviewer, verificationUrl: "https://mqa-internet.doh.state.fl.us/not-a-license-record" }, guides: [guide] }, intents: { schemaVersion: 1, intents: { test: intent } }, pages: [{ route: "/learn/test/", identifiers: [`sha256:${contentSha256}`] }], now: new Date("2026-08-26T12:00:00Z") });
    expect(fakeFloridaRecord.provenanceFindings.map((item) => item.code)).toContain("RN_VERIFICATION");

    const fail = auditGovernance({ provenance: { schemaVersion: 1, reviewer: { ...reviewer, verificationStatus: "pending", verificationUrl: null }, guides: [{ ...guide, review: { decision: "pending", claims: [] } }] }, intents: { schemaVersion: 1, intents: { test: intent } }, pages: [{ route: "/learn/test/", identifiers: [] }], now: new Date("2026-08-26T12:00:00Z") });
    expect(fail.provenanceFindings.map((item) => item.code)).toEqual(expect.arrayContaining(["RN_VERIFICATION", "DIGEST_BINDING", "RN_REVIEW", "CLAIM_PROVENANCE"]));
  });
});
