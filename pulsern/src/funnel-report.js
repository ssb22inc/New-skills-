/* The acquisition funnel, as arithmetic.
   ------------------------------------------------------------------
   Lifted out of api/funnel.js so that every caller computes it ONE way. The
   owner dashboard and the marketing agent now read the same numbers from the
   same code: if they could drift, the first anyone would notice is an argument
   about which figure is right while ad money is being spent against one of
   them.

   Everything here is pure — rows in, report out. No database, no credentials,
   no request. That is what lets the real implementation be unit-tested instead
   of a copy of it that can quietly fall out of step with what ships.

   The question it answers is not "how many users do we have" but "can we
   safely spend on ads", which needs conversion rates between named steps and a
   cost per activated student, not a vanity total. */

/* The order matters: each step is a subset of the one above it, and the rates
   are only meaningful read as a chain. */
export const STEPS = [
  { key: "signup", label: "Created an account" },
  { key: "trial_start", label: "Started the free pass" },
  { key: "first_answer", label: "Answered a question" },
  { key: "activated", label: "Activated (20 answers)" },
  { key: "purchase", label: "Paid" },
];

export const pct = (n, of) => (of > 0 ? Math.round((n / of) * 1000) / 10 : 0);

/* A referring host is the useful part of a referrer; the full URL is noise in
   a table and can carry a query string we have no reason to store or show. */
export const hostOf = (url) => { try { return new URL(url).host; } catch { return "referral"; } };

/* First touch per user. A student with no tags and no external referrer is
   "direct" rather than missing: leaving them out would make the source table
   disagree with the funnel totals, which is how a report loses trust. */
export function sourceIndex(attrRows) {
  const sourceOf = new Map();
  for (const a of attrRows ?? []) {
    const label = a.utm_source
      ? (a.utm_campaign ? `${a.utm_source} / ${a.utm_campaign}` : a.utm_source)
      : (a.referrer ? hostOf(a.referrer) : "direct");
    sourceOf.set(a.user_id, label);
  }
  return sourceOf;
}

export function buildFunnelReport({ rows = [], attrRows = [], windowDays = 30 } = {}) {
  const sourceOf = sourceIndex(attrRows);

  /* Count distinct people per step, not rows: one student buying twice is one
     converted student and two purchases, and conflating them inflates the
     conversion rate. Revenue counts every purchase. */
  const people = Object.fromEntries(STEPS.map((s) => [s.key, new Set()]));
  let purchases = 0;
  let cents = 0;
  let internalPurchases = 0;
  for (const r of rows) {
    /* Owner comps and launch-check transactions are real Stripe rows but not
       customers. Counting them as conversions is how a product convinces
       itself it has demand it has not got, which is the most expensive
       mistake available when the next step is buying ads. */
    if (r.event === "purchase" && r.props?.internal === true) {
      internalPurchases += 1;
      continue;
    }
    people[r.event]?.add(r.user_id);
    if (r.event === "purchase") {
      purchases += 1;
      cents += Number(r.props?.cents) || 0;
    }
  }

  const top = people.signup.size;
  const steps = STEPS.map((s, i) => {
    const n = people[s.key].size;
    const prevKey = STEPS[i - 1]?.key;
    const prev = prevKey ? people[prevKey].size : n;
    return {
      key: s.key,
      label: s.label,
      people: n,
      ofSignups: pct(n, top),
      ofPrevious: i === 0 ? 100 : pct(n, prev),
      // Where students are lost. The biggest number here is where to spend
      // effort, and it is the reason the chain is reported rather than a total.
      lostHere: i === 0 ? 0 : Math.max(0, prev - n),
    };
  });

  const activated = people.activated.size;
  const paid = people.purchase.size;

  /* Trial ends are counted but deliberately kept OUT of the step chain. Every
     trial ends eventually, so it is not a stage someone fails to reach, and
     slotting it between two real steps would make the "lost here" figures
     below it meaningless. It belongs beside the funnel, not inside it. */
  const trialsEnded = new Set(
    rows.filter((r) => r.event === "trial_end").map((r) => r.user_id)
  ).size;

  /* Signups, activations and sales per first-touch source. These three are
     what an ad decision turns on: traffic that signs up but never activates is
     the wrong traffic, and traffic that activates but never buys is the wrong
     offer. Reported only for the steps that carry that meaning, rather than
     every step, so the table stays readable. */
  const bySourceMap = new Map();
  const bump = (uid, key) => {
    const src = sourceOf.get(uid) ?? "direct";
    const row = bySourceMap.get(src) ?? { source: src, signup: 0, activated: 0, purchase: 0 };
    row[key] += 1;
    bySourceMap.set(src, row);
  };
  for (const key of ["signup", "activated", "purchase"]) {
    for (const uid of people[key]) bump(uid, key);
  }
  const bySource = [...bySourceMap.values()]
    .sort((a, b) => b.signup - a.signup || b.purchase - a.purchase);

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    steps,
    bySource,
    trialsEnded,
    revenue: { purchases, cents, usd: Math.round(cents) / 100, excludedInternal: internalPurchases },
    /* The numbers an ad budget is actually judged against. Break-even CAC is
       what you may pay for one activated student before the spend stops paying
       for itself, given how many activated students go on to buy and what they
       spend. It is null until there is a purchase to base it on — an invented
       figure here would be worse than none. */
    unitEconomics: {
      activatedToPaid: pct(paid, activated),
      revenuePerActivatedUsd: activated > 0 ? Math.round(cents / activated) / 100 : null,
      breakEvenCacPerActivatedUsd: activated > 0 && paid > 0 ? Math.round(cents / activated) / 100 : null,
      note: paid === 0
        ? (internalPurchases > 0
            ? `No customer purchases in this window. ${internalPurchases} internal transaction(s) (owner comps or launch checks) were excluded, because treating them as demand is how a product talks itself into an ad budget it cannot justify.`
            : "No purchases in this window, so there is nothing to judge ad spend against yet. Widen the window or wait for a sale before committing a budget.")
        : "Paying more than the break-even figure for one activated student loses money at current conversion.",
    },
  };
}

/* One place decides what a window means, so /api/funnel and /api/marketing
   cannot answer "last 30 days" differently. 0 means all time. */
export function windowFromDays(days, fallback = 30) {
  const n = Number(days);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

export const sinceFor = (windowDays) =>
  windowDays > 0 ? new Date(Date.now() - windowDays * 86400_000).toISOString() : null;
