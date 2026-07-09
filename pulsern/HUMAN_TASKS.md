# Human Tasks — What Only You Can Do

Claude Code executes everything else. These run in parallel with the build.

## Before Prompt 1 (blocking)

- H1 · Supabase — supabase.com → New project → strong DB password. Copy Project URL, anon key, service_role key. (~5 min)

- H2 · OpenRouter — openrouter.ai → create key → load $10 credit. Covers thousands of factory items + tutor calls. (~5 min)

- H3 · Vercel — vercel.com → connect the GitHub repo once Prompt 1 pushes it. Add env vars per PULSERN_BUILD.md §2 (both VITE_ client vars and the three server secrets). (~10 min)

- H4 · GitHub secrets — repo Settings → Secrets → Actions: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY. (~3 min)

## During the build

- H5 · Register yourself as reviewer — sign up in the app with your RN account, then in Supabase SQL editor:

  insert into reviewers (user_id, full_name, license_no) values ('<your auth uid>', 'Sheldon Bennett, RN', '<license>');

  (Find your uid under Authentication → Users.)

- H6 · Google OAuth (optional but conversion-critical) — Supabase → Authentication → Providers → Google; needs a Google Cloud OAuth client (~15 min, their docs walk it).

## Before public launch (non-negotiable)

- H7 · Formal review pass — the 21 seeded items were audited in this build session, but the launch checklist requires *your* formal RN sign-off. In the console, review anything where reviewed_by is null. (~1 hour)

- H8 · Review cadence — block 3–5 hrs/week for the queue. This is the growth throttle: your hours ≈ 100–150 approved items/week.

- H9 · Legal texts — educational-use disclaimer, privacy policy, terms. "Prep for the NCLEX-RN examination®" phrasing; no NCSBN affiliation implied. Attorney review before paid marketing.

- H10 · Pass-rate loop — set up the 60-day post-exam email ask (one question: pass/fail). At n≥100 this becomes your strongest marketing asset.

## Later (Expo phase)

- H11 · Expo/EAS account + Apple Developer ($99/yr) + Google Play ($25 one-time) — only when the web version has retention worth porting.
