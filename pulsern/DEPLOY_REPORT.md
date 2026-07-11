# PulseRN — Build & Verification Report

**Production: https://pulsern.vercel.app · Review console: https://pulsern.vercel.app/review/**

Build executed per PULSERN_PROMPTS.md, prompts 0–13 complete with every
verification gate green, including the post-deploy production smoke test:

- Sign-in and Today dashboard render on the live site.
- Answering a question fired live `/api/telemetry` (item stats and Elo moved
  in the DB, correct direction) and the tutor's `/api/ai` call completed in
  ~6s with `/api/tutor-cache` write-through — the cached explanation is
  readable by signed-in students (pay-once verified).
- Setting an exam date produced a live `/api/plan` 7-day plan rendered on
  Today, leading with the weakest category.
- `/review/` serves the Clinical Review Console.

## What was built and verified

| Gate | Result |
|---|---|
| Prompt 0 — extraction | 12 files from the kit; `node --check` + `JSON.parse` clean |
| Prompt 1 — scaffold | Vite build clean; Vitest runs |
| Prompt 2 — database | Migration applied; 24 seeded items approved; RLS on all 4 tables; `record_answer` present |
| Prompt 3 — tests | 58 Vitest tests green (ability sim, 14-case schema gate, dates, state migration, NGN scoring) |
| Prompt 4 — auth + sync | Sign-in works live; progress blob row persists; XP identical after reload |
| Prompt 5 — ability engine | Readiness renders as a range; refusal under 12 answers; Elo targeting in pickFrom |
| Prompt 6 — NGN types | All six types render, score, show rationales in-browser (headless run over the full bank) |
| Prompt 7 — bank loading | Live bank serves (25 items incl. console-approved factory item); offline fallback verified |
| Prompt 8 — telemetry | Live: times_answered 0→1, elo seeded 1100 then −3.5; 400s/429/405 all correct |
| Prompt 9 — tutor cache | Live write-through; signed-out read returns 0 rows (authenticated-only) |
| Prompt 10 — planner | Live DeepSeek call returned a valid 7-day plan leading with the weakest category |
| Prompt 11 — review console | Reviewer saw 4 pending, approved 1 (went live), rejected 1 with required note; non-reviewer sees 0 and cannot approve; Health tab works |
| Prompt 12 — factory | Live batch: 5 generated, 5/5 schema pass, adversarial review rejected 1; 4 queued approved=false with AI notes |

The approval gate was verified from every direction: the factory writes
`approved=false` only, students (anon/authenticated non-reviewers) can
neither see nor flip pending items, and only the console path approves.

## Database state right now

- 25 approved items live (21 seed + 3 NGN samples + 1 console-approved factory item)
- 2 factory items still pending review, 1 rejected with note (id 27)
- Test accounts (safe to delete before launch): `pulsern.gate.test@gmail.com`,
  `e2e-test@pulsern.dev`, `student-nonreviewer@pulsern.dev`. The temporary
  reviewer role used for verification has been removed.

## Daily ops commands

```
node ops/content-factory.mjs --batch 12   # refill the review queue (or let the cron run)
node ops/seed-content.mjs                 # idempotent starter-bank seed
npm test && npm run build                 # before every change you ship
```
Review queue: open `/review/` on the deployed site, sign in with a
reviewer-registered account.

## What's left (human tasks — HUMAN_TASKS.md)

1. ~~H3 · Vercel~~ — **done**: deployed at https://pulsern.vercel.app with all
   five env vars; every `/api` route verified live.
2. **H4 · GitHub secrets**: repo Settings → Secrets → Actions:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY` —
   the twice-daily factory workflow needs them.
3. **H5 · Register yourself as reviewer** (Supabase SQL editor):
   `insert into reviewers (user_id, full_name, license_no) values ('<your auth uid>', '<name>, RN', '<license>');`
4. **H7 · Formal review pass** of all 25 live items (3 NGN samples were
   hand-written this build; the 21 seed items shipped with the kit).
5. **Security rotation** (credentials were shared in chat during the build):
   change your Supabase account password, rotate the OpenRouter key and the
   personal access token, and delete the test accounts.
6. Re-run acceptance item 6 after Vercel deploy:
   `grep -r "OPENROUTER\|SERVICE_ROLE" dist/` must return nothing
   (verified clean in this build).

## Post-deploy smoke test (5 minutes)

1. Sign up fresh → answer 12+ questions → readiness range appears.
2. Same login on a second device → identical state.
3. Ask the tutor on one item twice → second answer is instant (cache).
4. `/review/` → approve something → visible in the app after reload.
