# HANDOFF.md — Fullburn (DONE.md §5)

**Status: Phase 0 OPEN. `npm run done -- phase` exits 1. No PR. No dollar has ever been live.**

This file is written by DONE.md §5. A new session starts by reading DONE.md,
CLAUDE.md, this file — and then re-running `npm run done -- <current phase>` to
establish state from evidence rather than from this prose. The long-form
narrative handoff (rulings history, per-round dispositions, numbers by commit)
lives at `fullburn/reports/HANDOFF.md`; this file is the §5 contract and wins
on any disagreement about *state*.

## Tree and branch

- verified tree: `9a05f8ae69b5356526262386f8c630d6bb959fbf` (hash of `git ls-files -s` over `VERIFIED_TREE_SCOPE`; `reports/`, `APPROVALS/` and this file are outside it, so the record commit does not move it)
- branch: `claude/fullburn-engine-spec-r7v5lg`
- phase: `0`
- latest `done` report: `fullburn/reports/DONE_phase0_7a89aee21e85.md` — **exit 1, INCOMPLETE** (previous tree; C5 there read `226 caught, 0 survived, 3 stale` — AD-02/03/04, repaired in the tree above)
- latest `done` run, at the previous tree `860de6b6`: `fullburn/reports/DONE_phase0_860de6b6ac8c.md` — **exit 1, INCOMPLETE**, 15 failing rows, all human-owned or unmeasurable here (C1 live halves, C2, C3, C4, C7-lint, C8-owed, C8-identity, C10); C5 **PASS** — `231 mutations: 231 caught, 0 survived, 0 stale`, meta-check ok (2026-09-21 00:29)
- `done` run at `0ef1ce04` (the lint-gate tree): INTERRUPTED by the builder (SIGINT, harness restored the tree, exit 130, no verdict) after editing began during its harness — recorded in L42; no report exists for that tree
- `done` run at `abda5d88`: `fullburn/reports/DONE_phase0_abda5d88c24f.md` — **exit 1, INCOMPLETE** (2026-09-22 09:53). ~~C5 PASS 240/240~~ **VOID (X-07, ledger L43 correction)**;
- `done` run at the tree above: **PENDING** — launched after the x1-fixes commit with the tree untouched; its C5 is the first honest harness count since `7a89aee2` (226/229) **C7-lint PASS** (measured); **C7-leak FAIL — NEW**: the structural scan refuses `openrouter.ai` in `cross-family-lib.mjs` under its Law 9 rule ("LLM provider hostname — all LLM traffic goes through AI Gateway"). The remaining rows are the human-owned ones.

## Open findings (immutable IDs; nothing below is closed without the test that proves it)

| ID | Severity | Status |
|---|---|---|
| L37 / H19 | **1** | `main` is unprotected; a gate-free PR reports `mergeable_state: clean`. Human-only. Outranks L4 by ruling. Re-measure after the settings land: require `blocked`. |
| L4 / H2 | 1 | PRIMARY spend control (AI Gateway cap) designed, unprovisioned. Human/infrastructure. |
| R14-01 | 1 → ruled | Ledger demoted to advisory; §4 red-proof executed (`gateway-cap-primary.test.ts`); still BLOCKING on L4/H2. |
| L8 | 2 | Builder and adversary are both Claude (Law 11). `engine-adversary` self-reported "Claude Fable 5.1 — the rule is violated" on 2026-09-20. Needs a non-Claude route: `ox-alpha` (needs `OPENROUTER_API_KEY`) or a codex hand-off (H6b). |
| L39 | 2 → discovery resolved | Adversary was not a registered agent from a repo-root session; a gated mirror at `.claude/agents/` fixed it and registration was OBSERVED (readiness check answered on 2026-09-20). Family half stays open under L8. |
| L40 | 2 | The completion checker nested inside its own suite under DN-14 on its first run; removed structurally (DN-15). Its first complete run found three stale harness entries (AD-02/03/04) that two commits of green suite had not; the table is now checked against the tree in the default suite (`staleEntries`, SE-01) and the checker names what it finds (DN-16). Two builder process slips recorded in the row. |
| DONE §2.1.7 lint | 3 → gate built | Ruled 2026-09-22: ESLint + typescript-eslint, type-aware, `no-floating-promises` and `no-misused-promises` at error; wired as `npm run lint`, a CI step, and C7-lint. 66 files, 0 findings at install; plants refused by name (L41). C7-lint PASS in a `done` report is pending the next run. |
| C7-leak / Law 9 | **2, needs a ruling** | The cross-family runner calls OpenRouter directly and the Class-2 structural scan flags the hostname under Law 9 (every LLM call through AI Gateway). The builder does not exempt or respell. Two lawful resolutions, the human's to pick: (a) route the read through the AI Gateway's OpenRouter provider endpoint once H2 exists — the read then waits on H2 as well as the key; (b) a written ruling that review tooling is outside Law 9, with the scan rule amended by the human (scan-lib is Class-2). Until then C7-leak is FAIL at this tree and the read must not be dispatched. |
| DONE §2.1.3 cross-family | 1 → x1 RAN: FAIL, 17 findings | Ruled 2026-09-22: GPT Astra via OpenRouter, in CI. `cross-family-read.mjs` + `.github/workflows/cross-family-read.yml` (dispatch-only, fails closed without `OPENROUTER_API_KEY`), reviewer pinned to `openai/gpt-6-astra` and read back, stand-in cannot mint a PASS (L42). x1 ran 2026-09-24 by hand with the human's key (rotated after): `reports/ADVERSARY_REPORT_phase0.x1.md`, FAIL, 17 findings, dispositions below. C3 stays FAIL until a read PASSES against a later tree. |
| DONE §2.1.8 identity | 1 | Approvals cannot be shown to carry the human's authenticated identity without branch protection + a merged PR. |
| DONE §2.1.10 ack | — | `APPROVALS/GATE_ACK_phase0.md` does not exist. Silence is not consent. |

