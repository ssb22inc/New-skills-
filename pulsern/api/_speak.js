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
// Budgets. New passages (not ones already saved) are capped per student
// and for the whole app each UTC day (SPEAK_USER_DAILY, SPEAK_GLOBAL_DAILY).
// Over the cap the route answers 429 and the app uses the device voice.
//
// Storage. A PRIVATE bucket ("read-aloud", created on first use): the
// passages are paid questions, so they are only ever handed out as
// short-lived signed links.
//
// Needs OPENAI_API_KEY on the server (HUMAN_TASKS H23). Without it the
// route answers 503 and the app uses the device's own voice.
import { createHash } from 'node:crypto';
import { scriptFor } from '../src/read-aloud-script.js';
import { audioCheck, QA_MODEL, QA_VERSION } from '../ops/narrate-lib.mjs';

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
export const voiceCheck = (script, transcript) => audioCheck(canonUnits(script), canonUnits(transcript));

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

const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

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

/* Returns { status, body } for the route to send. */
export async function speak({ ref, seg, text, userId, readItem, apiKey, storage, fetchImpl = fetch, now = Date.now(), limits = LIMITS, tts = TTS }) {
  if (!validRequest(ref, seg, text)) return { status: 400, body: { error: 'Bad request' } };
  if (!apiKey || !storage || !readItem || !userId) return { status: 503, body: { error: 'Voice unavailable' } };

  // Only the words of an item this student may read, exactly as built for the screen.
  const item = await readItem(ref.kind, ref.id).catch(() => null);
  if (!item) return { status: 404, body: { error: 'Not available' } };
  const part = scriptFor(ref, item).find((s) => s.id === seg);
  if (!part || part.text !== text) return { status: 409, body: { error: 'Text does not match the item' } };

  const key = speechKey(text, tts);
  const mp3 = `${tts.voice}/${key}.mp3`, rec = `${tts.voice}/${key}.json`;
  const bucket = storage.from(BUCKET);

  // Already made and checked: hand back a link.
  const record = await readJson(bucket, rec);
  if (record?.qa === QA_VERSION && record.textSha === sha256(text) && record.pass === true) {
    const url = await signed(bucket, mp3);
    if (url) return { status: 200, body: { url, cached: true } };
  }

  // Budgets, before any paid call.
  const day = utcDay(now);
  const userPath = `usage/${day}/u-${sha256(String(userId)).slice(0, 24)}.json`, allPath = `usage/${day}/all.json`;
  const [mine, all] = await Promise.all([readJson(bucket, userPath), readJson(bucket, allPath)]);
  const used = { user: mine?.n ?? 0, global: all?.n ?? 0 };
  if (used.user >= limits.user || used.global >= limits.global) return { status: 429, body: { error: 'Daily voice limit reached' } };

  const openai = (path, init) => fetchImpl(`https://api.openai.com/v1${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${apiKey}` } });
  let best = null, spent = 0;
  try {
    for (let take = 1; take <= TAKES; take++) {
      const r = await openai('/audio/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: tts.model, voice: tts.voice, input: text, instructions: tts.instructions, response_format: 'mp3' }),
      });
      spent++;
      if (!r.ok) break;
      const audio = Buffer.from(await r.arrayBuffer());
      if (!audio.length) break;
      /* No prompt for the transcriber: hinting the script would bias it
         toward hearing the script (as in the narration job). */
      const form = new FormData();
      form.append('model', QA_MODEL);
      form.append('language', 'en');
      form.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'clip.mp3');
      const t = await openai('/audio/transcriptions', { method: 'POST', body: form });
      if (!t.ok) break;
      const transcript = String((await t.json())?.text ?? '');
      const check = voiceCheck(text, transcript);
      best = { audio, transcript, check, take };
      if (check.pass) break;
    }
  } catch { /* provider error: nothing is saved */ }

  // Count every synthesis against today's budgets.
  if (spent) {
    await Promise.all([
      put(storage, userPath, JSON.stringify({ n: used.user + spent }), 'application/json'),
      put(storage, allPath, JSON.stringify({ n: used.global + spent }), 'application/json'),
    ]);
  }
  if (!best) return { status: 502, body: { error: 'Voice failed' } };
  if (!best.check.pass) return { status: 422, body: { error: 'Voice check failed', similarity: best.check.similarity } };

  const ok = await put(storage, mp3, best.audio, 'audio/mpeg') && await put(storage, rec, JSON.stringify({
    qa: QA_VERSION, pass: true, qaModel: QA_MODEL, model: tts.model, voice: tts.voice,
    textSha: sha256(text), audioSha: sha256(best.audio), similarity: best.check.similarity,
    transcript: best.transcript, take: best.take, checkedAt: new Date(now).toISOString(),
  }), 'application/json');
  if (!ok) return { status: 502, body: { error: 'Voice could not be saved' } };
  const url = await signed(bucket, mp3);
  return url ? { status: 200, body: { url, cached: false } } : { status: 502, body: { error: 'Voice could not be linked' } };
}
