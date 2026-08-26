#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ALLOWED_FINAL_HOSTS = new Set(["www.nclex.com", "nclex.com", "www.cdc.gov", "cdc.gov", "home.ecri.org", "medlineplus.gov", "www.medlineplus.gov", "www.fda.gov", "fda.gov", "doi.org", "journals.sagepub.com", "pmc.ncbi.nlm.nih.gov"]);

async function fetchSource(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, { headers: { "user-agent": "Mozilla/5.0 PulseRNSourceAudit/1.0", accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" }, redirect: "follow", signal: controller.signal });
  } finally { clearTimeout(timer); }
}

const markdown = (report) => `# PulseRN authoritative-source reachability audit\n\nGenerated: ${report.generatedAt}\n\nVerdict: **${report.verdict}**\n\nSources: ${report.sources.length} · Findings: ${report.findings.length}\n\n${report.findings.length ? report.findings.map((item) => `- **${item.code}** ${item.sourceId}: ${item.message}`).join("\n") : "No findings."}\n`;

export async function runSourceCheck({ provenanceFile = "dist/content-provenance.json", outputFile = "reports/seo/sources.json" } = {}) {
  const provenance = JSON.parse(await fs.readFile(provenanceFile, "utf8"));
  const unique = new Map();
  for (const guide of provenance.guides ?? []) for (const source of guide.sources ?? []) unique.set(source.id, source);
  const findings = [];
  const results = [];
  for (const source of unique.values()) {
    try {
      const response = await fetchSource(source.url);
      const finalUrl = response.url;
      const finalHost = new URL(finalUrl).hostname.toLowerCase();
      const contentType = response.headers.get("content-type") ?? "";
      results.push({ id: source.id, requestedUrl: source.url, finalUrl, status: response.status, contentType, accessedAt: new Date().toISOString() });
      if (!response.ok) findings.push({ severity: "high", code: "SOURCE_HTTP", sourceId: source.id, message: `Authoritative source returned ${response.status}.` });
      if (!ALLOWED_FINAL_HOSTS.has(finalHost)) findings.push({ severity: "critical", code: "SOURCE_REDIRECT_DOMAIN", sourceId: source.id, message: `Source redirected to unapproved host ${finalHost}.` });
      if (!/(text\/html|application\/pdf)/i.test(contentType)) findings.push({ severity: "high", code: "SOURCE_CONTENT_TYPE", sourceId: source.id, message: `Unexpected content type ${contentType || "missing"}.` });
    } catch (error) {
      findings.push({ severity: "high", code: "SOURCE_FETCH", sourceId: source.id, message: error.message });
      results.push({ id: source.id, requestedUrl: source.url, error: error.message });
    }
  }
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), verdict: findings.some((item) => ["critical", "high"].includes(item.severity)) ? "FAIL" : "PASS", sources: results, findings };
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(outputFile.replace(/\.json$/, ".md"), markdown(report));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runSourceCheck();
  console.log(JSON.stringify({ verdict: report.verdict, sources: report.sources.length, findings: report.findings.length }, null, 2));
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}
