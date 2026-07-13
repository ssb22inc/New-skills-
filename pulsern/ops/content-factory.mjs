#!/usr/bin/env node
/* PulseRN Content Factory
   ------------------------------------------------------------------
   The machine that closes the content gap. One run:

     1. AUDIT   — counts approved items per category in Supabase and
                  targets the thinnest categories automatically.
     2. GENERATE — a strong model writes a batch of NGN-style items.
     3. ADVERSARIAL REVIEW — a DIFFERENT model attacks each item:
                  verifies the key, hunts for a second defensible
                  answer, checks currency of practice, flags unsafe
                  content. Items must PASS to proceed.
     4. SCHEMA GATE — hard validation (same rules as the app).
     5. INSERT  — survivors land in Supabase with approved=false and
                  the AI reviewer's notes attached, queued for the
                  HUMAN nurse-educator gate in the review console.

   Nothing reaches a student without a licensed human flipping
   approved=true. This script feeds the queue; it never opens the gate.

   Usage:
     node content-factory.mjs --batch 10            # auto-target weak cats
     node content-factory.mjs --batch 10 --cat "Pharmacology"
     node content-factory.mjs --batch 10 --ngn      # NGN item types only
     node content-factory.mjs --dry-run             # no DB writes

   Env (server-side only — never ship these):
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
   ------------------------------------------------------------------ */

import { createClient } from "@supabase/supabase-js";

const CATS = [
  "Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance",
  "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology",
  "Reduction of Risk", "Physiological Adaptation",
];
const TYPES_STD = ["mc", "sata", "order", "calc"];
const TYPES_NGN = ["matrix", "bowtie", "cloze"];

const GEN_MODEL = "anthropic/claude-sonnet-4.6";   // strong writer
const REVIEW_MODEL = "openai/gpt-4.1";             // DIFFERENT vendor attacks it

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const BATCH = parseInt(opt("--batch", "10"), 10);
const FORCE_CAT = opt("--cat", null);
const DRY = flag("--dry-run");
const NGN_ONLY = flag("--ngn");

let _sb = null;
const db = () => (_sb ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

/* ---------- LLM call through OpenRouter ---------- */
async function llm(model, prompt, maxTokens = 6000) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error(`Empty response from ${model}`);
  return text;
}

const parseJson = (raw) => JSON.parse(raw.replace(/```json|```/gi, "").trim());

/* ---------- Schema gate (superset of the app's validQ) ---------- */
function validItem(x) {
  if (!x || typeof x.stem !== "string" || x.stem.length < 30) return "stem too short";
  if (typeof x.rationale !== "string" || x.rationale.length < 60) return "rationale too short";
  if (!CATS.includes(x.cat)) return "bad category";
  if (![1, 2, 3].includes(x.diff)) return "bad diff";
  const t = x.type;
  if (t === "mc") {
    if (!Array.isArray(x.options) || x.options.length < 4) return "mc needs 4+ options";
    if (!Number.isInteger(x.answer) || x.answer < 0 || x.answer >= x.options.length) return "mc answer out of range";
  } else if (t === "sata") {
    if (!Array.isArray(x.options) || x.options.length < 5) return "sata needs 5+ options";
    if (!Array.isArray(x.answer) || !x.answer.length ||
        !x.answer.every((n) => Number.isInteger(n) && n >= 0 && n < x.options.length)) return "sata answer invalid";
  } else if (t === "order") {
    if (!Array.isArray(x.options) || x.options.length < 4) return "order needs 4+ options";
    const n = x.options.length;
    if (!Array.isArray(x.answer) || [...x.answer].sort((a,b)=>a-b).join() !== [...Array(n).keys()].join()) return "order answer must be a permutation";
  } else if (t === "matrix") {
    // rows × columns grid, e.g. findings × (Effective|Ineffective|Unrelated)
    if (!Array.isArray(x.rows) || x.rows.length < 3) return "matrix needs 3+ rows";
    if (!Array.isArray(x.columns) || x.columns.length < 2) return "matrix needs 2+ columns";
    if (!Array.isArray(x.answer) || x.answer.length !== x.rows.length ||
        !x.answer.every((c) => Number.isInteger(c) && c >= 0 && c < x.columns.length)) return "matrix answer must map every row to a column";
  } else if (t === "bowtie") {
    // NGN bowtie: 2 actions + 1 condition + 2 parameters from candidate pools
    for (const k of ["actions", "conditions", "parameters"]) {
      if (!Array.isArray(x[k]) || x[k].length < 3) return `bowtie ${k} needs 3+ candidates`;
    }
    const a = x.answer;
    if (!a || !Array.isArray(a.actions) || a.actions.length !== 2 ||
        !Number.isInteger(a.condition) ||
        !Array.isArray(a.parameters) || a.parameters.length !== 2) return "bowtie answer shape invalid";
  } else if (t === "cloze") {
    // dropdown cloze: stem contains {0} {1} placeholders
    if (!Array.isArray(x.dropdowns) || !x.dropdowns.length) return "cloze needs dropdowns";
    if (!Array.isArray(x.answer) || x.answer.length !== x.dropdowns.length) return "cloze answer length mismatch";
    for (let i = 0; i < x.dropdowns.length; i++) {
      if (!x.stem.includes(`{${i}}`)) return `cloze stem missing {${i}}`;
      if (!Number.isInteger(x.answer[i]) || x.answer[i] < 0 || x.answer[i] >= x.dropdowns[i].length) return "cloze answer out of range";
    }
  } else if (t === "calc") {
    // dosage calculation: numeric-entry answer with a unit and worked steps
    if (typeof x.answer !== "number" || !Number.isFinite(x.answer)) return "calc answer must be a number";
    if (typeof x.unit !== "string" || !x.unit) return "calc needs a unit";
    if (x.tolerance !== undefined && (typeof x.tolerance !== "number" || x.tolerance < 0)) return "calc tolerance invalid";
    if (!Array.isArray(x.work) || x.work.length < 2 || !x.work.every((w) => typeof w === "string" && w.length)) return "calc needs work steps";
  } else if (t === "highlight") {
    // NGN highlight: tap the findings that answer the stem
    if (!Array.isArray(x.tokens) || x.tokens.length < 4) return "highlight needs 4+ tokens";
    if (!Array.isArray(x.answer) || !x.answer.length || x.answer.length >= x.tokens.length) return "highlight answer count invalid";
    if (new Set(x.answer).size !== x.answer.length ||
        !x.answer.every((n) => Number.isInteger(n) && n >= 0 && n < x.tokens.length)) return "highlight answer indices invalid";
  } else return "unknown type";
  // optional chart/exhibit payload, allowed on any type
  if (x.exhibit !== undefined) {
    if (!Array.isArray(x.exhibit) || !x.exhibit.length ||
        !x.exhibit.every((e) => e && typeof e.label === "string" && typeof e.content === "string")) return "exhibit shape invalid";
  }
  return null; // valid
}

