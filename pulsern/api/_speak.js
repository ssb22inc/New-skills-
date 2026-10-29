// Read-aloud voice for the app (src/read-aloud.jsx), reached through
// /api/ai with { action: "speak", ref, seg, text }. Signed-in users only
// (the caller checks before this runs).
//
// What it will say. Never free text: the request names an item in the
// bank (ref) and one part of its script (seg). The item is read with the
// STUDENT'S OWN access, so the database's rules decide: approved content
// only, an unexpired pass, never a readiness-exam item. The words are
// rebuilt from that row with the same code the screen uses
// (src/read-aloud-script.js) and must match the requested text exactly.
// The spend is therefore bounded by the bank, not by what a caller types.
//
// The accuracy gate. The words themselves are bank content that already
// passed the adversarial review; this gate proves the AUDIO says exactly
// those words. Each new passage is synthesised, transcribed (by a separate
// model, with no hint of the script), and passes only if EVERY word of the
// transcript matches the script in order (ops/narrate-lib.mjs wordMismatch,
// after normalising number words and spellings), the overall similarity is
// at least 0.92, and every unit and dosing frequency matches exactly
// (voiceCheck). One changed word fails: a drug, a diagnosis, a finding,
// a side. Two takes. Only a passing take is saved, together with
// a record that binds it to its text (sha256), its audio (sha256), the
// transcript and the QA version; only audio with that record is ever
// played. A passage that fails both takes is not voiced (422): the app
// reads that part with the device's own voice instead.
//
// Budgets (LIMITS, below: the one place they are set). Every queued
// passage and every paid synthesis claims a numbered slot that storage
// creates only once, so the caps hold under concurrent requests, per local
// day in Eastern time: per student; queue admission app-wide; and paid
// syntheses app-wide, ONE count shared by the live route and the voice job
// (reserveSpend). Over a cap, or if the counters cannot be read, nothing is
// spent: the route answers 429 and the work waits.
//
// Storage. A PRIVATE bucket ("read-aloud", created on first use): the
// passages are paid questions, so they are only ever handed out as
// short-lived signed links.
//
// The voice itself. If the server holds OPENAI_API_KEY, a new passage is
// voiced and checked during the request. Otherwise (the normal setup: the
// key lives only in the GitHub pulsern-paid environment) the checked
// request is queued in the private bucket and the voice job
// (ops/read-aloud-worker.mjs, every 15 minutes) voices and checks it; the
// app reads it with the device voice until then (202).
import { createHash } from 'node:crypto';
import { scriptFor } from '../src/read-aloud-script.js';
import { audioCheck, speechTokens, QA_MODEL, QA_VERSION } from '../ops/narrate-lib.mjs';

export const SPEAK_MAX = 1500; // above the script's PART_MAX (900): a part always fits
export const BUCKET = 'read-aloud';
export const SIGNED_SECONDS = 3600;
export const TAKES = 2;
/* The one place the daily caps are set, read by the route and the voice
   job alike (change them here, through a reviewed pull request):
   user      items one student may send to the voice job (each item's
             parts together), or passages voiced live, per day;
   admission items sent to the voice job per day, app-wide;
   spend     paid syntheses per day, app-wide, live and scheduled together. */
export const LIMITS = Object.freeze({ user: 300, admission: 4000, spend: 4000 });
export const TTS = {
  model: 'gpt-4o-mini-tts',
  voice: 'marin',
  instructions: 'You are a warm, calm nursing tutor reading an exam-prep question to a student. ' +
    'Speak clearly at a relaxed, even pace, like a person reading aloud to help someone follow along. ' +
    'Read every number, unit and lab value exactly as written; pause briefly at commas and full stops. ' +
    'Do not add or drop any words. Neutral tone: never hint which choice is right.',
};

/* One spelling per unit and lab name, applied to BOTH the script and the
   transcript before the check, because a transcriber writes "mEq/L" for
   "milliequivalents per liter" and "mmHg" for "millimeters of mercury".
   Only names of units and labs are folded: every number, negation and
   other word is still compared exactly, so "2.9" never passes as "9.2" and
   "mcg" never as "mg". */
