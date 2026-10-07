#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const SITE = "https://www.pulsern.app";
const USER_AGENTS = {
  browser: "Mozilla/5.0 PulseRNSearchAudit/1.0",
  google: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  openaiSearch: "OAI-SearchBot/1.0; +https://openai.com/searchbot",
  gpt: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
  claude: "ClaudeBot/1.0; +claudebot@anthropic.com",
  perplexity: "PerplexityBot/1.0; +https://perplexity.ai/perplexitybot",
};

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};
const attr = (html, tag, name) => html.match(tag)?.[0]?.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] ?? "";
const routeFromUrl = (url) => {
  const pathname = new URL(url).pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
};

function sitemapUrls(xml) { return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1].trim()); }
function links(html) { return [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)(?:#[^"']*)?["']/gi)].map((match) => match[1]); }

function robotsGroups(text) {
  const groups = [];
  let agents = [];
  let rules = [];
  const flush = () => { if (agents.length) groups.push({ agents, rules }); agents = []; rules = []; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (field.toLowerCase() === "user-agent") {
      if (rules.length) flush();
      agents.push(value.toLowerCase());
    } else if (["allow", "disallow"].includes(field.toLowerCase()) && agents.length) rules.push({ type: field.toLowerCase(), path: value });
  }
  flush();
  return groups;
}

export function robotsAllows(text, userAgent, pathname) {
  const ua = userAgent.toLowerCase();
  const groups = robotsGroups(text);
  const matches = groups.filter((group) => group.agents.some((agent) => agent === "*" || ua.includes(agent)));
  const specific = matches.filter((group) => group.agents.some((agent) => agent !== "*" && ua.includes(agent)));
  const rules = (specific.length ? specific : matches).flatMap((group) => group.rules).filter((rule) => rule.path && pathname.startsWith(rule.path.replace(/\$$/, "")));
  rules.sort((a, b) => b.path.length - a.path.length || (a.type === "allow" ? -1 : 1));
  return rules[0]?.type !== "disallow";
}

export async function createStaticServer(directory) {
  const root = path.resolve(directory);
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const relative = pathname === "/" ? "index.html" : `${pathname.replace(/^\//, "")}${pathname.endsWith("/") ? "index.html" : ""}`;
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(`${root}${path.sep}`) && filename !== path.join(root, "index.html")) throw new Error("invalid path");
      const body = await fs.readFile(filename);
      response.writeHead(200, { "content-type": mime[path.extname(filename)] ?? "application/octet-stream", "x-content-type-options": "nosniff" });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function request(url, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

const markdown = (report) => `# PulseRN ${report.mode} agent-crawl audit\n\nGenerated: ${report.generatedAt}\n\nVerdict: **${report.verdict}**\n\nURLs: ${report.urls} · User agents: ${report.userAgents} · Findings: ${report.findings.length}\n\n${report.findings.length ? report.findings.map((item) => `- **${item.code}** ${item.route}: ${item.message}`).join("\n") : "No findings."}\n`;

export async function runCrawl({ directory = "dist", baseUrl, outputFile = "reports/seo/crawl.json" } = {}) {
  const local = baseUrl ? null : await createStaticServer(directory);
  const base = (baseUrl ?? local.base).replace(/\/$/, "");
  const mode = baseUrl ? "live" : "local";
  const findings = [];
  try {
    const sitemapResponse = await request(`${base}/sitemap.xml`, USER_AGENTS.browser);
    const robotsResponse = await request(`${base}/robots.txt`, USER_AGENTS.browser);
    const llmsResponse = await request(`${base}/llms.txt`, USER_AGENTS.browser);
    if (!sitemapResponse.ok || !robotsResponse.ok || !llmsResponse.ok) throw new Error("sitemap.xml, robots.txt, and llms.txt must all return 2xx.");
    const sitemap = await sitemapResponse.text();
    const robots = await robotsResponse.text();
    const llms = await llmsResponse.text();
    const canonicalUrls = sitemapUrls(sitemap);
    if (!canonicalUrls.length) findings.push({ severity: "critical", code: "EMPTY_SITEMAP", route: "/sitemap.xml", message: "Sitemap contains no URLs." });
    const routeSet = new Set(canonicalUrls.map(routeFromUrl));
    for (const canonicalUrl of canonicalUrls) {
      const route = routeFromUrl(canonicalUrl);
      for (const [agent, userAgent] of Object.entries(USER_AGENTS)) {
        if (!robotsAllows(robots, userAgent, route)) findings.push({ severity: "critical", code: "ROBOTS_AGENT_BLOCK", route, message: `${agent} is blocked by robots.txt.` });
        let response;
        try { response = await request(`${base}${route}`, userAgent); } catch (error) {
          findings.push({ severity: "critical", code: "FETCH_ERROR", route, message: `${agent}: ${error.message}` });
          continue;
        }
        const html = await response.text();
        if (response.status !== 200) findings.push({ severity: "critical", code: "HTTP_STATUS", route, message: `${agent} received ${response.status}.` });
        if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) findings.push({ severity: "high", code: "CONTENT_TYPE", route, message: `${agent} did not receive HTML.` });
        const xRobots = response.headers.get("x-robots-tag") ?? "";
        if (/noindex|none/i.test(xRobots) || /<meta\b[^>]*(?:name=["']robots["'][^>]*content=["'][^"']*(?:noindex|none)|content=["'][^"']*(?:noindex|none)[^>]*name=["']robots["'])/i.test(html)) findings.push({ severity: "critical", code: "NOINDEX", route, message: `${agent} received a noindex directive.` });
        if (!/<main\b/i.test(html) || !/<h1\b/i.test(html)) findings.push({ severity: "high", code: "EMPTY_MAIN", route, message: `${agent} cannot retrieve a semantic main/H1.` });
        const canonical = attr(html, /<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i, "href");
        if (canonical !== `${SITE}${route}`) findings.push({ severity: "high", code: "CANONICAL_DRIFT", route, message: `${agent} received canonical ${canonical || "missing"}.` });
        if (/sign in to (?:continue|view)|create an account to (?:continue|read)|enable javascript to continue/i.test(html)) findings.push({ severity: "critical", code: "ACCESS_WALL", route, message: `${agent} encountered an authentication or JavaScript wall.` });
        if (agent === "browser") {
          for (const href of links(html)) {
            let linked;
            try { linked = new URL(href, SITE); } catch { continue; }
            if (linked.origin === SITE && !linked.search && linked.pathname.endsWith("/") && !routeSet.has(linked.pathname) && !["/app/", "/owner/", "/review/"].includes(linked.pathname)) findings.push({ severity: "high", code: "BROKEN_INTERNAL_MAP", route, message: `Internal link ${linked.pathname} is absent from the sitemap.` });
          }
        }
      }
    }
    const llmsUrls = new Set([...llms.matchAll(/https:\/\/www\.pulsern\.app\/[^\s)\]]*/g)].map((match) => routeFromUrl(match[0])));
    for (const route of routeSet) if (!llmsUrls.has(route)) findings.push({ severity: "high", code: "LLMS_URL_MISSING", route, message: "Sitemap route is absent from llms.txt." });
    const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), mode, baseUrl: baseUrl ?? "local-dist-server", verdict: findings.some((item) => ["critical", "high"].includes(item.severity)) ? "FAIL" : "PASS", urls: canonicalUrls.length, userAgents: Object.keys(USER_AGENTS).length, findings };
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
    await fs.writeFile(outputFile.replace(/\.json$/, ".md"), markdown(report));
    return report;
  } finally { await local?.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  const report = await runCrawl({ directory: value("--directory") ?? "dist", baseUrl: value("--base"), outputFile: value("--output") ?? "reports/seo/crawl.json" });
  console.log(JSON.stringify({ verdict: report.verdict, mode: report.mode, urls: report.urls, findings: report.findings.length }, null, 2));
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}
