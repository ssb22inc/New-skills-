#!/usr/bin/env node

/* Required independent second-opinion reviewer. The model receives the
   deterministic evidence bundle and must return a machine-readable verdict.
   Unknown, malformed, empty, or FAIL results are release failures. */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "guideCoverage", "strongestObjections", "releaseBlockers", "nonBlockingExperiments"],
  properties: {
    verdict: { type: "string", enum: ["PASS", "FAIL"] },
    summary: { type: "string", minLength: 1 },
    guideCoverage: {
      type: "object",
      additionalProperties: false,
      required: ["totalGuides", "approvedGuides", "pendingGuides", "approvedRoutes", "pendingRoutes"],
      properties: {
        totalGuides: { type: "integer", minimum: 0 },
        approvedGuides: { type: "integer", minimum: 0 },
        pendingGuides: { type: "integer", minimum: 0 },
        approvedRoutes: { type: "array", items: { type: "string", minLength: 1 } },
        pendingRoutes: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    strongestObjections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "finding", "evidence", "inference"],
        properties: {
          category: { type: "string", minLength: 1 },
          finding: { type: "string", minLength: 1 },
          evidence: { type: "string", minLength: 1 },
          inference: { type: "boolean" },
        },
      },
    },
    releaseBlockers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "finding", "requiredAction"],
        properties: {
          code: { type: "string", minLength: 1 },
          finding: { type: "string", minLength: 1 },
          requiredAction: { type: "string", minLength: 1 },
        },
      },
    },
    nonBlockingExperiments: { type: "array", items: { type: "string", minLength: 1 } },
  },
};

