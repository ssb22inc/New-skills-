# Human Tasks — What Only You Can Do

Claude Code executes everything else. These run in parallel with the build.

## Initial account setup (completed)

- H1 · Supabase — **completed.** The production project, schema, Auth,
  RLS, and client/server credentials are in use.

- H2 · OpenRouter — **completed.** The tutor and on-demand content
  workflows have used the configured provider credential successfully.

- H3 · Vercel — **completed.** `www.pulsern.app` is serving the Vercel
  production project with the required Supabase and OpenRouter variables.

- H4 · GitHub secrets — **completed 2026-09-10.** The Actions
  `SUPABASE_SERVICE_ROLE_KEY` was corrected and proved by the factory's
  service-role preflight and a successful recovery run. The factory is now
  intentionally on-demand because the content libraries reached their
  targets; it is not failing on a disabled schedule.

## During the build

- H5 · Register yourself as reviewer — sign up in the app with your RN account, then in Supabase SQL editor:

  insert into reviewers (user_id, full_name, license_no) values ('<your auth uid>', 'Sheldon Bennett, RN', '<license>');

  (Find your uid under Authentication → Users.)

- H6 · Google OAuth and app-path redirects (optional provider, required redirect allowlist) — Supabase → Authentication → URL Configuration: allow `https://www.pulsern.app/app/` and `https://www.pulsern.app/app/reset` (plus the equivalent Vercel preview routes used for auth testing). Keep the Site URL at `https://www.pulsern.app`. Then enable Google under Authentication → Providers if desired; it needs a Google Cloud OAuth client. The one-time `/app/` migration deliberately asks existing users to sign in once again.

## Before public launch (non-negotiable)

- H7 · Formal review pass — the 21 seeded items were audited in this build session, but the launch checklist requires *your* formal RN sign-off. In the console, review anything where reviewed_by is null. (~1 hour)

- H8 · Review cadence — block 3–5 hrs/week for the queue. This is the growth throttle: your hours ≈ 100–150 approved items/week.

- H9 · Legal review — **texts are implemented** at `/legal/`, including the
  educational-use disclaimer, privacy terms, NCLEX trademark statement, and
  no-affiliation language. Attorney review remains required before paid
  marketing; a passing code or SEO audit is not legal approval.

- H10 · Pass-rate loop — set up the 60-day post-exam email ask (one question: pass/fail). At n≥100 this becomes your strongest marketing asset.

