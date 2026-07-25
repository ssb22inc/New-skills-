# BUILD_STATUS.md — Sycamore

**Code-complete: 100% (P0–P36 incl. Survivability Addendum, mock-complete — v1.0-code-complete = commit 1483e10, v1.1-survivability = commit 6007270, v1.2-asymmetric-clients = this HEAD). Production-live requires the HUMAN GATES below.**

> Note: the annotated tag `v1.0-code-complete` exists locally but this remote
> only accepts branch pushes; re-run `git tag -a v1.0-code-complete 1483e10 && git push origin v1.0-code-complete`
> from an unrestricted clone (or cut a GitHub Release at that commit).

Per SYCAMORE_FULL_BUILD_DIRECTIVE.md: continuous execution to code-complete on mocks;
human gates implemented up to the boundary and marked, never faked.

## Prompt status

| Prompt | Name | Status |
|---|---|---|
| P0 | Project memory | ✅ gate-passed |
| P1 | Repo + toolchain | ✅ gate-passed |
| P2 | Database core + migrations | ✅ gate-passed |
| P3 | Pack loaders | ✅ gate-passed |
| P4 | LLM router adapter | ✅ gate-passed |
| P5 | Channel gateway (mock-first) | ✅ gate-passed (replay ×5 → 1 effect; 100 msg/s × 60 s zero drops) |
| P6 | Feature flags + canary + observability | ✅ gate-passed (forced failure → auto-rollback → alert) — Phase 0 exit |
| P6.5 | Market registry & region lockdown | ✅ gate-passed (14 packs; DB-trigger lockdown; flip ceremony; chaos: 13 corrupted dark packs, jm zero errors) |
| P7 | Identity + readiness gate | ✅ gate-passed (exhaustive transition matrix; suspension keeps data) |
| P8 | Capacity engine (THE primitive) | ✅ gate-passed (500-storm → exactly 12; kill-storm → zero oversell; in CI forever) |
| P9 | Orders + completion verification | ✅ gate-passed (fuzzed lifecycles → zero orphans; reschedule atomicity both ways) |
| P10 | Conversations + intent engine | ✅ gate-passed (50/50 attacks safe vs a COMPROMISED model; STOP <5s; complaint → zero bot reply) |
| P11 | Autopilot end-to-end | ✅ gate-passed-mock (golden suite v1 executable; staging 3-night cadence pending infra) |
| P12 | Voice pipeline | ✅ gate-passed-mock (20 patois fixtures ≥90% intent accuracy; glossary founder-gated; real-Whisper accuracy = staging item) |
| P13 | Genesis flow | ✅ code gate-passed-mock (synthetic run: 7 exchanges, one session) · ⏸ HUMAN-GATE: 10 real sellers, voice-note-only, zero help |
| P14 | Trust pages + PWA shell | ✅ gate-passed (2.3KB transferred vs 100KB budget; interactive 448ms on throttled 3G+4x CPU; Lighthouse run pending CI wiring) |
| P15 | Double-entry ledger | ✅ gate-passed (10k fuzz reconciles to the cent; append-only enforced by DB; splits exact) |
| P16 | Payment adapter + links | ✅ code gate-passed-mock (double-fire ×5 → 1 effect; out-of-order refund retries then applies once) · ⏸ HUMAN-GATE: partner sandbox + counsel custody sign-off |
| P17 | Splits, release, payouts | ✅ gate-passed (1,000-order sim w/ 20% referrals balances to the cent; payout batch idempotent) |
| P18 | Refunds, disputes, evidence | ✅ gate-passed (§5.3-3/4 green; 4-claims/4-sellers/30d downgrade fires; 5th claim → human) |
| P19 | The Shoebox | ✅ gate-passed (seeded month matches ledger to the cent; language rules pass; GCT watch) — Phase-2 code done · exit ⏸ HUMAN-GATE: 100 real paid orders |
| P20 | Verified reviews + fraud signals | ✅ gate-passed (red-team: no-booking refused, burst held, competitor hit held; 1★→4★ honest history) |
| P21 | Discovery ranking + exposure floor | ✅ gate-passed (math hand-verified; audition always badged, never slot 1; fairness moves with dial) |
| P22 | Overflow routing + bundles | ✅ gate-passed (sold-out → overflow converts; referral credit in incumbent payout; bundle newcomer slot rotates) — Phase 3 exit |
| P23 | Signal ingestion | ✅ gate-passed (seeded schedule → correct boosts at 1–3d lead; idempotent matcher) |
| P24 | Campaign engine (Pulse core) | ✅ gate-passed (four behaviors reproduced deterministically; human caps absolute; plain-language narration) |
| P25 | Studio speak-to-create | ✅ gate-passed-mock (voice→approved ad E2E; no-fabrication is a permanent CI check; compliance is code) |
| P26 | Ad publishing + co-op pools | ✅ code gate-passed-mock (24-seller co-op: per-seller trust-page landings, badged auditions, spend attributes to the cent, once-only reconcile, balanced ledger charge) · ⏸ HUMAN-GATE: ad credentials + live co-op ≥20 sellers |
| P27 | Watchman + Fixer | ✅ gate-passed (injected fault drill: known fault self-heals via versioned runbook, actions recorded; novel fault escalates with ZERO actions; tampered runbook stopped pre-execution) |
| P28 | Listener + Scout + Mentor | ✅ gate-passed (survey→radar loop closes on seeded data; radar needs pain×market×lane + revenue estimate or it parks; Mentor cites a data source per line, skips when nothing, never judges taste) |
| P29 | Builder + Bursar | ✅ gate-passed (quarterly drill: bad change caught at sandbox, simulation, canary AND founder tap; 72h auto-rollback fires on decay; cheaper non-DPA vendor blocked before the founder queue and again at execution) |
| P30 | Herald + Chairman + Cockpit | ✅ code gate-passed-mock (change ships through full chain w/ founder tap; injected fault healed pre-impact; GEO JSON-LD + local pages; pilot fraud filter + holdout lift; disclosed-only forum; memo tested-items-only; zero spend authority; /cockpit pure-HTML) · ⏸ HUMAN-GATE (partial): live channel pilots — Phase 5 exit |
| P31 | Market #2 by pack alone | ✅ gate-passed (DO staging by pack copy + azul adapter only; /core diff vs JM-only baseline EMPTY and enforced by test in CI; full DOP order settles; jm query returns zero do rows) |
| P32 | Hurricane Mode + chaos program | ✅ code gate-passed-mock (staging rehearsal scored within runbook targets: DB-enforced freeze, rebook+refund waves idempotent to the cent, broadcasts, recovery promo; chaos calendar + 3 runnable drills in CI) · ⏸ HUMAN-GATE: timed PROD rehearsal |
| P33 | Credit Passport v1 | ✅ gate-passed (export matches ledger to the cent; ed25519-signed canonical JSON verifiable by a third party with only the document; tamper = dead signature; human PDF attached) |
| P34 | Lifeline (offline & low-bandwidth) | ✅ gate-passed (48h blackout drill: SMS lane parses+verifies, orders land dark, PWA queue double-delivery → exactly-once, ledger to the cent, escrow paused during blackout, dispute windows +48h; auto lite mode) |
| P35 | Channel sovereignty | ✅ gate-passed (channel-blindness is permanent CI law: zero WhatsApp refs in /core code + doors work with WhatsApp absent; sovereign PWA chat door at /c; identity escrow export+rebind; cost & quality-rating Watchman vitals with runbooks; eviction drill: blast → rebind → book on alternate door, 80% recovery vs ≥70% target) |
| P36 | Asymmetric client strategy | ✅ code gate-passed-mock (installability criteria asserted against the real manifest + real PNGs; service worker precaches shell and network-first caches the seller's day; earned-install offer never fires during Genesis, never to a buyer identity, capped at two offers by code AND a DB check constraint; installed-client drill: 48h dark → cached day readable → 6 completions queued → replayed twice → exactly-once, ledger to the cent; eviction recovery split by lane — 3 installed sellers on the web-push fast path, rest on SMS; seller_install_rate is a Watchman vital and renders per market on /cockpit) · ⏸ HUMAN-GATE: Lighthouse audit against a deployed origin + manual install on Android Chrome and iOS Safari |

## Test counts

203 tests green (last full run): core 135 · tests 28 (golden 6, markets 2, chaos 3, lifeline 5, sovereignty 4, pwa 4, scope 3, trivial 1) · packs 11 · adapters 10 · gateway 10 · web 8 · worker 1.
k6 load profiles (§5.5: normal day, Friday spike 20×, cruise surge 10×, viral seller 100×): tests/src/load/k6-profiles.js.
Load gate: 6000/6000 msgs at 100/s × 60 s, zero drops. CI: .github/workflows/ci.yml.

## Human gates (production-live checklist — founder-owned, run in parallel)

1. Company registration + Sycamore trademark/domain clearance.
2. Payment partner agreement (Lynk/CardNet) + counsel custody sign-off → unlocks P16 live.
3. WhatsApp Business API verification (start now; Meta takes weeks).
4. Meta + TikTok ad accounts as agency of record → unlocks P26 live.
5. Dummy Panel (5–8 people) + first 10 Genesis sellers → unlocks P13 gate.
6. 100 real paid orders, zero reconciliation breaks → Phase-2 exit.
7. Counsel verification per island before any dark market flips live.
8. Lighthouse PWA installability audit on a deployed origin, plus a manual install on
   Android Chrome and iOS Safari → unlocks the P36 install gate. A container cannot tap
   "Add to home screen"; the criteria themselves are asserted in CI (apps/web/src/pwa.test.ts).

## Phase-7 hardening checklist (scheduled, not vibes — triggers, not dates)

| Item | Trigger metric |
|---|---|
| SOC 2 Type I prep | first enterprise/hotel-chain seller OR >US$250k/yr GMV |
| Multi-region (2nd region + PG streaming replica promotion drill) | p95 cross-region latency >800ms for diaspora buyers OR >25k MAU |
| SLO 99.9 → 99.99 | >50k MAU or first SLA-bearing contract |
| SSO + hardware-key enforcement on founder cockpit | first hire with cockpit access |
| External pen test cadence annual → semi-annual | Phase 4 live (ad spend custody) |

---

# COMPLETION AUDIT — 2026-07-25 (read-only)

Every ✅ below was earned by opening the code AND executing its test in this
session. Nothing is marked from memory or from a plan file. Full suite command:
`pnpm -r test` → exit 0, 203 passed / 0 failed / 0 skipped (Postgres + Redis up).

## Scoreboard

| Section | ✅ BUILT | ⚠️ PARTIAL | ❌ MISSING | 🚧 HUMAN-GATE | Items |
|---|---|---|---|---|---|
| 1 Foundation | 7 | 3 | 1 | 0 | 11 |
| 2 Core product | 11 | 2 | 0 | 0 | 13 |
| 3 Money | 9 | 0 | 0 | 1 | 10 |
| 4 Marketplace | 8 | 2 | 1 | 0 | 11 |
| 5 Growth engines | 5 | 1 | 0 | 1 | 7 |
| 6 Agent crew | 9 | 1 | 0 | 0 | 10 |
| 7 Survival & scale | 12 | 0 | 0 | 0 | 12 |
| 8 Cross-cutting | 1 | 3 | 2 | 0 | 6 |
| **Total** | **62** | **12** | **4** | **2** | **80** |

**Code-complete: 95%. Verified by passing tests: 78%.**

(Code-complete counts every item whose code exists and runs — ✅ + ⚠️ + 🚧.
Verified counts only ✅: code opened AND its test executed green in this session.)

## Headline numbers, measured this session

| Gate | Command | Actual result |
|---|---|---|
| Oversell storm | `vitest run src/capacity/oversell.storm` | 500 concurrent → **exactly 12 held**, 488 waitlisted; kill-storm: 12 held / 10 conns killed / 478 waitlisted, zero oversell |
| Ledger fuzz | `vitest run src/ledger/ledger.property` | 10,000 sequences → 8,031 ops, 1,544 idempotent replays, 2,082 guard refusals; debits 978,289,687 = credits 978,289,687 → **drift exactly 0** |
| Settlement sim | `vitest run src/settlement` | 1,000 orders w/ referrals: captured 200,940,812 · refunded 13,050,869 · paid 165,344,092 · platform 18,788,531 · processor 3,757,320 — balanced |
| Injection suite | `vitest run src/conversations/injection` | **50 attacks, 0 unsafe (100%)**; zero unauthorized tool calls |
| Voice intent | `vitest run src/voice` | ≥90% asserted and passing over 20 patois fixtures — **mock ASR + scripted router**, exact % not emitted |
| Trust page budget | `pnpm --filter @sycamore/tests perf:trust` | **2,299 B transferred, interactive 506 ms** on throttled 3G (budget 100 KB / 2,000 ms) — Playwright, not Lighthouse; **not run by CI** |
| Hurricane rehearsal | `vitest run src/hurricane` | 226 ms total; every step inside runbook target (freeze 26/5000, rebook 72/30000, refund 118/30000, broadcast 2/5000, reopen 8/5000) |
| Dark-pack chaos | `vitest run src/markets/lockdown` | jm loads and operates with **all 13 dark packs corrupted** |
| Blackout drill | `vitest run src/lifeline/blackout-drill` | 48h dark: SMS orders land, double-delivered queue → exactly-once, ledger balanced, dispute window +48h |
| Channel blindness | `vitest run src/sovereignty/channel-blindness` | zero WhatsApp refs in /core code; doors work with the adapter absent |
| market_id coverage | schema scan of `core/src/db/migrations/*.ts` | **28 of 28 domain tables** carry `market_id` |

## Gap table (every ⚠️ and ❌)

| # | Item | Status | Where | What's missing | Effort |
|---|---|---|---|---|---|
| 1 | No hardcoded user-facing strings | ❌ | `core/src/{shoebox,hurricane,pulse,lifeline,agents}/*.ts` | **No localization engine module exists.** 53 hardcoded English sentences in core/src + 15 in apps/web HTML. Copy is either literal or ad-hoc LLM prompts embedding `copy_directives`. CLAUDE.md data rule says zero. | L |
| 2 | Design system package used everywhere | ❌ | `apps/web/app/**` (7 files) | No design package in `pnpm-workspace.yaml`. 13 distinct raw hex values inline; only 3 (`#0B1A26`, `#F4A24C`, `#F7F3EC`) are named tokens. Panel drifted to `#12283A` vs spec `#11283A`. Fraunces/Inter/Space Mono type system not implemented — everything is `system-ui`. | M |
| 3 | Fairness metric emitted to cockpit | ❌ | `core/src/discovery/ranking.ts:138`, `apps/web/app/cockpit/route.ts` | `newcomerShareOfFirstTimeBookings` is computed and unit-tested but has **zero callers outside tests**. Cockpit has 4 panels; fairness is not one. | S |
| 4 | Infra cost estimate vs <US$700/mo | ❌ | `SYCAMORE_BUILD.md:95,251` | Targets are stated (<$150/mo hosting, <$700/mo all-in). No computed estimate, no per-service breakdown, no artifact. | S |
| 5 | CLAUDE.md carries the install-prompt law | ⚠️ | `CLAUDE.md` | 7 laws, Four Packs, money rules, AGENT SESSION LAWS, SCOPE LAW all present. The P36 ASYMMETRIC CLIENTS rule exists only in SYCAMORE_PROMPTS.md + code comments. | S |
| 6 | Rollback script | ⚠️ | `core/src/canary/canary.ts` | Automatic rollback is code and is tested. There is no operator-facing rollback script or runbook file. | S |
| 7 | Observability: traces | ⚠️ | `core/src/observability/`, `apps/gateway/package.json:15` | Logs ✅ and `/metrics` ✅ (`apps/gateway/src/server.ts:28`). **No tracing at all** — `@opentelemetry/api` is a declared dependency that is never imported by any source file (also a law-7 violation: an unjustified moving part). | M |
| 8 | Voice ≥90% intent accuracy | ⚠️ | `core/src/voice/voice.integration.test.ts` | Passes, but ASR is `mockAsr` returning fixed transcripts and the router is `scriptedRouter()`. This measures the classifier over pre-written text, not speech recognition. Real-model accuracy is explicitly deferred. | M |
| 9 | Trust page budget as a CI check | ⚠️ | `.github/workflows/ci.yml`, `tests/src/perf/trust-page-budget.ts` | Script passes when run by hand; CI runs only lint/format/typecheck/test. The budget can regress without failing a build. No Lighthouse anywhere. | S |
| 10 | Device-cluster fraud detection | ⚠️ | `core/src/trust/reviews.ts:70-95` | Burst-window and competitor-hit signals exist and are red-teamed. There is no device/IP clustering — **no device or IP column exists in the schema**. | M |
| 11 | No code path suppresses a genuine review | ⚠️ | `core/src/trust/reviews.ts` | True in fact: `deleteFrom` appears exactly once in all of core (`capacity/engine.ts:72`, waitlist) and never on `reviews`. But **no test asserts it**, so nothing stops a future path from appearing. | S |
| 12 | Sellers never touch an ad account | ⚠️ | `core/src/pulse/coop.ts:17`, `adapters/src/ads/types.ts` | Agency-of-record is the architecture and co-op attribution is tested. No test asserts the absence of a seller→ad-account path. | S |
| 13 | Founder cockpit renders all of the above | ⚠️ | `apps/web/app/cockpit/route.ts` | Renders 4 panels: report-cards (Watchman/Fixer/Builder only), install-rate, incidents, radar. **No panel for Listener, Mentor, Bursar, Herald, Chairman memo, fairness, or money.** | M |
| 14 | Every Constitution law has an enforcing test | ⚠️ | see law→test map below | Laws 1,2,3,5 mapped. Law 4 partial (explain data exists, no user-facing surface). Laws 6 and 7 have no enforcing test. | M |
| 15 | k6 load profiles runnable | ⚠️ | `tests/src/load/k6-profiles.js` | File defines all four profiles. **k6 is not installed** in this environment and is not in CI; not executed this session. | S |
| 16 | Coverage % on /core | ⚠️ | — | **Unmeasured.** No coverage provider is a dependency of any Sycamore package (`@vitest/coverage-v8` exists only under `haven/`, which is off-limits). Cannot be reported without adding a dependency. | S |

## Constitution law → enforcing test

| Law | Enforcing test | Verified |
|---|---|---|
| 1 One door | `core/src/genesis/genesis.integration.test.ts` :: "a synthetic seller goes from first message to approved broadcast in ONE session"; `core/src/voice/voice.integration.test.ts` :: 20-fixture gate | ✅ |
| 2 Thumbs-up governance | `core/src/agents/builder.integration.test.ts` :: "a good change ships with founder tap…"; `phase5` :: "Chairman … ZERO spend authority" | ✅ |
| 3 Plain-number ledgers | `core/src/shoebox/shoebox.integration.test.ts` :: "the message passes the pack language rules" | ✅ |
| 4 Show-me-why | `core/src/discovery/ranking.test.ts` (explain components); `agents/keeper` :: "every line cites a data source" | ⚠️ data only — no one-tap surface |
| 5 Trust is never traded | `studio` :: "PERMANENT CI CHECK: no source photo → NO ad"; `reviews` red-team ×3; `phase5` :: "undisclosed forum post is refused"; `adapters/llm` :: PII/DPA gate | ✅ |
| 6 Hold the trust, never the float | — | ❌ no test |
| 7 Boring by default | — | ❌ no test; `@opentelemetry/api` is an unused dependency |

## Concerns found that are NOT on the checklist

1. **A Postgres outage turns CI green while skipping every money gate.** 35 test
   files are wrapped in `describe.runIf(reachable)`. Proven this session: with
   Postgres stopped, `vitest run src/capacity/oversell.storm` reports
   "1 skipped" and **exits 0**. If the CI Postgres service fails to start, the
   build passes with the storm, the ledger fuzz, and every drill silently not
   run. The guard needs to be "skip locally, hard-fail in CI".
2. **`tests/` now depends on `apps/web`** (added during P36 so the cockpit gate
   renders the real route). A test package reaching into an app package is a
   dependency direction worth a deliberate decision, not a side effect.
3. **The P31 core-diff gate is pinned to fixed commits** (`jm-only-baseline.txt`
   / `jm-plus-do.txt`). It proves history, not the present: core changed in P34,
   P35 and P36 without that gate being able to notice.
4. **`v1.0-code-complete` and `v1.1-survivability` are not real git tags** —
   the remote refuses tag pushes, so they exist only as commit pointers in prose
   here (1483e10, 6007270). Nothing enforces them.
5. **The 10,000-op fuzz is single-process.** It proves arithmetic, not
   concurrency, on the ledger. The only true concurrency proof in the repo is
   the capacity storm.