const UNIT_CANON = [
  [/\b(?:milliequivalents?|meq)\s*(?:\/|per)\s*(?:liters?|litres?|l)\b/gi, ' meqperl '],
  [/\b(?:millimoles?|mmol)\s*(?:\/|per)\s*(?:liters?|litres?|l)\b/gi, ' mmolperl '],
  [/\b(?:milligrams?|mg)\s*(?:\/|per)\s*(?:deciliters?|decilitres?|dl)\b/gi, ' mgperdl '],
  [/\b(?:grams?|g)\s*(?:\/|per)\s*(?:deciliters?|decilitres?|dl)\b/gi, ' gperdl '],
  [/\b(?:micrograms?|mcg)\s*(?:\/|per)\s*(?:kilograms?|kg)\s*(?:\/|per)\s*(?:minutes?|min)\b/gi, ' mcgperkgpermin '],
  [/\b(?:milligrams?|mg)\s*(?:\/|per)\s*(?:kilograms?|kg)\b/gi, ' mgperkg '],
  [/\b(?:milliliters?|millilitres?|ml)\s*(?:\/|per)\s*(?:hours?|hr|h)\b/gi, ' mlperhr '],
  [/\b(?:milliliters?|millilitres?|ml)\s*(?:\/|per)\s*(?:kilograms?|kg)\b/gi, ' mlperkg '],
  [/\bunits?\s*(?:\/|per)\s*(?:hours?|hr|h)\b/gi, ' unitsperhr '],
  [/\b(?:drops?|gtt)\s*(?:\/|per)\s*(?:minutes?|min)\b/gi, ' gttpermin '],
  [/\b(?:millimeters?|millimetres?)\s+of\s+mercury\b|\bmm\s?hg\b/gi, ' mmhg '],
  [/\s*°\s*c\b|\bdegrees?\s+(?:celsius|c)\b/gi, ' degc '],
  [/\s*°\s*f\b|\bdegrees?\s+(?:fahrenheit|f)\b/gi, ' degf '],
  [/\bs\s*p\s*o\s*(?:2|two|₂)\b|\bspo2\b/gi, ' spo2 '],
  [/\bp\s*a\s*c\s*o\s*(?:2|two|₂)\b|\bpaco2\b/gi, ' paco2 '],
  [/\bp\s*a\s*o\s*(?:2|two|₂)\b|\bpao2\b/gi, ' pao2 '],
  [/\bp\.?\s?o\.?(?=\s|$|[,;])/gi, ' po '],
  [/\bmilligrams?\b/gi, ' mg '],
  [/\bmicrograms?\b/gi, ' mcg '],
  [/\bmilliliters?\b|\bmillilitres?\b/gi, ' ml '],
  [/\bmilliequivalents?\b/gi, ' meq '],
];
export function canonUnits(text) {
  let t = String(text ?? '');
  for (const [re, to] of UNIT_CANON) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
}
/* Units and dosing frequencies must agree EXACTLY and in order, whatever
   the overall similarity: in a long passage one changed word ("mg" heard as
   "mcg") barely moves the score, so they are compared on their own. */
const CLINICAL_UNITS = new Set([
  'meqperl', 'mmolperl', 'mgperdl', 'gperdl', 'mcgperkgpermin', 'mgperkg', 'mlperhr', 'mlperkg', 'unitsperhr', 'gttpermin',
  'mmhg', 'degc', 'degf', 'spo2', 'paco2', 'pao2', 'po',
  'mg', 'mcg', 'ml', 'meq', 'mmol', 'kg', 'g', 'gram', 'l', 'liter', 'unit', 'percent',
  'hour', 'hr', 'minute', 'min', 'day', 'daily', 'week', 'bid', 'tid', 'qid', 'prn', 'iv', 'im', 'subq', 'sc',
]);
const UNIT_WORDS = [[/\bkilograms?\b/gi, ' kg '], [/\bgrams?\b/gi, ' g '], [/\bliters?\b|\blitres?\b/gi, ' l '], [/%/g, ' percent '],
  [/\bhours?\b|\bhrs?\b/gi, ' hour '], [/\bminutes?\b|\bmins?\b/gi, ' minute '], [/\bunits?\b/gi, ' unit '], [/\bdays?\b/gi, ' day ']];