- H15 · Public RN verification for the search release gate — **completed
  2026-08-26.** Florida MQA primary-source verification matched Sheldon Sean
  Bennett, Registered Nurse, license RN9537022, with Clear/Active multistate
  status. The release ledger publishes only the consented display name,
  credential, jurisdiction, official verification URL, and verification date;
  it does not publish the address or treat license verification as guide
  approval.
  Updated 2026-10-16: the Florida MQA lookup page shows the licensee's
  address, so the published verification link is now Nursys
  (https://www.nursys.com), which shows license status without it.

- H16 · Guide-by-guide clinical attestation — **completed 2026-09-03.**
  All 37 public guides have digest-bound approval records: 20 exam guides,
  14 clinical guides, and 3 education guides, with 297 claim-to-source
  mappings. The build still invalidates an approval automatically whenever
  its content or source-set digest changes.

  The governing requirement was to review every public guide against
  its listed authoritative sources. For each guide, record the reviewer ID,
  review date, scope, exact content SHA-256, exact source-set SHA-256, and at
  least one claim record with a page/section locator and supporting source IDs.
  A content or source edit changes the digest and automatically invalidates the
  old approval. The automated and model gates must both pass after attestation;
  neither is a substitute for this RN review.

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

## Paid diagram and narration jobs (added 2026-10-09, PR #134)

- H20 · Create the `pulsern-paid` environment — GitHub → Settings →
  Environments → New environment `pulsern-paid` → Deployment branches and
  tags: "Selected branches" → add only the default branch (`main`). Add
  these environment secrets (same values as the repository secrets):
  `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `OPENROUTER_API_KEY`. Do not rotate the keys for this.

  Then create the signing key pair (one time, on your own computer):

      openssl genpkey -algorithm ed25519 -out pulsern-attest.pem
      openssl pkey -in pulsern-attest.pem -pubout

  Add the whole contents of `pulsern-attest.pem` (including the BEGIN/END
  lines) as the `pulsern-paid` environment secret
  `PULSERN_ATTEST_PRIVATE_KEY`. Add the second command's output (the
  PUBLIC key, BEGIN/END lines included) as a repository VARIABLE — Settings
  → Secrets and variables → Actions → Variables → New repository variable
  — named `PULSERN_ATTEST_PUBLIC_KEY`. Then delete `pulsern-attest.pem`.
  The paid jobs sign every diagram-review verdict, pairing decision, the
  pairing map and every narration clip record with the private key; CI and
  the paid jobs check those signatures with the public key, so a "PASS",
  pairing or clip written by hand in a branch counts for nothing. Until
  both are set, the three paid workflows refuse to run, and CI refuses any
  signed record it cannot check.

  Why: the narration, diagram-pairing and diagram-review workflows now run
  in two jobs. The first checks out the chosen branch and runs its code
  with no secrets, only to turn it into data. The second holds the keys,
  runs only `main`'s scripts, and treats the branch as data. The
  environment rule means a copy of these workflows on any other branch
  cannot reach the keys either. Dispatch the three workflows from `main`
  and pick the branch to work on with the `branch` input.

  Limit: other PulseRN workflows still read repository-level copies of
  `SUPABASE_SERVICE_ROLE_KEY` and `OPENROUTER_API_KEY`, and any account
  with write access can push a workflow that reads repository-level
  secrets. Keep write access to people you trust; moving the remaining
  workflows into environments is a later change.

## Paid content and exams locked to the server (added 2026-10-16)

- H21 · Apply migration 018 in production — until it is applied, anyone
  with the public app key can read the whole question bank, flashcards,
  case studies and all ten readiness exams WITH their answers, and exam
  limits are checked only in the browser.

  Order matters. Do these two steps back to back:

  1. Merge, and let Vercel deploy the app release that contains
     `api/exam.js` (readiness exams are now started, served and graded by
     the server). Until step 2 is done, starting an exam shows "The exam
     service is unavailable", because the new `exam_attempts` columns do
     not exist yet. That fails closed: no attempt is written and no credit
     is spent. Practice, flashcards and cases keep working.
  2. Straight after, open the Supabase SQL editor
     (https://supabase.com/dashboard/project/xlfdywudgamrnzjwtrtd/sql/new),
     paste the whole of
     https://github.com/ssb22inc/New-skills-/blob/main/pulsern/supabase/migrations/018_paid_content_rls.sql
     and press Run. Running it twice is safe.

  Why not the other way round: if the migration goes first, the old app
  still open in browsers inserts `exam_attempts` itself and reads exam
  items directly. The database refuses both, so every exam start fails and
  the exam picker shows every form as "not built yet" until the new app
  ships. Deploying the app first limits the gap to exam starts, and nothing
  is spent during it.

  Check it is applied (returns `true`):

      select exists (select 1 from pg_policies where policyname = 'questions_read_practice_entitled') and not exists (select 1 from pg_policies where policyname in ('questions_read_approved', 'flashcards_read_approved', 'cases_read_approved', 'insert own attempts')) as migration_018_applied;

  Diagram pairing after 018: the paid job (in `pulsern-paid`, H20) reads
  the bank with the service key it already holds; the prepare job, where
  branch code runs, reads no bank and must never be given a key.

- H22 · ~~A bank reader account for diagram pairing~~ — **no longer needed.**
  The pairing job's prepare half no longer reads the bank at all: the
  branch's code is never shown a question (Luna, PR #155), so it needs no
  account. The paid half reads the bank with the service key it already
  holds in `pulsern-paid` (H20) and proposes pairings with `main`'s
  matcher. If you already created a `pulsern-bank-read` environment or a
  reader account, you can delete them.

## Read-aloud voice (added 2026-10-29)

- H23 · **Nothing to do.** The 🔊 Listen buttons (practice questions, the
  Today round, Review misses, case studies, flashcards; never readiness
  exams) use the OpenAI key already stored in the GitHub `pulsern-paid`
  environment. No key goes on the web server.

  How it works:
  - A student presses Listen. The server checks the request against the
    bank, using the student's own access: approved content, a current pass,
    never exam items. Nobody can make it say anything else. If the passage
    already has checked audio, the student hears the AI voice at once.
    Otherwise it is queued, and the device's own voice reads it this time.
  - Every 15 minutes the job "pulsern-read-aloud"
    (https://github.com/ssb22inc/New-skills-/actions/workflows/pulsern-read-aloud.yml)
    voices the queued passages. It transcribes each one and checks it word
    for word (numbers, units, negations). Only audio that passes is saved,
    in the private `read-aloud` bucket, and from then on every student
    hears it. A passage that fails twice keeps the device voice.

  Limits and cost:
  - Daily caps on NEW passages: 300 per student and 4,000 for the whole app
    (UTC day). Change them with the Vercel variables `SPEAK_USER_DAILY` and
    `SPEAK_GLOBAL_DAILY`. Each job run voices at most 200.
  - OpenAI bills `gpt-4o-mini-tts` per minute of audio, plus the
    `gpt-4o-transcribe` check. Saved audio is reused for free. Usage:
    https://platform.openai.com/usage.
  - Optional: adding `OPENAI_API_KEY` to the Vercel project makes the
    server voice new passages instantly, with the same check, instead of
    queueing them.
