# DONE — Phase 0 — INCOMPLETE

- target: `phase`
- tree: `abda5d88c24fa81a8675c3519b7181e110cf585e`
- branch: `claude/fullburn-engine-spec-r7v5lg`
- started: 2026-09-22T08:38:30.449Z
- authority: DONE.md §3 — this file is the checker's output, re-measured; it reads no report or ledger row as evidence

## Meta-check

ok   the checker refuses a dirty tree and flips a condition PASS→FAIL on a planted failure

## Conditions

| # | condition | status | command | observed |
|---|---|---|---|---|
| C1 | §2.1.1 every deliverable and AC exercised by execution | **FAIL** | — | 9/14 requirements exercised and passing |
| ↳ AC1-contract | AC1 hello-world call goes through llm(), the only call path (contract half) | **PASS** | `vitest run engine/test/gateway.test.ts` | 11 passed, 0 failed (11) |
| ↳ AC1-live | AC1 the call round-trips through the REAL AI Gateway and appears in the REAL Langfuse project | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: needs H2 (Gateway) and H5 (Langfuse) provisioned — ledger L1 |
| ↳ AC2 | AC2 rebinding a role frontier → open-source passes its evals and serves with zero code change | **PASS** | `vitest run engine/test/eval-rebind.test.ts config/test/models.test.ts` | 11 passed, 0 failed (11) |
| ↳ AC3 | AC3 the Grade Registry computes and publishes a grade from seeded data | **PASS** | `vitest run engine/test/grade-registry.test.ts` | 8 passed, 0 failed (8) |
| ↳ AC4-gate | AC4 the adversary-report gate refuses a missing, stale or FAIL report (CLI executed against a real repo) | **PASS** | `vitest run engine/test/integration/gate-cli.test.ts` | 15 passed, 0 failed (15) |
| ↳ AC4-enforced | AC4 CI actually BLOCKS a PR missing an adversary report | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: main has no branch protection — measured 2026-08-22, ledger L37; a required check cannot be observed from the sandbox |
| ↳ AC5 | AC5 cap constants exist and runtime mutation fails | **PASS** | `vitest run config/test/caps.test.ts` | 5 passed, 0 failed (5) |
| ↳ D-switchboard | deliverable: switchboard skeleton — US + Meta on, everything else locked and structurally inert | **PASS** | `vitest run config/test/switchboard.test.ts` | 6 passed, 0 failed (6) |
| ↳ D-vault | deliverable: OAuth secrets vault with a leak check executed as a CI stage | **PASS** | `vitest run engine/test/vault.test.ts engine/test/integration/leak-cli.test.ts` | 10 passed, 0 failed (10) |
| ↳ D-vault-rotation | deliverable: vault is encrypted and auto-rotated | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: unmet half, tracked since F10 — no rotation exists to exercise |
| ↳ D-adversary | deliverable: CLAUDE.md + adversary agent installed and discoverable | **PASS** | `vitest run engine/test/invariants/invariants.test.ts -t discovery mirror` | 4 passed, 0 failed (35) |
| ↳ D-ci | deliverable: CI pipeline — every workflow SHA-pinned, permission-declared, scope-filtered inside the job | **PASS** | `vitest run engine/test/invariants/invariants.test.ts -t workflow hygiene` | 3 passed, 0 failed (35) |
| ↳ D-warehouse | deliverable: ClickHouse Cloud + Airbyte provisioned | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: H3/H4 — infrastructure, not observable from the sandbox |
| ↳ D-name | deliverable: fullburn.ai registered; trademark check completed | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: human/legal action outside the repository |
| C2 | §2.1.2 same-family adversary round PASS against this tree | **FAIL** | `checkAdversaryReport(phase 0, 14 report(s), tree abda5d88c24f)` | ADVERSARY_REPORT_phase0.r9.md: report has no readable 'verified-tree:' binding in its first 10 lines at column 0 — it cannot be shown to be about a different tree, so it blocks (fail closed) (unresolved business on this tree blocks regardless of any PASS) |
| C3 | §2.1.3 cross-family read PASS against the SAME tree, artifact committed | **FAIL** | `checkAdversaryReport(non-Claude reports only, tree abda5d88c24f)` | no report under reports/ carries a `Reviewer-family:` line naming a non-Claude family (14 report(s) read) |
| C4 | §2.1.4 zero open findings at any severity (deferrals only by a written ruling in APPROVALS/) | **FAIL** | `derived from C2 ∧ C3; APPROVALS/*.md scanned for `defer-finding:` lines` | a round against this tree is not PASS, so findings are open; deferrals on file: none |
| C5 | §2.1.5 mutation harness: 0 survived, 0 stale, meta-check passed in the same run | **PASS** | `node engine/scripts/mutate.mjs` | meta-check ok; 240 mutations: 240 caught, 0 survived, 0 stale |
| C6 | §2.1.6 guard population enumerated from source, one-to-one coverage, every guard driven | **PASS** | `vitest run engine/test/invariants -t 'every money-path guard is still reachable'` | 1 passed, 0 failed (35); the 'disabled individually and caught' half is C5's per-guard entries |
| C7 | §2.1.7 suite green under ≥5 seeds; typecheck, lint, leak-check clean; SIGINT drill | **FAIL** | — | 8/9 sub-conditions passing |
| ↳ C7-seed-7 | full suite, shuffled seed 7 | **PASS** | `vitest run --sequence.shuffle --sequence.seed=7` | 450 passed, 0 failed (450) |
| ↳ C7-seed-42 | full suite, shuffled seed 42 | **PASS** | `vitest run --sequence.shuffle --sequence.seed=42` | 450 passed, 0 failed (450) |
| ↳ C7-seed-1234 | full suite, shuffled seed 1234 | **PASS** | `vitest run --sequence.shuffle --sequence.seed=1234` | 450 passed, 0 failed (450) |
| ↳ C7-seed-2026 | full suite, shuffled seed 2026 | **PASS** | `vitest run --sequence.shuffle --sequence.seed=2026` | 450 passed, 0 failed (450) |
| ↳ C7-seed-9001 | full suite, shuffled seed 9001 | **PASS** | `vitest run --sequence.shuffle --sequence.seed=9001` | 450 passed, 0 failed (450) |
| ↳ C7-typecheck | typecheck | **PASS** | `tsc -p tsconfig.json --noEmit` | clean |
| ↳ C7-lint | lint (eslint, type-aware — human ruling 2026-09-22) | **PASS** | `npm run lint` | clean (eslint, type-aware: no-floating-promises, no-misused-promises) |
| ↳ C7-leak | leak + structural scan (advisory secrets, primary structure — L36) | **FAIL** | `node engine/scripts/leak-check.mjs <repo>` | LEAK/STRUCTURAL SCAN FAIL: |
| ↳ C7-drill | SIGINT drill: no source file mutated after the signal | **PASS** | `vitest run --config vitest.drill.config.ts` | 2 passed, 0 failed |
| C8 | §2.1.8 every Class-2 path approved under the human's identity, CODEOWNERS 100%, CI fails closed | **FAIL** | — | 1/3 sub-conditions passing |
| ↳ C8-owed | Class-2 approvals owed against base ba1a6ca4345b | **FAIL** | `node engine/scripts/owed-approvals.mjs <repo> ba1a6ca4345b` | 116 entr(y\|ies) owed |
| ↳ C8-codeowners | CODEOWNERS covers 100% of tracked Class-2 files | **PASS** | `git ls-files \| isClass2 \| codeownersCovers` | 123/123 covered |
| ↳ C8-identity | approvals authored and pushed by Sheldon's authenticated identity through a CODEOWNERS-gated PR; CI fails closed on a CODEOWNERS touch | **FAIL** | — | NOT MEASURABLE IN THIS ENVIRONMENT: requires branch protection (main is unprotected — L37) and a merged PR; no API surface here |
| C9 | §2.1.9 every ledger/CLAUDE.md behavioural row carries a test that fails when stale | **PASS** | `vitest run engine/test/invariants -t 'every behavioural claim in the ledger still holds'` | 1 passed, 0 failed (35) |
| C10 | §2.1.10 explicit written gate ack from the human, naming this tree | **FAIL** | `APPROVALS/GATE_ACK_phase0.md: tree: <hash>, ack: yes` | APPROVALS/GATE_ACK_phase0.md does not exist — no ack, no completion; silence is not consent |

## Status

**INCOMPLETE — 15 failing:** C1, AC1-live, AC4-enforced, D-vault-rotation, D-warehouse, D-name, C2, C3, C4, C7, C7-leak, C8, C8-owed, C8-identity, C10

This is a status update, not a completion claim (DONE.md §3).