export function clinicalUnits(text) {
  let t = canonUnits(text);
  for (const [re, to] of UNIT_WORDS) t = t.replace(re, to);
  return speechTokens(t).filter((w) => CLINICAL_UNITS.has(w));
}
export function voiceCheck(script, transcript) {
  const check = audioCheck(canonUnits(script), canonUnits(transcript));
  const want = clinicalUnits(script), got = clinicalUnits(transcript);
  const i = want.findIndex((u, k) => got[k] !== u);
  const unitMismatch = want.length !== got.length || i !== -1
    ? { at: i === -1 ? want.length : i, expected: want[i === -1 ? want.length : i] ?? '(nothing)', heard: got[i === -1 ? want.length : i] ?? '(nothing)' }
    : null;
  return { ...check, unitMismatch, pass: check.pass && !unitMismatch };
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export const speechKey = (text, tts = TTS) =>
  sha256([tts.model, tts.voice, tts.instructions, `qa${QA_VERSION}`, text].join('\n')).slice(0, 40);

const KINDS = { question: ['question', 'feedback'], case: ['intro', 'step', 'feedback'], card: ['front', 'back'] };
/* The reference rebuilt from its known fields only: nothing a caller adds
   is ever kept, stored or passed on. null when it is not a valid one. */
export function canonicalRef(ref) {
  if (!ref || typeof ref !== 'object' || !KINDS[ref.kind]?.includes(ref.part) || !Number.isInteger(ref.id) || ref.id <= 0) return null;
  const out = { kind: ref.kind, id: ref.id, part: ref.part };
  if (ref.step !== undefined) {
    if (!Number.isInteger(ref.step) || ref.step < 0 || ref.step >= 50) return null;
    out.step = ref.step;
  }
  if (ref.result !== undefined) {
    const r = ref.result;
    if (!r || typeof r !== 'object' || typeof r.correct !== 'boolean' || !Number.isInteger(r.points) || !Number.isInteger(r.max)) return null;
    out.result = { correct: r.correct, points: r.points, max: r.max };
  }
  return out;
}
/* A queue entry is small by construction (a canonical ref, a part id and
   at most SPEAK_MAX characters); anything bigger is not one of ours. */
export const QUEUE_ENTRY_MAX = 4096;

export function validRequest(ref, seg, text) {
  return !!ref && !!KINDS[ref.kind]?.includes(ref.part) && Number.isInteger(ref.id) && ref.id > 0 &&
    (ref.step === undefined || (Number.isInteger(ref.step) && ref.step >= 0 && ref.step < 50)) &&
    typeof seg === 'string' && seg.length > 0 && seg.length <= 40 &&
    typeof text === 'string' && text.trim().length > 0 && text.length <= SPEAK_MAX;
}

/* Reads one bank item through a client that carries the student's own
   session, so row-level security decides what may be read. Exam items are
   excluded here as well. */
export function bankReader(sb) {
  return async (kind, id) => {
    const q = kind === 'question'
      ? sb.from('questions').select('id, type, stem, options, extra, answer, rationale').eq('id', id).eq('approved', true).is('exam_form', null)
      : kind === 'case'
        ? sb.from('case_studies').select('id, title, intro, vitals, labs, note, steps').eq('id', id).eq('approved', true).is('exam_form', null)
        : kind === 'card'
          ? sb.from('flashcards').select('id, front, back').eq('id', id).eq('approved', true)
          : null;
    if (!q) return null;
    const { data, error } = await q.maybeSingle();
    return error ? null : data ?? null;
  };
}

/* The budget day is a LOCAL calendar day (CLAUDE.md rule 4), in one fixed
   zone for everyone (the US NCLEX audience's Eastern time), so no caller
   can choose which day it is charged to. */
export const QUOTA_TZ = 'America/New_York';
export function quotaDay(now, tz = QUOTA_TZ) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/* Budgets as numbered slots. A slot is a file that storage will create only
   once (upsert off: a second create of the same name fails), so each paid
   call holds a distinct slot below the limit, however many requests run at
   once. Any storage error refuses the call (fail closed). */
async function countSlots(bucket, dir) {
  let n = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(dir, { limit: 1000, offset });
    if (error) { console.error('[read-aloud] storage list', dir.split('/')[0], error.message ?? error); return null; }
    n += (data ?? []).length;
    if (!data || data.length < 1000) return n;
  }
}
/* Create a marker file only if it does not exist yet: "created" (this
   caller owns it), "exists", or "error". */
