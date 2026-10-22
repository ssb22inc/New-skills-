/* NGN item support (PULSERN_BUILD.md §5.4): pure scorers + validation.
   Deterministic plain code (CLAUDE.md rule 6).

   Two layers of scoring:
   • partial credit — scoreItem()/scoreCaseStep() return { points, max } using
     NCSBN-style NGN rules (0/1, +/-, 0/1 per row or component; see below).
     The QBank and case studies score with these.
   • full credit — the boolean scorers (scoreMatrix, scoreBowtie, …) and
     isFullCredit() say whether every point was earned. The ability engine,
     readiness and the review schedule are fed this full-credit outcome, so
     their calibration is exactly what it was under all-or-nothing scoring.
   Bank items carry NGN payloads under q.extra; locally-generated items may
   carry them at the top level — ngnExt() accepts both. */

export const ngnExt = (q) => ({ ...q, ...(q.extra ?? {}) });

/* matrix: sel maps every row index to a column index. */
export const scoreMatrix = (sel, answer) =>
  Array.isArray(sel) && Array.isArray(answer) &&
  answer.every((col, row) => sel[row] === col);

/* bowtie: set-equal per slot — 2 actions, 1 condition, 2 parameters. */
const setEq = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
  [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);
export const scoreBowtie = (sel, answer) =>
  !!sel && !!answer &&
  setEq(sel.actions ?? [], answer.actions) &&
  sel.condition === answer.condition &&
  setEq(sel.parameters ?? [], answer.parameters);

/* cloze: every dropdown index matches. */
export const scoreCloze = (sel, answer) =>
  Array.isArray(sel) && Array.isArray(answer) &&
  answer.every((a, i) => sel[i] === a);

/* calc: numeric entry within tolerance (exact by default). Accepts the
   typed string; commas and leading/trailing space are forgiven. */
