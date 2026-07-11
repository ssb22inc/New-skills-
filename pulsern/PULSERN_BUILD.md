# PulseRN — Engineering Specification

Build target: production web app on Vercel + Supabase, content pipeline live, Expo port staged

Everything Claude Code needs is in this file plus assets/. Execute via PULSERN_PROMPTS.md. Rules in CLAUDE.md override anything ambiguous here. Account creation and secrets are human tasks — see HUMAN_TASKS.md; the build assumes env vars exist.

## 1 · Architecture

┌─ Student (web / later iOS+Android) ──────────────────────────┐
│  src/App.jsx — Today · Practice · Case · Cards · Stats       │
│  ability-engine.js (Elo/Rasch, client-side, deterministic)   │
│  adapters: store → Supabase · askModel → /api/ai             │
└──────────────┬───────────────────────────┬───────────────────┘
               │                           │
        Supabase (Postgres+Auth+RLS)   Vercel /api
        · progress (per-user blob)     · /api/ai        (LLM proxy)
        · questions (shared bank)      · /api/telemetry (item stats)
        · tutor_cache                  · /api/plan      (weekly planner)
        · reviewers                        │
               ▲                           ▼
┌─ Ops ────────┴───────────────┐   OpenRouter → Claude/GPT/DeepSeek/Qwen/Kimi
│ ops/content-factory.mjs      │
│  (GitHub Actions cron 2×/day)│
│ public/review/ RN console ───┼── the ONLY path to approved=true
└──────────────────────────────┘

Two adapters isolate all platform code (store, askModel) — preserved exactly as designed so the Expo port later touches nothing else.

## 2 · Environment variables

| Var | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel (client-exposed) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel (client-exposed) | public anon key — safe to ship |
| `SUPABASE_URL` | Vercel + GH Actions | same URL, server contexts |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + GH Actions | SECRET — server only |
| `OPENROUTER_API_KEY` | Vercel + GH Actions | SECRET — server only |

## 3 · Database — `supabase/migrations/001_init.sql`

Write this file exactly; run it via Supabase SQL editor or CLI.

-- ============ per-user progress: one JSON blob, synced ============
create table if not exists progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  blob       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table progress enable row level security;
create policy "progress_select" on progress for select using (auth.uid() = user_id);
create policy "progress_insert" on progress for insert with check (auth.uid() = user_id);
create policy "progress_update" on progress for update using (auth.uid() = user_id);
create policy "progress_delete" on progress for delete using (auth.uid() = user_id);
 
-- ============ shared question bank ============
create table if not exists questions (
  id                bigint generated always as identity primary key,
  cat               text not null,
  diff              int  not null check (diff in (1,2,3)),
  type              text not null check (type in ('mc','sata','order','matrix','bowtie','cloze')),
  stem              text not null,
  options           jsonb,            -- mc/sata/order; null for NGN types
  extra             jsonb,            -- NGN payloads: rows/columns/actions/conditions/parameters/dropdowns
  answer            jsonb not null,
  rationale         text not null,
  ai                boolean not null default false,
  approved          boolean not null default false,
  gen_model         text,
  review_model      text,
  reviewer_notes    text,             -- AI adversarial reviewer output
  human_review_note text,
  reviewed_by       uuid references auth.users(id),
  last_reviewed_at  timestamptz,
  rejected_at       timestamptz,
  times_answered    int not null default 0,
  times_correct     int not null default 0,
  elo_rating        numeric,
  created_at        timestamptz not null default now()
);
alter table questions enable row level security;
create policy "questions_read_approved" on questions
  for select using (approved = true and rejected_at is null);
create index if not exists questions_cat_idx on questions (cat);
create index if not exists questions_pending_idx on questions (approved, rejected_at);
 
-- ============ reviewer role (licensed RNs only) ============
create table if not exists reviewers (
  user_id    uuid primary key references auth.users(id),
  full_name  text not null,
  license_no text,                    -- audit only; never displayed client-side
  added_at   timestamptz not null default now()
);
alter table reviewers enable row level security;
create policy "reviewers_self" on reviewers for select using (auth.uid() = user_id);
 

create policy "questions_reviewer_read" on questions
  for select using (exists (select 1 from reviewers r where r.user_id = auth.uid()));
