# ADVERSARY REPORT phase0.x11
Verdict: FAIL
verified-tree: f9c85f3fdaec42f98f47f8f26fc4b0467816309e

Reviewer-family: OpenAI (gpt-6-luna via OpenRouter)

Round: x11, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `1731f8a` on branch `HEAD`; verified tree `f9c85f3fdaec42f98f47f8f26fc4b0467816309e` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-luna`, served `openai/gpt-6-luna` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1791651275-qzrc1tTX1zKrk4bHP1q0.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 128 files, 1699982 bytes sent; omitted as binary: none.
Usage: 465265 prompt, 8445 completion tokens. Started 2026-10-10T16:54:35.318Z.
Verdict basis: 5 finding(s) at severities 1,3,5.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X-02 — severity 1 — CI gates are not proven to block merges
- file: `.github/CODEOWNERS`
- evidence: The file says it is inert until branch protection requires review. `fullburn/HUMAN_TASKS.md` lists H19's required status checks as a human task, and `done-lib.mjs` records AC4 enforcement as unmeasurable because branch protection is not observable from the sandbox. Workflows existing does not make their checks merge-blocking.
- reproduction: On the GitHub repository, inspect the default-branch ruleset and required checks. Attempt to merge a PR missing a fresh adversary PASS and a cap-changing PR lacking authenticated approval. This external enforcement was not verified.

### X-01 — severity 1 — The authoritative AI spend cap is not verified on the real Gateway
- file: `fullburn/engine/test/gateway-cap-primary.test.ts`
- evidence: This test uses a local `gatewayWithCap` stand-in and explicitly says it cannot prove the real Gateway is configured with the approved ceilings. `spend-ledger.ts` states the in-process ledger is advisory and can be bypassed. Phase 0 requires AI Gateway wiring with per-client caps; without the external cap, the stated primary money control is unproven.
- reproduction: The test only demonstrates refusal by its local stand-in. Verify the Cloudflare AI Gateway account's actual per-client caps and attempt a spend-cap breach against that configured service; no such execution or configuration evidence is present in the tree.

### X-04 — severity 3 — Grade thresholds are still awaiting human approval
- file: `fullburn/config/src/grade-thresholds.ts`
- evidence: The file labels the initial Grade Registry thresholds “pending H9 sign-off.” Tests demonstrate computation using seeded values, but do not establish that the human-owned A-thresholds were approved as Phase 0 requires.
- reproduction: Check for H9's recorded approval and compare it with the threshold values used by `computeGrades`. No approval evidence is present in the provided tree.

### X-03 — severity 3 — Phase 0 live infrastructure and acceptance criteria remain unfulfilled
- file: `fullburn/engine/scripts/done-lib.mjs`
- evidence: `PHASE0_REQUIREMENTS` marks the real AI Gateway/Langfuse round trip, deployed vault bindings, ClickHouse/Airbyte provisioning, and CI merge enforcement as `command: null`; the live Gateway/Langfuse, vault, and warehouse requirements explicitly cite missing human provisioning. The unit and integration fixtures cannot establish these deliverables.
- reproduction: Run the Phase 0 acceptance criteria against provisioned services: make the hello-world call through the real Gateway, verify its Langfuse trace, verify deployed vault bindings, and confirm ClickHouse and Airbyte are provisioned and reachable. The listed tests exercise stubs or local code instead.

### X-05 — severity 5 — The required domain and trademark work is not evidenced
- file: `fullburn/HUMAN_TASKS.md`
- evidence: H1 lists fullburn.ai registration and a formal trademark check as Phase 0 blocking tasks. The repository cannot establish completion of either external action.
- reproduction: Verify domain registration and the completed formal trademark check outside the repository; no evidence is included in the tree.

## Invariants checked

- No write path outside publish/pause/promote: no Marketing API write adapter is present in Phase 0; runtime behavior was not executable here.
- Cross-tenant read fails by construction: scoped vault code and tests are present, but no warehouse/client read path or two-client warehouse test exists yet.
- The decisions ledger is append-only and captures every write: not implemented; deferred to Phase 2.
- The big red button halts all spend in under 60 seconds: not implemented; deferred to Phase 6.
- Bracket protection window cannot be bypassed: bracket and kill paths are not implemented; deferred to Phase 5.
- External content is data, never instructions: no crawler or agent path exists yet; the partial hostile-input fixture does not establish an injection drill.
- VERDICT.md is hash-locked after client-zero launch: not implemented; deferred to Phase 6.
- OAuth tokens live only in the vault: encrypted vault mechanisms and scanner code exist, but deployed key/store configuration and live secret handling were not verified.
- Human-queue items past SLA wait and locked flags are inert: the queue is not implemented; current market/channel registries restrict activation to the launch set, with tests present.
- A guard and its checker do not ship together without a red-proof: extensive tests and mutation entries are present, but execution and commit-history verification were unavailable.
- Mutation results require a passing meta-check: meta-check logic and tests are present; actual harness results could not be executed or verified.
- The unreachable-guard sweep is complete: a source-derived sweep and coverage tests are present; actual execution could not be verified.
- Guards are locked by behavior, not shape: behavioral tests and mutation entries are present; their results could not be executed here.
- Behavioral ledger claims carry tests: invariant code attempts to bind claims to tests; the referenced ledger artifact was not available in the supplied verified tree for inspection.
- Fixes remove capabilities rather than spellings: capability-removal reasoning is documented in money-path code; runtime attacks were not executable here.
- No verdict is reached where the default suite cannot see it: pure decision libraries and runner-binding tests are present; CI execution was not available.
- Secrets are scanned: a gitleaks CI step and an advisory in-repo scanner are configured, but scanner execution, configuration contents, logs, and Langfuse traces could not be inspected.
- Workflow actions are SHA-pinned and permissions are explicit: the supplied workflows show SHA-pinned actions and declared permissions; actual GitHub enforcement was not verified.

## Limitations (what a read cannot establish)

- This is a read-only review of the supplied tree; no commands, tests, CI jobs, mutation harness, endpoints, or runtime attacks were executed.
- GitHub branch protection, required-check settings, workflow runs, attestations, and merge behavior cannot be established from repository text alone.
- Cloudflare Gateway cap configuration, AI Gateway and Langfuse live round trips, ClickHouse/Airbyte provisioning, vault deployment bindings, and external domain/trademark records could not be verified.
- No live client, second warehouse tenant, ad account, queue SLA, attribution-window edge case, webhook delivery, or production API timeout could be exercised.
- The verified tree does not provide runtime logs or Langfuse traces, and the live-report artifacts and approval records needed for external verification are not established by this input.
