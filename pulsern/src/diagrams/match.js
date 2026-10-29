/* Which questions could a diagram help with, and with what values?
   ------------------------------------------------------------------
   This file only PROPOSES pairings. Nothing reaches a student until the
   adversarial reviewer has confirmed the pairing for that exact question
   (ops/map-diagrams.mjs), because a diagram on the wrong rationale teaches
   the wrong thing with the authority of a picture.

   Two rules for extracted values:
   - Every value must be present and unambiguous. One missing, or two
     different values for the same lab (two clients, a before-and-after), and
     extraction returns null: the diagram is then shown as a concept with no
     patient marker, never with a guess.
   - Values outside a physiologically possible range are rejected as a
     misread rather than drawn. */

import { abgConsistency } from "./abg.jsx";

const num = (s) => Number(String(s).replace(/,/g, ""));

/* All distinct values a pattern finds; ambiguity is detected by the caller. */
function all(re, text) {
  return [...new Set([...text.matchAll(re)].map((m) => num(m[1])).filter(Number.isFinite))];
}

/* The one value a pattern finds, with the decimals it was written to. */
function oneAsWritten(re, text, min, max) {
  const raw = [...new Set([...text.matchAll(re)].map((m) => m[1]))];
  if (new Set(raw.map(num)).size !== 1) return null;
  const v = num(raw[0]);
  if (!(v >= min && v <= max)) return null;
  const places = Math.max(...raw.map((r) => (r.split(".")[1] ?? "").length));
  return { v, places };
}

function one(re, text, min, max) {
  const vals = all(re, text);
  if (vals.length !== 1) return null;
  const v = vals[0];
  return v >= min && v <= max ? v : null;
}

/* PaCO₂ is written many ways: PaCO2, PaCO₂, PCO2, pCO₂. */
/* Each value is read as a WHOLE number with every decimal it was written
   with; a longer token is not matched at all, never cut to its prefix
   (PR #156 review: "PaCO2 45.4" was read as 45 with whole-number
   precision). */
const WHOLE = String.raw`(?![\d.]*\d)`;
const PH = new RegExp(String.raw`\bpH\s*(?:of|is|was|=|:)?\s*((?:7|6)\.\d{1,3})${WHOLE}`, "gi");
const PACO2 = new RegExp(String.raw`\b(?:Pa|p)?CO(?:2|₂)\s*(?:of|is|was|=|:)?\s*(\d{2,3}(?:\.\d{1,2})?)${WHOLE}`, "gi");
const HCO3 = new RegExp(String.raw`\b(?:HCO(?:3|₃)(?:-|⁻)?|bicarbonate(?:\s+level)?)\s*(?:of|is|was|=|:)?\s*(\d{1,2}(?:\.\d{1,2})?)${WHOLE}`, "gi");
/* A dose is not a level: a number followed by mEq or mmol without "/L",
   or by mg, g, mL or tablets, is not read (PR #156 review: "potassium
   10 mEq by mouth" was read as a serum 10).
   The whole number is read — one or two integer digits, never a partial
   match (PR #156 review: "10.0" was read as 1.0 once the range reached
   10); a longer number that doesn't fit is not matched at all. */
const K = /\b(?:potassium(?:\s+level)?|serum\s+K\+?|K\+|K⁺)\s*(?:of|is|was|=|:)?\s*(\d{1,2}(?:\.\d{1,2})?)(?![\d.]*\d)(?!\s*(?:mEq|mmol)(?!\s*\/\s*L)|\s*(?:mg|g|mL|tablets?|tabs?)\b)\s*(?:mEq\/L|mmol\/L)?/gi;

