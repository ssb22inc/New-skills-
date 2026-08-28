import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { auditGovernance, auditHtml } from "../ops/seo-guardian.mjs";
import { extractOutputText, guideCoverageFromEvidence, parseReview, runAdversary } from "../ops/seo-adversary-ai.mjs";
import { enforceAdversary } from "../ops/seo-enforce-adversary.mjs";
import { articleJsonLd } from "../ops/build-learn.mjs";
import { CLINICAL_ARTICLES } from "../ops/learn-clinical.mjs";
import { SKILL_ARTICLES } from "../ops/learn-skills.mjs";
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
    expect(guide.body).toContain('aria-labelledby="urgent-electrolyte-findings"');
    expect(guide.body).not.toContain("aria-labeledby");
    const datedSources = sourcesFor(guide).filter((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.sourceUpdated ?? ""));
    expect(datedSources).toHaveLength(sourcesFor(guide).length);
  });

  it("keeps pending Guide 3 precise, accessible, and bound to current CDC sections", () => {
    const guide = CLINICAL_ARTICLES.find((article) => article.slug === "infection-control-precautions");
    expect(guide.updated).toBe("2026-08-27");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(4);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(3);
    expect(guide.body).toContain('class="table-wrap" role="region" aria-label="Transmission-based precautions comparison" tabindex="0"');
    expect(guide.body).toContain('aria-labelledby="infection-control-safety-boundary"');
    expect(guide.body).toContain("allogeneic hematopoietic stem-cell transplant recipients");
    expect(guide.body).toContain("CDC still prefers alcohol-based hand sanitizer");
    expect(guide.body).not.toContain("hand hygiene must be <b>soap and water</b>");
    expect(guide.body).not.toContain("within about 1&ndash;2 metres");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "cdc-isolation-precautions",
      "cdc-isolation-appendix-a-2025",
      "cdc-ppe-sequence-2023",
      "cdc-cdiff-acute-care-2026",
      "cdc-clinical-hand-hygiene-2024",
      "cdc-protective-environment-table-5",
      "ncsbn-2026-rn-test-plan",
    ]);
    expect(sourcesFor(guide).every((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.sourceUpdated ?? ""))).toBe(true);
  });

  it("keeps pending Guide 4 product-specific, accessible, and source-bound", () => {
    const guide = CLINICAL_ARTICLES.find((article) => article.slug === "insulin-types-and-timing");
    expect(guide.updated).toBe("2026-08-27");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(5);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(5);
    expect(guide.body).toContain('class="table-wrap" role="region" aria-label="Insulin category timing estimates" tabindex="0"');
    expect(guide.body).toContain('aria-labelledby="insulin-safety-boundary"');
    expect(guide.body).toContain("regular human insulin is not the only insulin that can ever be given IV");
    expect(guide.body).toContain("Do not mix insulin glargine");
    expect(guide.body).toContain("15 grams of fast-acting carbohydrate");
    expect(guide.body).not.toContain("Only regular insulin is given intravenously");
    expect(guide.body).not.toContain("Sweating tends to persist");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "cdc-insulin-types-2024",
      "dailymed-insulin-lispro-2024",
      "dailymed-insulin-aspart-2023",
      "dailymed-humulin-n-2017",
      "dailymed-lantus-2025",
      "medlineplus-low-blood-sugar-self-care-2026",
      "ncsbn-2026-rn-test-plan",
    ]);
    expect(sourcesFor(guide).every((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.sourceUpdated ?? ""))).toBe(true);
  });

  it("keeps pending Guide 5 reversal guidance qualified, accessible, and source-bound", () => {
    const guide = CLINICAL_ARTICLES.find((article) => article.slug === "high-alert-medications");
    expect(guide.updated).toBe("2026-08-27");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(8);
    expect(guide.body).toContain('class="table-wrap" role="region" aria-label="Qualified medication reversal pairings" tabindex="0"');
    expect(guide.body).toContain('aria-labelledby="high-alert-safety-boundary"');
    expect(guide.body).toContain("Flumazenil is not an automatic response to every overdose");
    expect(guide.body).toContain("Naloxone does not replace resuscitation");
    expect(guide.body).not.toContain("Monitor <b>aPTT for heparin</b>");
    expect(guide.body).not.toContain("Independent double-checking of the dose is standard practice");
    expect(guide.body).not.toContain("never stopped abruptly");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ismp-high-alert-acute-care-2024",
      "dailymed-heparin-sodium-2024",
      "dailymed-protamine-sulfate-2024",
      "dailymed-warfarin-sodium-2026",
      "dailymed-naloxone-injection-2026",
      "dailymed-flumazenil-2026",
      "dailymed-acetylcysteine-injection-2025",
      "dailymed-magnesium-sulfate-in-water",
      "dailymed-digifab-2025",
      "dailymed-deferoxamine-2026",
      "ncsbn-2026-rn-test-plan",
    ]);
    expect(sourcesFor(guide).every((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.sourceUpdated ?? ""))).toBe(true);
  });

  it("keeps pending Guide 6 prioritization contextual, accessible, and source-bound", () => {
    const guide = SKILL_ARTICLES.find((article) => article.slug === "prioritization-abc-maslow");
    expect(guide.updated).toBe("2026-08-27");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(5);
    expect(guide.body).toContain('class="table-wrap" role="region" aria-label="NCLEX prioritization decision sequence" tabindex="0"');
    expect(guide.body).toContain('aria-labelledby="prioritization-safety-boundary"');
    expect(guide.body).toContain("ABCs are a screen, not a universal ranking law");
    expect(guide.body).toContain("Cardiac arrest is the clearest counterexample");
    expect(guide.body).not.toContain("Outranks everything");
    expect(guide.body).not.toContain("Discard the expected");
    expect(guide.body).not.toContain("Findings that look urgent and are not");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ncsbn-2026-rn-test-plan",
      "ncsbn-next-generation-nclex",
      "aha-2025-adult-basic-life-support",
    ]);
    expect(sourcesFor(guide).at(-1)?.url).toBe("https://pubmed.ncbi.nlm.nih.gov/41122888/");
    expect(sourcesFor(guide).every((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.sourceUpdated ?? ""))).toBe(true);
  });

  it("keeps pending Guide 7 delegation jurisdiction-aware, accessible, and source-bound", () => {
    const guide = SKILL_ARTICLES.find((article) => article.slug === "delegation-and-assignment");
    expect(guide.updated).toBe("2026-08-27");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(5);
    expect(guide.body).toContain('class="table-wrap" role="region" aria-label="NCLEX delegation decision framework" tabindex="0"');
    expect(guide.body).toContain('aria-labelledby="delegation-safety-boundary"');
    expect(guide.body).toContain("Assignment and delegation are not the same");
    expect(guide.body).toContain("clinical reasoning, nursing judgment and critical decision-making cannot be delegated");
    expect(guide.body).not.toContain("The test that resolves most items");
    expect(guide.body).not.toContain("post-operative day-zero");
    expect(guide.body).not.toContain("pregnant staff member");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ncsbn-ana-delegation-guidelines-2019",
      "ncsbn-2026-rn-test-plan",
      "ncsbn-next-generation-nclex",
    ]);
    expect(sourcesFor(guide)[0].url).toBe("https://www.ncsbn.org/public-files/NGND-PosPaper_06.pdf");
    expect(sourcesFor(guide).every((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.sourceUpdated ?? ""))).toBe(true);
  });

  it("keeps pending Guide 8 therapeutic communication contextual, accessible, and safety-bound", () => {
    const guide = SKILL_ARTICLES.find((article) => article.slug === "therapeutic-communication");
    expect(guide.updated).toBe("2026-08-27");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(7);
    expect(guide.body).toContain('class="table-wrap" role="region" aria-label="Therapeutic communication techniques in context" tabindex="0"');
    expect(guide.body).toContain('aria-labelledby="communication-safety-boundary"');
    expect(guide.body).toContain("Techniques are tools, not answer keys");
    expect(guide.body).toContain("asking whether a person is suicidal does not increase suicidal thoughts or behavior");
    expect(guide.body).not.toContain("Correct answers open");
    expect(guide.body).not.toContain("almost always correct");
    expect(guide.body).not.toContain("fails every time");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ncbi-openrn-therapeutic-communication-2025",
      "nimh-suicide-five-action-steps-2024",
      "ncsbn-2026-rn-test-plan",
      "ncsbn-next-generation-nclex",
    ]);
    expect(sourcesFor(guide)[0].sourceUpdated).toBe("2025-11-01");
    expect(sourcesFor(guide)[1].locator).toContain("revised 2024");
  });

  it("keeps pending Guide 9 dosage calculations unit-bound, qualified, and safety-checked", () => {
    const guide = SKILL_ARTICLES.find((article) => article.slug === "dosage-calculation-formulas");
    expect(guide.updated).toBe("2026-08-27");
    expect(guide.body).toContain('aria-labelledby="dosage-safety-boundary"');
    expect(guide.body).toContain("unwanted units cancel");
    expect(guide.body).toContain("per day but is given in divided doses");
    expect(guide.body).toContain("1 kg ≈ 2.2 lb");
    expect(guide.body).toContain("Do not administer a dose when the order, concentration, calculation or result is unclear or implausible");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(2);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(5);
    expect(guide.body).not.toContain("three formulas");
    expect(guide.body).not.toContain("overwhelming majority");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ncbi-openrn-math-calculations-2023",
      "ncsbn-2026-rn-test-plan",
      "ncsbn-next-generation-nclex",
    ]);
    expect(sourcesFor(guide).every((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.sourceUpdated ?? ""))).toBe(true);
  });

  it("keeps pending Guide 10 study planning evidence-qualified and individualized", () => {
    const guide = SKILL_ARTICLES.find((article) => article.slug === "nclex-study-plan");
    expect(guide.updated).toBe("2026-08-27");
    expect(guide.body).toContain('aria-labelledby="study-plan-boundary"');
    expect(guide.body).toContain("There is no evidence-based daily question quota");
    expect(guide.body).toContain("43 reported significant benefits");
    expect(guide.body).toContain("do not establish one optimal interval, daily item count or guaranteed NCLEX outcome");
    expect(guide.body).toContain("not the NCLEX result");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(5);
    expect(guide.body).not.toContain("20&ndash;40 items");
    expect(guide.body).not.toContain("Weekly or fortnightly");
    expect(guide.body).not.toContain("Cramming new content in the final week has little effect");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ramnanan-2024-distributed-retrieval-review",
      "khalafi-2024-spaced-learning-nursing",
      "ncsbn-2026-rn-test-plan",
    ]);
    expect(sourcesFor(guide).every((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.sourceUpdated ?? ""))).toBe(true);
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
