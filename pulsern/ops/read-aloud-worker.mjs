#!/usr/bin/env node
/* The read-aloud voice job (.github/workflows/pulsern-read-aloud.yml).
   ------------------------------------------------------------------
   The app's server holds no cloud key. This job, on the default branch in
   the pulsern-paid environment, speaks each passage once with Amazon Polly
   Neural (Joanna, mp3). The text is the bank script after the same
   normaliser the screen uses. Polly does not rewrite it, so there is no
   transcription and no retake. A part with no clip yet is shown on screen.

   1. The queue first. When a student presses Listen on something not yet
      voiced, the server checks the request against the bank and queues
      every part of that item (api/_speak.js); the app says the voice is
      being prepared. Queued parts are voiced oldest first, retried parts
      after fresh ones.
   2. Then the bank. Spare capacity voices the bank ahead of demand:
      every case study, every flashcard, then every practice question with
      its explanation, in id order, resuming where the last run stopped
      (prewarm/cursor.json). Cases and cards come first: they are fewer
      and had no voice at all, while practice was already partly voiced.
      Readiness-exam items are never voiced.

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
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PollyClient } from "@aws-sdk/client-polly";
import {
  BUCKET, TTS, MARIN_TTS, LIMITS, SPEAK_MAX, QUEUE_ENTRY_MAX, canonicalRef, checkFailure, CHECK_VERSION, retried, claimPassage, releasePassage, CLAIMS_DIR, claimNumber, claimName, readClaimFile, makeChecked, saveChecked, saveRejected, readRecord, passagePaths, speechKey, validRequest,   reserveSpeechCost, pollyInput, readAloudLimits, quotaDay, POLLY_USD_PER_MILLION,
} from "../api/_speak.js";
import { verdictText, itemParts, voiceable } from "../src/read-aloud-script.js";

export const MAX_ATTEMPTS = 5;
const MAX_TRANSIENT_IN_A_ROW = 3;

/* Voice one passage. result: "voiced" | "failed" | "rejected" | "budget" |
   "service" | "storage" | "transient" | "busy" (being voiced elsewhere
   right now: left for the next run) | "decided" (finished elsewhere). */
async function voiceOne({ storage, polly, fetchImpl, text, now, limits }) {
  const claim = await claimPassage(storage, text, now);
  if (claim.state === "busy") return { result: "busy", spent: 0 };
  if (claim.state === "error") return { result: "storage", spent: 0, error: "could not claim the passage" };
  try {
    if (await readRecord(storage, text, TTS, now())) return { result: "decided", spent: 0 };
    return await voiceClaimed({ storage, polly, fetchImpl, text, now, limits, deadline: claim.deadline });
  } finally { await releasePassage(storage, claim); }
}
async function voiceClaimed({ storage, polly, fetchImpl, text, now, limits, deadline }) {
  const billed = pollyInput(text).billed ?? String(text).length;
  const r = await makeChecked({ text, polly, fetchImpl, deadline, timeOf: now, beforeTake: () => reserveSpeechCost(storage, billed, { now: now(), limits }) });
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
  return { result: r.best.check.pass ? "voiced" : "failed", spent: r.spent, chars: r.best.check.pass ? billed : 0, similarity: r.best.check.similarity, why: r.best.check.pass ? null : checkFailure(r.best.check) };
}

async function readJsonFile(bucket, path, maxBytes = Infinity) {
  const { data, error } = await retried(() => bucket.download(path));
  if (error) return { error };
  if (Number(data.size) > maxBytes) return { tooBig: true };
  const text = await data.text();
  if (text.length > maxBytes) return { tooBig: true };
  try { return { value: JSON.parse(text) }; } catch { return { malformed: true }; }
}
const put = (bucket, path, value) => bucket.upload(path, JSON.stringify(value), { contentType: "application/json", upsert: true });

/* One page of a lane, oldest first. */
async function lanePage(bucket, dir, offset) {
  const { data, error } = await retried(() => bucket.list(dir, { limit: 1000, offset, sortBy: { column: "created_at", order: "asc" } }));
  if (error) {
    if (/not found/i.test(String(error.message ?? error))) return { entries: [], last: true };
    throw new Error(`Could not list ${dir}: ${error.message ?? error}`);
  }
  return { entries: (data ?? []).filter((e) => e.name?.endsWith(".json")), last: !data || data.length < 1000 };
}

