/* Paywall + plan picker. Shown full-screen when a student has no active
   access, and inside Stats as the "Your plan" card. All purchases round-trip
   through api/billing.js — the client never computes a price it can act on. */
import React, { useState } from "react";
import { supabase } from "./supabase.js";
import { PLANS, computeEntitlement, fmtUsd } from "./pricing.js";

async function billing(action, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: session?.access_token, ...extra }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* Entitlement comes straight from RLS-scoped reads — no serverless hop, so
   it works identically in dev, preview, and production. */
export async function fetchEntitlement() {
  const [{ data: subs, error: e1 }, { data: attempts, error: e2 }] = await Promise.all([
    supabase.from("subscriptions").select("plan, starts_at, expires_at, exams_granted"),
    supabase.from("exam_attempts").select("form"),
  ]);
  if (e1 || e2) throw new Error("offline");
  return computeEntitlement(subs, attempts);
}

/* The free pass is the one row a client may insert itself; the partial
   unique index in migration 007 caps it at one per account for life. */
export async function grantFreePass() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Sign in first");
  await supabase.from("subscriptions").insert({
    user_id: session.user.id, plan: "pass1",
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    exams_granted: 0, price_cents: 0,
  });
  return fetchEntitlement();
}

export function Paywall({ ent, onRefresh, trialBanner = false }) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState(null); // {code, partner, prices}
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");

  const apply = async () => {
    setErr("");
    if (!code.trim()) { setApplied(null); return; }
    try { setApplied(await billing("code-check", { code: code.trim() })); }
    catch (e) { setApplied(null); setErr(e.message); }
  };

  const buy = async (planId) => {
    setErr(""); setBusy(planId);
    try {
      const { url } = await billing("checkout", { plan: planId, code: applied?.code });
      window.location.assign(url);
    } catch (e) { setErr(e.message); }
    setBusy(null);
  };

  const price = (p) => {
    const cents = applied?.prices?.[p.id] ?? p.cents;
    const cut = cents !== p.cents;
    return (
      <span>
        {cut && <s className="small" style={{ opacity: 0.6, marginRight: 6 }}>{fmtUsd(p.cents)}</s>}
        <strong>{fmtUsd(cents)}</strong>
      </span>
    );
  };

  const mains = PLANS.filter((p) => p.cents > 0 && !p.addon);
  const addons = PLANS.filter((p) => p.addon);
  const showAddons = ent?.hadPaid;

  return (
    <div className="stack">
      {trialBanner && (
        <section className="card" style={{ borderColor: "var(--accent)" }}>
          <p className="eyebrow">Free pass active</p>
          <p className="small">You're on the 1-day free pass — every study tool is open. Readiness exams unlock with any subscription below.</p>
        </section>
      )}
      {!trialBanner && (
        <section className="card">
          <p className="eyebrow">PulseRN access</p>
          <h2 className="h2">{ent?.status === "expired" ? "Your access has ended" : "Choose your runway"}</h2>
          <p className="small">Created by a licensed RN — for future RNs. Every plan opens the full adaptive QBank, 1,000+ flashcards, case-study library, AI tutor, and labs reference. Self-assessments are full 85-item NCLEX-style readiness exams — and no account is ever shown the same exam twice.</p>
        </section>
      )}
      <section className="card">
        <p className="eyebrow">Partner / discount code</p>
        <div className="row" style={{ alignItems: "center" }}>
          <input className="select" style={{ flex: 1 }} placeholder="Enter code (optional)" value={code}
            autoComplete="off" onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") apply(); }} />
          <button className="btn ghost" onClick={apply}>Apply</button>
        </div>
        {applied && <p className="small tip">✅ Code <strong>{applied.code}</strong> applied — partner pricing shown below.</p>}
        {err && <p className="small" style={{ color: "var(--coral)" }}>{err}</p>}
      </section>
      {mains.map((p) => (
        <section key={p.id} className="card">
          <div className="cat-top">
            <span className="small"><strong>{p.name}</strong></span>
            <span className="small mono">{price(p)}</span>
          </div>
          <p className="small">{p.blurb}</p>
          <button className="btn" disabled={busy === p.id} onClick={() => buy(p.id)}>
            {busy === p.id ? "Opening checkout…" : `Get ${p.name} →`}
          </button>
        </section>
      ))}
      {showAddons && (
        <section className="card">
          <p className="eyebrow">After your subscription</p>
          {addons.map((p) => (
            <div key={p.id} style={{ marginBottom: 10 }}>
              <div className="cat-top">
                <span className="small"><strong>{p.name}</strong></span>
                <span className="small mono">{price(p)}</span>
              </div>
              <p className="small">{p.blurb}</p>
              <button className="btn ghost" disabled={busy === p.id} onClick={() => buy(p.id)}>Add →</button>
            </div>
          ))}
        </section>
      )}
      <section className="card">
        <p className="small tip">All questions, case studies, flashcards, exams, and other materials are the property of the owner of PulseRN and may not be copied, captured, or used outside this app without the owner's explicit consent.</p>
      </section>
      {onRefresh && (
        <section className="card">
          <p className="small">Just completed a purchase? <button className="auth-switch" onClick={onRefresh}>Refresh my access</button></p>
        </section>
      )}
    </div>
  );
}

/* Small "Your plan" card for Stats. */
export function PlanCard({ ent, onManage }) {
  if (!ent) return null;
  const label =
    ent.status === "active" ? `Active until ${ent.expiresAt ? new Date(ent.expiresAt).toLocaleDateString() : "—"}` :
    ent.status === "trial" ? "1-day free pass" :
    ent.status === "expired" ? "Expired" : "No plan yet";
  return (
    <section className="card">
      <p className="eyebrow">Your plan</p>
      <p className="small"><strong>{label}</strong>{ent.status !== "none" ? ` · ${ent.examsLeft} self-assessment${ent.examsLeft === 1 ? "" : "s"} remaining · ${ent.attempted.length}/10 exams used` : ""}</p>
      <button className="btn ghost" onClick={onManage}>{ent.status === "active" ? "Extend or add exams" : "See plans"}</button>
    </section>
  );
}
