# SYCAMORE_FULL_BUILD_DIRECTIVE.md — v1.0
### Standing order: build to CODE-COMPLETE. Stop only at HUMAN GATES.

Paste the DIRECTIVE below into Claude Code after P6 passes. Keep this file in repo root.

---

## THE DIRECTIVE (paste this)

You are executing the full Sycamore build per SYCAMORE_BUILD.md and SYCAMORE_PROMPTS.md.
New standing orders:

1. **Continuous execution.** Proceed through P7→P33 in order WITHOUT waiting for
   per-prompt approval. For each prompt: implement → write tests → run tests → run the
   gate's automated checks → commit `P<n>: <name> — gate passed (mock)` → continue.
   If a gate fails, fix and re-run before proceeding. Never skip a failing gate.

2. **Mock-complete standard.** Every external dependency runs against its mock/sandbox
   adapter (mock-pay full lifecycle, mock-channel, mock ad APIs, ASR fixtures). The
   deliverable is: ALL code written, ALL automated gates green, end-to-end golden paths
   passing on mocks. Tag the repo `v1.0-code-complete` when P33's automated checks pass.

3. **HUMAN GATES — pause and report, do not fake.** When a prompt reaches a step that
   requires real-world input, implement everything up to the boundary, mark it
   `HUMAN-GATE: <what's needed>` in BUILD_STATUS.md, and continue to the next prompt.
   The human gates are exactly: P13 (10 real sellers), P16 (payment credentials +
   counsel custody sign-off), P26 (ad account credentials + live co-op), Phase-2 exit
   (100 real paid orders), P30 partial (live channel pilots), P32 (timed prod rehearsal).
   Everything else is yours.

4. **Insert new prompt P6.5 — MARKET REGISTRY & REGION LOCKDOWN (do this first):**
   a. `markets` table gains `status: live | dark | retired`. Exactly one market is
      `live` at v1.0: `jm`.
   b. Author Context Packs for the English-speaking Caribbean, all `dark`:
      `tt` (Trinidad & Tobago), `bb` (Barbados), `bs` (Bahamas), `gy` (Guyana),
      `bz` (Belize), `lc` (St. Lucia), `gd` (Grenada), `vc` (St. Vincent),
      `ag` (Antigua & Barbuda), `kn` (St. Kitts & Nevis), `dm` (Dominica).
      Each pack: currency, holidays, payment-adapter placeholder, compliance block
      with `verified_by_counsel: false` (a live-flip is BLOCKED while false).
      Existing `do.yaml` and `mx.yaml` remain in repo as `dark`, non-Anglo wave-2.
   c. **Lockdown semantics (test all of these):** a dark market's routes return 404;
      its jobs/workers no-op; its signals are ignored by Pulse; it appears in NO
      buyer-facing surface; a dark market's data cannot be written by any code path;
      cross-market query isolation (P2) holds under fuzzing. A dark market must be
      provably incapable of affecting live operations — including under error paths.
   d. **Flip ceremony:** going dark→live requires: founder feature-flag + pack
      `verified_by_counsel: true` + payment adapter passing sandbox suite + the P31
      empty-core-diff check. Anything less, the flip throws.
   e. Gate: chaos test — corrupt every dark pack on purpose; `jm` operations must be
      entirely unaffected (zero errors, zero latency change).

5. **Enterprise posture at code-complete:** all BUILD §5 automated suites wired into CI
   (money invariants, oversell storm, injection suite, load profiles as runnable k6
   scripts, chaos scripts as runnable drills), Phase-7 hardening checklist stubbed in
   BUILD_STATUS.md with trigger metrics (SOC 2 prep, multi-region, 99.9→99.99 SLO,
   SSO on cockpit) — scheduled, not vibes.

6. **Report format.** Maintain BUILD_STATUS.md: per-prompt status (✅ gate-passed-mock /
   ⏸ human-gate / 🔧 in progress), test counts, and the single honest line at top:
   "Code-complete: X%. Production-live requires the HUMAN GATES below."

---

## WHAT "DONE" MEANS — THE TWO FINISH LINES (founder's copy, plain words)

**Finish line 1 — CODE-COMPLETE (Claude Code delivers this alone):**
100% of the platform's code: Genesis, Counter, Vault, Pulse, Discovery, Studio, Trust,
Keeper crew, Mentor, Shoebox, Hurricane Mode, Credit Passport, the full Caribbean market
registry with lockdown — every automated gate green on mocks. This is the whole machine,
assembled and bench-tested.

**Finish line 2 — PRODUCTION-LIVE (only you can clear these; start them NOW, in parallel):**
1. Company registration + Sycamore trademark/domain clearance.
2. Payment partner agreement (Lynk/CardNet) + counsel sign-off on custody → unlocks P16.
3. WhatsApp Business API verification (Meta business verification takes weeks — start today).
4. Meta + TikTok ad accounts as agency of record → unlocks P26.
5. Recruit the Dummy Panel (5–8 real people) and the first 10 Genesis sellers → unlocks P13.
6. 100 real paid orders, zero reconciliation breaks → Phase 2 exit.
7. Counsel verification per island before ANY dark market flips live.

No vendor on earth can sell you items 1–7 pre-done. The platform is "100% complete" the
day both lines are crossed — and line 2's clock is driven by paperwork and people, which
is exactly why it should run WHILE Claude Code finishes line 1.

---

## ONE STRATEGY NOTE (read once, then decide)
Building ALL Anglo-Caribbean packs now is cheap and correct — that's what packs are for.
LAUNCHING them simultaneously is a different decision: the density strategy (win Kingston,
then Portmore, then the island) is still what makes the flywheel spin. The lockdown you
asked for is the right instrument either way: everything loaded, one market live, eleven
flips waiting on your finger — each flip a deliberate act from strength, never a default.