export function extractAbg(text) {
  const t = String(text ?? "");
  const ph = oneAsWritten(PH, t, 6.8, 7.8);
  const paco2 = oneAsWritten(PACO2, t, 10, 130);
  const hco3 = oneAsWritten(HCO3, t, 3, 60);
  if (ph == null || paco2 == null || hco3 == null) return null;
  /* The decimals as written travel with the values: "pH 7.30" is reported
     to the hundredth even though the number 7.3 is not (Sol, round 3). */
  const gas = { ph: ph.v, paco2: paco2.v, hco3: hco3.v, precision: { ph: ph.places, paco2: paco2.places, hco3: hco3.places } };
  /* Values that cannot belong together are not drawn as the client's own:
     the diagram is then shown as a concept, not with a "recheck" verdict
     beside the question (Sol, PR #155 diagram review, round 2). */
  return abgConsistency(gas).ok ? gas : null;
}

/* Insulin type and the time it was given. The long-acting row is glargine
   U-100 only (~24 h). Products whose action differs are deliberately NOT
   mapped, because drawing them on that row would be wrong (Astra, PR #133
   review, finding 9): degludec (~42 h), glargine U-300 / Toujeo (up to
   ~36 h) and detemir (dose-dependent, often shorter than 24 h). Exactly one
   type and one time, or null. */
const INSULIN_TYPES = [
  ["rapid", /\b(?:lispro|aspart|glulisine|humalog|novolog|apidra|rapid[- ]acting)\b/i],
  ["short", /\bregular(?:\s+insulin)?\b|\bhumulin r\b|\bnovolin r\b|\bshort[- ]acting insulin\b/i],
  ["nph", /\bNPH\b|\bisophane\b|\bhumulin n\b|\bnovolin n\b|\bintermediate[- ]acting\b/i],
  ["long", /\b(?:glargine|lantus|basaglar|semglee)\b/i],
];
function clockFrom(text) {
  const hits = new Set();
  for (const m of text.matchAll(/\bat\s+(\d{4})\b/g)) {           // military: "at 0700"
    const h = Number(m[1].slice(0, 2)), mi = Number(m[1].slice(2));
    if (h <= 23 && mi <= 59) hits.add(`${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`);
  }
  for (const m of text.matchAll(/\bat\s+(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/gi)) {
    let h = Number(m[1]); const mi = Number(m[2]); const ap = (m[3] ?? "").toLowerCase().replace(/\./g, "");
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h <= 23 && mi <= 59) hits.add(`${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`);
  }
  return hits.size === 1 ? [...hits][0] : null;
}
/* Any stated concentration other than U-100 — U-300 glargine, U-500
   regular, U-200 — has a different action profile from the one drawn, so
   no profile is chosen. Spellings are normalised first: every Unicode
   hyphen or dash and every kind of space, so "U 300", "U\u2011300" and
   "U\u2013300" are all caught (Astra, PR #134 review, round 18). */
const DASHES = /[\u2010-\u2015\u2212\u00AD\uFE58\uFE63\uFF0D]/g;
const SPACES = /[\s\u00A0\u2007\u202F\u2060\uFEFF]+/g;
export const normaliseDosing = (text) => String(text ?? "").replace(DASHES, "-").replace(SPACES, " ");
function unsupportedConcentration(t) {
  for (const m of t.matchAll(/\bU ?-? ?(\d{2,4})\b/gi)) if (Number(m[1]) !== 100) return true;
  /* "300 units/mL", "300 U/mL", "300 IU/mL", "300 units per milliliter" */
  for (const m of t.matchAll(/\b(\d{2,4}) ?(?:units?|U|IU) ?(?:\/|per) ?(?:mL|ml|milliliters?|millilitres?|cc)\b/gi)) if (Number(m[1]) !== 100) return true;
  return /\bconcentrated insulin\b/i.test(t);
}
export function extractInsulin(text) {
  const t = normaliseDosing(text);
  if (/degludec|tresiba|detemir|levemir|toujeo/i.test(t) || unsupportedConcentration(t)) return null;
  /* The worked window is subcutaneous action: an IV or other non-SC route
     leaves the diagram concept-only (PR #156 review). */
  const route = t.replace(/\bI\.\s?V\.?(?=\W|$)/gi, " IV ").replace(/\bI\.\s?M\.?(?=\W|$)/gi, " IM ");   // dotted forms
  if (/\b(?:IV|intravenous(?:ly)?|infusion|drip|intramuscular(?:ly)?|IM)\b/i.test(route)) return null;
  const types = INSULIN_TYPES.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (types.length !== 1) return null;
  const givenAt = clockFrom(t);
  return givenAt ? { type: types[0], givenAt } : null;
}

