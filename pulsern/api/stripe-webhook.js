// api/stripe-webhook.js — the ONLY code path that grants paid subscriptions.
// Verifies Stripe's signature over the RAW request body, then inserts the
// subscription row with the service role. Configure the endpoint in Stripe
// as <site>/api/stripe-webhook with event checkout.session.completed and
// put the signing secret in STRIPE_WEBHOOK_SECRET.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { planById } from "../src/pricing.js";

export const config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifySignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false; // 10-min replay window
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(parts.v1, "hex"));
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const payload = (await rawBody(req)).toString("utf8");
  if (!verifySignature(payload, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET))
    return res.status(400).json({ error: "Bad signature" });

  let event;
  try { event = JSON.parse(payload); } catch { return res.status(400).json({ error: "Bad payload" }); }
  if (event.type !== "checkout.session.completed") return res.status(200).json({ ignored: true });

  const s = event.data?.object ?? {};
  const meta = s.metadata ?? {};
  const plan = planById(meta.plan);
  if (!plan || !meta.user_id || s.payment_status !== "paid")
    return res.status(200).json({ ignored: true });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Stacking: a purchase while active extends from the current expiry, an
  // exam add-on (days=0) rides on the current window without extending it.
  const { data: existing } = await sb.from("subscriptions")
    .select("expires_at").eq("user_id", meta.user_id).order("expires_at", { ascending: false }).limit(1);
  const base = Math.max(Date.now(), existing?.[0] ? new Date(existing[0].expires_at).getTime() : 0);
  const expires = plan.days > 0 ? new Date(base + plan.days * 24 * 3600 * 1000) : new Date(base);

  const { error } = await sb.from("subscriptions").insert({
    user_id: meta.user_id,
    plan: plan.id,
    expires_at: expires.toISOString(),
    exams_granted: plan.exams,
    price_cents: Number(meta.amount) || plan.cents,
    discount_code: meta.code || null,
    stripe_session: s.id,
  });
  // unique stripe_session makes webhook retries idempotent
  if (error && !String(error.message).includes("duplicate")) {
    console.error("grant failed", error);
    return res.status(500).json({ error: "grant failed" });
  }
  return res.status(200).json({ ok: true });
}
