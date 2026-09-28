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
  const { data: rows, error } = await q;
  if (error) return res.status(502).json({ error: `Could not read the funnel: ${error.message}` });

  /* Count distinct people per step, not rows: one student buying twice is one
     converted student and two purchases, and conflating them inflates the
     conversion rate. Revenue counts every purchase. */
  const people = Object.fromEntries(STEPS.map((s) => [s.key, new Set()]));
  let purchases = 0;
  let cents = 0;
  for (const r of rows ?? []) {
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

  return res.status(200).json({
    windowDays: window,
    generatedAt: new Date().toISOString(),
    steps,
    revenue: { purchases, cents, usd: Math.round(cents) / 100 },
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
        ? "No purchases in this window, so there is nothing to judge ad spend against yet. Widen the window or wait for a sale before committing a budget."
        : "Paying more than the break-even figure for one activated student loses money at current conversion.",
    },
  });
}
