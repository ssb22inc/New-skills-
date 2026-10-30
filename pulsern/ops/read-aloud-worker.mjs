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
   - the provider refusing a passage itself (400, 413, 422) is recorded
     as not voiceable (reconsidered after a week) and the queue moves on;
     three refusals in a row look like a setup problem, so the run stops;
   - an account or setup error (401, 403, 404) records nothing and stops
     the run: no passage is to blame;
   - an outage-type error is retried on later runs, at most MAX_ATTEMPTS
     times per passage, and three in a row end the run (provider down).
   Any operational failure (provider down, account or setup error, storage
   or bank trouble) fails the workflow run, so it is noticed. */
import { createClient } from "@supabase/supabase-js";
import {
  BUCKET, TTS, LIMITS, SPEAK_MAX, QUEUE_ENTRY_MAX, canonicalRef, checkFailure, CHECK_VERSION, claimPassage, releasePassage, CLAIMS_DIR, claimNumber, claimName, readClaimFile, makeChecked, saveChecked, saveRejected, readRecord, passagePaths, validRequest, reserveSpend, quotaDay,
} from "../api/_speak.js";
import { verdictText, itemParts, voiceable } from "../src/read-aloud-script.js";

export const MAX_ATTEMPTS = 5;
const MAX_TRANSIENT_IN_A_ROW = 3;

/* Voice one passage. result: "voiced" | "failed" | "rejected" | "budget" |
   "service" | "storage" | "transient" | "busy" (being voiced elsewhere
   right now: left for the next run) | "decided" (finished elsewhere). */
async function voiceOne({ storage, apiKey, fetchImpl, text, now, limits }) {
  const claim = await claimPassage(storage, text, now);
  if (claim.state === "busy") return { result: "busy", spent: 0 };
  if (claim.state === "error") return { result: "storage", spent: 0, error: "could not claim the passage" };
  try {
    if (await readRecord(storage, text, TTS, now())) return { result: "decided", spent: 0 };
    return await voiceClaimed({ storage, apiKey, fetchImpl, text, now, limits, deadline: claim.deadline });
  } finally { await releasePassage(storage, claim); }
}
async function voiceClaimed({ storage, apiKey, fetchImpl, text, now, limits, deadline }) {
  const r = await makeChecked({ text, apiKey, fetchImpl, deadline, timeOf: now, beforeTake: () => reserveSpend(storage, { now: now(), limits }) });
  if (!r.final) {
    if (r.errorKind === "budget") return { result: "budget", spent: r.spent };
    if (r.errorKind === "service") return { result: "service", spent: r.spent, error: r.error };
    if (r.errorKind === "storage") return { result: "storage", spent: r.spent, error: r.error };
    if (r.errorKind === "permanent") {
      if (!(await saveRejected(storage, text, r.error, { now: now() }))) return { result: "transient", spent: r.spent, error: "could not save" };
      return { result: "rejected", spent: r.spent, error: r.error };
    }
    return { result: "transient", spent: r.spent, error: r.error ?? "no audio" };
  }
  if (!(await saveChecked(storage, text, r.best, { now: now() }))) return { result: "transient", spent: r.spent, error: "could not save" };
  return { result: r.best.check.pass ? "voiced" : "failed", spent: r.spent, similarity: r.best.check.similarity, why: r.best.check.pass ? null : checkFailure(r.best.check) };
}

async function readJsonFile(bucket, path, maxBytes = Infinity) {
  const { data, error } = await bucket.download(path);
  if (error) return { error };
  if (Number(data.size) > maxBytes) return { tooBig: true };
  const text = await data.text();
  if (text.length > maxBytes) return { tooBig: true };
  try { return { value: JSON.parse(text) }; } catch { return { malformed: true }; }
}
const put = (bucket, path, value) => bucket.upload(path, JSON.stringify(value), { contentType: "application/json", upsert: true });

