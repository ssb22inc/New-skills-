#!/usr/bin/env node
/* The read-aloud voice job (.github/workflows/pulsern-read-aloud.yml).
   ------------------------------------------------------------------
   The app's server holds no OpenAI key. When a student asks to hear a
   passage that has no checked audio yet, the server checks the request
   against the bank (api/_speak.js) and leaves it in the private bucket's
   queue/ folder; the student hears the device voice that time. This job,
   which runs on the default branch in the pulsern-paid environment (where
   the key lives), voices each queued passage with exactly the gate the live
   route uses (makeChecked: synthesise, transcribe, voiceCheck, two takes),
   saves the audio only if it passed, always saves the record, and clears
   the queue entry. From then on every student hears the checked AI voice.

   Spend is bounded three ways: only bank-checked passages reach the queue,
   the route caps new passages per student and app-wide each day, and this
   job voices at most READ_ALOUD_MAX passages per run. */
import { createClient } from "@supabase/supabase-js";
import { BUCKET, TTS, LIMITS, makeChecked, saveChecked, readRecord, passagePaths, validRequest, reserveSpend, quotaDay } from "../api/_speak.js";

export async function drainQueue({ storage, apiKey, fetchImpl = fetch, max = 200, now = () => Date.now(), limits = LIMITS, log = console.log }) {
  const bucket = storage.from(BUCKET);
  const { data: entries, error } = await bucket.list("queue", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) {
    if (/not found/i.test(String(error.message ?? error))) return { queued: 0, voiced: 0, failed: 0, skipped: 0, errors: [] };
    throw new Error(`Could not list the queue: ${error.message ?? error}`);
  }
  const files = (entries ?? []).filter((e) => e.name?.endsWith(".json"));
  const out = { queued: files.length, voiced: 0, failed: 0, skipped: 0, spent: 0, budget: false, errors: [] };
  for (const f of files.slice(0, max)) {
    const path = `queue/${f.name}`;
    const { data, error: dlError } = await bucket.download(path);
    let job = null;
    try { job = dlError ? null : JSON.parse(await data.text()); } catch { job = null; }
    // Only well-formed entries for this voice, keyed by their own text.
    if (!job || job.voice !== TTS.voice || !validRequest(job.ref, job.seg, job.text) || passagePaths(job.text).queue !== path) {
      await bucket.remove([path]); out.skipped++; continue;
    }
    if (await readRecord(storage, job.text)) { await bucket.remove([path]); out.skipped++; continue; } // already checked
    // Every synthesis claims a spending slot for the day it is made; with
    // none left, the passage stays queued and nothing is paid.
    const { best, spent, error: why, final } = await makeChecked({ text: job.text, apiKey, fetchImpl, beforeTake: () => reserveSpend(storage, { now: now(), limits }) });
    out.spent += spent;
    if (!final) {
      // Today's spending is used up: stop quietly, the entry waits.
      if (why === "budget") { out.budget = true; break; }
      // Provider trouble: keep the entry for the next run, and stop this one.
      out.errors.push(`${f.name}: ${why ?? "no audio"}`);
      break;
    }
    if (!(await saveChecked(storage, job.text, best, { now: now() }))) { out.errors.push(`${f.name}: could not save`); break; }
    await bucket.remove([path]);
    if (best.check.pass) out.voiced++;
    else { out.failed++; log(`failed the check twice: ${job.ref.kind} ${job.ref.id} ${job.seg} (similarity ${best.check.similarity.toFixed(3)})`); }
  }
  return out;
}

/* Budget slots (usage/<day>/...) are only read for the current day. Older
   days are deleted so the bucket does not grow without end; a week is kept
   for looking back at usage. */
async function listAll(bucket, dir) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(dir, { limit: 1000, offset });
    if (error) throw new Error(`Could not list ${dir}: ${error.message ?? error}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
export async function pruneUsage({ storage, now = Date.now(), keepDays = 7 }) {
  const bucket = storage.from(BUCKET);
  const oldest = quotaDay(now - keepDays * 86400000);
  const days = (await listAll(bucket, "usage").catch(() => [])).map((e) => e.name).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < oldest);
  let removed = 0;
  for (const day of days) {
    for (const sub of await listAll(bucket, `usage/${day}`)) {
      const files = (await listAll(bucket, `usage/${day}/${sub.name}`)).map((f) => `usage/${day}/${sub.name}/${f.name}`);
      for (let i = 0; i < files.length; i += 1000) {
        const { error } = await bucket.remove(files.slice(i, i + 1000));
        if (error) throw new Error(`Could not remove old usage: ${error.message ?? error}`);
        removed += Math.min(1000, files.length - i);
      }
    }
  }
  return { days: days.length, removed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    console.error("Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY.");
    process.exit(1);
  }
  const storage = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage;
  const max = Math.max(1, Math.min(2000, Number(process.env.READ_ALOUD_MAX) || 200));
  const r = await drainQueue({ storage, apiKey: OPENAI_API_KEY, max });
  const pruned = await pruneUsage({ storage }).catch((e) => ({ error: String(e?.message ?? e) }));
  if (pruned.error) r.errors.push(`pruning: ${pruned.error}`);
  const line = `Read-aloud queue: ${r.queued} waiting · ${r.voiced} voiced and checked · ${r.failed} failed the check twice · ${r.skipped} skipped · ${r.spent} syntheses · ${pruned.removed ?? 0} old budget slots removed${r.budget ? " · today's voice budget is used up; the rest wait" : ""}${r.errors.length ? ` · errors: ${r.errors.join("; ")}` : ""}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  }
  if (r.errors.length) process.exit(1);
}
