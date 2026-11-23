/* Clinical-student perk: the /clinicals link, the 20-spot cap, the $40
   30-day pass, the backup code, the cohort funnel, and the phone install
   step that waits until the account exists. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSupabase, fakeRes } from "./helpers/fake-supabase.js";
import { planById } from "../src/pricing.js";
import { authRedirectUrl } from "../src/app-routing.js";
import { buildFunnelReport } from "../src/funnel-report.js";
import { buildMarketingPayload } from "../api/marketing.js";
import { AuthScreen } from "../src/auth.jsx";
import ClinicalWelcome from "../src/clinical-welcome.jsx";
import InstallCard, { detectPlatform, isStandalone, noteInstallPrompt } from "../src/install.jsx";
import {
  CLINICAL_COPY,
  CLINICAL_SIGNUP_PATH,
  CLINICAL_SUB30_CENTS,
  CLINICAL_WELCOME_DISMISSED,
  CLINICAL_WELCOME_PENDING,
  claimCohortSpot,
  clinicalSpotCap,
  completeClinicalClaim,
  dismissClinicalWelcome,
} from "../src/clinical.js";

/* auth.jsx builds its Supabase client at import time. Billing builds a new
   one per request. The mock returns whatever the test stored, and a quiet
   stand-in until a billing test does. */
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => globalThis.__pulsernBillingDb ?? {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

const NOW = Date.parse("2026-11-23T15:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days) => new Date(NOW + days * DAY).toISOString();
const DEST = CLINICAL_SIGNUP_PATH;

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function browser({ ua = ANDROID_CHROME, standalone = false, href = "https://www.pulsern.app/app/sign-up?cohort=clinicals" } = {}) {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const navigator = { userAgent: ua, platform: "", maxTouchPoints: 0, standalone };
  setGlobal("localStorage", localStorage);
  setGlobal("sessionStorage", sessionStorage);
  setGlobal("navigator", navigator);
  setGlobal("window", {
    matchMedia: () => ({ matches: standalone }),
    navigator,
    location: new URL(href),
    addEventListener() {},
    history: { replaceState() {} },
    localStorage,
    sessionStorage,
  });
}

const pass = (overrides = {}) => ({
  user_id: "u",
  plan: "pass1",
  starts_at: at(-1),
  expires_at: at(6),
  exams_granted: 0,
  price_cents: 0,
  discount_code: null,
  ...overrides,
});

beforeEach(() => {
  noteInstallPrompt(null);
  browser();
  process.env.SUPABASE_URL = "http://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-for-tests";
  process.env.STRIPE_SECRET_KEY = "sk_test_clinical";
  process.env.SITE_URL = "https://www.pulsern.app";
  delete process.env.PULSERN_CLINICAL_SPOTS;
});

afterEach(() => {
  noteInstallPrompt(null);
  vi.unstubAllGlobals();
  delete process.env.PULSERN_CLINICAL_SPOTS;
  delete globalThis.__pulsernBillingDb;
});

describe("clinical redirect", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

  it("sends /clinicals and /clinical to the clinical signup with a 302", () => {
    for (const source of ["/clinicals", "/clinical"]) {
      const hit = vercel.redirects.find((entry) => entry.source === source);
      expect(hit?.destination).toBe(DEST);
      expect(hit?.statusCode).toBe(302);
    }
  });

  it("keeps the utm tags that attribute an in-person clinical visit", () => {
    expect(DEST).toContain("cohort=clinicals");
    expect(DEST).toContain("utm_source=clinicals");
    expect(DEST).toContain("utm_medium=in-person");
    expect(DEST).toContain("utm_campaign=clinical-students");
  });
});

describe("auth return URLs keep the cohort", () => {
  const signup = "https://www.pulsern.app/app/sign-up?cohort=clinicals&utm_source=clinicals";

  it("puts ?cohort=clinicals on email, magic-link, and Google returns", () => {
    expect(authRedirectUrl("signin", "https://www.pulsern.app", signup))
      .toBe("https://www.pulsern.app/app/?cohort=clinicals");
    expect(authRedirectUrl("recovery", "https://www.pulsern.app", signup))
      .toBe("https://www.pulsern.app/app/reset?cohort=clinicals");
  });

  it("leaves an ordinary signup callback on /app/ with no cohort", () => {
    expect(authRedirectUrl("signin", "https://www.pulsern.app", "https://www.pulsern.app/app/sign-up"))
      .toBe("https://www.pulsern.app/app/");
  });

  it("uses that helper for confirmation, the magic link, and Google", () => {
    const src = readFileSync(new URL("../src/auth.jsx", import.meta.url), "utf8");
    expect(src).toContain("emailRedirectTo: authRedirectUrl()");
    expect(src).toContain("redirectTo: authRedirectUrl()");
    expect(src).toContain("claimClinicalSpot()");
    expect(src.indexOf("await claimClinicalSpot()")).toBeLessThan(src.indexOf("return <App"));
    expect(src).toContain('if (entry === "booting")');
    expect(src.indexOf('if (entry === "booting")')).toBeLessThan(src.lastIndexOf("return <App"));
  });
});

describe("spot cap and claim idempotency", () => {
  function fill(n, { internalIds = [] } = {}) {
    let members = [];
    let subscriptions = [];
    for (let i = 0; i < n; i++) {
      const userId = `u${i}`;
      const out = claimCohortSpot({
        userId,
        now: NOW,
        internal: internalIds.includes(userId),
        members,
        subscriptions,
      });
      expect(out.status).toBe("claimed");
      members = out.members;
      subscriptions = out.subscriptions;
    }
    return { members, subscriptions };
  }

  it("stops at the cap and does not count internal accounts", () => {
    const full = fill(20);
    expect(claimCohortSpot({ userId: "late", now: NOW, members: full.members, subscriptions: full.subscriptions }).status)
      .toBe("full");
    const internal = claimCohortSpot({
      userId: "staff",
      now: NOW,
      internal: true,
      members: full.members,
      subscriptions: full.subscriptions,
    });
    expect(internal.status).toBe("claimed");
    expect(internal.spotsLeft).toBe(0);
    expect(claimCohortSpot({
      userId: "later",
      now: NOW,
      members: internal.members,
      subscriptions: internal.subscriptions,
    }).status).toBe("full");
  });

  it("reads the cap from PULSERN_CLINICAL_SPOTS and defaults to 20", () => {
    expect(clinicalSpotCap(undefined)).toBe(20);
    expect(clinicalSpotCap("")).toBe(20);
    expect(clinicalSpotCap("8")).toBe(8);
    const eight = fill(8);
    expect(claimCohortSpot({ userId: "ninth", now: NOW, cap: 8, members: eight.members, subscriptions: eight.subscriptions }).status)
      .toBe("full");
  });

  it("is idempotent and never shortens a pass that already runs longer", () => {
    const first = claimCohortSpot({
      userId: "u",
      now: NOW,
      subscriptions: [pass({ expires_at: at(2) })],
    });
    expect(first.status).toBe("claimed");
    expect(first.expiresAt).toBe(at(30));
    expect(first.subscriptions[0]).toMatchObject({
      plan: "pass1",
      exams_granted: 0,
      price_cents: 0,
      starts_at: at(-1),
    });
    const again = claimCohortSpot({
      userId: "u",
      now: NOW + 10 * DAY,
      members: first.members,
      subscriptions: first.subscriptions,
    });
    expect(again.status).toBe("already");
    expect(again.members).toHaveLength(1);
    expect(again.subscriptions[0].expires_at).toBe(first.expiresAt);

    const longer = claimCohortSpot({
      userId: "long",
      now: NOW,
      subscriptions: [pass({ user_id: "long", expires_at: at(40) })],
    });
    expect(longer.expiresAt).toBe(at(40));
  });

  it("opens a 30-day pass when the account does not have one yet", () => {
    const out = claimCohortSpot({ userId: "new", now: NOW });
    expect(out.subscriptions).toEqual([expect.objectContaining({
      user_id: "new",
      plan: "pass1",
      expires_at: at(30),
      exams_granted: 0,
      price_cents: 0,
    })]);
  });

  it("refuses paid plans and owner comps", () => {
    const paid = claimCohortSpot({
      userId: "paid",
      now: NOW,
      subscriptions: [{ user_id: "paid", plan: "sub30", expires_at: at(10), price_cents: 9900, exams_granted: 1 }],
    });
    expect(paid.status).toBe("ineligible");
    expect(paid.members).toHaveLength(0);
    const comp = claimCohortSpot({
      userId: "comp",
      now: NOW,
      subscriptions: [pass({ user_id: "comp", discount_code: "OWNER_COMP" })],
    });
    expect(comp.status).toBe("ineligible");
    expect(comp.subscriptions[0].expires_at).toBe(at(6));
  });

  it("matches the migration: advisory lock, cap, internal accounts, no shortening", () => {
    const sql = readFileSync(new URL("../supabase/migrations/019_clinical_cohort.sql", import.meta.url), "utf8");
    expect(sql).toContain("create table if not exists public.cohort_members");
    expect(sql).toContain("public.claim_cohort_spot");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("internal_accounts");
    expect(sql).toContain("p_cap integer default 20");
    expect(sql).toContain("interval '30 days'");
    expect(sql).toContain("plan = 'pass1'");
    expect(sql).toContain("OWNER_COMP");
    expect(sql).toContain("s.plan <> 'pass1'");
    expect(sql).toContain("v_pass.expires_at < v_target");
    expect(sql).toContain("security definer");
    expect(sql).toMatch(/revoke all on function public\.claim_cohort_spot\(uuid, text, integer, text\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.claim_cohort_spot\(uuid, text, integer, text\) to service_role, postgres/);
    const already = sql.indexOf("'already'");
    const extend = sql.search(/update\s+public\.subscriptions/i);
    expect(already).toBeGreaterThan(-1);
    expect(extend).toBeGreaterThan(already);
  });
});

describe("checkout", () => {
  const stripeCalls = [];

  beforeEach(() => {
    stripeCalls.length = 0;
    vi.stubGlobal("fetch", async (url, opts) => {
      stripeCalls.push({ url, body: opts.body });
      return { ok: true, json: async () => ({ url: "https://checkout.stripe.test/session" }) };
    });
  });

  function seed({ members = [], codes = [], claim = async () => ({ ok: true, status: "claimed", member: true }) } = {}) {
    const db = fakeSupabase(
      {
        cohort_members: members,
        discount_codes: codes,
        subscriptions: [],
        exam_attempts: [],
      },
      {
        users: { tok: { id: "student", email: "student@example.com" } },
        rpc: { claim_cohort_spot: claim },
      },
    );
    globalThis.__pulsernBillingDb = db;
    return db;
  }

  async function post(body) {
    const { default: handler } = await import("../api/billing.js");
    const res = fakeRes();
    await handler({ method: "POST", body: { token: "tok", ...body } }, res);
    return res;
  }

  function params() {
    expect(stripeCalls).toHaveLength(1);
    return new URLSearchParams(stripeCalls[0].body);
  }

  it("charges cohort members $40 once for the 30-day pass and leaves every other price alone", async () => {
    seed({ members: [{ user_id: "student", cohort: "clinicals" }] });
    const res = await post({ action: "checkout", plan: "sub30" });
    expect(res.code).toBe(200);
    const form = params();
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("4000");
    expect(form.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(form.get("line_items[0][price]")).toBeNull();
    expect(form.get("metadata[code]")).toBe("CLINICALS");
    expect(form.get("metadata[cohort]")).toBe("clinicals");
    expect(form.get("metadata[plan]")).toBe("sub30");
    expect(form.get("metadata[amount]")).toBe("4000");
    expect(form.get("success_url")).toBe("https://www.pulsern.app/app/?checkout=success");

    stripeCalls.length = 0;
    const other = await post({ action: "checkout", plan: "sub60" });
    expect(other.code).toBe(200);
    const sixty = new URLSearchParams(stripeCalls[0].body);
    expect(sixty.get("line_items[0][price_data][unit_amount]")).toBe("15900");
    expect(sixty.get("metadata[cohort]")).toBeNull();
    expect(sixty.get("metadata[code]")).toBe("");
    expect(planById("pass1")).toMatchObject({ days: 7, cents: 0, exams: 0 });
    expect(planById("sub30").cents).toBe(9900);
    expect(CLINICAL_SUB30_CENTS).toBe(4000);
    expect((await post({ action: "checkout", plan: "pass1" })).code).toBe(400);
  });

  it("keeps the standard $99 price for a student who is not in the cohort", async () => {
    seed();
    const res = await post({ action: "checkout", plan: "sub30" });
    expect(res.code).toBe(200);
    expect(params().get("line_items[0][price_data][unit_amount]")).toBe("9900");
    expect(params().get("metadata[cohort]")).toBeNull();
    expect(globalThis.__pulsernBillingDb.rpcCalls).toHaveLength(0);
  });

  it("lets CLINICALS in the paywall box join the same cohort", async () => {
    seed();
    const check = await post({ action: "code-check", code: "clinicals" });
    expect(check.code).toBe(200);
    expect(check.body).toMatchObject({ code: "CLINICALS", cohort: "clinicals" });
    expect(check.body.prices.sub30).toBe(4000);
    expect(check.body.prices.sub60).toBe(15900);
    expect(globalThis.__pulsernBillingDb.rpcCalls.at(-1)).toMatchObject({
      name: "claim_cohort_spot",
      args: { p_user_id: "student", p_cohort: "clinicals", p_cap: 20, p_source: "code" },
    });

    stripeCalls.length = 0;
    const buy = await post({ action: "checkout", plan: "sub30", code: "CLINICALS" });
    expect(buy.code).toBe(200);
    expect(params().get("line_items[0][price_data][unit_amount]")).toBe("4000");
    expect(params().get("metadata[code]")).toBe("CLINICALS");
    expect(params().get("metadata[cohort]")).toBe("clinicals");
  });

  it("does not price the backup code at $40 once the cap is full", async () => {
    seed({ claim: async () => ({ ok: false, status: "full", member: false }) });
    const res = await post({ action: "checkout", plan: "sub30", code: "CLINICALS" });
    expect(res.code).toBe(409);
    expect(stripeCalls).toHaveLength(0);
    expect((await post({ action: "code-check", code: "CLINICALS" })).code).toBe(409);
  });

  it("claims for the signed-in user, not an id in the body", async () => {
    seed({ claim: async () => ({ ok: true, status: "claimed", member: true }) });
    const res = await post({ action: "clinical-claim", cohort: "clinicals", userId: "someone-else" });
    expect(res.code).toBe(200);
    expect(res.body.status).toBe("claimed");
    expect(globalThis.__pulsernBillingDb.rpcCalls[0].args.p_user_id).toBe("student");
    expect(globalThis.__pulsernBillingDb.rpcCalls[0].args.p_source).toBe("link");
  });

  it("still applies an ordinary partner code to a non-member", async () => {
    seed({ codes: [{ code: "PARTNER", partner: "Skills lab", amount_off_cents: 3000, active: true }] });
    const res = await post({ action: "checkout", plan: "sub30", code: "partner" });
    expect(res.code).toBe(200);
    expect(params().get("line_items[0][price_data][unit_amount]")).toBe("6900");
    expect(params().get("metadata[code]")).toBe("PARTNER");
    expect(params().get("metadata[cohort]")).toBeNull();
  });
});

describe("cohort funnel and offers", () => {
  const rows = [
    { user_id: "a", event: "signup" },
    { user_id: "b", event: "signup" },
    { user_id: "staff", event: "signup" },
    { user_id: "outsider", event: "signup" },
    { user_id: "a", event: "trial_start" },
    { user_id: "b", event: "trial_start" },
    { user_id: "a", event: "first_answer" },
    { user_id: "a", event: "activated" },
    { user_id: "a", event: "purchase", props: { cents: 4000 } },
    { user_id: "b", event: "purchase", props: { cents: 4000, internal: true } },
    { user_id: "staff", event: "purchase", props: { cents: 9900 } },
  ];
  const report = buildFunnelReport({
    rows,
    attrRows: [],
    windowDays: 30,
    cohortCap: 20,
    internalUserIds: ["staff"],
    cohortMembers: [
      { user_id: "a", cohort: "clinicals" },
      { user_id: "b", cohort: "clinicals" },
      { user_id: "staff", cohort: "clinicals" },
    ],
  });

  it("counts members, spots left, the step chain, and clinical revenue", () => {
    const cohort = report.cohorts[0];
    expect(cohort.cohort).toBe("clinicals");
    expect(cohort.members).toBe(2);
    expect(cohort.spotsLeft).toBe(18);
    expect(cohort.steps.map((s) => [s.key, s.people])).toEqual([
      ["signup", 2],
      ["trial_start", 2],
      ["first_answer", 1],
      ["activated", 1],
      ["purchase", 1],
    ]);
    expect(cohort.revenueUsd).toBe(40);
    expect(JSON.stringify(cohort)).not.toContain("staff");
  });

  it("publishes an offers summary without student identifiers", () => {
    const payload = buildMarketingPayload({
      funnel: report,
      counts: { questions: 10, cases: 1, flashcards: 1 },
      byCategory: {},
      windowDays: 30,
    });
    expect(payload.offers).toEqual([expect.objectContaining({
      id: "clinicals",
      code: "CLINICALS",
      members: 2,
      spotsLeft: 18,
      trialDays: 30,
      sub30Cents: 4000,
      listCents: 9900,
      revenueUsd: 40,
      path: "/clinicals",
    })]);
    expect(JSON.stringify(payload.offers)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(JSON.stringify(payload.offers)).not.toContain("\"a\"");
  });
});

describe("signup perk and the install step", () => {
  it("shows the perk and the post-account install note, not the pre-signup banner", () => {
    browser({ href: "https://www.pulsern.app/app/sign-up?cohort=clinicals" });
    const html = renderToStaticMarkup(createElement(AuthScreen, { initialMode: "signup", cohort: "clinicals" }))
      .replace(/&#x27;/g, "'");
    expect(html).toContain(CLINICAL_COPY.perkTitle);
    expect(html).toContain("$40");
    expect(html).toContain("$99");
    expect(html).toContain("Limited spots");
    expect(html).toContain(CLINICAL_COPY.installNote);
    expect(html).not.toContain("Install the PulseRN study app");
  });

  it("keeps the ordinary install card when this is not the clinical link", () => {
    browser({ href: "https://www.pulsern.app/app/sign-up" });
    const html = renderToStaticMarkup(createElement(AuthScreen, { initialMode: "signup" }));
    expect(html).toContain("Install the PulseRN study app");
    expect(html).not.toContain(CLINICAL_COPY.installNote);
  });

  it("speaks as a working hospital RN and does not promise a pass", () => {
    const text = Object.values(CLINICAL_COPY).join(" ");
    expect(text).toMatch(/working hospital RN/i);
    expect(text).not.toMatch(/guarantee|you'?ll pass|you will pass|might|as an ai|i think/i);
    expect(text).not.toMatch(/\b(mercy|cedars|mayo|johns hopkins|icu|med-surg)\b/i);
  });

  it("shows the one-time welcome with the right install step, then not again", () => {
    const storage = memoryStorage();
    const href = "https://www.pulsern.app/app/sign-up?cohort=clinicals&utm_source=clinicals#access_token=abc";
    const first = completeClinicalClaim({ status: "claimed", href, storage, standalone: false });
    expect(first.showWelcome).toBe(true);
    expect(first.path).toBe("/app/?utm_source=clinicals#access_token=abc");
    expect(first.path).not.toContain("cohort=");
    dismissClinicalWelcome(storage);
    const second = completeClinicalClaim({ status: "already", href, storage, standalone: false });
    expect(second.showWelcome).toBe(false);
    expect(storage.getItem(CLINICAL_WELCOME_DISMISSED)).toBe("1");
    expect(storage.getItem(CLINICAL_WELCOME_PENDING)).toBeNull();

    const installed = memoryStorage();
    expect(completeClinicalClaim({ status: "claimed", href, storage: installed, standalone: true }).showWelcome).toBe(false);
    expect(installed.getItem(CLINICAL_WELCOME_DISMISSED)).toBe("1");
  });

  it("uses the native prompt on Android Chrome", () => {
    browser({ ua: ANDROID_CHROME });
    noteInstallPrompt({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({ outcome: "accepted" }) });
    const html = renderToStaticMarkup(createElement(ClinicalWelcome, { onStart() {} }));
    expect(detectPlatform(globalThis.navigator)).toBe("android");
    expect(html).toContain(CLINICAL_COPY.welcomeTitle);
    expect(html).toContain("Add to home screen");
    expect(html).toContain(CLINICAL_COPY.startLabel);
    expect(html).not.toContain("Install app");
  });

  it("tells iPhone Safari to tap Share, then Add to Home Screen", () => {
    browser({ ua: IPHONE_SAFARI });
    const html = renderToStaticMarkup(createElement(InstallCard, { scope: "clinical" }));
    expect(detectPlatform(globalThis.navigator)).toBe("ios-safari");
    expect(html).toContain("Share");
    expect(html).toContain("Add to Home Screen");
    expect(html).toMatch(/Tap/);
  });

  it("tells iPhone Chrome and Firefox to open in Safari", () => {
    for (const ua of [IPHONE_CHROME, IPHONE_FIREFOX]) {
      browser({ ua });
      const html = renderToStaticMarkup(createElement(ClinicalWelcome, { onStart() {} }));
      expect(detectPlatform(globalThis.navigator)).toBe("ios-other");
      expect(html.toLowerCase()).toContain("in safari");
      expect(html).toContain("Add to Home Screen");
      expect(html).toContain(CLINICAL_COPY.startLabel);
    }
  });

  it("does not render the welcome or the install card inside the installed app", () => {
    browser({ ua: IPHONE_SAFARI, standalone: true });
    expect(isStandalone()).toBe(true);
    expect(renderToStaticMarkup(createElement(ClinicalWelcome, { onStart() {} }))).toBe("");
    expect(renderToStaticMarkup(createElement(InstallCard, { scope: "clinical" }))).toBe("");
  });
});
