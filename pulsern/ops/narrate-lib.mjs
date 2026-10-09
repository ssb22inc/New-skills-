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
    /* Two or more single digits in a row are a spoken digit string —
       "nine one one" is 911, never 9+1+1 = 11 (Astra, PR #134 review,
       round 16). Otherwise only a valid cardinal is read: [tens] [unit],
       or a teen, optionally "hundred" first; a word that cannot continue
       the number starts a new one instead of being added to it. */
    const digit = (t) => t in ONES && ONES[t] < 10;
    let j = i, last = i, value;
    if (digit(tokens[i]) && digit(tokens[next(i)] ?? "")) {
      let digits = "";
      while (j < tokens.length && digit(tokens[j])) { digits += ONES[tokens[j]]; last = j; j = next(j); }
      out.push(digits);
      i = last + 1;
      continue;
    }
    let cur = 0, kind = null;
    while (j < tokens.length && isNumWord(tokens[j])) {
      const t = tokens[j];
      if (t in ONES && ONES[t] < 10) { if (kind && kind !== "tens" && kind !== "hundred") break; cur += ONES[t]; kind = "unit"; }
      else if (t in ONES) { if (kind && kind !== "hundred") break; cur += ONES[t]; kind = "teen"; }
      else if (t in TENS) { if (kind && kind !== "hundred") break; cur += TENS[t]; kind = "tens"; }
      else { if ((kind && kind !== "unit") || cur >= 100) break; cur = (cur || 1) * 100; kind = "hundred"; }
      last = j; j = next(j);
    }
    value = cur;
    j = next(last);
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
/* Punctuation a transcript may add, drop or spell differently without
   changing the meaning. Everything else that is not a letter or digit is
   meaning-bearing until shown otherwise: it becomes a "sym<code>" token
   that must match exactly, instead of being deleted (Astra, PR #134
   review, round 13: the micro sign was deleted, so "5 μg" heard as "5 g"
   passed). U+2212 is left for the sign handling below. */
