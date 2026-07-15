/* PulseRN subscription packages — the single source of truth for pricing.
   Used by the paywall UI and by api/billing.js (server recomputes every
   price; the client never sends an amount). Owner-set prices, 2026-07-15. */

export const PLANS = [
  { id: "pass1",  name: "1-Day Free Pass", days: 1,   cents: 0,     exams: 0, blurb: "Unlimited access to all study content for 24 hours. Readiness exams not included." },
  { id: "sub30",  name: "30-Day",          days: 30,  cents: 9900,  exams: 1, blurb: "Full unlimited access · 1 readiness self-assessment" },
  { id: "sub60",  name: "60-Day",          days: 60,  cents: 15900, exams: 2, blurb: "3,100+ practice questions · 2 self-assessments" },
  { id: "sub90",  name: "90-Day",          days: 90,  cents: 21900, exams: 3, blurb: "3,100+ practice questions · 3 self-assessments" },
  { id: "sub180", name: "180-Day",         days: 180, cents: 31900, exams: 4, blurb: "3,201+ practice questions · 4 self-assessments" },
  { id: "sub360", name: "360-Day",         days: 360, cents: 37900, exams: 5, blurb: "3,401+ practice questions · 5 self-assessments" },
  { id: "sub730", name: "730-Day",         days: 730, cents: 43900, exams: 6, blurb: "3,401+ practice questions · 6 self-assessments" },
  /* Post-subscription add-ons */
  { id: "renew7", name: "7-Day Renewal",   days: 7,   cents: 4500,  exams: 0, addon: true, blurb: "Need a little more time? Full content access — no new self-assessment." },
  { id: "exam1",  name: "Extra Self-Assessment", days: 0, cents: 4500, exams: 1, addon: true, blurb: "One more never-seen readiness exam on your current subscription." },
];

export const planById = (id) => PLANS.find((p) => p.id === id) ?? null;

/* Discount codes: fixed amount off or percent off, whichever the code
   carries. Server-side validation only — this just does the math. */
export function discountedCents(cents, code) {
  if (!code) return cents;
  if (code.amount_off_cents) return Math.max(0, cents - code.amount_off_cents);
  if (code.percent_off) return Math.max(0, Math.round(cents * (100 - code.percent_off) / 100));
  return cents;
}

export const fmtUsd = (cents) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

/* Entitlement, computed from the user's subscription rows + exam attempts.
   Pure so it's unit-testable; rows come from RLS-scoped selects.
   - active: any row (trial or paid) whose window covers `now`
   - trial:  active but ONLY via the free pass → content yes, exams no
   - examsLeft: every exam ever granted minus every form ever started;
     starting a form is permanent — no account ever repeats an exam. */
export function computeEntitlement(subRows, attemptRows, now = Date.now()) {
  const rows = Array.isArray(subRows) ? subRows : [];
  const attempts = Array.isArray(attemptRows) ? attemptRows : [];
  // Active = not yet expired. Deliberately NO starts_at check: grants always
  // begin immediately, and starts_at is server-stamped while `now` is the
  // client clock — a client a second behind the server would see its
  // brand-new pass as "not started" and get locked out at signup.
  const activeRows = rows.filter((r) => new Date(r.expires_at).getTime() > now);
  const paidActive = activeRows.some((r) => r.plan !== "pass1");
  const active = activeRows.length > 0;
  const granted = rows.reduce((a, r) => a + (r.exams_granted || 0), 0);
  const attempted = attempts.map((a) => a.form);
  const expiresAt = activeRows.length
    ? new Date(Math.max(...activeRows.map((r) => new Date(r.expires_at).getTime())))
    : null;
  return {
    status: rows.length === 0 ? "none" : paidActive ? "active" : active ? "trial" : "expired",
    expiresAt,
    hadPaid: rows.some((r) => r.plan !== "pass1"),
    examsLeft: Math.max(0, granted - attempted.length),
    attempted,
  };
}
