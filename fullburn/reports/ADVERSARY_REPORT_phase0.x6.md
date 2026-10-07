# ADVERSARY REPORT phase0.x6
Verdict: FAIL
verified-tree: 854858d0ae806fae9fb4e829050bdf64a0aa6b74

Reviewer-family: OpenAI (gpt-6-astra via OpenRouter)

Round: x6, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `573ba7e` on branch `review-request/x6`; verified tree `854858d0ae806fae9fb4e829050bdf64a0aa6b74` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-astra`, served `openai/gpt-6-astra` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1791328047-hyjAh7yix0CFYu5YpUAY.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 122 files, 1511964 bytes sent; omitted as binary: none.
Usage: 413811 prompt, 8926 completion tokens. Started 2026-10-06T23:07:26.963Z.
Verdict basis: 16 finding(s) at severities 1,2,3.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X6-01 — severity 1 — An unreviewed branch can mint an accepted review attestation
- file: `.github/workflows/cross-family-read.yml`
- evidence: The workflow executes npm ci and npm run cross-family-read from the branch requesting review, with contents:write, id-token:write and attestations:write. checkReportProvenance accepts the review workflow's signer URI at any ref; it does not bind the producer to a trusted workflow revision. The workflow, package script and reviewer implementation do not require money-cap approval. Consequently, the signature proves that this workflow path attested some bytes, not that the pinned reviewer produced them.
- reproduction: In a disposable branch, replace the review command with a generator for a handwritten PASS naming target tree T, while retaining the attestation step. Push that branch under review-request/. Copy the resulting attested report into the target branch. The current provenance predicate accepts the workflow signature regardless of the producer branch or implementation revision. Existing tests reject another workflow path but never an altered producer at the accepted path.

### X6-02 — severity 1 — Required checks still execute the proposed gate rather than trusted gate machinery
- file: `.github/workflows/fullburn-ci.yml`
- evidence: Only the scope calculation uses the base checkout. The workflow definition and the adversary/class2 gate commands themselves remain controlled by the proposed branch. HUMAN_TASKS records that mandatory CODEOWNER review is off. Marking fullburn-ci.yml and class2-gate.mjs as requiring approval cannot enforce approval when their proposed versions decide whether that check runs.
- reproduction: In a disposable PR, raise a cap and replace the four jobs' bodies with successful no-op steps while preserving their required check names. Alternatively, replace the proposed class2-gate command with an unconditional successful exit. Verify the PR is refused by an independently enforced trusted workflow or repository rule; no such enforcement is established by this tree. The scope-step tests leave the workflow and actual gate commands trusted, so they do not cover this attack.

### X6-03 — severity 1 — Approval authentication is not bound to the approval bytes being consumed
- file: `fullburn/engine/scripts/class2-gate.mjs`
- evidence: The CLI reads approval content from the current checkout but authenticates the commit found by git log --diff-filter=A. A document added and then edited within the same PR still has status added relative to the base. checkReportsAppendOnly therefore does not detect the intervening modification. The last author's self-asserted name is checked only against an automation denylist.
- reproduction: Have a verified maintainer commit add a benign approval document on a PR branch. In a later unsigned commit with a non-denylisted author name, change that document to authorize a different cap transition and make the corresponding cap change. The fetched authentication still describes the original addition, while the parsed hashes come from the altered document. Add an integration case with separate addition and modification commits; the existing authentication tests vary only the addition commit's API record.

### X6-04 — severity 1 — The authoritative AI spend control remains an unprovisioned prerequisite
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: The implementation explicitly declares the process ledger advisory and identifies the remote per-client Gateway cap as the primary control, while also stating its real configuration remains blocked on H2/L4. gateway-cap-primary.test.ts implements the authoritative ceiling inside a stand-in transport. The new HTTP transport can dispatch using credentials without establishing that the destination has the approved daily/monthly ceilings and accounting boundaries. Local settlement records a fixed role estimate, not a demonstrated upper bound on provider charges.
- reproduction: In a controlled staging account, verify the actual per-client daily/monthly Gateway limits, timezone/reset semantics and concurrent in-flight behavior against caps.ts. Repeat the existing bypassed-ledger test against that account, using provider usage receipts rather than the stand-in's fixed one-cent charge. Until that succeeds, the supplied code and tests do not establish the primary control required to close Phase 0; merely disclosing the missing control does not close this money finding.

### X6-05 — severity 2 — Buffer.toJSON bypasses the new binary-output refusal
- file: `fullburn/engine/src/gateway.ts`
- evidence: The binary check runs in JSON.stringify's replacer, after an object's toJSON method has run. A Node Buffer becomes a plain object containing type and numeric data before the replacer inspects it. opaque remains false, and containsSecret does not decode that numeric array. The X5-05 tests cover Uint8Array, ArrayBuffer, DataView, Map and Set, but not Buffer.
- reproduction: Extend the existing hardening test with a transport returning { greeting: 'ok', extra: Buffer.from(CANARY_SECRET) }. Call llm and decode the returned extra.data. Source reasoning shows that the credential bytes are returned and can also enter the trace instead of producing the binary-data refusal. This reproduction is supported by the project's Node test runtime.

### X6-06 — severity 2 — Failed breach rotation never attempts provider revocation
- file: `fullburn/engine/src/vault-crypto.ts`
- evidence: revokeAndRotate calls issue first. If issuance throws, returns an empty value or returns the old value, the method quarantines locally and throws without invoking the supplied revoke function. A known-compromised credential can therefore remain usable at its provider even when revocation is available. The declared breach runbook requires revoke then rotate; local quarantine cannot invalidate a stolen token.
- reproduction: Store a credential, supply an issuer that rejects and a revoker that records calls, then invoke revokeAndRotate. Assert the old credential is submitted for provider revocation despite issuance failure. The current branch makes zero revoker calls; the existing failure-path test asserts only local unreadability.

### X6-07 — severity 2 — A delayed scheduled rotation can overwrite a newer quarantine
- file: `fullburn/engine/src/vault-crypto.ts`
- evidence: rotateDue reads a credential and checks its quarantine state before awaiting issue. After issuance it calls put, which rereads the current record and writes an unquarantined replacement. The CAS therefore protects only the final write, not the version on which the issuance decision was based. A concurrent breach quarantine can be overwritten by a stale rotation result.
- reproduction: Pause rotateDue inside its issuer after it reads version 1. Complete a failing revokeAndRotate that quarantines the same slot as version 2. Resume the scheduled issuer with a nonempty replacement. put reads version 2 and writes version 3 with q=false. Assert quarantine remains effective unless explicitly authorized to clear it; the current implementation instead makes the slot readable again. Existing concurrency tests exercise rekey versus put, not rotation versus quarantine.

### X6-08 — severity 2 — An in-flight unlock can reinstall plaintext that has been quarantined
- file: `fullburn/engine/src/vault-crypto.ts`
- evidence: unlock snapshots the manifest and credential records, then installs its plaintext map if the lock/unlock generation is unchanged. Writes, rotations and quarantines do not advance that generation. Thus a credential read before quarantine can be installed after quarantine completes. In addition, #write updates the plaintext cache only after #advanceManifest succeeds, leaving stale plaintext on a manifest-write failure.
- reproduction: Use PausableStore to pause unlock after it has read the old secret. Quarantine that secret on the same backend, then resume unlock. The generation is unchanged, the comparison uses the old manifest snapshot, and the old plaintext is installed. Separately, unlock a credential and force manifest CAS failures during quarantine; verify the cached compromised value is not still readable. Neither interleaving is covered by the existing explicit-lock-during-unlock test.

### X6-09 — severity 3 — CI discards failed reviews from the append-only gate history
- file: `.github/workflows/cross-family-read.yml`
- evidence: The review runner writes a FAIL report and exits 1 when findings exist. The steps that name, attest and commit the report all require success(), so a failed review is only uploaded as an artifact and is absent from the branch's report history. The gate inspects committed reports, not prior workflow artifacts. A later successful review of the same tree can consequently open the gate without the earlier FAIL participating in the unresolved-business check.
- reproduction: Drive two workflow-level review outcomes against the same tree: first FAIL, then PASS. Confirm that the first report is committed and still blocks the second. Under the current step conditions, the first report is not committed, and nextCrossRound can reuse its round number on the next clean checkout. Existing CLI tests check local report creation, not retention after a failed CI step.

### X6-10 — severity 3 — Required Phase-0 live and provisioning deliverables remain open
- file: `fullburn/HUMAN_TASKS.md`
- evidence: Phase 0 requires a live Gateway-to-Langfuse round trip, provisioned ClickHouse and Airbyte, an operational encrypted auto-rotating vault, domain registration and a formal trademark check. HUMAN_TASKS continues to list these prerequisites, and PHASE0_REQUIREMENTS deliberately gives AC1-live, D-vault-live, D-warehouse and D-name no executable verification command. Production adapter tests use stubbed fetch; the only CipherStore implementation supplied is MemoryCipherStore. These are unresolved phase requirements, not completed deliverables demonstrated by the tree.
- reproduction: Map each named Phase-0 deliverable to an executed command and observed external result. Run npm run done -- phase and retain the unmet requirement rows. Obtain live trace identifiers, provisioning evidence, a production CAS-backed vault/rotation execution, and the registration/trademark records before requesting phase completion. A read cannot substitute for those missing acceptance results.

### X6-11 — severity 3 — Expected answers can still manufacture a production-serving model binding
- file: `fullburn/config/src/models.ts`
- evidence: attestEvalRun is public and accepts caller-supplied outputs. GOLDEN_SETS exports the answers, and config/test/models.test.ts explicitly constructs passing attestations from c.expected. bindRole then marks the resulting map servable by a live transport. ROLE_BINDINGS is also servable without an eval attestation. The comments acknowledge this remaining gap, but the required no-pass/no-bind provenance has not been established.
- reproduction: Without calling a model or runEval, pass GOLDEN_SETS['genome-tagger'].map(c => ({ caseId: c.id, output: c.expected })) to attestEvalRun for llama-70b, bind that attestation and serve through llm with a non-recorded transport. The map receives serving provenance despite no candidate execution. Existing tests prove rejection of missing outputs and forged object identities, not rejection of fabricated execution evidence.

### X6-12 — severity 3 — The completion checker accepts self-signed certificates as workflow identity
- file: `fullburn/engine/scripts/attestation.mjs`
- evidence: attestationsFromApi verifies a DSSE signature against the public key supplied in the same bundle and reads the claimed workflow URI from that certificate. It explicitly sets chainVerified:false. checkReportProvenance ignores that field, and done.mjs uses the result for C2/C3 and the automated ack. attestation.test.ts even constructs a self-signed certificate with the desired signer SAN and treats the reader result as good. CI's stronger verification does not make this independent completion measurement authenticated.
- reproduction: Take the self-signed bundle generated by attestation.test.ts and pass its parsed result to checkReportProvenance with the matching digest and repository. It is accepted without a trusted issuer, certificate-chain verification or transparency verification. Add a negative test for this composition, and make the completion path perform the same trusted verification as the CI path rather than inferring that CI did so.

### X6-13 — severity 3 — Eval runs reuse trace identities across models, runs and clients
- file: `fullburn/engine/src/eval-harness.ts`
- evidence: runEval creates trace IDs as eval-${role}-${caseId}, omitting the run, model and client. LangfuseTraceSink sends that value directly as the trace-create body's id. Two candidate evaluations therefore address the same remote trace records; different clients do as well. The in-memory sink appends events to an array and consequently hides this remote-identity collision.
- reproduction: Run the same golden set for two models and two clients through a capturing Langfuse HTTP stub. Compare body.id for corresponding cases: they are identical despite different decisions and client scopes. Verify against Langfuse that all decisions remain separately queryable and their costs reconcile; the current identifier construction cannot represent those decisions as distinct traces.

### X6-14 — severity 3 — The traced input can differ from the prompt actually dispatched
- file: `fullburn/engine/src/gateway.ts`
- evidence: llm snapshots role, clientId and traceId, but not req.input. AiGatewayHttpTransport serializes the input before awaiting fetch, while the success and failure trace paths later reread req.input. A caller can mutate or replace the request input during that await, causing the trace to describe different evidence from the prompt the provider received. The X4-05 lock covers identity mutation only.
- reproduction: Use the production HTTP adapter with a fetch stub that captures the serialized request and waits on a barrier. While it is waiting, replace req.input or mutate a nested field, then release the response. Assert the trace input equals the originally dispatched JSON. The current code traces the later input instead.

### X6-15 — severity 3 — The declared Workers deployment cannot construct the required production meter
- file: `fullburn/engine/src/trusted-clock.ts`
- evidence: trustedClock requires process.hrtime.bigint and refuses construction when it is absent. engine/wrangler.toml declares no nodejs_compat flag, and workers-runtime.test.ts deliberately proves that the clock refuses after removing process. llm accepts only FrozenCapsSpendMeter, whose construction reaches this clock. Fixing import-time initialization therefore did not make the Phase-0 agent call usable on the declared deployment target.
- reproduction: Run the supplied Worker configuration under workerd, construct FrozenCapsSpendMeter and attempt the hello-world call with stubbed external services. The required acceptance result is a traced call, not merely a successful module import followed by clock refusal. Resolve the runtime/clock choice with the human and add a real Workers-runtime execution test.

### X6-16 — severity 3 — The guard sweep excludes the new production collaborators
- file: `fullburn/engine/test/money-path-guards.ts`
- evidence: MONEY_PATH_ROOTS contains only gateway.ts and the population follows its static imports. The actual HTTP transport, Langfuse sink and encrypted vault are supplied through interfaces, so gateway-http.ts, langfuse-sink.ts and vault-crypto.ts are not reached by this graph. Their guards now execute on the production call path but are absent from the population used to substantiate DONE condition C6. Selected adapter mutation entries do not establish exhaustive per-guard coverage.
- reproduction: Enumerate moneyPathModules for this tree and compare it with the concrete production collaborators exported by index.ts. Confirm the three adapter modules are absent. Add a refusing guard to one of those concrete collaborators without a sweep entry: the current population remains unchanged. The acceptance boundary must account for runtime-injected production implementations rather than treating the static gateway import closure as the complete money path.

## Invariants checked

- No write outside publish/pause/promote: no Marketing API adapter is supplied at Phase 0; the write-verb invariant is deferred to Phase 6, not execution-verified.
- Cross-tenant reads fail by construction: client-bound vault handles and tenant-bound ciphertext AAD were examined; warehouse isolation is not implemented at this phase, and quarantine/cache concurrency remains defective.
- The decisions ledger is append-only and captures every write: explicitly deferred to Phase 2; no warehouse audit-ledger execution was available.
- The big red button halts all spend within 60 seconds: no applicable UI or live ad-spend path exists in the supplied phase; unverified.
- Bracket protection cannot be bypassed: bracket implementation is deferred to Phase 5; golden-answer fixtures do not enforce the runtime bracket.
- External content is data, never instructions: the hostile fixture is an inert mock-output test, not a live agent injection drill. No embedded fixture instruction was followed in this review.
- VERDICT.md is hash-locked after launch: deferred to Phase 6; no launch or sealed verdict was available to verify.
- Tokens remain out of code, logs and traces: redaction paths, credential corpus and scanner configuration were examined; Buffer serialization and vault breach-handling findings remain open. Live logs and Langfuse were unavailable.
- A queue item past SLA leaves the engine waiting: queue implementation is deferred to Phase 6; unverified.
- Locked market/channel flags remain inert: frozen registries and rejecting accessors have targeted mutation, clone and prototype tests; those tests were read, not executed.
- Spend caps are immutable and human-approved: frozen constants and local reserve/settle tests were examined; authoritative remote enforcement and the CI approval trust boundary remain unresolved.
- A guard and its checker require a red-proof: multiple negative fixtures and mutation entries exist, but this read cannot establish their pre-fix/post-fix behavior.
- Every harness result requires a passing meta-check: the runner invokes three canaries before its mutation loop; no harness result was executed or accepted by this review.
- The unreachable-guard sweep must be complete: message/class-specific drives and marker-aware source reads were examined; the concrete production adapter population is missing.
- Guards are locked by behavior rather than shape: substantial behavioral coverage exists, but several gate and configuration checks still rely on source shape; no claim of universal behavioral coverage is established.
- Behavioral ledger/CLAUDE claims must carry stale-claim tests: the supplied checker contains a manually maintained claim table; reports and the live-verification ledger are outside the supplied verified scope, so their current claims could not be audited.
- Capability removal must be distinguished from narrowing: the source openly retains in-process ledger bypass and caller-created eval evidence; neither was treated as closed.
- No verdict is reached where the default suite cannot see it: pure decision modules and CLI integration tests were examined; workflow trust, failed-review retention and provenance composition are not established by those tests.
- Coverage exemptions must be measured: byte-based scan coverage tests were examined; no actual repository scan or coverage enumeration was run.
- The secret ruleset must not validate itself solely from its own patterns: an independently described credential corpus and primary gitleaks CI step are present; scanner execution and primary-rule coverage remain unverified.
- Workflow actions must be SHA-pinned and permissions explicit: the supplied workflows declare both; the review workflow nevertheless executes branch-controlled code with signing privileges.
- The adversary discovery mirror must match its reviewed source: both supplied definitions appear identical and are included in the scope; registration at session launch was not observable.
- Source-writing tools must be import-safe and fail closed: entry guards, mutation recovery, run locking and interrupt-drill code were examined; crash, signal and filesystem behavior were not executed.
- Completion must be mechanically measured at one tree: done.mjs refuses an initially dirty tree and has a meta-check, but its weaker attestation verifier can incorrectly accept review provenance. No completion command was run.
- The completion checker never nests: VITEST and FULLBURN_DONE_ACTIVE refusals have CLI tests; their execution was not verified.
- Mutation entries must remain applicable to the tree: marker-aware staleness checks are present; no current staleness or mutation result was measured.
- Lint must be type-aware over the TypeScript project: the two required rules and production-path ignore checks are present; lint was not executed.
- The cross-family reviewer must be pinned and a stand-in must not mint PASS: library checks enforce this for the intended runner, but branch-controlled producer execution can bypass that runner before attestation.
- No edit may occur while a checker is in flight: this is a process requirement; the text bundle cannot establish compliance.
- One harness per checkout: atomic-link acquisition and takeover-mutex tests were examined; real multiprocess and crash behavior remain unverified.
- Origin validation precedes the first vault read: the source orders assertGatewayBase before the priming read and tests count vault accesses; execution was not available.
- Secret checks must cover every depth: containsSecret has a cycle/size guard rather than a depth exemption, but the preceding JSON transformation can conceal Buffer bytes.
- No pass, no bind on the serving path: binding identity is checked, but exported expected answers can still manufacture a servable attestation.
- Every decision must be traced: llm success/refusal and gradeAndEnforce paths were examined; live delivery was not verified, and eval trace collisions plus mutable input snapshots compromise trace evidence.

## Limitations (what a read cannot establish)

- This was a read-only review of the supplied text. No commands, endpoints, tests, mutation probes, browser flows or external APIs were executed. Reproduction steps describe tests to run, not observed execution results.
- The supplied verified-tree hash and file inventory could not be independently recomputed from Git objects or checkout bytes.
- The verified scope excludes reports/ and APPROVALS/. Historical findings, signed rulings, deferrals, prior review artifacts, their append-only history and current live-verification ledger were not supplied for independent authentication.
- Phase-0 checklist examined: Workers/TypeScript scaffold; cap constants; role cards and bindings; eval harness and family diversity; Grade Registry scaffold; CI; per-client Gateway wiring; Langfuse helper/sink; project memory and adversary installation; warehouse/Airbyte provisioning; encrypted/rotating vault and leak scan; switchboard; domain registration and trademark check. Source presence was not treated as executed acceptance.
- Acceptance criteria examined: live hello-world Gateway/Langfuse round trip; frontier-to-open-source evaluated rebind; seeded grade computation/publication; actual PR blocking without a review; failed runtime cap mutation. None was execution-certified by this read.
- Actual branch protection, required workflow enforcement, GitHub approval authentication, artifact-attestation verification and resistance to modified-workflow PRs require controlled GitHub execution.
- The primary remote spend control requires staging verification of configured limits, per-client credential binding, local-calendar resets, pricing, concurrent requests, retries and actual provider receipts.
- ClickHouse, Airbyte, provider accounts, production vault storage, rotation scheduling, domain ownership and trademark completion cannot be established from this bundle.
- Observability inspection covered llm success, llm refusal and gradeAndEnforce. Real Langfuse ingestion, trace uniqueness, queryability, secret containment and cost reconciliation were not observed.
- Airbyte gaps, attribution-window edges, duplicate webhooks, bracket timeouts, revenue promotion, trust-ladder transitions, queue SLA behavior, second-client onboarding and the red-button drill concern later-phase paths absent here; they are not PASS results.
- No live model-failover or agent prompt-injection drill was run. The model's served identity and the production router's behavior cannot be authenticated from self-described repository text.
- No Phase B tests were added, no production code or governance files were modified, and no report file was written by this read. The builder must reproduce and remediate findings, then obtain independent re-attack and deterministic regression evidence.
