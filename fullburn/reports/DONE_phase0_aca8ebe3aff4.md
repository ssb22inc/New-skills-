# DONE — Phase 0 — INCOMPLETE

- target: `phase`
- tree: `aca8ebe3aff4c2ed38795794fecbb431a1b47470`
- branch: `claude/fullburn-engine-spec-r7v5lg`
- started: 2026-10-10T12:37:44.565Z
- authority: DONE.md §3 — this file is the checker's output, re-measured; it reads no report or ledger row as evidence

## Meta-check

ok   the checker refuses a dirty tree and flips a condition PASS→FAIL on a planted failure

## Conditions

| # | condition | status | command | observed |
|---|---|---|---|---|
| C1 | §2.1.1 every deliverable and AC exercised by execution | **FAIL** | — | 10/15 requirements exercised and passing |
| ↳ AC1-contract | AC1 hello-world call goes through llm(), the only call path (contract half) | **PASS** | `vitest run engine/test/gateway.test.ts` | 13 passed, 0 failed (13) |
| ↳ AC1-live | AC1 the call round-trips through the REAL AI Gateway and appears in the REAL Langfuse project | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: needs H2 (Gateway) and H5 (Langfuse) provisioned — ledger L1 |
| ↳ AC2 | AC2 rebinding a role frontier → open-source passes its evals and serves with zero code change | **PASS** | `vitest run engine/test/eval-rebind.test.ts config/test/models.test.ts` | 29 passed, 0 failed (29) |
| ↳ AC3 | AC3 the Grade Registry computes and publishes a grade from seeded data | **PASS** | `vitest run engine/test/grade-registry.test.ts` | 16 passed, 0 failed (16) |
| ↳ AC4-gate | AC4 the adversary-report gate refuses a missing, stale or FAIL report (CLI executed against a real repo) | **PASS** | `vitest run engine/test/integration/gate-cli.test.ts` | 22 passed, 0 failed (22) |
| ↳ AC4-enforced | AC4 CI actually BLOCKS a PR missing an adversary report | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: main has no branch protection — measured 2026-08-22, ledger L37; a required check cannot be observed from the sandbox |
| ↳ AC5 | AC5 cap constants exist and runtime mutation fails | **PASS** | `vitest run config/test/caps.test.ts` | 7 passed, 0 failed (7) |
| ↳ D-switchboard | deliverable: switchboard skeleton — US + Meta on, everything else locked and structurally inert | **PASS** | `vitest run config/test/switchboard.test.ts` | 14 passed, 0 failed (14) |
| ↳ D-vault | deliverable: OAuth secrets vault with a leak check executed as a CI stage | **PASS** | `vitest run engine/test/vault.test.ts engine/test/integration/leak-cli.test.ts` | 12 passed, 0 failed (12) |
| ↳ D-vault-rotation | deliverable: vault is encrypted and auto-rotated — the mechanism (AES-256-GCM at rest, tenant-bound AAD, scheduled rotation, breach re-issue, KEK re-key) | **PASS** | `vitest run engine/test/vault-crypto.test.ts` | 35 passed, 0 failed (35) |
| ↳ D-vault-live | deliverable: the deployed Worker holds its KEK as a secret binding, its sealed records in a Durable Object CipherStore (compare-and-swap; Workers KV has none — X7-12), and runs rotateDue on a cron trigger | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: H7 — the KEK, the Durable Object store and the cron trigger are infrastructure, not observable from the sandbox |
| ↳ D-adversary | deliverable: CLAUDE.md + adversary agent installed and discoverable | **PASS** | `vitest run engine/test/invariants/invariants.test.ts -t discovery mirror` | 4 passed, 0 failed (42) |
| ↳ D-ci | deliverable: CI pipeline — every workflow SHA-pinned, permission-declared, scope-filtered inside the job | **PASS** | `vitest run engine/test/invariants/invariants.test.ts -t workflow hygiene` | 4 passed, 0 failed (42) |
| ↳ D-warehouse | deliverable: ClickHouse Cloud + Airbyte provisioned | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: H3/H4 — infrastructure, not observable from the sandbox |
| ↳ D-name | deliverable: fullburn.ai registered; trademark check completed | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: human/legal action outside the repository |
| C2 | §2.1.2 (amended 2026-10-06, reviewer GPT-6 Luna since 2026-10-09) adversary round PASS against this tree | **FAIL** | `reviewerRoundCondition(C3)` | no cross-family reviewer (GPT-6 Luna) PASS at this tree — ADVERSARY_REPORT_phase0.x1.md: report verified tree abda5d88c24fa81a8675c3519b7181e110cf585e but current fullburn tree is aca8ebe3aff4c2ed38795794fecbb431a1b47470 — code changed after the adversary judged it; re-run the adversary |
| C3 | §2.1.3 cross-family read PASS against the SAME tree, artifact committed | **FAIL** | `checkAdversaryReport(non-Claude reports only, tree aca8ebe3aff4)` | ADVERSARY_REPORT_phase0.x1.md: report verified tree abda5d88c24fa81a8675c3519b7181e110cf585e but current fullburn tree is aca8ebe3aff4c2ed38795794fecbb431a1b47470 — code changed after the adversary judged it; re-run the adversary |
| C4 | §2.1.4 zero open findings at any severity (deferrals only by a written ruling in APPROVALS/) | **FAIL** | `derived from C2 ∧ C3; APPROVALS/*.md scanned for `defer-finding:` lines` | a round against this tree is not PASS, so findings are open; deferrals on file: none |
| C5 | §2.1.5 mutation harness: 0 survived, 0 stale, meta-check passed in the same run | **PASS** | `node engine/scripts/mutate.mjs` | meta-check ok; 513 mutations: 513 caught, 0 survived, 0 stale |
| C6 | §2.1.6 guard population enumerated from source, one-to-one coverage, every guard driven | **PASS** | `vitest run engine/test/invariants -t 'every money-path guard is still reachable\|every enumerated money-path guard has its own disabling mutation entry'` | 2 passed, 0 failed (40); each guard's own entry is CAUGHT in C5 |
| C7 | §2.1.7 suite green under ≥5 seeds; typecheck, lint, leak-check clean; SIGINT drill | **PASS** | — | 9/9 sub-conditions passing |
| ↳ C7-seed-7 | full suite, shuffled seed 7 | **PASS** | `vitest run --sequence.shuffle --sequence.seed=7` | 594 passed, 0 failed (594) |
| ↳ C7-seed-42 | full suite, shuffled seed 42 | **PASS** | `vitest run --sequence.shuffle --sequence.seed=42` | 594 passed, 0 failed (594) |
| ↳ C7-seed-1234 | full suite, shuffled seed 1234 | **PASS** | `vitest run --sequence.shuffle --sequence.seed=1234` | 594 passed, 0 failed (594) |
| ↳ C7-seed-2026 | full suite, shuffled seed 2026 | **PASS** | `vitest run --sequence.shuffle --sequence.seed=2026` | 594 passed, 0 failed (594) |
| ↳ C7-seed-9001 | full suite, shuffled seed 9001 | **PASS** | `vitest run --sequence.shuffle --sequence.seed=9001` | 594 passed, 0 failed (594) |
| ↳ C7-typecheck | typecheck | **PASS** | `tsc -p tsconfig.json --noEmit` | clean |
| ↳ C7-lint | lint (eslint, type-aware — human ruling 2026-09-22) | **PASS** | `npm run lint` | clean (eslint, type-aware: no-floating-promises, no-misused-promises) |
| ↳ C7-leak | leak + structural scan (advisory secrets, primary structure — L36) | **PASS** | `node engine/scripts/leak-check.mjs <repo>` | leak/structural scan: clean |
| ↳ C7-drill | SIGINT drill: no source file mutated after the signal | **PASS** | `vitest run --config vitest.drill.config.ts` | 2 passed, 0 failed |
| C8 | §2.1.8 (amended 2026-10-06) every money-cap path approved by the human, CODEOWNERS 100% of Class-2 | **PASS** | — | 2/2 sub-conditions passing |
| ↳ C8-owed | money-cap approvals against base 60fef14756bb — the class-2 gate's own decision | **PASS** | `checkMoneyCapGate(diff 60fef14756bb...HEAD, APPROVALS/, GitHub commit verification)` | no Class-2 changes — 0 transition(s) in range |
| ↳ C8-codeowners | CODEOWNERS covers 100% of tracked Class-2 files | **PASS** | `git ls-files \| isClass2 \| codeownersCovers` | 179/179 covered |
| C9 | §2.1.9 every ledger/CLAUDE.md behavioural row carries a test that fails when stale | **PASS** | `vitest run engine/test/invariants -t 'every behavioural claim in the ledger still holds'` | 1 passed, 0 failed (40) |
| C10 | §2.1.10 (amended 2026-10-06) gate ack = the cross-family adversary's PASS at this tree | **FAIL** | `automatedGateAck(C3)` | the cross-family adversary has not passed this tree (C3 FAIL) — no automated ack |

## Status

**INCOMPLETE — 10 failing:** C1, AC1-live, AC4-enforced, D-vault-live, D-warehouse, D-name, C2, C3, C4, C10

This is a status update, not a completion claim (DONE.md §3).
