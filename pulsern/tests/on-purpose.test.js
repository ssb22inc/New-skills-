import { describe, expect, it } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs/promises";
import { launchBrowser } from "../ops/browser.mjs";
import { AuthScreen } from "../src/auth.jsx";
import LandingPage from "../src/landing.jsx";
import { ON_PURPOSE } from "../src/on-purpose.js";

const read = (relative) => fs.readFile(new URL(`../${relative}`, import.meta.url), "utf8");
const LINES = [ON_PURPOSE.eyebrow, ON_PURPOSE.headline, ON_PURPOSE.support];

function expectLines(html, label) {
  for (const line of LINES) expect(html, label).toContain(line);
}

describe("On Purpose slogan", () => {
  it("keeps the flyer line exact, and free of a pass promise or a named competitor", () => {
    expect(ON_PURPOSE).toEqual({
      eyebrow: "ON PURPOSE",
      headline: "We intentionally grade harder than the NCLEX.",
      support: "Tougher practice now, so test day feels familiar.",
    });
    const text = LINES.join(" ");
    expect(text).not.toMatch(/guarantee|you will pass|you'll pass|might|as an ai|i think/i);
    expect(text).not.toMatch(/\b(uworld|archer|kaplan|mercy|cedars|mayo|johns hopkins|icu|med-surg)\b/i);
  });

  it("puts the callout in the homepage hero and the static fallback", async () => {
    const landing = renderToStaticMarkup(createElement(LandingPage, { onSignIn() {}, onStart() {} }));
    expect(landing).toContain('class="land-purpose"');
    expect(landing.indexOf('class="land-purpose"')).toBeLessThan(landing.indexOf('class="land-actions"'));
    expect(landing.indexOf('class="land-purpose"')).toBeLessThan(landing.indexOf("Why PulseRN"));
    expectLines(landing, "landing");

    const home = await read("index.html");
    const fallback = home.slice(home.indexOf('<div id="root">'), home.indexOf("<h2>Retrieval practice</h2>"));
    expect(fallback).toContain('aria-label="On purpose"');
    expectLines(fallback, "index.html");
  });

  it("shows the same callout on sign-in, sign-up, and the clinical link", () => {
    for (const props of [
      { initialMode: "signin" },
      { initialMode: "signup" },
      { initialMode: "signin", cohort: "clinicals" },
      { initialMode: "signup", cohort: "clinicals" },
    ]) {
      const html = renderToStaticMarkup(createElement(AuthScreen, props));
      expect(html).toContain('class="auth-purpose"');
      expectLines(html, JSON.stringify(props));
    }
    const reset = renderToStaticMarkup(createElement(AuthScreen, { initialMode: "forgot" }));
    expect(reset).not.toContain('class="auth-purpose"');
    const clinical = renderToStaticMarkup(createElement(AuthScreen, { initialMode: "signup", cohort: "clinicals" }));
    expect(clinical).toContain("30 days free");
  });

  it("places the band on how it works, pricing, and methodology only", async () => {
    for (const route of ["how-it-works", "pricing", "methodology"]) {
      const html = await read(`public/${route}/index.html`);
      expect(html).toContain('class="purpose"');
      const leadAt = html.indexOf('class="lead"');
      const bandAt = html.indexOf('class="purpose"');
      expect(leadAt).toBeGreaterThan(-1);
      expect(bandAt).toBeGreaterThan(leadAt);
      expectLines(html, route);
    }
    const editorial = await read("public/editorial-policy/index.html");
    expect(editorial).not.toContain("ON PURPOSE");
    expect(editorial).not.toContain(ON_PURPOSE.headline);
  });

  it("keeps the sign-in form on a 390 by 844 screen, with and without the clinical perk", async () => {
    const browser = await launchBrowser({ proxy: undefined });
    try {
      for (const props of [
        { initialMode: "signin" },
        { initialMode: "signup" },
        { initialMode: "signin", cohort: "clinicals" },
        { initialMode: "signup", cohort: "clinicals" },
      ]) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844, deviceScaleFactor: 1 } });
        const html = renderToStaticMarkup(createElement(AuthScreen, props));
        await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${html}</body></html>`, { waitUntil: "domcontentloaded" });
        const purpose = await page.locator(".auth-purpose").boundingBox();
        const submit = await page.locator("form button.auth-btn").boundingBox();
        expect(purpose?.y, JSON.stringify(props)).toBeGreaterThanOrEqual(0);
        expect(submit?.y, JSON.stringify(props)).toBeGreaterThanOrEqual(0);
        expect(submit.y + submit.height, JSON.stringify(props)).toBeLessThanOrEqual(844);
        await page.close();
      }

      const landing = await browser.newPage({ viewport: { width: 390, height: 844, deviceScaleFactor: 1 } });
      await landing.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${renderToStaticMarkup(createElement(LandingPage, { onSignIn() {}, onStart() {} }))}</body></html>`, { waitUntil: "domcontentloaded" });
      const mobileBand = await landing.locator(".land-purpose").boundingBox();
      expect(mobileBand.y).toBeGreaterThanOrEqual(0);
      expect(mobileBand.y + mobileBand.height).toBeLessThanOrEqual(844);
      await landing.setViewportSize({ width: 1280, height: 800 });
      const desktopBand = await landing.locator(".land-purpose").boundingBox();
      expect(desktopBand.y).toBeGreaterThanOrEqual(0);
      expect(desktopBand.y + desktopBand.height).toBeLessThanOrEqual(800);
      await landing.close();
    } finally {
      await browser.close();
    }
  }, 60_000);
});
