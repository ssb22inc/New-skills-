# PulseRN — Execution Chain

Run in order. Every prompt ends with a verification gate — do not advance past a red gate. If a gate fails twice, stop and report.

Prereq: HUMAN_TASKS.md items H1–H4 done (accounts + env vars exist). Kit assets are in assets/.

PROMPT 1 — Scaffold

"Read CLAUDE.md and PULSERN_BUILD.md fully. Scaffold the repo per the CLAUDE.md layout: Vite + React 18 project, vercel.json, Vitest configured, .gitignore (node_modules, dist, .env*, .vercel). Copy assets into place: assets/App.portable.jsx → src/App.jsx, assets/ability-engine.js → src/ability-engine.js, assets/content-factory.mjs → ops/, assets/seed-content.mjs → ops/, assets/pulsern-content.json → ./, assets/review-console.html → public/review/index.html, assets/api/ai.js → api/ai.js. Create src/main.jsx mounting App. Install deps: react, react-dom, @supabase/supabase-js, vite, @vitejs/plugin-react, vitest.

VERIFY: npm run build succeeds and npx vitest run executes (zero tests is fine)."

PROMPT 2 — Database

"Write supabase/migrations/001_init.sql exactly per PULSERN_BUILD.md §3, and add the atomic record_answer(item_id bigint, was_correct boolean, delta numeric) SQL function per §6 telemetry. Apply it to the Supabase project (CLI or instruct me to paste into the SQL editor and confirm). Then run node ops/seed-content.mjs --dry-run, and if the human confirms env vars are set, run it live.

VERIFY: querying questions returns 21 rows, all approved=true; progress, reviewers, tutor_cache exist; RLS is enabled on all four tables."

PROMPT 3 — Ported tests first

"Create tests/ability.test.js and tests/factory-schema.test.js by porting the shipped simulation and 14-case schema tests described in PULSERN_BUILD.md §10 items 1–2 into Vitest. Add §10 item 4 (local-date tests).

VERIFY: npm test green."

PROMPT 4 — Cloud adapters + auth

"Implement §5.1 (Supabase store adapter + /api/ai askModel) and §5.2 (src/auth.jsx, session gating, sign-out in Stats). Local-storage fallback stays for signed-out preview only if trivial; otherwise auth-gate everything.

VERIFY: npm run build clean; with vercel dev, sign-up → answer questions → refresh → progress persists; row visible in progress table."

PROMPT 5 — Ability engine integration

"Implement §5.3 completely: ability in state + blob (with legacy-save defaults), updateAbility inside record(), readiness range display, calibration fetch, and the new pickFrom targeting. Add the §10 item 3 state-migration test.

VERIFY: npm test green; manual: 12+ answers shows a range like '62–78% (estimate)'; 11 answers shows the refusal text."

PROMPT 6 — NGN renderers

"Implement §5.4: matrix, bowtie, and cloze rendering + scoring in QBank, extra-payload support in the bank merge, and validQ extended to mirror the factory's validItem. Add §10 item 5 scoring tests. Insert one hand-written item of each NGN type directly into Supabase (approved=true) for manual testing.

VERIFY: npm test green; all six types render, score, and show rationales in the browser."

PROMPT 7 — Bank loading

"Implement §5.5: fetch approved questions on load, merge with customQs, built-in local array as offline fallback.

VERIFY: adding a new approved row in Supabase appears in Practice after reload; killing the network still leaves the app usable with local items."

PROMPT 8 — Telemetry

"Implement api/telemetry.js per §6 including the atomic rpc call, clamping, validation, and the simple rate limit. Wire the client fire-and-forget POST in record() (bank items only).

VERIFY: answer 5 questions → times_answered increments and elo_rating moves in the DB; malformed POSTs return 400; elo stays within [800, 1900]."

PROMPT 9 — Tutor cache

"Implement §5.6: api/tutor-cache.js (validated service-role upsert) and the cache-first TutorExplain flow.

VERIFY: first 'Explain it differently' on an item calls /api/ai (log/network); asking again on the same item+outcome serves from tutor_cache with no /api/ai call."

PROMPT 10 — Weekly planner

"Implement §5.7: exam-date input in Stats, api/plan.js with strict JSON validation, ISO-week client caching in the blob, and the plan rendering on Today.

VERIFY: setting an exam date produces a 7-day plan naming the weakest category; reloading within the same week does NOT call /api/plan again."

PROMPT 11 — Review console deploy + health tab

"Configure public/review/index.html with the real Supabase URL/anon key, add the /review rewrite in vercel.json, and add the Health tab per §8 listing flagged approved items.

VERIFY: signed-in reviewer (from reviewers table) sees pending items; a non-reviewer account sees an RLS error/empty queue; approve and reject both persist correctly."

PROMPT 12 — Factory cron

"Create .github/workflows/content-factory.yml per §7. Run node ops/content-factory.mjs --batch 5 once live from local to prove the pipeline.

VERIFY: pending items appear with reviewer_notes populated and approved=false; workflow file passes act-style lint or GitHub's parser; failure path opens an issue (test by temporarily breaking a secret name, then restore)."

PROMPT 13 — Full acceptance run

"Execute every acceptance criterion in PULSERN_BUILD.md §11 in order. Fix what fails; re-run until all seven pass. Then vercel --prod deploy.

VERIFY: paste the completed §11 checklist with evidence (query outputs, screenshots/log lines) and the production URL."

PROMPT 14 — Handoff report

"Write DEPLOY_REPORT.md: production URLs (app, /review), what was built per gate, test counts, the exact commands for daily ops (factory run, seed, reviewing), remaining human tasks from HUMAN_TASKS.md (H5+), and any deviations from spec with reasons. No cheerleading — deviations and known limitations first."