/* One page of a lane, oldest first. */
async function lanePage(bucket, dir, offset) {
  const { data, error } = await bucket.list(dir, { limit: 1000, offset, sortBy: { column: "created_at", order: "asc" } });
  if (error) {
    if (/not found/i.test(String(error.message ?? error))) return { entries: [], last: true };
    throw new Error(`Could not list ${dir}: ${error.message ?? error}`);
  }
  return { entries: (data ?? []).filter((e) => e.name?.endsWith(".json")), last: !data || data.length < 1000 };
}

/* Two lanes: every fresh request (queue/) before any retry
   (queue-retry/), each oldest first. Entries are read one at a time, so a
   long queue never sits in memory. */
export async function drainQueue({ storage, apiKey, fetchImpl = fetch, max = 200, now = () => Date.now(), limits = LIMITS, log = console.log }) {
  const bucket = storage.from(BUCKET);
  const out = { queued: 0, voiced: 0, failed: 0, rejected: 0, retried: 0, skipped: 0, spent: 0, budget: false, providerDown: false, service: null, operational: false, errors: [] };
  let inARow = 0, refusedInARow = 0, done = 0;
  const touched = new Set(); // moved or rewritten this run: next run's work
  /* Every delete is checked: a failure is storage trouble (the run fails),
     never reported as done. */
  const removed = new Set();
  const drop = async (path) => {
    const { error } = await bucket.remove([path]);
    if (error) { out.operational = true; out.errors.push(`${path}: could not remove (${error.message ?? error})`); }
    else removed.add(path);
    return !error;
  };

  for (const lane of ["queue", "queue-retry"]) {
    /* Paged as far as the run gets. The next page starts after the entries
       that are still in the lane (removed ones shift the rest up), so no
       entry is skipped and undeletable entries never hide later work. */
    for (let offset = 0, more = true; more;) {
    const page = await lanePage(bucket, lane, offset);
    more = !page.last;
    const before = new Set(page.entries.map((e) => `${lane}/${e.name}`));
    for (const f of page.entries) {
      if (done >= max) return out;
      const path = `${lane}/${f.name}`;
      if (touched.has(path)) continue;
      // Oversized entries are not ours: dropped unread.
      if (Number(f.metadata?.size) > QUEUE_ENTRY_MAX) { await drop(path); out.skipped++; continue; }
      const got = await readJsonFile(bucket, path, QUEUE_ENTRY_MAX);
      if (got.error) { out.operational = true; out.errors.push(`${f.name}: could not read (${got.error.message ?? got.error})`); continue; }
      const raw = got.value;
      const ref = canonicalRef(raw?.ref);
      const paths = raw && typeof raw.text === "string" ? passagePaths(raw.text) : null;
      // A passage that is never voiced (voiceable) is not work: dropped, not refused.
      if (got.malformed || got.tooBig || !raw || raw.voice !== TTS.voice || !ref || !validRequest(ref, raw.seg, raw.text) || !voiceable(raw.text) || (lane === "queue" ? paths.queue : paths.retry) !== path) {
        await drop(path); out.skipped++; continue;
      }
      // Only the known fields are kept.
      const job = { text: raw.text, voice: raw.voice, ref, seg: raw.seg, requestedAt: String(raw.requestedAt ?? ""), attempts: Number.isInteger(raw.attempts) ? raw.attempts : 0, giveUp: typeof raw.giveUp === "string" ? raw.giveUp.slice(0, 200) : null };
      out.queued++;
      let decided;
      try { decided = await readRecord(storage, job.text, TTS, now()); } catch (e) {
        // An unreadable record is storage trouble: keep the work, spend nothing.
        out.operational = true; out.errors.push(`${job.ref.kind} ${job.ref.id} ${job.seg}: ${e.message}`); continue;
      }
      if (decided) { await drop(path); out.skipped++; continue; } // already decided
      /* Given up on earlier, but its record could not be saved then: save
         the record now (no synthesis); remove the entry only once it is. */
      if (job.giveUp) {
        if (await saveRejected(storage, job.text, job.giveUp, { now: now() })) { await drop(path); out.rejected++; }
        else { out.operational = true; out.errors.push(`${job.ref.kind} ${job.ref.id} ${job.seg}: could not save the give-up record`); }
        continue;
      }
      const v = await voiceOne({ storage, apiKey, fetchImpl, text: job.text, now, limits });
      out.spent += v.spent;
      if (v.result === "busy") continue; // being voiced elsewhere: next run
      if (v.result === "decided") { await drop(path); out.skipped++; continue; }
      done++;
      if (v.result === "budget") { out.budget = true; return out; }
      if (v.result === "service") { out.service = v.error; return out; }
      if (v.result === "storage") { out.operational = true; out.errors.push(`storage: ${v.error}`); return out; }
      if (v.result === "transient") {
        const attempts = job.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          const reason = `gave up after ${attempts} attempts: ${v.error}`;
          // The entry goes only once the record that ends its retries is saved.
          if (await saveRejected(storage, job.text, reason, { now: now() })) { await drop(path); out.rejected++; }
          else {
            // Keep the work: the original goes only once its replacement is saved.
            const { error: keepError } = await put(bucket, paths.retry, { ...job, attempts, giveUp: reason });
            touched.add(paths.retry);
            if (!keepError && path !== paths.retry) await drop(path);
            out.errors.push(`${job.ref.kind} ${job.ref.id} ${job.seg}: could not save the give-up record${keepError ? " (entry kept as it was)" : ""}`);
          }
        } else {
          // Into the retry lane, behind every fresh request.
          const { error: moveError } = await put(bucket, paths.retry, { ...job, attempts, lastError: String(v.error).slice(0, 200) });
          touched.add(paths.retry);
          if (!moveError && path !== paths.retry) await drop(path);
          if (moveError) out.errors.push(`${job.ref.kind} ${job.ref.id} ${job.seg}: could not move to the retry lane (entry kept as it was)`);
          out.retried++;
        }
        // Any provider or storage failure is an operational failure of the run,
        // even when processing carries on with the next entry.
        out.operational = true;
        out.errors.push(`${job.ref.kind} ${job.ref.id} ${job.seg}: ${v.error}`);
        if (++inARow >= MAX_TRANSIENT_IN_A_ROW) { out.providerDown = true; return out; }
        continue;
      }
      inARow = 0;
      await drop(path);
      refusedInARow = v.result === "rejected" ? refusedInARow + 1 : 0;
      if (v.result === "voiced") out.voiced++;
      else if (v.result === "rejected") {
        out.rejected++; log(`provider refused: ${job.ref.kind} ${job.ref.id} ${job.seg} (${v.error})`);
        if (refusedInARow >= MAX_TRANSIENT_IN_A_ROW) { out.service = `${refusedInARow} refusals in a row (${v.error})`; return out; }
      }
      else { out.failed++; log(`failed the check twice: ${job.ref.kind} ${job.ref.id} ${job.seg}: ${v.why}`); }
    }
    offset += [...before].filter((p) => !removed.has(p)).length;
    }
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
  return [...new Set(itemParts(kind, row).map((p) => p.text))].filter((t) => t && t.length <= SPEAK_MAX);
}

