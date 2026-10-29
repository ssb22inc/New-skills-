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
import { BUCKET, TTS, LIMITS, makeChecked, saveChecked, readRecord, passagePaths, validRequest, reserveGlobal } from "../api/_speak.js";

export async function drainQueue({ storage, apiKey, fetchImpl = fetch, max = 200, now = () => Date.now(), limits = LIMITS, log = console.log }) {
  const bucket = storage.from(BUCKET);
  const { data: entries, error } = await bucket.list("queue", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) {
    if (/not found/i.test(String(error.message ?? error))) return { queued: 0, voiced: 0, failed: 0, skipped: 0, errors: [] };
    throw new Error(`Could not list the queue: ${error.message ?? error}`);
  }
  const files = (entries ?? []).filter((e) => e.name?.endsWith(".json"));
  const out = { queued: files.length, voiced: 0, failed: 0, skipped: 0, spent: 0, errors: [] };
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
    // The first take was paid for when the passage was queued; a second
    // take claims its own app-wide slot.
    const { best, spent, error: why } = await makeChecked({ text: job.text, apiKey, fetchImpl, beforeRetake: () => reserveGlobal(storage, { now: now(), limits }) });
    out.spent += spent;
    if (!best) {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    console.error("Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY.");
    process.exit(1);
  }
  const storage = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage;
  const max = Math.max(1, Math.min(2000, Number(process.env.READ_ALOUD_MAX) || 200));
  const r = await drainQueue({ storage, apiKey: OPENAI_API_KEY, max });
  const line = `Read-aloud queue: ${r.queued} waiting · ${r.voiced} voiced and checked · ${r.failed} failed the check twice · ${r.skipped} skipped · ${r.spent} syntheses${r.errors.length ? ` · errors: ${r.errors.join("; ")}` : ""}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  }
  if (r.errors.length) process.exit(1);
}
