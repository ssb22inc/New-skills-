#!/usr/bin/env node
/* PulseRN Case-Study Factory
   ------------------------------------------------------------------
   Generates full six-step NGN case studies (NCSBN Clinical Judgment
   Measurement Model): recognize cues → analyze cues → prioritize
   hypotheses → generate solutions → take action → evaluate outcomes.

   Pipeline per case: GENERATE (strong model) → ADVERSARIAL REVIEW by a
   different vendor (every step's key attacked) → SCHEMA GATE →
   AUTO-PUBLISH at >= 0.85 reviewer confidence (owner amendment: the
   licensed-RN owner designated cross-vendor adversarial review as the
   quality gate for scaled case content). Failing cases are dropped.

   Usage:
     node ops/case-factory.mjs --count 3
     node ops/case-factory.mjs --count 1 --cat "Pharmacology"
     node ops/case-factory.mjs --dry-run

   Env (server-side only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
   ------------------------------------------------------------------ */

import { createClient } from "@supabase/supabase-js";

const CATS = [
  "Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance",
  "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology",
  "Reduction of Risk", "Physiological Adaptation",
];
const PHASES = ["Recognize Cues", "Analyze Cues", "Prioritize Hypotheses", "Generate Solutions", "Take Action", "Evaluate Outcomes"];

const GEN_MODEL = "anthropic/claude-sonnet-4.6";
const REVIEW_MODEL = "openai/gpt-4.1";
const PASS_CONFIDENCE = 0.85;

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const COUNT = parseInt(opt("--count", "2"), 10);
const FORCE_CAT = opt("--cat", null);
const EXAM_FORM = opt("--exam-form", null) ? parseInt(opt("--exam-form", null), 10) : null;
const DRY = flag("--dry-run");

let _sb = null;
const db = () => (_sb ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

async function llm(model, prompt, maxTokens = 6000) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.7, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error(`Empty response from ${model}`);
  return text;
}
const parseJson = (raw) => JSON.parse(raw.replace(/```json|```/gi, "").trim());

/* ---------- schema gate (exported for tests) ---------- */
export function validCase(c) {
  if (!c || typeof c !== "object") return "not an object";
  if (!CATS.includes(c.cat)) return "bad category";
  if (typeof c.title !== "string" || c.title.length < 8 || c.title.length > 90) return "bad title";
  if (typeof c.blurb !== "string" || c.blurb.length < 15 || c.blurb.length > 200) return "bad blurb";
  if (typeof c.intro !== "string" || c.intro.length < 40) return "bad intro";
  if (typeof c.note !== "string" || c.note.length < 30) return "bad note";
  for (const k of ["vitals", "labs"]) {
    if (!Array.isArray(c[k]) || !c[k].every((p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === "string"))) return `bad ${k}`;
  }
  if (c.vitals.length < 3) return "too few vitals";
  if (!Array.isArray(c.steps) || c.steps.length !== 6) return "needs exactly 6 steps";
  for (let i = 0; i < 6; i++) {
    const s = c.steps[i];
    if (!s || s.phase !== PHASES[i]) return `step ${i + 1} phase must be "${PHASES[i]}"`;
    if (!["mc", "sata"].includes(s.type)) return `step ${i + 1} bad type`;
    if (typeof s.stem !== "string" || s.stem.length < 20) return `step ${i + 1} bad stem`;
    if (typeof s.rationale !== "string" || s.rationale.length < 60) return `step ${i + 1} rationale too short`;
    if (!Array.isArray(s.options) || s.options.length < 4 || !s.options.every((o) => typeof o === "string")) return `step ${i + 1} needs 4+ options`;
    if (s.type === "mc") {
      if (!Number.isInteger(s.answer) || s.answer < 0 || s.answer >= s.options.length) return `step ${i + 1} mc answer out of range`;
    } else {
      if (!Array.isArray(s.answer) || !s.answer.length || s.answer.length >= s.options.length ||
          new Set(s.answer).size !== s.answer.length ||
          !s.answer.every((n) => Number.isInteger(n) && n >= 0 && n < s.options.length)) return `step ${i + 1} sata answer invalid`;
    }
  }
  return null;
}