create policy "questions_reviewer_update" on questions
  for update using (exists (select 1 from reviewers r where r.user_id = auth.uid()));
 
-- ============ tutor cache: pay once per explanation, ever ============
create table if not exists tutor_cache (
  item_id     bigint not null references questions(id) on delete cascade,
  was_correct boolean not null,
  text        text not null,
  created_at  timestamptz not null default now(),
  primary key (item_id, was_correct)
);
alter table tutor_cache enable row level security;
create policy "tutor_cache_read" on tutor_cache
  for select using (auth.role() = 'authenticated');
-- writes happen only via /api routes using the service role (bypasses RLS)

Seeding: node ops/seed-content.mjs loads the 21 starter questions (idempotent by stem).

## 4 · Persisted state contract (frozen)

One blob per user under key pulsern-v1:

{
  "theme": "light" | "dim",
  "xp": 0, "bestRun": 0,
  "log": [ { "id", "cat", "diff", "correct" } ],
  "flagged": [ ids ],
  "streak": { "count", "lastDay": "YYYY-MM-DD", "shield": true },
  "daily": { "day": "YYYY-MM-DD", "answered": 0 },
  "srs": [ { "interval", "due": "YYYY-MM-DD" } ],
  "customQs": [],
  "provider": "claude",
  "ability": { "<cat>": { "theta": 1200, "n": 0 } },   // NEW — Gate 1
  "plan": { "week": "YYYY-MM-DD", "days": [...] }      // NEW — planner cache
}

Legacy saves lack ability/plan: initialize with emptyAbility(CATS) / null. All dates LOCAL.

## 5 · App integration work (src/App.jsx)

Start from assets/App.portable.jsx (v5.1 — already carries local-date, SRS-merge, shield, and render-phase fixes). Changes:

5.1 Cloud adapters. Replace store with the Supabase version (get: maybeSingle, return JSON.stringify(data.blob); set: blob: JSON.parse(v), updated_at; all three methods no-op when signed out). Replace askModel body with the /api/ai fetch. Both exact patterns are in the app's own adapter comments and assets/api/ai.js.

5.2 Auth screen (`src/auth.jsx`). Email/password sign-up + sign-in + Google OAuth via supabase-js. Gate the app: no session → auth screen. Include sign-out in Stats. On auth state change, reload the saved blob.

5.3 Ability engine (Gate 1). Import from ./ability-engine:

- state: const [ability, setAbility] = useState(() => emptyAbility(CATS)); load/save via the blob.

