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
  /* A period is part of a token only between digits ("7.35"); a full stop
     after a word is a separator, so "five point oh." still reads as 5.0. */
  const tokens = String(text).toLowerCase().replace(/-/g, " ").split(/(\s+|[^a-z0-9.]+|\.(?!\d))/).filter((t) => t !== undefined && t !== "");
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

/* Signs and ranges, said and written: "-7.35", "−7.35" and "negative
   7.35" all become "minus 7.35", so a sign can never vanish into a hyphen
   (Astra, PR #134 review, round 4: "-7.35" passed for "seven point three
   five"). A hyphen BETWEEN two numbers is a range: "3-5" reads "3 to 5". */
/* Symbols that carry clinical meaning become words, so "45%" can never
   match "45" (Astra, PR #134 review, round 7). Comparison and other
   unit-bearing symbols become explicit tokens that must match exactly. */
const SYMBOL_WORDS = [[/%/g, " percent "], [/°/g, " degrees "], [/±/g, " plus or minus "], [/&/g, " and "], [/\+/g, " plus "]];
const SYMBOL_TOKENS = [[/≤/g, " symle "], [/≥/g, " symge "], [/</g, " symlt "], [/>/g, " symgt "], [/=/g, " symeq "], [/×/g, " symtimes "], [/÷/g, " symdiv "], [/~/g, " symapprox "], [/\//g, " symslash "]];
export function symbolsToWords(text) {
  let t = String(text);
  for (const [re, w] of [...SYMBOL_WORDS, ...SYMBOL_TOKENS]) t = t.replace(re, w);
  return t;
}

export function signsAndRanges(text) {
  return symbolsToWords(String(text))
    /* ".45" is 0.45, never 45: a leading decimal point is a digit's
       business (Astra, PR #134 review, round 5). */
    .replace(/(^|[^0-9])\.(?=\d)/g, "$10.")
    .replace(/(\d)\s*[-–]\s*(?=\d)/g, "$1 to ")
    .replace(/(^|[^A-Za-z0-9])[-−–](?=\s*\d)/g, "$1 minus ")
    .replace(/\bnegative\b/gi, "minus");
}

/* Lowercase letters and digits only, numbers in digit form. */
export function normaliseSpeech(text) {
  return wordsToNumbers(signsAndRanges(text)).toLowerCase().replace(/[^a-z0-9.]+/g, "").replace(/\.(?!\d)/g, "");
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

/* The words that carry clinical meaning: numbers, negations, and words of
   direction or order. Overall similarity cannot protect these — dropping
   "not" from a long clip barely moves it ("calcium does not lower the
   potassium" vs "does lower": 0.976 similar). So they must agree EXACTLY,
   in order (Astra, PR #133 review, finding 4). */
const NEGATION = new Set(["not", "no", "never", "without", "cannot", "nor", "neither", "none"]);
const DIRECTION = /^(?:above|below|over|under|high|higher|highest|low|lower|lowest|increase[sd]?|increasing|decrease[sd]?|decreasing|rise[sn]?|rising|rose|fall[s]?|falling|fell|drop[s]?|dropp(?:ed|ing)|raise[sd]?|raising|more|less|fewer|opposite|same|equal|before|after|first|second|third|into|out|up|down|swell[s]?|swelling|shrink[s]?|shrinking|toward|away|left|right|faster|slower|longer|shorter|wider|narrow(?:er)?|peak(?:ed|s)?|flat(?:ten(?:ed|s)?)?|never|always|only)$/;
export function criticalTerms(text) {
  const expanded = String(text).toLowerCase()
    .replace(/\bcan['’]t\b/g, "can not").replace(/\bwon['’]t\b/g, "will not").replace(/n['’]t\b/g, " not")
    .replace(/\bcannot\b/g, "can not");
  const words = wordsToNumbers(expanded).split(/[^a-z0-9.]+/).map((w) => w.replace(/\.$/, "")).filter(Boolean);
  const out = [];
  for (const w of words) {
    for (const n of w.match(/\d+(?:\.\d+)?/g) ?? []) out.push(n);
    if (/^[a-z]+$/.test(w) && (NEGATION.has(w) || DIRECTION.test(w))) out.push(w);
  }
  return out;
}

/* Every word, in order, must match — after only these normalisations of
   how speech is SPELLED: number words ↔ digits, letters spelled out ↔ the
   abbreviation ("P-A-C-O-2" ↔ "PaCO2"), contractions, a plural -s, and the
   filler words below, which a transcriber may add or drop. Anything else —
   "acidosis" heard as "alkalosis", a dropped "not", a changed number — is a
   mismatch, and the clip does not ship. A keyword list was not enough: it
   passed a recording that swapped the diagnosis (Astra, PR #134 review,
   finding 4). */
const FILLER = new Set(["a", "an", "the", "um", "uh", "er", "erm"]);
/* Words after which a lone "A" names something — hepatitis A, vitamin A,
   blood group A, type A — rather than being an article. */
const NAMES_A = /\b(hepatitis|hep|vitamin|vitamins|type|group|blood|influenza|flu|factor|class|grade|stage|phase|category|zone|lead|plan|part|step|option|choice|answer|item|unit|room|bed|bay|ward|wing|team|section|protein|immunoglobulin|ig|apolipoprotein|apo|strep|streptococcus|hemophilia)\s+a\b/gi;
/* Letters and abbreviations that the filler list would otherwise swallow
   are kept as named tokens, on both sides, so dropping one is a mismatch
   (Astra, PR #134 review, round 10: "hepatitis A" heard as "hepatitis"
   passed, because every "a" was discarded as an article). A capital A
   inside a sentence, and an "a" after a word that takes a letter, is a
   letter; "ER" is the emergency room. An article stays droppable. */
/* An "A" followed by what only a letter can be followed by — a blood-group
   sign or word (A positive, A−, A+), a list comma, "or"/"and" — is a
   letter wherever it stands, including at the start of a sentence (Astra,
   PR #134 review, round 10: "A positive packed red cells…" heard without
   the A passed). An article never precedes these, except "a positive"/"a
   negative" as adjectives; keeping those too only makes the check stricter. */
const LETTER_A_BEFORE = /\bA(?=\s*(?:\+|\u2212|-(?![A-Za-z0-9]))|\s+(?:positive|negative|pos|neg|rh|plus|minus|and|or|nor|vs\.?|versus)\b|\s*[,;:/)]|\s*$)/gi;
/* A blood group or Rh written with a sign is read as the words, so the
   sign survives as a token and a transcript that drops it fails (Astra,
   PR #134 review, round 12: "A−" and "A" normalised the same). Only a sign
   attached to the group, not a spaced dash. */
const GROUP_SIGN = /\b(AB|A|B|O|Rh)(\+|\u2212|-(?![A-Za-z0-9]))(?=[\s,.;:)!?]|$)/gi;
function keepLetters(text) {
  return String(text)
    .replace(GROUP_SIGN, (m, g, s) => `${g} ${s === "+" ? "positive" : "negative"}`)
    .replace(LETTER_A_BEFORE, "letterA")
    .replace(NAMES_A, (m, w) => `${w} letterA`)
    .replace(/(?<=[A-Za-z0-9,;:)]\s+)A\b(?![-'’])/g, "letterA")
    .replace(/\bE\.?R\.?(?![A-Za-z])/g, "letterER");
}
export function speechTokens(text) {
  /* Letters spelled out with hyphens ("P-A-C-O-2", "N-ninety-five", "I-V")
     are joined to the written abbreviation (PaCO2, N95, IV). Only a hyphen
     after a single letter joins, so "fit-tested" and an article before an
     abbreviation are left alone. */
  /* A hyphen joins when EITHER side is a single letter: "D-five-W" is D5W,
     "N-ninety-five" is N95 (the number keeps its own hyphen), "X-ray" is
     xray; "fit-tested" and "half-normal" are left alone. (Astra, PR #134
     review: "D-five-W" once split into "d5" + "w" and failed a correct
     "D5W" transcript.) */
  let t = signsAndRanges(keepLetters(text));
  for (let prev = null; prev !== t;) {
    prev = t;
    t = t.replace(/\b([A-Za-z])-(?=[A-Za-z0-9])/g, "$1§").replace(/(?<=[A-Za-z0-9§])-([A-Za-z])\b/g, "§$1");
  }
  const expanded = t.toLowerCase()
    .replace(/\bcan['’]t\b/g, "can not").replace(/\bwon['’]t\b/g, "will not").replace(/n['’]t\b/g, " not")
    .replace(/\bcannot\b/g, "can not").replace(/['’]s\b/g, "s").replace(/['’](re|ve|ll|d|m)\b/g, " $1");
  return wordsToNumbers(expanded).replace(/§/g, "").replace(/(\d)\.(?!\d)/g, "$1 ").split(/[^a-z0-9.]+/)
    .map((w) => w.replace(/\.+$/g, "").replace(/^\.+(?!\d)/, "")).filter(Boolean)
    /* plural -s dropped from longer words, but not -ss/-is/-us (acidosis) */
    .map((w) => (w.length > 4 && /s$/.test(w) && !/(ss|is|us)$/.test(w) ? w.slice(0, -1) : w))
    .filter((w) => !FILLER.has(w));
}

/* The first word where script and transcript disagree, or null. */
export function wordMismatch(script, transcript) {
  const a = speechTokens(script), b = speechTokens(transcript);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { at: i, expected: a[i] ?? "(nothing)", heard: b[i] ?? "(nothing)", context: a.slice(Math.max(0, i - 3), i + 3).join(" ") };
  }
  return null;
}
/* Kept for the report: the clinically loaded subset, compared the same way. */
export function criticalMismatch(script, transcript) {
  const a = criticalTerms(script), b = criticalTerms(transcript);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { at: i, expected: a[i] ?? "(nothing)", heard: b[i] ?? "(nothing)" };
  }
  return null;
}

/* A clip ships only if every word matches (above) and the overall
   similarity is high. Bump QA_VERSION whenever this rule gets stricter:
   clips approved by an older rule are re-checked, never grandfathered. */
export const QA_VERSION = 8;
export function audioCheck(script, transcript) {
  const similarity = speechSimilarity(script, transcript);
  const mismatch = wordMismatch(script, transcript);
  return { similarity, mismatch, pass: similarity >= QA_THRESHOLD && !mismatch };
}
export const passesQa = (script, transcript) => audioCheck(script, transcript).pass;

/* Steps that get recorded audio: every step with narration and a key,
   never a worked-example step (its caption follows the question's values). */
export const narratedSteps = (diagram) => diagram.steps.filter((s) => !s.dynamic && s.key && s.narration);

/* May a run skip this step's clip? Only when it is for the same words and
   voice, was approved by the CURRENT audio check, and is stored under the
   hash of its bytes. Anything recorded under an older, weaker rule — or
   the old input-named storage — is recorded and checked again (Astra,
   PR #134 review, finding 7). */
export function isCurrentClip(entry, id) {
  return !!entry && entry.id === id && entry.qa === QA_VERSION && /^[0-9a-f]{32}$/.test(entry.audio ?? "") && String(entry.url ?? "").endsWith(`/${entry.audio}.mp3`);
}
