#!/usr/bin/env node
/* End-to-end signup test against PRODUCTION.
   ------------------------------------------------------------------
   Drives a real browser through the real sign-up form on www.pulsern.app and
   checks what a student actually experiences, not what the code implies. Every
   defect this is aimed at was invisible from the source: the owner dashboard
   died from a JavaScript error that looked like "the button does nothing", and
   the confirm-your-email wall was a Supabase setting, not a line of code.

   It creates a genuine account on a @pulsern.dev address, which the funnel
   already treats as internal, so the run cannot inflate signup numbers. The
   address is printed at the end for cleanup.

   Usage: node ops/test-signup-flow.mjs
   Env:   none required. SUPABASE_SERVICE_ROLE_KEY (+ SUPABASE_URL) unlocks one
          extra check: that the new account really exists and is confirmed. */

import { launchBrowser } from "./browser.mjs";

const SITE = process.env.PULSERN_SITE || "https://www.pulsern.app";
const stamp = Date.now();
const EMAIL = `pulsern.e2e.${stamp}@pulsern.dev`;
const PASSWORD = `Test-${stamp}-aA1!`;

const steps = [];
const record = (ok, label, detail = "") => {
  steps.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};
const skip = (label, why) => console.log(`SKIP  ${label} — ${why}`);

const SHOT = process.env.PULSERN_SHOT_DIR || "/tmp";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

/* Anything the page logs is worth seeing. A silent JS error is exactly how the
   owner dashboard died, and from outside it just looked like a dead button. */
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text()); });

let userId = null;

