# ADVERSARY REPORT phase0.x5
Verdict: FAIL
verified-tree: d6e7c6162748b68dcf6ce120b60a31eac96b23a9

Reviewer-family: OpenAI (gpt-6-astra via OpenRouter)

Round: x5, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `0547c60` on branch `claude/fullburn-engine-spec-r7v5lg`; verified tree `d6e7c6162748b68dcf6ce120b60a31eac96b23a9` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-astra`, served `openai/gpt-6-astra` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1791300092-Rcgr6iJ2kEsEmJ0b3wYh.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 114 files, 1411062 bytes sent; omitted as binary: none.
Usage: 386428 prompt, 8000 completion tokens. Started 2026-10-06T15:21:32.042Z.
Verdict basis: 14 finding(s) at severities 1,2,3,5.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X5-01 — severity 1 — An unapproved scope-script edit can skip every required gate, including cap approvals
- file: `fullburn/engine/scripts/ci-scope.mjs`
- evidence: All four fullburn-ci jobs execute ci-scope.mjs from the checkout under review and skip their substantive checks when it prints relevant=false. HUMAN_APPROVAL_PATTERNS does not protect ci-scope.mjs. The tests checking scope behavior are themselves skipped by this output. This leaves an unprotected dependency in the machinery enforcing human approval of money caps.
- reproduction: In a disposable PR, change caps.ts and change the ci-scope CLI to print relevant=false and exit successfully. Leave the workflow unchanged. Each job skips its tests or gate invocation; class2-gate never checks the unapproved cap change. Confirm this against actual required-check settings before accepting the protection.

### X5-02 — severity 1 — Handwritten review artifacts can again authorize changes without an adversary review
- file: `fullburn/engine/scripts/gate-lib.mjs`
- evidence: checkAdversaryReport accepts a current-tree PASS plus any nonempty Reviewer-family value not containing Claude or Anthropic. It verifies neither runner provenance nor the production response, findings, or artifact digest. Reports are excluded from VERIFIED_TREE_SCOPE and no longer require human approval under HUMAN_APPROVAL_PATTERNS. The earlier X-03 mitigation relied on human-controlled report admission; that control has been removed without a replacement. done.mjs also derives C2, C3, C4 and C10 from this textual evidence.
- reproduction: On a disposable tree with no current-tree FAIL, add an ADVERSARY_REPORT_phase0 suffix file containing a PASS, the current verified-tree hash, and Reviewer-family: OpenAI. Do not run cross-family-read. The report gate accepts it, and a report-only addition requires no human approval. Add a claimed open finding below the header: the gate still accepts it.

### X5-03 — severity 1 — Money-cap approval checks do not authenticate the human approver
- file: `fullburn/engine/scripts/gate-lib.mjs`
- evidence: checkApprovalAuthorship only rejects a short blacklist of self-asserted Git author strings. It accepts arbitrary other authors and missing authorship; parseApprovalBlocks does not require Approved-by at all. HUMAN_TASKS records that required CODEOWNER review is now disabled. Authenticated PR authorship, even if present externally, does not prove that Sheldon approved the cap transition, and this gate consumes no authenticated approval event or signature.
- reproduction: Generate the owed blocks for a cap increase, commit a new approval document using an arbitrary non-blacklisted git user.name and user.email, and run class2-gate against the base. The existing integration test already demonstrates acceptance of identical approval bytes after changing the self-asserted author to A Human. Verify that an agent cannot perform this operation under the maintainer's repository credentials.

### X5-04 — severity 1 — The declared primary AI spend control remains an unmet Phase 0 prerequisite
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: The implementation explicitly demotes its ledger to advisory and records that real Gateway cap configuration is blocked on H2/L4. gateway-cap-primary.test.ts implements its own ceiling in a JavaScript stand-in; it does not exercise Cloudflare enforcement. No supplied provisioning or verification path installs and checks the approved daily/monthly per-client ceilings. Thus the acknowledged in-process bypasses have no established production backstop.
- reproduction: Provision the actual client-scoped Gateway control, disable local metering in a controlled staging drill, and attempt sequential and concurrent calls past both approved limits, including client-local period boundaries and process restarts. Record real upstream refusals and billing evidence. The supplied stand-in test cannot satisfy this prerequisite.

### X5-05 — severity 2 — JSON normalization reopens the binary credential-echo leak
- file: `fullburn/engine/src/gateway.ts`
- evidence: llm JSON-stringifies provider output before calling containsSecret or redactValue. A Uint8Array nested in an otherwise valid response becomes a plain object of numeric byte values. containsSecret then sees only numbers, so its binary decoder is never reached; the byte map is returned and traced. The existing A2 regression exercises redactValue directly, not this normalized gateway path.
- reproduction: Use a transport returning { greeting: 'ok', extra: new TextEncoder().encode(headers.authorization) }. Call llm with a genuine meter and binding. Inspect the returned extra object and the success trace; reconstruct its numeric values as bytes. They reproduce the bearer credential although the string-based secret check accepts the response.

### X5-06 — severity 2 — Vault encryption does not provide the claimed freshness and replay protection
- file: `fullburn/engine/src/vault-crypto.ts`
- evidence: The authenticated version is read from the same Sealed record as the ciphertext. There is no independent monotonic version or revocation authority, so restoring an entire old record restores valid old AAD and decrypts successfully. Additionally, sealed.at controls rotation eligibility but is not authenticated. The replay test changes the old record's version to the new version; it never replays the complete original record.
- reproduction: Save the raw version-1 record, rotate to version 2, restore the complete saved record, and unlock: version 1 remains decryptable. Separately change only at to a far-future timestamp and call rotateDue with an expired policy; rotation is skipped without authentication failure.

### X5-07 — severity 2 — Breach rotation leaves a known-compromised credential usable on failure
- file: `fullburn/engine/src/vault-crypto.ts`
- evidence: revokeAndRotate never revokes at the provider and has no revoke collaborator. If issuance fails or returns the same value, it throws but leaves both stored ciphertext and any unlocked plaintext usable. Its comment promises that a compromised secret must not quietly stay in service, but throwing to one caller does not disable subsequent reads or llm calls.
- reproduction: Put and unlock a credential, invoke revokeAndRotate with a rejecting issuer, catch the error, then read it through the existing ClientVault. The compromised value remains available. Repeat after a successful replacement with a provider stub that tracks whether its old credential was revoked; no revocation operation occurs.

### X5-08 — severity 2 — Concurrent vault maintenance can overwrite a newly rotated credential with an old one
- file: `fullburn/engine/src/vault-crypto.ts`
- evidence: put performs an asynchronous load/increment/write without conditional storage, and rekey loads an old record then later writes its plaintext and version unconditionally. CipherStore has no compare-and-swap or transaction operation. A rekey racing a rotation can restore an old credential after the rotation reported success. Concurrent puts can also issue the same version. The tests exercise these operations sequentially only.
- reproduction: Use a controlled CipherStore to pause rekey after it reads version 1. Complete a put or revokeAndRotate to version 2, then resume rekey's write. A fresh backend unlocks the old value and version. Also start two puts after the same initial load and verify that both return the same incremented version.

### X5-09 — severity 2 — An in-flight unlock can undo an explicit vault lock
- file: `fullburn/engine/src/vault-crypto.ts`
- evidence: unlock clears shared state before awaiting list/get/decrypt, but unconditionally installs its plaintext and client identity when those awaits finish. lock does not invalidate pending unlock operations. Consequently, locking a vault during an in-flight unlock is not a persistent refusal, and a failed later tenant switch can be followed by an earlier unlock restoring plaintext.
- reproduction: Pause a CipherStore read during unlock('a'), call backend.lock(), then release the paused read and await the original unlock. backend.read('a', name) succeeds after the explicit lock. Repeat with an overlapping failed unlock('b') to test stale completion after a tenant switch.

### X5-10 — severity 3 — A fabricated passing eval still produces a production-servable binding
- file: `fullburn/config/src/models.ts`
- evidence: attestEvalRun is publicly exported and accepts caller-supplied pass booleans for public case IDs. It marks the result GENUINE without model execution. bindRole then marks the resulting map SERVABLE, which llm accepts with a live transport. The code acknowledges this as L12's narrowing, and config tests explicitly mint attestations this way. This remains an open exception to the Phase 0 eval-gated serving requirement, not completed provenance enforcement.
- reproduction: Call attestEvalRun for genome-tagger/llama-70b with every declared case marked passed, bindRole from ROLE_BINDINGS, and serve through llm using the returned map. No runEval call or model output is required, despite the supplied llama recordings failing the threshold.

### X5-11 — severity 3 — Stale run-lock takeover still permits two simultaneous harness owners
- file: `fullburn/engine/scripts/mutate-lib.mjs`
- evidence: acquireRunLock removes the current lock pathname using rename before verifying that the moved lock is the dead one it observed. If it moved a live replacement, another contender can acquire the temporarily absent pathname. Restoration then fails with EEXIST and the moved live lock is deleted. The existing race test exercises replacement by a live holder but not acquisition by a third contender during the restoration gap.
- reproduction: Deterministically interleave three contenders: A reads a dead lock; B replaces it and starts; A renames B's lock aside; C links its own lock and starts; A detects the mismatch, cannot restore because C occupies the path, and deletes the aside. B and C both hold successful acquisition results and may mutate the same checkout.

### X5-12 — severity 3 — Phase 0's real Gateway and Langfuse round trip has no production implementation
- file: `fullburn/engine/src/gateway.ts`
- evidence: GatewayTransport and TraceSink are interfaces; the supplied concrete implementations are mock/recorded transports and MemoryTraceSink. There is no production HTTP transport, provider request/response adapter, Langfuse sink, or live hello-world command. The gateway test explicitly returns 'hello from the mock gateway'. done-lib correctly leaves AC1-live unmeasurable, but provisioning keys alone cannot supply these missing implementations.
- reproduction: After supplying legitimate Gateway and Langfuse credentials, attempt the Phase 0 hello-world AC through shipped production adapters and then query the real Langfuse project. There is no such adapter or invocation path in the supplied implementation. Add a real integration path and test its provider errors, trace delivery failures and returned schema.

### X5-13 — severity 3 — Guard mutation counts can be satisfied by source-shape failures rather than behavioral detection
- file: `fullburn/engine/test/invariants/invariants.test.ts`
- evidence: The reachability sweep enumerates throw sites from currently mutated source, then fails when a declared entry or disclosure no longer matches a throw. G6 entries replace throw new with void new, so this source-shape check catches their removal independently of behavioral coverage. G6-10, G6-17 and G6-36 target guards expressly disclosed as having no reachable input. The separate 'own disabling mutation entry' check only matches from-text within a four-line window and never checks what the replacement disables. C6 nevertheless claims every guard's own entry is caught in C5.
- reproduction: Apply G6-10 or G6-17 alone and inspect which assertions fail: the missing DISCLOSED match can produce CAUGHT without executing a violating input. For the coverage matcher, supply an entry that changes an adjacent, independently tested guard; its shared context can credit another guard without disabling it. Require behavioral failure evidence per target rather than counting source-enumeration failures.

### X5-14 — severity 5 — Other Phase 0 deliverables remain explicitly outstanding
- file: `fullburn/HUMAN_TASKS.md`
- evidence: H1, H3, H4, H5 and H7 still describe domain/trademark completion, warehouse provisioning, the Langfuse project and deployed secret infrastructure as blocking tasks. done-lib retains null commands for D-name, D-warehouse and D-vault-live. The Worker has no scheduled handler or KV binding for vault rotation. These are required Phase 0 deliverables, not later-phase work.
- reproduction: Evaluate the Phase 0 deliverable checklist against deployment evidence: produce domain registration and formal trademark results, reachable ClickHouse and Airbyte instances, a Langfuse project, and a deployed KEK/KV/rotation schedule. The current completion checker reports these requirements unmeasurable rather than completed.

## Invariants checked

- Writes restricted to publish/pause/promote: no Marketing API write implementation exists in Phase 0; runtime verb enforcement remains deferred, not verified.
- Cross-tenant reads fail by construction: scoped vault lookups and tenant-bound encryption are present; authenticated caller-to-tenant authorization and warehouse isolation are not established.
- Append-only decisions ledger with inputs and verdicts: no warehouse decisions ledger exists yet; deferred to Phase 2.
- Big red button stops spend within 60 seconds: no UI or live ad-spend path exists; not verified.
- Bracket protection window cannot be bypassed: bracket engine is not implemented; deferred to Phase 5.
- External content is data, never instructions: hostile fixtures were treated as data during this review. The supplied mock-response test does not establish resistance of a live agent.
- VERDICT.md hash lock after client-zero launch: no launch verdict is supplied; post-launch enforcement is deferred and not verified.
- OAuth tokens remain in the vault and out of logs/traces: redaction and scans are present, but gateway binary normalization and vault lifecycle defects are findings.
- Past-SLA human queue waits: no queue runtime exists; deferred to Phase 6.
- Locked market/channel flags remain inert: frozen registries and active-only accessors have direct negative tests; their execution was not verified.
- A guard and its checker require a red-proof: numerous negative tests exist, but source-shape mutation detection is still being counted as behavioral evidence.
- Harness results require a preceding passing meta-check: three canaries precede the mutation loop in code; actual results and per-target causal detection are unverified.
- Unreachable-guard sweep is completed every round: this read cannot execute it; disclosed unreachable guards and shape-based mutation credit prevent accepting full behavioral coverage.
- Guards are locked by execution, not shape: violated by parts of the guard-mutation coverage accounting; many unrelated locks do exercise behavior.
- Behavioral ledger and CLAUDE claims carry stale-claim tests: the claims list is partly handwritten and does not bind every prose assertion; reports and ledger text are excluded from this review bundle.
- Fixes remove capabilities rather than spellings: scope skipping, handwritten review admission and forged eval attestation remain reachable capabilities.
- No verdict is reached outside default-suite coverage: library decisions have tests, but CLI wiring and early scope decisions still determine whether those tests run.
- Coverage exemptions must be measured: leak-walk coverage has negative fixtures; guard-disclosure exemptions do not constitute executed guard coverage.
- Readability is not credential detection: the advisory scanner has a format corpus, but no clean-tree or clean-log conclusion is made from this read.
- Secret rules must not validate only against self-derived canaries: an independently described corpus and a separate gitleaks CI step exist; real detection execution is unverified.
- CI gates must actually prevent merges: actual branch protection is external and unverified; an in-tree scope bypass exists even if the four checks are required.
- Workflow actions are SHA-pinned and actions:write is restricted: the supplied workflows use SHA references and contents:read; the hygiene checker now excludes other workflow names, narrower than CLAUDE's standing wording.
- Adversary discovery and reviewed definition share gated bytes: root and Fullburn definitions appear identical; discovery at session launch and trusted admission of future edits are unverified.
- Session checkout readiness: PHASE reads 0 in the supplied text; Git branch, HEAD and checkout identity cannot be measured here.
- Source-writing tools are import-safe and fail closed: the harness has entry guards and recovery markers, but stale-lock takeover still permits concurrent owners.
- Done is a measured exit code: the checker leaves external Phase 0 requirements failing, but review-related rows trust forgeable report text.
- Completion checker never nests: VITEST and FULLBURN_DONE_ACTIVE refusals and negative integration cases are present; not executed.
- A gate cannot pass on missing evidence: done parsing includes positive checks, but the CI scope output can prevent all substantive checks from executing.
- Mutation entries are checked against the current tree: staleness uses original marker bytes; actual placement and results are unverified.
- Lint is a type-aware promise-safety gate: the two required rules and planted-defect tests are present; .mjs runners remain outside its declared coverage.
- Cross-family reviewer is pinned and served model read back: runner checks exist, but committed reports can bypass the runner entirely.
- No tree edits while a checker runs: there is no final tree revalidation in done.mjs; adherence to this process rule cannot be established by a read.
- Checks inside the harness account for legitimate mutations: staleness does, but guard enumeration still turns removal of a throw site into an independent source-shape failure.
- Historical cross-family review claims: prior reports are outside VERIFIED_TREE_SCOPE and were not supplied; historical counts and closure claims are not verified.
- One harness per checkout and live markers are refused: live-marker refusal exists; atomic stale takeover remains defective.
- Gateway origin validation precedes the first vault read: the ordinary code path and read-counting negative test support this ordering; execution was not performed.
- Secret checks cover every depth: containsSecret has a cycle/size bound, but cloning typed arrays before checking loses their binary identity.
- No pass, no bind on serving and every decision traced: binding-map identity is enforced, but public attestation minting admits invented eval results; no production Langfuse sink is present.
- Fix scope is checked across CI, verified tree and ownership: broad scope tests exist, but ci-scope is missing from the narrower human-approval enforcement dependency set.
- Completion rows state only what was run: C6's behavioral interpretation exceeds what its source-window matcher and shape-sensitive sweep establish.
- Fullburn protection does not cross-contaminate sibling builds: basename Class-2 rules are narrowed to root/Fullburn; shared workflow security consequences still need an explicit human-owned boundary.
- Spend caps are immutable at runtime: frozen constants and breach tests exist; the in-process meter is explicitly advisory and the primary real cap is still unestablished.
- Model families differ between builder and adversary: role-binding validation checks configured family pairs; an arbitrary textual Reviewer-family declaration is not evidence of an actual independent review.
- Grade Registry and constitution remain human-owned: ENGINE_BUILD Laws 14–15 and the adversary mandate conflict with the newer build-only automated-approval exception recorded in DONE.md and HUMAN_TASKS; the human must reconcile this authority conflict explicitly.

## Limitations (what a read cannot establish)

- This was a read-only review. No commands, endpoints, provider calls, mutations, browser tests, queue operations or deployment drills were executed. Reproductions are derived from supplied code, not claimed runtime observations.
- No tests were added and no report file was written. Phase B cannot be completed in this interface.
- The asserted verified-tree hash could not be recomputed, and the supplied text could not be compared with Git blobs or the index.
- VERIFIED_TREE_SCOPE excludes reports and APPROVALS. Consequently, historical finding closure, written human deferrals, the cited governance rulings, approval signatures and prior execution evidence could not be inspected directly.
- The human-approval exception conflicts with the unchanged master specification and adversary definition. This review does not silently amend either authority or authenticate a ruling merely because code comments describe it.
- Actual GitHub branch protection, required-check provenance, authenticated approval identity, bypass permissions and merge behavior require external inspection and disposable PR drills.
- Cloudflare Gateway limit semantics, approved client-local daily/monthly configuration, key scope, concurrent enforcement and real billing reconciliation remain unverified.
- Real Gateway model routing, Langfuse delivery, live frontier-to-open-source eval/rebind behavior and model failover cannot be established from recorded placeholder outputs.
- ClickHouse, Airbyte, domain registration, trademark clearance, secret bindings, KV infrastructure and scheduled provider rotation require external evidence.
- Warehouse reconciliation, duplicate webhooks, attribution-window edges, Airbyte gaps, trust-ladder progression, protection windows, revenue-only promotion, stalled human queues and unstable-client onboarding are not implemented at this phase and were not counted as passing.
- A seeded plaintext vault lookup is not a complete authenticated cross-client read test for Business Manager, ClickHouse, Durable Objects, R2 or Vectorize.
- No live logs or Langfuse traces were available for credential scanning. The advisory scanner's known formats do not establish absence of all secrets.
- Mutation meta-check success, per-guard behavioral catches, shuffle determinism, shared-registry behavior, interrupt recovery and race schedules require execution against this exact tree.
- Workers runtime compatibility was not tested under workerd. The supplied runtime test uses Node with its process global removed and proves refusal of clock construction, not a functioning Worker agent call.
- Monthly Council research verification, family-diversity deployment checks, rollback equivalence and the 14-day all-area-A watch window were not performed.