function genPrompt(cat, existingTitles) {
  return `You are an expert NCLEX-RN item writer creating a Next Generation NCLEX case study for the client-needs category "${cat}", following the NCSBN Clinical Judgment Measurement Model.

Respond ONLY with one raw JSON object, no fences, no commentary, exactly this shape:
{
 "cat": "${cat}",
 "title": "<Condition · Short Hook, under 80 chars>",
 "blurb": "<one-sentence hook for the case picker, under 160 chars>",
 "intro": "<time · setting. Client name (invented), age, context — 2-3 sentences>",
 "vitals": [["Temp","37.1 °C"],["HR","..."],["BP","..."],["RR","..."],["SpO₂","..."]],
 "labs": [["<test>","<value with units>"], ...0-5 entries],
 "note": "<nurse's assessment note, 2-4 sentences, contains the cues>",
 "steps": [
   {"phase":"Recognize Cues","type":"sata","stem":"Which findings require immediate follow-up? Select all that apply.","options":[6 findings mixing expected and concerning],"answer":[indices],"rationale":"why each keyed finding matters AND why the others are expected"},
   {"phase":"Analyze Cues","type":"mc","stem":"...most consistent with which condition?","options":[4],"answer":index,"rationale":"..."},
   {"phase":"Prioritize Hypotheses","type":"mc","stem":"Which problem poses the greatest immediate risk?","options":[4],"answer":index,"rationale":"..."},
   {"phase":"Generate Solutions","type":"sata","stem":"Which interventions should the nurse anticipate? Select all that apply.","options":[5-6],"answer":[indices],"rationale":"..."},
   {"phase":"Take Action","type":"mc","stem":"<a during-treatment decision point>","options":[4],"answer":index,"rationale":"..."},
   {"phase":"Evaluate Outcomes","type":"sata","stem":"Which findings indicate the plan of care is effective? Select all that apply.","options":[5],"answer":[indices],"rationale":"..."}
 ]
}

Rules:
- A coherent single client whose data stays consistent across all six steps.
- Exactly one defensible key per step; distractors plausible but clearly wrong to a competent nurse.
- CUE KEYING (the #1 rejection cause — follow strictly): in every select-all step, each KEYED option must be UNAMBIGUOUSLY abnormal or a classic red flag (clearly outside normal range or textbook-concerning), and each NON-KEYED option must be clearly normal or expected. NEVER use borderline values that nurses could argue about — no SpO₂ 94-96%, no HR 100-115 in isolation, no "irregular" rhythm without context, no BP that is high-ish but not severe. Make abnormals obviously abnormal and normals obviously normal.
- Current practice standards; educational exam-prep register — never real-world dosing/treatment instructions.
- Plain text throughout, no markdown.
- Do NOT reuse these existing case topics: ${existingTitles.join(" ~ ") || "(none)"}`;
}

function reviewPrompt(c) {
  return `You are a rigorous NGN case-study reviewer — a licensed nurse educator. Judge EACH of the six steps separately.

Fail a step ONLY for MATERIAL flaws:
- a keyed option that is factually wrong or unsafe,
- a non-keyed option that is equally defensible as correct,
- outdated values/drugs/protocols,
- contradiction with the case chart or other steps,
- anything readable as real-world treatment instruction.
Do NOT fail a step for stylistic preference or a judgment call where the key is clearly defensible as the single BEST answer — that standard, not perfection, is what the NCLEX itself uses.

Respond ONLY with one raw JSON object:
{"steps":[{"step":1,"verdict":"pass"|"fail","notes":"why, specifically"}, … one entry per step, 6 total],"overall":"pass"|"fail","confidence":0-1}
overall = pass only if every step passes. Material doubt → fail that step.

CASE:
${JSON.stringify(c)}`;
}

const reviewOk = (rev) =>
  rev && rev.overall === "pass" && (rev.confidence ?? 0) >= PASS_CONFIDENCE &&
  Array.isArray(rev.steps) && rev.steps.every((s) => s.verdict === "pass");
