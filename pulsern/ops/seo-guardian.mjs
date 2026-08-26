#!/usr/bin/env node

/* Deterministic adversarial release gate for traditional search, AI answer
   engines, and agentic retrieval. It audits the built artifact, never guesses
   at clinical quality, and fails closed on structural or trust regressions. */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SITE = "https://www.pulsern.app";
const REQUIRED = ["/", "/learn/", "/about/", "/pricing/", "/how-it-works/", "/methodology/", "/editorial-policy/"];
const TRUSTED = ["nclex.com", "www.nclex.com", "ncsbn.org", "www.ncsbn.org", "cdc.gov", "www.cdc.gov", "medlineplus.gov", "www.fda.gov", "fda.gov", "www.ismp.org", "ismp.org", "doi.org"];
const BLOCKING = new Set(["critical", "high"]);

const strip = (html = "") => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/\s+/g, " ").trim();
const values = (html, re) => [...html.matchAll(re)].map((match) => match[1]);
const first = (html, re) => strip(html.match(re)?.[1] ?? "");
const attr = (tag, name) => tag?.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] ?? "";

function jsonLd(html) {
  return values(html, /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi).flatMap((raw) => {
    try {
      const value = JSON.parse(raw);
      return value["@graph"] ?? [value];
    } catch {
      return [{ "@type": "InvalidJSONLD" }];
    }
  });
}

function finding(severity, code, route, message) { return { severity, code, route, message }; }

export function auditHtml(route, html) {
  const findings = [];
  const title = first(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const description = attr(html.match(/<meta\b[^>]*name=["']description["'][^>]*>/i)?.[0], "content");
  const canonical = attr(html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i)?.[0], "href");
  const h1s = values(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi);
  const nodes = jsonLd(html);
  const types = nodes.flatMap((node) => Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]).filter(Boolean);
  const anchors = values(html, /<a\b[^>]*href=["']([^"']+)["']/gi);
  const words = strip(html).split(/\s+/).filter(Boolean).length;
  const isGuide = route.startsWith("/learn/") && route !== "/learn/";
  const expectedCanonical = `${SITE}${route}`;

  if (!title) findings.push(finding("critical", "TITLE_MISSING", route, "Missing <title>."));
  else if (title.length < 25 || title.length > 68) findings.push(finding("medium", "TITLE_LENGTH", route, `Title is ${title.length} characters; target 25–68.`));
  if (!description) findings.push(finding("high", "DESCRIPTION_MISSING", route, "Missing meta description."));
  else if (description.length < 105 || description.length > 175) findings.push(finding("low", "DESCRIPTION_LENGTH", route, `Description is ${description.length} characters; target 105–175.`));
  if (canonical !== expectedCanonical) findings.push(finding("high", "CANONICAL", route, `Canonical must be ${expectedCanonical}.`));
  if (h1s.length !== 1) findings.push(finding("critical", "H1_COUNT", route, `Expected exactly one H1; found ${h1s.length}.`));
  if (!/<main\b/i.test(html)) findings.push(finding("high", "MAIN_LANDMARK", route, "Missing semantic <main> landmark."));
  if (anchors.filter((href) => href.startsWith("/") || href.startsWith(SITE)).length < 3) findings.push(finding("medium", "INTERNAL_LINKS", route, "Fewer than three internal links."));
  if (!types.length || types.includes("InvalidJSONLD")) findings.push(finding("high", "JSONLD", route, "Missing or invalid JSON-LD entity graph."));
  if (route === "/" && !types.some((type) => ["WebApplication", "SoftwareApplication", "Product"].includes(type))) findings.push(finding("critical", "PRODUCT_ENTITY", route, "Homepage lacks a product/application entity."));
  if (route === "/" && words < 450) findings.push(finding("high", "HOMEPAGE_DEPTH", route, `Static homepage contains ${words} visible words; require at least 450.`));

  if (isGuide) {
    const article = nodes.find((node) => ["Article", "BlogPosting", "MedicalWebPage"].includes(node["@type"]));
    const people = nodes.filter((node) => node["@type"] === "Person");
    const authorId = article?.author?.["@id"];
    const authorResolved = people.some((person) => person["@id"] === authorId && person.name && person.jobTitle);
    const trustedLinks = anchors.filter((href) => {
      try { return TRUSTED.includes(new URL(href).hostname.toLowerCase()); } catch { return false; }
    });
    if (!article) findings.push(finding("critical", "ARTICLE_ENTITY", route, "Guide lacks Article schema."));
    if (!authorResolved || !article?.reviewedBy) findings.push(finding("high", "HUMAN_ACCOUNTABILITY", route, "Guide needs a resolvable Person author and reviewer."));
    if (!article?.datePublished || !article?.dateModified || !/<time\b[^>]*datetime=/i.test(html)) findings.push(finding("high", "REVIEW_DATES", route, "Guide needs visible and machine-readable publication/review dates."));
    if (!trustedLinks.length || !Array.isArray(article?.citation) || !article.citation.length) findings.push(finding("high", "CITATIONS", route, "Guide needs visible trusted sources and structured citations."));
    if (words < 500) findings.push(finding("medium", "GUIDE_DEPTH", route, `Guide contains ${words} visible words; editorial review threshold is 500.`));
  }

  if (/\b(memorise|prioritisation|practise|practised|recognise|judgement|labelled|rigour|centre)\b/i.test(strip(html))) findings.push(finding("medium", "LOCALE", route, "U.K. spelling remains on a U.S.-focused NCLEX page."));
  if (/\b(guarantee(?:d|s)? pass|will pass the nclex|predicts? (?:your )?(?:pass|outcome))\b/i.test(strip(html))) findings.push(finding("critical", "OUTCOME_CLAIM", route, "Potential unsupported pass prediction or guarantee."));
  return { route, title, words, types, findings };
}

function routeFor(root, filename) {
  const relative = path.relative(root, filename).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  return `/${relative.replace(/index\.html$/, "")}`;
}

async function htmlFiles(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await htmlFiles(full));
    else if (entry.name.endsWith(".html")) output.push(full);
  }
  return output;
}