async function createOnce(storage, path, body = '1') {
  const bucket = storage.from(BUCKET);
  const up = () => bucket.upload(path, body, { contentType: 'text/plain', upsert: false });
  let { error } = await up();
  if (error && /bucket not found|not found/i.test(String(error.message ?? ''))) {
    await storage.createBucket(BUCKET, { public: false });
    ({ error } = await up());
  }
  if (!error) return 'created';
  if (/exist|duplicate|409/i.test(`${error.message ?? ''} ${error.statusCode ?? ''} ${error.error ?? ''}`)) return 'exists';
  console.error('[read-aloud] item claim', error.message ?? error);
  return 'error';
}

/* The outcome of another request's item claim:
   { state: "ok" }       confirmed;
   { state: "refused" }  withdrawn (over a cap);
   { state: "stale", since } still "pending" past its lease: its request
                         died part-way, and the claim may be taken over;
   { state: "unknown" }  still pending after a few seconds, or unreadable. */
export const CLAIM_WAIT = { tries: 30, ms: 100 };
export const CLAIM_LEASE_MS = 20000;
async function claimOutcome(bucket, marker, timeOf) {
  for (let i = 0; i < CLAIM_WAIT.tries; i++) {
    const { data, error } = await bucket.download(marker);
    if (error) return { state: /not found/i.test(String(error.message ?? '')) ? 'refused' : 'unknown' };
    const text = String(typeof data?.text === 'function' ? await data.text() : data ?? '').trim();
    if (text === 'ok') return { state: 'ok' };
    const since = Number(/^pending:(\d+)$/.exec(text)?.[1]);
    if (!Number.isFinite(since) || timeOf() - since > CLAIM_LEASE_MS) return { state: 'stale', since: Number.isFinite(since) ? since : 0 };
    await new Promise((r) => setTimeout(r, CLAIM_WAIT.ms));
  }
  return { state: 'unknown' };
}

/* "ok": a slot is held. "full": the cap is reached (or the slots are too
   contended to claim one now). "error": the counters could not be read or
   written. Anything but "ok" spends nothing; "error" is also reported as
   an operational failure, never mistaken for a full budget. */
async function claimSlot(storage, dir, limit) {
  const bucket = storage.from(BUCKET);
  let n = await countSlots(bucket, dir);
  if (n == null) {
    // First use: the bucket may not exist yet.
    await storage.createBucket(BUCKET, { public: false });
    n = await countSlots(bucket, dir);
    if (n == null) return 'error';
  }
  let created = false;
  for (let tries = 0; tries < 25 && n < limit; tries++, n++) {
    const slot = () => bucket.upload(`${dir}/${String(n).padStart(5, '0')}`, '1', { contentType: 'text/plain', upsert: false });
    let { error } = await slot();
    // First use: listing a bucket that does not exist yet can come back
    // empty rather than as an error, so the write is where it shows.
    if (error && !created && /bucket not found|not found/i.test(String(error.message ?? ''))) {
      created = true;
      await storage.createBucket(BUCKET, { public: false });
      ({ error } = await slot());
    }
    if (!error) return 'ok';
    if (!/exist|duplicate|409/i.test(`${error.message ?? ''} ${error.statusCode ?? ''} ${error.error ?? ''}`)) {
      console.error('[read-aloud] budget slot', error.message ?? error, error.statusCode ?? '');
      return 'error';
    }
  }
  return 'full';
}
/* The voice job's paid calls (ops/read-aloud-worker.mjs): one slot per
   synthesis, on the day the call is made. Queueing a passage (admission,
   above) and paying for it (spend, here) are counted apart, so a retried
   or backlogged passage is always paid from the current day's budget. */
export const reserveSpend = (storage, { now = Date.now(), limits = LIMITS } = {}) =>
  claimSlot(storage, `usage/${quotaDay(now)}/spend`, limits.spend);
/* A student's request: their own daily count, then the app-wide one
   (admission for a queued passage; spend for a live synthesis). */
