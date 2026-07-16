/* Student profile: name + phone + SMS opt-ins. Email already lives on the
   auth account. The two consents are separate, deliberate opt-ins (TCPA):
   study reminders and product offers — each stored with a timestamp, and
   the compliance line is shown right at the point of consent. */
import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { normalizePhone } from "./phone.js";

export function useProfile() {
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = none yet
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
        setProfile(error ? null : data);
      } catch { setProfile(null); }
    })();
  }, []);
  return [profile, setProfile];
}

export function ProfileCard({ profile, setProfile, prompt = false, onDone }) {
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [reminders, setReminders] = useState(profile?.sms_reminders ?? false);
  const [offers, setOffers] = useState(profile?.sms_offers ?? false);
  const [state, setState] = useState("idle"); // idle | busy | saved | error
  const [err, setErr] = useState("");

  const save = async () => {
    setErr("");
    const wantsSms = reminders || offers;
    const e164 = phone.trim() ? normalizePhone(phone) : null;
    if (wantsSms && !e164) { setErr("Enter a valid mobile number (e.g. 305-555-0123) to receive texts."); return; }
    if (phone.trim() && !e164) { setErr("That phone number doesn't look right — use digits like 305-555-0123."); return; }
    setState("busy");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setState("error"); return; }
    const row = {
      user_id: session.user.id,
      full_name: name.trim().slice(0, 120),
      phone: e164,
      sms_reminders: !!(reminders && e164),
      sms_offers: !!(offers && e164),
      consent_at: wantsSms && e164 ? new Date().toISOString() : profile?.consent_at ?? null,
      opted_out: false,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("profiles").upsert(row).select().maybeSingle();
    if (error) { setState("error"); setErr("Couldn't save — try again."); return; }
    setProfile(data ?? row);
    setState("saved");
    onDone?.();
  };

  return (
    <section className="card">
      <p className="eyebrow">{prompt ? "Finish setting up" : "Profile & notifications"}</p>
      {prompt && <p className="small">Tell us who you are and we'll keep you on track with study reminders.</p>}
      <input className="select" style={{ marginBottom: 8 }} placeholder="Your name" value={name}
        autoComplete="name" onChange={(e) => { setName(e.target.value); setState("idle"); }} aria-label="Your name" />
      <input className="select" style={{ marginBottom: 8 }} placeholder="Mobile number (for text reminders)" type="tel"
        autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setState("idle"); }} aria-label="Mobile number" />
      <label className="small consent-row">
        <input type="checkbox" checked={reminders} onChange={(e) => { setReminders(e.target.checked); setState("idle"); }} />
        <span>Text me study reminders so I keep my streak going</span>
      </label>
      <label className="small consent-row">
        <input type="checkbox" checked={offers} onChange={(e) => { setOffers(e.target.checked); setState("idle"); }} />
        <span>Text me offers and product updates from PulseRN</span>
      </label>
      <p className="small tip">By checking a box you agree to receive automated texts from PulseRN at the number provided. Consent is not a condition of purchase. Msg & data rates may apply. Reply STOP to unsubscribe, HELP for help.</p>
      {err && <p className="small" style={{ color: "var(--coral)" }}>{err}</p>}
      <button className="btn" disabled={state === "busy"} onClick={save}>
        {state === "busy" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save profile"}
      </button>
    </section>
  );
}
