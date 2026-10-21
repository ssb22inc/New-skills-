# ADVERSARY REPORT phase0.x10
Verdict: FAIL
verified-tree: aca8ebe3aff4c2ed38795794fecbb431a1b47470

Reviewer-family: OpenAI (gpt-6-luna via OpenRouter)

Round: x10, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `6e4cbfb` on branch `HEAD`; verified tree `aca8ebe3aff4c2ed38795794fecbb431a1b47470` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-luna`, served `openai/gpt-6-luna` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1791643591-ixGdrJyRE7SeV39pVar5.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 128 files, 1698132 bytes sent; omitted as binary: none.
Usage: 464850 prompt, 7088 completion tokens. Started 2026-10-10T14:46:30.974Z.
Verdict basis: 5 finding(s) at severities 1,2,3.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X-01 — severity 1 — The CI workflows are not a merge gate without repository branch protection
- file: `.github/workflows/fullburn-ci.yml`
- evidence: The workflow defines checks, but the tree cannot enforce that GitHub requires them. `fullburn/HUMAN_TASKS.md` §H19 says repository protection is blocking and requires status checks; the completion requirements in `fullburn/engine/scripts/done-lib.mjs` explicitly mark AC4-enforced unmeasurable because main has no branch protection. A workflow run is not proof that GitHub prevents an ungated merge.
- reproduction: In GitHub, attempt to merge a pull request without the required checks, or with the workflows not triggered. The repository setting that would block that merge is external to this tree and is not verified here.

### X-02 — severity 1 — The authoritative AI spend cap is not demonstrated as configured; the in-process ledger is explicitly advisory
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: The source explicitly states that the in-process ledger does not bound spend and identifies the AI Gateway's out-of-process cap as the primary control, with its configuration unverified (H2 / ledger L4). `fullburn/engine/test/gateway-cap-primary.test.ts` demonstrates this only with a local stand-in, and the Phase 0 requirements in `fullburn/engine/scripts/done-lib.mjs` mark the real Gateway/Langfuse round trip and live infrastructure as unmeasurable. The tree therefore does not establish that real AI calls are bounded by the approved per-client Gateway caps.
- reproduction: Patch the live ledger prototype's `reserve` and `settle` as the test does, then send repeated calls. The checked-in proof only exercises a simulated Gateway cap; verify the actual Cloudflare Gateway configuration and repeat the breach attempt against it. That live check could not be performed from this read.

### X-04 — severity 2 — Switchboard activation accepts a claimed bundle without verifying its live-data PASS
- file: `fullburn/config/src/markets.ts`
- evidence: `assertActivationEarned()` trusts caller-provided `liveData: true` and a report filename matching a regex; it does not validate the report, its verdict, tree binding, provenance, or live-data evidence. `fullburn/config/test/switchboard.test.ts` checks that a named report exists and contains `Verdict: PASS`, but does not bind it to this activation or prove live-data review. A locked market or channel can therefore be enabled by a configuration change with asserted rather than verified activation evidence, contrary to Law 18 and Phase 0's structurally inert flag requirement.
- reproduction: Add a complete locked-channel bundle and `activation: { basis: "bundle", adversaryReport: "ADVERSARY_REPORT_fake.md", liveData: true }`, with a file containing `Verdict: PASS`. The activation checks shown accept filename and caller-supplied fields as evidence; they do not establish that the report is a live-data PASS for that bundle.

### X-05 — severity 3 — Phase 0 acceptance criteria and provisioned deliverables remain unmet or unverified
- file: `fullburn/ENGINE_BUILD.md`
- evidence: Phase 0 requires a real AI Gateway hello-world call appearing in Langfuse, an evaluated frontier-to-open-source rebinding that serves without code changes, provisioned ClickHouse and Airbyte, an encrypted and auto-rotated OAuth vault backed by deployed infrastructure, and domain registration plus formal trademark review. The tree's own `PHASE0_REQUIREMENTS` marks live Gateway/Langfuse, deployed vault infrastructure, ClickHouse/Airbyte, and naming/legal actions as unmeasurable. The recorded eval outputs are explicitly placeholders pending live regeneration, and the tests use stubbed fetches. No Phase 0 adversary report or live verification ledger is present in the supplied tree.
- reproduction: Compare `ENGINE_BUILD.md` §11 Phase 0 deliverables and ACs with `done-lib.mjs`'s `PHASE0_REQUIREMENTS`, `HUMAN_TASKS.md` H1–H9, and the recorded-output fixture comments. The named live acceptance checks and external deliverables cannot be established from this tree.

### X-03 — severity 3 — Recorded outputs can be served as successful production LLM calls
- file: `fullburn/engine/src/gateway.ts`
- evidence: `llm()` permits a `RecordedTransport` for the launch binding map: the transport is accepted by `servingTransportAllowed`, and the production-binding check explicitly exempts recorded transports. `RecordedTransport` is exported from `fullburn/engine/src/index.ts` and accepts caller-supplied outputs. Thus a caller can obtain a successful result and success trace without sending a request through AI Gateway; the trace still records a reserved cost. This creates unsupported output and cost telemetry and violates the AI Gateway-only call path.
- reproduction: Construct `RecordedTransport` with a valid hello-world output, select its case, and call `llm()` with `ROLE_BINDINGS` and otherwise valid dependencies. The code path accepts the recorded output without contacting the Gateway.

## Invariants checked

- Writes only through publish/pause/promote: no marketing write adapter is implemented in Phase 0; the write-verb invariant is deferred to Phase 6, not verified.
- Cross-tenant isolation: vault handles are client-scoped and tests cover cross-client secret access; execution and a two-client warehouse read test were not performed.
- Decisions ledger append-only and captures every write: the Phase 2 decisions ledger is not implemented.
- Big red button halts spend in under 60 seconds: no UI or red-button path is implemented.
- Bracket protection window cannot be bypassed: bracket logic is deferred to Phase 5.
- External content is data, never instructions: a limited inert-input test exists; no crawler or agent ingestion path is present to verify the full drill.
- VERDICT.md remains hash-locked after launch: no client-zero launch or VERDICT.md lock implementation is established in this tree.
- OAuth tokens only in the vault and absent from code, logs, and traces: vault/redaction code and scanner tests exist; live infrastructure, full secret scan execution, and real logs/traces were not verified.
- Human-queue items past SLA leave the engine waiting: queue implementation is deferred to Phase 6.
- Locked market/channel flags are inert: current registries mark non-launch flags locked or staged and accessors reject them, but the claimed activation evidence can be forged as described in X-04.
- A guard and its checker do not ship together without a red-proof: the tree describes mutation and invariant checks, but neither their execution nor CI results can be established from this read.
- Every harness result requires a passing meta-check: canaries and meta-check logic are present; the harness was not executed.
- Unreachable-guard sweep is complete: enumeration and coverage tests are present; the sweep was not executed.
- No guard is considered proven by source shape alone: many behavioral tests are present, but runtime behavior was not executed in this read.
- Behavioral ledger claims have tests: invariant code attempts to bind ledger rows to checks; the referenced ledger file is absent from the supplied tree, so completeness cannot be established.
- A fix removes a capability rather than merely a spelling: the code documents some residual limitations; cannot independently validate the claimed closures without execution.
- Nothing auto-resolves; disagreements wait for the human: no production human-queue implementation exists to verify.
- Model calls through AI Gateway and decisions traced in Langfuse: adapter and sink implementations exist, but real round-trip delivery is unverified; the RecordedTransport path is a counterexample to Gateway-only serving.
- Runtime spend caps are immutable and breach-tested: config is frozen and tests attempt mutation; the actual authoritative Gateway cap is unverified and the local ledger is expressly advisory.
- Trust ladder never skips rungs: the state machine is deferred to Phase 5.
- Proxies kill only and revenue promotes: bracket decision logic is deferred to Phase 5.
- No prediction gates: the scanner and a fixture test cover this absence; the code and test suite were not executed.

## Limitations (what a read cannot establish)

- This was a read-only review of the supplied tree; no commands, tests, workflows, endpoints, or spend-cap attacks were executed.
- I could not verify GitHub branch protection, required status checks, or external repository settings.
- I could not inspect live Cloudflare Gateway cap configuration, provider credentials, Langfuse delivery, ClickHouse, Airbyte, or deployed vault storage and rotation.
- I could not confirm domain registration or completion of the formal trademark check.
- I could not verify a real model evaluation/rebinding: the visible recorded outputs are marked placeholders, and the cited live-eval tests use stubbed fetch.
- The supplied tree contains no Phase 0 adversary report or LIVE_VERIFICATION_LEDGER.md, although tests and gate code reference them.
