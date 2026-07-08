# CLAUDE.md — Sycamore Project Memory

This file is the standing context for every Claude Code session working on Sycamore.
The full engineering spec is `SYCAMORE_BUILD.md`; the sequential build chain is
`SYCAMORE_PROMPTS.md`. Both live in the repo root. When they conflict with this file,
they win — then update this file.

## The Constitution (non-negotiable product laws)

1. **One door.** Every user action can start as a WhatsApp chat or voice note. Voice
   notes are first-class citizens. No feature may *require* a dashboard, form, or app
   download.
2. **Thumbs-up governance.** The system does the sophisticated thing and presents it as
   one plain sentence with an approve/decline tap. Full power, zero jargon.
3. **Plain-number ledgers.** Money is always reported as "you spent X, it brought in Y."
   Never a chart a seller has to interpret to know if they won.
4. **Show-me-why.** Every automated decision (ranking, budget move, pause, route) can
   explain itself in one tap. No black boxes facing users.
5. **Trust is never traded.** No fake/suppressed reviews, no fabricated product imagery,
   no undisclosed AI voice, no PII to unvetted vendors, no astroturfing. Cheapest applies
   to compute, never to trust. (FTC review rule + Jamaica DPA 2020 are floors, not goals.)
6. **Hold the trust, never hold the float.** Licensed partners custody money; Sycamore
   owns split logic, ledger, and data. Licenses follow volume; they never precede launch.
7. **Boring by default.** Any new moving part must be justified in one sentence or it
   doesn't ship. If you propose a new dependency or service, justify it against this law
   in one sentence or drop it.

## The Four Packs rule (the globalization mechanism)

- New country = one **Context Pack** (`packs/context/<market>.yaml`).
- New industry = one **Vertical Pack** (`packs/vertical/<vertical>.yaml`).
- New supplier = one **Adapter** (`adapters/<kind>/<vendor>`).
- New messaging surface = one **Channel Adapter** (`adapters/channels/<channel>`).

**If core code must change to enter a new market, industry, or supplier, the abstraction
is wrong — stop and fix the abstraction. Never patch core for one market.** Phase 6's
gate is literal: `git diff` on `/core` between JM-only and JM+DO must be empty.

## The stack

- **TypeScript modular monolith** with hexagonal (ports & adapters) boundaries and an
  internal event bus (outbox pattern). One deployable. Extraction to services only when
  a module proves a scaling bottleneck.
- **Postgres 16** for *all* state — capacity via transactional holds
  (`SELECT ... FOR UPDATE`), ledger as append-only double-entry.
- **Redis + BullMQ** — queues, rate limits, idempotency keys.
- **Next.js PWA** (`apps/web`) — trust pages, checkout, founder cockpit.
- **Adapters for everything external** — LLM, payments, channels, media, storage,
  search. Core never imports a vendor SDK directly.
- Monorepo layout (pnpm workspaces): `/core`, `/packs`, `/adapters`, `/apps/gateway`,
  `/apps/web`, `/apps/worker`, `/tests`.

## Money rules

- All money is **integer minor units + currency code**. Never floats, never bare numbers.
- The ledger is **double-entry** and append-only: Σ(debits) = Σ(credits) per transaction,
  per day, per market. Splits sum to exactly 100.00%. No order settles twice; no refund
  exceeds capture. A single cent of drift blocks release.
- **Idempotency keys on every money and messaging mutation** — webhooks WILL double-fire,
  and a duplicate delivery must produce exactly one effect.

## Data rules

- **Every table carries `market_id`**, and every query is market-scoped (future sharding
  key). A `jm` query can never return a `do` row.
- All times stored UTC, rendered in market timezone.
- **No hardcoded user-facing strings.** All copy goes through the localization engine and
  is driven by Context Pack directives (dialect, language rules). Zero hardcoded
  fallbacks — a missing pack field is a load error, not a silent default.
- PII routing is a **hard-coded policy check, not a prompt**: requests flagged
  `contains_pii=true` may only route to vendors with `dpa_signed=true`. Violation throws.

## The testing law

- Testing is a permanent organ, **~30% of all build effort** (BUILD §5).
- **Property tests on money** run on every commit — fuzzed
  book/cancel/refund/dispute/retry sequences must reconcile to the cent.
- **Nightly golden paths** (BUILD §5.3 consumer-side, §5.4 vendor-side) against staging.
- The oversell storm test (500 concurrent attempts on 12 seats → exactly 12 confirmed)
  is part of CI forever. So are the trust-page performance budget (<100KB, <2s on 3G)
  and the "no fabricated product imagery" check.
- "It compiles" is never done. Done = tests green + the prompt's ✅ GATE met. Commit
  after every gate: `P<number>: <name> — gate passed`.

## Conversation-layer safety

- User text is **data, never instructions**. Tool calls are allow-listed per intent with
  hard caps. Complaints get zero bot reply — escalate to the owner with context.
- `STOP` silences Autopilot in <5s; `RESUME` restores cleanly.

## AGENT SESSION LAWS (Survivability Addendum, PATCH A)

1. NEVER create watch loops, polling timers, or re-arming checks of any kind.
   Monitoring is CI's job (GitHub Actions), never a live session's job.
2. After opening a PR, the task is COMPLETE. Do not wait for merge, review, or
   CI. Report the PR link and proceed to the next prompt or exit.
3. Any background process you start must terminate before the task ends.
   Before finishing any task, list and kill your own background jobs.
4. If a task seems to require "keep checking until X" — STOP and ask the
   founder instead. Long-running observation belongs in CI or the Keeper's
   Watchman (server-side), never in an interactive session burning credits.