export const scoreCalc = (sel, answer, tolerance = 0) => {
  const n = parseFloat(String(sel ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && Number.isFinite(answer) && Math.abs(n - answer) <= tolerance;
};

/* Four-function calculator step (immediate execution, like the NCLEX
   on-screen calculator). Deterministic plain math; result is trimmed of
   floating-point noise. */
export const fourFn = (a, b, op) => {
  const r = op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : b === 0 ? NaN : a / b;
  return Number.isFinite(r) ? parseFloat(r.toPrecision(12)) : NaN;
};

/* highlight: set-equal selection of token indices (NGN enhanced hot spot). */
export const scoreHighlight = (sel, answer) =>
  Array.isArray(sel) && Array.isArray(answer) && sel.length === answer.length &&
  [...sel].sort((a, b) => a - b).every((v, i) => v === [...answer].sort((a, b) => a - b)[i]);

/* ---------------- NCSBN-style partial credit ----------------
   Every scorer returns { points, max }. Selections that are malformed or
   missing earn 0 rather than throwing. */
const ints = (a) => (Array.isArray(a) ? [...new Set(a.filter((n) => Number.isInteger(n)))] : []);

/* 0/1 — single-answer multiple choice (also calc: one numeric entry). */
export const partialMC = (sel, answer) => {
  const pick = Array.isArray(sel) ? sel[0] : sel;
  return { points: pick === answer ? 1 : 0, max: 1 };
};

/* +/- — multiple response "select all that apply" and highlight: +1 for each
   keyed option selected, −1 for each unkeyed option selected, floor 0.
   max = number of keyed options. */
export const partialPlusMinus = (sel, answer) => {
  const keyed = ints(answer);
  let pts = 0;
  for (const i of ints(sel)) pts += keyed.includes(i) ? 1 : -1;
  return { points: Math.max(0, pts), max: keyed.length };
};
export const partialSATA = partialPlusMinus;
export const partialHighlight = partialPlusMinus;

/* 0/1 per keyed option — multiple response "select N": +1 for each keyed
   option among the selections, no penalty, and only the first N selections
   count (so selecting everything cannot earn full credit). */
export const partialSelectN = (sel, answer, n = ints(answer).length) => {
  const keyed = ints(answer);
  const counted = ints(sel).slice(0, n);
  return { points: counted.filter((i) => keyed.includes(i)).length, max: keyed.length };
};

/* 0/1 per row — matrix/grid (one choice per row). */
export const partialMatrix = (sel, answer) => {
  const key = Array.isArray(answer) ? answer : [];
  const s = Array.isArray(sel) ? sel : [];
  return { points: key.filter((col, row) => s[row] === col).length, max: key.length };
};

/* 0/1 per component — drop-down cloze (one point per dropdown). */
export const partialCloze = (sel, answer) => {
  const key = Array.isArray(answer) ? answer : [];
  const s = Array.isArray(sel) ? sel : [];
  return { points: key.filter((a, i) => s[i] === a).length, max: key.length };
};

/* 0/1 per component — drag-and-drop ordered response: one point for each
   option placed in its keyed position. */
export const partialOrder = (sel, answer) => {
  const key = Array.isArray(answer) ? answer : [];
  const s = Array.isArray(sel) ? sel : [];
  return { points: key.filter((opt, pos) => s[pos] === opt).length, max: key.length };
};

/* 0/1 per component — bow-tie: one point for each keyed action (2), the
   condition (1) and each keyed parameter (2); max 5. Only as many picks per
   slot as the slot holds are counted, so over-selecting cannot add points. */
export const partialBowtie = (sel, answer) => {
  if (!answer) return { points: 0, max: 0 };
  const slot = (picked, keyed) => {
    const k = ints(keyed);
    return ints(picked).slice(0, k.length).filter((i) => k.includes(i)).length;
  };
  const max = ints(answer.actions).length + 1 + ints(answer.parameters).length;
  if (!sel) return { points: 0, max };
  const points = slot(sel.actions, answer.actions) +
    (Number.isInteger(sel.condition) && sel.condition === answer.condition ? 1 : 0) +
    slot(sel.parameters, answer.parameters);
  return { points, max };
};

/* Score any QBank item. `sel` is the student's response in the shape the
   QBank collects it (ordered items pass the order array). Items flagged
   with an integer selectN (top level or under extra) score as select-N. */
export function scoreItem(q, sel) {
  const ext = ngnExt(q);
  switch (q.type) {
    case "mc": return partialMC(sel, q.answer);
    case "sata":
      return Number.isInteger(ext.selectN) ? partialSelectN(sel, q.answer, ext.selectN) : partialSATA(sel, q.answer);
    case "highlight": return partialHighlight(sel, q.answer);
    case "order": return partialOrder(sel, q.answer);
    case "matrix": return partialMatrix(sel, q.answer);
    case "cloze": return partialCloze(sel, q.answer);
    case "bowtie": return partialBowtie(sel, q.answer);
    case "calc": return { points: scoreCalc(sel, q.answer, ext.tolerance ?? 0) ? 1 : 0, max: 1 };
    default: return { points: 0, max: 1 };
  }
}

/* Case-study steps are mc or sata items; same rules. */
export const scoreCaseStep = (step, sel) => scoreItem(step, sel);

/* Full credit = every available point earned. This is the correct/incorrect
   outcome the ability engine, XP, readiness and review schedule receive. */
export const isFullCredit = ({ points, max }) => max > 0 && points === max;

/* Sum step scores into a case total. */
export const sumScores = (scores) =>
  scores.reduce((t, s) => ({ points: t.points + (s?.points ?? 0), max: t.max + (s?.max ?? 0) }), { points: 0, max: 0 });

/* Validate items before they enter the bank — mirrors the factory's
   validItem structurally, with the app's original text thresholds so the
   built-in bank stays valid. Returns boolean (app convention). */
export function validQ(x) {
  if (!x || typeof x.stem !== "string" || x.stem.length < 20) return false;
  if (typeof x.rationale !== "string" || x.rationale.length < 40) return false;
  if (![1, 2, 3].includes(x.diff)) return false;
  const ext = ngnExt(x);
  const strOpts = (min) => Array.isArray(x.options) && x.options.length >= min && x.options.every((o) => typeof o === "string");
  switch (x.type) {
    case "mc":
      return strOpts(3) && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.options.length;
    case "sata":
      return strOpts(3) && Array.isArray(x.answer) && x.answer.length > 0 &&
        x.answer.every((n) => Number.isInteger(n) && n >= 0 && n < x.options.length);
    case "order":
      return strOpts(3) && Array.isArray(x.answer) &&
        [...x.answer].sort((a, b) => a - b).join() === [...Array(x.options.length).keys()].join();
    case "matrix":
      return Array.isArray(ext.rows) && ext.rows.length >= 2 &&
        Array.isArray(ext.columns) && ext.columns.length >= 2 &&
        Array.isArray(x.answer) && x.answer.length === ext.rows.length &&
        x.answer.every((c) => Number.isInteger(c) && c >= 0 && c < ext.columns.length);
    case "bowtie": {
      if (!["actions", "conditions", "parameters"].every((k) => Array.isArray(ext[k]) && ext[k].length >= 3)) return false;
      const a = x.answer;
      return !!a &&
        Array.isArray(a.actions) && a.actions.length === 2 &&
        a.actions.every((n) => Number.isInteger(n) && n >= 0 && n < ext.actions.length) &&
        Number.isInteger(a.condition) && a.condition >= 0 && a.condition < ext.conditions.length &&
        Array.isArray(a.parameters) && a.parameters.length === 2 &&
        a.parameters.every((n) => Number.isInteger(n) && n >= 0 && n < ext.parameters.length);
    }
    case "cloze": {
      if (!Array.isArray(ext.dropdowns) || !ext.dropdowns.length) return false;
      if (!Array.isArray(x.answer) || x.answer.length !== ext.dropdowns.length) return false;
      for (let i = 0; i < ext.dropdowns.length; i++) {
        if (!x.stem.includes(`{${i}}`)) return false;
        if (!Array.isArray(ext.dropdowns[i]) || !Number.isInteger(x.answer[i]) ||
            x.answer[i] < 0 || x.answer[i] >= ext.dropdowns[i].length) return false;
      }
      return true;
    }
    case "calc":
      return typeof x.answer === "number" && Number.isFinite(x.answer) &&
        typeof ext.unit === "string" && ext.unit.length > 0 &&
        (ext.tolerance === undefined || (typeof ext.tolerance === "number" && ext.tolerance >= 0));
    case "highlight":
      return Array.isArray(ext.tokens) && ext.tokens.length >= 4 &&
        ext.tokens.every((t) => typeof t === "string" && t.length) &&
        Array.isArray(x.answer) && x.answer.length >= 1 &&
        x.answer.length < ext.tokens.length &&
        new Set(x.answer).size === x.answer.length &&
        x.answer.every((n) => Number.isInteger(n) && n >= 0 && n < ext.tokens.length);
    default:
      return false;
  }
}
