// api/billing.js — subscription backend. The client sends an action plus its
// Supabase access token; every price is recomputed here from src/pricing.js,
// so a tampered client can never name its own price. Stripe keys live only
// in Vercel env vars (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET).
import { createClient } from "@supabase/supabase-js";
import { PLANS, planById, discountedCents, computeEntitlement } from "../src/pricing.js";
import {
  CLINICAL_CODE,
  CLINICAL_COHORT,
  CLINICAL_FULL_MESSAGE,
  CLINICAL_INELIGIBLE_MESSAGE,
  CLINICAL_SUB30_CENTS,
  clinicalPrices,
  clinicalSpotCap,
  isClinicalCode,
} from "../src/clinical.js";

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

  if (action === "clinical-claim") {
    const requested = String(req.body?.cohort || CLINICAL_COHORT).trim().toLowerCase();
    if (requested !== CLINICAL_COHORT) return res.status(400).json({ error: "Unknown cohort" });
    const claim = await claimCohort(sb, user.id, "link");
    if (claim.error) return res.status(502).json({ error: "Could not start the clinical student perk" });
    return res.status(200).json(claim.data);
  }

  if (action === "clinical-prices") {
    const found = await isClinicalMember(sb, user.id);
    if (found.error) return res.status(502).json({ error: "Could not confirm clinical student pricing" });
    if (!found.member) return res.status(200).json({ member: false });
    return res.status(200).json({
      member: true,
      cohort: CLINICAL_COHORT,
      code: CLINICAL_CODE,
      prices: clinicalPrices(),
    });
  }

  if (action === "code-check") {
    if (isClinicalCode(codeRaw)) {
      const claim = await claimCohort(sb, user.id, "code");
      if (claim.error) return res.status(502).json({ error: "Could not check the clinical student code" });
      const status = claim.data?.status;
      if (status === "full") return res.status(409).json({ error: CLINICAL_FULL_MESSAGE });
      if (status === "ineligible") return res.status(403).json({ error: CLINICAL_INELIGIBLE_MESSAGE });
      if (status !== "claimed" && status !== "already") return res.status(400).json({ error: "Code not recognized" });
      return res.status(200).json({
        code: CLINICAL_CODE,
        partner: "Clinical students",
        cohort: CLINICAL_COHORT,
        status,
        prices: clinicalPrices(),
      });
    }
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
    if (plan.id === "renew7" && !ent.hadPaid) return res.status(403).json({ error: "Renewals are available after a paid pass" });
    if (plan.id === "exam1" && ent.status !== "active") return res.status(403).json({ error: "An active paid pass is required to add an exam" });
    if (plan.id === "exam1" && ent.examsLeft + ent.attempted.length >= 10) return res.status(403).json({ error: "All ten exam forms are already covered by your account" });

    let member = false;
    if (isClinicalCode(codeRaw)) {
      const claim = await claimCohort(sb, user.id, "code");
      if (claim.error) return res.status(502).json({ error: "Could not apply the clinical student code" });
      const status = claim.data?.status;
      member = status === "claimed" || status === "already";
      if (!member && plan.id === "sub30") {
        if (status === "full") return res.status(409).json({ error: CLINICAL_FULL_MESSAGE });
        if (status === "ineligible") return res.status(403).json({ error: CLINICAL_INELIGIBLE_MESSAGE });
        return res.status(400).json({ error: "Code not recognized" });
      }
    } else if (plan.id === "sub30") {
      const found = await isClinicalMember(sb, user.id);
      if (found.error) return res.status(502).json({ error: "Could not confirm clinical student pricing" });
      member = found.member;
    }

    /* Clinical members pay $40 once for the 30-day pass, inline price_data,
       so no new Stripe Price is required. Every other plan, including the
       7-day pass, keeps its catalog price. Partner codes still apply there. */
    let amount;
    let metaCode = "";
    let metaPartner = "";
    let metaCohort = "";
    if (member && plan.id === "sub30") {
      amount = CLINICAL_SUB30_CENTS;
      metaCode = CLINICAL_CODE;
      metaPartner = "Clinical students";
      metaCohort = CLINICAL_COHORT;
    } else {
      const code = isClinicalCode(codeRaw) ? null : await lookupCode(sb, codeRaw);
      if (codeRaw && !code && !isClinicalCode(codeRaw)) return res.status(404).json({ error: "Code not recognized" });
      amount = discountedCents(plan.cents, code);
      metaCode = code?.code ?? "";
      metaPartner = code?.partner ?? "";
    }

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(503).json({ error: "Payments aren't switched on yet. The owner still needs to connect Stripe." });

    const site = process.env.SITE_URL || "https://www.pulsern.app";
    const form = new URLSearchParams({
      mode: "payment",
      success_url: `${site}/app/?checkout=success`,
      cancel_url: `${site}/app/?checkout=cancelled`,
      customer_email: user.email ?? "",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][product_data][name]": `PulseRN ${plan.name}`,
      "metadata[user_id]": user.id,
      "metadata[plan]": plan.id,
      "metadata[code]": metaCode,
      "metadata[partner]": metaPartner,
      "metadata[amount]": String(amount),
    });
    if (metaCohort) form.set("metadata[cohort]", metaCohort);
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

function claimCohort(sb, userId, source) {
  return sb.rpc("claim_cohort_spot", {
    p_user_id: userId,
    p_cohort: CLINICAL_COHORT,
    p_cap: clinicalSpotCap(),
    p_source: source,
  });
}

async function isClinicalMember(sb, userId) {
  const { data, error } = await sb.from("cohort_members")
    .select("user_id")
    .eq("user_id", userId)
    .eq("cohort", CLINICAL_COHORT)
    .maybeSingle();
  if (error) return { error, member: false };
  return { error: null, member: Boolean(data) };
}

async function lookupCode(sb, raw) {
  if (!raw || typeof raw !== "string") return null;
  const { data } = await sb.from("discount_codes").select("code, partner, percent_off, amount_off_cents")
    .eq("code", raw.trim().toUpperCase()).eq("active", true).maybeSingle();
  return data ?? null;
}