export function extractOutputText(response) {
  const chatText = response?.choices?.[0]?.message?.content;
  if (typeof chatText === "string") return chatText.trim();
  return (response?.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n").trim();
}

const sorted = (values) => [...values].sort();
const sameArray = (left, right) => JSON.stringify(sorted(left ?? [])) === JSON.stringify(sorted(right ?? []));

export function guideCoverageFromEvidence(evidence) {
  const guideRoutes = sorted((evidence?.["report.json"]?.pages ?? [])
    .map((page) => page.route)
    .filter((route) => route?.startsWith("/learn/") && route !== "/learn/"));
  const reviewCodes = new Set(["RN_REVIEW", "CLAIM_PROVENANCE", "HUMAN_ACCOUNTABILITY"]);
  const reviewFindings = [
    ...(evidence?.["report.json"]?.pages ?? []).flatMap((page) => (page.findings ?? []).map((item) => ({ ...item, route: item.route ?? page.route }))),
    ...(evidence?.["provenance.json"]?.findings ?? []),
  ];
  const guideRouteSet = new Set(guideRoutes);
  const pendingRoutes = sorted(new Set(reviewFindings
    .filter((item) => reviewCodes.has(item.code) && guideRouteSet.has(item.route))
    .map((item) => item.route)));
  const pendingSet = new Set(pendingRoutes);
  const approvedRoutes = guideRoutes.filter((route) => !pendingSet.has(route));
  return {
    totalGuides: guideRoutes.length,
    approvedGuides: approvedRoutes.length,
    pendingGuides: pendingRoutes.length,
    approvedRoutes,
    pendingRoutes,
  };
}

export function parseReview(text, expectedCoverage = null) {
  if (!text?.trim()) throw new Error("Adversarial reviewer returned no text.");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let review;
  try { review = JSON.parse(cleaned); } catch { throw new Error("Adversarial reviewer returned malformed JSON."); }
  if (!review || typeof review !== "object" || !["PASS", "FAIL"].includes(review.verdict)) throw new Error("Adversarial verdict must be PASS or FAIL.");
  if (typeof review.summary !== "string" || !review.summary.trim()) throw new Error("Adversarial summary is required.");
  const coverage = review.guideCoverage;
  if (!coverage || !Number.isInteger(coverage.totalGuides) || !Number.isInteger(coverage.approvedGuides) || !Number.isInteger(coverage.pendingGuides) || !Array.isArray(coverage.approvedRoutes) || !Array.isArray(coverage.pendingRoutes)) throw new Error("Adversarial guideCoverage is required.");
  if (coverage.totalGuides !== coverage.approvedGuides + coverage.pendingGuides || coverage.approvedGuides !== coverage.approvedRoutes.length || coverage.pendingGuides !== coverage.pendingRoutes.length) throw new Error("Adversarial guideCoverage counts are internally inconsistent.");
  if (expectedCoverage && (coverage.totalGuides !== expectedCoverage.totalGuides || coverage.approvedGuides !== expectedCoverage.approvedGuides || coverage.pendingGuides !== expectedCoverage.pendingGuides || !sameArray(coverage.approvedRoutes, expectedCoverage.approvedRoutes) || !sameArray(coverage.pendingRoutes, expectedCoverage.pendingRoutes))) throw new Error("Adversarial guideCoverage contradicts deterministic evidence.");
  for (const key of ["strongestObjections", "releaseBlockers", "nonBlockingExperiments"]) {
    if (!Array.isArray(review[key])) throw new Error(`Adversarial ${key} must be an array.`);
  }
  if (review.verdict === "PASS" && review.releaseBlockers.length) throw new Error("A PASS verdict cannot contain release blockers.");
  if (review.verdict === "FAIL" && !review.releaseBlockers.length) throw new Error("A FAIL verdict must contain at least one release blocker.");
  if (expectedCoverage?.approvedGuides > 0) {
    const narrative = [review.summary, ...review.strongestObjections.flatMap((item) => [item.finding, item.evidence]), ...review.releaseBlockers.map((item) => item.finding)].join(" ");
    const deniesApprovedGuides = /\ball (?:public |clinical )?guides? (?:lack|are missing|remain pending|are unapproved)\b|\bno (?:public |clinical )?guide (?:has|is|shows)\b|\bfor (?:all|every) (?:public |clinical )?guides?\b|\bno evidence\b[^.]{0,160}\b(?:any|all) (?:clinical )?(?:content|guides?)\b/i;
    if (deniesApprovedGuides.test(narrative)) throw new Error("Adversarial narrative contradicts the approved-guide evidence.");
  }
  return review;
}

const esc = (value) => String(value).replace(/\|/g, "\\|");
export function reviewMarkdown(result) {
  const objections = result.strongestObjections.length
    ? result.strongestObjections.map((item) => `- **${esc(item.category)}:** ${item.finding} Evidence: ${item.evidence}${item.inference ? " *(inference)*" : ""}`).join("\n")
    : "- None.";
  const blockers = result.releaseBlockers.length
    ? result.releaseBlockers.map((item) => `- **${esc(item.code)}:** ${item.finding} Required: ${item.requiredAction}`).join("\n")
    : "- None.";
  const experiments = result.nonBlockingExperiments.length
    ? result.nonBlockingExperiments.map((item) => `- ${item}`).join("\n")
    : "- None.";
  return `# PulseRN model-based adversarial review\n\nModel: ${result.model}\nGenerated: ${result.generatedAt}\nGuide coverage: ${result.guideCoverage.approvedGuides} approved · ${result.guideCoverage.pendingGuides} pending · ${result.guideCoverage.totalGuides} total\n\n## Verdict\n\n**${result.verdict}** — ${result.summary}\n\n## Strongest objections\n\n${objections}\n\n## Release blockers\n\n${blockers}\n\n## Non-blocking experiments\n\n${experiments}\n`;
}

async function readJsonIfPresent(filename) {
  try { return JSON.parse(await fs.readFile(filename, "utf8")); } catch (error) {
    if (error?.code === "ENOENT") return { missing: true, file: filename };
    throw error;
  }
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export async function candidateGuidePagesFromDist({ coverage, distDirectory = "dist", generatedAt = new Date().toISOString() }) {
  if (!coverage?.totalGuides) return { schemaVersion: 1, generatedAt, scope: "current-release-and-pending-guides", pages: [] };
  const provenance = JSON.parse(await fs.readFile(path.join(distDirectory, "content-provenance.json"), "utf8"));
  const releaseDate = String(provenance.generatedAt ?? "").slice(0, 10);
  const pending = new Set(coverage.pendingRoutes ?? []);
  const currentReleaseRoutes = (provenance.guides ?? []).filter((guide) => releaseDate && guide.updated === releaseDate).map((guide) => guide.route);
  const requiredRoutes = new Set([...(coverage.pendingRoutes ?? []), ...currentReleaseRoutes]);
  const scoped = (provenance.guides ?? []).filter((guide) => requiredRoutes.has(guide.route));
  const pages = [];
  for (const guide of scoped) {
    const match = guide.route?.match(/^\/learn\/([^/]+)\/$/);
    if (!match) throw new Error(`Adversary content scope contains an invalid guide route: ${guide.route ?? "missing"}`);
    const filename = path.join(distDirectory, "learn", match[1], "index.html");
    const html = await fs.readFile(filename, "utf8");
    if (!html.includes(`sha256:${guide.contentSha256}`)) throw new Error(`Adversary content page is not bound to ${guide.route}'s provenance digest.`);
    pages.push({
      route: guide.route,
      published: guide.published,
      updated: guide.updated,
      risk: guide.risk,
      contentSha256: guide.contentSha256,
      sourceSetSha256: guide.sourceSetSha256,
      htmlSha256: sha256(html),
      reviewDecision: guide.review?.decision ?? "missing",
      sources: guide.sources,
      html,
    });
  }
  const included = new Set(pages.map((page) => page.route));
  for (const route of requiredRoutes) if (!included.has(route)) throw new Error(`Adversary content evidence is missing required route ${route}.`);
  return { schemaVersion: 1, generatedAt, releaseDate, scope: "current-release-and-pending-guides", pages };
}

export async function candidateCommercialPagesFromDist({ distDirectory = "dist", generatedAt = new Date().toISOString() } = {}) {
  const evidence = JSON.parse(await fs.readFile(path.join(distDirectory, "comparison-evidence.json"), "utf8"));
  const releaseDate = String(evidence.generatedAt ?? "").slice(0, 10);
  const scoped = (evidence.pages ?? []).filter((page) => releaseDate && page.updated === releaseDate);
  if ((evidence.pages ?? []).length && !scoped.length) throw new Error("Adversary commercial scope does not include any current-release page.");
  const pages = [];
  for (const page of scoped) {
    if (!/^\/compare(?:\/[a-z0-9-]+)*\/$/.test(page.route ?? "")) throw new Error(`Adversary commercial scope contains an invalid route: ${page.route ?? "missing"}`);
    const filename = path.join(distDirectory, ...page.route.split("/").filter(Boolean), "index.html");
    const html = await fs.readFile(filename, "utf8");
    if (!html.includes(`sha256:${page.contentSha256}`)) throw new Error(`Adversary commercial page is not bound to ${page.route}'s evidence digest.`);
    pages.push({
      route: page.route,
      published: page.published,
      updated: page.updated,
      contentSha256: page.contentSha256,
      sourceSetSha256: page.sourceSetSha256,
      htmlSha256: sha256(html),
      intent: page.intent,
      claims: page.claims,
      sources: page.sources,
      html,
    });
  }
  return { schemaVersion: 1, generatedAt, releaseDate, scope: "current-release-commercial-pages", pages };
}

export async function runAdversary({
  reportDirectory = "reports/seo",
  outputFile = "reports/seo/adversary.md",
  jsonFile = "reports/seo/adversary.json",
  apiKey = process.env.OPENROUTER_API_KEY,
  model = process.env.SEO_ADVERSARY_MODEL || "openai/gpt-4.1",
  distDirectory = "dist",
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
} = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for the adversarial release gate.");
  const evidenceFiles = ["report.json", "provenance.json", "intent.json", "commercial-governance.json", "commercial.json", "exam-rules.json", "sources.json", "accessibility.json", "app-boundary.json", "crawl.json", "crawl-live.json", "live-release.json", "live-release-crawl.json"];
  const evidence = Object.fromEntries(await Promise.all(evidenceFiles.map(async (name) => [name, await readJsonIfPresent(path.join(reportDirectory, name))])));
  const guideCoverage = guideCoverageFromEvidence(evidence);
  const generatedAt = now();
  const candidateGuidePages = await candidateGuidePagesFromDist({ coverage: guideCoverage, distDirectory, generatedAt });
  const candidateCommercialPages = await candidateCommercialPagesFromDist({ distDirectory, generatedAt });
  await fs.mkdir(reportDirectory, { recursive: true });
  await fs.writeFile(path.join(reportDirectory, "candidate-guide-pages.json"), JSON.stringify(candidateGuidePages, null, 2) + "\n");
  await fs.writeFile(path.join(reportDirectory, "candidate-commercial-pages.json"), JSON.stringify(candidateCommercialPages, null, 2) + "\n");
  evidence["candidate-guide-pages.json"] = candidateGuidePages;
  evidence["candidate-commercial-pages.json"] = candidateCommercialPages;
  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "HTTP-Referer": "https://www.pulsern.app", "X-Title": "PulseRN SEO Guardian" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: "json_schema", json_schema: { name: "pulsern_adversarial_review", strict: true, schema: REVIEW_SCHEMA } },
      messages: [
        {
          role: "system",
          content: "The candidate-guide-pages evidence contains the exact HTML, content digest, source-set digest, sources, and review state for every guide revised in the current content release plus every pending guide. The candidate-commercial-pages evidence contains the exact rendered HTML, intent, claims, sources, and digest binding for every comparison page in the current commercial release. Substantively review both packets claim by claim and inspect the actual hierarchy, disclosures, recommendation language, and calls to action. Do not use a pending RN-review blocker as a substitute for identifying inaccurate, overbroad, unsupported, cannibalizing, inaccessible, or misleading content.",
        },
        {
        role: "user",
        content: `Act as PulseRN's independent adversarial release reviewer for traditional search, LLM/answer-engine retrieval, and agentic search. Challenge every supplied audit. Fail closed for missing evidence, unverified RN attribution, unapproved clinical content, unsupported clinical claims, stale or irrelevant sources, intent cannibalization, inaccessible pages, crawler barriers, misleading claims, or tests that can be bypassed. Specifically challenge the public-marketing/private-app boundary: the public homepage must remain indexable and useful, /app/ must remain noindex and excluded from public discovery maps, the PWA service worker must not control public pages, authentication and billing return paths must remain inside /app/, and the one-time session migration must not discard an OAuth or password-recovery callback. Treat deployment as evidence, not an assumption: on a pull request, require the candidate artifact to pass and explicitly remain not-yet-live; on main, require the live-release report to bind production to the exact commit, match every candidate sitemap route, pass all crawler identities, preserve canonical/H1/indexability, and expose no broken internal route map. A successful build or Vercel status alone is not proof that the release is live and working. Independently challenge every commercial comparison for undisclosed self-interest, affiliate-style ranking, unsupported "best" language, false cheapest claims, stale or promotional pricing represented as permanent, missing provider-owned evidence, feature absence inferred from silence, unfair apples-to-oranges package comparisons, competitor trademark confusion, outcome promises, and PulseRN product claims that are not supported by the candidate artifact. A comparison may clearly recommend PulseRN and should present documented PulseRN advantages prominently; factual fairness does not require symmetrical praise or a neutral conclusion. Require any competitor-specific exception to be concise, directly supported, and framed around a genuine learner need. Every comparison must display a verification date and correction method. For NCLEX registration and results content, challenge every ATT, eligibility, scheduling, fee, refund, accommodations, Quick Results, CPR, international-testing, and retake statement against the official-rule drift report; fail on jurisdictional overgeneralization, stale prices, missing effective dates, unofficial-result confusion, or advice that could cause a candidate to forfeit an appointment or fee. Distinguish supplied evidence from inference. Never invent or approve clinical facts, credentials, reviews, sources, competitor facts, exam rules, deployment state, or ranking guarantees. A PASS requires zero release blockers across every evidence file. The deterministic guide accounting below is authoritative: copy it exactly into guideCoverage. Describe review blockers as affecting only pending routes. Never say all guides, every guide, no guide, or no clinical content is approved unless the accounting actually shows zero approved guides. Return JSON matching the supplied schema only.\n\nDeterministic guide accounting:\n${JSON.stringify(guideCoverage)}\n\nEvidence bundle:\n${JSON.stringify(evidence)}`,
        }],
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const review = parseReview(extractOutputText(await response.json()), guideCoverage);
  const result = { schemaVersion: 1, model, generatedAt, ...review };
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(jsonFile, JSON.stringify(result, null, 2) + "\n");
  await fs.writeFile(outputFile, reviewMarkdown(result));
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runAdversary();
  console.log(JSON.stringify({ verdict: result.verdict, blockers: result.releaseBlockers.length, output: "reports/seo/adversary.json" }, null, 2));
  process.exitCode = result.verdict === "PASS" ? 0 : 1;
}
