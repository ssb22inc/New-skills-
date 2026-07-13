#!/usr/bin/env node
/* Inserts the three hand-written NGN sample items into Supabase for manual
   testing (PULSERN_PROMPTS Prompt 6: approved=true, ai=false — hand-written,
   not factory output; H7 formal RN review still applies before launch).
   Idempotent: skips stems that already exist.

   Env (server-side only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   Usage: node ops/insert-ngn-samples.mjs [--dry-run]
*/
import { createClient } from "@supabase/supabase-js";
import { NGN_SAMPLES, CALC_SAMPLES } from "../src/ngn-samples.js";

const DRY = process.argv.includes("--dry-run");

const rows = [...NGN_SAMPLES, ...CALC_SAMPLES].map((s) => ({
  cat: s.cat, diff: s.diff, type: s.type,
  stem: s.stem, options: null, extra: s.extra,
  answer: s.answer, rationale: s.rationale,
  ai: false, approved: true,
}));

if (DRY) {
  console.log(`Dry run — would insert ${rows.length} NGN items:`);
  for (const r of rows) console.log(`  [${r.type}] ${r.stem.slice(0, 70)}…`);
  process.exit(0);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let inserted = 0;
for (const r of rows) {
  const { data: existing, error: selErr } = await db.from("questions")
    .select("id").eq("stem", r.stem).limit(1);
  if (selErr) { console.error("Lookup failed:", selErr.message); process.exit(1); }
  if (existing?.length) { console.log(`  skip (exists): [${r.type}]`); continue; }
  const { error } = await db.from("questions").insert(r);
  if (error) { console.error("Insert failed:", error.message); process.exit(1); }
  inserted++;
  console.log(`  ✓ inserted [${r.type}] ${r.stem.slice(0, 60)}…`);
}
console.log(`Done — ${inserted} inserted, ${rows.length - inserted} already present.`);
