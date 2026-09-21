# HANDOFF.md — Fullburn (DONE.md §5)

**Status: Phase 0 OPEN. `npm run done -- phase` exits 1. No PR. No dollar has ever been live.**

This file is written by DONE.md §5. A new session starts by reading DONE.md,
CLAUDE.md, this file — and then re-running `npm run done -- <current phase>` to
establish state from evidence rather than from this prose. The long-form
narrative handoff (rulings history, per-round dispositions, numbers by commit)
lives at `fullburn/reports/HANDOFF.md`; this file is the §5 contract and wins
on any disagreement about *state*.

## Tree and branch

- verified tree: `860de6b6ac8ceab3cbd682910782a2317555d770` (hash of `git ls-files -s` over `VERIFIED_TREE_SCOPE`; `reports/`, `APPROVALS/` and this file are outside it, so the record commit does not move it)
- branch: `claude/fullburn-engine-spec-r7v5lg`
- phase: `0`
- latest `done` report: `fullburn/reports/DONE_phase0_7a89aee21e85.md` — **exit 1, INCOMPLETE** (previous tree; C5 there read `226 caught, 0 survived, 3 stale` — AD-02/03/04, repaired in the tree above)
- `done` run at the tree above: `fullburn/reports/DONE_phase0_860de6b6ac8c.md` — **exit 1, INCOMPLETE**, 15 failing rows, all human-owned or unmeasurable here (C1 live halves, C2, C3, C4, C7-lint, C8-owed, C8-identity, C10); C5 **PASS** — `231 mutations: 231 caught, 0 survived, 0 stale`, meta-check ok (2026-09-21 00:29)

## Open findings (immutable IDs; nothing below is closed without the test that proves it)

| ID | Severity | Status |
|---|---|---|
| L37 / H19 | **1** | `main` is unprotected; a gate-free PR reports `mergeable_state: clean`. Human-only. Outranks L4 by ruling. Re-measure after the settings land: require `blocked`. |
| L4 / H2 | 1 | PRIMARY spend control (AI Gateway cap) designed, unprovisioned. Human/infrastructure. |
| R14-01 | 1 → ruled | Ledger demoted to advisory; §4 red-proof executed (`gateway-cap-primary.test.ts`); still BLOCKING on L4/H2. |
| L8 | 2 | Builder and adversary are both Claude (Law 11). `engine-adversary` self-reported "Claude Fable 5.1 — the rule is violated" on 2026-09-20. Needs a non-Claude route: `ox-alpha` (needs `OPENROUTER_API_KEY`) or a codex hand-off (H6b). |
| L39 | 2 → discovery resolved | Adversary was not a registered agent from a repo-root session; a gated mirror at `.claude/agents/` fixed it and registration was OBSERVED (readiness check answered on 2026-09-20). Family half stays open under L8. |
| L40 | 2 | The completion checker nested inside its own suite under DN-14 on its first run; removed structurally (DN-15). Its first complete run found three stale harness entries (AD-02/03/04) that two commits of green suite had not; the table is now checked against the tree in the default suite (`staleEntries`, SE-01) and the checker names what it finds (DN-16). Two builder process slips recorded in the row. |
| DONE §2.1.7 lint | 3 | No lint tool is configured; C7-lint FAILS by construction until a human chooses one. |
| DONE §2.1.3 cross-family | 1 | No report carries a `Reviewer-family:` line naming a non-Claude family against the current tree. |
| DONE §2.1.8 identity | 1 | Approvals cannot be shown to carry the human's authenticated identity without branch protection + a merged PR. |
| DONE §2.1.10 ack | — | `APPROVALS/GATE_ACK_phase0.md` does not exist. Silence is not consent. |

## Standing rulings issued since the last handoff (for the human to append to DONE.md §4)

13. **The adversary is only an adversary if the harness can find it — and where it is found must be as gated as where it is reviewed.** (2026-09-20, L39)
14. **First action of every session: prove the checkout is this build.** `git log -1` names a Fullburn commit and `fullburn/PHASE` exists, or stop; nothing is pushed until it does. A container started on `main` under this branch's name on 2026-09-20. (CLAUDE.md)
15. **The completion checker never nests.** It refuses to exist inside a test worker or another `done` run before reading an argument; every child carries the marker. (2026-09-20, L40)
16. **A gate that passes on empty output is not a gate.** The builder's own pre-commit probe stage crashed silently and its "no survivors" check passed vacuously (L40). Every shell gate must assert the positive evidence it expects, not the absence of failures.
17. **A count of mutation entries is a count of entries that still match the tree.** Three entries went stale under a neighbouring-line edit and the suite stayed green for two commits; the table is now placed against the tree on every `npm test`, and a harness failure is reported by the names of its members, never only their number. (2026-09-20, L40)

## Class-2 sets owed

- against `eb0775f` (Phase 0 base): **71** entries — `node fullburn/engine/scripts/owed-approvals.mjs . eb0775f`
- against `ba1a6ca` (merge-base with `main`, the range the `done` checker measures): **110** entries
- all sets UNCOMMITTED, deliberately, until CODEOWNERS enforcement exists (L27/L37). Never agent-authored.

## The exact next command

```
npm run done -- phase
```

Measured 2026-09-21 at this tree: exit 1, with C2, C3, C4, C7-lint, C8, C10 and the unmeasurable C1 rows failing; C5 PASS at 231/231 with the meta-check. Nothing left failing is the builder's to fix. Then, in order: the human's H19 settings → re-measure §7.0 (`blocked`) → `Reviewer-family:`-bearing cross-family read on this tree → r15 → `npm run done -- phase` exits 0 → gate ack.

## UNVERIFIED CLAIMS

Things asserted this session that are NOT backed by an executed check:

1. **How r8–r14 were produced.** Inferred from the reports' own headers (same-family, sandbox-executed, "two previous attempts died") that they were separate Claude contexts spawned from the builder. Not verifiable from this container's single transcript.
2. **`50c99e8`'s commit message says its DN entries were probed before committing.** They were not — the probe stage crashed on a misplaced env prefix and the gate passed on empty output. The DN entries were measured only by the `done` run's C5, which reported all of them CAUGHT — and reported AD-02/03/04 stale, which is what that same commit had broken. The five entries touched since (AD-02/03/04, SE-01, DN-16) WERE probed, with the probe's output asserted non-empty and each verdict read.
3. **Adversary registration** was observed by spawning it once (2026-09-20); the `done` checker cannot re-measure registration, only the mirror's integrity.
4. **The nested-run guard** (`VITEST` / `FULLBURN_DONE_ACTIVE`) is proven by the integration test with the worker's env; whether vitest sets `VITEST` in every pool mode used in CI is assumed from the forks pool used here.
5. **Lint** — "no tool configured" is a fact; that §2.1.7 intends a specific linter is not known.
6. ~~C5 at the current tree is expected, not measured~~ — MEASURED 2026-09-21: `reports/DONE_phase0_860de6b6ac8c.md`, C5 PASS 231/231.
7. **Commit `298c9f9`'s message and the first push of this file named the tree `d82f5342…`.** That figure was computed with git's working directory at `fullburn/`, where the scope's root-relative pathspecs resolve to nothing; the checker computes from the repository root and prints `860de6b6…`. Corrected here; the commit message cannot be.
