#!/usr/bin/env node
/* PulseRN Readiness-Exam Factory
   ------------------------------------------------------------------
   Builds standardized 85-item exam forms that clone the real NCLEX-RN:
   3 six-step case studies (18 items) + 67 standalone items distributed
   per the official NCSBN client-needs percentages, realistic type mix.

   Every item passes the adversarial pipeline (generate → hostile
   cross-vendor review → schema gate) and auto-publishes at >= 0.85
   confidence, tagged exam_form=N so it is QUARANTINED from Practice.

   RESUMABLE: re-running fills only what's missing for the form.

   Usage:
     node ops/exam-factory.mjs --form 1
     node ops/exam-factory.mjs --form 1 --status   # counts only

   Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
   ------------------------------------------------------------------ */

import { createClient } from "@supabase/supabase-js";
import { validItem } from "./content-factory.mjs";
import { validCase } from "./case-factory.mjs";

const CATS = [
  "Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance",
  "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology",
  "Reduction of Risk", "Physiological Adaptation",
];

/* 67 standalone items per form, midpoints of the official NCSBN ranges. */
export const BLUEPRINT = {
  "Management of Care": 12,
  "Safety & Infection Control": 9,
  "Health Promotion & Maintenance": 6,
  "Psychosocial Integrity": 6,
  "Basic Care & Comfort": 6,
  "Pharmacology": 11,
  "Reduction of Risk": 8,
  "Physiological Adaptation": 9,
};
export const CASES_PER_FORM = 3;
export const STANDALONE_PER_FORM = Object.values(BLUEPRINT).reduce((a, b) => a + b, 0); // 67

const GEN_MODEL = "anthropic/claude-sonnet-4.6";
const REVIEW_MODEL = "openai/gpt-4.1";
const PASS_CONFIDENCE = 0.85;

const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const FORM = parseInt(opt("--form", "1"), 10);
const STATUS_ONLY = args.includes("--status");

let _sb = null;
const db = () => (_sb ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

async function llm(model, prompt, maxTokens = 8000) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.7, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error(`Empty response from ${model} ${data?.error?.message ?? ""}`);
  return text;
}
const parseJson = (raw) => JSON.parse(raw.replace(/```json|```/gi, "").trim());

/* Realistic type mix inside a category chunk. */
const typeMixNote = `Type mix for the batch: mostly "mc"; roughly 1 in 4 "sata"; sprinkle single items of "order", "matrix", "bowtie", "cloze", or "highlight" where the category suits them; Pharmacology batches must include 1-2 "calc" items.
Type schemas — respond ONLY with a raw JSON array, no fences, no commentary:
- mc:    {"cat","diff":1|2|3,"type":"mc","stem","options":[4-5 strings],"answer":index,"rationale"}
- sata:  {"cat","diff","type":"sata","stem","options":[5-6 strings],"answer":[indices],"rationale"}
- order: {"cat","diff","type":"order","stem","options":[4-5 strings],"answer":[full permutation],"rationale"}
- matrix:{"cat","diff","type":"matrix","stem","rows":[3-5],"columns":[2-3],"answer":[column index per row],"rationale"}
- bowtie:{"cat","diff","type":"bowtie","stem","actions":[5],"conditions":[4],"parameters":[5],"answer":{"actions":[2 indices],"condition":index,"parameters":[2 indices]},"rationale"}
- cloze: {"cat","diff","type":"cloze","stem with {0} {1} placeholders,"dropdowns":[[...],[...]],"answer":[index per dropdown],"rationale"}
- highlight: {"cat","diff","type":"highlight","stem":"Highlight each finding that ...","tokens":[6-8 findings],"answer":[indices],"rationale"}
- calc:  {"cat","diff","type":"calc","stem","unit","answer":number,"tolerance":0,"work":["Formula: ...","= ...","= ..."],"rationale"}
CUE RULE for sata/highlight: keyed options unambiguously abnormal/red-flag; non-keyed clearly normal — no borderline values.`;

function genPrompt(cat, n, existingStems) {
  return `You are an expert NCLEX-RN item writer building a STANDARDIZED READINESS EXAM that must feel identical to the real NCLEX. Write exactly ${n} exam-quality items for the client-needs category "${cat}".

${typeMixNote}

Rules:
- Real-exam register: clinical-judgment stems, plausible distractors, exactly one defensible key, current practice standards.
- Educational exam-prep content only — never real-world dosing/treatment instructions.
- Do NOT duplicate these existing stems: ${existingStems.slice(0, 60).join(" ~ ") || "(none)"}`;
}

