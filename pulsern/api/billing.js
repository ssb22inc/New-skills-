// api/billing.js — subscription backend. The client sends an action plus its
// Supabase access token; every price is recomputed here from src/pricing.js,
// so a tampered client can never name its own price. Stripe keys live only
// in Vercel env vars (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET).
import { createClient } from "@supabase/supabase-js";
import { PLANS, planById, discountedCents, computeEntitlement } from "../src/pricing.js";

// Bumped by hand whenever we need to confirm a deploy actually shipped.
const BUILD_MARKER = "2026-08-01-diag3";

const admin = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function userFromToken(sb, token) {
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user;
}

async function loadRows(sb, uid) {
  const [{ data: subs }, { data: attempts }] = await Promise.all([
    sb.from("subscriptions").select("plan, starts_at, expires_at, exams_granted").eq("user_id", uid),
    sb.from("exam_attempts").select("form").eq("user_id", uid),
  ]);
  return { subs: subs ?? [], attempts: attempts ?? [] };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { action, token, plan: planId, code: codeRaw } = req.body || {};
  const sb = admin();
  const user = await userFromToken(sb, token);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  // Launch diagnostic: reports only WHETHER each server env var is present,
  // never its value, so the owner can confirm a Vercel deploy picked them up.
  if (action === "diag") {
    const k = process.env.STRIPE_SECRET_KEY;
    // Key TYPE only (sk/rk + live/test) — never the key itself.
    const kind = !k ? "absent" : /^(sk|rk)_(live|test)_/.test(k) ? k.slice(0, k.indexOf("_", 3)) : "unrecognized";

    // Ask Stripe which webhook endpoints exist. A live-mode key returns only
    // live-mode endpoints, so this proves whether purchases will be granted.
    let hooks = "not checked";
    if (k) {
      try {
        const r = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=10", { headers: { Authorization: `Bearer ${k}` } });
        const j = await r.json();
        hooks = r.ok
          ? (j.data ?? []).map((h) => ({ url: h.url, livemode: h.livemode, status: h.status, events: h.enabled_events }))
          : `stripe error: ${j.error?.type ?? "unknown"} — ${j.error?.message ?? ""}`;
      } catch (e) { hooks = `fetch failed: ${e.message}`; }
    }

    // Recent events + how many webhook deliveries are still pending. A
    // delivered event (pending_webhooks 0) proves the signing secret matches,
    // because our handler 400s anything it can't verify. No event `data` is
    // returned here — only the envelope — so no customer details leak.
    let events = "not checked";
    if (k) {
      try {
        const r = await fetch("https://api.stripe.com/v1/events?limit=5", { headers: { Authorization: `Bearer ${k}` } });
        const j = await r.json();
        events = r.ok
          ? (j.data ?? []).map((e) => ({ type: e.type, created: e.created, pendingWebhooks: e.pending_webhooks, livemode: e.livemode }))
          : `stripe error: ${j.error?.type ?? "unknown"} — ${j.error?.message ?? ""}`;
      } catch (e) { events = `fetch failed: ${e.message}`; }
    }

    return res.status(200).json({
      build: BUILD_MARKER,
      stripeKeyKind: kind,
      webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      webhookSecretLooksValid: /^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET ?? ""),
      webhookEndpoints: hooks,
      recentEvents: events,
      siteUrl: process.env.SITE_URL || "(unset — using default)",
    });
  }

  if (action === "code-check") {
    const code = await lookupCode(sb, codeRaw);
    if (!code) return res.status(404).json({ error: "Code not recognized" });
    return res.status(200).json({
      code: code.code, partner: code.partner,
      prices: Object.fromEntries(PLANS.filter((p) => p.cents > 0).map((p) => [p.id, discountedCents(p.cents, code)])),
    });
  }

  if (action === "checkout") {
    const plan = planById(planId);
    if (!plan || plan.cents <= 0) return res.status(400).json({ error: "Unknown package" });
    const { subs, attempts } = await loadRows(sb, user.id);
    const ent = computeEntitlement(subs, attempts);
    if (plan.id === "renew7" && !ent.hadPaid) return res.status(403).json({ error: "Renewals are available after a subscription" });
    if (plan.id === "exam1" && ent.status !== "active") return res.status(403).json({ error: "An active subscription is required to add an exam" });
    if (plan.id === "exam1" && ent.examsLeft + ent.attempted.length >= 10) return res.status(403).json({ error: "All ten exam forms are already covered by your account" });
    const code = await lookupCode(sb, codeRaw);
    if (codeRaw && !code) return res.status(404).json({ error: "Code not recognized" });
    const amount = discountedCents(plan.cents, code);

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(503).json({ error: "Payments are not switched on yet — the owner still needs to connect Stripe." });

    const site = process.env.SITE_URL || "https://www.pulsern.app";
    const form = new URLSearchParams({
      mode: "payment",
      success_url: `${site}/?checkout=success`,
      cancel_url: `${site}/?checkout=cancelled`,
      customer_email: user.email ?? "",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][product_data][name]": `PulseRN ${plan.name}`,
      "metadata[user_id]": user.id,
      "metadata[plan]": plan.id,
      "metadata[code]": code?.code ?? "",
      "metadata[partner]": code?.partner ?? "",
      "metadata[amount]": String(amount),
    });
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const session = await r.json();
    if (!r.ok || !session.url) return res.status(502).json({ error: "Stripe rejected the checkout" });
    return res.status(200).json({ url: session.url });
  }

  return res.status(400).json({ error: "Unknown action" });
}

async function lookupCode(sb, raw) {
  if (!raw || typeof raw !== "string") return null;
  const { data } = await sb.from("discount_codes").select("code, partner, percent_off, amount_off_cents")
    .eq("code", raw.trim().toUpperCase()).eq("active", true).maybeSingle();
  return data ?? null;
}
