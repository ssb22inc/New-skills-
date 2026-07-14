#!/usr/bin/env node
/* PulseRN Flashcard Factory
   ------------------------------------------------------------------
   Generates high-yield NCLEX flashcards at scale:
     1. AUDIT   — counts approved cards per category, targets the thinnest.
     2. GENERATE — a strong model writes a batch of front/back cards.
     3. ADVERSARIAL REVIEW — a DIFFERENT vendor attacks each card
        (factual accuracy, currency, single-fact clarity).
     4. SCHEMA GATE — hard validation.
     5. AUTO-PUBLISH — cards passing review at >= 0.85 confidence are
        inserted approved=true (owner amendment: the licensed-RN owner
        designated cross-vendor adversarial review as the quality gate
        for scaled card content; the console retains rejection power).
        Cards failing review are dropped and logged, never inserted.

   Usage:
     node ops/card-factory.mjs --batch 50            # auto-target thin cats
     node ops/card-factory.mjs --batch 50 --cat "Pharmacology"
     node ops/card-factory.mjs --dry-run

   Env (server-side only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
   ------------------------------------------------------------------ */

import { createClient } from "@supabase/supabase-js";

const CATS = [
  "Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance",
  "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology",
  "Reduction of Risk", "Physiological Adaptation",
];

const GEN_MODEL = "anthropic/claude-sonnet-4.6";
const REVIEW_MODEL = "openai/gpt-4.1";
const PASS_CONFIDENCE = 0.85;

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const BATCH = parseInt(opt("--batch", "40"), 10);
const FORCE_CAT = opt("--cat", null);
const FORCE_TOPIC = opt("--topic", null);
const DRY = flag("--dry-run");

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
  if (!text) throw new Error(`Empty response from ${model}`);
  return text;
}
const parseJson = (raw) => JSON.parse(raw.replace(/```json|```/gi, "").trim());

/* ---------- schema gate (exported for tests) ---------- */
export function validCard(x) {
  if (!x || typeof x !== "object") return "not an object";
  if (!CATS.includes(x.cat)) return "bad category";
  if (typeof x.topic !== "string" || x.topic.length < 3 || x.topic.length > 60) return "bad topic";
  if (typeof x.front !== "string" || x.front.length < 8 || x.front.length > 220) return "bad front";
  if (typeof x.back !== "string" || x.back.length < 1 || x.back.length > 420) return "bad back";
  return null;
}

async function pickTargets() {
  if (FORCE_CAT) return [FORCE_CAT];
  if (DRY) return [CATS[5], CATS[4]];
  const counts = {};
  for (const c of CATS) {
    const { count } = await db().from("flashcards").select("id", { count: "exact", head: true })
      .eq("cat", c).eq("approved", true);
    counts[c] = count ?? 0;
  }
  console.log("Card bank audit (approved):", counts);
  return CATS.slice().sort((a, b) => counts[a] - counts[b]).slice(0, 2);
}

function genPrompt(cats, existingFronts) {
  return `You are an expert NCLEX-RN educator writing high-yield flashcards. Write exactly ${BATCH} flashcards for these client-needs categories: ${cats.join(" and ")} (split roughly evenly).

Respond ONLY with a raw JSON array, no fences, no commentary:
[{"cat":"<one of: ${cats.join(" | ")}>","topic":"<short topic label, e.g. Electrolytes, Insulin types, Delegation rules>","front":"<recall prompt or question, under 200 chars>","back":"<the precise answer, under 380 chars — exact values, ranges, and units where applicable>"}]

Rules:
- One testable fact per card. Front must be answerable without seeing the back.
${FORCE_TOPIC
  ? `- EVERY card's topic must be "${FORCE_TOPIC}" and its content strictly about that topic — formulas by name, unit conversions with exact factors, rounding rules, and short worked one-step examples that fit on a card.`
  : "- Cover a SPREAD of topics within each category — labs, meds, priorities, positioning, precautions, developmental norms, therapeutic communication principles, as fits the category."}
