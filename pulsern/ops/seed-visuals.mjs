#!/usr/bin/env node
/* Seed the first visual-exhibit questions (RN pack prompt 8). Each item is
   sent through the hostile reviewer together with the exhibit's audit
   description — the reviewer verifies the key AND that the visual matches
   the stem without giving the answer away. Publishes only on pass ≥0.85
   (owner amendment: adversarial review is the accuracy gate; the console
   retains rejection authority). Idempotent: dedupes by stem.
   Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY */
import { createClient } from "@supabase/supabase-js";

const DESCRIBE = {
  "ecg-hyperk": "ECG strip: tall, narrow, peaked T waves with flattened P waves — classic hyperkalemia pattern",
  "ecg-afib": "ECG strip: irregularly irregular rhythm, no discernible P waves, fibrillatory baseline — atrial fibrillation",
  "chest-tube": "Diagram: 3-chamber chest drainage — chamber 1 collection, chamber 2 water seal at 2 cm (one-way valve), chamber 3 suction control at -20 cm H2O",
  "ppe-donning": "Diagram: PPE donning order 1 gown, 2 mask/respirator, 3 goggles/face shield, 4 gloves",
  "fetal-late": "Fetal monitor strip: uniform FHR decelerations whose nadir occurs AFTER each contraction peak — late decelerations",
  "med-label-heparin": "Medication label graphic reading: Heparin, 5,000 units/mL, total volume 10 mL",
};

const ITEMS = [
  {
    cat: "Physiological Adaptation", diff: 2, type: "mc",
    stem: "A nurse reviews this telemetry strip for a client with chronic kidney disease who missed two dialysis sessions. Which laboratory result is most consistent with the strip?",
    options: ["Potassium 7.2 mEq/L", "Potassium 2.8 mEq/L", "Calcium 10.1 mg/dL", "Sodium 138 mEq/L"],
    answer: 0,
    rationale: "Tall, narrow, peaked T waves with flattening P waves are the classic electrocardiographic signature of hyperkalemia, expected in a dialysis-dependent client who has missed treatments. Hypokalemia produces flattened T waves and U waves; the calcium and sodium values shown are normal and would not produce this pattern.",
    visual: "ecg-hyperk",
  },
  {
    cat: "Physiological Adaptation", diff: 2, type: "mc",
    stem: "A nurse admits an older adult reporting palpitations and reviews this telemetry strip. How should the nurse document the rhythm?",
    options: ["Atrial fibrillation", "Normal sinus rhythm with premature atrial contractions", "Second-degree heart block, type I", "Sinus tachycardia"],
    answer: 0,
    rationale: "The strip shows an irregularly irregular ventricular response with no discernible P waves and a fibrillatory baseline — atrial fibrillation. PACs occur on a background of regular rhythm with visible P waves; type I block shows progressive PR lengthening with grouped beating; sinus tachycardia is regular with uniform P waves.",
    visual: "ecg-afib",
  },
  {
    cat: "Reduction of Risk", diff: 2, type: "mc",
    stem: "A client with a chest tube has the drainage system shown. The nurse notes continuous vigorous bubbling in chamber 2. What does this finding indicate?",
    options: ["An air leak in the system or at the insertion site", "Normal function of the suction control chamber", "Re-expansion of the affected lung", "The drainage tubing is kinked"],
    answer: 0,
    rationale: "Chamber 2 is the water seal: intermittent gentle bubbling with exhalation can be expected while air leaves the pleural space, but continuous vigorous bubbling means air is entering the system — a leak in tubing connections or at the insertion site that must be located. Continuous gentle bubbling is normal only in the suction control chamber (chamber 3). A kinked tube stops fluctuation; it does not cause bubbling.",
    visual: "chest-tube",
  },
  {
    cat: "Safety & Infection Control", diff: 2, type: "mc",
    stem: "The diagram shows the standard sequence for donning personal protective equipment. A nurse is assigned to a client with active pulmonary tuberculosis. Which modification applies at step 2?",
    options: ["A fit-tested N95 respirator replaces the surgical mask", "Step 2 is omitted because gloves provide adequate protection", "A face shield alone may replace the mask", "The mask is applied only if the client is coughing"],
    answer: 0,
    rationale: "Tuberculosis requires airborne precautions: at the mask step the nurse dons a fit-tested N95 (or higher) respirator rather than a surgical mask. Respiratory protection is never optional for airborne organisms, a face shield does not filter inspired air, and symptoms do not determine precaution level — the diagnosis does.",
    visual: "ppe-donning",
  },
  {
    cat: "Health Promotion & Maintenance", diff: 3, type: "mc",
    stem: "A nurse is monitoring a laboring client and observes the pattern on this fetal monitor strip. How should the nurse interpret the tracing?",
    options: ["Late decelerations", "Early decelerations", "Variable decelerations", "Normal accelerations"],
    answer: 0,
    rationale: "The decelerations are uniform and their lowest point occurs after each contraction peak — late decelerations, reflecting uteroplacental insufficiency. Early decelerations mirror contractions (nadir at the peak) from head compression; variables are abrupt and V-shaped from cord compression; accelerations rise above baseline.",
    visual: "fetal-late",
  },
  {
    cat: "Pharmacology", diff: 2, type: "calc",
    stem: "Using the medication label shown, how many mL should the nurse draw up for a prescribed dose of heparin 3,500 units subcutaneously? Record to one decimal place.",
    unit: "mL", answer: 0.7, tolerance: 0,
    rationale: "Desired over have: 3,500 units ÷ 5,000 units/mL = 0.7 mL. Always verify high-alert heparin doses with a second nurse per policy.",
    work: ["Formula: volume = desired dose ÷ concentration", "= 3,500 units ÷ 5,000 units/mL", "= 0.7 mL"],
    visual: { kind: "med-label", drug: "Heparin", conc: "5,000 units / mL", volume: "10 mL" },
  },
];

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function llm(prompt) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model: "openai/gpt-4.1", max_tokens: 3000, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await r.json();
  const t = d?.choices?.[0]?.message?.content ?? "";
  if (!t) throw new Error(d?.error?.message ?? "empty");
  return t.replace(/```json|```/gi, "").trim();
}

