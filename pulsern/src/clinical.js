/* Clinical-student perk.
   A hospital-clinicals link (/clinicals) and the backup code CLINICALS share
   one cohort: 30 days of free study, then $40 once for the 30-day pass
   (list price stays $99). The database function claim_cohort_spot is the
   lock that enforces the cap; claimCohortSpot below is the same rule, so
   the tests can prove it without a database. */
import { PLANS, planById } from "./pricing.js";

export const CLINICAL_COHORT = "clinicals";
export const CLINICAL_CODE = "CLINICALS";
export const CLINICAL_TRIAL_DAYS = 30;
export const CLINICAL_SUB30_CENTS = 4000;
export const CLINICAL_SPOTS_DEFAULT = 20;
export const CLINICAL_PASS_PLAN = "sub30";
export const CLINICAL_COHORT_KEY = "pulsern.cohort";
export const CLINICAL_WELCOME_PENDING = "pulsern.clinical.welcome.pending";
export const CLINICAL_WELCOME_DISMISSED = "pulsern.clinical.welcome.dismissed";

export const CLINICAL_FULL_MESSAGE = "Clinical student spots are full. The 30-day pass remains $99.";
export const CLINICAL_INELIGIBLE_MESSAGE = "The clinical student perk is for accounts that have not already purchased or been given a pass.";

export const CLINICAL_SIGNUP_PATH = "/app/sign-up?cohort=clinicals&utm_source=clinicals&utm_medium=in-person&utm_campaign=clinical-students";

/* Confident, specific, and quiet about anything we cannot know. No hospital
   or unit, and no promise about an exam result. */
