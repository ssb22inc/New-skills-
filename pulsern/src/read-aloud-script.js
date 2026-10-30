/* Read-aloud scripts: exactly what is spoken, in what order.
   ------------------------------------------------------------------
   Pure code (CLAUDE.md rule 6). The voice only speaks what these
   functions return, so what a student hears is the item on screen,
   word for word, in reading order:

   - the question first, then any exhibit, then the choices exactly as the
     screen shows them (no letters: the screen has none, and the choice
     being read is highlighted, so what is heard matches what is seen);
   - never the answer, the rationale or the XP before the student answers
     (questionSegments takes no answer and never reads q.answer);
   - after the answer, a separate script reads the result and the
     rationale (feedbackSegments).

   Each segment has an id the screen uses to highlight the part being read
   (follow-along reading), and a text the voice speaks. */

import { ngnExt } from "./ngn.js";

/* A rate: a whole number token (not the "1" in "HbA1c"), a known unit,
   then a slash and a known unit of time, amount or body weight. */
/* Abbreviated or spelled out ("mg" or "milligrams"), so a transcriber's
   spelling of the same rate is recognised too. */
export const RATE_UNITS = "breaths?|beats?|drops?|gtts?|units?|international units?|mg|milligrams?|mcg|micrograms?|g|grams?|mL|ml|milliliters?|millilitres?|L|liters?|litres?|mEq|milliequivalents?|mmol|millimoles?|IU|doses?|tablets?|caps?|capsules?|puffs?|times|cells|kcal|calories|mm|cm|oz|ounces?|lb|pounds?|kg|kilograms?";
const RATE_PER = "min|mins|minutes?|hr|hrs|hours?|h|days?|d|weeks?|wk|sec|secs|seconds?|kg|kilograms?|dose|L|liters?|litres?|dL|deciliters?|mL|milliliters?|m2";
export const RATE = new RegExp(`(\\b\\d+(?:\\.\\d+)?\\s*(?:${RATE_UNITS}))\\s*\\/\\s*(?=(?:${RATE_PER})\\b)`, "gi");

/* An amount, a slash, then a number and a volume. */
const AMOUNT_UNITS = "mg|milligrams?|mcg|micrograms?|g|grams?|units?|international units?|IU|mEq|milliequivalents?|mmol|millimoles?";
export const CONCENTRATION = new RegExp(`(\\b\\d+(?:,\\d{3})*(?:\\.\\d+)?\\s*(?:${AMOUNT_UNITS}))\\s*\\/\\s*(?=\\d+(?:,\\d{3})*(?:\\.\\d+)?\\s*(?:mL|ml|milliliters?|millilitres?|L|liters?|litres?)\\b)`, "gi");

/* Spoken forms for the clinical shorthand a voice is most likely to misread.
   Conservative on purpose: units and dosing frequencies only, whole tokens
   only, never a guess at a drug or a diagnosis. */
