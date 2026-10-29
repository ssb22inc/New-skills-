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
// The accuracy gate. Each new passage is synthesised, transcribed, and
// passes only the narration job's check (ops/narrate-lib.mjs audioCheck:
// similarity >= 0.92 AND every number, negation and direction word exactly
// as written), with two takes. Only a passing take is saved, together with
// a record that binds it to its text (sha256), its audio (sha256), the
// transcript and the QA version; only audio with that record is ever
// played. A passage that fails both takes is not voiced (422): the app
// reads that part with the device's own voice instead.
//
// Budgets. Every paid call or queued passage claims a numbered slot that
// storage creates only once, so the caps hold under concurrent requests:
// per student and app-wide, per local day in Eastern time
// (SPEAK_USER_DAILY, SPEAK_GLOBAL_DAILY). Over a cap, or if the counters
// cannot be read, the route answers 429 and the app uses the device voice.
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

export const SPEAK_MAX = 1500;
export const BUCKET = 'read-aloud';
export const SIGNED_SECONDS = 3600;
export const TAKES = 2;
export const LIMITS = { user: 300, global: 4000 };
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
    if (error) return null;
    n += (data ?? []).length;
    if (!data || data.length < 1000) return n;
  }
}
async function claimSlot(storage, dir, limit) {
  const bucket = storage.from(BUCKET);
  let n = await countSlots(bucket, dir);
  if (n == null) {
    // First use: the bucket may not exist yet.
    await storage.createBucket(BUCKET, { public: false });
    n = await countSlots(bucket, dir);
    if (n == null) return false;
  }
  for (let tries = 0; tries < 25 && n < limit; tries++, n++) {
    const { error } = await bucket.upload(`${dir}/${String(n).padStart(5, '0')}`, '1', { contentType: 'text/plain', upsert: false });
    if (!error) return true;
    if (!/exist|duplicate|409/i.test(String(error.message ?? error.statusCode ?? error))) return false;
  }
  return false;
}
/* The voice job's own paid calls (ops/read-aloud-worker.mjs) count against
   the app-wide budget too. */
export const reserveGlobal = (storage, { now = Date.now(), limits = LIMITS } = {}) =>
  claimSlot(storage, `usage/${quotaDay(now)}/all`, limits.global);
export async function reserve(storage, userId, { now = Date.now(), limits = LIMITS } = {}) {
  const day = quotaDay(now);
  const user = `usage/${day}/u-${sha256(String(userId)).slice(0, 24)}`;
  return (await claimSlot(storage, user, limits.user)) && (await claimSlot(storage, `usage/${day}/all`, limits.global));
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
export async function makeChecked({ text, apiKey, fetchImpl = fetch, tts = TTS, beforeRetake = null }) {
  const openai = (path, init) => fetchImpl(`https://api.openai.com/v1${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${apiKey}` } });
  let best = null, spent = 0, error = null;
  try {
    for (let take = 1; take <= TAKES; take++) {
      // A second take is a second paid call: it needs its own budget slot.
      if (take > 1 && beforeRetake && !(await beforeRetake())) { error = 'budget'; break; }
      const r = await openai('/audio/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: tts.model, voice: tts.voice, input: text, instructions: tts.instructions, response_format: 'mp3' }),
      });
      spent++;
      if (!r.ok) { error = `speech ${r.status}`; break; }
      const audio = Buffer.from(await r.arrayBuffer());
      if (!audio.length) { error = 'empty audio'; break; }
      /* No prompt for the transcriber: hinting the script would bias it
         toward hearing the script (as in the narration job). */
      const form = new FormData();
      form.append('model', QA_MODEL);
      form.append('language', 'en');
      form.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'clip.mp3');
      const t = await openai('/audio/transcriptions', { method: 'POST', body: form });
      if (!t.ok) { error = `transcription ${t.status}`; break; }
      const transcript = String((await t.json())?.text ?? '');
      const check = voiceCheck(text, transcript);
      best = { audio, transcript, check, take };
      if (check.pass) break;
    }
  } catch (e) { error = String(e?.message ?? e); }
  return { best, spent, error };
}

export const passagePaths = (text, tts = TTS) => {
  const key = speechKey(text, tts);
  return { key, mp3: `${tts.voice}/${key}.mp3`, rec: `${tts.voice}/${key}.json`, queue: `queue/${tts.voice}-${key}.json` };
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
export async function readRecord(storage, text, tts = TTS) {
  const r = await readJson(storage.from(BUCKET), passagePaths(text, tts).rec);
  return r?.qa === QA_VERSION && r.textSha === sha256(text) ? r : null;
}

/* Returns { status, body } for the route to send.
   200 { url }: checked audio to play.
   202 { queued }: no voice yet; the passage is queued for the voice job
     (ops/read-aloud-worker.mjs), and the app reads it with the device voice
     this time. Used when the server itself holds no OpenAI key. */
export async function speak({ ref, seg, text, userId, readItem, apiKey, storage, fetchImpl = fetch, now = Date.now(), limits = LIMITS, tts = TTS }) {
  if (!validRequest(ref, seg, text)) return { status: 400, body: { error: 'Bad request' } };
  if (!storage || !readItem || !userId) return { status: 503, body: { error: 'Voice unavailable' } };

  // Only the words of an item this student may read, exactly as built for the screen.
  const item = await readItem(ref.kind, ref.id).catch(() => null);
  if (!item) return { status: 404, body: { error: 'Not available' } };
  const part = scriptFor(ref, item).find((s) => s.id === seg);
  if (!part || part.text !== text) return { status: 409, body: { error: 'Text does not match the item' } };

  const { mp3, queue } = passagePaths(text, tts);
  const bucket = storage.from(BUCKET);

  // Already checked: a link to the audio, or a refusal if it failed the check.
  const record = await readRecord(storage, text, tts);
  if (record?.pass === true) {
    const url = await signed(bucket, mp3);
    if (url) return { status: 200, body: { url, cached: true } };
  } else if (record?.pass === false) {
    return { status: 422, body: { error: 'Voice check failed', similarity: record.similarity } };
  }

  // Already waiting for the voice job: nothing more to spend.
  if (!apiKey && await readJson(bucket, queue)) return { status: 202, body: { queued: true } };

  // Budgets: a slot is claimed before every paid call or queued entry.
  const take = () => reserve(storage, userId, { now, limits });
  const overBudget = { status: 429, body: { error: 'Daily voice limit reached' } };

  if (!apiKey) {
    if (!(await take())) return overBudget;
    const ok = await put(storage, queue, JSON.stringify({ text, voice: tts.voice, ref, seg, requestedAt: new Date(now).toISOString() }), 'application/json');
    if (!ok) return { status: 503, body: { error: 'Voice unavailable' } };
    return { status: 202, body: { queued: true } };
  }

  if (!(await take())) return overBudget;
  const { best } = await makeChecked({ text, apiKey, fetchImpl, tts, beforeRetake: take });
  if (!best) return { status: 502, body: { error: 'Voice failed' } };
  if (!(await saveChecked(storage, text, best, { now, tts }))) return { status: 502, body: { error: 'Voice could not be saved' } };
  if (!best.check.pass) return { status: 422, body: { error: 'Voice check failed', similarity: best.check.similarity } };
  const url = await signed(bucket, mp3);
  return url ? { status: 200, body: { url, cached: false } } : { status: 502, body: { error: 'Voice could not be linked' } };
}
