/* Campaign tags have to survive the page an ad actually opens.
   ------------------------------------------------------------------
   The homepage and /app/ already call captureAttribution(). The free quiz,
   every /learn/ guide, and the other public documents do not load that
   bundle, and their buttons go to the bare homepage. A visitor who arrived
   at /learn/abg-interpretation/?utm_source=linkedin&utm_campaign=day3 was
   therefore stored as direct. The static pages now load public/attribution.js,
   which is the same functions — not a second store — and signup still flushes
   that one first touch. A later visit must not replace it. */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { captureAttribution, flushAttribution, storedAttribution } from "../src/attribution.js";
import { buildFunnelReport } from "../src/funnel-report.js";
import { ATTRIBUTION_BOOT_TAG, renderAttributionBoot } from "../ops/attribution-boot.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const SITE = "https://www.pulsern.app";

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (name.endsWith(".html")) out.push(full);
  }
  return out;
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    keys: () => [...data.keys()],
  };
}

/* The published script is what a browser runs. Drive it the way that page
   load does: a classic script, with the landing URL as window.location. */
function land(storage, href, referrer = "") {
  vm.runInNewContext(read("public/attribution.js"), {
    window: { location: { href } },
    document: { referrer },
    localStorage: storage,
    URL,
    Date,
  });
}

