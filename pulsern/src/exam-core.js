/* Readiness-exam rules shared by the browser (src/exam.jsx) and the server
   (api/exam.js). Plain JS, no React, so Node can import it.

   The server builds every exam, keeps the answer key, and grades. The
   browser only renders items that have had their answers removed. Scoring
   is all-or-nothing, deterministic plain code (CLAUDE.md rule 6), and the
   same scorers Practice uses. */
import { ngnExt, scoreMatrix, scoreBowtie, scoreCloze, scoreCalc, scoreHighlight } from "./ngn.js";

export const EXAM_FORMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const EXAM_MINUTES = 170; // 5h/150 items on the real exam → 85 items ≈ 2h50m
/* Owner order: >=30 case-study questions per exam. 5 cases x 6 steps = 30,
   plus 55 standalone = the same 85-question NCLEX-minimum length. The DB
   holds 67 standalone per form; the runner draws 55 of them. */
export const FULL_STANDALONE = 55, FULL_CASES = 5;

/* ---- deterministic verdict tiers (self-assessment estimate) ---- */
export function verdictFor(pct) {
  if (pct >= 68) return { tier: "HIGH", label: "High readiness (estimate): performing above the passing standard", cls: "ok" };
  if (pct >= 55) return { tier: "BORDERLINE", label: "Borderline (estimate): near the passing standard, so focus on your weak categories", cls: "warn" };
  return { tier: "BELOW", label: "Below the passing standard (estimate): build fundamentals before test day", cls: "no" };
}

/* score one item, all-or-nothing, same scorers as Practice */
export function scoreItem(q, sel, order) {
  const ext = ngnExt(q);
  switch (q.type) {
    case "mc": return Array.isArray(sel) && sel[0] === q.answer;
    case "sata": return Array.isArray(sel) && Array.isArray(q.answer) && sel.length === q.answer.length && [...sel].sort((a, b) => a - b).every((v, i) => v === [...q.answer].sort((a, b) => a - b)[i]);
    case "order": return Array.isArray(order) && Array.isArray(q.answer) && order.length === q.answer.length && order.every((v, i) => v === q.answer[i]);
    case "matrix": return scoreMatrix(sel, q.answer);
    case "bowtie": return scoreBowtie(sel, q.answer);
    case "cloze": return scoreCloze(sel, q.answer);
    case "calc": return scoreCalc(sel, q.answer, ext.tolerance ?? 0);
    case "highlight": return scoreHighlight(sel, q.answer);
    default: return false;
  }
}

/* Stable keys for every item an exam can serve: a bank question, or one
   step of a case study. The attempt row stores these, in served order. */
export const questionKey = (id) => `q:${id}`;
export const caseStepKey = (caseId, step) => `c:${caseId}:${step}`;

/* Fisher-Yates with an injectable source so tests can pin the order. */
function shuffled(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Build the exam a student sits: a fresh shuffle of FULL_STANDALONE bank
   items, with up to FULL_CASES case studies (6 steps each) inserted at
   roughly even points, like the real thing. Each entry is
   { key, q (WITH answer and rationale), caseInfo? } — callers strip the
   answers with publicEntry() before anything leaves the server. */
export function buildSequence(items, cases, rng = Math.random) {
  const seq = shuffled(items ?? [], rng).slice(0, FULL_STANDALONE)
    .map((q) => ({ key: questionKey(q.id), q }));
  const picked = (cases ?? []).slice(0, FULL_CASES);
  const nCases = picked.length;
  picked.forEach((c, ci) => {
    const steps = Array.isArray(c.steps) ? c.steps : [];
    const at = Math.min(seq.length, Math.floor(((ci + 1) / (nCases + 1)) * seq.length) + ci * steps.length);
    const entries = steps.map((s, si) => ({
      key: caseStepKey(c.id, si),
      q: { ...s, id: `x${c.id}-${si}`, cat: c.cat, diff: 3 },
      caseInfo: { title: c.title, intro: c.intro, vitals: c.vitals, labs: c.labs, note: c.note, step: si + 1, of: steps.length },
    }));
    seq.splice(at, 0, ...entries);
  });
  return seq;
}

/* Every served item, looked up by key, from the form's rows. */
export function itemsByKey(items, cases) {
  const m = new Map();
  for (const q of items ?? []) m.set(questionKey(q.id), { q });
  for (const c of cases ?? []) {
    (Array.isArray(c.steps) ? c.steps : []).forEach((s, si) => {
      m.set(caseStepKey(c.id, si), {
        q: { ...s, id: `x${c.id}-${si}`, cat: c.cat, diff: 3 },
        caseInfo: { title: c.title, intro: c.intro, vitals: c.vitals, labs: c.labs, note: c.note, step: si + 1, of: c.steps.length },
      });
    });
  }
  return m;
}

const SECRET_KEYS = ["answer", "rationale"];
const withoutSecrets = (obj) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = { ...obj };
  for (const k of SECRET_KEYS) delete out[k];
  return out;
};

/* An item as the browser may see it during the exam: no answer, no
   rationale, at the top level or inside the NGN payload. */
export function publicItem(q) {
  const out = withoutSecrets(q);
  if (out.extra) out.extra = withoutSecrets(out.extra);
  return out;
}

export const publicEntry = (e) => ({ key: e.key, q: publicItem(e.q), ...(e.caseInfo ? { caseInfo: e.caseInfo } : {}) });

/* Grade the responses against the served keys. Only keys that were served
   count, each once, in served order. Unanswered items are left out, so
   ending early scores only what was answered (same as before). */
export function gradeResponses(servedKeys, byKey, responses) {
  const given = new Map();
  for (const r of Array.isArray(responses) ? responses : []) {
    if (r && typeof r.key === "string" && !given.has(r.key)) given.set(r.key, r);
  }
  const graded = [];
  for (const key of servedKeys) {
    const r = given.get(key);
    const item = byKey.get(key);
    if (!r || !item) continue;
    graded.push({ key, ok: scoreItem(item.q, r.sel, r.order), q: item.q, ...(item.caseInfo ? { caseInfo: item.caseInfo } : {}) });
  }
  const correct = graded.filter((g) => g.ok).length;
  const total = graded.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const byCat = {};
  for (const g of graded) {
    if (!byCat[g.q.cat]) byCat[g.q.cat] = { n: 0, ok: 0 };
    byCat[g.q.cat].n++; if (g.ok) byCat[g.q.cat].ok++;
  }
  return { graded, correct, total, pct, byCat, verdict: verdictFor(pct).tier, incomplete: total < servedKeys.length };
}
