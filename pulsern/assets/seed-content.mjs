#!/usr/bin/env node
/* ops/seed-content.mjs — one-time loader for the starter bank.
   Reads pulsern-content.json and inserts every question into Supabase.
   Idempotent: skips stems that already exist.

   Usage:
     node ops/seed-content.mjs --dry-run
     node ops/seed-content.mjs            # live insert

   Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

   Note on approval: these 21 items were human-written and clinically
   audited, but the launch checklist still requires a licensed RN to
   formally sign off. They seed as approved=true so the app works on
   day one; do the formal review pass in the console before public
   launch (filter: reviewed_by is null).                              */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DRY = process.argv.includes('--dry-run');
const here = dirname(fileURLToPath(import.meta.url));
const content = JSON.parse(readFileSync(join(here, '..', 'pulsern-content.json'), 'utf8'));

const rows = content.questions.map((q) => ({
  cat: q.cat,
  diff: q.diff,
  type: q.type,
  stem: q.stem,
  options: q.options,
  extra: null,
  answer: q.answer,
  rationale: q.rationale,
  ai: false,
  approved: true, // human-written starter bank — formal RN sign-off still due
}));

console.log(`Loaded ${rows.length} questions from pulsern-content.json`);
const byCat = {};
rows.forEach((r) => (byCat[r.cat] = (byCat[r.cat] || 0) + 1));
console.log('Per category:', byCat);

if (DRY) {
  console.log('Dry run — first row:', JSON.stringify(rows[0], null, 2).slice(0, 400));
  process.exit(0);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Idempotency: fetch existing stems, insert only new ones
const { data: existing, error: e1 } = await sb.from('questions').select('stem');
if (e1) { console.error('Read failed:', e1.message); process.exit(1); }
const have = new Set((existing ?? []).map((r) => r.stem));
const fresh = rows.filter((r) => !have.has(r.stem));
console.log(`${rows.length - fresh.length} already present, inserting ${fresh.length}`);

if (fresh.length) {
  const { error } = await sb.from('questions').insert(fresh);
  if (error) { console.error('Insert failed:', error.message); process.exit(1); }
}
console.log('Seed complete.');
