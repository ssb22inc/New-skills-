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

- H6 · Google OAuth and app-path redirects (optional provider, required redirect allowlist) — Supabase → Authentication → URL Configuration: allow `https://www.pulsern.app/app/` and `https://www.pulsern.app/app/reset` (plus the equivalent Vercel preview routes used for auth testing). Keep the Site URL at `https://www.pulsern.app`. Then enable Google under Authentication → Providers if desired; it needs a Google Cloud OAuth client. The one-time `/app/` migration deliberately asks existing users to sign in once again.

## Before public launch (non-negotiable)

- H7 · Formal review pass — the 21 seeded items were audited in this build session, but the launch checklist requires *your* formal RN sign-off. In the console, review anything where reviewed_by is null. (~1 hour)

- H8 · Review cadence — block 3–5 hrs/week for the queue. This is the growth throttle: your hours ≈ 100–150 approved items/week.

- H9 · Legal texts — educational-use disclaimer, privacy policy, terms. "Prep for the NCLEX-RN examination®" phrasing; no NCSBN affiliation implied. Attorney review before paid marketing.

- H10 · Pass-rate loop — set up the 60-day post-exam email ask (one question: pass/fail). At n≥100 this becomes your strongest marketing asset.

- H15 · Public RN verification for the search release gate — **completed
  2026-08-26.** Florida MQA primary-source verification matched Sheldon Sean
  Bennett, Registered Nurse, license RN9537022, with Clear/Active multistate
  status. The release ledger publishes only the consented display name,
  credential, jurisdiction, official verification URL, and verification date;
  it does not publish the address or treat license verification as guide
  approval.

- H16 · Guide-by-guide clinical attestation — review every public guide against
  its listed authoritative sources. For each guide, record the reviewer ID,
  review date, scope, exact content SHA-256, exact source-set SHA-256, and at
  least one claim record with a page/section locator and supporting source IDs.
  A content or source edit changes the digest and automatically invalidates the
  old approval. The automated and model gates must both pass after attestation;
  neither is a substitute for this RN review.
  - **Progress 2026-08-26:** Guide 1, “ABG interpretation made simple,” was
    approved by Sheldon Bennett, RN, after source correction and independent
    adversarial review. The approval is bound to content SHA-256
    `4cc71368c819558ec37ee6c36257aaaea73c5389dc878ce31fed7b932e0c3166`
    and source-set SHA-256
    `897d728338a16872e1438b68ab3270ba4539f270cadc473183a2f823307fcc98`.
    The remaining 22 guides are still pending and fail closed.

## Later (Expo phase)

- H11 · Expo/EAS account + Apple Developer ($99/yr) + Google Play ($25 one-time) — only when the web version has retention worth porting.

## Payments (added 2026-07-15, round 11)

- H12 · Stripe activation — **test mode wired and verified 2026-07-23.** Stripe account exists, test keys issued, and the webhook endpoint (`https://pulsern.vercel.app/api/stripe-webhook`, event `checkout.session.completed`) was created via the Stripe API. The whole path was harness-tested against live Stripe test mode: checkout-session creation with correct amounts/metadata, webhook signature verification, access grant written to `subscriptions`, replay idempotency, and rejection of forged and stale signatures.
  - **Remaining (Vercel dashboard only — the build environment has no Vercel API access):** in Vercel → pulsern → Settings → Environment Variables add `STRIPE_SECRET_KEY` (the `sk_test_…` key) and `STRIPE_WEBHOOK_SECRET` (the `whsec_…` value from Stripe → Developers → Webhooks → the PulseRN endpoint → "Signing secret" → Reveal), then redeploy. Buy buttons go live immediately. (~5 min)
  - **Test purchases:** card `4242 4242 4242 4242`, any future expiry, any CVC. No real money moves in test mode.
  - **Going live:** swap both Vercel vars for live-mode values (Stripe → toggle off Test mode → API keys for `sk_live_…`; create a live webhook endpoint at the same URL for its own signing secret). Test keys never charge real cards, so real revenue requires this swap.
  - Note: the app takes **one-time payments for fixed access windows** (matching the 30/60/90/180/360/730-day sheet), not auto-renewing subscriptions — renewals are bought deliberately. The publishable key (`pk_…`) is **not needed**: checkout is created server-side and students are redirected to Stripe's hosted page, so no card data or Stripe JS ever touches the app.

- H13 · Partner discount codes — one SQL insert per partner in the Supabase SQL editor: `insert into discount_codes (code, partner, amount_off_cents) values ('CODENAME', 'partner-name', 3000);` ($30 off; use percent_off instead for %). Monthly payout report: `select discount_code, count(*) as sales, sum(price_cents)/100.0 as revenue from subscriptions where discount_code is not null group by 1;` A demo code RNPARTNER30 ($30 off → 30-day at $69) is live — deactivate it before launch with `update discount_codes set active = false where code = 'RNPARTNER30';`

## Texting (added 2026-07-15, round 13)

- H14 · Twilio activation — the SMS engine (profile opt-ins, daily study reminders, offer blasts) is built and dormant until you: (1) create an account at twilio.com and buy a local number (~$1.15/mo), (2) enable Advanced Opt-Out on the Messaging service (handles STOP/HELP automatically), (3) register for A2P 10DLC (required by US carriers for application texting — Twilio's console walks you through it, ~1-3 days approval), (4) add repo Actions secrets TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (the number, +1XXXXXXXXXX) next to the existing Supabase ones. Reminders then go out daily at ~1pm ET to consented students inactive 2+ days. To send an offer blast by hand: `node ops/sms-blast.mjs --offer "your message" --dry-run` (drop --dry-run to send). Texts only ever go to numbers with the matching checkbox ticked; STOP is honored at the carrier level and mirrored back nightly. (~45 min + carrier approval wait)