for (const it of ITEMS) {
  const { data: dup } = await db.from("questions").select("id").eq("stem", it.stem).limit(1);
  if (dup?.length) { console.log("skip (exists):", it.stem.slice(0, 50)); continue; }
  const visKey = typeof it.visual === "string" ? it.visual : "med-label-heparin";
  const review = JSON.parse(await llm(`You are a hostile NCLEX reviewer auditing an item WITH a visual exhibit. The exhibit is described textually below. Verify: (1) the keyed answer is the only defensible one, (2) the visual matches the stem's clinical claims exactly, (3) the visual supports interpretation without directly printing the answer, (4) recompute any math. Respond ONLY with raw JSON: {"verdict":"pass"|"fail","confidence":0-1,"notes":"why"}

EXHIBIT: ${DESCRIBE[visKey]}
ITEM: ${JSON.stringify(it)}`));
  if (review.verdict !== "pass" || (review.confidence ?? 0) < 0.85) {
    console.log(`✗ REJECTED: ${it.stem.slice(0, 50)} — ${review.notes?.slice(0, 120)}`);
    continue;
  }
  const { error } = await db.from("questions").insert({
    cat: it.cat, diff: it.diff, type: it.type, stem: it.stem,
    options: it.options ?? null,
    extra: { visual: it.visual, unit: it.unit ?? null, tolerance: it.tolerance ?? null, work: it.work ?? null },
    answer: it.answer, rationale: it.rationale,
    ai: true, approved: true, reviewed_at: new Date().toISOString(),
    gen_model: "seed-visuals", review_model: "openai/gpt-4.1", reviewer_notes: review.notes ?? null,
  });
  console.log(error ? `insert error: ${error.message}` : `✓ published: ${it.stem.slice(0, 55)}`);
}
console.log("SEED VISUALS DONE");