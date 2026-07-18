# PulseRN — Project Rules

## RN Edition guardrails (owner prompt pack, 2026-07-16)

- Never remove, rename, or weaken an existing feature. Protected: one-tap Today round; adaptive difficulty; category interleaving; Review Misses; SRS flashcards with real calendar dates + type-before-flip; all 8 NGN item types; case studies with NCJMM flow; readiness exams with lockdown + never-repeat; XP/ranks/streak/shield; honest readiness estimate ("estimate" label, 12-answer minimum); light/dim themes; owner-only AI engine picker; store/askModel adapters; subscriptions + entitlements; SMS consent language; Terms/Privacy/disclaimer links; review console.
- Design system: teal/green palette, coral only for incorrect/critical, amber only for caution, monitor motif, IBM Plex Mono for stats. No new colors, no stock photos — visuals are hand-drawn inline SVG in the app palette.
- Straight quotes in code. Accessibility: focus rings, reduced-motion, ≥4.5:1 contrast both themes.
- Claims hygiene: compare, never equate ("like the real exam", never "same as"); readiness never promises outcomes; NCSBN trademark disclaimer stays in footer and app.
- Owner amendment (standing, reaffirmed 2026-07-16): despite the pack's human-review framing, the ADVERSARIAL AI is the accuracy gate for ALL site content — questions, exams, cases, flashcards, images/visuals, and site copy (ops/audit-sweep.mjs, factory review passes, copy audits). Owner extension (2026-07-16, explicit order): QBank practice questions now ALSO publish through the adversarial gate at >=0.85 (content-factory --publish) so the bank can reach 3,000+ live items; the console keeps rejection authority. The owner-RN retains full rejection/oversight authority over everything; nothing unapproved reaches students.

## What this project is

PulseRN: an adaptive NCLEX-RN study platform. React web app (Expo port later), Supabase (auth + progress sync + shared question bank), a Vercel serverless AI proxy, an Elo/Rasch ability engine, an AI content factory with adversarial review, and a human RN approval console. Full spec: PULSERN_BUILD.md. Execution order: PULSERN_PROMPTS.md.

## Non-negotiable rules

- 1. The approval gate is sacred. No code path other than the review console (a signed-in human reviewer) may ever set questions.approved = true. The content factory, seed exceptions aside, always writes approved = false. If you find yourself writing approved: true anywhere else, stop — it's wrong.
  - Owner amendment (licensed-RN owner, 2026-07-13): for SCALED content — flashcards and case studies — cross-vendor adversarial AI review at ≥0.85 confidence IS the publication gate (card-factory.mjs / case-factory.mjs insert approved=true on pass, drop on fail). QBank practice questions originally kept the human console gate; superseded 2026-07-16 by owner order — they now publish via the adversarial gate too (console retains rejection authority). The console retains rejection authority over everything, and all AI content stays labeled ✨ with the verify-against-your-materials note.

- 2. Secrets live server-side only. OPENROUTER_API_KEY and SUPABASE_SERVICE_ROLE_KEY appear ONLY in Vercel env vars and GitHub Actions secrets. Never in client code, never committed, never in VITE_-prefixed vars. The client may hold only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.

- 3. The persisted-state contract is frozen. The shape documented in PULSERN_BUILD.md §4 must load cleanly for legacy saves (missing keys get defaults). Never rename or repurpose existing keys. Derived values (readiness, weak areas) are always recomputed, never stored.

- 4. Dates are LOCAL, never UTC. Streaks and SRS due dates use the local-date helpers already in App.portable.jsx. Never introduce toISOString().slice(0,10) for calendar logic.

- 5. No placeholders, no stubs, no "TODO: implement". Every file you write must run. If a step can't be completed, say so explicitly instead of faking it.

- 6. Deterministic math stays deterministic. Grading, SRS scheduling, streaks, Elo updates, and adaptivity are plain code. Agents/LLMs are used ONLY for: question generation, adversarial review, the tutor, and the weekly planner.

- 7. Medical content register. Generated prompts must produce educational exam-prep content only — never real-world dosing/treatment instructions. Keep the disclaimer and the AI-item "verify against your course materials" note visible.

- 8. Every prompt in the chain ends with its verification step. Do not advance until it passes. If a verification fails twice, stop and report exactly what failed.

## Stack

- Frontend: Vite + React 18, single-file-ish app (src/App.jsx from assets/App.portable.jsx), plain CSS-in-JS <Style> block (no Tailwind).

- Backend: Vercel serverless functions in /api (Node 20, ESM). Supabase (Postgres + Auth + RLS).

- AI routing: OpenRouter via /api/ai. Model table lives in that one file.

- Ops: ops/ Node scripts (content factory, seed), GitHub Actions cron.

- Tests: Vitest for unit tests (npm test). Ability engine and factory schema gate must keep their shipped tests green.

## Commands

npm run dev        # Vite dev server (with `vercel dev` for API routes)
npm test           # Vitest — must be green before every commit
npm run build      # production build
node ops/seed-content.mjs --dry-run
node ops/content-factory.mjs --dry-run

## Repo layout (target)

pulsern/
├── CLAUDE.md
├── PULSERN_BUILD.md
├── PULSERN_PROMPTS.md
├── HUMAN_TASKS.md
├── package.json
├── vite.config.js
├── index.html
├── vercel.json
├── src/
│   ├── App.jsx              # from assets/App.portable.jsx, cloud-wired
│   ├── ability-engine.js    # from assets/ — do not rewrite, integrate
│   ├── auth.jsx             # sign-in/up screen (Supabase email + Google)
│   └── main.jsx
├── api/
│   ├── ai.js                # from assets/api/ai.js
│   ├── telemetry.js
│   └── plan.js
├── ops/
│   ├── content-factory.mjs  # from assets/ — do not rewrite, deploy
│   └── seed-content.mjs     # from assets/
├── public/review/index.html # from assets/review-console.html
├── pulsern-content.json     # from assets/
├── supabase/migrations/001_init.sql
├── .github/workflows/content-factory.yml
└── tests/

## Working style

- Copy the tested assets into place and integrate; do not rewrite them from scratch. They carry fixes (local dates, SRS merge, Elo tests, NGN schema gate) that a rewrite would lose.

- Small commits per prompt step, message format: step N: <what>.

- When touching App.jsx, run the build after every change — the file is large and a broken paren costs more to find later.