export const CLINICAL_COPY = {
  perkEyebrow: "Clinical student perk",
  perkTitle: "30 days free",
  perkBody: "Then the 30-day pass is a one-time $40, normally $99. Limited spots. Built by a working hospital RN, for future RNs.",
  installNote: "After you create your account, you can add PulseRN straight to your phone's home screen",
  planNote: "Clinical student rate: the 30-day pass is $40 once.",
  welcomeTitle: "Your 30 free days are on",
  welcomeBody: "The full study library is open: adaptive questions, case studies, and flashcards. Add PulseRN to your home screen so it is one tap away. Built by a working hospital RN, for future RNs.",
  startLabel: "Start studying →",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function clinicalSpotCap(raw = process.env.PULSERN_CLINICAL_SPOTS) {
  if (raw == null || String(raw).trim() === "") return CLINICAL_SPOTS_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return CLINICAL_SPOTS_DEFAULT;
  return Math.floor(n);
}

export function isClinicalCode(raw) {
  return String(raw ?? "").trim().toUpperCase() === CLINICAL_CODE;
}

/* What the plan picker shows. Cohort members see $40 on the 30-day pass
   before checkout, including when they never type the backup code. A
   partner code still changes every other plan. */
export function planPriceCents(plan, { applied = null, clinicalMember = false } = {}) {
  const clinical = clinicalMember || applied?.cohort === CLINICAL_COHORT;
  if (clinical && plan?.id === CLINICAL_PASS_PLAN) return CLINICAL_SUB30_CENTS;
  if (applied?.cohort !== CLINICAL_COHORT && applied?.prices?.[plan?.id] != null) return applied.prices[plan.id];
  return plan.cents;
}

export function clinicalPrices() {
  return Object.fromEntries(
    PLANS.filter((p) => p.cents > 0).map((p) => [p.id, p.id === CLINICAL_PASS_PLAN ? CLINICAL_SUB30_CENTS : p.cents]),
  );
}

export function rememberCohort(storage) {
  try { storage?.setItem(CLINICAL_COHORT_KEY, CLINICAL_COHORT); } catch { /* private mode */ }
}

export function rememberedCohort(storage) {
  try {
    return storage?.getItem(CLINICAL_COHORT_KEY) === CLINICAL_COHORT ? CLINICAL_COHORT : null;
  } catch {
    return null;
  }
}

export function forgetCohort(storage) {
  try { storage?.removeItem(CLINICAL_COHORT_KEY); } catch { /* private mode */ }
}

/* Signed-in students live at /app/. stripCohort removes the perk param and
   leaves every other query value and the hash alone. */
export function signedInPath(href, appRoot = "/app/", { stripCohort = false } = {}) {
  const url = new URL(href);
  if (stripCohort) url.searchParams.delete("cohort");
  const search = url.searchParams.toString();
  return `${appRoot}${search ? `?${search}` : ""}${url.hash}`;
}

export function clinicalTrialExpiry(now) {
  return new Date(now + CLINICAL_TRIAL_DAYS * DAY_MS).toISOString();
}

function spotsLeft(members, cap) {
  const used = members.filter((m) => m.cohort === CLINICAL_COHORT && !m.internal).length;
  return Math.max(0, cap - used);
}

function paidOrComp(row) {
  if (!row) return false;
  if (row.plan !== "pass1") return true;
  if ((row.price_cents || 0) > 0) return true;
  return String(row.discount_code || "") === "OWNER_COMP";
}

/* One claim. Pure: it returns the next membership and subscription lists
   and does not mutate the ones it was given.
   - already: a second call does not take another spot and does not move
     the free-pass expiry (so it cannot shorten it, and it cannot stack).
   - ineligible: any paid plan or owner comp.
   - full: non-internal members are at the cap. Internal accounts are
     recorded and do not consume a spot.
   - claimed: membership is recorded and pass1 reaches 30 days from now
     when that is later than the expiry they already have. */
export function claimCohortSpot({
  userId,
  cohort = CLINICAL_COHORT,
  cap = CLINICAL_SPOTS_DEFAULT,
  source = "link",
  now = Date.now(),
  internal = false,
  members = [],
  subscriptions = [],
} = {}) {
  if (cohort !== CLINICAL_COHORT) {
    return { ok: false, status: "unknown", members, subscriptions, spotsLeft: null, expiresAt: null };
  }
  const mine = members.find((m) => m.user_id === userId && m.cohort === CLINICAL_COHORT);
  if (mine) {
    const row = subscriptions.find((s) => s.user_id === userId && s.plan === "pass1");
    return {
      ok: true,
      status: "already",
      members,
      subscriptions,
      spotsLeft: spotsLeft(members, cap),
      expiresAt: row?.expires_at ?? null,
    };
  }
  const rows = subscriptions.filter((s) => s.user_id === userId);
  if (rows.some(paidOrComp)) {
    return {
      ok: false,
      status: "ineligible",
      members,
      subscriptions,
      spotsLeft: spotsLeft(members, cap),
      expiresAt: null,
    };
  }
  if (!internal && spotsLeft(members, cap) <= 0) {
    return {
      ok: false,
      status: "full",
      members,
      subscriptions,
      spotsLeft: 0,
      expiresAt: null,
    };
  }
  const nextMembers = [
    ...members,
    {
      user_id: userId,
      cohort: CLINICAL_COHORT,
      source: source === "code" ? "code" : "link",
      claimed_at: new Date(now).toISOString(),
      internal: Boolean(internal),
    },
  ];
  const target = clinicalTrialExpiry(now);
  const index = subscriptions.findIndex((s) => s.user_id === userId && s.plan === "pass1");
  let nextSubs;
  let expiresAt;
  if (index === -1) {
    expiresAt = target;
    nextSubs = [
      ...subscriptions,
      {
        user_id: userId,
        plan: "pass1",
        starts_at: new Date(now).toISOString(),
        expires_at: target,
        exams_granted: 0,
        price_cents: 0,
        discount_code: null,
      },
    ];
  } else {
    const row = subscriptions[index];
    const current = new Date(row.expires_at).getTime();
    expiresAt = current >= new Date(target).getTime() ? row.expires_at : target;
    nextSubs = subscriptions.map((s, i) => (i === index ? { ...row, expires_at: expiresAt } : s));
  }
  return {
    ok: true,
    status: "claimed",
    members: nextMembers,
    subscriptions: nextSubs,
    spotsLeft: spotsLeft(nextMembers, cap),
    expiresAt,
  };
}

/* Welcome screen. Pending until they tap through, then never again.
   A phone that is already running the installed app does not get the
   screen: the icon is already on the home screen. */
export function completeClinicalClaim({ status, href, storage, standalone = false }) {
  const path = signedInPath(href, "/app/", { stripCohort: true });
  const dismissed = storage.getItem(CLINICAL_WELCOME_DISMISSED) === "1";
  /* "already" counts: a second tab can win the insert while this tab is
     still the one that should show the screen. Dismissal is what makes it
     one-time, not the difference between those two statuses. */
  if ((status === "claimed" || status === "already") && !dismissed) {
    storage.setItem(CLINICAL_WELCOME_PENDING, "1");
  }
  if (standalone) {
    storage.setItem(CLINICAL_WELCOME_DISMISSED, "1");
    storage.removeItem(CLINICAL_WELCOME_PENDING);
    return { showWelcome: false, path };
  }
  const pending = storage.getItem(CLINICAL_WELCOME_PENDING) === "1";
  return { showWelcome: pending && !dismissed, path };
}

export function dismissClinicalWelcome(storage) {
  storage.setItem(CLINICAL_WELCOME_DISMISSED, "1");
  storage.removeItem(CLINICAL_WELCOME_PENDING);
}

export function welcomeStillPending(storage, standalone = false) {
  if (standalone) return false;
  try {
    return storage.getItem(CLINICAL_WELCOME_PENDING) === "1"
      && storage.getItem(CLINICAL_WELCOME_DISMISSED) !== "1";
  } catch {
    return false;
  }
}

/* Cohort slice of the acquisition funnel. Members and spots are the live
   cap (internal accounts do not consume a spot). Steps and revenue count
   only those members, inside whatever event window the caller already
   applied, and they skip purchases flagged internal. */
export function buildCohortFunnels({
  members = [],
  events = [],
  internalUserIds = [],
  cap = CLINICAL_SPOTS_DEFAULT,
  steps = [],
} = {}) {
  const internal = new Set(internalUserIds);
  const ids = new Set(
    members
      .filter((m) => m.cohort === CLINICAL_COHORT && m.user_id && !internal.has(m.user_id))
      .map((m) => m.user_id),
  );
  const stepRows = steps.map((s) => ({
    key: s.key,
    label: s.label,
    people: new Set(
      events
        .filter((e) => e.event === s.key && ids.has(e.user_id) && !(e.event === "purchase" && e.props?.internal === true))
        .map((e) => e.user_id),
    ).size,
  }));
  let cents = 0;
  for (const e of events) {
    if (e.event !== "purchase" || !ids.has(e.user_id) || e.props?.internal === true) continue;
    cents += Number(e.props?.cents) || 0;
  }
  return [{
    cohort: CLINICAL_COHORT,
    members: ids.size,
    spotsLeft: Math.max(0, cap - ids.size),
    steps: stepRows,
    revenueUsd: Math.round(cents) / 100,
  }];
}

export function offerFromCohort(row) {
  if (!row || row.cohort !== CLINICAL_COHORT) return null;
  const list = planById(CLINICAL_PASS_PLAN);
  return {
    id: CLINICAL_COHORT,
    name: "Clinical students",
    code: CLINICAL_CODE,
    members: row.members,
    spotsLeft: row.spotsLeft,
    trialDays: CLINICAL_TRIAL_DAYS,
    sub30Cents: CLINICAL_SUB30_CENTS,
    listCents: list?.cents ?? 9900,
    revenueUsd: row.revenueUsd,
    path: "/clinicals",
  };
}
