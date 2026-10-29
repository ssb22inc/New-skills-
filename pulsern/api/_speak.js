// Read-aloud voice for the app (src/read-aloud.jsx), reached through
// /api/ai with { action: "speak", text }. Signed-in users only (the caller
// checks before this runs).
//
// Each passage is synthesised once and kept in a PRIVATE storage bucket,
// keyed by a hash of the voice settings and the exact text; every later
// request for the same words gets a short-lived signed link to the saved
// file and costs nothing. The bucket is private because the passages are
// paid questions: a public file would hand them to anyone with the link.
//
// Needs OPENAI_API_KEY on the server (HUMAN_TASKS H23). Without it the
// route answers 503 and the app uses the device's own voice instead.
import { createHash } from 'node:crypto';

export const SPEAK_MAX = 1500;            // one segment: a stem, a choice, a rationale
export const BUCKET = 'read-aloud';
export const SIGNED_SECONDS = 3600;
export const TTS = {
  model: 'gpt-4o-mini-tts',
  voice: 'marin',
  instructions: 'You are a warm, calm nursing tutor reading an exam-prep question to a student. ' +
    'Speak clearly at a relaxed, even pace, like a person reading aloud to help someone follow along. ' +
    'Read every number, unit and lab value exactly as written; say letter labels distinctly; pause briefly at commas and full stops. ' +
    'Neutral tone: never hint which choice is right.',
};

export const speechKey = (text, tts = TTS) =>
  createHash('sha256').update([tts.model, tts.voice, tts.instructions, text].join('\n')).digest('hex').slice(0, 40);

export function validSpeechText(text) {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= SPEAK_MAX;
}

async function signed(bucket, path) {
  const { data, error } = await bucket.createSignedUrl(path, SIGNED_SECONDS);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

/* Returns { status, body } for the route to send. */
export async function speak({ text, apiKey, storage, fetchImpl = fetch, tts = TTS }) {
  if (!validSpeechText(text)) return { status: 400, body: { error: 'Bad text' } };
  if (!apiKey) return { status: 503, body: { error: 'Voice unavailable' } };
  if (!storage) return { status: 503, body: { error: 'Voice unavailable' } };
  const name = `${speechKey(text, tts)}.mp3`;
  const dir = tts.voice;
  const path = `${dir}/${name}`;
  const bucket = storage.from(BUCKET);

  // Already made: hand back a link to the saved file.
  const { data: found, error: listError } = await bucket.list(dir, { search: name, limit: 1 });
  if (!listError && Array.isArray(found) && found.some((f) => f.name === name)) {
    const url = await signed(bucket, path);
    if (url) return { status: 200, body: { url, cached: true } };
  }

  let audio;
  try {
    const r = await fetchImpl('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: tts.model, voice: tts.voice, input: text, instructions: tts.instructions, response_format: 'mp3' }),
    });
    if (!r.ok) return { status: 502, body: { error: 'Voice failed' } };
    audio = Buffer.from(await r.arrayBuffer());
  } catch {
    return { status: 502, body: { error: 'Voice failed' } };
  }
  if (!audio.length) return { status: 502, body: { error: 'Voice failed' } };

  const upload = () => bucket.upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
  let { error } = await upload();
  if (error && /not found/i.test(String(error.message ?? error))) {
    // First use: make the private bucket, then save.
    await storage.createBucket(BUCKET, { public: false });
    ({ error } = await upload());
  }
  if (error) return { status: 502, body: { error: 'Voice could not be saved' } };
  const url = await signed(bucket, path);
  return url ? { status: 200, body: { url, cached: false } } : { status: 502, body: { error: 'Voice could not be linked' } };
}