/* ---------- Step 1: audit the bank, pick targets ---------- */
async function pickTargets() {
  if (FORCE_CAT) return [FORCE_CAT];
  if (DRY) return [CATS[2], CATS[0]];
  const counts = {};
  for (const c of CATS) {
    const { count } = await db().from("questions").select("id", { count: "exact", head: true })
      .eq("cat", c).eq("approved", true);
    counts[c] = count ?? 0;
  }
  const sorted = CATS.slice().sort((a, b) => counts[a] - counts[b]);
  console.log("Bank audit (approved):", counts);
  return sorted.slice(0, 2); // two thinnest categories
}

/* ---------- Step 2: generator prompt ---------- */
function genPrompt(cats, existingStems) {
  const types = NGN_ONLY ? TYPES_NGN : [...TYPES_STD, ...TYPES_NGN];
  return `You are an expert NCLEX-RN item writer following current NCSBN NGN test-plan standards. Write exactly ${BATCH} practice items for these client-needs categories: ${cats.join(" and ")}.

Item types to use (mix them): ${types.join(", ")}.
Type schemas — respond ONLY with a raw JSON array, no fences, no commentary:
- mc:    {"cat","diff":1|2|3,"type":"mc","stem","options":[4-5 strings],"answer":index,"rationale"}
- sata:  {"cat","diff","type":"sata","stem","options":[5-6 strings],"answer":[indices],"rationale"}
- order: {"cat","diff","type":"order","stem","options":[4-5 strings],"answer":[full permutation],"rationale"}
- matrix:{"cat","diff","type":"matrix","stem","rows":[3-5 findings/actions],"columns":[2-3 judgments e.g. "Indicated","Contraindicated"],"answer":[column index per row],"rationale"}
- bowtie:{"cat","diff","type":"bowtie","stem":clinical scenario,"actions":[5 candidates],"conditions":[4 candidates],"parameters":[5 candidates],"answer":{"actions":[2 indices],"condition":index,"parameters":[2 indices]},"rationale"}
- cloze: {"cat","diff","type":"cloze","stem":text containing {0} and {1} placeholders,"dropdowns":[[options for {0}],[options for {1}]],"answer":[index per dropdown],"rationale"}
- calc:  {"cat","diff","type":"calc","stem":dosage-calculation scenario phrased as practice (include "Record the whole number" or rounding instruction),"unit":"mL/hr"|"gtt/min"|"mg"|"mL"|"tablet(s)","answer":number,"tolerance":0,"work":["Formula: <name the formula>","= <substituted values>","= <result with unit>"],"rationale":why the answer makes clinical sense}
- highlight: {"cat","diff","type":"highlight","stem":instruction like "Highlight each finding that requires immediate follow-up","tokens":[6-8 short clinical findings],"answer":[indices of the correct tokens],"rationale"}
Any item may optionally include "exhibit":[{"label":"Laboratory results","content":"multi-line chart data"}] when the stem refers to chart/exhibit data.

Rules:
- Clinical-judgment stems grounded in current practice standards; plausible distractors; exactly one defensible key.
- Rationale must explain why the key is right AND why each distractor is wrong.
- No real-world dosing advice framed as treatment instructions; educational register only.
- Do NOT duplicate these existing topics: ${existingStems.join(" ~ ")}`;
}