- Current practice standards only. Educational exam-prep register — never real-world dosing or treatment instructions.
- Plain text only, no markdown.
- Do NOT duplicate these existing card fronts: ${existingFronts.slice(0, 120).join(" ~ ") || "(none yet)"}`;
}

function reviewPrompt(cards) {
  return `You are a hostile NCLEX flashcard reviewer — a licensed nurse educator whose job is to REJECT flawed cards. For each card below, attack it:
1. ACCURACY — is the back factually correct and complete enough to be safe as a study fact? Values and units exact per current NCLEX-review standards?
2. CURRENCY — any outdated values, drugs, or protocols?
3. CLARITY — does the front unambiguously cue exactly the fact on the back? One fact only?
4. SAFETY — could a student misread it as real-world treatment instruction?

Respond ONLY with a raw JSON array, same order as input, one object per card:
{"verdict":"pass"|"fail","confidence":0-1,"notes":"if fail, exactly why"}

Fail anything you are not certain about. A false pass harms nursing students; a false fail costs only tokens.

CARDS:
${JSON.stringify(cards)}`;
}

async function run() {
  console.log(`Card factory · batch=${BATCH} · ${DRY ? "DRY RUN" : "live, auto-publish at ≥" + PASS_CONFIDENCE}`);
  const targets = await pickTargets();
  console.log("Targeting:", targets.join(", "));

  let existingFronts = [];
  if (!DRY) {
    const { data } = await db().from("flashcards").select("front").in("cat", targets)
      .order("created_at", { ascending: false }).limit(200);
    existingFronts = (data ?? []).map((r) => r.front.slice(0, 60));
  }

  const rawGen = await llm(GEN_MODEL, genPrompt(targets, existingFronts), 12000);
  let cards;
  try { cards = parseJson(rawGen); } catch { throw new Error("Generator returned unparseable JSON"); }
  if (!Array.isArray(cards)) throw new Error("Generator did not return an array");
  console.log(`Generated: ${cards.length}`);

  const schemaOk = [];
  for (const c of cards) {
    const err = validCard(c);
    if (err) console.log(`  ✗ schema reject: ${err} — "${String(c?.front ?? "").slice(0, 50)}"`);
    else schemaOk.push(c);
  }
  console.log(`Schema pass: ${schemaOk.length}/${cards.length}`);
  if (!schemaOk.length) return;

  const rawRev = await llm(REVIEW_MODEL, reviewPrompt(schemaOk), 8000);
  let reviews;
  try { reviews = parseJson(rawRev); } catch { throw new Error("Reviewer returned unparseable JSON"); }

  const survivors = [];
  schemaOk.forEach((c, i) => {
    const r = reviews[i] ?? { verdict: "fail", notes: "no review returned" };
    if (r.verdict === "pass" && (r.confidence ?? 0) >= PASS_CONFIDENCE) {
      survivors.push({ card: c, notes: r.notes ?? null });
    } else {
      console.log(`  ✗ REVIEW FAIL: ${(r.notes ?? "").slice(0, 80)} — "${c.front.slice(0, 50)}"`);
    }
  });
  console.log(`Adversarial pass: ${survivors.length}/${schemaOk.length}`);

  if (DRY) { console.log("Dry run — nothing written."); return; }

  const rows = survivors.map(({ card, notes }) => ({
    cat: card.cat, topic: card.topic, front: card.front, back: card.back,
    ai: true, approved: true, // owner-amended gate: adversarial review passed
    gen_model: GEN_MODEL, review_model: REVIEW_MODEL, reviewer_notes: notes,
  }));
  let inserted = 0;
  for (const row of rows) { // row-by-row so one duplicate front doesn't sink the batch
    const { error } = await db().from("flashcards").insert(row);
    if (error) console.log(`  ~ skip (${error.code === "23505" ? "duplicate front" : error.message.slice(0, 40)}): "${row.front.slice(0, 40)}"`);
    else inserted++;
  }
  console.log(`Published ${inserted} cards.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => { console.error("CARD FACTORY FAILED:", e.message); process.exit(1); });
}
