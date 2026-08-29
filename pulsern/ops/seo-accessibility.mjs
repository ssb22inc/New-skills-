#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createStaticServer } from "./seo-crawl.mjs";

const devices = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

const sitemapRoutes = (xml) => [...xml.matchAll(/<loc>https:\/\/www\.pulsern\.app([^<]*)<\/loc>/gi)].map((match) => match[1] || "/");
const markdown = (report) => `# PulseRN accessibility audit\n\nGenerated: ${report.generatedAt}\n\nVerdict: **${report.verdict}**\n\nPages: ${report.pages} · Viewports: ${report.viewports} · Blocking violations: ${report.blockers}\n\n${report.findings.length ? report.findings.map((item) => `- **${item.impact ?? "unknown"} · ${item.id}** ${item.route} (${item.viewport}): ${item.help} — ${item.nodes} node(s)`).join("\n") : "No findings."}\n`;

export async function runAccessibility({ directory = "dist", outputFile = "reports/seo/accessibility.json", browserType = chromium } = {}) {
  const local = await createStaticServer(directory);
  const sitemap = await (await fetch(`${local.base}/sitemap.xml`)).text();
  const routes = sitemapRoutes(sitemap);
  const findings = [];
  const browser = await browserType.launch({ headless: true });
  try {
    for (const device of devices) {
      const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch, reducedMotion: "reduce" });
      const page = await context.newPage();
      for (const route of routes) {
        const response = await page.goto(`${local.base}${route}`, { waitUntil: "networkidle" });
        if (!response?.ok()) {
          findings.push({ impact: "critical", id: "http-status", help: `Page returned ${response?.status() ?? "no response"}`, route, viewport: device.name, nodes: 1 });
          continue;
        }
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
        for (const violation of result.violations) findings.push({ impact: violation.impact, id: violation.id, help: violation.help, helpUrl: violation.helpUrl, route, viewport: device.name, nodes: violation.nodes.length });
        const structure = await page.evaluate(() => ({ lang: document.documentElement.lang, mains: document.querySelectorAll("main").length, h1s: document.querySelectorAll("h1").length, title: document.title.trim() }));
        if (structure.lang !== "en-US") findings.push({ impact: "serious", id: "html-lang", help: "Document language must be en-US.", route, viewport: device.name, nodes: 1 });
        if (structure.mains !== 1 || structure.h1s !== 1 || !structure.title) findings.push({ impact: "serious", id: "document-structure", help: "Each page needs one main, one H1, and a title.", route, viewport: device.name, nodes: 1 });
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await local.close();
  }
  const blockers = findings.filter((item) => ["critical", "serious"].includes(item.impact)).length;
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), verdict: blockers ? "FAIL" : "PASS", pages: routes.length, viewports: devices.length, blockers, findings };
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(outputFile.replace(/\.json$/, ".md"), markdown(report));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runAccessibility();
  console.log(JSON.stringify({ verdict: report.verdict, pages: report.pages, viewports: report.viewports, blockers: report.blockers }, null, 2));
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}
