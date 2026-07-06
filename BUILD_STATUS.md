# BUILD_STATUS.md — Sycamore

**Code-complete: 31% (P0–P7 of 35 prompts; Phase 0 done). Production-live requires the HUMAN GATES below.**

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
| P10–P12 | Conversations → Voice pipeline | 🔧 P10 next |
| P13 | Genesis flow | ⬜ code queued · ⏸ HUMAN-GATE: 10 real sellers, voice-note-only |
| P14 | Trust pages + PWA shell | ⬜ queued |
| P15 | Double-entry ledger | ⬜ queued |
| P16 | Payment adapter + links | ⬜ code queued · ⏸ HUMAN-GATE: payment credentials + counsel custody sign-off |
| P17–P19 | Splits → Shoebox | ⬜ queued · Phase-2 exit ⏸ HUMAN-GATE: 100 real paid orders |
| P20–P25 | Marketplace, Pulse, Studio | ⬜ queued |
| P26 | Ad publishing + co-op pools | ⬜ code queued · ⏸ HUMAN-GATE: ad credentials + live co-op ≥20 sellers |
| P27–P29 | Watchman → Builder/Bursar | ⬜ queued |
| P30 | Herald + Chairman + Cockpit | ⬜ queued · ⏸ HUMAN-GATE (partial): live channel pilots |
| P31 | Market #2 by pack alone | ⬜ queued |
| P32 | Hurricane Mode + chaos program | ⬜ code queued · ⏸ HUMAN-GATE: timed prod rehearsal |
| P33 | Credit Passport v1 | ⬜ queued |

## Test counts

67 tests green (last full run): core 43 · packs 11 · adapters 10 · gateway 10 · trivial 3.
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