const failNotes = (rev) =>
  (rev?.steps ?? []).filter((s) => s.verdict === "fail")
    .map((s) => `Step ${s.step}: ${s.notes}`).join(" | ") || rev?.notes || "(no notes)";

async function run() {
  console.log(`Case factory · count=${COUNT} · ${DRY ? "DRY RUN" : "live, auto-publish at ≥" + PASS_CONFIDENCE}`);

  let existingTitles = [];
  let counts = {};
  if (!DRY) {
    const { data } = await db().from("case_studies").select("title, cat").limit(500);
    existingTitles = (data ?? []).map((r) => r.title);
    for (const c of CATS) counts[c] = (data ?? []).filter((r) => r.cat === c).length;
  }

  let published = 0;
  for (let i = 0; i < COUNT; i++) {
    const cat = FORCE_CAT ?? CATS.slice().sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0))[0];
    console.log(`\n[${i + 1}/${COUNT}] generating a "${cat}" case…`);
    try {
      const raw = await llm(GEN_MODEL, genPrompt(cat, existingTitles), 6000);
      let c = parseJson(raw);
      let err = validCase(c);
      if (err) { console.log(`  ✗ schema reject: ${err}`); continue; }
      // per-step review → targeted repair loop (up to 3 rounds); each repair
      // fixes only the steps the reviewer failed, then the case is re-reviewed.
      let rev = parseJson(await llm(REVIEW_MODEL, reviewPrompt(c), 3000));
      let repairs = 0;
      while (!reviewOk(rev) && repairs < 3) {
        repairs++;
        console.log(`  ↻ repair ${repairs}: ${failNotes(rev).slice(0, 110)}`);
        const fixedRaw = await llm(GEN_MODEL, `You wrote this NGN case study; a reviewer failed specific steps. Rewrite ONLY the failed steps so every keyed option is unambiguously the best answer and every non-keyed option is clearly not (obvious abnormals vs obvious normals — no borderline values). Keep every passing step and the chart EXACTLY as-is. Respond ONLY with the complete corrected case as raw JSON in the same shape, no fences, no commentary.

FAILED STEPS:
${failNotes(rev)}

CASE:
${JSON.stringify(c)}`, 6000);
        const fixed = parseJson(fixedRaw);
        err = validCase(fixed);
        if (err) { console.log(`  ✗ repair broke schema: ${err}`); break; }
        c = fixed;
        rev = parseJson(await llm(REVIEW_MODEL, reviewPrompt(c), 3000));
      }
      if (err || !reviewOk(rev)) {
        console.log(`  ✗ REVIEW FAIL after ${repairs} repair(s) (${rev?.confidence ?? "?"}): ${failNotes(rev).slice(0, 110)}`);
        continue;
      }
      console.log(`  ✓ pass (${rev.confidence}${repairs ? `, after ${repairs} repair(s)` : ""}): "${c.title}"`);
      if (DRY) { published++; continue; }
      const { error } = await db().from("case_studies").insert({
        cat: c.cat, title: c.title, blurb: c.blurb, intro: c.intro,
        vitals: c.vitals, labs: c.labs, note: c.note, steps: c.steps,
        ai: true, approved: true, // owner-amended gate: adversarial review passed
        exam_form: EXAM_FORM, // null = library case; 1..10 = quarantined to that exam
        gen_model: GEN_MODEL, review_model: REVIEW_MODEL, reviewer_notes: null,
      });
      if (error) { console.log(`  ~ skip (${error.code === "23505" ? "duplicate title" : error.message.slice(0, 50)})`); continue; }
      existingTitles.push(c.title);
      counts[cat] = (counts[cat] ?? 0) + 1;
      published++;
    } catch (e) {
      console.log(`  ✗ error: ${e.message.slice(0, 100)}`);
    }
  }
  console.log(`\nPublished ${published}/${COUNT} cases.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => { console.error("CASE FACTORY FAILED:", e.message); process.exit(1); });
}