const NEUTRAL = /[A-Za-z0-9\s.,;:!?'"()[\]\-\u2010-\u2015\u2018\u2019\u201C\u201D\u2026\u2212]/;
export function symbolsToWords(text) {
  /* The micro prefix, as the micro sign (U+00B5) or Greek mu (U+03BC),
     joins its unit: "5 μg" and "5 µg" read "5 microg", which the token
     step equates with "mcg" and "micrograms". */
  let t = String(text).replace(/[\u00B5\u03BC]\s*(?=[A-Za-z])/g, " micro");
  for (const [re, w] of [...SYMBOL_WORDS, ...SYMBOL_TOKENS]) t = t.replace(re, w);
  return [...t].map((c) => (NEUTRAL.test(c) ? c : ` sym${c.codePointAt(0).toString(16)} `)).join("");
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

/* Similarity is measured on the same normalised words the exact check
   uses (units, letters, signs), so a correct spelling of a unit — "mcg"
   for "micrograms" — does not cost similarity either. */
export function speechSimilarity(script, transcript) {
  const a = speechTokens(script).join(" "), b = speechTokens(transcript).join(" ");
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
/* "a" is NOT a filler: a lone A can be a blood group, a hepatitis type, a
   vitamin, a list item — "A plasma contains anti-B" heard as "Plasma
   contains anti-B" is a different fact — and no list of contexts can be
   complete (Astra, PR #134 review, round 15). Every "a" must be heard, so
   a transcript that drops or adds one fails and the clip is re-recorded.
   "an" and "the" are never clinical labels and stay droppable. Nor is
   "er": it is ER — emergency room, extended release — however it is
   spelled (ER, E.R., E-R), so it must be heard too (Astra, PR #134
   review, round 18: "E-R tablets" heard as "tablets" passed). Nor is
   "um": it is the micrometre written in ASCII, so "5 um" heard as "five"
   must fail (round 25). */
const FILLER = new Set(["an", "the", "uh", "erm"]);
/* One token per unit, however it is written or said (plurals are already
   dropped): micrograms are never grams or milligrams. */
const UNIT_ALIASES = {
  microg: "mcg", microgram: "mcg", mcg: "mcg",
  milligram: "mg", gram: "g", kilogram: "kg",
  milliliter: "ml", millilitre: "ml",
  microl: "mcl", microliter: "mcl", microlitre: "mcl",
  um: "um", microm: "um", micrometer: "um", micrometre: "um", micron: "um",
  milliequivalent: "meq", millimole: "mmol",
};
/* Every "a" and "er" is a token (see FILLER), so neither needs special
   handling: dropping one fails whatever its role. "E.R." is written as
   "ER" so its dots cannot split it; "E-R" joins to "er" with the other
   spelled-out letters. */
/* A blood group or Rh written with a sign is read as the words, so the
   sign survives as a token and a transcript that drops it fails (Astra,
   PR #134 review, round 12: "A−" and "A" normalised the same). Only a sign
   attached to the group, not a spaced dash. */
const GROUP_SIGN = /\b(AB|A|B|O|Rh)(\+|\u2212|-(?![A-Za-z0-9]))(?=[\s,.;:)!?]|$)/gi;
function keepLetters(text) {
  return String(text)
    .replace(GROUP_SIGN, (m, g, s) => `${g} ${s === "+" ? "positive" : "negative"}`)
    .replace(/\bE\.R\.?(?![A-Za-z])/g, "ER");
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
    .replace(/\bcannot\b/g, "can not")
    /* Affirmative contractions read as their words (Astra, PR #134 review,
       round 14: "It's given with a meal" failed "It is given with a
       meal"). "'s" is "is" only after a pronoun-like word; elsewhere it is
       a possessive. "'d" (had or would) is ambiguous and must match as
       written. */
    .replace(/\b(it|that|there|here|what|who|where|when|how|he|she|this|everyone|someone|nobody|everything|nothing)['’]s\b/g, "$1 is")
    .replace(/\blet['’]s\b/g, "let us").replace(/\bi['’]m\b/g, "i am")
    .replace(/['’]re\b/g, " are").replace(/['’]ve\b/g, " have").replace(/['’]ll\b/g, " will").replace(/['’]d\b/g, " d")
    .replace(/['’]s\b/g, "s");
  return wordsToNumbers(expanded).replace(/§/g, "").replace(/(\d)\.(?!\d)/g, "$1 ").split(/[^a-z0-9.]+/)
    .map((w) => w.replace(/\.+$/g, "").replace(/^\.+(?!\d)/, "")).filter(Boolean)
    /* plural -s dropped from longer words, but not -ss/-is/-us (acidosis) */
    .map((w) => (w.length > 4 && /s$/.test(w) && !/(ss|is|us)$/.test(w) ? w.slice(0, -1) : w))
    .filter((w) => !FILLER.has(w))
    .map((w) => UNIT_ALIASES[w] ?? w);
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
export const QA_VERSION = 14;
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

/* Records each clip: up to two takes, each checked against its script.
   A clip that fails the check on both takes STOPS the run — no further
   clip is synthesised or paid for — and the failure is reported exactly
   (CLAUDE.md rule 8: if a verification fails twice, stop and report; Astra,
   PR #134 review, round 16: the loop used to continue to the next clip).
   Clips recorded before the stop are kept: `store` saves each as it passes.
   Every paid take — passing or not — is handed to `keepTake` with its
   transcript and check before anything else happens, so an owner can audit
   what was paid for (Astra, PR #134 review, round 19); only passing clips
   reach the student-facing manifest. Returns the exit code. */
export async function recordAll(work, { synthesise, transcribe, store, save, report, keepTake, log = console.log }) {
  if (typeof keepTake !== "function") throw new Error("recordAll: keepTake is required — every paid take is kept");
  report.takes ??= [];
  for (const item of work) {
    const { d, s } = item;
    try {
      let mp3, heard, check;
      for (let take = 1; take <= 2; take++) {
        mp3 = await synthesise(s.narration);
        report.characters += s.narration.length;
        /* Kept the moment it is paid for — before transcription, which can
           fail or hang (Astra, PR #134 review, round 20) — and the same
           record is finalised once the check is known. */
        const rec = { diagram: d.id, step: s.key, take, pass: false, similarity: null, mismatch: null, heard: null, error: "not yet transcribed", file: null };
        report.takes.push(rec);
        rec.file = (await keepTake({ d, s, take, mp3, stage: "synthesised", heard: null, check: null, error: rec.error })) ?? null;
        save();
        try {
          heard = await transcribe(mp3);
        } catch (e) {
          rec.error = `transcription failed: ${String(e.message).slice(0, 200)}`;
          await keepTake({ d, s, take, mp3, stage: "transcription failed", heard: null, check: null, error: rec.error });
          save();
          throw e;
        }
        check = audioCheck(s.narration, heard);
        Object.assign(rec, { pass: check.pass, similarity: check.similarity, mismatch: check.mismatch, heard, error: null });
        await keepTake({ d, s, take, mp3, stage: "checked", heard, check, error: null });
        save();
        if (check.pass) break;
        log(`  … ${d.id}/${s.key} take ${take}: ${check.mismatch ? `said “${check.mismatch.heard}” where the script says “${check.mismatch.expected}”` : `similarity ${check.similarity.toFixed(3)}`}`);
      }
      if (!check.pass) {
        report.failedQa.push({ diagram: d.id, step: s.key, similarity: check.similarity, mismatch: check.mismatch, heard });
        report.stopped = `${d.id}/${s.key} failed the audio check on both takes; the run stopped there and nothing after it was recorded.`;
        log(`  ✗ ${report.stopped}`);
        save();
        return 1;
      }
      await store(item, mp3, check);
      save();   // after every clip: a stopped run keeps what it paid for
    } catch (e) {
      report.errors.push({ diagram: d.id, step: s.key, error: String(e.message).slice(0, 200) });
      log(`  ✗ ${d.id}/${s.key}: ${String(e.message).slice(0, 160)}`);
      save();
      if (/ 401| 403|insufficient_quota|billing/i.test(e.message)) return 1;
    }
  }
  return report.errors.length || report.failedQa.length ? 1 : 0;
}

/* Did a storage upload fail only because this exact object already exists?
   Objects are named by the hash of their bytes, so that case is success.
   Only the provider's explicit conflict counts — status 409 or its
   "Duplicate" error — never a message that merely mentions existence:
   "bucket does not exist" was once read as a duplicate and a dead URL was
   published (Astra, PR #134 review, round 17). */
export function isDuplicateUpload(error) {
  if (!error) return false;
  const status = String(error.statusCode ?? error.status ?? "");
  return status === "409" || error.error === "Duplicate" || /^the resource already exists$/i.test(String(error.message ?? "").trim());
}
