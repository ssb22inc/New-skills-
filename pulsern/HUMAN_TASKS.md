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

## Payments (added 2026-07-15, round 11)

- H12 · Stripe activation — the checkout + webhook code is deployed and dormant until you: (1) create a Stripe account at stripe.com, (2) in Vercel → pulsern → Settings → Environment Variables add STRIPE_SECRET_KEY (from Stripe → Developers → API keys, the sk_live_… one), (3) in Stripe → Developers → Webhooks add endpoint https://pulsern.vercel.app/api/stripe-webhook with event `checkout.session.completed`, then add its signing secret to Vercel as STRIPE_WEBHOOK_SECRET, (4) redeploy. Until then the buy buttons show "Payments are not switched on yet." (~30 min)

- H13 · Partner discount codes — one SQL insert per partner in the Supabase SQL editor: `insert into discount_codes (code, partner, amount_off_cents) values ('CODENAME', 'partner-name', 3000);` ($30 off; use percent_off instead for %). Monthly payout report: `select discount_code, count(*) as sales, sum(price_cents)/100.0 as revenue from subscriptions where discount_code is not null group by 1;` A demo code RNPARTNER30 ($30 off → 30-day at $69) is live — deactivate it before launch with `update discount_codes set active = false where code = 'RNPARTNER30';`

## Texting (added 2026-07-15, round 13)

- H14 · Twilio activation — the SMS engine (profile opt-ins, daily study reminders, offer blasts) is built and dormant until you: (1) create an account at twilio.com and buy a local number (~$1.15/mo), (2) enable Advanced Opt-Out on the Messaging service (handles STOP/HELP automatically), (3) register for A2P 10DLC (required by US carriers for application texting — Twilio's console walks you through it, ~1-3 days approval), (4) add repo Actions secrets TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (the number, +1XXXXXXXXXX) next to the existing Supabase ones. Reminders then go out daily at ~1pm ET to consented students inactive 2+ days. To send an offer blast by hand: `node ops/sms-blast.mjs --offer "your message" --dry-run` (drop --dry-run to send). Texts only ever go to numbers with the matching checkbox ticked; STOP is honored at the carrier level and mirrored back nightly. (~45 min + carrier approval wait)