const SPOKEN = [
  [/\bmEq\/L\b/g, "milliequivalents per liter"],
  [/\bmmol\/L\b/g, "millimoles per liter"],
  [/\bmg\/dL\b/g, "milligrams per deciliter"],
  [/\bg\/dL\b/g, "grams per deciliter"],
  [/\bmcg\/kg\/min\b/g, "micrograms per kilogram per minute"],
  [/\bng\/mL\b/g, "nanograms per milliliter"],
  [/\bmg\/kg\b/g, "milligrams per kilogram"],
  [/\bmL\/hr?\b/g, "milliliters per hour"],
  [/\bmL\/kg\b/g, "milliliters per kilogram"],
  [/\bunits\/hr?\b/g, "units per hour"],
  [/\bgtt\/min\b/g, "drops per minute"],
  [/\bmm ?Hg\b/g, "millimeters of mercury"],
  [/\/mm³/g, " per cubic millimeter"],
  // per body surface area ("mL/min/1.73 m²")
  [/\s*\/\s*(\d+(?:\.\d+)?)\s*m(?:²|2)(?![\w])/g, " per $1 square meters"],
  [/\bq(\d{1,2})h\b/gi, "every $1 hours"],
  [/\bPRN\b/g, "as needed"],
  [/\bNPO\b/g, "N P O"],
  // a route the voice tends to drop when it is two letters
  [/\bPO\b/g, "by mouth"],
  [/\bSpO₂|\bSpO2\b/g, "S P O 2"],
  [/\bPaCO₂|\bPaCO2\b/g, "P A C O 2"],
  [/\bPaO₂|\bPaO2\b/g, "P A O 2"],
  [/\bHCO₃⁻?|\bHCO3-?(?=\W|$)/g, "bicarbonate"],
  [/\bK⁺/g, "potassium"],
  [/\bNa⁺/g, "sodium"],
  [/°F\b/g, " degrees Fahrenheit"],
  [/°C\b/g, " degrees Celsius"],
  [/\s*→\s*/g, ", then "],
  /* A slash is said, never left for the voice to guess: after a number
     and a known unit it is "per" ("12 breaths/min"); between anything else
     it is "slash" ("creatinine/eGFR", "HbA1c/eAG"), the one reading that
     adds no meaning ("and", "or" and "per" would). "and/or" is said as it
     is meant. Two numbers with a slash between them ("120/80", a pain
     score "5/10", an Apgar "7/9", a date "7/10") are left as written, and
     the check must hear them exactly: no rule can tell a score from a
     date, so none is guessed. */
  [/\band\/or\b/gi, "and or"],
  /* A pain score: a number out of 10 right after the word "pain" ("pain
     rated 7/10", "pain 6/10", "rates her pain 4/10"), said the way a nurse
     says it. Only there: after any other word ("heart rates 7/10") two
     numbers with a slash stay as written, since a date reads the same. */
  [/\b(pain(?:\s+(?:level|score|rating|intensity))?(?:\s+(?:is|was|of|rated|rating))*)\s+(10|\d)\s*\/\s*10(?![\d\/]|\.\d)/gi, "$1 $2 out of 10"],
  /* A unit per unit of time or weight with no number before it
     ("mcg/hr", "calories/day", "mg/dL/hr"): "per", as with a number. */
  [/\b(mg|mcg|units?|mL|kcal|calories?|mEq|mmol|g|L|gtts?|drops?|deciliter)\s*\/\s*(?=(?:min|minutes?|hr|hours?|h|day|kg|dose)\b)/g, "$1 per "],
  [/\s*÷\s*/g, " divided by "],
  /* An amount in a volume ("400 mg/250 mL", "25,000 units/500 mL") is
     said with "in", the way it is read at the bedside; "per" or "over"
     would be guessed. */
  [CONCENTRATION, "$1 in "],
  [RATE, "$1 per "],
  // a count per unit of time with no unit before the slash ("118/min", "60/min")
  [/(\b\d+(?:\.\d+)?)\s*\/\s*(?=(?:min|mins|minute|hr|hrs|hour|h|day|wk|week|sec)\b)/g, "$1 per "],
  [/([A-Za-z][\w⁺⁻₀-₉-]*)\s*\/\s*(?=[A-Za-z])/g, "$1 slash "],
  [/\bper (?:min|mins)\b/g, "per minute"],
  [/\bper (?:hr|hrs|h)\b/g, "per hour"],
  [/\bper (?:sec|secs)\b/g, "per second"],
  // A range of ordinals ("85th–94th percentile") is said with "to".
  [/(\d+(?:st|nd|rd|th))\s*[–—-]\s*(?=\d+(?:st|nd|rd|th)\b)/g, "$1 to "],
  [/\s*=\s*/g, " equals "],
  [/≥/g, " at least "],
  [/≤/g, " at most "],
  [/</g, " less than "],
  [/>/g, " greater than "],
];

/* Calculation signs are spoken, never dropped, and never invented. Only
   signs with one meaning are put into words: "×" and "*" between numbers
   are "times", "=" is "equals". A middle dot can be multiplication
   ("2 · DBP", "0.1 mg/kg · 70 kg", "2 mg/mL · Volume") or a separator
   ("pH 7.35–7.45 · PaCO₂ 35–45"), and an "x" between numbers ("3 x 4")
   can be multiplication or a size; nothing in the text settles which. A
   passage with either is not voiced at all (voiceable), so the student
   reads it on screen exactly as written, and the rest of the item plays. */
const UNSURE = /[·∙]|\d\s*x\s*(?=\d)/i;
export const voiceable = (script) => !UNSURE.test(String(script ?? ""));
const operators = (text) => text
  .replace(/\s*×\s*/g, " times ")
  .replace(/(\d)\s*\*\s*(?=\d)/g, "$1 times ");

/* Text for the voice: clinical shorthand spelled out, symbols the screen
   uses for layout removed, whitespace tidied. */
export function speakable(text) {
  // brackets first, while the signs of arithmetic are still signs
  let s = operators(asides(String(text ?? "").replace(/[☐☑●○▲△✨📋🧮]/g, "")));
  for (const [re, to] of SPOKEN) s = s.replace(re, to);
  return s.replace(/\s+/g, " ").trim();
}

