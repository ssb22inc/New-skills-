#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PROVIDER_HOSTS = new Set(["nursing.uworld.com", "nurses.archerreview.com", "www.kaptest.com"]);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const visibleText = (html = "") => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
const normalize = (value) => String(value).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");

async function fetchProvider(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 PulseRNComparisonAudit/1.0", accept: "text/html,application/xhtml+xml" },
        redirect: "follow", signal: controller.signal,
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
  throw lastError ?? new Error("Comparison source request failed.");
}

const markdown = (report) => `# PulseRN commercial-source audit\n\nGenerated: ${report.generatedAt}\n\nVerdict: **${report.verdict}**\n\nSources: ${report.sources.length} · Findings: ${report.findings.length}\n\n${report.findings.length ? report.findings.map((item) => `- **${item.code}** ${item.sourceId}: ${item.message}`).join("\n") : "No findings."}\n`;

export async function runCommercialCheck({ evidenceFile = "dist/comparison-evidence.json", directory = "dist", outputFile = "reports/seo/commercial.json", fetchImpl = fetchProvider } = {}) {
  const evidence = JSON.parse(await fs.readFile(evidenceFile, "utf8"));
  const unique = new Map();
  for (const page of evidence.pages ?? []) for (const source of page.sources ?? []) unique.set(source.id, source);
  const findings = [];
  const results = [];
  for (const source of unique.values()) {
    const parsed = new URL(source.url);
    if (parsed.hostname.toLowerCase() === "www.pulsern.app") {
      const relative = parsed.pathname === "/" ? "index.html" : `${parsed.pathname.replace(/^\//, "")}index.html`;
      try {
        const html = await fs.readFile(path.join(directory, relative), "utf8");
        results.push({ id: source.id, url: source.url, mode: "candidate-artifact", bytes: Buffer.byteLength(html), accessedAt: new Date().toISOString() });
        if (!/<main\b/i.test(html) || !/<h1\b/i.test(html)) findings.push({ severity: "high", code: "COMMERCIAL_INTERNAL_SOURCE", sourceId: source.id, message: "PulseRN source page lacks a semantic main or H1 in the candidate artifact." });
      } catch (error) {
        results.push({ id: source.id, url: source.url, mode: "candidate-artifact", error: error.message });
        findings.push({ severity: "critical", code: "COMMERCIAL_INTERNAL_SOURCE", sourceId: source.id, message: `PulseRN source page is missing from the candidate artifact: ${error.message}` });
      }
      continue;
    }
    if (!PROVIDER_HOSTS.has(parsed.hostname.toLowerCase())) {
      findings.push({ severity: "critical", code: "COMMERCIAL_SOURCE_HOST", sourceId: source.id, message: `Unapproved provider host ${parsed.hostname}.` });
      continue;
    }
    try {
      const response = await fetchImpl(source.url);
      const finalUrl = response.url || source.url;
      const finalHost = new URL(finalUrl).hostname.toLowerCase();
      const contentType = response.headers.get("content-type") ?? "";
      const html = await response.text();
      const text = normalize(visibleText(html));
      results.push({ id: source.id, requestedUrl: source.url, finalUrl, status: response.status, contentType, bytes: Buffer.byteLength(html), accessedAt: new Date().toISOString() });
      if (!response.ok) findings.push({ severity: "high", code: "COMMERCIAL_SOURCE_HTTP", sourceId: source.id, message: `Provider source returned ${response.status}.` });
      if (!PROVIDER_HOSTS.has(finalHost)) findings.push({ severity: "critical", code: "COMMERCIAL_SOURCE_REDIRECT", sourceId: source.id, message: `Provider source redirected to unapproved host ${finalHost}.` });
      if (!/text\/html/i.test(contentType)) findings.push({ severity: "high", code: "COMMERCIAL_SOURCE_TYPE", sourceId: source.id, message: `Unexpected content type ${contentType || "missing"}.` });
      const missing = (source.expectedMarkers ?? []).filter((marker) => !text.includes(normalize(marker)));
      if (missing.length) findings.push({ severity: "high", code: "COMMERCIAL_SOURCE_DRIFT", sourceId: source.id, message: `Provider page no longer exposes expected evidence markers: ${missing.join(", ")}. Reverify the comparison before release.` });
    } catch (error) {
      results.push({ id: source.id, requestedUrl: source.url, error: error.message });
      findings.push({ severity: "high", code: "COMMERCIAL_SOURCE_FETCH", sourceId: source.id, message: error.message });
    }
    await wait(350);
  }
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), verdict: findings.some((item) => ["critical", "high"].includes(item.severity)) ? "FAIL" : "PASS", sources: results, findings };
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(outputFile.replace(/\.json$/, ".md"), markdown(report));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runCommercialCheck();
  console.log(JSON.stringify({ verdict: report.verdict, sources: report.sources.length, findings: report.findings.length }, null, 2));
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}
