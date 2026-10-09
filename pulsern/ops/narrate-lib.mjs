/* Pure parts of the narration pipeline: what a clip is, and whether its
   audio says what the script says.
   ------------------------------------------------------------------
   A clip is identified by everything that changes the sound: the words,
   the voice, the delivery instructions, the model and the speed. Change
   any of them and it is a new clip; nothing else regenerates audio.

   The audio check transcribes each clip and compares it with its script.
   Narration scripts spell numbers and abbreviations the way they should be
   SAID ("seven point three five", "P-A-C-O-2"); transcripts write them the
   way they are READ ("7.35", "PaCO2"). Both are reduced to the same form
   before comparing, so the check measures the speech, not the spelling. */
import { createHash } from "node:crypto";
import { fnv1a } from "../src/diagrams/fingerprint.js";

export const TTS = {
  model: "gpt-4o-mini-tts",
  speed: 1.0,
  format: "mp3",
  instructions:
    "You are a calm, warm, clear nursing educator explaining a concept to a nursing student. " +
    "Speak at a measured, unhurried pace with natural pauses between ideas. " +
    "Read letters separated by hyphens as individual letters. Do not add or drop any words.",
};
export const QA_MODEL = "gpt-4o-transcribe";
/* Similarity at or above this passes. Set from the character-level ratio on
   normalised text; small transcription differences ("a" vs "the") stay well
   above it, a skipped clause or a wrong word falls below. */
export const QA_THRESHOLD = 0.92;

export function clipId({ text, voice, model = TTS.model, instructions = TTS.instructions, speed = TTS.speed }) {
  return createHash("sha256").update(JSON.stringify([model, voice, instructions, speed, text])).digest("hex").slice(0, 16);
}

/* What the app compares against: a browser-side fingerprint of the words.
   If the narration text in the code changes but the audio has not been
   regenerated, the fingerprints differ and the old recording is not
   played over new words. */
export const textFp = (text) => fnv1a(text);

const ONES = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/* "seven point three five" → "7.35", "forty-five" → "45", "five point oh" → "5.0".
   Covers the range narration uses (0–999 and simple decimals). */
export function wordsToNumbers(text) {
  const tokens = String(text).toLowerCase().replace(/-/g, " ").split(/(\s+|[^a-z0-9.]+)/);
  const out = [];
  let i = 0;
  const isNumWord = (w) => w in ONES || w in TENS || w === "hundred";
  const next = (j) => { let k = j + 1; while (k < tokens.length && /^\s+$/.test(tokens[k])) k++; return k; };
  while (i < tokens.length) {
    const w = tokens[i];
    if (!isNumWord(w)) { out.push(w); i++; continue; }
    let value = 0, cur = 0, j = i, last = i;
    while (j < tokens.length && isNumWord(tokens[j])) {
      const t = tokens[j];
      if (t in ONES) cur += ONES[t];
      else if (t in TENS) cur += TENS[t];
      else if (t === "hundred") cur = (cur || 1) * 100;
      last = j; j = next(j);
    }
    value += cur;
    let s = String(value);
    if (tokens[j] === "point") {
      let k = next(j), digits = "";
      while (k < tokens.length && tokens[k] in ONES && ONES[tokens[k]] < 10) { digits += ONES[tokens[k]]; last = k; k = next(k); }
      if (digits) s += "." + digits;
    }
    out.push(s);
    i = last + 1;
  }
  return out.join("");
}

/* Lowercase letters and digits only, numbers in digit form. */
export function normaliseSpeech(text) {
  return wordsToNumbers(text).toLowerCase().replace(/[^a-z0-9.]+/g, "").replace(/\.(?!\d)/g, "");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function speechSimilarity(script, transcript) {
  const a = normaliseSpeech(script), b = normaliseSpeech(transcript);
  if (!a.length && !b.length) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export const passesQa = (script, transcript) => speechSimilarity(script, transcript) >= QA_THRESHOLD;

/* Steps that get recorded audio: every step with narration and a key,
   never a worked-example step (its caption follows the question's values). */
export const narratedSteps = (diagram) => diagram.steps.filter((s) => !s.dynamic && s.key && s.narration);