/* Brackets are read as a pause, not left for the voice: voices skip a
   bracketed aside, above all at the end of a passage ("... (Row 3 —
   Indicated)", "(Option 4)": the voice job's failure log). The words
   stay; only the brackets become commas. A plural marker on a closed list
   of things counted out ("tablet(s)") is said as the plural; any other
   "(s)" is left alone, since it can be seconds ("time(s)"). A part that
   is wholly in brackets is left as it is. */
/* Brackets that group arithmetic are never an aside: "140 - (104 + 24)"
   without them is another sum. A group is read as a pause only when no
   sign of arithmetic is inside it or right before or after it; otherwise
   the brackets stay as written. */
const MATH_SIGN = /[+×*÷=^<>≤≥≠−–]|\d\s*[-/x]\s*\d|\s-\s|\b(?:plus|minus|times|divided|multiplied|equals?|over)\b/i;
const MATH_WORD_EDGE = /\b(?:plus|minus|times|divided\s+by|multiplied\s+by|equals?|over|of)\s*$/i;
const aside = (inner, before, after) =>
  !MATH_SIGN.test(inner) && !/[-+×*÷=^/−–]\s*$/.test(before) && !MATH_WORD_EDGE.test(before) && !/^\s*(?:[-+×*÷=^/−–²³]|(?:plus|minus|times|divided|multiplied|equals?)\b)/i.test(after) && !/^\s*\d/.test(after) && !/\d\s*$/.test(before.replace(/\s+$/, "").slice(-1));
const COUNTED = "tablet|capsule|dose|drop|puff|vial|patch|spray|syringe|ampule|bag|suppositor(?:y|ie)";
function asides(text) {
  const t = text.trim().replace(new RegExp(`\\b(${COUNTED})\\(s\\)`, "gi"), "$1s");
  if (/\w\(s\)/.test(t)) return t;
  if (/^\([^()]*\)[.!?]?$/.test(t)) return t;
  return t
    .replace(/(\s*)\(([^()]*)\)/g, (m, space, inner, at) => {
      if (!aside(inner, t.slice(0, at), t.slice(at + m.length))) return m;
      return inner.trim() ? `, ${inner.trim()},` : "";
    })
    .replace(/^,\s*/, "")
    .replace(/,\s*(?=[,.;:?!]|$)/g, "");
}

/* Where an item takes its answer: these instructions are what the screen
   shows as the item-type label, said the way a tutor would say it. */
const INSTRUCTION = {
  mc: "Choose one answer.",
  sata: "Select all that apply.",
  order: "Put these in the correct order.",
  calc: "Enter a number.",
  highlight: "Choose each finding that applies.",
};

/* The last sentence of a calculation stem when it only says how to record
   the answer, with or without brackets. */
