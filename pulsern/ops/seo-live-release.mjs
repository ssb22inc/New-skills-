#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runCrawl } from "./seo-crawl.mjs";

const SITE = "https://www.pulsern.app";
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sitemapUrls = (xml) => [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => new URL(match[1].trim()).pathname);
const sorted = (values) => [...new Set(values)].sort();

async function writeReport(report, outputFile) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
  const details = report.findings.length ? report.findings.map((item) => `- **${item.code}:** ${item.message}`).join("\n") : "No findings.";
  await fs.writeFile(outputFile.replace(/\.json$/, ".md"), `# PulseRN live-release verification\n\nGenerated: ${report.generatedAt}\n\nVerdict: **${report.verdict}**\n\nExpected live: ${report.expectedLive}\n\nStatus: ${report.status}\n\n${details}\n`);
  return report;
}

export async function runLiveRelease({
  directory = "dist",
  outputFile = "reports/seo/live-release.json",
  expectedCommitSha = process.env.GITHUB_SHA ?? null,
  expectedLive = process.env.GITHUB_REF === "refs/heads/main" && Boolean(process.env.GITHUB_SHA),
  fetchImpl = fetch,
  runCrawlImpl = runCrawl,
  maxAttempts = 24,
  intervalMs = 10000,
} = {}) {
  const candidateSitemap = await fs.readFile(path.join(directory, "sitemap.xml"), "utf8");
  const candidateRoutes = sorted(sitemapUrls(candidateSitemap));
  const base = { schemaVersion: 1, generatedAt: new Date().toISOString(), expectedLive, expectedCommitSha, candidateRoutes };
  if (!expectedLive) {
    return writeReport({ ...base, verdict: "PASS", status: "candidate-artifact-only; exact production deployment is required by the post-merge main workflow", deployedCommitSha: null, findings: [] }, outputFile);
  }

  const findings = [];
  let deployed = null;
  let productionRoutes = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const releaseResponse = await fetchImpl(`${SITE}/release.json?audit=${attempt}`, { headers: { "cache-control": "no-cache", "user-agent": "PulseRNLiveReleaseAudit/1.0" }, redirect: "follow" });
      if (releaseResponse.ok) deployed = await releaseResponse.json();
      if (releaseResponse.ok && deployed?.commitSha === expectedCommitSha) {
        const sitemapResponse = await fetchImpl(`${SITE}/sitemap.xml?audit=${attempt}`, { headers: { "cache-control": "no-cache", "user-agent": "PulseRNLiveReleaseAudit/1.0" }, redirect: "follow" });
        if (sitemapResponse.ok) productionRoutes = sorted(sitemapUrls(await sitemapResponse.text()));
        if (JSON.stringify(productionRoutes) === JSON.stringify(candidateRoutes)) break;
      }
    } catch (error) {
      deployed = { error: error.message };
    }
    if (attempt < maxAttempts) await wait(intervalMs);
  }
  if (deployed?.commitSha !== expectedCommitSha) findings.push({ severity: "critical", code: "LIVE_RELEASE_COMMIT", message: `Production release manifest is ${deployed?.commitSha ?? "missing"}; expected ${expectedCommitSha}.` });
  if (JSON.stringify(productionRoutes) !== JSON.stringify(candidateRoutes)) findings.push({ severity: "critical", code: "LIVE_RELEASE_ROUTES", message: `Production sitemap does not exactly match the ${candidateRoutes.length}-route candidate sitemap.` });

  let crawl = null;
  if (!findings.length) {
    crawl = await runCrawlImpl({ baseUrl: SITE, outputFile: outputFile.replace(/\.json$/, "-crawl.json") });
    if (crawl.verdict !== "PASS") findings.push({ severity: "critical", code: "LIVE_RELEASE_CRAWL", message: `Production crawl failed with ${crawl.findings.length} finding(s).` });
  }
  return writeReport({ ...base, verdict: findings.length ? "FAIL" : "PASS", status: findings.length ? "production deployment not verified" : "exact commit and all public routes verified live", deployedCommitSha: deployed?.commitSha ?? null, productionRoutes, crawl: crawl ? { verdict: crawl.verdict, urls: crawl.urls, userAgents: crawl.userAgents, findings: crawl.findings.length } : null, findings }, outputFile);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runLiveRelease();
  console.log(JSON.stringify({ verdict: report.verdict, expectedLive: report.expectedLive, status: report.status, routes: report.candidateRoutes.length }, null, 2));
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}
