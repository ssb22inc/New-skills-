#!/usr/bin/env node
/* PulseRN SMS engine — study reminders + product offers via Twilio.
   ------------------------------------------------------------------
   Consent-first: a number is texted ONLY if the matching opt-in is on
   (sms_reminders for nudges, sms_offers for marketing), opted_out is
   false, and a phone exists. Marketing texts always carry opt-out
   language. Twilio's Advanced Opt-Out handles STOP at the carrier
   level; sync-stops mirrors those back into profiles.opted_out.

   Usage:
     node ops/sms-blast.mjs --reminders --days 2 --dry-run
     node ops/sms-blast.mjs --reminders --days 2        # send for real
     node ops/sms-blast.mjs --offer "30-day plans are $69 this week with code RN30" --dry-run
     node ops/sms-blast.mjs --sync-stops               # pull STOPs from Twilio

   Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (+1...)
   ------------------------------------------------------------------ */
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const DRY = args.includes("--dry-run");
const DAYS = parseInt(opt("--days", "2"), 10);
const OFFER = opt("--offer", null);
const REMINDERS = args.includes("--reminders");
const SYNC_STOPS = args.includes("--sync-stops");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SID = process.env.TWILIO_ACCOUNT_SID, TOK = process.env.TWILIO_AUTH_TOKEN, FROM = process.env.TWILIO_FROM;

function requireTwilio() {
  if (!SID || !TOK || !FROM) {
    console.error("Twilio env missing (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM) — see HUMAN_TASKS.md H14.");
    process.exit(1);
  }
}

async function sendSms(to, body) {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${SID}:${TOK}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: FROM, Body: body }).toString(),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.message ?? `Twilio ${r.status}`);
  return data.sid;
}

/* Reminders go to consented students whose progress hasn't moved in N days. */
async function reminders() {
  const { data: profiles } = await db.from("profiles")
    .select("user_id, full_name, phone")
    .eq("sms_reminders", true).eq("opted_out", false).not("phone", "is", null);
  if (!profiles?.length) { console.log("No reminder-consented numbers."); return; }
  const cutoff = new Date(Date.now() - DAYS * 864e5).toISOString();
  const { data: fresh } = await db.from("progress").select("user_id").gte("updated_at", cutoff);
  const active = new Set((fresh ?? []).map((r) => r.user_id));
  const due = profiles.filter((p) => !active.has(p.user_id));
  console.log(`${profiles.length} consented · ${due.length} inactive ≥${DAYS}d → texting`);
  for (const p of due) {
    const first = (p.full_name || "").split(" ")[0] || "future RN";
    const body = `PulseRN: ${first}, your NCLEX prep misses you — even 10 questions today keeps the forgetting curve at bay. pulsern.vercel.app  Reply STOP to opt out.`;
    if (DRY) { console.log(`  [dry] ${p.phone}: ${body.slice(0, 70)}…`); continue; }
    try { console.log(`  ✓ ${p.phone} ${await sendSms(p.phone, body)}`); }
    catch (e) { console.log(`  ✗ ${p.phone}: ${e.message}`); }
  }
}

/* Offers go ONLY to the marketing opt-in list. */
async function offer(text) {
  const { data: profiles } = await db.from("profiles")
    .select("phone, full_name")
    .eq("sms_offers", true).eq("opted_out", false).not("phone", "is", null);
  if (!profiles?.length) { console.log("No offer-consented numbers."); return; }
  const body = `PulseRN: ${text} pulsern.vercel.app  Reply STOP to opt out.`;
  if (body.length > 320) { console.error("Offer too long for 2 SMS segments — shorten it."); process.exit(1); }
  console.log(`Sending offer to ${profiles.length} opted-in numbers…`);
  for (const p of profiles) {
    if (DRY) { console.log(`  [dry] ${p.phone}: ${body.slice(0, 70)}…`); continue; }
    try { console.log(`  ✓ ${p.phone} ${await sendSms(p.phone, body)}`); }
    catch (e) { console.log(`  ✗ ${p.phone}: ${e.message}`); }
  }
}

/* Mirror Twilio's carrier-level STOP list into profiles.opted_out. */
async function syncStops() {
  let url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json?To=${encodeURIComponent(FROM)}&PageSize=200`;
  const stopped = new Set();
  while (url) {
    const r = await fetch(url, { headers: { Authorization: "Basic " + Buffer.from(`${SID}:${TOK}`).toString("base64") } });
    const data = await r.json();
    for (const m of data.messages ?? []) {
      if (/^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i.test(m.body ?? "")) stopped.add(m.from);
    }
    url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
  }
  console.log(`${stopped.size} STOP sender(s) found`);
  for (const phone of stopped) {
    const { data } = await db.from("profiles").update({ opted_out: true, sms_reminders: false, sms_offers: false })
      .eq("phone", phone).select("user_id");
    if (data?.length) console.log(`  opted out ${phone}`);
  }
}

if (SYNC_STOPS) { requireTwilio(); await syncStops(); }
else if (REMINDERS) { if (!DRY) requireTwilio(); await reminders(); }
else if (OFFER) { if (!DRY) requireTwilio(); await offer(OFFER); }
else { console.log("Nothing to do: pass --reminders, --offer \"text\", or --sync-stops (add --dry-run to preview)."); }
