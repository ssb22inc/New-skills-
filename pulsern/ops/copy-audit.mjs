#!/usr/bin/env node
/* Adversarial copy audit — the owner's rule applied to the site's own
   words: a hostile reviewer reads every user-facing string and flags
   overclaims (equating with the real exam, promising outcomes, missing
   "estimate" hedges), trademark problems, and inaccurate statements.
   Read-only: prints findings for the owner; fixes ship as code changes.

   Usage: node ops/copy-audit.mjs
   Env: OPENROUTER_API_KEY
   ------------------------------------------------------------------ */
import { readFileSync } from "node:fs";

const REVIEW_MODEL = "openai/gpt-4.1";
const FILES = [
  "src/App.jsx", "src/exam.jsx", "src/billing.jsx", "src/auth.jsx",
  "src/profile.jsx", "src/pricing.js", "public/legal/index.html",
  "src/auth-messages.js",
];

/* Files where a student is mid-signup and one bad sentence loses them. These
   get a second, different reviewer: claims hygiene asks "is this honest",
   friction asks "does this make someone give up". A message can pass the first
   and fail the second, which is exactly what happened when a successful signup
   was reported in red as "you can only request this after 48 seconds" and a
   real prospect stopped there. */
const FRICTION_FILES = ["src/auth.jsx", "src/auth-messages.js", "src/billing.jsx"];

/* crude but effective: pull quoted JSX text + string literals long enough
   to be sentences; the reviewer sees context-free strings, which is the
   harshest possible reading */
function extractStrings(path) {
  const src = readFileSync(path, "utf8");
  const out = new Set();
  for (const m of src.matchAll(/>([^<>{}]{40,400})</g)) out.add(m[1].trim());
  for (const m of src.matchAll(/"([A-Z][^"\n]{39,400})"/g)) out.add(m[1].trim());
  return [...out].filter((s) => /[a-z] [a-z]/.test(s));
}

async function llm(prompt) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model: REVIEW_MODEL, max_tokens: 4000, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await r.json();
  const t = d?.choices?.[0]?.message?.content ?? "";
  if (!t) throw new Error(d?.error?.message ?? "empty");
  return t.replace(/```json|```/gi, "").trim();
}

let flagged = 0, checked = 0;
for (const f of FILES) {
  const strings = extractStrings(f);
  checked += strings.length;
  for (let i = 0; i < strings.length; i += 25) {
    const batch = strings.slice(i, i + 25);
    const reviews = JSON.parse(await llm(`You are a hostile compliance reviewer for an NCLEX-prep app. For each user-facing string, flag ONLY real problems:
- equating with the official exam ("same as", "identical", implying official NCSBN scoring) — comparison words like "like"/"style"/"modeled on" are FINE
- promising outcomes ("you will pass", guarantees)
- readiness/score claims missing an estimate hedge nearby is only a problem if the string itself asserts certainty
- factually wrong statements about the NCLEX
- NCSBN trademark misuse (claiming affiliation/endorsement)
Do NOT flag tone, marketing energy, ownership/legal notices, or UI labels. Respond ONLY with a raw JSON array, same order: {"flag":true|false,"why":"..."}
STRINGS:\n${JSON.stringify(batch)}`));
    batch.forEach((s, j) => {
      const r = reviews[j];
      if (r?.flag) { flagged++; console.log(`✗ ${f}: "${s.slice(0, 90)}" — ${r.why}`); }
    });
  }
}

/* ---------- friction pass ---------- */
let frictionFlagged = 0, frictionChecked = 0;
for (const f of FRICTION_FILES) {
  const strings = extractStrings(f);
  frictionChecked += strings.length;
  for (let i = 0; i < strings.length; i += 25) {
    const batch = strings.slice(i, i + 25);
    const reviews = JSON.parse(await llm(`You are reviewing the sign-up and sign-in messages of a study app, on behalf of a nursing student who is deciding in about five seconds whether to keep going or close the tab. Flag ONLY strings that would make a real person give up or feel blocked:
- reports something that actually SUCCEEDED as if it had failed or been refused
- states a problem without telling the student what to do next
- uses system or security wording ("for security purposes", "invalid request", error codes) where plain language would do
- blames the student for something that is not their fault
- leaves someone stuck with no alternative route in, when one exists (a sign-in link, a reset)
Do NOT flag: legally required disclaimers, deliberate brevity on buttons, or anything that is simply short.
Respond ONLY with a raw JSON array, same order: {"flag":true|false,"why":"...","better":"suggested replacement or null"}
STRINGS:\n${JSON.stringify(batch)}`));
    batch.forEach((s, j) => {
      const r = reviews[j];
      if (r?.flag) {
        frictionFlagged++;
        console.log(`✗ FRICTION ${f}: "${s.slice(0, 90)}" — ${r.why}`);
        if (r.better) console.log(`    better: ${r.better}`);
      }
    });
  }
}

console.log(`\nCOPY AUDIT DONE: ${checked} strings checked · ${flagged} flagged`);
console.log(`FRICTION AUDIT DONE: ${frictionChecked} strings checked · ${frictionFlagged} flagged`);

/* A flagged signup message is a leak in the one funnel step everything else
   depends on, so it fails the run rather than printing into a log nobody
   reads. Compliance findings stay advisory, as they were. */
if (frictionFlagged > 0) {
  console.error(`\n${frictionFlagged} sign-up message(s) would cost a student. Fix them before the next release.`);
  process.exit(1);
}
