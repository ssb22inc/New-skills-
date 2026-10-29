#!/usr/bin/env node
/* The read-aloud voice job (.github/workflows/pulsern-read-aloud.yml).
   ------------------------------------------------------------------
   The app's server holds no OpenAI key, and students only ever hear audio
   that passed the word-for-word accuracy check. This job, which runs on
   the default branch in the pulsern-paid environment (where the key lives),
   makes that audio, with exactly the gate the live route uses (makeChecked:
   synthesise, transcribe, voiceCheck, two takes):

   1. The queue first. When a student presses Listen on something not yet
      voiced, the server checks the request against the bank and queues
      every part of that item (api/_speak.js); the app says the voice is
      being prepared. Queued parts are voiced oldest first, retried parts
      after fresh ones.
   2. Then the bank. Spare capacity voices the bank ahead of demand:
      every practice question with its explanation, every case study and
      every flashcard, in id order, resuming where the last run stopped
      (prewarm/cursor.json). Readiness-exam items are never voiced.

   Failures never block progress or spend without bound:
   - every synthesis claims a spending slot for the day it is made; with
     none left the job stops and the work waits (nothing is paid);
   - a storage read error keeps the entry; it is never taken for garbage;
   - the provider refusing a passage itself (a 4xx other than rate limits)
     is recorded once as not voiceable and the queue moves on;
   - an outage-type error is retried on later runs, at most MAX_ATTEMPTS
     times per passage, and three in a row end the run (provider down). */
import { createClient } from "@supabase/supabase-js";
import {
  BUCKET, TTS, LIMITS, SPEAK_MAX, makeChecked, saveChecked, saveRejected, readRecord, passagePaths, validRequest, reserveSpend, quotaDay,
} from "../api/_speak.js";
import { scriptFor, questionFeedbackSegments, caseFeedbackSegments, verdictText } from "../src/read-aloud-script.js";

export const MAX_ATTEMPTS = 5;
const MAX_TRANSIENT_IN_A_ROW = 3;

/* Voice one passage. result: "voiced" | "failed" | "rejected" | "budget" | "transient". */
async function voiceOne({ storage, apiKey, fetchImpl, text, now, limits }) {
  const r = await makeChecked({ text, apiKey, fetchImpl, beforeTake: () => reserveSpend(storage, { now: now(), limits }) });
  if (!r.final) {
    if (r.errorKind === "budget") return { result: "budget", spent: r.spent };
    if (r.errorKind === "permanent") {
      if (!(await saveRejected(storage, text, r.error, { now: now() }))) return { result: "transient", spent: r.spent, error: "could not save" };
      return { result: "rejected", spent: r.spent, error: r.error };
    }
    return { result: "transient", spent: r.spent, error: r.error ?? "no audio" };
  }
  if (!(await saveChecked(storage, text, r.best, { now: now() }))) return { result: "transient", spent: r.spent, error: "could not save" };
  return { result: r.best.check.pass ? "voiced" : "failed", spent: r.spent, similarity: r.best.check.similarity };
}

async function readJsonFile(bucket, path) {
  const { data, error } = await bucket.download(path);
  if (error) return { error };
  try { return { value: JSON.parse(await data.text()) }; } catch { return { malformed: true }; }
}
const put = (bucket, path, value) => bucket.upload(path, JSON.stringify(value), { contentType: "application/json", upsert: true });

