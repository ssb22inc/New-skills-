/* Owner-only acquisition funnel. Never public.

   The arithmetic lives in src/funnel-report.js, shared with /api/marketing, so
   the owner dashboard and the marketing agent can never quote different
   numbers for the same window. This file is only the door: prove who is
   asking, fetch the rows, hand them to the shared reducer.

   Every number is derived from product data (accounts, subscriptions, answer
   logs, Stripe-granted purchases) and stored once as a milestone, so a student
   resetting their progress cannot retroactively change last month's numbers.

   Gated on reviewers-table membership, the same gate as the review console and
   the health endpoint. This is commercial data about real people and no
   student has any reason to see it. */
import { createClient } from "@supabase/supabase-js";
import { buildFunnelReport, windowFromDays, sinceFor } from "../src/funnel-report.js";

const admin = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

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
  const windowDays = windowFromDays(days);
  const since = sinceFor(windowDays);

  let q = sb.from("funnel_events").select("event, user_id, occurred_at, props");
  if (since) q = q.gte("occurred_at", since);
  const [{ data: rows, error }, { data: attrRows }] = await Promise.all([
    q,
    sb.from("user_attribution").select("user_id, utm_source, utm_medium, utm_campaign, referrer"),
  ]);
  if (error) return res.status(502).json({ error: `Could not read the funnel: ${error.message}` });

  return res.status(200).json(buildFunnelReport({ rows: rows ?? [], attrRows: attrRows ?? [], windowDays }));
}
