# ADVERSARY REPORT phase0.x8
Verdict: FAIL
verified-tree: 12e403d4819bf88a89db239b1f5125be1fb7ea0d

Reviewer-family: OpenAI (gpt-6-luna via OpenRouter)

Round: x8, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `60fef14` on branch `HEAD`; verified tree `12e403d4819bf88a89db239b1f5125be1fb7ea0d` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-luna`, served `openai/gpt-6-luna` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1791627203-o1RGnsoGk1rGr47xpszh.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 127 files, 1671547 bytes sent; omitted as binary: none.
Usage: 458187 prompt, 7107 completion tokens. Started 2026-10-10T10:13:23.100Z.
Verdict basis: 5 finding(s) at severities 1,2,3.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X-01 — severity 1 — No evidence that required CI checks actually block a merge
- file: `.github/workflows/fullburn-ci.yml`
- evidence: The workflow defines CI jobs, but branch protection and required status checks are external to the checked-in workflow. `fullburn/HUMAN_TASKS.md` still lists H19 repository protection as a human task; `DONE.md` records that protection was measured absent. Without required checks, a PR can merge without the adversary and class-2 gates blocking it.
- reproduction: Inspect the repository's active branch-protection/ruleset settings and attempt to merge a PR missing a fresh attested adversary PASS. The supplied tree does not establish that the checks are required.

### X-02 — severity 1 — The authoritative AI spend cap is not established on the real Gateway
- file: `fullburn/engine/test/gateway-cap-primary.test.ts`
- evidence: The test demonstrates the purported primary cap using a local `gatewayWithCap` stand-in, and explicitly says it does not prove the real Gateway is configured with the ceilings. The in-process ledger is documented as advisory and its prototype can be patched to bypass `reserve` and `settle`. Phase 0's Gateway provisioning/configuration is not evidenced in this tree.
- reproduction: Disable the in-process ledger methods as the test does, then make calls through a real Gateway configured without the per-client ceiling. No in-tree configuration or live test proves the real service refuses at the approved cap.

### X-03 — severity 2 — Locked market and channel activation is not conditioned on earned bundle evidence
- file: `fullburn/config/src/channels.ts`
- evidence: `requireActiveChannel` checks only whether the static registry's `status` is `on`; `requireActiveMarket` does the same and does not require a jurisdiction pack. The tests cover runtime mutation and patched copies, but no code binds an `on` status to a successful live-data adversary/bundle result. A registry change can therefore activate a locked channel or a market with missing jurisdiction data, contrary to Law 18 and the standing invariant.
- reproduction: Change TikTok's registry status to `on` and call `requireActiveChannel("tiktok")`; likewise set EU to `on` while leaving its jurisdiction pack null and call `requireActiveMarket("EU")`. The accessors have no proof input or bundle check to reject either activation.

### X-04 — severity 2 — A fake fetch can mint production-eligible live-eval evidence
- file: `fullburn/engine/src/live-eval.ts`
- evidence: `runLiveEval` accepts a caller-constructed `AiGatewayHttpTransport` and checks only that its prototype is exactly `AiGatewayHttpTransport.prototype`. That transport's public constructor accepts an injected `fetchImpl`. The caller can return golden answers from the fake fetch; `runLiveEval` then marks the attestation live and `bindRoleLive` makes the result production-servable. The current live-eval tests use `queuedGateway`, which supplies precisely such stubbed fetch responses.
- reproduction: Construct `AiGatewayHttpTransport` with a `fetchImpl` that returns the expected golden outputs, pass it to `runLiveEval`, then pass the resulting attestation to `bindRoleLive`. Serve the resulting bindings through a separate live transport. This satisfies the current checks without any model call to the real Gateway.

### X-05 — severity 3 — Multiple Phase 0 deliverables and acceptance criteria remain unmet or unverified
- file: `fullburn/engine/scripts/done-lib.mjs`
- evidence: `PHASE0_REQUIREMENTS` records AC1-live, AC4-enforced, D-vault-live, D-warehouse, and D-name with `command: null`; their reasons identify unprovisioned services or external human actions. AC2's test path uses recorded outputs/stubbed fetches rather than a verified live model route. H1, H3, H4, H7, H9, and H19 are also still listed as human tasks, and no Phase 0 adversary report is included in this tree. These gaps prevent Phase 0 acceptance and cannot be treated as passes.
- reproduction: Run the Phase 0 completion procedure with the required infrastructure and external evidence checks. The checker’s own requirement map marks the listed criteria not measurable, so the phase cannot satisfy its acceptance criteria from this tree.

## Invariants checked

- No code path writes outside publish/pause/promote: no Marketing API write path exists in Phase 0; future write restriction remains unverified.
- Cross-tenant read fails by construction: client-scoped vault tests and key composition are present; no two-client warehouse read path exists yet.
- The decisions ledger is append-only and captures every write: not implemented; Phase 2 deliverable.
- Big red button halts all spend in under 60 seconds: not implemented; UI/spend path is not present.
- Bracket protection window cannot be bypassed: bracket and kill logic are not implemented; Phase 5 deliverable.
- Hostile external content is data, not instructions: only a partial inert-input test exists; no crawler/agent injection drill is implemented.
- VERDICT.md is hash-locked after client-zero launch: no VERDICT.md or launch lock exists; Phase 6 deliverable.
- OAuth tokens live only in the vault: vault implementations and leak scanning exist, but deployed secret bindings, durable storage, rotation scheduling, and live trace scanning are not established.
- Past-SLA queue items wait, and locked market/channel flags are inert: queue behavior is not implemented; registry accessors reject current non-on flags, but activation is not tied to earned bundle proof (X-03).
- A guard and its checker do not ship together without a red-proof: numerous mutation entries and tests are present; the required full execution could not be verified.
- Mutation results require a passing meta-check: canaries and meta-check logic/tests are present; actual harness execution could not be verified.
- Unreachable money-path guard sweep is complete: import-graph population, refusal tests, and per-guard entries are present; execution could not be verified.
- Guards are locked by behavior rather than source shape: many tests drive behaviors; the full suite and mutations could not be run.
- Behavioral ledger/CLAUDE claims have tests, or limitations are stated: an invariant checker and claim bindings are present; execution could not be verified.
- Fixes remove capabilities rather than spellings: this is stated in CLAUDE.md and several code comments; it remains a process invariant and is not independently executed here.
- No verdict is reached where the default suite cannot see it: extracted decision libraries and runner bindings/tests are present; test execution could not be verified.
- Coverage checks exempt only measured items: scan walk and exemptions have fixture tests; execution could not be verified.
- Secret scanner rules are not treated as comprehensive: the code explicitly calls them advisory and identifies gitleaks as primary; actual gitleaks execution and external logs are unverified.
- Secret rules are not validated solely against self-authored canaries: an independently described credential corpus and removal red-proofs are present; execution could not be verified.
- CI gates are not assumed to prevent merges unless repository protection requires them: H19 remains a human task and no active required-check configuration is evidenced (X-01).
- Workflows are SHA-pinned and avoid actions: write: checked-in workflow references appear pinned and permissions are declared; execution and remote enforcement were not verified.
- The adversary discovery mirror is byte-identical and gated: source/mirror files and invariant checks are present; session discovery itself is not verifiable from this read.
- The checkout identity was validated before any launch/push: this review has no session or push capability and cannot establish that session-start check.
- Source-writing tools are import-safe and recover from interruption: marker/lock/recovery code and drills are present; actual crash and SIGINT behavior could not be executed.
- Completion is an exit code, not a narrative claim: `done.mjs` and `done-lib.mjs` implement a checker, but its full run and meta-check were not executed.
- The completion checker does not nest: environment guards and tests are present; execution could not be verified.
- Shell gates require positive evidence and avoid unsafe process-kill patterns: workflow/test code was inspected, but no workflow was executed.
- Mutation-table entries are checked against the current tree: staleness logic and invariant coverage are present; a real harness run could not be verified.
- Lint is type-aware for the declared TypeScript set: configuration and integration tests are present; lint execution could not be verified.
- Cross-family review uses a pinned reviewer and prevents stand-in PASS: pinned model and endpoint checks are present; no production-router review or attestation was executed in this review.

## Limitations (what a read cannot establish)

- This is a read-only review; no commands, tests, endpoints, or runtime attack attempts were executed.
- The actual GitHub branch-protection/ruleset state and required-check enforcement cannot be established from the supplied files.
- No live AI Gateway, Langfuse project, ClickHouse/Airbyte deployment, OAuth vault binding, or provider credentials were available to verify.
- No live model rebind/evaluation or production Gateway cap configuration was verified.
- No runtime fixtures for crawled content, queue SLA, second-client onboarding, campaign bracket behavior, or VERDICT.md launch locking were available.