export async function drainQueue({ storage, apiKey, fetchImpl = fetch, max = 200, now = () => Date.now(), limits = LIMITS, log = console.log }) {
  const bucket = storage.from(BUCKET);
  const out = { queued: 0, voiced: 0, failed: 0, rejected: 0, retried: 0, skipped: 0, spent: 0, budget: false, providerDown: false, errors: [] };
  const { data: entries, error } = await bucket.list("queue", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) {
    if (/not found/i.test(String(error.message ?? error))) return out;
    throw new Error(`Could not list the queue: ${error.message ?? error}`);
  }
  // Read each entry. A read error keeps it (reported); only content that was
  // read and is malformed, or does not match its own name, is dropped.
  const jobs = [];
  for (const f of (entries ?? []).filter((e) => e.name?.endsWith(".json"))) {
    const path = `queue/${f.name}`;
    const got = await readJsonFile(bucket, path);
    if (got.error) { out.errors.push(`${f.name}: could not read (${got.error.message ?? got.error})`); continue; }
    const job = got.value;
    if (got.malformed || !job || job.voice !== TTS.voice || !validRequest(job.ref, job.seg, job.text) || passagePaths(job.text).queue !== path) {
      await bucket.remove([path]); out.skipped++; continue;
    }
    jobs.push({ path, job });
  }
  out.queued = jobs.length;
  // Fresh requests before retried ones, oldest first.
  jobs.sort((a, b) => (a.job.attempts ?? 0) - (b.job.attempts ?? 0) || String(a.job.requestedAt).localeCompare(String(b.job.requestedAt)));

  let inARow = 0, done = 0;
  for (const { path, job } of jobs) {
    if (done >= max) break;
    if (await readRecord(storage, job.text)) { await bucket.remove([path]); out.skipped++; continue; } // already decided
    done++;
    const v = await voiceOne({ storage, apiKey, fetchImpl, text: job.text, now, limits });
    out.spent += v.spent;
    if (v.result === "budget") { out.budget = true; break; }
    if (v.result === "transient") {
      const attempts = (job.attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await saveRejected(storage, job.text, `gave up after ${attempts} attempts: ${v.error}`, { now: now() });
        await bucket.remove([path]); out.rejected++;
      } else {
        await put(bucket, path, { ...job, attempts, lastError: String(v.error).slice(0, 200) });
        out.retried++;
      }
      out.errors.push(`${job.ref.kind} ${job.ref.id} ${job.seg}: ${v.error}`);
      if (++inARow >= MAX_TRANSIENT_IN_A_ROW) { out.providerDown = true; break; }
      continue;
    }
    inARow = 0;
    await bucket.remove([path]);
    if (v.result === "voiced") out.voiced++;
    else if (v.result === "rejected") { out.rejected++; log(`provider refused: ${job.ref.kind} ${job.ref.id} ${job.seg} (${v.error})`); }
    else { out.failed++; log(`failed the check twice: ${job.ref.kind} ${job.ref.id} ${job.seg} (similarity ${v.similarity?.toFixed(3)})`); }
  }
  return out;
}

/* ---------- voicing the bank ahead of demand ---------- */
const WRONG = { correct: false, points: 0, max: 1 };
/* The result lines a student can hear ("Correct.", "Partly correct: 2 of 3
   points." ...), voiced once for everyone. */
export function verdictPassages(maxPoints = 10) {
  const out = [verdictText({ correct: true, points: 1, max: 1 }), verdictText(WRONG)];
  for (let max = 2; max <= maxPoints; max++) for (let p = 1; p < max; p++) out.push(verdictText({ correct: false, points: p, max }));
  return out.map((v) => `${v}.`);
}
/* Every passage of one bank item, exactly as the screen and the route build them. */
export function itemPassages(kind, row) {
  const parts = [];
  if (kind === "question") {
    parts.push(...scriptFor({ kind: "question", part: "question" }, row), ...questionFeedbackSegments(row, WRONG));
  } else if (kind === "case") {
    parts.push(...scriptFor({ kind: "case", part: "intro" }, row));
    (row.steps ?? []).forEach((step, i) => {
      parts.push(...scriptFor({ kind: "case", part: "step", step: i }, row), ...caseFeedbackSegments(step, WRONG));
    });
  } else if (kind === "card") {
    parts.push(...scriptFor({ kind: "card", part: "front" }, row), ...scriptFor({ kind: "card", part: "back" }, row));
  }
  return [...new Set(parts.map((s) => s.text))].filter((t) => t && t.length <= SPEAK_MAX);
}

const KINDS = ["verdicts", "question", "case", "card"];
const RESCAN_DAYS = 7;
export const BANK_QUERIES = {
  question: (db) => db.from("questions").select("id, type, stem, options, extra, answer, rationale").eq("approved", true).is("exam_form", null),
  case: (db) => db.from("case_studies").select("id, title, intro, vitals, labs, note, steps").eq("approved", true).is("exam_form", null),
  card: (db) => db.from("flashcards").select("id, front, back").eq("approved", true),
};

