/* Owner-only acquisition funnel. Never public.

   The question this answers is not "how many users do we have" but "can we
   safely spend on ads" — which needs conversion rates between named steps and
   a cost per activated student, not a vanity total.

   Every number is derived from product data (accounts, subscriptions, answer
   logs, Stripe-granted purchases) and stored once as a milestone, so a student
   resetting their progress cannot retroactively change last month's numbers.

   Gated on reviewers-table membership, the same gate as the review console and
   the health endpoint. This is commercial data about real people and no
   student has any reason to see it. */
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

/* The order matters: each step is a subset of the one above it, and the rates
   are only meaningful read as a chain. */
const STEPS = [
  { key: "signup", label: "Created an account" },
  { key: "trial_start", label: "Started the free pass" },
  { key: "first_answer", label: "Answered a question" },
  { key: "activated", label: "Activated (20 answers)" },
  { key: "purchase", label: "Paid" },
];

const pct = (n, of) => (of > 0 ? Math.round((n / of) * 1000) / 10 : 0);

/* A referring host is the useful part of a referrer; the full URL is noise in
   a table and can carry a query string we have no reason to store or show. */
const hostOf = (url) => { try { return new URL(url).host; } catch { return "referral"; } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { token, days } = req.body || {};
  if (!token) return res.status(401).json({ error: "Sign in first" });

  const sb = admin();
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Sign in first" });

  const { data: reviewer } = await sb
    .from("reviewers").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (!reviewer) return res.status(403).json({ error: "Owner access only" });

  /* A window is what makes this actionable: lifetime totals cannot tell you
     whether last week's spend worked. Default to 30 days; 0 means all time. */
  const window = Number.isFinite(Number(days)) ? Math.max(0, Math.floor(Number(days))) : 30;
  const since = window > 0 ? new Date(Date.now() - window * 86400_000).toISOString() : null;

  let q = sb.from("funnel_events").select("event, user_id, occurred_at, props");
  if (since) q = q.gte("occurred_at", since);
  const [{ data: rows, error }, { data: attrRows }] = await Promise.all([
    q,
    sb.from("user_attribution").select("user_id, utm_source, utm_medium, utm_campaign, referrer"),
  ]);
  if (error) return res.status(502).json({ error: `Could not read the funnel: ${error.message}` });

  /* First touch per user. A student with no tags and no external referrer is
     "direct" rather than missing: leaving them out would make the source table
     disagree with the funnel totals, which is how a report loses trust. */
  const sourceOf = new Map();
  for (const a of attrRows ?? []) {
    const label = a.utm_source
      ? (a.utm_campaign ? `${a.utm_source} / ${a.utm_campaign}` : a.utm_source)
      : (a.referrer ? hostOf(a.referrer) : "direct");
    sourceOf.set(a.user_id, label);
  }

  /* Count distinct people per step, not rows: one student buying twice is one
     converted student and two purchases, and conflating them inflates the
     conversion rate. Revenue counts every purchase. */
  const people = Object.fromEntries(STEPS.map((s) => [s.key, new Set()]));
  let purchases = 0;
  let cents = 0;
  let internalPurchases = 0;
  for (const r of rows ?? []) {
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
    (rows ?? []).filter((r) => r.event === "trial_end").map((r) => r.user_id)
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
  const bySource = [...bySourceMap.values()].sort((a, b) => b.signup - a.signup || b.purchase - a.purchase);

  return res.status(200).json({
    windowDays: window,
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
  });
}