## Cross-family round x1 (GPT-6 Astra, 2026-09-24) — dispositions

Report: `fullburn/reports/ADVERSARY_REPORT_phase0.x1.md` (Verdict FAIL, 17 findings, bound to `abda5d88`). Each disposition is the builder's; the reviewer's verdict stands until a read PASSES against a later tree.

| ID | Sev | Disposition | Where |
|---|---|---|---|
| X-01 | 1 | Already open — H19/L37. Human-owned. | — |
| X-02 | 1 | FIXED: lint config Class-2 + CODEOWNER; ESLint asked whether production paths are ignored. X1-02. | gate-lib, CODEOWNERS, invariants |
| X-03 | 1 | HALF-FIXED: review artifacts Class-2 + CODEOWNER (human review on every report commit). Provenance from bytes is impossible; ESCALATED: a router-side generation lookup in CI is proposed. X1-03. | gate-lib, CODEOWNERS |
| X-04 | 1 | FIXED: repo-root harness targets recoverable after a crash; other root paths still refused. X1-04. | mutate-lib |
| X-05 | 1 | FIXED: gateway origin pinned to `gateway.ai.cloudflare.com/v1/`, checked before the vault. X1-05. | gateway.ts |
| X-06 | 1 | Already open — L4/H2. Human-owned. | — |
| X-07 | 1 | CONFIRMED BY EXECUTION AND FIXED. All C5 counts since `298c9f9` VOID (ledger correction). Staleness check reads through the marker; third meta-canary; probe rewritten. X1-07. | mutate-lib, invariants, locks-r7 |
| X-08 | 2 | FIXED: output carrying a credential refused, not returned; error names redacted. X1-08a/b. | gateway.ts, redact.ts |
| X-09 | 2 | Already open — D-vault-rotation unmet since F10. | — |
| X-10 | 3 | FIXED: `llm()` validates its binding map; two shadowed guards deleted; refusals driven through llm. X1-10. | gateway.ts, eval-rebind |
| X-11 | 3 | ESCALATED — Law 9 vs the router. Needs the human's ruling (options in the open-findings table). | — |
| X-12 | 3 | FIXED: C8 is `checkClass2Approvals`, not a transition count. X1-12. | done.mjs |
| X-13 | 3 | FIXED: structural comparison; adversary golden set 0/3 → 3/3. X1-13. | eval-harness |
| X-14 | 3 | Already open — AC1-live, H2/H5. | — |
| X-15 | 3 | PARTIAL: every `[VERIFIED]` tag must name tests the suite runs. Row-text binding still open. | invariants |
| X-16 | 5 | Already open — H1/H3/H4/H9. Human-owned. | — |
| X-17 | 5 | FIXED: no Node API at module load; refuses at construction without `process.hrtime`; driven in a process without `process`. Whether the Worker declares `nodejs_compat` is the human's stack call. X1-17. | trusted-clock |

Probe re-measurement 2026-09-24 (marker-writing probe, failing tests named): 26 of 26 CAUGHT, each by a named test other than the staleness invariant (R14-01 as the sanity case; X1-07/04/02/03/05/10/08a/08b/13/17/12; SE-01; DN-16; AD-02/03/04; LT-01/02; DN-17; XF-01..06). Two of them — X1-08b and X1-12 — SURVIVED on the first honest pass: nothing drove the redacted error name, and C8's predicate lived in the runner; both gained a driven red-proof (hardening.test.ts; done-lib `class2Condition`) and were re-probed CAUGHT. Log: probe-28.log in the session scratchpad; the harness re-run is the authoritative count.

## Standing rulings issued since the last handoff (for the human to append to DONE.md §4)