export async function prewarmBank({ storage, db, apiKey, fetchImpl = fetch, max = 100, now = () => Date.now(), limits = LIMITS, page = 50 }) {
  const bucket = storage.from(BUCKET);
  const out = { voiced: 0, failed: 0, rejected: 0, spent: 0, budget: false, stopped: null, cursor: null };
  const got = await readJsonFile(bucket, "prewarm/cursor.json");
  if (got.error && !/not found/i.test(String(got.error.message ?? got.error))) { out.stopped = `cursor: ${got.error.message ?? got.error}`; return out; }
  let cursor = got.value ?? { kind: KINDS[0], afterId: 0 };
  if (cursor.done) {
    // A finished pass is repeated weekly, to pick up new bank items.
    if (now() - Date.parse(cursor.doneAt ?? 0) < RESCAN_DAYS * 86400000) { out.cursor = cursor; return out; }
    cursor = { kind: KINDS[0], afterId: 0 };
  }
  let done = 0;
  const save = () => put(bucket, "prewarm/cursor.json", cursor);
  const voice = async (texts) => {
    for (const text of texts) {
      if (await readRecord(storage, text)) continue;
      if (done >= max) return "max";
      done++;
      const v = await voiceOne({ storage, apiKey, fetchImpl, text, now, limits });
      out.spent += v.spent;
      if (v.result === "budget") { out.budget = true; return "budget"; }
      if (v.result === "transient") return `provider: ${v.error}`;
      out[v.result]++;
    }
    return null;
  };

  while (cursor.kind) {
    if (cursor.kind === "verdicts") {
      const stop = await voice(verdictPassages());
      if (stop) { out.stopped = stop; break; }
      cursor = { kind: "question", afterId: 0 }; await save(); continue;
    }
    const { data: rows, error } = await BANK_QUERIES[cursor.kind](db).gt("id", cursor.afterId).order("id").limit(page);
    if (error) { out.stopped = `bank: ${error.message ?? error}`; break; }
    if (!rows?.length) {
      const next = KINDS[KINDS.indexOf(cursor.kind) + 1];
      cursor = next ? { kind: next, afterId: 0 } : { done: true, doneAt: new Date(now()).toISOString() };
      await save();
      if (!next) break;
      continue;
    }
    let stop = null;
    for (const row of rows) {
      stop = await voice(itemPassages(cursor.kind, row));
      if (stop) break;
      cursor = { kind: cursor.kind, afterId: row.id }; // an item counts as done only when all its passages are decided
    }
    await save();
    if (stop) { out.stopped = stop; break; }
  }
  out.cursor = cursor;
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
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const storage = db.storage;
  const max = Math.max(1, Math.min(2000, Number(process.env.READ_ALOUD_MAX) || 200));
  const q = await drainQueue({ storage, apiKey: OPENAI_API_KEY, max });
  // The bank gets what the queue left, unless the provider is down or today's budget is spent.
  const left = Math.max(0, max - (q.voiced + q.failed + q.rejected + q.retried));
  const w = q.budget || q.providerDown || !left ? { voiced: 0, failed: 0, rejected: 0, spent: 0, stopped: "skipped" }
    : await prewarmBank({ storage, db, apiKey: OPENAI_API_KEY, max: left }).catch((e) => ({ voiced: 0, failed: 0, rejected: 0, spent: 0, stopped: String(e?.message ?? e) }));
  const pruned = await pruneUsage({ storage }).catch((e) => ({ error: String(e?.message ?? e) }));
  const lines = [
    `Queue: ${q.queued} waiting · ${q.voiced} voiced and checked · ${q.failed} failed the check twice · ${q.rejected} refused or given up · ${q.retried} to retry · ${q.skipped} skipped`,
    `Bank: ${w.voiced} voiced and checked · ${w.failed} failed the check twice · ${w.rejected} refused${w.stopped ? ` · stopped: ${w.stopped}` : ""}${w.cursor ? ` · next: ${w.cursor.done ? "done" : `${w.cursor.kind} after ${w.cursor.afterId}`}` : ""}`,
    `Syntheses paid: ${q.spent + w.spent}${q.budget || w.budget ? " · today's voice budget is used up; the rest wait" : ""} · old budget slots removed: ${pruned.removed ?? 0}`,
    ...q.errors.map((e) => `error: ${e}`),
    ...(pruned.error ? [`error: pruning: ${pruned.error}`] : []),
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n\n") + "\n");
  }
  // A provider outage or storage trouble fails the run so it is noticed;
  // passage-level problems are reported, not failures.
  if (q.providerDown || pruned.error || q.errors.some((e) => /could not read/.test(e)) || /^(bank|cursor):/.test(String(w.stopped))) process.exit(1);
}
