# BUILD_STATUS.md — Sycamore

**Code-complete: 80% (P0–P26 of 35 prompts, mock-complete). Production-live requires the HUMAN GATES below.**

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
| P27–P29 | Watchman → Builder/Bursar | ⬜ queued |
| P30 | Herald + Chairman + Cockpit | ⬜ queued · ⏸ HUMAN-GATE (partial): live channel pilots |
| P31 | Market #2 by pack alone | ⬜ queued |
| P32 | Hurricane Mode + chaos program | ⬜ code queued · ⏸ HUMAN-GATE: timed prod rehearsal |
| P33 | Credit Passport v1 | ⬜ queued |

## Test counts

139 tests green (last full run): core 99 · golden 6 · packs 11 · adapters 10 · gateway 10 · trivial 3.
Load gate: 6000/6000 msgs at 100/s × 60 s, zero drops. CI: .github/workflows/ci.yml.

## Human gates (production-live checklist — founder-owned, run in parallel)

1. Company registration + Sycamore trademark/domain clearance.
2. Payment partner agreement (Lynk/CardNet) + counsel custody sign-off → unlocks P16 live.
3. WhatsApp Business API verification (start now; Meta takes weeks).
4. Meta + TikTok ad accounts as agency of record → unlocks P26 live.
5. Dummy Panel (5–8 people) + first 10 Genesis sellers → unlocks P13 gate.
6. 100 real paid orders, zero reconciliation breaks → Phase-2 exit.
7. Counsel verification per island before any dark market flips live.

## Phase-7 hardening checklist (scheduled, not vibes — triggers, not dates)

| Item | Trigger metric |
|---|---|
| SOC 2 Type I prep | first enterprise/hotel-chain seller OR >US$250k/yr GMV |
| Multi-region (2nd region + PG streaming replica promotion drill) | p95 cross-region latency >800ms for diaspora buyers OR >25k MAU |
| SLO 99.9 → 99.99 | >50k MAU or first SLA-bearing contract |
| SSO + hardware-key enforcement on founder cockpit | first hire with cockpit access |
| External pen test cadence annual → semi-annual | Phase 4 live (ad spend custody) |