export async function reserve(storage, userId, { now = Date.now(), limits = LIMITS, pool = 'admission' } = {}) {
  const day = quotaDay(now);
  const user = `usage/${day}/u-${sha256(String(userId)).slice(0, 24)}`;
  const mine = await claimSlot(storage, user, limits.user);
  if (mine !== 'ok') return mine;
  return pool === 'spend' ? reserveSpend(storage, { now, limits }) : claimSlot(storage, `usage/${day}/all`, limits.admission);
}

/* Small JSON files in the bucket. A missing file reads as null. */
async function readJson(bucket, path) {
  const { data, error } = await bucket.download(path);
  if (error || !data) return null;
  try { return JSON.parse(typeof data.text === 'function' ? await data.text() : String(data)); } catch { return null; }
}
async function put(storage, path, body, contentType) {
  const bucket = storage.from(BUCKET);
  const up = () => bucket.upload(path, body, { contentType, upsert: true });
  let { error } = await up();
  if (error && /not found/i.test(String(error.message ?? error))) {
    await storage.createBucket(BUCKET, { public: false });
    ({ error } = await up());
  }
  if (error) console.error('[read-aloud] storage write', path.split('/')[0], error.message ?? error);
  return !error;
}
async function signed(bucket, path) {
  const { data, error } = await bucket.createSignedUrl(path, SIGNED_SECONDS);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

/* Synthesise and check one passage: up to TAKES takes, each transcribed
   and held to voiceCheck. Returns the best take (passing if any did) and
   how many syntheses were paid for. Shared by the live route and the
   queue worker (ops/read-aloud-worker.mjs). */
export async function makeChecked({ text, apiKey, fetchImpl = fetch, tts = TTS, beforeTake = null }) {
  const openai = (path, init) => fetchImpl(`https://api.openai.com/v1${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${apiKey}` } });
  let best = null, spent = 0, error = null, status = 0;
  try {
    for (let take = 1; take <= TAKES; take++) {
      // Every take is a paid call: each needs its own budget slot first.
      if (beforeTake) {
        const slot = await beforeTake();
        if (slot !== 'ok') { error = slot === 'error' ? 'budget counters unavailable' : 'budget'; break; }
      }
      const r = await openai('/audio/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: tts.model, voice: tts.voice, input: text, instructions: tts.instructions, response_format: 'mp3' }),
      });
      spent++;
      if (!r.ok) { error = `speech ${r.status}`; status = r.status; break; }
      const audio = Buffer.from(await r.arrayBuffer());
      if (!audio.length) { error = 'empty audio'; break; }
      /* No prompt for the transcriber: hinting the script would bias it
         toward hearing the script (as in the narration job). */
      const form = new FormData();
      form.append('model', QA_MODEL);
      form.append('language', 'en');
      form.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'clip.mp3');
      const t = await openai('/audio/transcriptions', { method: 'POST', body: form });
      if (!t.ok) { error = `transcription ${t.status}`; status = t.status; break; }
      const transcript = String((await t.json())?.text ?? '');
      const check = voiceCheck(text, transcript);
      best = { audio, transcript, check, take };
      if (check.pass) break;
    }
  } catch (e) { error = String(e?.message ?? e); }
  /* A verdict is final only if a take passed, or every take was completed
     and checked. A provider error or a refused budget part-way through is
     NOT a failed check: nothing terminal is recorded, so it is tried again. */
  const final = !!best && (best.check.pass || (!error && best.take === TAKES));
  /* Why it stopped short:
     budget    no spending slot left today;
     permanent the provider refused this passage itself (400 bad input,
               413 too large, 422 unprocessable): retrying it will not help;
     service   the account or setup is wrong (401, 403, 404): no passage is
               to blame, so nothing is recorded and the run stops;
     storage   the budget counters could not be read or written: nothing
               is spent, nothing recorded, and the run fails;
     transient anything else (rate limits, timeouts, 5xx): retry later. */
  const errorKind = !error ? null : error === 'budget' ? 'budget'
    : error === 'budget counters unavailable' ? 'storage'
    : [400, 413, 422].includes(status) ? 'permanent'
    : [401, 403, 404].includes(status) ? 'service' : 'transient';
  if (error) console.error('[read-aloud] voice', error);
  return { best, spent, error, errorKind, final };
}