/* Two lanes: every fresh request (queue/) before any retry
   (queue-retry/), each oldest first. Entries are read one at a time, so a
   long queue never sits in memory. */
/* onChecked: called for every passage that got a verdict (voiced, or
   failed the check), so the caller knows work was done even if a later
   step throws. */
export async function drainQueue({ storage, polly, apiKey, fetchImpl = fetch, max = 200, now = () => Date.now(), limits = LIMITS, log = console.log, until = Infinity, onChecked = () => {}, preserveLegacy = false }) {
  const bucket = storage.from(BUCKET);
  const out = { queued: 0, voiced: 0, failed: 0, rejected: 0, retried: 0, skipped: 0, spent: 0, chars: 0, budget: false, providerDown: false, service: null, operational: false, errors: [] };
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
      if (now() >= until) { out.timeUp = true; return out; } // the run's time is up: the rest waits for the next run
      const path = `${lane}/${f.name}`;
      if (touched.has(path)) continue;
      // Oversized entries are not ours: dropped unread.
      if (Number(f.metadata?.size) > QUEUE_ENTRY_MAX) { await drop(path); out.skipped++; continue; }
      const got = await readJsonFile(bucket, path, QUEUE_ENTRY_MAX);
      if (got.error) { out.operational = true; out.errors.push(`${f.name}: could not read (${got.error.message ?? got.error})`); continue; }
      const raw = got.value;
      /* The revoice walk has not finished. A marin request still in the
         queue is waiting for the next slice; deleting it here would drop
         a student's ask that has no saved clip to recover it from. */
      if (preserveLegacy && raw?.voice === MARIN_TTS.voice) continue;
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
      const v = await voiceOne({ storage, polly, fetchImpl, text: job.text, now, limits });
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
      if (v.result === "voiced" || v.result === "failed") onChecked();
      if (v.result === "voiced") { out.voiced++; out.chars += v.chars ?? 0; if (out.voiced % 20 === 0) log(`Voiced ${out.voiced} clips · ${out.chars} characters · $${((out.chars / 1_000_000) * POLLY_USD_PER_MILLION).toFixed(2)}`); }
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

const KINDS = ["verdicts", "case", "card", "question"];
/* The scan order's version. A cursor saved under the old order (questions
   first) moves to the case studies, and keeps where the questions were,
   so they resume there after the cards (nothing voiced is lost: a passage
   with a record is skipped at once). */
export const SCAN_ORDER = 2;
const RESCAN_DAYS = 7;
export const BANK_QUERIES = {
  question: (db) => db.from("questions").select("id, type, stem, options, extra, answer, rationale").eq("approved", true).is("exam_form", null),
  case: (db) => db.from("case_studies").select("id, title, intro, vitals, labs, note, steps").eq("approved", true).is("exam_form", null),
  card: (db) => db.from("flashcards").select("id, front, back").eq("approved", true),
};

export async function prewarmBank({ storage, db, polly, apiKey, fetchImpl = fetch, max = 100, now = () => Date.now(), limits = LIMITS, page = 50, log = () => {}, until = Infinity, onChecked = () => {} }) {
  const bucket = storage.from(BUCKET);
  // stopped: null (all done), "max" or "budget" (normal), or an operational failure (failed: true)
  const out = { voiced: 0, failed: 0, rejected: 0, spent: 0, chars: 0, budget: false, stopped: null, failure: false, cursor: null };
  const got = await readJsonFile(bucket, "prewarm/cursor.json");
  if (got.error && !/not found/i.test(String(got.error.message ?? got.error))) { out.stopped = `cursor: ${got.error.message ?? got.error}`; out.failure = true; return out; }
  let cursor = got.value ?? { kind: KINDS[0], afterId: 0 };
  /* A new version of the voice check starts the scan again from the top:
     passed passages are skipped at once, and ones the older check turned
     away are voiced again (readRecord). */
  /* A new check, or a new voice, starts again from the top. Passed
     passages are skipped at once. A cursor with no voice is the marin
     scan, so the change to Joanna does not leave its place behind. */
  if ((cursor.check ?? 1) !== CHECK_VERSION || cursor.voice !== TTS.voice) cursor = { kind: KINDS[0], afterId: 0, voice: TTS.voice };
  else if (!cursor.done && cursor.order !== SCAN_ORDER && cursor.kind && cursor.kind !== "verdicts") {
    cursor = { kind: "case", afterId: 0, attempts: cursor.attempts, questionsFrom: cursor.kind === "question" ? cursor.afterId : 0 };
  }
  if (cursor.done) {
    // A finished pass is repeated weekly, to pick up new bank items.
    if (now() - Date.parse(cursor.doneAt ?? 0) < RESCAN_DAYS * 86400000) { out.cursor = cursor; return out; }
    cursor = { kind: KINDS[0], afterId: 0 };
  }
  let done = 0, refusedInARow = 0;
  const save = async () => {
    const { error } = await put(bucket, "prewarm/cursor.json", { ...cursor, check: CHECK_VERSION, voice: TTS.voice, order: SCAN_ORDER });
    if (error) throw new Error(`could not save the cursor: ${error.message ?? error}`);
  };
  /* Voice a group of passages (the result lines, or one bank item). If a
     run stops part-way through a group, the cursor keeps where: the group
     (atItem), the index (at) and a fingerprint of the whole ordered group
     (atKey). The next run resumes there only if the same group is still
     exactly the same; if the item was withdrawn or any of its passages
     edited, it starts the group from the top (cached passages are skipped
     at once), so nothing is ever skipped unvoiced. The position is dropped
     once the group is done. */
  const groupKey = (texts) => createHash("sha256").update(texts.map((t) => passagePaths(t).key).join("\n")).digest("hex").slice(0, 32);
  const resumeAt = (texts, label) => {
    const i = cursor.at;
    return cursor.atItem === label && Number.isInteger(i) && i >= 0 && i < texts.length && cursor.atKey === groupKey(texts) ? i : 0;
  };
  const voice = async (texts, label) => {
    const key = groupKey(texts);
    for (let i = resumeAt(texts, label); i < texts.length; i++) {
      const text = texts[i];
      cursor = { ...cursor, at: i, atItem: label, atKey: key };
      // The run's time is checked before every passage, cached ones included.
      if (now() >= until) return "max";
      let decided;
      try { decided = await readRecord(storage, text, TTS, now()); } catch (e) { out.failure = true; return `storage: ${e.message}`; }
      if (decided) continue;
      // Waiting in the queue (fresh or retry): the queue owns it and its attempt count.
      const paths = passagePaths(text);
      const waiting = await Promise.all([paths.queue, paths.retry].map((p) => retried(() => bucket.download(p))));
      if (waiting.some((w) => !w.error)) continue;
      const unreadable = waiting.find((w) => w.error && !/not.?found|404/i.test(`${w.error.message ?? ""} ${w.error.statusCode ?? ""}`));
      if (unreadable) { out.failure = true; return `storage: could not read the queue (${unreadable.error.message ?? unreadable.error})`; }
      if (done >= max || now() >= until) return "max"; // the run's limit, in passages or in time
      done++;
      const v = await voiceOne({ storage, polly, fetchImpl, text, now, limits });
      out.spent += v.spent;
      if (v.result === "decided") continue;
      if (v.result === "busy") return "busy"; // being voiced elsewhere: this item again next run
      if (v.result === "budget") { out.budget = true; return "budget"; }
      if (v.result === "storage") { out.failure = true; return `storage: ${v.error}`; }
      if (v.result === "service") { out.failure = true; out.service = v.error; return `provider: ${v.error}`; }
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
      if (v.result === "voiced") out.chars += v.chars ?? 0;
      if (v.result === "voiced" || v.result === "failed") onChecked();
      if (v.result === "failed") log(`failed the check twice: ${label}: ${v.why}`);
      if (refusedInARow >= MAX_TRANSIENT_IN_A_ROW) { out.failure = true; return `provider: ${refusedInARow} refusals in a row (${v.error})`; }
    }
    return null;
  };

  while (cursor.kind) {
    if (now() >= until) { out.stopped = "max"; await save(); break; }
    if (cursor.kind === "verdicts") {
      const stop = await voice(verdictPassages(), "result lines");
      if (stop) { out.stopped = stop; await save(); break; } // keeps the attempt counts
      cursor = { kind: KINDS[1], afterId: 0, attempts: cursor.attempts }; await save(); continue;
    }
    const { data: rows, error } = await BANK_QUERIES[cursor.kind](db).gt("id", cursor.afterId).order("id").limit(page);
    if (error) { out.stopped = `bank: ${error.message ?? error}`; out.failure = true; break; }
    if (!rows?.length) {
      const next = KINDS[KINDS.indexOf(cursor.kind) + 1];
      const from = next === "question" ? Number(cursor.questionsFrom) || 0 : 0;
      cursor = next ? { kind: next, afterId: from, attempts: cursor.attempts, ...(next !== "question" && cursor.questionsFrom ? { questionsFrom: cursor.questionsFrom } : {}) } : { done: true, doneAt: new Date(now()).toISOString() };
      await save();
      if (!next) break;
      continue;
    }
    let stop = null;
    for (const row of rows) {
      stop = await voice(itemPassages(cursor.kind, row), `${cursor.kind} ${row.id}`);
      if (stop) break;
      cursor = { kind: cursor.kind, afterId: row.id, attempts: cursor.attempts, ...(cursor.questionsFrom ? { questionsFrom: cursor.questionsFrom } : {}) }; // an item counts as done only when all its passages are decided
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
export async function runJob({ storage, db, polly, apiKey, max = 200, fetchImpl = fetch, now = () => Date.now(), limits = LIMITS, log = console.log, until = Infinity, preserveLegacy = false }) {
  let q, checked = 0;
  const onChecked = () => { checked++; };
  try { q = await drainQueue({ storage, polly, apiKey, fetchImpl, max, now, limits, log, until, onChecked, preserveLegacy }); }
  catch (e) { q = { queued: 0, voiced: 0, failed: 0, rejected: 0, retried: 0, skipped: 0, spent: 0, budget: false, providerDown: false, service: null, errors: [String(e?.message ?? e)], broken: true }; }
  const left = Math.max(0, max - (q.voiced + q.failed + q.rejected + q.retried));
  // The bank waits for a clean queue run: after any operational failure the
  // provider or storage is suspect, and nothing more is spent this run.
  const skip = q.budget || q.providerDown || q.service || q.broken || q.operational || q.timeUp || !left;
  let w;
  try { w = skip ? { voiced: 0, failed: 0, rejected: 0, spent: 0, stopped: "skipped", failure: false } : await prewarmBank({ storage, db, polly, apiKey, fetchImpl, max: left, now, limits, log, until, onChecked }); }
  catch (e) { w = { voiced: 0, failed: 0, rejected: 0, spent: 0, stopped: String(e?.message ?? e), failure: true }; }
  const pruned = await pruneUsage({ storage, now: now() }).catch((e) => ({ error: String(e?.message ?? e) }));
  const lines = [
    `Queue: ${q.queued} waiting · ${q.voiced} voiced and checked · ${q.failed} failed the check twice · ${q.rejected} refused or given up · ${q.retried} to retry · ${q.skipped} skipped`,
    `Bank: ${w.voiced} voiced and checked · ${w.failed} failed the check twice · ${w.rejected} refused${w.stopped ? ` · stopped: ${w.stopped}` : ""}${w.cursor ? ` · next: ${w.cursor.done ? "done" : `${w.cursor.kind} after ${w.cursor.afterId}`}` : ""}`,
    `Syntheses paid: ${q.spent + w.spent} (cap ${limits.spend} a day${limits.usd ? `, $${limits.usd} Polly` : ""})${q.budget || w.budget ? " · today's voice budget is used up; the rest wait" : ""} · old budget slots removed: ${pruned.removed ?? 0}`,
    `Voiced ${q.voiced + (w.voiced ?? 0)} clips · ${(q.chars ?? 0) + (w.chars ?? 0)} characters · $${(((q.chars ?? 0) + (w.chars ?? 0)) / 1_000_000 * POLLY_USD_PER_MILLION).toFixed(2)}`,
    ...(q.service ? [`error: provider account or setup: ${q.service}`] : []),
    ...q.errors.map((e) => `error: ${e}`),
    ...(pruned.error ? [`error: pruning: ${pruned.error}`] : []),
  ];
  const failed = !!(q.broken || q.operational || q.providerDown || q.service || w.failure || pruned.error);
  /* More to do right away: the run stopped at its own limit (the queue
     used it all, or the bank scan reached it), not at today's budget, the
     end of the work, or a failure. The workflow then starts the next run. */
  /* After a failure the job carries on only if this run still got work
     done (passages voiced and checked: a brief blip, not an outage), and
     the workflow waits before it starts the next run. A provider refusal
     is not progress, and a setup problem (the repeated-refusal breaker,
     or an account or setup error) never chains, whatever came before. */
  // Counted as it happened, so work done before a step threw still counts.
  const progress = checked > 0;
  const setup = !!q.service || !!w.service || /refusals in a row/.test(String(w.stopped ?? ""));
  const more = !setup && !q.budget && !w.budget && (failed ? progress : (w.stopped === "max" || !left || !!q.timeUp));
  return { lines, failed, more, progress, setup, queue: q, bank: w, pruned };
}

/* Passages that already have an OpenAI marin clip, queued once so the
   new voice replaces them before the rest of the bank. Exam rows are not
   in BANK_QUERIES. A missing marin folder is an empty list, not an error. */
const REVOICE_MARKER = "prewarm/polly-revoice.json";
async function ensureBucket(storage) {
  const { error } = await storage.createBucket(BUCKET, { public: false });
  if (!error) return;
  const msg = `${error.message ?? ""} ${error.statusCode ?? ""} ${error.error ?? ""}`;
  if (/exist|duplicate|409/i.test(msg)) return;
  throw new Error(`could not create the voice bucket: ${error.message ?? error}`);
}
async function listFileNames(bucket, dir) {
  const names = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await retried(() => bucket.list(dir, { limit: 1000, offset }));
    if (error) {
      if (/not.?found|404/i.test(String(error.message ?? error))) return names;
      throw new Error(`Could not list ${dir}: ${error.message ?? error}`);
    }
    for (const e of data ?? []) if (typeof e.name === "string" && e.id !== null && e.id !== undefined) names.push(e.name);
    if (!data || data.length < 1000) return names;
  }
}
/* A pending marin request is rewritten onto the Joanna queue only when
   its words are still exactly a part of that approved, non-exam item. */
async function migrateLegacyLane(bucket, db, lane, room = () => true) {
  let moved = 0;
  let finished = true;
  for (const name of await listFileNames(bucket, lane)) {
    if (!room()) { finished = false; break; }
    if (!name.endsWith(".json")) continue;
    const path = `${lane}/${name}`;
    const got = await readJsonFile(bucket, path, QUEUE_ENTRY_MAX);
    /* A missing file was removed by another run. Any other read failure
       stops the migration: the done marker must not be written while a
       request is still unreadable, or the next run would delete it for
       having the old voice. */
    if (got.error) {
      if (/not.?found|404/i.test(`${got.error.message ?? ""} ${got.error.statusCode ?? ""}`)) continue;
      throw new Error(`could not read a legacy request: ${got.error.message ?? got.error}`);
    }
    if (got.tooBig || got.malformed || !got.value || got.value.voice === TTS.voice) continue;
    if (got.value.voice !== MARIN_TTS.voice) continue;
    const raw = got.value;
    const ref = canonicalRef(raw.ref);
    const drop = async () => { const { error } = await bucket.remove([path]); if (error) throw new Error(`could not drop ${path}: ${error.message ?? error}`); };
    if (!ref || !validRequest(ref, raw.seg, raw.text) || !voiceable(raw.text)) { await drop(); continue; }
    const built = BANK_QUERIES[ref.kind](db).eq("id", ref.id);
    const { data, error } = typeof built.maybeSingle === "function" ? await built.maybeSingle() : await built;
    if (error) throw new Error(`bank: ${error.message ?? error}`);
    const row = Array.isArray(data) ? data.find((r) => r.id === ref.id) : data;
    if (!row || !itemParts(ref.kind, row).some((p) => p.text === raw.text)) { await drop(); continue; }
    const paths = passagePaths(raw.text, TTS);
    const dest = lane === "queue-retry" ? paths.retry : paths.queue;
    const entry = { text: raw.text, voice: TTS.voice, ref, seg: raw.seg, requestedAt: raw.requestedAt ?? new Date().toISOString(), legacy: "marin" };
    if (Number.isInteger(raw.attempts)) entry.attempts = raw.attempts;
    if (typeof raw.giveUp === "string") entry.giveUp = raw.giveUp;
    if (JSON.stringify(entry).length > QUEUE_ENTRY_MAX) { await drop(); continue; }
    const { error: up } = await put(bucket, dest, entry);
    if (up) throw new Error(`could not move a legacy request: ${up.message ?? up}`);
    if (dest !== path) await drop();
    moved++;
  }
  return { moved, finished };
}
const REVOICE_AT = "prewarm/polly-revoice-at.json";
const queuedKey = (name) => {
  const prefix = `${TTS.voice}-`;
  return name.startsWith(prefix) && name.endsWith(".json") ? name.slice(prefix.length, -".json".length) : null;
};
/* One listing of the Joanna queue, not a download per passage. */
async function queuedJoannaKeys(bucket) {
  const keys = new Set();
  for (const dir of ["queue", "queue-retry"]) {
    for (const name of await listFileNames(bucket, dir)) {
      const key = queuedKey(name);
      if (key) keys.add(key);
    }
  }
  return keys;
}
export async function queueLegacyMarin({ storage, db, log = () => {}, page = 200, until = Infinity, now = () => Date.now() }) {
  await ensureBucket(storage);
  const bucket = storage.from(BUCKET);
  const got = await readJsonFile(bucket, REVOICE_MARKER);
  if (got.error && !/not.?found|404/i.test(String(got.error.message ?? got.error))) throw new Error(`could not read the revoice marker: ${got.error.message ?? got.error}`);
  if (got.value?.done) return { queued: 0, moved: 0, already: true, done: true };
  /* The caller passes the run's deadline. Requeueing may use about a third
     of it; the rest is for speaking the clips already waiting. */
  const started = now();
  const budget = Number.isFinite(until) ? Math.max(0, until - started) : Infinity;
  const stopAt = Number.isFinite(budget) ? started + Math.floor(budget / 3) : Infinity;
  const room = () => now() < stopAt;
  const atFile = await readJsonFile(bucket, REVOICE_AT);
  if (atFile.error && !/not.?found|404/i.test(String(atFile.error.message ?? atFile.error))) throw new Error(`could not read the revoice place: ${atFile.error.message ?? atFile.error}`);
  const place = { kind: "question", afterId: 0, ...(atFile.value ?? {}) };
  const savePlace = async () => {
    const { error } = await put(bucket, REVOICE_AT, place);
    if (error) throw new Error(`could not save the revoice place: ${error.message ?? error}`);
  };
  let moved = 0;
  if (place.pending !== "done") {
    for (const lane of ["queue", "queue-retry"]) {
      const step = await migrateLegacyLane(bucket, db, lane, room);
      moved += step.moved;
      if (!step.finished) {
        log(`Requeued ${moved} pending marin requests; pausing so clips can be voiced.`);
        return { queued: 0, moved, done: false, already: false };
      }
    }
    place.pending = "done";
    await savePlace();
  }
  const legacy = new Set((await listFileNames(bucket, MARIN_TTS.voice)).filter((n) => n.endsWith(".mp3")).map((n) => n.slice(0, -4)));
  const have = await queuedJoannaKeys(bucket);
  const kinds = ["question", "case", "card"];
  let kind = kinds.includes(place.kind) ? place.kind : "question";
  let queued = 0;
  const batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const group = batch.splice(0, batch.length);
    const results = await Promise.all(group.map((e) => put(bucket, e.path, e.entry)));
    const bad = results.find((r) => r?.error);
    if (bad?.error) throw new Error(`could not queue a legacy clip: ${bad.error.message ?? bad.error}`);
  };
  let paused = false;
  while (kind && !paused) {
    const { data: rows, error } = await BANK_QUERIES[kind](db).gt("id", place.afterId ?? 0).order("id").limit(page);
    if (error) throw new Error(`bank: ${error.message ?? error}`);
    if (!rows?.length) {
      kind = kinds[kinds.indexOf(kind) + 1];
      place.kind = kind;
      place.afterId = 0;
      continue;
    }
    for (const row of rows) {
      if (!room()) { paused = true; break; }
      for (const part of itemParts(kind, row)) {
        const text = part.text;
        if (!text || text.length > SPEAK_MAX || !voiceable(text) || !legacy.has(speechKey(text, MARIN_TTS))) continue;
        const paths = passagePaths(text, TTS);
        if (have.has(paths.key)) continue;
        const entry = { text, voice: TTS.voice, ref: part.ref, seg: part.seg, requestedAt: new Date(now()).toISOString(), legacy: "marin" };
        if (JSON.stringify(entry).length > QUEUE_ENTRY_MAX) continue;
        batch.push({ path: paths.queue, entry });
        have.add(paths.key);
        queued++;
        if (queued % 100 === 0) log(`Requeued ${queued} marin passages.`);
        if (batch.length >= 25) await flush();
      }
      /* The place moves past this row only after its passages are stored.
         A failed flush leaves the place where it was. */
      await flush();
      place.afterId = row.id;
      await savePlace();
    }
  }
  if (paused || kind) {
    await savePlace();
    log(`Requeued ${queued} marin passages this slice; the walk is not finished, so clips already queued will be voiced now.`);
    return { queued, moved, done: false, already: false };
  }
  const { error: mark } = await put(bucket, REVOICE_MARKER, { done: true, queued, moved, files: legacy.size, at: new Date(now()).toISOString() });
  if (mark) throw new Error(`could not save the revoice marker: ${mark.message ?? mark}`);
  log(`Requeued ${queued} marin passages. The walk is finished (${legacy.size} old clips).`);
  return { queued, moved, done: true, already: false, files: legacy.size };
}

export function awsReady(env = process.env) {
  return !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
}
export function createPolly(env = process.env) {
  if (!awsReady(env)) return null;
  return new PollyClient({
    region: env.AWS_REGION || "us-east-1",
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
    /* One HTTP attempt per send. A lost response is retried by the job,
       which reserves another budget slot. The SDK's own retries would
       spend again without that reservation. */
    maxAttempts: 1,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!awsReady()) {
    const line = "AWS credentials are not set (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY). Read-aloud voicing is paused. No clips were generated.";
    console.log(line);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + "\n");
    }
    process.exit(0);
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const polly = createPolly();
  const limits = readAloudLimits();
  const max = Math.max(1, Math.min(2000, Number(process.env.READ_ALOUD_MAX) || 200));
  /* The deadline is fixed before the old-clip walk. That walk may use
     about a third of it, then this run speaks what is already queued. */
  const until = Date.now() + Math.max(1, Math.min(30, Number(process.env.READ_ALOUD_MINUTES) || 25)) * 60000;
  let legacy = { done: true, queued: 0 };
  try { legacy = await queueLegacyMarin({ storage: db.storage, db, until }); }
  catch (e) {
    console.error(`Could not queue the existing marin clips: ${e?.message ?? e}`);
    process.exit(1);
  }
  console.log(legacy.already ? "Marin clips were already queued for Joanna." : `Requeue ${legacy.done ? "finished" : "paused"} (${legacy.queued} added this slice). Speaking what is already queued.`);
  const { lines, failed, more } = await runJob({ storage: db.storage, db, polly, max, until, limits, preserveLegacy: legacy.done === false });
  const keepGoing = more || legacy.done === false;
  console.log(lines.join("\n") + (keepGoing ? "\nMore to do: starting the next run." : ""));
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `more=${keepGoing ? "true" : "false"}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n\n") + "\n");
  }
  if (failed) process.exit(1);
}
