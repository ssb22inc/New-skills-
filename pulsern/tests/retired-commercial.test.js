import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs/promises";
import path from "node:path";
import { COMMERCIAL_PAGES, COMMERCIAL_SOURCES, RETIRED_PATHS, isRetired } from "../ops/commercial-content.mjs";
import middleware, { config as middlewareConfig } from "../middleware.js";
import LandingPage from "../src/landing.jsx";

const ROOT = new URL("..", import.meta.url);
const read = (relative) => fs.readFile(new URL(relative, ROOT), "utf8");

const RETIRED = [
  ["/compare/", "/how-it-works/"],
  ["/compare/methodology/", "/methodology/"],
  ["/compare/pulsern-vs-uworld/", "/how-it-works/"],
  ["/compare/pulsern-vs-archer/", "/how-it-works/"],
  ["/compare/pulsern-vs-kaplan/", "/how-it-works/"],
  ["/compare/best-nclex-question-banks/", "/free-nclex-practice-test/"],
  ["/compare/best-affordable-nclex-prep/", "/pricing/"],
  ["/compare/best-nclex-app-repeat-test-takers/", "/how-it-works/"],
];

const COMPETITOR = /\bUWorld\b|\bArcher Review\b|\bArcher\b|\bKaplan\b/;
const COMPARE_LINK = /href=["']\/compare\/|https:\/\/www\.pulsern\.app\/compare\//;

async function walk(directory, files = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else files.push(full);
  }
  return files;
}

describe("retired comparison pages", () => {
  it("publishes zero commercial pages and no competitor sources", () => {
    expect(COMMERCIAL_PAGES).toEqual([]);
    const publishers = Object.values(COMMERCIAL_SOURCES).map((source) => source.publisher);
    expect(publishers.every((publisher) => publisher === "PulseRN")).toBe(true);
    expect(Object.values(COMMERCIAL_SOURCES).some((source) => COMPETITOR.test(`${source.publisher} ${source.title} ${source.url}`))).toBe(false);
  });

  it("answers 410 Gone, with no redirect, for every retired URL with or without a slash and a query", async () => {
    const vercel = JSON.parse(await read("vercel.json"));
    expect(vercel.redirects.some((rule) => String(rule.source).startsWith("/compare"))).toBe(false);
    expect(vercel.redirects.find((rule) => rule.source === "/app")).toMatchObject({ destination: "/app/", permanent: true });
    expect(middlewareConfig.matcher).toEqual(["/compare", "/compare/:path*"]);
    expect(RETIRED.map(([route]) => route)).toEqual(RETIRED_PATHS);

    for (const [canonical] of RETIRED) {
      for (const pathName of [canonical, canonical.replace(/\/$/, "")]) {
        for (const requestPath of [pathName, `${pathName}?utm_source=retired&utm_campaign=compare`]) {
          expect(isRetired(requestPath), requestPath).toBe(true);
        }
      }
    }
    expect(isRetired("/compare/unknown-bank")).toBe(true);
    expect(isRetired("/how-it-works/")).toBe(false);
    expect(isRetired("/pricing/?plan=30")).toBe(false);
    expect(isRetired("/comparesomething")).toBe(false);

    const response = middleware(new Request("https://www.pulsern.app/compare/pulsern-vs-uworld/"));
    expect(response.status).toBe(410);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    const body = await response.text();
    expect(body).toContain('<meta name="robots" content="noindex">');
    expect(body).toContain('href="/free-nclex-practice-test/"');
    expect(body).not.toMatch(COMPETITOR);
  });

  it("removes the comparison directory and drops /compare/ from robots.txt", async () => {
    await expect(fs.access(new URL("public/compare", ROOT))).rejects.toThrow();
    const robots = await read("public/robots.txt");
    expect(robots).not.toMatch(/compare/);
    expect(robots).not.toMatch(/^Disallow: \/compare/m);
    const guardian = await read("ops/seo-guardian.mjs");
    const required = guardian.match(/const REQUIRED = \[([\s\S]*?)\];/)?.[1] ?? "";
    for (const [route] of RETIRED) expect(required).not.toContain(`"${route}"`);
  });

  it("names no competitor and links no /compare/ URL from public pages, discovery files, or nav", async () => {
    const landing = renderToStaticMarkup(React.createElement(LandingPage, { onSignIn() {}, onStart() {} }));
    expect(landing).toContain("Why PulseRN");
    expect(landing).toContain("working hospital RN");
    expect(landing).toContain('href="/how-it-works/"');
    expect(landing).toContain('href="/about/"');
    expect(landing).toContain('href="/pricing/"');
    expect(landing).toContain('href="/methodology/"');
    expect(landing).not.toMatch(COMPETITOR);
    expect(landing).not.toMatch(COMPARE_LINK);

    const homepage = await read("index.html");
    expect(homepage).toContain("Choose NCLEX prep by how you learn");
    expect(homepage).toContain('href="/how-it-works/"');
    expect(homepage).toContain('href="/methodology/"');
    expect(homepage).toContain('href="/pricing/"');
    expect(homepage).not.toContain("Compare NCLEX prep");
    expect(homepage).not.toMatch(COMPETITOR);
    expect(homepage).not.toMatch(COMPARE_LINK);

    const nav = await read("ops/build-public-pages.mjs");
    expect(nav).not.toContain(">Compare<");
    expect(nav).not.toContain("Competitor trademarks");
    expect(nav).not.toMatch(COMPARE_LINK);
    expect(nav).not.toMatch(COMPETITOR);

    const publicDir = new URL("public/", ROOT);
    const files = await walk(publicDir.pathname);
    const scanned = [];
    for (const file of files) {
      if (file.endsWith(`${path.sep}robots.txt`)) continue;
      if (!/\.(html|xml|txt|json)$/.test(file)) continue;
      scanned.push(file);
      const body = await fs.readFile(file, "utf8");
      expect(body, file).not.toMatch(COMPETITOR);
      expect(body, file).not.toMatch(COMPARE_LINK);
    }
    expect(scanned.some((file) => file.endsWith(`${path.sep}sitemap.xml`))).toBe(true);
    expect(scanned.some((file) => file.endsWith(`${path.sep}llms.txt`))).toBe(true);
    const sitemap = await read("public/sitemap.xml");
    const llms = await read("public/llms.txt");
    for (const [route] of RETIRED) {
      expect(sitemap).not.toContain(`https://www.pulsern.app${route}`);
      expect(llms).not.toContain(`https://www.pulsern.app${route}`);
    }
    for (const destination of ["/how-it-works/", "/methodology/", "/pricing/", "/free-nclex-practice-test/"]) {
      expect(sitemap).toContain(`<loc>https://www.pulsern.app${destination}</loc>`);
      expect(llms).toContain(`https://www.pulsern.app${destination}`);
    }
  });
});