export const passagePaths = (text, tts = TTS) => {
  const key = speechKey(text, tts);
  /* queue: fresh requests; retry: ones that hit an outage, served after
     every fresh request (ops/read-aloud-worker.mjs). */
  return { key, mp3: `${tts.voice}/${key}.mp3`, rec: `${tts.voice}/${key}.json`, queue: `queue/${tts.voice}-${key}.json`, retry: `queue-retry/${tts.voice}-${key}.json` };
};

/* Save a checked take: the audio only if it passed, and always the record
   (a failed record stops the passage being asked for again under this QA
   version). */
export async function saveChecked(storage, text, best, { now = Date.now(), tts = TTS } = {}) {
  const { mp3, rec } = passagePaths(text, tts);
  const pass = best.check.pass === true;
  if (pass && !(await put(storage, mp3, best.audio, 'audio/mpeg'))) return false;
  return put(storage, rec, JSON.stringify({
    qa: QA_VERSION, pass, qaModel: QA_MODEL, model: tts.model, voice: tts.voice,
    textSha: sha256(text), audioSha: pass ? sha256(best.audio) : null, similarity: best.check.similarity,
    mismatch: pass ? null : best.check.mismatch ?? null,
    transcript: best.transcript, take: best.take, checkedAt: new Date(now).toISOString(),
  }), 'application/json');
}
/* The provider refused this passage itself (not an outage): record it as
   not voiceable, so it is not paid for again; the refusal is reconsidered
   after REJECTION_DAYS in case it came from a provider-side change. */
export const REJECTION_DAYS = 7;
export async function saveRejected(storage, text, reason, { now = Date.now(), tts = TTS } = {}) {
  return put(storage, passagePaths(text, tts).rec, JSON.stringify({
    qa: QA_VERSION, pass: false, model: tts.model, voice: tts.voice, textSha: sha256(text),
    audioSha: null, reason: String(reason).slice(0, 200), checkedAt: new Date(now).toISOString(),
  }), 'application/json');
}
export async function readRecord(storage, text, tts = TTS, now = Date.now()) {
  const r = await readJson(storage.from(BUCKET), passagePaths(text, tts).rec);
  if (!(r?.qa === QA_VERSION && r.textSha === sha256(text))) return null;
  // A provider refusal (not a failed check) expires, so the passage is tried again.
  if (r.reason && now - Date.parse(r.checkedAt ?? 0) > REJECTION_DAYS * 86400000) return null;
  return r;
}

/* Returns { status, body } for the route to send.
   200 { url }: checked audio to play.
   202 { queued }: no voice yet; the passage is queued for the voice job
     (ops/read-aloud-worker.mjs) and the app says it is being prepared.
     Used when the server itself holds no OpenAI key. */