const CALC_CLOSING = /(?<=^|[.?!:]["'”’)]?)\s*\(?\s*((?:Record|Round)\b[^.?!()]*)\.?\s*\)?\s*$/;

const seg = (id, text) => ({ id, text: speakable(text) });

/* Long parts (a long rationale) are voiced in pieces of at most PART_MAX
   characters, split at sentence ends. The pieces share the part's id
   before "~", so the screen keeps the same element highlighted. */
export const PART_MAX = 450;
export const partOf = (id) => String(id ?? "").split("~")[0];
function pieces(text) {
  if (text.length <= PART_MAX) return [text];
  const out = [];
  let cur = "";
  for (const sentence of text.split(/(?<=[.?!;:])\s+(?=\S)/)) {
    if (cur && (cur + " " + sentence).length > PART_MAX) { out.push(cur); cur = ""; }
    // a single sentence longer than the limit is cut at word boundaries
    let rest = sentence;
    while (rest.length > PART_MAX) {
      const cut = rest.lastIndexOf(" ", PART_MAX);
      const at = cut > 0 ? cut : PART_MAX;
      if (cur) { out.push(cur); cur = ""; }
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    cur = cur ? `${cur} ${rest}` : rest;
  }
  if (cur) out.push(cur);
  return out;
}
const finish = (segs) => segs.filter((s) => s && s.text).flatMap((s) => pieces(s.text).map((t, i) => ({ id: i ? `${s.id}~${i + 1}` : s.id, text: t })));
const sentence = (s) => { const t = String(s ?? "").trim(); return /[.?!:]["'”’)\]]*$/.test(t) ? t : `${t}.`; };

/* ext is ngnExt(q): the item's NGN payload merged in (src/ngn.js). */
export function questionSegments(q, ext = q) {
  if (!q) return [];
  const out = [];
  const type = q.type ?? "mc";
  /* A stem that ENDS with how to answer ("... Select all that apply.")
     is read without it, and the instruction is read as its own short
     part: voices tend to skip that closing line (the voice job's failure
     log), and a short part is read reliably. */
  const tail = ["mc", "sata", "order"].includes(type) && Array.isArray(q.options) ? INSTRUCTION[type] : null;
  const trailing = tail ? new RegExp(`\\s*\\(?${tail.replace(/\.$/, "").replace(/\s+/g, "\\s+")}\\.?\\)?\\s*$`, "i") : null;
  const stemText = String(q.stem ?? "");
  let stem = trailing && trailing.test(stemText) && stemText.replace(trailing, "").trim() ? stemText.replace(trailing, "").trim() : stemText;
  /* A calculation's closing line says how to record the answer ("Record
     the whole number.", "Round to the nearest tenth."): voices skip it the
     same way, so it is read as the item's instruction instead. */
  const closing = type === "calc" ? stem.match(CALC_CLOSING) : null;
  if (closing && stem.slice(0, closing.index).trim()) stem = stem.slice(0, closing.index).trim();
  if (type === "cloze") {
    out.push(seg("stem", stem.replace(/\{(\d+)\}/g, (_, n) => ` blank ${Number(n) + 1} `)));
  } else {
    out.push(seg("stem", stem));
  }
  if (Array.isArray(ext.exhibit)) {
    ext.exhibit.forEach((tab, i) => { if (tab?.content) out.push(seg(`exhibit${i}`, `${sentence(tab.label ?? "Exhibit")} ${tab.content}`)); });
  }
  /* Many stems already end with the instruction ("Select all that
     apply."); say it once. */
  const said = (t) => stem.toLowerCase().includes(t.toLowerCase().replace(/\.$/, ""));
  const instruct = (t) => { if (!said(t)) out.push(seg("instruction", t)); };
  if (["mc", "sata", "order"].includes(type) && Array.isArray(q.options)) {
    instruct(INSTRUCTION[type]);
    q.options.forEach((o, i) => out.push(seg(`opt${i}`, sentence(o))));
  } else if (type === "highlight" && Array.isArray(ext.tokens)) {
    instruct(INSTRUCTION.highlight);
    ext.tokens.forEach((t, i) => out.push(seg(`tok${i}`, sentence(t))));
  } else if (type === "matrix" && Array.isArray(ext.rows) && Array.isArray(ext.columns)) {
    out.push(seg("instruction", `For each row, choose: ${ext.columns.join(", or ")}.`));
    ext.rows.forEach((r, i) => out.push(seg(`row${i}`, `Row ${i + 1}. ${sentence(r)}`)));
  } else if (type === "bowtie") {
    const group = (id, label, items) => Array.isArray(items) && items.length
      ? out.push(seg(id, `${label} ${items.map((it) => sentence(it)).join(" ")}`)) : 0;
    group("bt-actions", "Actions to take. Pick two.", ext.actions);
    group("bt-condition", "The condition. Pick one.", ext.conditions);
    group("bt-parameters", "Parameters to monitor. Pick two.", ext.parameters);
  } else if (type === "cloze" && Array.isArray(ext.dropdowns)) {
    ext.dropdowns.forEach((opts, i) => out.push(seg(`gap${i}`, `Blank ${i + 1}: ${(opts ?? []).join(", or ")}.`)));
  } else if (type === "calc") {
    const how = closing && stem !== stemText ? sentence(closing[1]) : INSTRUCTION.calc;
    out.push(seg("instruction", `${how}${ext.unit ? ` Answer in ${ext.unit}.` : ""}`));
  }
  return finish(out);
}

/* After an answer: the result in plain words, then the rationale. Points
   are said as the screen shows them; XP is not read (it is a game score,
   not the lesson). */
export function feedbackSegments({ verdict, rationale, correctOrder, correctChoices } = {}) {
  const out = [];
  if (verdict) out.push(seg("verdict", sentence(verdict)));
  if (correctOrder) out.push(seg("correction", `The correct order is: ${correctOrder}.`));
  if (correctChoices) out.push(seg("correction", `The correct choices are: ${correctChoices}.`));
  if (rationale) out.push(seg("rationale", `Rationale. ${rationale}`));
  return finish(out);
}

/* Case study: the chart is read once, before step one. */
export function caseIntroSegments(cs) {
  if (!cs) return [];
  const chart = [...(cs.vitals ?? []), ...(cs.labs ?? [])].map(([k, v]) => `${k} ${v}`).join("; ");
  return finish([
    seg("case-title", sentence(cs.title)),
    seg("case-intro", cs.intro),
    chart ? seg("case-chart", `Chart: ${chart}.`) : null,
    cs.note ? seg("case-note", `Nurse's note: ${cs.note}`) : null,
  ]);
}

export function caseStepSegments(step) {
  if (!step) return [];
  return questionSegments({ stem: step.stem, options: step.options, type: step.type === "sata" ? "sata" : "mc" });
}

/* Flashcards: the prompt before the flip, the answer only after it. */
export function cardSegments(card, flipped) {
  if (!card) return [];
  // A side with no text has nothing to read.
  if (!String((flipped ? card.back : card.front) ?? "").trim()) return [];
  return finish([flipped ? seg("card-back", `Answer. ${card.back}`) : seg("card-front", card.front)]);
}

/* ---------- one script source for the screen AND the voice server ----------
   The server (api/_speak.js) rebuilds the words from the bank row with the
   same functions and only voices a segment whose text matches exactly, so
   it can only ever say what the item on screen says. */

/* A result as the screen shows it. Anything else is refused. */
export function validResult(r) {
  return !!r && typeof r.correct === "boolean" && Number.isInteger(r.max) && r.max >= 1 && r.max <= 50 &&
    Number.isInteger(r.points) && r.points >= 0 && r.points <= r.max && (!r.correct || r.points === r.max);
}
export const verdictText = (r) => (r.correct ? "Correct" : r.points > 0 ? `Partly correct: ${r.points} of ${r.max} points` : "Incorrect");

export function questionFeedbackSegments(q, result) {
  if (!q || !validResult(result)) return [];
  const ex = ngnExt(q);
  const wrong = !result.correct;
  return feedbackSegments({
    verdict: verdictText(result),
    rationale: q.rationale,
    correctOrder: q.type === "order" && wrong && Array.isArray(q.answer) ? q.answer.map((i) => q.options[i]).join(", then ") : null,
    correctChoices: q.type === "cloze" && wrong && Array.isArray(q.answer) && Array.isArray(ex.dropdowns) ? q.answer.map((a, i) => ex.dropdowns[i]?.[a]).join("; ") : null,
  });
}
export function caseFeedbackSegments(step, result) {
  if (!step || !validResult(result)) return [];
  return feedbackSegments({ verdict: verdictText(result), rationale: step.rationale });
}

/* ref: what is being read. { kind: "question", part: "question" | "feedback", result? }
   { kind: "case", part: "intro" | "step" | "feedback", step?, result? }
   { kind: "card", part: "front" | "back" } */
export function scriptFor(ref, item) {
  if (!ref || !item) return [];
  if (ref.kind === "question") {
    if (ref.part === "question") return questionSegments(item, ngnExt(item));
    if (ref.part === "feedback") return questionFeedbackSegments(item, ref.result);
  }
  if (ref.kind === "case") {
    const step = Number.isInteger(ref.step) ? item.steps?.[ref.step] : null;
    if (ref.part === "intro") return caseIntroSegments(item);
    if (ref.part === "step") return caseStepSegments(step);
    if (ref.part === "feedback") return caseFeedbackSegments(step, ref.result);
  }
  if (ref.kind === "card" && (ref.part === "front" || ref.part === "back")) return cardSegments(item, ref.part === "back");
  return [];
}

/* Every voiceable part of one bank item, each with the reference it is
   read under: a question and its explanation; a case's introduction, every
   step and every step's explanation; both sides of a card. Used to queue a
   whole item at once and to voice the bank ahead of demand. (The result
   line of an explanation is shared text, voiced once for everyone.) */
const ANY_WRONG = { correct: false, points: 0, max: 1 };
export function itemParts(kind, row) {
  if (!row || !Number.isInteger(row.id)) return [];
  const out = [];
  const add = (ref, segs) => segs.forEach((x) => out.push({ ref, seg: x.id, text: x.text }));
  const base = { kind, id: row.id };
  if (kind === "question") {
    add({ ...base, part: "question" }, scriptFor({ kind, part: "question" }, row));
    add({ ...base, part: "feedback", result: ANY_WRONG }, questionFeedbackSegments(row, ANY_WRONG));
  } else if (kind === "case") {
    add({ ...base, part: "intro" }, scriptFor({ kind, part: "intro" }, row));
    (row.steps ?? []).forEach((step, i) => {
      add({ ...base, part: "step", step: i }, scriptFor({ kind, part: "step", step: i }, row));
      add({ ...base, part: "feedback", step: i, result: ANY_WRONG }, caseFeedbackSegments(step, ANY_WRONG));
    });
  } else if (kind === "card") {
    add({ ...base, part: "front" }, scriptFor({ kind, part: "front" }, row));
    add({ ...base, part: "back" }, scriptFor({ kind, part: "back" }, row));
  }
  return out.filter((x) => voiceable(x.text));
}
