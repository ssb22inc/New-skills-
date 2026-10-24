# ADVERSARY REPORT phase0.x12
Verdict: FAIL
verified-tree: 211dd1f18e155980f8cd547bbff4b458801e2ac0

Reviewer-family: OpenAI (gpt-6-luna via OpenRouter)

Round: x12, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `c08e775` on branch `HEAD`; verified tree `211dd1f18e155980f8cd547bbff4b458801e2ac0` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-luna`, served `openai/gpt-6-luna` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1792780855-Xe5R9ROMTd1Mz2wAtOqy.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 143 files, 1897254 bytes sent; omitted as binary: none.
Usage: 521124 prompt, 8723 completion tokens. Started 2026-10-23T18:40:55.493Z.
Verdict basis: 6 finding(s) at severities 1,2,3,4.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X-01 — severity 1 — CI checks are not an enforced merge gate
- file: `fullburn/engine/scripts/done-lib.mjs`
- evidence: PHASE0_REQUIREMENTS marks AC4-enforced unmeasurable and states that main has no branch protection, citing ledger L37. The required adversary and class-2 workflows existing in the tree does not make their checks required for merge.
- reproduction: Open a PR with no fresh adversary report and attempt to merge it. The code records that branch protection is absent, so the PR can merge without the report gate blocking it. I cannot execute this against GitHub in this read-only review.

### X-02 — severity 1 — The authoritative AI spend ceiling is not evidenced; the in-process meter is explicitly advisory
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: The source states that the process ledger “is advisory” and that the AI Gateway's external per-client cap is the primary authority. The `gateway-cap-primary` test uses a local stand-in, while the live check only tests a hello-world call and trace; no checked-in evidence shows the real Gateway cap is configured. HUMAN_TASKS.md still lists setting per-client AI Gateway caps as outstanding.
- reproduction: Configure or use a Gateway without a per-client cap, then patch the live ledger prototype's `reserve` and `settle` methods as `gateway-cap-primary.test.ts` does and repeat `llm()` calls. The in-process layer no longer limits spend; only a real external Gateway cap would stop it. The real account configuration cannot be verified from this tree.

### X-03 — severity 2 — No attested live evidence establishes the Phase 0 Gateway and Langfuse round-trip
- file: `fullburn/engine/scripts/done-lib.mjs`
- evidence: AC1-live is a live-backed requirement that passes only with an attested live report for the exact tree, including passing `gateway-hello-world` and `langfuse-trace` rows. No live-check report is included in the provided tree, so this acceptance criterion is not established.
- reproduction: Run the completion check for Phase 0 against this tree: absent a same-tree attested live report, `liveRequirementCondition` returns FAIL for AC1-live. I cannot dispatch the live workflow or inspect its GitHub attestation here.

### X-04 — severity 2 — The encrypted vault's production deployment is missing
- file: `fullburn/engine/scripts/done-lib.mjs`
- evidence: The Phase 0 requirements explicitly mark D-vault-live unmeasurable because the KEK binding, Durable Object CipherStore, and cron trigger are infrastructure not observable from the sandbox. HUMAN_TASKS.md lists the vault/secrets setup as blocking. The implementation and tests for encrypted storage do not prove that production uses it.
- reproduction: Inspect the Phase 0 requirements and HUMAN_TASKS.md: D-vault-live has no executable proof, and provisioning remains outstanding. The tree also contains a plaintext `MemoryVaultBackend`; no deployment evidence establishes that a production call is bound to the encrypted Durable Object backend.

### X-05 — severity 3 — Other blocking Phase 0 deliverables and approvals remain outstanding
- file: `fullburn/HUMAN_TASKS.md`
- evidence: H1 (domain registration and trademark check), H3/H4 (ClickHouse and Airbyte provisioning), and H9 (initial Grade Registry threshold approval) are listed as blocking Phase 0 tasks. `done-lib.mjs` also marks D-name as a human/legal action and D-warehouse as requiring live evidence. The threshold source itself says H9 sign-off is pending.
- reproduction: Review HUMAN_TASKS.md H1, H3, H4, and H9; check D-name and D-warehouse in `PHASE0_REQUIREMENTS`. These requirements cannot be considered complete from the supplied tree. External registration, provisioning, and approval records are not available for verification here.

### X-06 — severity 4 — The shared spend ledger permits cross-client reads
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: `committedMicros(clientId, span)` and `reservedMicros(clientId)` accept a caller-selected client ID, and `MemorySpendMeter.todayUsd` and `monthUsd` forward that ID without binding it to a tenant identity. The process ledger is shared across clients. The vault's scoped-read protection does not protect these ledger read methods.
- reproduction: After recording spend for client A, call `new FrozenCapsSpendMeter().todayUsd("client-A")` or `processLedger().committedMicros("client-A", "day")` from code operating for client B. The methods return A's spend instead of refusing. This violates the standing cross-tenant-read invariant.

## Invariants checked

- Writes-only/platform API rule: no marketing write adapter exists in Phase 0; the structural scanner covers platform API hosts, but runtime write behavior is not exercised here.
- Spend caps immutable at runtime: frozen cap table and mutation tests are present; the real authoritative AI Gateway cap is not evidenced (FAIL, X-02).
- Per-client isolation: vault handles are client-scoped and tests exercise mismatched vault/trace clients; shared spend-ledger readings accept arbitrary client IDs (FAIL, X-06).
- Append-only decisions ledger: not implemented in Phase 0; deferred to Phase 2.
- Big red button halts spend in under 60 seconds: no production UI or spend path exists; deferred to later phases.
- Bracket protection window cannot be bypassed: bracket engine is not a Phase 0 deliverable; deferred to Phase 5.
- External content is data, never instructions: full crawler/agent drill is deferred; no agent path consuming the preview's scraped site facts is shown.
- VERDICT.md hash-lock after client-zero launch: launch has not occurred; no VERDICT.md is present in the supplied tree.
- OAuth tokens exist only in the vault and never in code, logs, or traces: scanner and redaction tests are present, but production vault deployment and live secret/trace scans are not verified (FAIL, X-04).
- Human-queue items past SLA wait, and locked flags remain inert: queue behavior is deferred; switchboard tests cover locked/staged registry access, but live activation infrastructure is absent.
- Harness guard/checker separation and crash safety: extensive mutation-table, marker, lock, and drill tests are present; execution could not be performed.
- Harness results require a passing meta-check: canary and parser logic is present and tested; execution could not be performed.
- Unreachable-guard sweep is complete: filesystem/import-graph enumeration and mutation-entry checks are present; execution could not be performed.
- Guards are proven by behavior rather than source shape: many behavior-driven tests are present; execution could not be performed.
- Behavioral ledger claims carry tests: an invariant binds listed ledger claims to checks; this read cannot establish that all ledger claims are accurately represented.
- Fixes remove capabilities rather than spellings: the code documents several remaining in-process limitations, including the advisory ledger; external cap authority remains unverified (FAIL, X-02).
- Completion is an exit code, never a sentence: `done` remeasures conditions and requires a same-tree cross-family/live attestation; no completion report or current-tree adversary report is supplied.
- Completion checker does not nest: code and integration tests encode the refusal; not executed.
- CI blocks PRs missing adversary reports: not enforced while repository branch protection is absent (FAIL, X-01).
- Locked market/channel flags cannot activate: frozen launch registries and tests are present; runtime execution was not possible.
- Every decision is traced and LLM calls use AI Gateway: gateway and grade-decision tracing paths and adapter tests are present; actual Gateway/Langfuse service round-trip is not evidenced (FAIL, X-03).

## Limitations (what a read cannot establish)

- This is a read-only review. I could not install dependencies, run tests or mutation harnesses, invoke endpoints, or perform runtime attacks; code and tests are not reported as executed.
- I could not inspect GitHub branch-protection settings or execute a PR merge attempt. The repository's own completion requirement records that protection is absent.
- I could not inspect the real Cloudflare AI Gateway configuration, service credentials, deployed Worker bindings, ClickHouse/Airbyte instances, Langfuse traces, logs, or external domain/trademark records.
- No same-tree cross-family adversary report or attested live-check report is included in the supplied tree, so neither a cross-family PASS nor Phase 0 completion can be established.