13. **The adversary is only an adversary if the harness can find it — and where it is found must be as gated as where it is reviewed.** (2026-09-20, L39)
14. **First action of every session: prove the checkout is this build.** `git log -1` names a Fullburn commit and `fullburn/PHASE` exists, or stop; nothing is pushed until it does. A container started on `main` under this branch's name on 2026-09-20. (CLAUDE.md)
15. **The completion checker never nests.** It refuses to exist inside a test worker or another `done` run before reading an argument; every child carries the marker. (2026-09-20, L40)
16. **A gate that passes on empty output is not a gate.** The builder's own pre-commit probe stage crashed silently and its "no survivors" check passed vacuously (L40). Every shell gate must assert the positive evidence it expects, not the absence of failures.
17. **A count of mutation entries is a count of entries that still match the tree.** Three entries went stale under a neighbouring-line edit and the suite stayed green for two commits; the table is now placed against the tree on every `npm test`, and a harness failure is reported by the names of its members, never only their number. (2026-09-20, L40)
18. **Lint is a type-aware gate for one defect class.** ESLint with typescript-eslint, `no-floating-promises` and `no-misused-promises` at error, over exactly the type checker's files, as a CI gate; an unawaited settle/reserve is the class that reaches production paths and Biome cannot see it. (Human ruling 2026-09-22, L41)
19. **The cross-family read runs in CI, router-bound, on a pinned reviewer that is read back; a stand-in endpoint can never mint a PASS; a PASS with findings is a FAIL.** (Human ruling 2026-09-22, L42)
20. **No edit to the tree while a checker run is in flight.** (Builder slip 2026-09-22, L42.)
21. **A check that runs inside the harness reads the tree through the harness marker, and the meta-check carries a from-removing negative canary.** (Cross-family finding X-07, 2026-09-24, L43.) Every C5 count and every single-entry probe verdict between `298c9f9` and `e74cb36` is void.
22. **Review artifacts and the lint configuration are Class-2 and CODEOWNER-covered.** (X-02/X-03, 2026-09-24, L43.) Provenance of a review from bytes alone is impossible; a router-side generation lookup in CI is proposed and awaits a ruling.

## Class-2 sets owed

- against `eb0775f` (Phase 0 base): **71** entries — `node fullburn/engine/scripts/owed-approvals.mjs . eb0775f`
- against `ba1a6ca` (merge-base with `main`, the range the `done` checker measures): **110** entries
- all sets UNCOMMITTED, deliberately, until CODEOWNERS enforcement exists (L27/L37). Never agent-authored.

## The exact next command

```
npm run done -- phase
```

Measured 2026-09-21 at tree `860de6b6`: exit 1, with C2, C3, C4, C7-lint, C8, C10 and the unmeasurable C1 rows failing; C5 PASS at 231/231 with the meta-check. The lint gate landed 2026-09-22 (L41); the next run should read C7-lint PASS and 234 entries, and that is an expectation until its report exists. When `OPENROUTER_API_KEY` exists as a repository secret: dispatch the `cross-family-read` workflow on this branch, compare the artifact's sha256 with the log line, commit `fullburn/reports/ADVERSARY_REPORT_phase0.x1.md` (and its `.raw.json`), then re-run `npm run done -- phase` — C3 reads PASS only if the reviewer returned zero findings against this exact tree. Order agreed with the human 2026-09-22: H19 first (approvals signed before protection would prove bytes, not identity — R7-07), then the §7.0 re-measurement requiring `blocked`, then the router-bound cross-family read in CI once `OPENROUTER_API_KEY` exists (report line 5 `Reviewer-family:` naming a non-Claude family against this exact tree), then r15 for C2/C4, then the 110 Class-2 entries and the gate ack. Then, in order: the human's H19 settings → re-measure §7.0 (`blocked`) → `Reviewer-family:`-bearing cross-family read on this tree → r15 → `npm run done -- phase` exits 0 → gate ack.

## UNVERIFIED CLAIMS

Things asserted this session that are NOT backed by an executed check:

1. **How r8–r14 were produced.** Inferred from the reports' own headers (same-family, sandbox-executed, "two previous attempts died") that they were separate Claude contexts spawned from the builder. Not verifiable from this container's single transcript.
2. **`50c99e8`'s commit message says its DN entries were probed before committing.** They were not — the probe stage crashed on a misplaced env prefix and the gate passed on empty output. The DN entries were measured only by the `done` run's C5, which reported all of them CAUGHT — and reported AD-02/03/04 stale, which is what that same commit had broken. The five entries touched since (AD-02/03/04, SE-01, DN-16) WERE probed, with the probe's output asserted non-empty and each verdict read.
3. **Adversary registration** was observed by spawning it once (2026-09-20); the `done` checker cannot re-measure registration, only the mirror's integrity.
4. **The nested-run guard** (`VITEST` / `FULLBURN_DONE_ACTIVE`) is proven by the integration test with the worker's env; whether vitest sets `VITEST` in every pool mode used in CI is assumed from the forks pool used here.
5. **Lint** — "no tool configured" is a fact; that §2.1.7 intends a specific linter is not known.
6. ~~C5 at the current tree is expected, not measured~~ — MEASURED 2026-09-21: `reports/DONE_phase0_860de6b6ac8c.md`, C5 PASS 231/231.
7. **Commit `298c9f9`'s message and the first push of this file named the tree `d82f5342…`.** That figure was computed with git's working directory at `fullburn/`, where the scope's root-relative pathspecs resolve to nothing; the checker computes from the repository root and prints `860de6b6…`. Corrected here; the commit message cannot be.
8. ~~The lint gate's C7-lint PASS is expected, not measured~~ — MEASURED 2026-09-22: `reports/DONE_phase0_abda5d88c24f.md`, C7-lint PASS.