describe("unknown URLs", () => {
  it("are not rewritten to the homepage, so the platform answers 404 with the 404 page", async () => {
    const vercel = JSON.parse(await read("vercel.json"));
    const catchAll = (vercel.rewrites ?? []).filter((rule) => rule.destination === "/index.html");
    expect(catchAll).toEqual([]);
    expect((vercel.rewrites ?? []).find((rule) => rule.source === "/app/(.*)")).toMatchObject({ destination: "/app/index.html" });
    const notFound = await read("public/404.html");
    expect(notFound).toContain('<meta name="robots" content="noindex">');
    expect(notFound).not.toContain('rel="canonical"');
    expect(notFound).toContain("We can't find that page.");
    expect(notFound).toContain('href="/free-nclex-practice-test/"');
  });

  it("sends slash-less public URLs to the canonical slash URL with a permanent redirect", async () => {
    const vercel = JSON.parse(await read("vercel.json"));
    const top = vercel.redirects.find((rule) => rule.source.startsWith("/:page("));
    for (const page of ["about", "legal", "learn", "pricing", "how-it-works", "methodology", "editorial-policy", "free-nclex-practice-test"]) {
      expect(top.source).toContain(page);
      await expect(fs.access(new URL(`public/${page}/index.html`, ROOT))).resolves.toBeUndefined();
    }
    expect(top).toMatchObject({ destination: "/:page/", permanent: true });
    expect(vercel.redirects.find((rule) => rule.source === "/learn/:slug([a-z0-9-]+)")).toMatchObject({ destination: "/learn/:slug/", permanent: true });
  });
});
