/* Free-pass length. The catalog row in pricing.js is the source of truth
   for new grants. This module is the same rule the 017 migration applies
   to rows that already exist, so the client, the tests, and the SQL stay
   on one definition.

   The plan id stays "pass1". It is the partial unique index and the funnel
   key; renaming it would orphan every existing row. */
import { planById } from "./pricing.js";

export const FREE_PASS_ID = "pass1";
/* The old insert policy allowed an expiry up to 25 hours out. 26 hours is
   that ceiling plus a little slack, and it is what migration 017 uses to
   recognize a pass that has not already been lengthened. */
export const LEGACY_FREE_PASS_MAX_MS = 26 * 60 * 60 * 1000;

export function freePassPlan() {
  const plan = planById(FREE_PASS_ID);
  if (!plan || plan.cents !== 0 || plan.exams !== 0 || plan.days < 1) {
    throw new Error("Free pass plan is misconfigured");
  }
  return plan;
}

export function freePassExpiresAt(now = Date.now()) {
  return new Date(now + freePassPlan().days * 24 * 60 * 60 * 1000).toISOString();
}

/* What to do with one existing pass1 row.
   hasOtherPlan means this user has any non-pass1 subscription (paid or
   comp). Those accounts are left exactly as they are.
   Returned expiresAt is the value the migration writes. "leave" means the
   row already matches the rule, so a second run changes nothing. */
export function adjustUnpaidFreePass(row, { hasOtherPlan = false, now = Date.now() } = {}) {
  if (!row || row.plan !== FREE_PASS_ID) return { action: "leave", reason: "not-free-pass" };
  if (hasOtherPlan) return { action: "leave", reason: "paid-or-other-plan" };
  if ((row.exams_granted || 0) !== 0 || (row.price_cents || 0) !== 0) {
    return { action: "leave", reason: "not-a-free-row" };
  }
  const start = new Date(row.starts_at).getTime();
  const exp = new Date(row.expires_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(exp)) return { action: "leave", reason: "bad-dates" };
  const days = freePassPlan().days;
  const fromStart = start + days * 24 * 60 * 60 * 1000;
  if (exp > now && exp < fromStart) {
    return { action: "extend-from-start", expiresAt: new Date(fromStart).toISOString() };
  }
  if (exp <= now && exp <= start + LEGACY_FREE_PASS_MAX_MS) {
    return { action: "refresh-from-now", expiresAt: freePassExpiresAt(now) };
  }
  return { action: "leave", reason: "already-aligned" };
}