export async function speak({ ref: rawRef, seg, text, userId, readItem, apiKey, storage, fetchImpl = fetch, now, clock, limits = LIMITS, tts = TTS }) {
  /* The time is read when it is used: a take paid after midnight is
     charged to the new day. (now fixes it for tests; clock lets a test
     move it between takes.) */
  const timeOf = clock ?? (now === undefined ? () => Date.now() : () => now);
  const t0 = timeOf();
  // Only the known fields of the reference are used from here on.
  const ref = canonicalRef(rawRef);
  if (!ref || !validRequest(ref, seg, text)) return { status: 400, body: { error: 'Bad request' } };
  if (!storage || !readItem || !userId) return { status: 503, body: { error: 'Voice unavailable' } };

  // Only the words of an item this student may read, exactly as built for the screen.
  const item = await readItem(ref.kind, ref.id).catch(() => null);
  if (!item) return { status: 404, body: { error: 'Not available' } };
  const parts = scriptFor(ref, item);
  const part = parts.find((s) => s.id === seg);
  if (!part || part.text !== text) return { status: 409, body: { error: 'Text does not match the item' } };

  const { mp3, queue, retry } = passagePaths(text, tts);
  const bucket = storage.from(BUCKET);

  // Already checked: a link to the audio, or a refusal if it failed the check.
  const record = await readRecord(storage, text, tts, t0);
  if (record?.pass === true) {
    const url = await signed(bucket, mp3);
    if (url) return { status: 200, body: { url, cached: true } };
  } else if (record?.pass === false) {
    return { status: 422, body: { error: 'Voice check failed', similarity: record.similarity } };
  }

  // Already waiting for the voice job: nothing more to spend.
  const waiting = async (paths) => (await readJson(bucket, paths.queue)) || (await readJson(bucket, paths.retry));
  if (!apiKey && await waiting({ queue, retry })) return { status: 202, body: { queued: true } };

  const overBudget = { status: 429, body: { error: 'Daily voice limit reached' } };
  const unavailable = { status: 503, body: { error: 'Voice unavailable' } };

  if (!apiKey) {
    /* The whole item is queued at once, under ONE claim per item per day:
       a 202 always means every part of the item is on its way, never a
       part admitted while its neighbours were refused. The first request
       for the item makes the claim (a marker storage creates only once);
       the others find it and only fill in any part not yet queued. */
    const itemKey = sha256(`${tts.voice}\n${JSON.stringify(ref)}`).slice(0, 32);
    const marker = `usage/${quotaDay(t0)}/items/${itemKey}`;
    /* Claim the item: reserve a slot, then confirm. The claim carries its
       start time, so one whose request died part-way lapses after
       CLAIM_LEASE_MS and can be taken over (by exactly one request: the
       takeover is itself a marker storage creates once). A taken-over
       claim may count a slot twice, never zero times. */
    const own = async () => {
      const slot = await reserve(storage, userId, { now: timeOf(), limits });
      if (slot !== 'ok') { await bucket.remove([marker]); return slot === 'error' ? unavailable : overBudget; }
      const { error } = await bucket.upload(marker, 'ok', { contentType: 'text/plain', upsert: true });
      if (error) { await bucket.remove([marker]); return unavailable; }
      return null;
    };
    const mark = await createOnce(storage, marker, `pending:${timeOf()}`);
    if (mark === 'error') return unavailable;
    if (mark === 'created') {
      const refused = await own();
      if (refused) return refused;
    } else {
      /* Another request (usually a sibling part of the same Listen) holds
         the claim: wait for its outcome, so every part of the item answers
         the same way; take it over if it was abandoned. */
      for (let round = 0; ; round++) {
        const out = await claimOutcome(bucket, marker, timeOf);
        if (out.state === 'ok') break;
        if (out.state === 'refused') return overBudget;
        if (out.state !== 'stale' || round >= 2) return unavailable;
        const take = await createOnce(storage, `${marker}.takeover-${out.since}`);
        if (take === 'error') return unavailable;
        if (take === 'created') {
          const { error } = await bucket.upload(marker, `pending:${timeOf()}`, { contentType: 'text/plain', upsert: true });
          if (error) return unavailable;
          const refused = await own();
          if (refused) return refused;
          break;
        }
        // someone else is taking it over: wait for their outcome
      }
    }
    for (const p of parts) {
      const paths = passagePaths(p.text, tts);
      if (await readRecord(storage, p.text, tts, t0)) continue;
      if (await waiting(paths)) continue;
      const entry = JSON.stringify({ text: p.text, voice: tts.voice, ref, seg: p.id, requestedAt: new Date(t0).toISOString() });
      if (entry.length > QUEUE_ENTRY_MAX) continue; // cannot happen for a valid part; never stored if it did
      if (!(await put(storage, paths.queue, entry, 'application/json'))) return unavailable;
    }
    return { status: 202, body: { queued: true } };
  }

  // A live synthesis: every take claims a spending slot on the day it is made.
  const pay = () => reserve(storage, userId, { now: timeOf(), limits, pool: 'spend' });
  const { best, final, error, errorKind } = await makeChecked({ text, apiKey, fetchImpl, tts, beforeTake: pay });
  if (!final) {
    if (errorKind === 'budget') return overBudget;
    if (errorKind === 'service' || errorKind === 'storage') return unavailable;
    if (errorKind === 'permanent') { await saveRejected(storage, text, error, { now: timeOf(), tts }); return { status: 422, body: { error: 'Voice check failed' } }; }
    return { status: 502, body: { error: 'Voice failed' } };
  }
  if (!(await saveChecked(storage, text, best, { now: timeOf(), tts }))) return { status: 502, body: { error: 'Voice could not be saved' } };
  if (!best.check.pass) return { status: 422, body: { error: 'Voice check failed', similarity: best.check.similarity } };
  const url = await signed(bucket, mp3);
  return url ? { status: 200, body: { url, cached: false } } : { status: 502, body: { error: 'Voice could not be linked' } };
}