- in record(q, correct): const { ability: next, itemDelta } = updateAbility(ability, q, correct, calibration); setAbility(next); then fire-and-forget POST /api/telemetry { itemId: q.id, correct, itemDelta } (skip for case-study pseudo-ids < 1000 that aren't in the bank — telemetry validates anyway).

- replace the readiness useMemo with readinessFrom(ability, log); render as a range: Readiness 62–78% (estimate), keep the three-tier label mapping on the midpoint, keep the <12-answers refusal text.

- calibration: on load, select id, elo_rating from questions where approved → { [id]: { rating } } state passed to itemRating/pickFrom.

- pickFrom: after the interleave filter, sort pool by Math.abs(itemRating(x, calibration) - pickTargetRating(ability, x.cat)) ascending and pick randomly from the top 3 (replaces the diff-ladder sort; keep diffTarget state removed or repurposed for display only).

5.4 NGN renderers (Gate 2). Three new types in QBank, payloads from q.extra:

- matrix: table, one radio per row; submit enabled when every row selected; correct = every row matches answer[rowIndex]. Feedback shows ✓/✗ per row.

- bowtie: three candidate columns (Actions ×2, Condition ×1, Parameters ×2). Tap toggles selection with per-column caps. Correct = set-equal per slot. Feedback highlights the correct picks.

- cloze: split stem on {n}, render <select> per dropdown. Correct = every index matches. Feedback shows correct choices inline.

Scoring all-or-nothing; XP 10 * diff as elsewhere. validQ and the bank merge must accept the new shapes (mirror validItem in the factory).

5.5 Bank loading. On app load (signed in), fetch approved questions from Supabase and merge with customQs as allQuestions. Keep the built-in local array as offline fallback when the fetch fails.

5.6 Tutor caching. TutorExplain first GETs tutor_cache via supabase-js (maybeSingle on (q.id, wasCorrect) — only for bank items, id ≥ 1); hit → render; miss → call /api/ai, then POST /api/plan? No — write-through happens in a tiny /api/tutor-cache upsert route using the service role (client can't write the cache). Add that route: validates { itemId, wasCorrect, text }, text ≤ 2000 chars, upserts.

5.7 Planner (Gate 5). Stats gains an "exam date" input (stored in blob). /api/plan POST { examDate, ability, dueCount, answeredTotal } → one LLM call (deepseek default) returning strict JSON { days: [{ day, focusCat, items, note }] }; validate shape server-side; client caches in blob until the ISO week changes. Render on Today under the Monitor.

## 6 · API routes

`api/ai.js` — copy assets/api/ai.js verbatim.

`api/telemetry.js` — POST { itemId, correct, itemDelta }. Validate: itemId integer, correct boolean, |itemDelta| ≤ 12. Service-role client: increment times_answered, times_correct (if correct), and elo_rating = clamp(coalesce(elo_rating, seed) + itemDelta, 800, 1900) where seed = 1100/1300/1500 by diff. Use a single rpc (write a record_answer SQL function in the migration) so the update is atomic. Rate-limit: reject > 1 call/sec per IP (simple in-memory token bucket is acceptable at this scale).

`api/plan.js` — as §5.7. Reject if examDate not a future ISO date.

`api/tutor-cache.js` — as §5.6.

## 7 · Ops

- ops/content-factory.mjs — copy from assets verbatim. It targets thin categories, generates all six item types, adversarially reviews cross-vendor, schema-gates, inserts approved=false.

- ops/seed-content.mjs — copy from assets verbatim.

- .github/workflows/content-factory.yml — cron 0 6,18 * * *, Node 20, npm ci in ops context, runs node ops/content-factory.mjs --batch 12; secrets from repo settings; on failure actions/github-script opens an issue titled "content factory failed <date>".

## 8 · Review console

Copy assets/review-console.html → public/review/index.html; replace the two config constants with %VITE_...%-style injection or literal project values at deploy time. It already renders all six item types, enforces rejection notes, and writes approved/rejected_at/reviewed_by/human_review_note/last_reviewed_at. Add (small enhancement): a "Health" tab listing approved items where itemHealth({times_answered, times_correct, rating: elo_rating}).flag is true (import logic inline — copy the function; no bundler in this file).

## 9 · Vercel config

vercel.json: Vite static build + /api functions (default zero-config works; only add rewrites so /review serves the console). SPA fallback to index.html for the app routes.

## 10 · Tests (Vitest) — must stay green

- 1. ability-engine — port the shipped simulation test: strong student > 60, weak < 40, refusal < 12 answers, band narrows, coverage weighting, itemHealth flags.

- 2. factory schema gate — the shipped 14-case test (all six types valid + every corruption caught).

- 3. state migration — legacy blob without ability/plan loads with defaults; full blob round-trips unchanged.

- 4. local dates — todayStr() equals a new Date()-derived local string; addDays(3) crosses month boundaries correctly.

- 5. NGN scoring — matrix/bowtie/cloze scorer functions: exact-match correct, any deviation incorrect.

## 11 · Acceptance criteria (end-to-end, run before calling it done)

- 1. Fresh user signs up → answers 12+ questions → readiness range appears; second device with same login shows identical state.

- 2. node ops/content-factory.mjs --batch 5 inserts pending items; none visible in the app; console approve → visible after reload; reject with note → never visible.

- 3. Every one of the six item types serves, scores, and shows rationale + tutor button.

- 4. Tutor: first ask on an item hits /api/ai; second ask (any user) served from cache (verify by network tab / logs).

- 5. Telemetry increments and elo_rating moves after answers; 800 ≤ elo_rating ≤ 1900 always.

- 6. No secret appears in the built client bundle: grep -r "OPENROUTER\|SERVICE_ROLE" dist/ returns nothing.

- 7. npm test green; npm run build clean.

## 12 · Staged next (not this build)

Expo port (adapters swap only — AsyncStorage + same /api/ai; add expo-notifications daily reminder with SchedulableTriggerInputTypes.DAILY + Android channel per the Adapters doc), App Store/Play submission, image-based items, cohort pass-rate collection.