function robotsAllows(robots, route) {
  const publicAllow = robots.split(/\r?\n/).some((line) => line.trim().toLowerCase() === `allow: ${route}`.toLowerCase());
  return route === "/" ? /allow:\s*\/\$?/i.test(robots) : publicAllow;
}

function markdown(report) {
  const rows = report.findings.length ? report.findings.map((item) => `| ${item.severity} | ${item.code} | ${item.route} | ${item.message.replace(/\|/g, "\\|")} |`) : ["| — | — | — | No findings |"];
  return `# PulseRN adversarial search audit\n\nGenerated: ${report.generatedAt}\n\nVerdict: **${report.verdict}**\n\nPages: ${report.pages.length} · Blocking findings: ${report.blockers}\n\n| Severity | Check | Page | Finding |\n|---|---|---|---|\n${rows.join("\n")}\n`;
}

export async function runAudit({ directory = "dist", output = "reports/seo" } = {}) {
  const files = await htmlFiles(directory);
  const pages = await Promise.all(files
    .map((file) => ({ file, route: routeFor(directory, file) }))
    .filter(({ route }) => !route.startsWith("/owner/") && !route.startsWith("/review/"))
    .map(async ({ file, route }) => auditHtml(route, await fs.readFile(file, "utf8"))));
  const findings = pages.flatMap((page) => page.findings);
  const sitemap = await fs.readFile(path.join(directory, "sitemap.xml"), "utf8");
  const robots = await fs.readFile(path.join(directory, "robots.txt"), "utf8");
  const llms = await fs.readFile(path.join(directory, "llms.txt"), "utf8");

  for (const route of REQUIRED) {
    if (!pages.some((page) => page.route === route)) findings.push(finding("critical", "REQUIRED_PAGE", route, "Required public page is absent from the built artifact."));
    if (!sitemap.includes(`<loc>${SITE}${route}</loc>`)) findings.push(finding("high", "SITEMAP", route, "Required public page is absent from sitemap.xml."));
    if (!robotsAllows(robots, route)) findings.push(finding("high", "ROBOTS", route, "robots.txt does not explicitly allow this public path."));
    if (!llms.includes(`${SITE}${route}`)) findings.push(finding("medium", "LLMS_MAP", route, "llms.txt does not map this public page."));
  }
  if (/\/api\/|\/owner\/|\/review\//.test(sitemap)) findings.push(finding("critical", "PRIVATE_SITEMAP", "/sitemap.xml", "Private route found in public sitemap."));

  const blockers = findings.filter((item) => BLOCKING.has(item.severity)).length;
  const report = { generatedAt: new Date().toISOString(), verdict: blockers ? "FAIL" : "PASS", blockers, pages, findings };
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(path.join(output, "report.md"), markdown(report));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runAudit({ directory: process.argv[2] || "dist", output: process.argv[3] || "reports/seo" });
  console.log(JSON.stringify({ verdict: report.verdict, pages: report.pages.length, findings: report.findings.length, blockers: report.blockers }, null, 2));
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}