export function extractPotassium(text) {
  const k = one(K, String(text ?? ""), 1.0, 12.0);
  return k != null ? { k } : null;
}

/* Candidate patterns are deliberately TIGHT. A loose pattern ("\bIV\b")
   matched a quarter of the bank in the first survey, and every false
   candidate is a paid review that ends in "no". */
export const MATCHERS = {
  abg: {
    candidate: /\bABGs?\b|arterial blood gas|\bPaCO(?:2|₂)\b|respiratory (?:acidosis|alkalosis)|metabolic (?:acidosis|alkalosis)|\bHCO(?:3|₃)/i,
    extract: extractAbg,
  },
  potassium: {
    candidate: /potassium|hyperkalemi|hypokalemi|\bK\+|\bK⁺|peaked T|U wave/i,
    extract: extractPotassium,
  },
  isolation: {
    candidate: /isolation|precautions|\bPPE\b|\bN95\b|respirator|airborne|droplet|negative[- ]pressure|\bgown\b/i,
    /* Concept only: no client-specific row is read from the text (Sol,
       rounds 1–5: every reading of negation, treatment or attribution in
       free text had a counterexample). */
    extract: () => null,
  },
  "pressure-injury": {
    /* Eschar and slough alone are not enough: burn and surgical-wound
       items use both words, and this diagram is about pressure. */
    candidate: /pressure (?:injury|injuries|ulcer|ulcers|sore|sores)|decubitus|\bbraden\b|unstageable|deep tissue (?:pressure )?injury/i,
    /* Concept only, for the same reason: no stage is read from the text. */
    extract: () => null,
  },
  insulin: {
    /* Insulin must be named: "hypoglycemia" alone pulls in questions about
       other causes, and each one is a paid "no". */
    candidate: /\binsulin\b|\blispro\b|\baspart\b|\bglargine\b|\bdetemir\b|\bNPH\b/i,
    extract: extractInsulin,
  },
  /* Tonicity: either the concept is named outright, or a specific IV fluid
     appears together with a fluid-balance problem. A fluid name alone is not
     enough — "flush the line with normal saline" is not a tonicity question. */
  tonicity: {
    candidate: {
      test: (t) =>
        /isotonic|hypotonic|hypertonic|tonicity/i.test(t) ||
        (/normal saline|0\.9%\s*(?:NaCl|sodium chloride)|0\.45%|lactated ringer|\bD5W\b|\bD10W\b|\bD5\s*(?:½|1\/2|0\.45|NS|LR)|3%\s*(?:NaCl|saline|sodium chloride)/i.test(t) &&
         /dehydrat|fluid volume|hypovolem|fluid overload|hyponatrem|hypernatrem|cerebral edema|intracranial|\bICP\b|fluid replacement|fluid resuscitation|\bbolus\b|which (?:IV )?(?:fluid|solution)/i.test(t)),
    },
    extract: null,
  },
};

/* Text a matcher looks at: the stem and options carry the clinical
   picture; the rationale carries the concept being taught. */
export const itemText = (q) => [q.stem, ...(Array.isArray(q.options) ? q.options : []), q.rationale].filter(Boolean).join("\n");

export function proposePairs(item) {
  const text = itemText(item);
  const stemText = [item.stem, ...(Array.isArray(item.options) ? item.options : [])].filter(Boolean).join("\n");
  const out = [];
  for (const [id, m] of Object.entries(MATCHERS)) {
    if (!m.candidate.test(text)) continue;
    /* Values only from the stem and options — the patient in front of the
       student — never from the rationale, which may quote ranges or a
       contrasting example. */
    out.push({ d: id, p: m.extract ? m.extract(stemText) : undefined });
  }
  return out;
}