function reviewPrompt(items) {
  return `You are a hostile NCLEX exam auditor — your job is to keep flawed items OFF a high-stakes readiness exam. For each item: KEY CHECK (argue for a distractor), CURRENCY, SAFETY, QUALITY, and for sata/highlight items verify every keyed option is unambiguously correct and every non-keyed clearly not.

Respond ONLY with a raw JSON array, same order as input:
{"verdict":"pass"|"fail","confidence":0-1,"notes":"why"}
Fail anything you are not certain about.

ITEMS:
${JSON.stringify(items)}`;
}

async function existingCounts() {
  const { data } = await db().from("questions").select("cat").eq("exam_form", FORM).eq("approved", true);
  const counts = Object.fromEntries(CATS.map((c) => [c, 0]));
  for (const r of data ?? []) counts[r.cat] = (counts[r.cat] ?? 0) + 1;
  const { count: caseCount } = await db().from("case_studies").select("id", { count: "exact", head: true })
    .eq("exam_form", FORM).eq("approved", true);
  return { counts, caseCount: caseCount ?? 0 };
}

async function fillCategory(cat, need, existingStems) {
  const raw = await llm(GEN_MODEL, genPrompt(cat, need, existingStems), 12000);
  let items;
  try { items = parseJson(raw); } catch { console.log(`  ✗ ${cat}: unparseable generation`); return 0; }
  if (!Array.isArray(items)) return 0;
  const schemaOk = items.filter((it) => {
    if (it?.cat !== cat) return false;
    const err = validItem(it);
    if (err) console.log(`  ✗ schema: ${err}`);
    return !err;
  });
  if (!schemaOk.length) return 0;
  let reviews;
  try { reviews = parseJson(await llm(REVIEW_MODEL, reviewPrompt(schemaOk), 8000)); } catch { console.log("  ✗ review unparseable"); return 0; }
  let inserted = 0;
  for (let i = 0; i < schemaOk.length && inserted < need; i++) {
    const it = schemaOk[i];
    const r = reviews[i] ?? { verdict: "fail" };
    if (r.verdict !== "pass" || (r.confidence ?? 0) < PASS_CONFIDENCE) { console.log(`  ✗ audit fail: ${(r.notes ?? "").slice(0, 60)}`); continue; }
    const { error } = await db().from("questions").insert({
      cat: it.cat, diff: it.diff, type: it.type, stem: it.stem,
      options: it.options ?? null,
      extra: {
        rows: it.rows ?? null, columns: it.columns ?? null,
        actions: it.actions ?? null, conditions: it.conditions ?? null,
        parameters: it.parameters ?? null, dropdowns: it.dropdowns ?? null,
        unit: it.unit ?? null, tolerance: it.tolerance ?? null,
        tokens: it.tokens ?? null, exhibit: it.exhibit ?? null, work: it.work ?? null,
      },
      answer: it.answer, rationale: it.rationale,
      ai: true, approved: true, exam_form: FORM, // owner-directed adversarial gate for exams
      gen_model: GEN_MODEL, review_model: REVIEW_MODEL, reviewer_notes: r.notes ?? null,
    });
    if (!error) inserted++;
  }
  return inserted;
}

async function run() {
  const { counts, caseCount } = await existingCounts();
  console.log(`Exam form ${FORM} · standalone ${Object.values(counts).reduce((a, b) => a + b, 0)}/${STANDALONE_PER_FORM} · cases ${caseCount}/${CASES_PER_FORM}`);
  if (STATUS_ONLY) return;

  const { data: stemRows } = await db().from("questions").select("stem").eq("exam_form", FORM).limit(200);
  const existingStems = (stemRows ?? []).map((r) => r.stem.slice(0, 60));

  for (const cat of CATS) {
    let need = BLUEPRINT[cat] - (counts[cat] ?? 0);
    let attempts = 0;
    while (need > 0 && attempts < 3) {
      attempts++;
      console.log(`${cat}: need ${need} (attempt ${attempts})`);
      const got = await fillCategory(cat, need, existingStems);
      console.log(`  → published ${got}`);
      need -= got;
    }
  }

  // cases: run the case factory logic inline via child process to keep one source of truth
  let casesNeeded = CASES_PER_FORM - caseCount;
  if (casesNeeded > 0) {
    const { execFileSync } = await import("child_process");
    // pick the thinnest categories for variety across the form's three cases
    for (let i = 0; i < casesNeeded; i++) {
      console.log(`case ${caseCount + i + 1}/${CASES_PER_FORM} for form ${FORM}…`);
      try {
        execFileSync("node", ["ops/case-factory.mjs", "--count", "1", "--exam-form", String(FORM)], { stdio: "inherit" });
      } catch { console.log("  case run failed — rerun to resume"); }
    }
  }
  const after = await existingCounts();
  console.log(`Form ${FORM} now: standalone ${Object.values(after.counts).reduce((a, b) => a + b, 0)}/${STANDALONE_PER_FORM} · cases ${after.caseCount}/${CASES_PER_FORM}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => { console.error("EXAM FACTORY FAILED:", e.message); process.exit(1); });
}
