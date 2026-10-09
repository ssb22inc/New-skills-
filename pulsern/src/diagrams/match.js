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

import { precautionFor } from "./isolation.jsx";

const num = (s) => Number(String(s).replace(/,/g, ""));

/* All distinct values a pattern finds; ambiguity is detected by the caller. */
function all(re, text) {
  return [...new Set([...text.matchAll(re)].map((m) => num(m[1])).filter(Number.isFinite))];
}

function one(re, text, min, max) {
  const vals = all(re, text);
  if (vals.length !== 1) return null;
  const v = vals[0];
  return v >= min && v <= max ? v : null;
}

/* PaCO₂ is written many ways: PaCO2, PaCO₂, PCO2, pCO₂. */
const PH = /\bpH\s*(?:of|is|was|=|:)?\s*(7\.\d{1,2}|6\.\d{1,2})\b/gi;
const PACO2 = /\b(?:Pa|p)?CO(?:2|₂)\s*(?:of|is|was|=|:)?\s*(\d{2,3})\b/gi;
const HCO3 = /\b(?:HCO(?:3|₃)(?:-|⁻)?|bicarbonate(?:\s+level)?)\s*(?:of|is|was|=|:)?\s*(\d{1,2}(?:\.\d)?)\b/gi;
const K = /\b(?:potassium(?:\s+level)?|serum\s+K\+?|K\+|K⁺)\s*(?:of|is|was|=|:)?\s*(\d(?:\.\d{1,2})?)\s*(?:mEq\/L|mmol\/L)?/gi;

export function extractAbg(text) {
  const t = String(text ?? "");
  const ph = one(PH, t, 6.8, 7.8);
  const paco2 = one(PACO2, t, 10, 130);
  const hco3 = one(HCO3, t, 3, 60);
  return ph != null && paco2 != null && hco3 != null ? { ph, paco2, hco3 } : null;
}

/* Insulin type and the time it was given. Degludec is deliberately NOT
   mapped: its duration (~42 h) is outside the diagram's long-acting row,
   and drawing it as glargine would be wrong. Exactly one type and one time,
   or null. */
const INSULIN_TYPES = [
  ["rapid", /\b(?:lispro|aspart|glulisine|humalog|novolog|apidra|rapid[- ]acting)\b/i],
  ["short", /\bregular(?:\s+insulin)?\b|\bhumulin r\b|\bnovolin r\b|\bshort[- ]acting insulin\b/i],
  ["nph", /\bNPH\b|\bisophane\b|\bhumulin n\b|\bnovolin n\b|\bintermediate[- ]acting\b/i],
  ["long", /\b(?:glargine|detemir|lantus|levemir|basaglar|toujeo)\b/i],
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
export function extractInsulin(text) {
  const t = String(text ?? "");
  if (/degludec|tresiba/i.test(t)) return null;
  const types = INSULIN_TYPES.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (types.length !== 1) return null;
  const givenAt = clockFrom(t);
  return givenAt ? { type: types[0], givenAt } : null;
}

export function extractPotassium(text) {
  const k = one(K, String(text ?? ""), 1.5, 9.5);
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
    extract: (t) => precautionFor(t),
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