async function withBrowser(storage, href, referrer, fn) {
  const prev = {
    localStorage: globalThis.localStorage,
    window: globalThis.window,
    document: globalThis.document,
  };
  globalThis.localStorage = storage;
  globalThis.window = { location: { href } };
  globalThis.document = { referrer };
  try {
    return await fn();
  } finally {
    if (prev.localStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prev.localStorage;
    if (prev.window === undefined) delete globalThis.window;
    else globalThis.window = prev.window;
    if (prev.document === undefined) delete globalThis.document;
    else globalThis.document = prev.document;
  }
}

/* Homepage CTA, then the app signup screen, then the write signup already
   performs. Neither later page carries the campaign query. */
async function continueToSignup(storage, userId) {
  await withBrowser(storage, `${SITE}/?start=1`, `${SITE}/learn/abg-interpretation/`, () => {
    captureAttribution();
  });
  await withBrowser(storage, `${SITE}/app/sign-up`, `${SITE}/?start=1`, () => {
    captureAttribution();
  });
  const inserted = [];
  await withBrowser(storage, `${SITE}/app/sign-up`, `${SITE}/?start=1`, () => flushAttribution({
    from(table) {
      if (table !== "user_attribution") throw new Error(`unexpected table ${table}`);
      return {
        insert(row) {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  }, userId));
  return inserted;
}

function creditedSource(row, userId) {
  const report = buildFunnelReport({
    rows: [{ user_id: userId, event: "signup" }],
    attrRows: [{
      user_id: userId,
      utm_source: row.utm_source,
      utm_campaign: row.utm_campaign,
      referrer: row.referrer,
    }],
    windowDays: 30,
  });
  return report.bySource;
}

describe("public pages load the existing capture", () => {
  it("publishes the attribution module itself, not a second implementation", () => {
    expect(read("public/attribution.js")).toBe(renderAttributionBoot(read("src/attribution.js")));
    expect(read("public/attribution.js")).not.toMatch(/\bdocument\.cookie\b|\bfetch\s*\(|XMLHttpRequest|\bgtag\s*\(|\bfbq\s*\(/);
  });

  it("puts that script on every static public page, ahead of the first link", () => {
    const files = htmlFiles(path.join(root, "public"));
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      const html = readFileSync(file, "utf8");
      const rel = path.relative(root, file);
      expect(html.split(ATTRIBUTION_BOOT_TAG).length - 1, rel).toBe(1);
      expect(html.indexOf(ATTRIBUTION_BOOT_TAG), rel).toBeLessThan(html.indexOf("<body"));
    }
  });

  it("covers every indexable URL, and the homepage and app still capture themselves", () => {
    const routes = [...read("public/sitemap.xml").matchAll(/<loc>https:\/\/www\.pulsern\.app([^<]*)<\/loc>/g)].map((match) => match[1]);
    expect(routes).toContain("/");
    expect(routes).toContain("/learn/abg-interpretation/");
    expect(routes).toContain("/free-nclex-practice-test/");
    for (const route of routes) {
      if (route === "/") continue;
      const html = read(path.join("public", route.replace(/^\//, ""), "index.html"));
      expect(html, route).toContain(ATTRIBUTION_BOOT_TAG);
    }
    /* npm run build rewrites the generated documents from these two files.
       A tag that exists only in the checked-in HTML would vanish on deploy. */
    for (const generator of ["ops/build-learn.mjs", "ops/build-public-pages.mjs"]) {
      const source = read(generator);
      expect(source, generator).toContain("ATTRIBUTION_BOOT_TAG");
      expect(source, generator).toContain("writeAttributionBoot(");
    }
    const marketing = read("src/main.jsx");
    const capturedAt = marketing.indexOf("captureAttribution()");
    expect(capturedAt).toBeGreaterThan(-1);
    expect(capturedAt).toBeLessThan(marketing.indexOf("window.location.replace"));
    expect(capturedAt).toBeLessThan(marketing.indexOf("createRoot("));
    const app = read("src/auth.jsx");
    expect(app).toContain("captureAttribution()");
    expect(app).toContain("flushAttribution(supabase, session.user.id)");
    expect(read("index.html")).not.toContain(ATTRIBUTION_BOOT_TAG);
    expect(read("app/index.html")).not.toContain(ATTRIBUTION_BOOT_TAG);
  });
});

describe("a tagged landing is what signup records", () => {
  it("keeps a learn-page campaign through the bare homepage button and into bySource", async () => {
    const learn = read("public/learn/abg-interpretation/index.html");
    expect(learn).toContain(ATTRIBUTION_BOOT_TAG);
    expect(learn).toContain('<a href="/">Start studying on PulseRN');

    const storage = memoryStorage();
    land(
      storage,
      `${SITE}/learn/abg-interpretation/?utm_source=linkedin&utm_medium=social&utm_campaign=day3&utm_content=ad1&utm_term=abg`,
      "https://www.linkedin.com/feed/",
    );
    const inserted = await continueToSignup(storage, "learn-student");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      user_id: "learn-student",
      utm_source: "linkedin",
      utm_medium: "social",
      utm_campaign: "day3",
      utm_content: "ad1",
      utm_term: "abg",
      referrer: "https://www.linkedin.com/feed/",
      landing_path: "/learn/abg-interpretation/",
    });
    expect(inserted[0].first_seen_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(creditedSource(inserted[0], "learn-student")).toEqual([
      { source: "linkedin / day3", signup: 1, activated: 0, purchase: 0 },
    ]);
  });

  it("keeps a free-quiz click id through the bare free-pass button", async () => {
    const quiz = read("public/free-nclex-practice-test/index.html");
    expect(quiz).toContain(ATTRIBUTION_BOOT_TAG);
    expect(quiz).toContain('href="/?start=1"');

    const storage = memoryStorage();
    land(storage, `${SITE}/free-nclex-practice-test/?gclid=abc123`, "https://www.google.com/");
    const inserted = await continueToSignup(storage, "quiz-student");
    expect(inserted[0]).toMatchObject({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: null,
      referrer: "https://www.google.com/",
      landing_path: "/free-nclex-practice-test/",
    });
    expect(creditedSource(inserted[0], "quiz-student")).toEqual([
      { source: "google", signup: 1, activated: 0, purchase: 0 },
    ]);
  });

  it("credits a cs_g5 / reproof_20260928 first touch from a public page", async () => {
    const storage = memoryStorage();
    land(
      storage,
      `${SITE}/compare/pulsern-vs-uworld/?utm_source=cs_g5&utm_medium=cpc&utm_campaign=reproof_20260928&utm_content=headline&utm_term=nclex`,
      "https://www.google.com/",
    );
    const inserted = await continueToSignup(storage, "campaign-student");
    expect(inserted[0]).toMatchObject({
      utm_source: "cs_g5",
      utm_medium: "cpc",
      utm_campaign: "reproof_20260928",
      utm_content: "headline",
      utm_term: "nclex",
      landing_path: "/compare/pulsern-vs-uworld/",
    });
    expect(creditedSource(inserted[0], "campaign-student")).toEqual([
      { source: "cs_g5 / reproof_20260928", signup: 1, activated: 0, purchase: 0 },
    ]);
  });
});

describe("first touch stays first touch", () => {
  it("does not let a later public page replace an earlier homepage or app tag", async () => {
    const storage = memoryStorage();
    await withBrowser(
      storage,
      `${SITE}/?utm_source=cs_g5&utm_medium=cpc&utm_campaign=reproof_20260928`,
      "",
      () => { captureAttribution(); },
    );
    const saved = storage.getItem(storage.keys()[0]);
    land(storage, `${SITE}/learn/abg-interpretation/?utm_source=linkedin&utm_campaign=day3`, "https://www.linkedin.com/");
    land(storage, `${SITE}/free-nclex-practice-test/?utm_source=facebook&utm_campaign=later`, "");
    await withBrowser(storage, `${SITE}/app/?utm_source=tiktok&utm_campaign=later`, "https://checkout.stripe.com/", () => {
      captureAttribution();
    });
    expect(storage.keys()).toHaveLength(1);
    expect(storage.getItem(storage.keys()[0])).toBe(saved);
    expect(await withBrowser(storage, `${SITE}/app/`, "", () => storedAttribution())).toMatchObject({
      utm_source: "cs_g5",
      utm_campaign: "reproof_20260928",
      landing_path: "/",
    });
  });

  it("does not let the homepage replace a tag captured on the first public page", () => {
    const storage = memoryStorage();
    land(storage, `${SITE}/pricing/?utm_source=cs_g5&utm_medium=cpc&utm_campaign=reproof_20260928`, "");
    const saved = storage.getItem(storage.keys()[0]);
    return withBrowser(storage, `${SITE}/?utm_source=newsletter&utm_campaign=later`, `${SITE}/pricing/`, () => {
      captureAttribution();
      expect(storage.getItem(storage.keys()[0])).toBe(saved);
      expect(storedAttribution()).toMatchObject({ utm_source: "cs_g5", utm_campaign: "reproof_20260928", landing_path: "/pricing/" });
    });
  });

  it("does not treat an untagged public visit as a first touch that blocks a real one", async () => {
    const storage = memoryStorage();
    land(storage, `${SITE}/learn/nclex-study-plan/`, `${SITE}/learn/`);
    expect(storage.keys()).toEqual([]);
    land(storage, `${SITE}/learn/nclex-study-plan/?utm_source=linkedin&utm_campaign=day3`, "https://www.linkedin.com/");
    expect(await withBrowser(storage, `${SITE}/learn/nclex-study-plan/`, "", () => storedAttribution())).toMatchObject({
      utm_source: "linkedin",
      utm_campaign: "day3",
    });
  });

  it("still records an app landing when nothing was stored yet", async () => {
    const storage = memoryStorage();
    await withBrowser(storage, `${SITE}/app/?utm_source=cs_g5&utm_medium=cpc&utm_campaign=reproof_20260928`, "", () => {
      captureAttribution();
    });
    expect(await withBrowser(storage, `${SITE}/app/`, "", () => storedAttribution())).toMatchObject({
      utm_source: "cs_g5",
      utm_medium: "cpc",
      utm_campaign: "reproof_20260928",
      landing_path: "/app/",
    });
  });

  it("does not throw when storage is blocked", () => {
    const storage = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
    };
    expect(() => land(storage, `${SITE}/learn/abg-interpretation/?utm_source=linkedin&utm_campaign=day3`)).not.toThrow();
  });
});
