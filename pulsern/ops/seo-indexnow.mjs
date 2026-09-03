#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const SITE = "https://www.pulsern.app";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY = "58c8516422d19b984e9c356564b4b2ec9cada9abf670b0594849c9c08d8052fe";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sitemapUrls = (xml) => [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1].trim());

async function writeReport(report, outputFile) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
  const details = report.findings.length
    ? report.findings.map((item) => `- **${item.code}:** ${item.message}`).join("\n")
    : "No findings.";
  await fs.writeFile(outputFile.replace(/\.json$/, ".md"), `# PulseRN IndexNow submission\n\nGenerated: ${report.generatedAt}\n\nVerdict: **${report.verdict}**\n\nMode: ${report.mode}\n\nURLs: ${report.urls}\n\nHTTP status: ${report.httpStatus ?? "not submitted"}\n\n${details}\n`);
  return report;
}

export async function runIndexNow({
  directory = "dist",
  outputFile = "reports/seo/indexnow.json",
  liveReportFile = "reports/seo/live-release.json",
  submit = process.env.GITHUB_EVENT_NAME === "push" && process.env.GITHUB_REF === "refs/heads/main" && Boolean(process.env.GITHUB_SHA),
  expectedCommitSha = process.env.GITHUB_SHA ?? null,
  fetchImpl = fetch,
  maxAttempts = 3,
  intervalMs = 1000,
} = {}) {
  const generatedAt = new Date().toISOString();
  const findings = [];
  const keyFile = path.join(directory, `${INDEXNOW_KEY}.txt`);
  let keyBody = "";
  let urls = [];

  try { keyBody = (await fs.readFile(keyFile, "utf8")).trim(); }
  catch { findings.push({ severity: "critical", code: "INDEXNOW_KEY_FILE", message: "The built site is missing its root IndexNow ownership file." }); }
  if (keyBody && keyBody !== INDEXNOW_KEY) findings.push({ severity: "critical", code: "INDEXNOW_KEY_CONTENT", message: "The IndexNow ownership file does not contain the configured key." });

  try { urls = [...new Set(sitemapUrls(await fs.readFile(path.join(directory, "sitemap.xml"), "utf8")))].sort(); }
  catch { findings.push({ severity: "critical", code: "INDEXNOW_SITEMAP", message: "The built sitemap could not be read." }); }
  if (!urls.length || urls.length > 10000) findings.push({ severity: "critical", code: "INDEXNOW_URL_COUNT", message: `The IndexNow batch must contain 1–10,000 URLs; found ${urls.length}.` });
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (url.origin !== SITE || url.pathname.startsWith("/app/") || url.pathname.startsWith("/owner/") || url.pathname.startsWith("/review/")) throw new Error("outside the public index");
    } catch {
      findings.push({ severity: "critical", code: "INDEXNOW_URL_SCOPE", message: `IndexNow URL is invalid or outside the public PulseRN index: ${value}` });
    }
  }

  const payload = {
    host: new URL(SITE).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
  if (!submit || findings.length) return writeReport({ schemaVersion: 1, generatedAt, mode: "candidate-validation", verdict: findings.length ? "FAIL" : "PASS", submitted: false, expectedCommitSha, urls: urls.length, payload, httpStatus: null, findings }, outputFile);

  let liveReport;
  try { liveReport = JSON.parse(await fs.readFile(liveReportFile, "utf8")); }
  catch { findings.push({ severity: "critical", code: "INDEXNOW_LIVE_EVIDENCE", message: "Exact production-release evidence is missing." }); }
  if (liveReport && (liveReport.verdict !== "PASS" || liveReport.deployedCommitSha !== expectedCommitSha || liveReport.expectedLive !== true)) findings.push({ severity: "critical", code: "INDEXNOW_LIVE_COMMIT", message: "IndexNow submission is blocked until production is verified at the exact main commit." });
  if (findings.length) return writeReport({ schemaVersion: 1, generatedAt, mode: "production-submission", verdict: "FAIL", submitted: false, expectedCommitSha, urls: urls.length, payload, httpStatus: null, findings }, outputFile);

  let httpStatus = null;
  let responseBody = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8", "user-agent": "PulseRNIndexNow/1.0" },
        body: JSON.stringify(payload),
      });
      httpStatus = response.status;
      responseBody = (await response.text()).slice(0, 500);
      if ([200, 202].includes(httpStatus)) break;
    } catch (error) { responseBody = error.message; }
    if (attempt < maxAttempts) await wait(intervalMs * attempt);
  }
  if (![200, 202].includes(httpStatus)) findings.push({ severity: "critical", code: "INDEXNOW_SUBMISSION", message: `IndexNow rejected or did not receive the production batch (HTTP ${httpStatus ?? "network error"}).` });
  return writeReport({ schemaVersion: 1, generatedAt, mode: "production-submission", verdict: findings.length ? "FAIL" : "PASS", submitted: !findings.length, expectedCommitSha, urls: urls.length, payload, httpStatus, responseBody, findings }, outputFile);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runIndexNow();
  console.log(JSON.stringify({ verdict: report.verdict, mode: report.mode, submitted: report.submitted, urls: report.urls, httpStatus: report.httpStatus }, null, 2));
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}