/* ---------- Step 3: adversarial review prompt ---------- */
function reviewPrompt(items) {
  return `You are a hostile NCLEX item reviewer — a licensed nurse educator whose job is to REJECT flawed items. For each item below, attack it:

1. KEY CHECK — is the keyed answer truly and solely correct under current practice? Actively try to argue a distractor is also defensible.
2. CURRENCY — any outdated values, drugs, protocols, or guidelines?
3. SAFETY — anything a student could misread as real-world treatment advice?
4. QUALITY — grammatically clean, one construct per item, fair difficulty tag?

Respond ONLY with a raw JSON array, same order as input, one object per item:
{"verdict":"pass"|"fail","confidence":0-1,"notes":"specific findings — if fail, exactly why; if pass, what a human reviewer should double-check"}

Fail anything you are not certain about. A false pass harms nursing students; a false fail costs only tokens.

ITEMS:
${JSON.stringify(items)}`;
}

/* ---------- Pipeline ---------- */
async function run() {
  console.log(`Content factory · batch=${BATCH} · ${DRY ? "DRY RUN" : "live"} · ${NGN_ONLY ? "NGN types only" : "all types"}`);

  const targets = await pickTargets();
  console.log("Targeting:", targets.join(", "));

  let existingStems = [];
  if (!DRY) {
    const { data } = await db().from("questions").select("stem").in("cat", targets)
      .order("created_at", { ascending: false }).limit(30);
    existingStems = (data ?? []).map((r) => r.stem.slice(0, 60));
  }

  // GENERATE
  const rawGen = await llm(GEN_MODEL, genPrompt(targets, existingStems), 8000);
  let items;
  try { items = parseJson(rawGen); } catch { throw new Error("Generator returned unparseable JSON"); }
  if (!Array.isArray(items)) throw new Error("Generator did not return an array");
  console.log(`Generated: ${items.length}`);

  // SCHEMA GATE (pre-review — don't pay to review garbage)
  const schemaOk = [];
  for (const it of items) {
    const err = validItem(it);
    if (err) console.log(`  ✗ schema reject: ${err} — "${(it?.stem ?? "").slice(0, 50)}…"`);
    else schemaOk.push(it);
  }
  console.log(`Schema pass: ${schemaOk.length}/${items.length}`);
  if (!schemaOk.length) return;

  // ADVERSARIAL REVIEW by a different vendor
  const rawRev = await llm(REVIEW_MODEL, reviewPrompt(schemaOk), 6000);
  let reviews;
  try { reviews = parseJson(rawRev); } catch { throw new Error("Reviewer returned unparseable JSON"); }

  const survivors = [];
  schemaOk.forEach((it, i) => {
    const r = reviews[i] ?? { verdict: "fail", notes: "no review returned" };
    if (r.verdict === "pass" && (r.confidence ?? 0) >= 0.7) {
      survivors.push({ item: it, reviewNotes: r.notes });
      console.log(`  ✓ pass (${r.confidence}): "${it.stem.slice(0, 55)}…"`);
    } else {
      console.log(`  ✗ REVIEW FAIL: ${r.notes?.slice(0, 90)}`);
    }
  });
  console.log(`Adversarial pass: ${survivors.length}/${schemaOk.length}`);

  // INSERT — approved stays FALSE. Humans open the gate, never this script.
  if (DRY) { console.log("Dry run — nothing written. Survivors:", JSON.stringify(survivors, null, 2).slice(0, 800)); return; }

  const rows = survivors.map(({ item, reviewNotes }) => ({
    cat: item.cat, diff: item.diff, type: item.type,
    stem: item.stem,
    options: item.options ?? null,
    extra: {  // NGN/calc payloads live here; null for mc/sata/order
      rows: item.rows ?? null, columns: item.columns ?? null,
      actions: item.actions ?? null, conditions: item.conditions ?? null,
      parameters: item.parameters ?? null, dropdowns: item.dropdowns ?? null,
      unit: item.unit ?? null, tolerance: item.tolerance ?? null,
      tokens: item.tokens ?? null, exhibit: item.exhibit ?? null,
      work: item.work ?? null,
    },
    answer: item.answer,
    rationale: item.rationale,
    ai: true, approved: false,
    gen_model: GEN_MODEL, review_model: REVIEW_MODEL,
    reviewer_notes: reviewNotes,
  }));
  const { error } = await db().from("questions").insert(rows);
  if (error) throw error;
  console.log(`Inserted ${rows.length} items → review queue (approved=false). Open the review console to approve.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => { console.error("FACTORY FAILED:", e.message); process.exit(1); });
}

export { validItem }; // exported for tests
