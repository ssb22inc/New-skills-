/* NGN item support (PULSERN_BUILD.md §5.4): pure scorers + validation.
   Scoring is all-or-nothing, deterministic plain code (CLAUDE.md rule 6).
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
