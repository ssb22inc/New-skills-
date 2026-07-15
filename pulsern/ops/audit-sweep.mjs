#!/usr/bin/env node
/* PulseRN Adversarial Re-Audit Sweep
   ------------------------------------------------------------------
   The owner's rule: the adversarial AI is the accuracy gate for
   everything on the site. Generation-time review already gates each
   item; this sweep RE-audits content that is already live, so the
   bank can be re-verified at any time (model updates, guideline
   changes, owner request).

   Any item the hostile reviewer fails is QUARANTINED on the spot
   (approved=false + reviewer_notes) and disappears from the app;
   re-running exam-factory / card-factory then refills the gap with
   a fresh item that must itself survive review.

   Usage:
     node ops/audit-sweep.mjs --exams            # all exam items (default)
     node ops/audit-sweep.mjs --exams --form 3   # one form
     node ops/audit-sweep.mjs --cases            # exam case studies
   Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
   ------------------------------------------------------------------ */
import { createClient } from "@supabase/supabase-js";

const REVIEW_MODEL = "openai/gpt-4.1";
const PASS_CONFIDENCE = 0.85;
const BATCH = 6;

const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const FORM = opt("--form", null);
const DO_CASES = args.includes("--cases");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function llm(prompt, maxTokens = 8000) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model: REVIEW_MODEL, max_tokens: maxTokens, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error(`Empty response from ${REVIEW_MODEL} ${data?.error?.message ?? ""}`);
  return text;
}
const parseJson = (raw) => JSON.parse(raw.replace(/```json|```/gi, "").trim());

const itemPrompt = (items) => `You are a hostile NCLEX exam auditor re-verifying items that are ALREADY LIVE on a high-stakes readiness exam. Be maximally skeptical. For each item: KEY CHECK (argue hard for a distractor — fail if any distractor is defensible), CURRENCY (current practice standards), SAFETY, QUALITY (unambiguous stem, plausible distractors), and for sata/highlight verify every keyed option is unambiguously correct and every non-keyed clearly not. For calc items recompute the math from the stem and fail on any numeric error.

Respond ONLY with a raw JSON array, same order and length as input:
{"verdict":"pass"|"fail","confidence":0-1,"notes":"specific reason"}
Fail anything you are not certain about.

ITEMS:
${JSON.stringify(items)}`;

const casePrompt = (c) => `You are a hostile NCLEX case-study auditor re-verifying a LIVE six-step NCJMM case. Check every step: the keyed answer(s) must be the only defensible choice(s) given the chart data, cues must be unambiguous, math recomputed, current standards, safety. Respond ONLY with raw JSON:
{"steps":[{"step":1-6,"verdict":"pass"|"fail","notes":"..."}],"overall":"pass"|"fail","confidence":0-1}

CASE:
${JSON.stringify(c)}`;

async function sweepItems() {
  let q = db.from("questions")
    .select("id, cat, diff, type, stem, options, extra, answer, rationale, exam_form")
    .eq("approved", true).not("exam_form", "is", null).order("id");
  if (FORM) q = q.eq("exam_form", parseInt(FORM, 10));
  const { data: items, error } = await q;
  if (error) throw error;
  console.log(`Re-auditing ${items.length} live exam items (reviewer: ${REVIEW_MODEL})…`);
  let passed = 0, failed = 0, errored = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    let reviews;
    try {
      reviews = parseJson(await llm(itemPrompt(batch.map(({ id, exam_form, ...it }) => it))));
    } catch (e) { errored += batch.length; console.log(`  ! batch ${i / BATCH + 1}: ${e.message.slice(0, 80)}`); continue; }
    for (let j = 0; j < batch.length; j++) {
      const r = reviews[j] ?? { verdict: "fail", notes: "no verdict returned" };
      if (r.verdict === "pass" && (r.confidence ?? 0) >= PASS_CONFIDENCE) { passed++; continue; }
      failed++;
      await db.from("questions").update({
        approved: false,
        reviewer_notes: `RE-AUDIT ${new Date().toISOString().slice(0, 10)}: ${(r.notes ?? "").slice(0, 400)}`,
      }).eq("id", batch[j].id);
      console.log(`  ✗ quarantined #${batch[j].id} (form ${batch[j].exam_form}, ${batch[j].type}): ${(r.notes ?? "").slice(0, 90)}`);
    }
    if ((i / BATCH) % 10 === 9) console.log(`  … ${Math.min(i + BATCH, items.length)}/${items.length} audited · ${failed} quarantined`);
  }
  console.log(`ITEMS DONE: ${passed} pass · ${failed} quarantined · ${errored} skipped (review error — still live)`);
}

async function sweepCases() {
  let q = db.from("case_studies")
    .select("id, cat, title, blurb, intro, vitals, labs, note, steps, exam_form")
    .eq("approved", true).not("exam_form", "is", null).order("id");
  if (FORM) q = q.eq("exam_form", parseInt(FORM, 10));
  const { data: cases, error } = await q;
  if (error) throw error;
  console.log(`Re-auditing ${cases.length} live exam case studies…`);
  let passed = 0, failed = 0;
  for (const c of cases) {
    let r;
    try { r = parseJson(await llm(casePrompt({ ...c, id: undefined, exam_form: undefined }))); }
    catch (e) { console.log(`  ! case #${c.id}: ${e.message.slice(0, 80)}`); continue; }
    if (r.overall === "pass" && (r.confidence ?? 0) >= PASS_CONFIDENCE) { passed++; continue; }
    failed++;
    const notes = (r.steps ?? []).filter((s) => s.verdict === "fail").map((s) => `step${s.step}: ${s.notes}`).join(" | ");
    await db.from("case_studies").update({
      approved: false,
      reviewer_notes: `RE-AUDIT ${new Date().toISOString().slice(0, 10)}: ${notes.slice(0, 400)}`,
    }).eq("id", c.id);
    console.log(`  ✗ quarantined case #${c.id} (form ${c.exam_form}): ${notes.slice(0, 90)}`);
  }
  console.log(`CASES DONE: ${passed} pass · ${failed} quarantined`);
}

if (DO_CASES) await sweepCases();
else await sweepItems();
