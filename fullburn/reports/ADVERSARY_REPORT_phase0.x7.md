# ADVERSARY REPORT phase0.x7
Verdict: FAIL
verified-tree: 9601eb584b2ff2a8b24fa8b93b3d2065e2934fcf

Reviewer-family: OpenAI (gpt-6-astra via OpenRouter)

Round: x7, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `b516d64` on branch `HEAD`; verified tree `9601eb584b2ff2a8b24fa8b93b3d2065e2934fcf` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-astra`, served `openai/gpt-6-astra` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1791542482-HDDqV8aIIMOMe553rUsD.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 125 files, 1584771 bytes sent; omitted as binary: none.
Usage: 434268 prompt, 7388 completion tokens. Started 2026-10-09T10:41:22.141Z.
Verdict basis: 12 finding(s) at severities 1,2,3,5.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X7-01 — severity 1 — Verified-tree and approval boundaries do not cover symlink referents
- file: `fullburn/engine/scripts/gate-lib.mjs`
- evidence: VERIFIED_TREE_SCOPE hashes git index entries, while cross-family-read.mjs and the approval gate read filesystem contents with readFileSync, following symlinks. No gate rejects symlink modes or requires their referents to be within the protected scope. The coverage tests also compare lexical paths, not referents. A protected cap module can therefore refer to a sibling-project file whose later edits neither change the verified hash nor require a cap approval.
- reproduction: In a scratch repository, make fullburn/config/src/caps.ts a symlink to ../../../pulsern/caps.ts containing the original cap module. Establish the initial reviewed/approved state, then change only pulsern/caps.ts. Compare currentFullburnTreeHash before and after, inScope for the changed path, and class2TouchedPaths. The hash stays unchanged and the sibling edit owes no approval, although reading/importing the protected module returns changed caps.

### X7-02 — severity 1 — A verified commit signature does not authenticate the commit's author as its signer
- file: `fullburn/engine/scripts/github-auth.mjs`
- evidence: commitAuthFromApi combines commit.verification.verified with body.author.login. checkApprovalAuthentication treats those as proof that the maintainer authenticated the approval. Git author and signing committer are distinct identities: another account can sign a commit whose author field names the maintainer. Neither the API reader nor its tests establish that the verified signing identity belongs to the maintainer.
- reproduction: Using a separate GitHub account with a registered signing key, create a correctly formatted cap approval with the maintainer's linked author email but the separate account as committer/signing identity. Fetch GitHub's commit record and supply it to fetchCommitAuth/checkMoneyCapGate. If GitHub reports the signature verified and resolves the author to the maintainer, the current predicate accepts it without checking who signed. Add a fixture explicitly distinguishing author, committer, and verified signer.

### X7-03 — severity 1 — The designated primary AI spend control is still an unimplemented deployment prerequisite
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: The source explicitly demotes the local ledger to advisory and identifies L4, blocked on H2, as the authoritative Gateway-cap configuration. gateway-cap-primary.test.ts proves only that an authored stand-in refuses. No production provisioning or verification path establishes daily/monthly limits, client-local accounting periods, or a credential-to-client cap binding before AiGatewayHttpTransport sends a billable request.
- reproduction: Configure a valid Gateway credential without upstream spending limits and use the existing test's ledger-bypass sequence with the real HTTP adapter in a controlled account. Nothing in the adapter requires proof of an upstream cap. Before any live test, supply independently verified Gateway configuration and demonstrate refusal with local metering absent; the existing mock does not establish this property.

### X7-04 — severity 2 — Approval filenames execute shell substitutions inside the trusted gate
- file: `fullburn/engine/scripts/class2-gate.mjs`
- evidence: PR-controlled approval paths are interpolated into execSync shell commands using JSON.stringify. JSON double quoting is not shell escaping: dollar substitutions and backticks remain executable inside double quotes. Both the authoredBy git log and touchedIn git log process these paths. fullburn-gates.yml runs this trusted script with GITHUB_TOKEN available, despite its claim that the PR is only data.
- reproduction: In the scratch gate repository, add an approval file literally named fullburn/APPROVALS/$(touch gate-shell-sentinel).md and invoke class2-gate.mjs. The authoredBy command evaluates the substitution and creates the sentinel before any approval-authentication refusal. Extend gate-cli.test.ts with this filename and assert that no side effect occurs.

### X7-05 — severity 2 — Early refusal traces can contain an unredacted vault credential
- file: `fullburn/engine/src/gateway.ts`
- evidence: secrets starts empty and is populated only after role, bindings, trace, vault-scope, and Gateway-origin validation. Any earlier refusal calls traceFailure, which serializes the snapshotted input using that empty redaction set. Existing containment tests put the credential in input only on a path that reaches the priming vault read.
- reproduction: Use makeDeps with its existing canary credential and call llm with input containing CANARY_SECRET but trace set to null. Catch the refusal and serialize sink.events. The failure trace contains the credential because the TraceContext guard fires before secrets is populated. Repeat with an invalid binding or Gateway base. Early refusals must not copy uncleared input into telemetry.

### X7-06 — severity 2 — A write-start generation check still permits an unlock to install stale plaintext
- file: `fullburn/engine/src/vault-crypto.ts`
- evidence: #write and #replaceExactly increment #generation only before their awaits. An unlock starting after that increment captures the newer generation, can read the old record before the write commits, and can install it after the write completes without detecting a generation change. The X6-08 test covers an unlock that starts before the write, not this reverse ordering.
- reproduction: Use a barrier-backed CipherStore. Start put and pause it before its record CAS; then start unlock, let it read the old record, and pause that read's return. Complete put, then release unlock. Its generation comparison succeeds and read returns the old value. Run the same schedule against a quarantine write and verify that compromised plaintext cannot be reinstalled.

### X7-07 — severity 2 — Breach rotation retains compromised plaintext while external operations are unresolved
- file: `fullburn/engine/src/vault-crypto.ts`
- evidence: revokeAndRotate awaits the provider revoker and issuer before quarantining or deleting cached plaintext. A blocked revoker/issuer leaves the known-compromised value readable indefinitely. Even after successful provider revocation, a subsequent store failure can leave the old cached value installed. The tests exercise completed failures, not reads during those waits.
- reproduction: Put and unlock a credential, invoke revokeAndRotate with a revoker held on a promise barrier, and read the credential before releasing the barrier. The compromised value is still returned. Repeat with an issuer barrier and with a store failure after revocation. The breach operation needs a fail-closed local quarantine boundary before external awaits.

### X7-08 — severity 2 — A stale breach rotation can overwrite a newer quarantine
- file: `fullburn/engine/src/vault-crypto.ts`
- evidence: rotateDue now uses #replaceExactly against the record that justified issuance, but revokeAndRotate still completes with put. put rereads current storage and retries, so an older breach operation can overwrite a newer quarantine with its stale replacement. This is the X6-07 capability on the adjacent rotation path.
- reproduction: Start breach rotation A from version 1 and pause its issuer. Complete breach rotation B with a failing issuer so it writes a version-2 quarantine. Resume A with a replacement string. A calls put, writes a later non-quarantined version, and a fresh unlock returns that value. Add a deterministic two-operation test analogous to the existing scheduled-rotation/quarantine test.

### X7-09 — severity 3 — Recorded or fabricated eval answers become production-serving evidence
- file: `fullburn/config/src/models.ts`
- evidence: attestEvalRun accepts caller-supplied outputs and grades them against exported expected answers; bindRole then adds the result to SERVABLE. config/test/models.test.ts demonstrates minting such evidence directly from c.expected. runEval supports only RecordedTransport, and gateway.ts explicitly refuses a candidate binding through a live transport. Thus placeholder recordings can authorize production serving, while a genuine live candidate-evaluation path is absent.
- reproduction: Without calling any model, pass GOLDEN_SETS['genome-tagger'].map(c => ({caseId: c.id, output: c.expected})) to attestEvalRun for llama-70b, bind the resulting attestation, and serve through AiGatewayHttpTransport. Conversely, attempt to evaluate an unbound candidate using the live transport: the candidate guard refuses it. Separate synthetic evidence from production-eligible evidence and provide a trusted live-evaluation path.

### X7-10 — severity 3 — Langfuse delivery succeeds without acknowledgement of the submitted event
- file: `fullburn/engine/src/langfuse-sink.ts`
- evidence: For HTTP 207, emit checks only that errors is an empty array. It never requires successes to contain the submitted event ID. Other 2xx statuses are accepted without inspecting their body at all. A response acknowledging no event therefore satisfies the fail-closed tracing boundary. Existing tests cover explicit errors and malformed 207 JSON, not missing or unrelated success acknowledgements.
- reproduction: Make the stubbed fetch return status 207 with {"successes":[],"errors":[]} or a success for an unrelated ID. Call emit and then llm with this sink. Both resolve although the response confirms no ingestion of the submitted event. Require the endpoint's documented positive acknowledgement and test absent, duplicate, and wrong-ID acknowledgements.

### X7-11 — severity 3 — Caller-selected trace IDs permit cross-client trace overwrites
- file: `fullburn/engine/src/langfuse-sink.ts`
- evidence: LangfuseTraceSink uses event.traceId directly as the trace-create body ID and event.clientId only as userId. TraceContext accepts any nonempty ID. Two internally consistent contexts belonging to different clients can therefore use the same Langfuse trace ID. The mismatch tests only reject a context whose client differs from its own request; they do not protect the remote ID namespace.
- reproduction: Send two valid calls for separately provisioned clients using new TraceContext('shared-id', clientId) for each. Inspect the emitted Langfuse batches: both target body.id='shared-id' with different userId/input/output. Use an upsert-shaped sink fixture to demonstrate that one client's decision overwrites or merges with the other's. Namespace remote IDs by tenant and decision identity.

### X7-12 — severity 5 — Phase 0 still has mandatory outstanding external deliverables
- file: `fullburn/HUMAN_TASKS.md`
- evidence: H1, H3, H4, H5, H6, H7 and H9 remain recorded as tasks rather than completed evidence. PHASE0_REQUIREMENTS explicitly marks the real Gateway/Langfuse round trip, deployed vault, warehouse provisioning, and domain/trademark deliverables unmeasurable. The Worker has no scheduled rotation handler or production CipherStore implementation; vault-crypto.ts states that its production CAS store must be a Durable Object, whereas done-lib's D-vault-live requirement still describes KV.
- reproduction: Map ENGINE_BUILD.md Phase 0 deliverables to PHASE0_REQUIREMENTS and HUMAN_TASKS.md. Inspect index.ts and wrangler.toml for the deployed vault store/rotation wiring. Run the completion checker when execution is available: these requirements have no executable completion path today. Supply authenticated completion evidence for external tasks and reconcile the KV-versus-Durable-Object deployment requirement with the human.

## Invariants checked

- No Marketing API write outside publish/pause/promote: no advertising adapter is implemented in Phase 0; live write enforcement is not established.
- Cross-tenant reads fail by construction: vault key composition and scoped-handle tests were examined; warehouse isolation is deferred, and remote trace namespace separation fails under X7-11.
- The decisions ledger is append-only and captures every write: not implemented until Phase 2; no runtime proof is available.
- The big red button halts all spend in under 60 seconds: not implemented in Phase 0.
- Bracket protection cannot be bypassed: bracket execution is not implemented; golden examples are not enforcement.
- External content is data, never instructions: supplied hostile test strings were treated as data; the inert mock test does not establish resistance by a live agent.
- VERDICT.md is hash-locked after launch: launch and its sealed verdict are absent from this scope; no post-launch check was verified.
- Tokens remain confined to approved secret handling: encryption and containment tests were examined; X7-04 through X7-08 identify unresolved credential risks.
- Overdue human-queue items wait: the queue is deferred to Phase 6 and cannot be verified here.
- Locked market/channel flags remain inert: frozen registries, own-property accessors, staged-channel refusal, and mutation tests support the local implementation; execution was not performed.
- Guards and checkers require a red-proof: many positive/negative test pairs exist; current signature-authentication, shell-path, trace-acknowledgement and vault-interleaving gaps are not covered.
- Harness results require a passing meta-check: the runner executes its three canaries before the mutation table; no result from this tree was executed or accepted as verified.
- The unreachable-guard sweep is complete: import-graph enumeration and explicit production roots were examined; this is a bounded static population, not proof that every runtime decision or collaborator is covered.
- Guards are locked by execution rather than shape: numerous behavioral tests exist, but workflow authority checks still largely inspect source strings; their GitHub behavior remains unverified.
- Behavioral ledger and CLAUDE.md claims carry tests: the claims test checks a selected list and cited row presence, not the truth of every prose assertion; excluded ledger bytes were unavailable.
- Fixes remove capabilities rather than spellings: X7-08 shows the stale-rotation capability remains on the adjacent breach path.
- No verdict is reached outside default-suite visibility: extracted decision libraries are present, but trusted CLI shell interpolation and incomplete trace acknowledgement are missed boundary decisions.
- Coverage exemptions must be measured: scan tests inspect read coverage, but symlink referents are not bound to the verified-tree or approval scope.
- Readability is not credential detection: advisory format rules and a separate primary gitleaks CI stage are declared; a clean secret scan was not executed or inferred.
- Credential canaries must be independent of the rules: a format-oriented corpus and rule-removal checks exist; this does not prove detection of every token format.
- CI gates are advisory until repository protection enforces them: workflow files exist, but current GitHub rulesets, bypass state and actual blocked merges were not observable.
- Third-party actions are SHA-pinned and actions:write is restricted: the three supplied Fullburn workflows use SHA references and no actions:write permission; sibling workflows are outside this review.
- The discovered adversary matches its reviewed definition: both supplied definition files match textually; live registration was not observed.
- Each session proves checkout identity first: PHASE contains 0 in the supplied text; branch identity, HEAD and index state could not be independently checked.
- Source-writing tools are import-safe and fail closed: entry guards, recovery markers, locks and signal-drill code were examined; crash recovery and scheduling were not executed.
- Done is a measured exit code: no completion is granted here; the supplied completion checker retains explicit unmet Phase 0 requirements.
- The completion checker never nests: environment-marker refusal and its CLI negative tests are present; execution was not performed.
- Empty output cannot pass a gate: several parsers require positive summaries, but the Langfuse sink accepts an empty success acknowledgement under X7-10.
- Mutation entries must still match the tree: read-through-marker placement checks exist; this read did not independently place or run every entry.
- Lint is a type-aware defect gate: the two required promise rules and planted-defect tests are present; no lint result is claimed.
- The cross-family reviewer is pinned and a stand-in cannot mint PASS: request/response pin checks, forced off-production FAIL and attestation checks are present; provider identity and live signature verification were not independently observed.
- No edit occurs during a checker run: this is a process requirement; this read cannot establish compliance.
- Checks inside mutation runs read original bytes where appropriate: staleness and guard-population checks use the marker; their runtime behavior remains unverified.
- One harness per checkout: atomic-link lock and takeover tests were examined; OS-level race and crash behavior was not executed.
- Gateway origin validation precedes the first vault read: the normal path and read-count tests support this ordering; early-refusal telemetry still leaks uncleared input under X7-05.
- Secret checks inspect every depth: containsSecret has cycle/size handling and deep-output tests; this does not cover early failures before the known-secret set exists.
- No pass, no bind holds on the serving path: arbitrary binding-map copies are refused, but synthetic answer evidence can create servable bindings under X7-09.
- Every decision is traced: successful calls, ordinary call refusals and grade decisions have trace paths; actual remote acknowledgement is insufficient under X7-10.
- Each protection covers its own controlling scope: trusted-main review/gate separation improves script provenance, but shell execution and symlink referents break the claimed data-only boundary.
- Completion rows state only what they measured: no execution, live provisioning or completed Phase 0 gate is asserted by this review.

## Limitations (what a read cannot establish)

- This was a text-only review. No endpoint, command, Vitest test, Playwright flow, mutation, signal drill, concurrency schedule or live service was executed. Reproduction steps are proposed deterministic checks, not observed runs.
- The supplied VERIFIED-TREE hash, file modes, symlinks, git history, clean-tree state and claimed file count could not be independently verified.
- The bundle excludes fullburn/reports and fullburn/APPROVALS by design. Historical findings, human acceptances, signed transitions, ledger contents and previous execution artifacts were not available for independent adjudication.
- GitHub branch protection, required-check enforcement, signing-key/account associations, artifact attestations and the trusted-main bootstrap/bypass state require authenticated external verification.
- Real Gateway cap capabilities/configuration, per-client credential scope, provider model routes and prices, Langfuse ingestion, ClickHouse/Airbyte provisioning, KEK deployment, domain ownership and trademark clearance were not observable.
- Three decision paths were inspected in code and tests: successful llm calls, failed llm calls, and gradeAndEnforce. No actual Langfuse trace was retrieved for any of them.
- Advertising policy submission, spend interruption, trust-rung skipping, early bracket kills, proxy-only promotion, unstable-client onboarding, queue-SLA behavior, Airbyte gaps, attribution edges and duplicate-webhook reconciliation cannot be established from the Phase 0 implementation.
- No evidence showed an agent following hostile fixture instructions. The existing mock injection test does not exercise a real model, crawler or tool-using agent.
- No tests or report files were added. Phase B locking requires an execution-capable follow-up after findings are fixed or accepted by the human.
