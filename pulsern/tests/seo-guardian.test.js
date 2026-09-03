import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { auditCommercialGovernance, auditGovernance, auditHtml } from "../ops/seo-guardian.mjs";
import { candidateCommercialPagesFromDist, candidateGuidePagesFromDist, extractOutputText, guideCoverageFromEvidence, parseReview, runAdversary } from "../ops/seo-adversary-ai.mjs";
import { enforceAdversary } from "../ops/seo-enforce-adversary.mjs";
import { articleJsonLd } from "../ops/build-learn.mjs";
import { CLINICAL_ARTICLES } from "../ops/learn-clinical.mjs";
import { EXAM_ARTICLES } from "../ops/learn-exam.mjs";
import { LOGISTICS_ARTICLES } from "../ops/learn-logistics.mjs";
import { SKILL_ARTICLES } from "../ops/learn-skills.mjs";
import { TYPE_ARTICLES } from "../ops/learn-types.mjs";
import { SAMPLE_ARTICLES } from "../ops/learn-samples.mjs";
import { HUB_ARTICLES } from "../ops/learn-hubs.mjs";
import { sourcesFor } from "../ops/seo-content-policy.mjs";
import { injectSearchVerification, verificationMeta } from "../ops/search-verification.mjs";
import { runAppBoundary } from "../ops/seo-app-boundary.mjs";
import { COMMERCIAL_PAGES, commercialEvidence } from "../ops/commercial-content.mjs";
import { runCommercialCheck } from "../ops/seo-commercial-check.mjs";
import { runExamRulesCheck } from "../ops/seo-exam-rules-check.mjs";
import { runLiveRelease } from "../ops/seo-live-release.mjs";