try {
  /* ---------- 1. the form loads at all ---------- */
  const t0 = Date.now();
  await page.goto(`${SITE}/app/sign-up`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  record(true, "Sign-up form reachable", `${Date.now() - t0}ms`);

  /* The form must OPEN in signup mode. Landing a student who clicked "start
     free" on a sign-in form is the friction that loses them before they type. */
  const createBtn = page.getByRole("button", { name: /^create account$/i });
  record(await createBtn.count() > 0, "Opens in sign-up mode, not sign-in");

  /* ---------- 2. the typo suggestion a lost signup needed ---------- */
  await page.fill('input[type="email"]', "someone@yaoo.com");
  await page.waitForTimeout(300);
  const typo = await page.getByText(/did you mean/i).count();
  record(typo > 0, "Email typo is caught before submit",
    typo > 0 ? "offers a correction" : "no suggestion shown");

  /* ---------- 3. sign up for real ---------- */
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  const t1 = Date.now();
  await createBtn.first().click();

  /* The whole point of switching email confirmation off: a student should land
     IN the app, not on a "check your email" notice. Wait for either outcome
     rather than assuming, so a regression reports what actually happened. */
  const landedIn = await page
    .waitForSelector("text=/Today|Practice|Case Study|Cards|Stats/i", { timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  const elapsed = Date.now() - t1;

  const bodyText = (await page.innerText("body").catch(() => "")) ?? "";
  const askedToConfirm = /confirm your email|check your (inbox|email)/i.test(bodyText);
  const sawRawThrottle = /for security purposes/i.test(bodyText);

  record(landedIn, "Lands straight in the app after signing up",
    landedIn ? `${elapsed}ms, no confirmation step` : `did not reach the study screen: ${bodyText.slice(0, 160).replace(/\s+/g, " ")}`);
  record(!askedToConfirm, "Not asked to confirm an email first",
    askedToConfirm ? "still showing a confirm-your-email notice" : "");
  record(!sawRawThrottle, "No raw 'for security purposes' wording shown");

  /* The session is what carries the student across a reload. If signup lands
     them in the app but leaves no session, they are signed out the moment they
     close the tab — which reads as "it forgot me" and never gets reported. */
  const session = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(k)) { try { return JSON.parse(localStorage.getItem(k)); } catch { return "unparsable"; } }
    }
    return null;
  }).catch(() => null);
  userId = session?.user?.id ?? null;
  record(!!userId, "Session persists so a reload stays signed in",
    userId ? `user ${userId.slice(0, 8)}…` : "no auth token in storage");

  /* ---------- 4. the free pass starts itself ---------- */
  /* The funnel's worst number was people who signed up and never started a free
     pass, so the app now grants it at first sign-in instead of asking. If that
     grant silently fails the student sees a paywall seconds after signing up,
     and the funnel reports the same gap all over again. */
  await page.getByRole("button", { name: /^skip$/i }).click().catch(() => {});
  const passOn = await page.getByText(/free pass/i).first()
    .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  record(passOn, "Free pass starts automatically, nothing to click",
    passOn ? "full study access from the first screen" : "no free pass shown after signup");

  await page.screenshot({ path: `${SHOT}/signup-result.png`, fullPage: false }).catch(() => {});

  /* An error here is not cosmetic: the last one took the whole owner dashboard
     down while every page still returned HTTP 200. */
  record(pageErrors.length === 0, "No JavaScript errors on the way through",
    pageErrors.length ? pageErrors.slice(0, 3).join(" | ") : "");
  /* ---------- 5. signing up twice says something human ---------- */
  /* A returning student who forgets they have an account is a customer, not an
     error. Supabase's own wording for this is "User already registered", which
     reads as a rejection; the screen should offer them the way in instead. */
  const second = await browser.newPage({ viewport: { width: 420, height: 900 } });
  try {
    await second.goto(`${SITE}/app/sign-up`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await second.waitForSelector('input[type="email"]', { timeout: 20000 });
    await second.fill('input[type="email"]', EMAIL);
    await second.fill('input[type="password"]', PASSWORD);
    await second.getByRole("button", { name: /^create account$/i }).first().click();
    await second.waitForTimeout(6000);
    const t = ((await second.innerText("body")) ?? "").replace(/\s+/g, " ");
    const raw = /user already registered|invalid login credentials|for security purposes|AuthApiError/i.test(t);
    /* Absence of a raw error is not enough — a screen that says nothing at all
       would pass that. It has to actually point them at the way in. */
    const helped = /already has an account/i.test(t) && /sign in/i.test(t);
    record(!raw && helped, "Repeat signup is answered in plain English",
      raw ? `raw error shown: ${t.match(/[^.]*(already registered|security purposes|Invalid login)[^.]*/i)?.[0]?.trim()}`
          : helped ? "offers sign-in and the passwordless link" : "no guidance shown at all");
  } finally {
    await second.close();
  }
} catch (e) {
  record(false, "Flow crashed", e.message.split("\n")[0]);
  await page.screenshot({ path: `${SHOT}/signup-result.png` }).catch(() => {});
} finally {
  await browser.close();
}

/* ---------- 4. the account really exists, server-side ---------- */
/* The browser can only show what the page chose to render. This asks the
   database, which is the only source that settles whether the account is real
   and whether it is confirmed. Optional, because the test is useful without
   credentials and must not fail merely for lacking them. */
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(EMAIL)}`,
      { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
                   Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
    const body = await r.json();
    const user = body?.users?.find((u) => u.email === EMAIL);
    record(!!user, "Account exists in Supabase", user ? user.id : `admin lookup returned ${r.status}`);
    if (user) {
      record(!!(user.email_confirmed_at || user.confirmed_at),
        "Account is already confirmed — no email needed",
        user.email_confirmed_at || user.confirmed_at || "still unconfirmed");
    }
  } catch (e) {
    skip("Supabase account check", e.message);
  }
} else {
  skip("Supabase account check", "SUPABASE_SERVICE_ROLE_KEY not set in this shell");
}

const failed = steps.filter((s) => !s.ok);
console.log(`\n${steps.length - failed.length}/${steps.length} checks passed`);
console.log(`Test account: ${EMAIL}${userId ? `  (id ${userId})` : ""}`);
if (failed.length) process.exit(1);
