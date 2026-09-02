#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OFFICIAL_HOSTS = new Set(["www.nclex.com", "nclex.com", "www.pearsonvue.com"]);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const visibleText = (html = "") => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;|&#34;/gi, '"').replace(/\s+/g, " ").trim();
const normalize = (value) => String(value).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");

async function fetchOfficial(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 PulseRNExamRulesAudit/1.0", accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
        signal: controller.signal,
      });
      if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
        await response.body?.cancel();
        await wait(attempt * 1500);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) throw error;
      await wait(attempt * 1500);
    } finally { clearTimeout(timer); }
  }
  throw lastError ?? new Error("Official exam-rule source request failed.");
}

const markdown = (report) => `# PulseRN official exam-rule drift audit\n\nGenerated: ${report.generatedAt}\n\nVerdict: **${report.verdict}**\n\nSources: ${report.sources.length} · Findings: ${report.findings.length}\n\n${report.findings.length ? report.findings.map((item) => `- **${item.code}** ${item.sourceId}: ${item.message}`).join("\n") : "No findings."}\n`;

export async function runExamRulesCheck({ provenanceFile = "dist/content-provenance.json", outputFile = "reports/seo/exam-rules.json", fetchImpl = fetchOfficial } = {}) {
  const provenance = JSON.parse(await fs.readFile(provenanceFile, "utf8"));
  const unique = new Map();
  for (const guide of provenance.guides ?? []) {
    for (const source of guide.sources ?? []) {
      if (Array.isArray(source.expectedMarkers) && source.expectedMarkers.length) unique.set(source.id, source);
    }
  }
  const findings = [];
  const results = [];
  for (const source of unique.values()) {
    const requestedHost = new URL(source.url).hostname.toLowerCase();
    if (!OFFICIAL_HOSTS.has(requestedHost)) {
      findings.push({ severity: "critical", code: "EXAM_RULE_SOURCE_HOST", sourceId: source.id, message: `Unapproved official-rule host ${requestedHost}.` });
      continue;
    }
    try {
      const response = await fetchImpl(source.url);
      const finalUrl = response.url || source.url;
      const finalHost = new URL(finalUrl).hostname.toLowerCase();
      const contentType = response.headers.get("content-type") ?? "";
      const html = await response.text();
      const text = normalize(visibleText(html));
      results.push({ id: source.id, requestedUrl: source.url, finalUrl, status: response.status, contentType, bytes: Buffer.byteLength(html), checkedAt: new Date().toISOString(), expectedMarkers: source.expectedMarkers });
      if (!response.ok) findings.push({ severity: "high", code: "EXAM_RULE_SOURCE_HTTP", sourceId: source.id, message: `Official source returned ${response.status}.` });
      if (!OFFICIAL_HOSTS.has(finalHost)) findings.push({ severity: "critical", code: "EXAM_RULE_SOURCE_REDIRECT", sourceId: source.id, message: `Official source redirected to unapproved host ${finalHost}.` });
      if (!/text\/html/i.test(contentType)) findings.push({ severity: "high", code: "EXAM_RULE_SOURCE_TYPE", sourceId: source.id, message: `Unexpected content type ${contentType || "missing"}.` });
      const missing = source.expectedMarkers.filter((marker) => !text.includes(normalize(marker)));
      if (missing.length) findings.push({ severity: "high", code: "EXAM_RULE_SOURCE_DRIFT", sourceId: source.id, message: `Official page no longer exposes expected rule markers: ${missing.join(", ")}. Reverify affected guides before release.` });
    } catch (error) {
      results.push({ id: source.id, requestedUrl: source.url, error: error.message });
      findings.push({ severity: "high", code: "EXAM_RULE_SOURCE_FETCH", sourceId: source.id, message: error.message });
    }
    await wait(300);
  }
  if (!unique.size) findings.push({ severity: "critical", code: "EXAM_RULE_SOURCE_COVERAGE", sourceId: "content-provenance", message: "No marker-bound official exam-rule sources were found." });
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), verdict: findings.some((item) => ["critical", "high"].includes(item.severity)) ? "FAIL" : "PASS", sources: results, findings };
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(outputFile.replace(/\.json$/, ".md"), markdown(report));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runExamRulesCheck();
  console.log(JSON.stringify({ verdict: report.verdict, sources: report.sources.length, findings: report.findings.length }, null, 2));
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}