describe("SEO guardian", () => {
  const emptyCoverage = { totalGuides: 0, approvedGuides: 0, pendingGuides: 0, approvedRoutes: [], pendingRoutes: [] };
  it("rejects a homepage with no H1", () => {
    const page = auditHtml("/", `<html><head><title>PulseRN adaptive NCLEX-RN preparation</title><meta name="description" content="Adaptive NCLEX-RN practice built by a licensed RN with modern study tools, transparent limitations, and careful educational review for future nurses."><link rel="canonical" href="https://www.pulsern.app/"><script type="application/ld+json">{"@type":"WebApplication"}</script></head><body><main><a href="/learn/">Guides</a><a href="/about/">About</a><a href="/pricing/">Pricing</a></main></body></html>`);
    expect(page.findings.some((item) => item.code === "H1_COUNT" && item.severity === "critical")).toBe(true);
  });

  it("keeps eight distinct commercial pages source-bound and digest-bound", () => {
    const evidence = commercialEvidence();
    expect(COMMERCIAL_PAGES).toHaveLength(8);
    expect(evidence.pages).toHaveLength(8);
    expect(new Set(evidence.pages.map((page) => page.intent.primary.toLowerCase())).size).toBe(8);
    for (const page of evidence.pages) {
      const sourceIds = new Set(page.sources.map((source) => source.id));
      expect(page.contentSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(page.sourceSetSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(page.sources.some((source) => new URL(source.url).hostname !== "www.pulsern.app")).toBe(true);
      expect(page.claims.length).toBeGreaterThan(0);
      expect(page.claims.every((claim) => claim.sourceIds.every((id) => sourceIds.has(id)))).toBe(true);
    }
    const pages = evidence.pages.map((page) => ({ route: page.route, identifiers: [`sha256:${page.contentSha256}`] }));
    const intents = { intents: Object.fromEntries(evidence.pages.map((page) => [page.route, page.intent])) };
    expect(auditCommercialGovernance({ evidence, intents, pages, now: new Date("2026-08-30T12:00:00Z") })).toEqual([]);
  });

  it("keeps the UWorld and Archer comparisons PulseRN-led without unsupported outcome claims", () => {
    for (const slug of ["compare/pulsern-vs-uworld", "compare/pulsern-vs-archer"]) {
      const page = COMMERCIAL_PAGES.find((item) => item.slug === slug);
      expect(page.h1).toContain("why start with PulseRN?");
      expect(page.body).toContain("Our recommendation: start with PulseRN.");
      expect(page.body).toContain("PulseRN recommendation");
      expect(page.body).toContain("Try PulseRN free");
      expect(page.body).not.toMatch(/Where (?:UWorld|Archer) is the clearer fit/i);
      expect(page.body).not.toMatch(/(?:guaranteed to pass|will pass the NCLEX|raises? your chance of passing)/i);
    }
  });

  it("fails closed when a commercial claim cites an unresolved source", () => {
    const evidence = commercialEvidence();
    evidence.pages[0].claims[0].sourceIds.push("missing-provider-source");
    const pages = evidence.pages.map((page) => ({ route: page.route, identifiers: [`sha256:${page.contentSha256}`] }));
    const intents = { intents: Object.fromEntries(evidence.pages.map((page) => [page.route, page.intent])) };
    const findings = auditCommercialGovernance({ evidence, intents, pages, now: new Date("2026-08-30T12:00:00Z") });
    expect(findings.some((item) => item.code === "COMMERCIAL_CLAIM_BINDING" && item.severity === "critical")).toBe(true);
  });

  it("rejects a comparison page without disclosure and provider sources", () => {
    const body = "comparison evidence ".repeat(520);
    const schema = { "@context": "https://schema.org", "@type": "Article", datePublished: "2026-08-30", dateModified: "2026-08-30", citation: ["https://www.pulsern.app/pricing/", "https://www.pulsern.app/about/"], identifier: `sha256:${"a".repeat(64)}` };
    const page = auditHtml("/compare/test/", `<html><head><title>PulseRN comparison methodology page</title><meta name="description" content="A transparent and current comparison of NCLEX preparation products using provider-owned evidence, dated prices, limitations, and learner-fit criteria."><link rel="canonical" href="https://www.pulsern.app/compare/test/"><script type="application/ld+json">${JSON.stringify(schema)}</script></head><body><main><h1>Compare products</h1><time datetime="2026-08-30">Last verified 2026-08-30</time><a href="/">Home</a><a href="/pricing/">Pricing</a><a href="/about/">About</a>${body}</main></body></html>`);
    expect(page.findings.some((item) => item.code === "COMMERCIAL_DISCLOSURE")).toBe(true);
    expect(page.findings.some((item) => item.code === "COMMERCIAL_VISIBLE_SOURCES")).toBe(true);
  });

  it("fails the commercial source audit when provider evidence markers drift", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pulsern-commercial-"));
    const evidenceFile = path.join(directory, "comparison-evidence.json");
    const outputFile = path.join(directory, "commercial.json");
    const evidence = { schemaVersion: 1, pages: [{ sources: [{ id: "provider", title: "Provider", publisher: "UWorld", url: "https://nursing.uworld.com/nclex-rn/", locator: "Features", accessedAt: "2026-08-30", expectedMarkers: ["expected feature"] }] }] };
    await fs.writeFile(evidenceFile, JSON.stringify(evidence));
    const report = await runCommercialCheck({ evidenceFile, directory, outputFile, fetchImpl: async () => new Response("<html><body>changed product page</body></html>", { status: 200, headers: { "content-type": "text/html" } }) });
    expect(report.verdict).toBe("FAIL");
    expect(report.findings.some((item) => item.code === "COMMERCIAL_SOURCE_DRIFT")).toBe(true);
  });

  it("keeps eight distinct exam-logistics guides intent-mapped and bound to official rule markers", () => {
    expect(LOGISTICS_ARTICLES).toHaveLength(8);
    expect(new Set(LOGISTICS_ARTICLES.map((article) => article.slug)).size).toBe(8);
    for (const article of LOGISTICS_ARTICLES) {
      expect(article.topic).toBe("Registration and results");
      expect(article.published).toBe("2026-08-31");
      expect(article.updated).toBe("2026-08-31");
      expect(article.body).toContain("source-");
      const sources = sourcesFor(article);
      expect(sources.length).toBeGreaterThanOrEqual(2);
      expect(sources.some((source) => Array.isArray(source.expectedMarkers) && source.expectedMarkers.length)).toBe(true);
      expect(sources.every((source) => new URL(source.url).protocol === "https:")).toBe(true);
    }
  });

  it("keeps the two 2026 authority hubs distinct, source-bound, and internally connected", () => {
    expect(HUB_ARTICLES).toHaveLength(2);
    expect(new Set(HUB_ARTICLES.map((article) => article.slug)).size).toBe(2);
    expect(HUB_ARTICLES.map((article) => article.slug)).toEqual(["2026-nclex-rn-test-plan", "nclex-clinical-judgment"]);
    for (const article of HUB_ARTICLES) {
      expect(article.topic).toBe("2026 NCLEX essentials");
      expect(article.published).toBe("2026-09-02");
      expect(article.updated).toBe("2026-09-02");
      expect(article.body.match(/href="\/learn\//g)?.length).toBeGreaterThanOrEqual(8);
      const sources = sourcesFor(article);
      expect(sources).toHaveLength(3);
      expect(sources.every((source) => new URL(source.url).protocol === "https:")).toBe(true);
      expect(sources.some((source) => Array.isArray(source.expectedMarkers) && source.expectedMarkers.length >= 3)).toBe(true);
    }
    const testPlan = HUB_ARTICLES.find((article) => article.slug === "2026-nclex-rn-test-plan");
    const clinicalJudgment = HUB_ARTICLES.find((article) => article.slug === "nclex-clinical-judgment");
    expect(testPlan.body).toContain("15–21%");
    expect(testPlan.body).toContain("13–19%");
    expect(testPlan.body).toContain("/learn/nclex-clinical-judgment/");
    expect(clinicalJudgment.body).toContain("was not constructed to replace");
    expect(clinicalJudgment.body).toContain("/learn/next-generation-nclex-what-changed/");
  });

  it("fails closed when an official NCLEX rule marker drifts", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pulsern-exam-rules-"));
    const provenanceFile = path.join(directory, "content-provenance.json");
    const outputFile = path.join(directory, "exam-rules.json");
    await fs.writeFile(provenanceFile, JSON.stringify({ schemaVersion: 1, guides: [{ sources: [{ id: "ncsbn-rule", url: "https://www.nclex.com/register.page", expectedMarkers: ["Authorization to Test"] }] }] }));
    const report = await runExamRulesCheck({ provenanceFile, outputFile, fetchImpl: async () => new Response("<html><body>changed official page</body></html>", { status: 200, headers: { "content-type": "text/html" } }) });
    expect(report.verdict).toBe("FAIL");
    expect(report.findings.some((item) => item.code === "EXAM_RULE_SOURCE_DRIFT")).toBe(true);
  });

  it("does not describe a pull-request candidate as already live", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pulsern-live-candidate-"));
    await fs.writeFile(path.join(directory, "sitemap.xml"), '<urlset><url><loc>https://www.pulsern.app/</loc></url></urlset>');
    const report = await runLiveRelease({ directory, outputFile: path.join(directory, "live-release.json"), expectedCommitSha: "a".repeat(40), expectedLive: false });
    expect(report.verdict).toBe("PASS");
    expect(report.expectedLive).toBe(false);
    expect(report.status).toContain("candidate-artifact-only");
    expect(report.deployedCommitSha).toBeNull();
  });

  it("fails closed when production is not bound to the exact merge commit", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pulsern-live-main-"));
    await fs.writeFile(path.join(directory, "sitemap.xml"), '<urlset><url><loc>https://www.pulsern.app/</loc></url></urlset>');
    const report = await runLiveRelease({
      directory,
      outputFile: path.join(directory, "live-release.json"),
      expectedCommitSha: "a".repeat(40),
      expectedLive: true,
      maxAttempts: 1,
      intervalMs: 0,
      fetchImpl: async () => new Response(JSON.stringify({ commitSha: "b".repeat(40) }), { status: 200, headers: { "content-type": "application/json" } }),
      runCrawlImpl: async () => { throw new Error("crawl must not run for the wrong commit"); },
    });
    expect(report.verdict).toBe("FAIL");
    expect(report.findings.some((item) => item.code === "LIVE_RELEASE_COMMIT")).toBe(true);
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

  it("keeps every public sample set complete, source-bound, and bound to its exact RN approval", async () => {
    expect(SAMPLE_ARTICLES).toHaveLength(4);
    const ledger = JSON.parse(await fs.readFile(new URL("../content-review-records.json", import.meta.url), "utf8"));
    const sha256 = (value) => createHash("sha256").update(value).digest("hex");
    for (const sample of SAMPLE_ARTICLES) {
      expect(sample.topic).toBe("Practice questions");
      expect(sample.body.match(/<section class="question"/g)).toHaveLength(5);
      expect(sample.body.match(/<details>/g)).toHaveLength(5);
      expect(sample.body).toContain("Educational boundary");
      const sources = sourcesFor(sample);
      expect(sources.length).toBeGreaterThanOrEqual(3);
      const contentSha256 = sha256(JSON.stringify({ title: sample.title, h1: sample.h1 ?? sample.title, description: sample.description, body: sample.body, faq: sample.faq ?? [] }));
      const sourceSetSha256 = sha256(JSON.stringify(sources.map(({ id, url, locator }) => ({ id, url, locator }))));
      expect(ledger.reviews[sample.slug]).toMatchObject({
        decision: "approved",
        reviewerId: "sheldon-bennett-rn",
        contentSha256,
        sourceSetSha256,
      });
      expect(ledger.reviews[sample.slug].reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(ledger.reviews[sample.slug].claims.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("injects Search Console verification only from a valid build-time token", () => {
    const token = "abcDEF_1234567890-search-console-token";
    expect(verificationMeta("")).toBe("");
    expect(() => verificationMeta("bad token")).toThrow(/GOOGLE_SITE_VERIFICATION/);
    const html = '<html><head><meta name="description" content="PulseRN"></head></html>';
    expect(injectSearchVerification(html, "")).toBe(html);
    expect(injectSearchVerification(html, token)).toContain(`name="google-site-verification" content="${token}"`);
  });

  it("rejects a public sample set with fewer than five questions and rationales", () => {
    const body = "clinical judgment ".repeat(520);
    const schema = { "@context": "https://schema.org", "@graph": [
      { "@type": "Article", datePublished: "2026-08-29", dateModified: "2026-08-29", author: { "@id": "https://www.pulsern.app/#org" }, reviewedBy: { "@id": "https://www.pulsern.app/about/#reviewer" }, citation: ["https://www.nclex.com/test-plans.page"] },
      { "@type": "Organization", "@id": "https://www.pulsern.app/#org", name: "PulseRN" },
      { "@type": "Person", "@id": "https://www.pulsern.app/about/#reviewer", name: "Test Reviewer, RN", jobTitle: "Registered Nurse" },
    ] };
    const page = auditHtml("/learn/nclex-test-practice-questions/", `<html><head><title>NCLEX test practice questions | PulseRN</title><meta name="description" content="Five original NCLEX practice questions with visible rationales, current sources, review evidence, and an educational safety boundary."><link rel="canonical" href="https://www.pulsern.app/learn/nclex-test-practice-questions/"><script type="application/ld+json">${JSON.stringify(schema)}</script></head><body><main><h1>NCLEX test practice questions</h1><time datetime="2026-08-29">2026-08-29</time><p>Educational boundary</p><a href="/learn/">Guides</a><a href="/about/">About</a><a href="https://www.nclex.com/test-plans.page">Source</a><section class="question"><details><summary>Answer</summary><p>Rationale</p></details></section>${body}</main></body></html>`);
    expect(page.findings.some((item) => item.code === "SAMPLE_SET_DEPTH" && item.severity === "high")).toBe(true);
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

  it("keeps pending Guide 11 spaced repetition qualified, auditable, and contextual", () => {
    const guide = SKILL_ARTICLES.find((article) => article.slug === "spaced-repetition-for-nursing-students");
    expect(guide.updated).toBe("2026-08-28");
    expect(guide.body).toContain('aria-labelledby="spaced-repetition-boundary"');
    expect(guide.body).toContain("does not establish one best schedule");
    expect(guide.body).toContain("43 studies reported significant benefits");
    expect(guide.body).toContain("Authoritative source");
    expect(guide.body).toContain("should not be the only practice for prioritization");
    expect(guide.body).toContain("No study cited here establishes that 15 minutes a day");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(5);
    expect(guide.body).not.toContain("best-evidenced tool");
    expect(guide.body).not.toContain("most of what you studied today is substantially gone within a week");
    expect(guide.body).not.toContain("Do the due cards daily");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ramnanan-2024-distributed-retrieval-review",
      "khalafi-2024-spaced-learning-nursing",
      "ncsbn-2026-rn-test-plan",
    ]);
    expect(sourcesFor(guide).every((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.sourceUpdated ?? ""))).toBe(true);
  });

  it("keeps pending Guide 12 NCLEX retake guidance official, qualified, and actionable", () => {
    const guide = SKILL_ARTICLES.find((article) => article.slug === "failed-the-nclex-what-now");
    expect(guide.updated).toBe("2026-08-28");
    expect(guide.body).toContain('aria-labelledby="retake-boundary"');
    expect(guide.body).toContain("it is not a section-by-section grade, an exact score or proof that one factor caused the result");
    expect(guide.body).toContain("allows another examination 45 days after the prior administration");
    expect(guide.body).toContain("up to eight times in a year with 45 test-free days");
    expect(guide.body).toContain("do not infer how close you were from where the exam stopped");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(3);
    expect(guide.body).not.toContain("Most candidates who did not pass were closer");
    expect(guide.body).not.toContain("this is the only thing that fixes it");
    expect(guide.body).not.toContain("most retakers are missing");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ncsbn-nclex-results-retake",
      "ncsbn-candidate-performance-report",
      "ncsbn-computerized-adaptive-testing",
      "ncsbn-2026-rn-test-plan",
      "ramnanan-2024-distributed-retrieval-review",
      "khalafi-2024-spaced-learning-nursing",
    ]);
    expect(sourcesFor(guide).slice(0, 3).every((source) => source.sourceUpdated === null && /live page checked 2026-08-(?:28|31)/.test(source.locator))).toBe(true);
  });

  it("keeps pending Guide 13 NCLEX scoring accurate, accessible, and source-bound", () => {
    const guide = EXAM_ARTICLES.find((article) => article.slug === "how-is-the-nclex-scored");
    expect(guide.updated).toBe("2026-08-28");
    expect(guide.body).toContain('aria-labelledby="scoring-boundary"');
    expect(guide.body).toContain("using all previous responses and the difficulty of those items");
    expect(guide.body).toContain("Fewer than the required minimum items is an automatic fail");
    expect(guide.body).toContain("items with more than one key can receive partial credit");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(3);
    expect(guide.body).not.toContain("no partial credit");
    expect(guide.body).not.toContain("the next item is harder");
    expect(guide.body).not.toContain("using an alternate rule based on your recent performance");
    expect(guide.body).not.toContain("A test that feels hard is often a test that is going well");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ncsbn-computerized-adaptive-testing",
      "ncsbn-nclex-faqs",
      "ncsbn-2026-rn-test-plan",
      "ncsbn-next-generation-nclex",
    ]);
  });

  it("keeps pending Guide 14 NCLEX length current, qualified, and source-bound", () => {
    const guide = EXAM_ARTICLES.find((article) => article.slug === "how-many-questions-is-the-nclex");
    expect(guide.updated).toBe("2026-08-28");
    expect(guide.body).toContain('aria-labelledby="length-boundary"');
    expect(guide.body).toContain("at least 85 items and may receive up to 150");
    expect(guide.body).toContain("five-hour limit includes all breaks");
    expect(guide.body).toContain("fewer than 85 completed items results in a failing examination");
    expect(guide.body).toContain("15 pretest items appear on every examination");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(3);
    expect(guide.body).not.toContain("based on your recent performance");
    expect(guide.body).not.toContain("Five is a warning sign");
    expect(guide.body).not.toContain("Candidates pass and fail at the maximum length");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ncsbn-2026-rn-test-plan",
      "ncsbn-computerized-adaptive-testing",
      "ncsbn-nclex-faqs",
      "ncsbn-2026-candidate-bulletin",
    ]);
  });

  it("keeps pending Guide 15 NGN changes current, qualified, and source-bound", () => {
    const guide = EXAM_ARTICLES.find((article) => article.slug === "next-generation-nclex-what-changed");
    expect(guide.updated).toBe("2026-08-28");
    expect(guide.body).toContain('aria-labelledby="ngn-boundary"');
    expect(guide.body).toContain("launched the Next Generation NCLEX (NGN) on April 1, 2023");
    expect(guide.body).toContain("three six-item sets, or 18 case-study items");
    expect(guide.body).toContain("Approximately 10% of the exam consists of stand-alone clinical-judgment items");
    expect(guide.body).toContain("plus/minus, zero/one or rationale scoring");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(4);
    expect(guide.body).not.toContain("single case study carries more weight");
    expect(guide.body).not.toContain("find it fairer");
    expect(guide.body).not.toContain("Safety is still the organising principle");
    expect(guide.body).not.toContain("Recognise cues");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ncsbn-next-generation-nclex",
      "ncsbn-2026-rn-test-plan",
      "ncsbn-nclex-faqs",
    ]);
  });

  it("keeps pending Guide 16 test-day rules current, qualified, and source-bound", () => {
    const guide = EXAM_ARTICLES.find((article) => article.slug === "nclex-test-day-what-to-expect");
    expect(guide.updated).toBe("2026-08-28");
    expect(guide.body).toContain('aria-labelledby="test-day-boundary"');
    expect(guide.body).toContain("arrive at least 30 minutes before the scheduled time");
    expect(guide.body).toContain("clock does not stop during a break");
    expect(guide.body).toContain("cannot return after advancing");
    expect(guide.body).toContain("Official results are released only by the nursing regulatory body");
    expect(guide.body.match(/<caption>/g)).toHaveLength(1);
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(4);
    expect(guide.body).not.toContain("around question 60");
    expect(guide.body).not.toContain("engine raises difficulty");
    expect(guide.body).not.toContain("break is often worth taking");
    expect(guide.body).not.toContain("frequently means you were doing well");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual([
      "ncsbn-2026-candidate-bulletin-pdf",
      "ncsbn-2026-rn-test-plan",
      "ncsbn-computerized-adaptive-testing",
      "ncsbn-nclex-faqs",
    ]);
  });

  it("keeps pending Guide 17 bow-tie guidance qualified and source-bound", () => {
    const guide = TYPE_ARTICLES.find((article) => article.slug === "bow-tie-questions");
    expect(guide.updated).toBe("2026-08-28");
    expect(guide.body).toContain('aria-labelledby="bow-tie-boundary"');
    expect(guide.body).toContain("one potential condition, two actions to take and two parameters to monitor");
    expect(guide.body).toContain("Do not assume a bow-tie is all-or-nothing");
    expect(guide.body.match(/scope="col"/g)).toHaveLength(3);
    expect(guide.body.match(/scope="row"/g)).toHaveLength(3);
    expect(guide.body).not.toContain("gives you nothing for that");
    expect(guide.body).not.toContain("incorrect condition usually costs you the whole item");
    expect(guide.body).not.toContain("Early hypoxaemia");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual(["ncsbn-2026-rn-test-plan", "ncsbn-next-generation-nclex", "ncsbn-nclex-faqs"]);
  });

  it("keeps pending Guide 18 matrix guidance qualified and source-bound", () => {
    const guide = TYPE_ARTICLES.find((article) => article.slug === "matrix-grid-questions");
    expect(guide.updated).toBe("2026-08-28");
    expect(guide.body).toContain('aria-labelledby="matrix-boundary"');
    expect(guide.body).toContain("does not establish that every matrix is scored row by row");
    expect(guide.body).not.toContain("usually scored <b>row by row</b>");
    expect(guide.body).not.toContain("Each finding you classify correctly can earn credit independently");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual(["ncsbn-2026-rn-test-plan", "ncsbn-next-generation-nclex", "ncsbn-nclex-faqs"]);
  });

  it("keeps pending Guide 19 cloze guidance qualified and source-bound", () => {
    const guide = TYPE_ARTICLES.find((article) => article.slug === "cloze-drop-down-questions");
    expect(guide.updated).toBe("2026-08-28");
    expect(guide.body).toContain('aria-labelledby="cloze-boundary"');
    expect(guide.body).toContain("does not establish that every blank is scored independently");
    expect(guide.body).toContain("study guidance, not a claim that NCSBN scores the blanks as a linked chain");
    expect(guide.body).not.toContain("linked selections must agree with one another to earn credit");
    expect(guide.body).not.toContain("blanks 2 and 3 are almost certainly wrong");
    expect(guide.body).not.toContain("Answer out of order");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual(["ncsbn-2026-rn-test-plan", "ncsbn-next-generation-nclex", "ncsbn-nclex-faqs"]);
  });

  it("keeps pending Guide 20 highlight guidance qualified and source-bound", () => {
    const guide = TYPE_ARTICLES.find((article) => article.slug === "highlight-questions");
    expect(guide.updated).toBe("2026-08-28");
    expect(guide.body).toContain('aria-labelledby="highlight-boundary"');
    expect(guide.body).toContain("does not establish that every highlight item uses plus/minus scoring");
    expect(guide.body).toContain("study guidance, not an NCSBN scoring rule");
    expect(guide.body).not.toContain("These items commonly use +/- scoring");
    expect(guide.body).not.toContain("two or three things");
    expect(guide.body).not.toContain("expected value near zero");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual(["ncsbn-2026-rn-test-plan", "ncsbn-next-generation-nclex", "ncsbn-nclex-faqs"]);
  });

  it("keeps pending Guide 21 SATA guidance qualified and source-bound", () => {
    const guide = TYPE_ARTICLES.find((article) => article.slug === "select-all-that-apply-strategy");
    expect(guide.updated).toBe("2026-08-29");
    expect(guide.body).toContain('aria-labelledby="sata-boundary"');
    expect(guide.body).toContain("does not establish that every multiple-response item uses plus/minus scoring");
    expect(guide.body).toContain("study guidance, not an assertion that NCSBN awards an independent point");
    expect(guide.body).not.toContain("expected value is roughly zero");
    expect(guide.body).not.toContain("Under older all-or-nothing scoring");
    expect(guide.body).not.toContain("Options containing always, never");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual(["ncsbn-2026-rn-test-plan", "ncsbn-next-generation-nclex", "ncsbn-nclex-faqs"]);
  });

  it("keeps pending Guide 22 ordering guidance qualified and source-bound", () => {
    const guide = TYPE_ARTICLES.find((article) => article.slug === "drag-and-drop-ordering-questions");
    expect(guide.updated).toBe("2026-08-29");
    expect(guide.body).toContain('aria-labelledby="ordering-boundary"');
    expect(guide.body).toContain("does not establish that every ordering item is all-or-nothing");
    expect(guide.body).toContain("study guidance, not a clinical protocol or an NCSBN scoring rule");
    expect(guide.body).not.toContain("ABC — airway, breathing, circulation");
    expect(guide.body).not.toContain("opening steps carry the most weight");
    expect(guide.body).not.toContain("the exam scores it as one");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual(["ncsbn-2026-rn-test-plan", "ncsbn-next-generation-nclex", "ncsbn-nclex-faqs"]);
  });

  it("keeps pending Guide 23 lab guidance qualified and source-bound", () => {
    const guide = CLINICAL_ARTICLES.find((article) => article.slug === "lab-values-to-memorize");
    expect(guide.updated).toBe("2026-08-29");
    expect(guide.body).toContain('aria-labelledby="lab-safety-boundary"');
    expect(guide.body).toContain("Laboratory results are not interpreted from a universal table");
    expect(guide.body).toContain("does not publish a guaranteed list of laboratory numbers");
    expect(guide.body).not.toContain("More NCLEX items hinge on potassium");
    expect(guide.body).not.toContain("Potassium below 2.5");
    expect(guide.body).not.toContain("roughly three times");
    expect(sourcesFor(guide).map((source) => source.id)).toEqual(["medlineplus-understanding-lab-results-2025", "ncsbn-2026-rn-test-plan", "ramnanan-2024-distributed-retrieval-review"]);
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

  it("binds exact current-release and pending guide HTML into the adversary packet", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pulsern-adversary-content-"));
    await fs.mkdir(path.join(directory, "learn", "current"), { recursive: true });
    await fs.mkdir(path.join(directory, "learn", "pending"), { recursive: true });
    const currentDigest = "a".repeat(64);
    const pendingDigest = "b".repeat(64);
    await fs.writeFile(path.join(directory, "content-provenance.json"), JSON.stringify({ generatedAt: "2026-09-02T00:00:00.000Z", guides: [
      { route: "/learn/current/", published: "2026-09-02", updated: "2026-09-02", risk: "exam", contentSha256: currentDigest, sourceSetSha256: "c".repeat(64), sources: [], review: { decision: "approved" } },
      { route: "/learn/pending/", published: "2026-08-01", updated: "2026-08-01", risk: "exam", contentSha256: pendingDigest, sourceSetSha256: "d".repeat(64), sources: [], review: { decision: "pending" } },
      { route: "/learn/old/", published: "2026-08-01", updated: "2026-08-01", risk: "exam", contentSha256: "e".repeat(64), sourceSetSha256: "f".repeat(64), sources: [], review: { decision: "approved" } },
    ] }));
    await fs.writeFile(path.join(directory, "learn", "current", "index.html"), `<article data-guide="current">sha256:${currentDigest}</article>`);
    await fs.writeFile(path.join(directory, "learn", "pending", "index.html"), `<article data-guide="pending">sha256:${pendingDigest}</article>`);
    const packet = await candidateGuidePagesFromDist({ coverage: { totalGuides: 3, pendingRoutes: ["/learn/pending/"] }, distDirectory: directory, generatedAt: "2026-09-02T12:00:00.000Z" });
    expect(packet.pages.map((page) => page.route)).toEqual(["/learn/current/", "/learn/pending/"]);
    expect(packet.pages.every((page) => /^[a-f0-9]{64}$/.test(page.htmlSha256))).toBe(true);
    expect(packet.pages.find((page) => page.route === "/learn/current/").html).toContain('data-guide="current"');
  });

  it("binds exact current-release commercial HTML into the adversary packet", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pulsern-adversary-commercial-"));
    await fs.mkdir(path.join(directory, "compare", "pulsern-vs-example"), { recursive: true });
    const digest = "a".repeat(64);
    await fs.writeFile(path.join(directory, "comparison-evidence.json"), JSON.stringify({ generatedAt: "2026-09-03T00:00:00.000Z", pages: [
      { route: "/compare/pulsern-vs-example/", published: "2026-08-30", updated: "2026-09-03", contentSha256: digest, sourceSetSha256: "b".repeat(64), intent: { primary: "PulseRN vs Example" }, claims: [], sources: [] },
      { route: "/compare/old/", published: "2026-08-30", updated: "2026-08-30", contentSha256: "c".repeat(64), sourceSetSha256: "d".repeat(64), intent: { primary: "old" }, claims: [], sources: [] },
    ] }));
    await fs.writeFile(path.join(directory, "compare", "pulsern-vs-example", "index.html"), `<article data-comparison="example">sha256:${digest}</article>`);
    const packet = await candidateCommercialPagesFromDist({ distDirectory: directory, generatedAt: "2026-09-03T12:00:00.000Z" });
    expect(packet.pages.map((page) => page.route)).toEqual(["/compare/pulsern-vs-example/"]);
    expect(packet.pages[0].html).toContain('data-comparison="example"');
    expect(packet.pages[0].htmlSha256).toMatch(/^[a-f0-9]{64}$/);
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
    expect(workflow).toContain('test "${{ steps.app_boundary.outcome }}" = "success"');
    expect(workflow).toContain("npm run seo:enforce");
  });

  it("fails closed when the public/private app boundary regresses", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pulsern-app-boundary-"));
    await fs.mkdir(path.join(directory, "app"), { recursive: true });
    await Promise.all([
      fs.copyFile(new URL("../index.html", import.meta.url), path.join(directory, "index.html")),
      fs.copyFile(new URL("../app/index.html", import.meta.url), path.join(directory, "app/index.html")),
      fs.copyFile(new URL("../public/app.webmanifest", import.meta.url), path.join(directory, "app.webmanifest")),
      fs.copyFile(new URL("../public/app-sw.js", import.meta.url), path.join(directory, "app-sw.js")),
      fs.writeFile(path.join(directory, "sitemap.xml"), '<urlset><url><loc>https://www.pulsern.app/</loc></url></urlset>'),
      fs.writeFile(path.join(directory, "llms.txt"), 'PulseRN public pages: https://www.pulsern.app/'),
    ]);
    const vercelFile = new URL("../vercel.json", import.meta.url);
    const pass = await runAppBoundary({ directory, vercelFile, outputFile: path.join(directory, "reports/pass.json") });
    expect(pass.verdict).toBe("PASS");

    const appFile = path.join(directory, "app/index.html");
    const appHtml = await fs.readFile(appFile, "utf8");
    await fs.writeFile(appFile, appHtml.replace(/noindex/g, "index"));
    const fail = await runAppBoundary({ directory, vercelFile, outputFile: path.join(directory, "reports/fail.json") });
    expect(fail.verdict).toBe("FAIL");
    expect(fail.findings.map((item) => item.code)).toContain("APP_NOINDEX");
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
