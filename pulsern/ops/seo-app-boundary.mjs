#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const finding = (severity, code, message) => ({ severity, code, route: "/app/", message });
const metaContent = (html, name) => html.match(new RegExp(`<meta\\b[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1]
  ?? html.match(new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, "i"))?.[1]
  ?? "";
const linkHref = (html, rel) => html.match(new RegExp(`<link\\b[^>]*rel=["'][^"']*${rel}[^"']*["'][^>]*href=["']([^"']+)["']`, "i"))?.[1]
  ?? html.match(new RegExp(`<link\\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*${rel}[^"']*["']`, "i"))?.[1]
  ?? "";

export async function runAppBoundary({ directory = "dist", sourceDirectory = ".", vercelFile = "vercel.json", outputFile = "reports/seo/app-boundary.json" } = {}) {
  const findings = [];
  const read = (name) => fs.readFile(path.join(directory, name), "utf8");
  const [marketing, app, manifestRaw, worker, sitemap, llms, vercelRaw, marketingEntry, appEntry, authSource, routingSource, billingSource, usersSource] = await Promise.all([
    read("index.html"), read("app/index.html"), read("app.webmanifest"), read("app-sw.js"), read("sitemap.xml"), read("llms.txt"), fs.readFile(vercelFile, "utf8"),
    fs.readFile(path.join(sourceDirectory, "src/main.jsx"), "utf8"),
    fs.readFile(path.join(sourceDirectory, "src/app-main.jsx"), "utf8"),
    fs.readFile(path.join(sourceDirectory, "src/auth.jsx"), "utf8"),
    fs.readFile(path.join(sourceDirectory, "src/app-routing.js"), "utf8"),
    fs.readFile(path.join(sourceDirectory, "api/billing.js"), "utf8"),
    fs.readFile(path.join(sourceDirectory, "api/users.js"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestRaw);
  const vercel = JSON.parse(vercelRaw);

  if (/noindex|none/i.test(metaContent(marketing, "robots"))) findings.push(finding("critical", "MARKETING_NOINDEX", "The public homepage must remain indexable."));
  if (linkHref(marketing, "canonical") !== "https://www.pulsern.app/") findings.push(finding("critical", "MARKETING_CANONICAL", "The public homepage canonical must remain https://www.pulsern.app/."));
  if (linkHref(marketing, "manifest")) findings.push(finding("high", "MARKETING_PWA_SCOPE", "The public homepage must not claim the private app manifest."));
  if (!marketing.includes('"url": "https://www.pulsern.app/app/"')) findings.push(finding("high", "APPLICATION_SCHEMA_URL", "Homepage WebApplication schema must resolve to /app/."));

  if (!/noindex/i.test(metaContent(app, "robots")) || !/noindex/i.test(metaContent(app, "googlebot"))) findings.push(finding("critical", "APP_NOINDEX", "The app shell needs explicit general and Googlebot noindex directives."));
  if (linkHref(app, "canonical")) findings.push(finding("high", "APP_CANONICAL", "The private app shell must not publish an indexable canonical."));
  if (linkHref(app, "manifest") !== "/app.webmanifest") findings.push(finding("critical", "APP_MANIFEST_LINK", "The app shell must link the /app.webmanifest file."));
  if (!/<main\b/i.test(app) || !/<h1\b/i.test(app)) findings.push(finding("high", "APP_STATIC_FALLBACK", "The app shell needs a semantic static loading fallback."));

  for (const key of ["id", "start_url", "scope"]) if (manifest[key] !== "/app/") findings.push(finding("critical", "PWA_SCOPE", `Manifest ${key} must equal /app/.`));
  if (!worker.includes('const CACHE = "pulsern-app-v2"') || !worker.includes('url.pathname.startsWith("/app/")') || !worker.includes('caches.match("/app/index.html")')) findings.push(finding("critical", "SERVICE_WORKER_SCOPE", "The service worker must use the versioned app cache and /app/ navigation fallback."));

  if (!marketingEntry.includes("<LandingPage") || marketingEntry.includes("<AuthGate") || marketingEntry.includes("serviceWorker.register")) findings.push(finding("critical", "MARKETING_ENTRY", "The root entry must always render the public landing page and must not register an origin-wide app worker."));
  if (!marketingEntry.includes("authCallbackAppUrl") || !marketingEntry.includes("window.location.replace(callbackTarget)")) findings.push(finding("critical", "LEGACY_AUTH_CALLBACK", "Legacy root-returning auth links must forward their intact callback payload to /app/."));
  if (!appEntry.includes("<AuthGate") || !appEntry.includes('register("/app-sw.js", { scope: "/app/" })')) findings.push(finding("critical", "APP_ENTRY", "The private entry must render the authentication gate and register only the /app/ worker scope."));
  if (!authSource.includes("authRedirectUrl") || /redirectTo:\s*window\.location\.origin|emailRedirectTo:\s*window\.location\.origin/.test(authSource)) findings.push(finding("critical", "AUTH_CALLBACK_PATH", "Client authentication callbacks must resolve under /app/, never the marketing root."));
  if (!routingSource.includes("isAuthCallbackUrl(href)") || !routingSource.includes('signOut({ scope: "local" })')) findings.push(finding("critical", "SESSION_MIGRATION", "The one-time local re-login must preserve auth callbacks and clear only the local legacy session."));
  if (!billingSource.includes('/app/?checkout=success') || !billingSource.includes('/app/?checkout=cancelled')) findings.push(finding("critical", "BILLING_RETURN_PATH", "Stripe success and cancellation URLs must return to /app/."));
  if (!usersSource.includes('/app/reset') || !usersSource.includes('/app/')) findings.push(finding("critical", "ADMIN_AUTH_RETURN_PATH", "Owner-issued reset, confirmation, and invitation emails must return under /app/."));

  for (const publicMap of [["sitemap.xml", sitemap], ["llms.txt", llms]]) {
    if (/https:\/\/www\.pulsern\.app\/app\//i.test(publicMap[1])) findings.push(finding("critical", "PRIVATE_PUBLIC_MAP", `${publicMap[0]} must not publish the private app route.`));
  }
  for (const legacy of ["manifest.json", "sw.js"]) {
    try { await fs.access(path.join(directory, legacy)); findings.push(finding("high", "LEGACY_ROOT_PWA", `Legacy root-scoped ${legacy} still exists.`)); } catch { /* expected */ }
  }

  const redirect = (vercel.redirects ?? []).find((entry) => entry.source === "/app");
  const rewrite = (vercel.rewrites ?? []).find((entry) => entry.source === "/app/(.*)");
  const header = (vercel.headers ?? []).find((entry) => entry.source === "/app/(.*)");
  if (redirect?.destination !== "/app/" || redirect?.permanent !== true) findings.push(finding("high", "APP_TRAILING_SLASH", "/app must permanently redirect to /app/."));
  if (rewrite?.destination !== "/app/index.html") findings.push(finding("critical", "APP_SPA_REWRITE", "Deep /app/ routes must resolve to the app shell."));
  const xRobots = header?.headers?.find((item) => item.key.toLowerCase() === "x-robots-tag")?.value ?? "";
  if (!/noindex/i.test(xRobots)) findings.push(finding("critical", "APP_X_ROBOTS", "Vercel must emit an X-Robots-Tag noindex header for /app/ routes."));

  const blockers = findings.filter((item) => ["critical", "high"].includes(item.severity)).length;
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), verdict: blockers ? "FAIL" : "PASS", route: "/app/", blockers, findings };
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(outputFile.replace(/\.json$/, ".md"), `# PulseRN app-boundary audit\n\nVerdict: **${report.verdict}**\n\nBlockers: ${blockers}\n\n${findings.length ? findings.map((item) => `- **${item.code}:** ${item.message}`).join("\n") : "No findings."}\n`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runAppBoundary();
  console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers, findings: report.findings.length }, null, 2));
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}