const KINDS = ["verdicts", "question", "case", "card"];
const RESCAN_DAYS = 7;
export const BANK_QUERIES = {
  question: (db) => db.from("questions").select("id, type, stem, options, extra, answer, rationale").eq("approved", true).is("exam_form", null),
  case: (db) => db.from("case_studies").select("id, title, intro, vitals, labs, note, steps").eq("approved", true).is("exam_form", null),
  card: (db) => db.from("flashcards").select("id, front, back").eq("approved", true),
};

export async function prewarmBank({ storage, db, apiKey, fetchImpl = fetch, max = 100, now = () => Date.now(), limits = LIMITS, page = 50, log = () => {} }) {
  const bucket = storage.from(BUCKET);
  // stopped: null (all done), "max" or "budget" (normal), or an operational failure (failed: true)
  const out = { voiced: 0, failed: 0, rejected: 0, spent: 0, budget: false, stopped: null, failure: false, cursor: null };
  const got = await readJsonFile(bucket, "prewarm/cursor.json");
  if (got.error && !/not found/i.test(String(got.error.message ?? got.error))) { out.stopped = `cursor: ${got.error.message ?? got.error}`; out.failure = true; return out; }
  let cursor = got.value ?? { kind: KINDS[0], afterId: 0 };
  /* A new version of the voice check starts the scan again from the top:
     passed passages are skipped at once, and ones the older check turned
     away are voiced again (readRecord). */
  if ((cursor.check ?? 1) !== CHECK_VERSION) cursor = { kind: KINDS[0], afterId: 0 };
  if (cursor.done) {
    // A finished pass is repeated weekly, to pick up new bank items.
    if (now() - Date.parse(cursor.doneAt ?? 0) < RESCAN_DAYS * 86400000) { out.cursor = cursor; return out; }
    cursor = { kind: KINDS[0], afterId: 0 };
  }
  let done = 0, refusedInARow = 0;
  const save = async () => {
    const { error } = await put(bucket, "prewarm/cursor.json", { ...cursor, check: CHECK_VERSION });
    if (error) throw new Error(`could not save the cursor: ${error.message ?? error}`);
  };
  const voice = async (texts, label) => {
    for (const text of texts) {
      let decided;
      try { decided = await readRecord(storage, text, TTS, now()); } catch (e) { out.failure = true; return `storage: ${e.message}`; }
      if (decided) continue;
      // Waiting in the queue (fresh or retry): the queue owns it and its attempt count.
      const paths = passagePaths(text);
      const waiting = await Promise.all([paths.queue, paths.retry].map((p) => bucket.download(p)));
      if (waiting.some((w) => !w.error)) continue;
      const unreadable = waiting.find((w) => w.error && !/not.?found|404/i.test(`${w.error.message ?? ""} ${w.error.statusCode ?? ""}`));
      if (unreadable) { out.failure = true; return `storage: could not read the queue (${unreadable.error.message ?? unreadable.error})`; }
      if (done >= max) return "max";
      done++;
      const v = await voiceOne({ storage, apiKey, fetchImpl, text, now, limits });
      out.spent += v.spent;
      if (v.result === "decided") continue;
      if (v.result === "busy") return "busy"; // being voiced elsewhere: this item again next run
      if (v.result === "budget") { out.budget = true; return "budget"; }
      if (v.result === "storage") { out.failure = true; return `storage: ${v.error}`; }
      if (v.result === "service") { out.failure = true; return `provider: ${v.error}`; }
      if (v.result === "transient") {
        /* Bounded like queued work: the attempts live in the cursor, and at
           MAX_ATTEMPTS the passage gets a give-up record (reconsidered
           after a week) so the scan moves on instead of paying for it on
           every run. */
        const key = passagePaths(text).key;
        const attempts = ((cursor.attempts ?? {})[key] ?? 0) + 1;
        out.failure = true;
        if (attempts >= MAX_ATTEMPTS) {
          if (!(await saveRejected(storage, text, `gave up after ${attempts} attempts: ${v.error}`, { now: now() }))) return `storage: could not save the give-up record`;
          const { [key]: _, ...rest } = cursor.attempts ?? {};
          cursor = { ...cursor, attempts: rest };
          out.rejected++;
          continue;
        }
        cursor = { ...cursor, attempts: { ...(cursor.attempts ?? {}), [key]: attempts } };
        return `provider: ${v.error}`;
      }
      if (cursor.attempts?.[passagePaths(text).key]) {
        const { [passagePaths(text).key]: _, ...rest } = cursor.attempts;
        cursor = { ...cursor, attempts: rest };
      }
      refusedInARow = v.result === "rejected" ? refusedInARow + 1 : 0;
      out[v.result]++;
      if (v.result === "failed") log(`failed the check twice: ${label}: ${v.why}`);
      if (refusedInARow >= MAX_TRANSIENT_IN_A_ROW) { out.failure = true; return `provider: ${refusedInARow} refusals in a row (${v.error})`; }
    }
    return null;
  };

  while (cursor.kind) {
    if (cursor.kind === "verdicts") {
      const stop = await voice(verdictPassages(), "result line");
      if (stop) { out.stopped = stop; await save(); break; } // keeps the attempt counts
      cursor = { kind: "question", afterId: 0, attempts: cursor.attempts }; await save(); continue;
    }
    const { data: rows, error } = await BANK_QUERIES[cursor.kind](db).gt("id", cursor.afterId).order("id").limit(page);
    if (error) { out.stopped = `bank: ${error.message ?? error}`; out.failure = true; break; }
    if (!rows?.length) {
      const next = KINDS[KINDS.indexOf(cursor.kind) + 1];
      cursor = next ? { kind: next, afterId: 0, attempts: cursor.attempts } : { done: true, doneAt: new Date(now()).toISOString() };
      await save();
      if (!next) break;
      continue;
    }
    let stop = null;
    for (const row of rows) {
      stop = await voice(itemPassages(cursor.kind, row), `${cursor.kind} ${row.id}`);
      if (stop) break;
      cursor = { kind: cursor.kind, afterId: row.id, attempts: cursor.attempts }; // an item counts as done only when all its passages are decided
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
  // A listing error is storage trouble and fails the run (runJob); an
  // absent usage folder simply lists empty.
  const days = (await listAll(bucket, "usage")).map((e) => e.name).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < oldest);
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
  removed += await pruneClaims({ bucket, now });
  return { days: days.length, removed };
}

/* Old passage claims: every number below a folder's newest, with its
   finished marker, once the newest is a day old (long past any lease). The
   newest is kept, so a folder's numbers never start again.
   Every voiced passage keeps a folder, so the folders are visited a fixed
   number per run (CLAIM_PRUNE.folders), in name order from a saved cursor,
   wrapping round: each run's cost is bounded whatever the size of the
   library. Most folders hold one claim and cost one listing; only a
   folder with older numbers has its newest claim read. */
export const CLAIM_PRUNE = { folders: 200 };
const CLAIM_CURSOR = "prune/claims-cursor.json";
export async function pruneClaims({ bucket, now }) {
  const got = await readJsonFile(bucket, CLAIM_CURSOR);
  if (got.error && !/not found/i.test(String(got.error.message ?? got.error))) throw new Error(`Could not read the claims cursor: ${got.error.message ?? got.error}`);
  const offset = Number.isInteger(got.value?.offset) && got.value.offset >= 0 ? got.value.offset : 0;
  const { data, error } = await bucket.list(CLAIMS_DIR, { limit: CLAIM_PRUNE.folders, offset, sortBy: { column: "name", order: "asc" } });
  if (error && !/not found/i.test(String(error.message ?? error))) throw new Error(`Could not list ${CLAIMS_DIR}: ${error.message ?? error}`);
  const folders = data ?? [];
  const stale = [];
  for (const folder of folders) {
    const dir = `${CLAIMS_DIR}/${folder.name}`;
    const { data: inside, error: listError } = await bucket.list(dir, { limit: 1000 });
    if (listError) throw new Error(`Could not list ${dir}: ${listError.message ?? listError}`);
    const names = (inside ?? []).map((f) => f.name);
    const numbers = names.map((n) => claimNumber(n.replace(/\.done$/, ""))).filter(Number.isFinite);
    const top = Math.max(0, ...numbers);
    if (!numbers.some((n) => n < top)) continue; // nothing older than the newest
    const newest = await readClaimFile(bucket, `${dir}/${claimName(top)}`);
    if (newest.error) throw new Error(`Could not read a claim: ${newest.error.message ?? newest.error}`);
    if (newest.missing || now - newest.since <= 86400000) continue;
    for (const n of names) {
      const num = claimNumber(n.replace(/\.done$/, ""));
      if (Number.isFinite(num) && num < top) stale.push(`${dir}/${n}`);
    }
  }
  for (let i = 0; i < stale.length; i += 1000) {
    const { error: rmError } = await bucket.remove(stale.slice(i, i + 1000));
    if (rmError) throw new Error(`Could not remove old claims: ${rmError.message ?? rmError}`);
  }
  // Folders are never removed (each keeps its newest claim), so offsets stay put.
  const next = folders.length < CLAIM_PRUNE.folders ? 0 : offset + folders.length;
  const { error: saveError } = await put(bucket, CLAIM_CURSOR, { offset: next });
  if (saveError) throw new Error(`Could not save the claims cursor: ${saveError.message ?? saveError}`);
  return stale.length;
}

/* One scheduled run: the queue, then the bank with what is left, then
   pruning. failed: true for any operational failure, which fails the
   workflow run. Caps always come from LIMITS (api/_speak.js), the same
   values the route uses. */
export async function runJob({ storage, db, apiKey, max = 200, fetchImpl = fetch, now = () => Date.now(), limits = LIMITS, log = console.log }) {
  let q;
  try { q = await drainQueue({ storage, apiKey, fetchImpl, max, now, limits, log }); }
  catch (e) { q = { queued: 0, voiced: 0, failed: 0, rejected: 0, retried: 0, skipped: 0, spent: 0, budget: false, providerDown: false, service: null, errors: [String(e?.message ?? e)], broken: true }; }
  const left = Math.max(0, max - (q.voiced + q.failed + q.rejected + q.retried));
  // The bank waits for a clean queue run: after any operational failure the
  // provider or storage is suspect, and nothing more is spent this run.
  const skip = q.budget || q.providerDown || q.service || q.broken || q.operational || !left;
  let w;
  try { w = skip ? { voiced: 0, failed: 0, rejected: 0, spent: 0, stopped: "skipped", failure: false } : await prewarmBank({ storage, db, apiKey, fetchImpl, max: left, now, limits, log }); }
  catch (e) { w = { voiced: 0, failed: 0, rejected: 0, spent: 0, stopped: String(e?.message ?? e), failure: true }; }
  const pruned = await pruneUsage({ storage, now: now() }).catch((e) => ({ error: String(e?.message ?? e) }));
  const lines = [
    `Queue: ${q.queued} waiting · ${q.voiced} voiced and checked · ${q.failed} failed the check twice · ${q.rejected} refused or given up · ${q.retried} to retry · ${q.skipped} skipped`,
    `Bank: ${w.voiced} voiced and checked · ${w.failed} failed the check twice · ${w.rejected} refused${w.stopped ? ` · stopped: ${w.stopped}` : ""}${w.cursor ? ` · next: ${w.cursor.done ? "done" : `${w.cursor.kind} after ${w.cursor.afterId}`}` : ""}`,
    `Syntheses paid: ${q.spent + w.spent} (cap ${limits.spend} a day)${q.budget || w.budget ? " · today's voice budget is used up; the rest wait" : ""} · old budget slots removed: ${pruned.removed ?? 0}`,
    ...(q.service ? [`error: provider account or setup: ${q.service}`] : []),
    ...q.errors.map((e) => `error: ${e}`),
    ...(pruned.error ? [`error: pruning: ${pruned.error}`] : []),
  ];
  const failed = !!(q.broken || q.operational || q.providerDown || q.service || w.failure || pruned.error);
  /* More to do right away: the run stopped at its own limit (the queue
     used it all, or the bank scan reached it), not at today's budget, the
     end of the work, or a failure. The workflow then starts the next run. */
  const more = !failed && !q.budget && !w.budget && (w.stopped === "max" || !left);
  return { lines, failed, more, queue: q, bank: w, pruned };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    console.error("Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY.");
    process.exit(1);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const max = Math.max(1, Math.min(2000, Number(process.env.READ_ALOUD_MAX) || 200));
  const { lines, failed, more } = await runJob({ storage: db.storage, db, apiKey: OPENAI_API_KEY, max });
  console.log(lines.join("\n") + (more ? "\nMore to do: starting the next run." : ""));
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `more=${more ? "true" : "false"}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n\n") + "\n");
  }
  if (failed) process.exit(1);
}
