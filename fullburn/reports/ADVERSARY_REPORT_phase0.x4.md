# ADVERSARY REPORT phase0.x4
Verdict: FAIL
verified-tree: 7a5644495fc3624bc151d7bb51c68f8a8041fc94

Reviewer-family: OpenAI (gpt-6-astra via OpenRouter)

Round: x4, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `6a6fdb9` on branch `claude/fullburn-engine-spec-r7v5lg`; verified tree `7a5644495fc3624bc151d7bb51c68f8a8041fc94` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-astra`, served `openai/gpt-6-astra` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1791116180-J5TQnIPFEyA0H3VjAKt2.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 110 files, 1328997 bytes sent; omitted as binary: none.
Usage: 364344 prompt, 8610 completion tokens. Started 2026-10-04T12:16:20.045Z.
Verdict basis: 15 finding(s) at severities 1,2,3,4,5.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X4-01 — severity 1 — Repository enforcement remains an unresolved Phase 0 blocker
- file: `.github/CODEOWNERS`
- evidence: CODEOWNERS explicitly states that it is inert without required CODEOWNER review. CLAUDE.md records unprotected branches and labels every CI gate advisory; HUMAN_TASKS H19 remains blocking. done.mjs consequently hard-codes C8-identity as FAIL. The supplied record does not establish that an unapproved money-path change or a missing adversary report actually prevents merging.
- reproduction: Have the human inspect the current protection/ruleset configuration for every protected branch and attempt a disposable PR with a missing adversary report and an unapproved Class-2 change. Record rejected merge attempts and authenticated approval evidence. This read cannot perform or substitute for that verification.

### X4-02 — severity 1 — Class-2 configurations outside Fullburn remain outside the reviewed-tree hash
- file: `fullburn/engine/scripts/gate-lib.mjs`
- evidence: isClass2 matches package.json, package-lock.json, .npmrc, tsconfig and runner configurations at any depth. The X3-02 change makes those paths trigger CI, but VERIFIED_TREE_SCOPE still includes only fullburn/, .github/, .claude/, DONE.md and the two root gitleaks files. A root Class-2 configuration change therefore leaves an existing review binding fresh and is absent from the cross-family bundle.
- reproduction: In a temporary repository, record a PASS against the current verified hash, commit a change to a root package.json or .npmrc, and recompute the hash using VERIFIED_TREE_SCOPE. It remains unchanged although isClass2 and inScope both return true. Extend gate-cli coverage to require such a change to stale the review.

### X4-03 — severity 1 — The new exclusive run lock still admits concurrent mutation writers
- file: `fullburn/engine/scripts/mutate-lib.mjs`
- evidence: acquireRunLock creates the lock with openSync('wx') and writes its PID separately. A competing process can observe the newly created empty file, parse NaN, classify it as stale and unlink it while its creator is alive. Stale takeover also performs an unchecked read-then-unlink, allowing one contender to remove another contender's replacement lock. The supplied test exercises only sequential acquisition with a fully written PID.
- reproduction: Use the injectable filesystem to interleave two acquisitions: pause A after openSync succeeds but before writeSync; let B read the empty lock, remove it and acquire its replacement; then resume A. Both acquisitions return ok. Also interleave two stale-holder takeovers. Require exactly one successful writer in both deterministic tests.

### X4-04 — severity 1 — The authoritative AI spend cap is still only a stand-in, not a delivered control
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: The implementation explicitly demotes its process ledger to advisory and identifies the real AI Gateway per-client cap as the sole authority. gateway-cap-primary.test.ts proves refusal against a hand-written transport counter, while explicitly disclaiming real Gateway configuration. No supplied provisioning or production adapter establishes the approved daily/monthly ceilings on the authoritative side of the boundary. This is the existing L4/R14-01 blocker, not a request to resume prototype hardening.
- reproduction: Against a provisioned test client, bypass or disable the advisory ledger and attempt concurrent requests beyond both approved periods. Verify actual upstream billed usage, client isolation, reset timezone and refusal propagation. Until that execution exists, neither the stand-in nor the frozen constants establishes the Phase 0 per-client Gateway cap deliverable.

### X4-05 — severity 2 — Trace metadata can carry the credential even when payloads are redacted
- file: `fullburn/engine/src/gateway.ts`
- evidence: Success and failure traces redact input/output and error messages but emit traceId, clientId and role without redaction. TraceContext is mutable at runtime, and the success path rereads req.trace.traceId after awaiting transport.post. A transport already receives the bearer and can place it into that context before the success trace. Existing leak tests inspect payloads and errors, not credential-bearing trace identity fields.
- reproduction: Keep a reference to the request's TraceContext. In a test transport, set its traceId to a string containing the received bearer value and return a valid greeting. Inspect MemoryTraceSink.events: the success trace contains the credential in traceId. Add equivalent metadata tests for refusal and grade traces.

### X4-06 — severity 2 — Secret clearance does not make the returned provider object safe to serialize
- file: `fullburn/engine/src/redact.ts`
- evidence: containsSecret checks a function's source text rather than its serialization behavior, and llm returns the original output object after clearance. A valid output with a toJSON method closing over the bearer can pass clearance and later emit that bearer through JSON.stringify. Accessor-backed values can likewise change after inspection. The redacted trace copy does not protect the original returned object.
- reproduction: Have transport.post capture the bearer in a local variable and return { greeting: 'ok', toJSON() { return { greeting: capturedValue }; } }. The method source does not contain the credential bytes, so containsSecret returns false; JSON.stringify of the successful llm result exposes them. Test the actual returned value, not only its trace copy.

### X4-07 — severity 2 — The encrypted, automatically rotated vault deliverable is not implemented
- file: `fullburn/engine/src/vault.ts`
- evidence: The only backend is MemoryVaultBackend, storing plaintext SecretRecord objects in a Map. rotate is a manually invoked setter; there is no encrypted production backend, expiry/refresh scheduler, revocation integration or automatic rotation path. done-lib explicitly marks D-vault-rotation unmet. This is a specified Phase 0 deliverable, not merely a live test that this reviewer could not run.
- reproduction: Trace every VaultBackend implementation and caller of rotate. No production implementation or scheduled caller is supplied. Require deterministic encrypted-storage, expiry, rotation-failure and per-client authorization tests before handling real OAuth tokens.

### X4-08 — severity 3 — A caller can still manufacture passing eval evidence and obtain a servable binding
- file: `fullburn/config/src/models.ts`
- evidence: attestEvalRun is public and accepts caller-authored boolean outcomes for public case IDs. bindRole accepts the resulting branded object and marks its result servable. Alternatively, RecordedTransport accepts arbitrary caller-authored outputs matching the golden expectations. The tests themselves mint successful attestations without executing a model. The disclosed L12 limitation therefore remains a direct bypass of the Phase 0 'no pass, no bind' requirement.
- reproduction: Call attestEvalRun('genome-tagger', 'llama-70b', GOLDEN_SET_CASE_IDS['genome-tagger'].map(caseId => ({ caseId, passed: true }))), pass it to bindRole with ROLE_BINDINGS, then serve that map through a non-recorded transport. No model eval has occurred, despite serving provenance being 'servable'. Keep this finding open unless the human explicitly accepts a scoped deferral.

### X4-09 — severity 3 — The installed cross-family reviewer conflicts with the executing structural gate
- file: `fullburn/engine/scripts/cross-family-lib.mjs`
- evidence: PRODUCTION_ENDPOINT contains openrouter.ai. scan-lib applies PROVIDER_HOSTS to Fullburn .mjs files, includes openrouter.ai in that pattern, and grants no cross-family runner exemption. Thus the supplied library is itself a structural finding. The runner also performs a direct fetch rather than using AI Gateway or a Langfuse sink. The recorded OpenRouter ruling and the universal Law 11 requirement need an explicit human reconciliation.
- reproduction: Run scanContent('fullburn/engine/scripts/cross-family-lib.mjs', its source), then npm run leak-check. The provider-host rule reports this file. Test the chosen human-approved routing policy against the real scan rather than silently excluding the runner or claiming a clean gate.

### X4-10 — severity 3 — Completion condition C6 claims per-guard mutation proof without establishing it
- file: `fullburn/engine/scripts/done.mjs`
- evidence: C6 executes the reachability sweep and states that the individually-disabled-and-caught half is supplied by C5's per-guard entries. C5 runs a hand-authored mutation table; no check maps every enumerated guard to an individual disabling mutation. For example, the TraceContext constructor refusal is enumerated and driven, but the supplied mutation table has no entry disabling that guard. Reachability is not proof that each guard has been individually disabled and caught.
- reproduction: Join the enumerated money-path guard population to the actual mutation targets and identify unmapped guards, starting with 'trace context requires traceId and clientId'. C6 can currently report PASS without that experiment. Add a checked mapping and execution evidence, or report the missing half as FAIL rather than attributing it to C5.

### X4-11 — severity 3 — Grade decisions need not correspond to the snapshot recorded in their trace
- file: `fullburn/engine/src/grade-registry.ts`
- evidence: snapshotForTrace reads property descriptors and records null for accessor-backed metrics. computeGrades then independently reads snapshot[area] and metrics[key], executing those accessors. A getter returning a passing reading can therefore produce an A while the supposedly corresponding trace records that reading as null. The recent trace-sanitization fix does not establish one immutable snapshot for both computation and evidence.
- reproduction: Start from ALL_A and replace data-truth.stripe_warehouse_drift_pct with an own getter returning 1. Call gradeAndEnforce. The area grades A, but the trace input records stripe_warehouse_drift_pct as null. Repeat with an accessor-backed area. Assert that grading and trace evidence use the same captured primitive readings or refuse the input.

### X4-12 — severity 3 — The completion checker's own suite can delete its active failing canary
- file: `fullburn/engine/test/integration/done-cli.test.ts`
- evidence: done.mjs plants engine/test/zz-done-meta-canary.test.ts before running the default suite. That suite includes done-cli.test.ts, whose afterEach unconditionally removes that same path. Its dirty-tree test also strips FULLBURN_DONE_ACTIVE, starts another checker, and that child removes the parent's canary before preflight. Whether the planted test runs before removal depends on worker scheduling, so the PASS-to-FAIL meta-check is not deterministic.
- reproduction: Run the completion meta-check with scheduling arranged so done-cli.test.ts executes before the canary file is loaded. Observe the active canary being removed by another test/child. Add a deterministic ownership test proving that a nested CLI probe and its cleanup cannot remove a live parent run's canary.

### X4-13 — severity 3 — The declared Workers scaffold cannot perform the required production hello-world call
- file: `fullburn/engine/wrangler.toml`
- evidence: Wrangler declares no nodejs_compat flag, while the only production meter requires trustedClock, which throws when process.hrtime is absent. workers-runtime.test.ts explicitly expects that refusal rather than a functioning call. In addition, the supplied engine has no production GatewayTransport or Langfuse TraceSink implementation: the concrete transports/sink are recordings and memory fixtures. Provisioning accounts alone cannot make AC1 work with this tree.
- reproduction: Run the actual Worker under workerd with this Wrangler configuration and attempt the Phase 0 hello-world path using production dependencies. Construction of FrozenCapsSpendMeter lacks its required clock, and there are no supplied network/tracing adapters to complete the round-trip. Require a workerd integration test and a separately recorded real Gateway-to-Langfuse call.

### X4-14 — severity 4 — Tenant identity can change while an LLM request is in flight
- file: `fullburn/engine/src/gateway.ts`
- evidence: llm snapshots clientId initially and checks vault/trace scope before dispatch, but subsequently uses the mutable req.clientId and req.trace fields in the success trace after awaiting the transport. TypeScript readonly does not freeze those objects. A caller can change the request while it is pending so spend and credentials belong to client A while the success event is attributed to client B.
- reproduction: Use a deferred transport. Start a request for fixture-testco, then mutate the request's clientId and trace to another client before resolving the transport with valid output. The reservation remains charged to fixture-testco, but the success event names the replacement client/context. Add an in-flight mutation test and require stable tenant-scoped primitives throughout the operation.

### X4-15 — severity 5 — Required Phase 0 infrastructure, legal work and threshold approval remain open
- file: `fullburn/HUMAN_TASKS.md`
- evidence: H1 still requires domain registration and formal trademark work; H3/H4 require ClickHouse Cloud and Airbyte provisioning; H5 requires the Langfuse project; H9 requires approval of the initial A-thresholds. grade-thresholds.ts explicitly says its values are pending H9. done-lib retains unmet requirement entries for infrastructure and naming. The supplied record therefore does not support Phase 0 completion even after code defects are fixed.
- reproduction: Have the human supply the required registration/legal outcome, authenticated infrastructure verification and threshold approval. Re-measure service access without exposing credentials. Do not infer fulfillment from configuration references, seeded tests or task descriptions.

## Invariants checked

- No writes outside publish/pause/promote: no production Marketing API adapter is supplied; actual write-verb enforcement is not yet applicable and was not executed.
- Cross-tenant reads fail by construction: vault key composition has targeted tests, but warehouse isolation is not implemented; in-flight request attribution fails static review under X4-14.
- The decisions ledger is append-only and captures every write: deferred to Phase 2; no warehouse ledger implementation is supplied.
- Big red button halts all spend in under 60 seconds: no UI or live advertising path exists; not verified.
- Bracket protection cannot be bypassed: no bracket state machine exists in Phase 0; golden answers do not enforce protection at runtime.
- External content is data, never instructions: the supplied hostile string is an inert test fixture, not evidence of an agent following it; the real crawler/model injection drill remains unverified.
- VERDICT.md is hash-locked after launch: launch and its lock are not supplied; not verified.
- OAuth tokens remain confined to the vault and never reach code/logs/traces: incomplete vault implementation and concrete trace/output leak paths are findings X4-05 through X4-07.
- Expired human-queue items leave the engine waiting: queue implementation is deferred; no SLA behavior was executed.
- Locked market/channel flags are inert: frozen registries and rejecting accessors have corresponding negative tests; runtime execution and live bundle unlock controls are unverified.
- A guard and its checker require a demonstrated red-proof: many tests include negative fixtures, but commit-order compliance cannot be established from a tree and C6 overstates mutation coverage.
- Every harness result requires a preceding passing meta-check: three canaries and shared classification are present; no run was observed, and lock concurrency remains defective.
- The unreachable-guard sweep is complete each round: source-derived reachability checks exist, but their execution and per-guard disabling proof were not established.
- Guards are locked by execution rather than shape: behavioral tests exist alongside remaining source-string assertions; static assertions alone were not treated as runtime proof.
- Every behavioral ledger/CLAUDE claim has a stale-claim test: the suite checks a hand-authored claims list, not every prose claim; excluded ledger artifacts were unavailable for independent examination.
- Fixes remove capabilities rather than spellings: the run-lock publication race, eval attestation factory and mutable in-flight identities retain capabilities their surrounding claims do not eliminate.
- No verdict is reached beyond the default suite's reach: decision libraries are tested, but completion-runner aggregation and C6's coverage attribution are not fully delegated or proven.
- Coverage exemptions must be measured: tracked-file scan coverage has negative cases; actual filesystem traversal, unreadable paths and binary classification were not executed.
- Readability is not secret detection: no clean-secret conclusion is drawn from file reach or the advisory scanner.
- Secret rules use an independently authored corpus and a primary external scanner: corpus tests and a pinned gitleaks CI step exist; neither scanner was executed or externally verified here.
- Repository gates are advisory until protection is enabled: the supplied record continues to identify that limitation as blocking under X4-01.
- Third-party actions are SHA-pinned and do not receive actions: write: the two supplied workflows use SHA references and declare contents: read; external action contents and repository settings were not verified.
- The discovered adversary is gated like its reviewed definition: root and workspace definitions appear identical and both paths are in Class-2, CI and verified-tree scope; actual agent registration is unverified.
- Every session first proves the checkout is this build: PHASE contains 0, but branch identity, git history and session-start behavior cannot be established from this read.
- Source-writing tools are import-safe and fail closed: entry-point guards and recovery machinery exist; exclusive writer safety fails under X4-03 and parent canary ownership fails under X4-12.
- Done is a measured exit code, not a narrative claim: the checker exists and retains explicit incomplete conditions; it was not run and its C6 evidence claim is defective.
- The completion checker never nests: environment guards exist, but its own CLI tests deliberately remove the markers and can interfere with the parent meta-check.
- Empty output cannot satisfy a gate: several parsers fail closed on missing summaries; no end-to-end shell-gate execution was observed.
- Mutation entries are checked against the current tree: the staleness check reads original bytes through the marker; actual placement of every entry was not executed.
- Lint is type-aware for floating/misused promises: both rules are errors and the include list matches tsconfig; effective lint execution and defect plants were not run.
- The cross-family reviewer is pinned and read back, and stand-ins cannot mint PASS: library tests cover those decisions; real router provenance is not independently verified and the routing conflicts with the structural gate.
- No edits occur during a checker run: this is not enforced by a checkout-wide lock; no session behavior was observed, and test cleanup can itself remove an active canary.
- Checks inside the mutation harness read committed bytes through its marker: staleness and canary-presence checks use readThroughInFlight; this read does not establish a valid harness result.
- Historical claims about earlier cross-family findings: treated as historical statements, not proof of current behavior or closure.
- One harness per checkout: violated by lock publication and stale-takeover interleavings in X4-03.
- The Gateway origin check precedes the first vault read: that ordering is present and the supplied test counts reads; actual execution is unverified.
- Secret checks traverse every depth or refuse: the walker removes the earlier depth cutoff, but does not establish safe serialization or immutable clearance under X4-06.
- No pass, no bind holds on serving and every decision is traced: arbitrary map copies are refused, but caller-minted attestations still authorize serving; real Langfuse publication is absent.
- A fix's scope must include every relevant gate: the Class-2 CI-scope expansion still does not expand the verified-tree hash for root configurations, as X4-02 demonstrates.

## Limitations (what a read cannot establish)

- This was a text-only review. No endpoint, test, mutation, browser, scanner, shell command, live spend-cap attack or reproduction was executed. Reproduction descriptions are proposed deterministic checks, not observed results.
- The verified-tree identifier and bundle completeness were supplied by the caller; this read could not independently recompute git object hashes, inspect file modes/symlinks, validate installed dependencies or compare working-tree bytes with the index.
- VERIFIED_TREE_SCOPE explicitly excludes reports/ and APPROVALS/. Their actual contents, prior finding dispositions, human rulings, gate acknowledgments and report provenance were not independently inspected. References to earlier findings preserve their original meaning and do not establish closure.
- Current GitHub branch protection, required-check behavior, authenticated human ownership, bypass privileges and merge rejection require external verification. The findings use the unresolved state documented in the supplied tree, not a fresh API measurement.
- Real AI Gateway configuration, credential scoping, daily/monthly cap semantics, pricing, concurrency behavior, billing receipts and timezone resets were not observable. A hand-written transport counter cannot verify those properties.
- No real Langfuse project, trace stream, eval upload, ClickHouse instance, Airbyte instance, vault backend, domain registration or trademark result was available.
- Three decision paths were examined: LLM success, LLM refusal and grade enforcement. They have trace-interface calls, but actual Langfuse delivery was not established. Eval scoring/rebinding likewise lacks independently verified live-model provenance.
- No live logs or stored traces were supplied for token scanning. Absence of an obvious credential in this text is not proof that code, logs or traces are leak-free.
- Bracket timeouts, attribution-window edges, Airbyte gaps, duplicate webhook reconciliation, policy vetoes, trust-ladder transitions, red-button latency and staggered onboarding cannot be verified before their later-phase implementations exist.
- The listed tests were read, not run. Their baseline health, mutation sensitivity, shuffled-order determinism, workerd compatibility and interrupted-run recovery remain unverified.
- No Phase B tests or report files were written in this read. Fixes require builder implementation, deterministic regression tests, re-attack and the human-owned approval process.
- Monthly Council research verification, model-failover drills, live injection drills, staging grades, canaries and exact rollback behavior were not performed; this Phase 0 read is not a substitute for them.
