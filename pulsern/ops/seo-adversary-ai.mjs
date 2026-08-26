#!/usr/bin/env node

/* Required independent second-opinion reviewer. The model receives the
   deterministic evidence bundle and must return a machine-readable verdict.
   Unknown, malformed, empty, or FAIL results are release failures. */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "strongestObjections", "releaseBlockers", "nonBlockingExperiments"],
  properties: {
    verdict: { type: "string", enum: ["PASS", "FAIL"] },
    summary: { type: "string", minLength: 1 },
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

export function parseReview(text) {
  if (!text?.trim()) throw new Error("Adversarial reviewer returned no text.");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let review;
  try { review = JSON.parse(cleaned); } catch { throw new Error("Adversarial reviewer returned malformed JSON."); }
  if (!review || typeof review !== "object" || !["PASS", "FAIL"].includes(review.verdict)) throw new Error("Adversarial verdict must be PASS or FAIL.");
  if (typeof review.summary !== "string" || !review.summary.trim()) throw new Error("Adversarial summary is required.");
  for (const key of ["strongestObjections", "releaseBlockers", "nonBlockingExperiments"]) {
    if (!Array.isArray(review[key])) throw new Error(`Adversarial ${key} must be an array.`);
  }
  if (review.verdict === "PASS" && review.releaseBlockers.length) throw new Error("A PASS verdict cannot contain release blockers.");
  if (review.verdict === "FAIL" && !review.releaseBlockers.length) throw new Error("A FAIL verdict must contain at least one release blocker.");
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
  return `# PulseRN model-based adversarial review\n\nModel: ${result.model}\nGenerated: ${result.generatedAt}\n\n## Verdict\n\n**${result.verdict}** — ${result.summary}\n\n## Strongest objections\n\n${objections}\n\n## Release blockers\n\n${blockers}\n\n## Non-blocking experiments\n\n${experiments}\n`;
}

async function readJsonIfPresent(filename) {
  try { return JSON.parse(await fs.readFile(filename, "utf8")); } catch (error) {
    if (error?.code === "ENOENT") return { missing: true, file: filename };
    throw error;
  }
}

export async function runAdversary({
  reportDirectory = "reports/seo",
  outputFile = "reports/seo/adversary.md",
  jsonFile = "reports/seo/adversary.json",
  apiKey = process.env.OPENROUTER_API_KEY,
  model = process.env.SEO_ADVERSARY_MODEL || "openai/gpt-4.1",
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
} = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for the adversarial release gate.");
  const evidenceFiles = ["report.json", "provenance.json", "intent.json", "sources.json", "accessibility.json", "crawl.json", "crawl-live.json"];
  const evidence = Object.fromEntries(await Promise.all(evidenceFiles.map(async (name) => [name, await readJsonIfPresent(path.join(reportDirectory, name))])));
  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "HTTP-Referer": "https://www.pulsern.app", "X-Title": "PulseRN SEO Guardian" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: "json_schema", json_schema: { name: "pulsern_adversarial_review", strict: true, schema: REVIEW_SCHEMA } },
      messages: [{
        role: "user",
        content: `Act as PulseRN's independent adversarial release reviewer for traditional search, LLM/answer-engine retrieval, and agentic search. Challenge every supplied audit. Fail closed for missing evidence, unverified RN attribution, unapproved clinical content, unsupported clinical claims, stale or irrelevant sources, intent cannibalization, inaccessible pages, crawler barriers, misleading claims, or tests that can be bypassed. Distinguish supplied evidence from inference. Never invent or approve clinical facts, credentials, reviews, sources, or ranking guarantees. A PASS requires zero release blockers across every evidence file. Return JSON matching the supplied schema only.\n\nEvidence bundle:\n${JSON.stringify(evidence)}`,
      }],
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const review = parseReview(extractOutputText(await response.json()));
  const result = { schemaVersion: 1, model, generatedAt: now(), ...review };
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
