# ADVERSARY REPORT phase0.x3
Verdict: FAIL
verified-tree: 1ac5fce506a37a5f71f272921acefbefdaf7c92a

Reviewer-family: OpenAI (gpt-6-astra via OpenRouter)

Round: x3, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `e1ef28d` on branch `claude/fullburn-engine-spec-r7v5lg`; verified tree `1ac5fce506a37a5f71f272921acefbefdaf7c92a` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-astra`, served `openai/gpt-6-astra` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1791109947-bzEzxGnFdk1t264TW57M.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 110 files, 1310353 bytes sent; omitted as binary: none.
Usage: 359364 prompt, 9150 completion tokens. Started 2026-10-04T10:32:26.642Z.
Verdict basis: 17 finding(s) at severities 1,2,3,5.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X3-01 — severity 1 — Required merge enforcement remains an acknowledged Phase 0 blocker
- file: `fullburn/HUMAN_TASKS.md`
- evidence: H19 remains outstanding. CLAUDE.md records that main was unprotected and every CI gate was advisory; done.mjs hard-codes C8-identity as FAIL. This carries forward F14/L37, rather than establishing current GitHub settings by execution. Additionally, H19's required-check instructions omit the separate mutation-harness job, allowing its failure to remain nonblocking even if those instructions are followed literally.
- reproduction: Have the human inspect current branch rules and required checks through GitHub. In a disposable PR, verify that a missing report, an unapproved Class-2 change, and a failed mutation-harness check each prevent merging. Require authenticated CODEOWNER approval and verify that direct pushes cannot bypass these controls.

### X3-02 — severity 1 — Class-2 paths outside Fullburn can skip every gate
- file: `fullburn/engine/scripts/ci-scope.mjs`
- evidence: CLASS2_PATTERNS protects package.json, package-lock.json, .npmrc, runner configurations, and other basename patterns at any depth. CI_SCOPE_GLOBS covers only fullburn/**, .github/**, .claude/**, DONE.md, and two root gitleaks files. Thus isClass2('package.json') is true while inScope(['package.json']) is false. All four CI jobs use that scope decision. The witness-based coverage test exercises selected Fullburn paths, not the full domain protected by the patterns.
- reproduction: Call isClass2 and inScope for package.json, .npmrc, and another root-level protected configuration. Then create a disposable PR changing only one such path: the scope step reports relevant=false and the approval/report checks do not run. Add negative fixtures for protected paths outside the currently selected directories.

### X3-03 — severity 1 — The mutation harness still has no exclusive checkout lock
- file: `fullburn/engine/scripts/mutate.mjs`
- evidence: recoverInFlight checks for a live marker only once at startup. measure writes the marker with ordinary writeFileSync, and restoreInFlight removes it between mutations. Two processes can both observe no marker before either writes one, or a second process can start between entries. Each then mutates source and removes the other's marker. X2-02's test covers an already-present live marker, not acquisition races or marker-free gaps.
- reproduction: In an isolated checkout, synchronize two harness processes immediately after their startup recovery checks, then release both. Alternatively start the second process between the first process's entries. Record source hashes and marker ownership throughout. Both processes must not enter measurement; the current code contains no atomic operation that guarantees this.

### X3-04 — severity 1 — The authoritative AI spend ceiling has not been delivered or demonstrated
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: The implementation explicitly demotes this ledger to advisory and identifies real AI Gateway per-client limits as the primary control, still blocked on H2/L4. gateway-cap-primary.test.ts supplies its own in-process transport counter; it proves propagation of a simulated refusal, not enforcement by the service that bills requests. The tree contains no real Gateway configuration or verification path establishing the approved daily/monthly ceilings. This is the outstanding prerequisite of the R14-01 ruling, not a request for more prototype hardening.
- reproduction: Using a dedicated nonproduction client and bounded test budget, configure and independently read back the approved Gateway limits. Execute requests with local accounting bypassed and across separate processes, including concurrent requests and period boundaries. Record actual provider usage and the upstream refusal. The current stand-in test cannot supply that evidence.

### X3-05 — severity 2 — Cross-family response metadata and parser failures bypass secret scrubbing
- file: `fullburn/engine/scripts/cross-family-read.mjs`
- evidence: The runner scrubs selected error bodies, review text, and raw artifacts, but prints served.reason and parsed.reason directly. servedModelAcceptable interpolates the response's model field, and parseReview interpolates invalid verdict values. renderCrossReport also receives json.id and json.usage unsanitized, and the completed report is written without a final scrub. An upstream echo in these fields reaches logs or the report despite the claim that everything printed or saved is scrubbed.
- reproduction: Extend the local-router integration fixture to return the canary key as json.model, as an invalid review verdict, and as json.id in an otherwise valid response. Assert that neither combined stdout/stderr nor any written report contains the key. The existing echo test uses normal model and response-id fields and therefore misses these paths.

### X3-06 — severity 2 — Root secret-scanner configuration is outside the reviewed tree hash
- file: `fullburn/engine/scripts/gate-lib.mjs`
- evidence: The X2-04 fix adds .gitleaks.toml and .gitleaksignore to Class-2 protection, CODEOWNERS, and CI scope, but VERIFIED_TREE_SCOPE still includes only fullburn/, .github/, .claude/, and DONE.md. Changing either root scanner configuration leaves the adversary binding unchanged and excludes the new rules from the cross-family review bundle.
- reproduction: In the gate CLI's temporary repository, commit a current-tree PASS, then add or change root .gitleaks.toml or .gitleaksignore. Recompute the verified hash and invoke adversary-gate. The hash remains unchanged, so the report does not become stale. Extend the existing workflow-change freshness test to these scanner configurations.

### X3-07 — severity 2 — The new grade tracing boundary sends unvalidated input directly to the sink
- file: `fullburn/engine/src/grade-registry.ts`
- evidence: gradeAndEnforce emits input: snapshot on both success and failure without constructing a validated primitive snapshot or applying redaction. computeGrades ignores unknown areas and fields, so an extra credential-bearing field survives into tracing even though it has no grading purpose. The error path also rethrows the original error after tracing; hostile getters can consequently return an error carrying secrets in message, cause, or custom fields. Tests verify only that one trace errorMessage omits 'hostile snapshot'.
- reproduction: Add an extra field containing a canary credential to ALL_A and call gradeAndEnforce through a runtime-typed input. Inspect the captured trace: it contains that field verbatim. Separately use a metric getter that throws an Error with the canary in its message/cause and inspect the rejection object. Require sanitized snapshots and sanitized outward errors in both cases.

### X3-08 — severity 2 — Money-error rebuilding invokes an attacker-controlled constructor
- file: `fullburn/engine/src/redact.ts`
- evidence: redactMoneyError obtains Ctor from err.constructor and invokes new Ctor. That property is not a trusted class identity: an Error instance can override it, and a subclass constructor can recreate secret-bearing properties. A constructor can even return the original object, defeating the stated guarantee that only class and sanitized message survive. The current lock exercises a frozen base CapError with its normal constructor.
- reproduction: Create a CapError carrying a canary in custom fields and define its own constructor as a function returning that same error. Call redactMoneyError and verify that the returned object is the original and still carries the canary. Also test a CapError subclass whose constructor reinstalls a secret-bearing name/cause. Reproduce through the existing transport or meter-failure fixture.

### X3-09 — severity 2 — The encrypted, automatically rotated OAuth vault remains unimplemented
- file: `fullburn/engine/src/vault.ts`
- evidence: The only backend is MemoryVaultBackend, which stores plaintext records in a Map. rotate is a manually invoked setter; there is no encrypted backend, scheduled rotation, expiry enforcement, or provider-scope enforcement. done-lib explicitly marks D-vault-rotation unmet. Version increments and client-key composition do not satisfy Phase 0's encrypted, auto-rotated, least-scope deliverable.
- reproduction: Inventory the concrete VaultBackend implementations and invoke the current rotation tests: they exercise only an explicit backend.rotate call. Before accepting Phase 0, execute encrypted persistence and scheduled rotation tests against the intended backend, including expiry, failed rotation, and scope refusal. Do not substitute live credentials into this memory backend.

### X3-10 — severity 3 — bindRole launders unevaluated changes to other roles and accepts caller-chosen thresholds
- file: `fullburn/config/src/models.ts`
- evidence: bindRole checks evidence only for the requested role, accepts any input bindings map, spreads every entry into next, and marks the entire result SERVABLE. It never requires the input map to have serving provenance. It also accepts caller-supplied role cards and uses their evalThreshold. llm subsequently validates map shape and provenance, not whether every changed role earned its binding. These bypasses do not require forging an attestation or calling attestEvalRun directly.
- reproduction: Obtain a genuine passing hello-world attestation through runEval. Construct a base map changing genome-tagger to the known-failing llama-70b candidate, then call bindRole on hello-world with its genuine attestation. The returned map is servable for the unevaluated tagger. Separately obtain the genuine failing tagger result and pass copied role cards with evalThreshold set to zero; bindRole admits it and llm serves it.

### X3-11 — severity 3 — Canonical eval expectations are writable at runtime
- file: `fullburn/engine/evals/index.ts`
- evidence: CANONICAL_GOLDEN_SETS freezes only its outer record. The exported GOLDEN arrays, case objects, inputs, expected objects, and nested reasons arrays are not frozen. runEval compares the supplied set to these same mutable objects. Modifying the canonical expectations therefore changes the authority used by the new canonical-set guard without a Class-2 commit.
- reproduction: In an isolated test, save the canonical tagger expectations, mutate each exported case's expected fields to RECORDED_LLAMA_70B's answers, and runEval with that same canonical set. It now computes a passing result for the deliberately failing recording and bindRole accepts it. Restore all fixtures in finally. Runtime mutation of the canonical authority must be refused.

### X3-12 — severity 3 — The required structural scan rejects the committed cross-family implementation
- file: `fullburn/engine/scripts/scan-lib.mjs`
- evidence: PROVIDER_HOSTS includes openrouter.ai. Structural rules apply to fullburn/engine/scripts/*.mjs, and neither cross-family-lib.mjs nor cross-family-read.mjs is exempt. cross-family-lib.mjs contains the literal production OpenRouter URL. Consequently the required leak/structural scan reports a Law 11 violation on the review runner's own configuration. The documented direct-OpenRouter ruling and the enforced scanner policy disagree.
- reproduction: Call scanContent('fullburn/engine/scripts/cross-family-lib.mjs', that file's contents), or run npm run leak-check. The provider-hostname finding follows directly from the supplied rules. Resolve the policy conflict with the human and add a narrowly scoped positive/negative test; do not silently weaken the general provider-routing rule.

### X3-13 — severity 3 — Credential-bearing output is traced as successful before being refused
- file: `fullburn/engine/src/gateway.ts`
- evidence: llm settles the reservation and emits an outcome: 'ok' event before calling containsSecret. A credential-bearing output then throws and emits a second outcome: 'error' event with the same trace identity and committed cost. With MemoryTraceSink this produces two charged events for one ledger charge, including a successful decision that was never returned. The credential test checks redaction but not event count, outcome consistency, or cost reconciliation.
- reproduction: Use the existing hardening fixture with transport.response = { greeting: CANARY_SECRET }. Assert one refused decision and reconcile the sum of emitted event costs with meter.todayUsd. The current path emits both ok and error, each carrying the same nonzero cost, while the ledger settles once.

### X3-14 — severity 3 — Claiming the recorded registrar first need not trigger the advertised refusal
- file: `fullburn/engine/src/transport-brand.ts`
- evidence: The claimed-once registrar is publicly exported. The fail-closed response to an earlier claimant exists only when eval-harness.ts subsequently loads. gateway.ts imports transport-brand.ts but does not import eval-harness.ts. A caller importing the gateway directly can claim the registrar, brand a live transport, create evalCandidateBindings, and serve it without ever loading the module that would detect the early claim. The test imports the eval harness first and exercises only a second claim.
- reproduction: In a fresh isolated process, import transport-brand.ts first, claim the registrar, and register an ordinary live-capable transport. Import gateway.ts and config/models.ts without importing index.ts or eval-harness.ts. Pass evalCandidateBindings with that transport to llm using valid scoped dependencies. The candidate-only recorded-transport check accepts the branded transport despite no eval having passed.

### X3-15 — severity 5 — Remaining human-owned Foundation deliverables have no completion evidence
- file: `fullburn/HUMAN_TASKS.md`
- evidence: Phase 0 explicitly requires ClickHouse Cloud and Airbyte provisioning, a Langfuse project, domain registration, and a formal trademark check. H1, H3, H4, and H5 remain listed as blocking tasks; H9 still requests approval of initial grade thresholds. done-lib gives the infrastructure and naming requirements no executable verification command. No completion evidence for these tasks is included in this review bundle.
- reproduction: Obtain human-owned provisioning and legal records, confirm services through read-only health/authentication checks, and record H9's authenticated approval. Map each Phase 0 deliverable to its observed result. Until supplied and checked, these requirements remain incomplete rather than conditionally passed.

### X3-16 — severity 5 — The Foundation has no executable production Gateway/Langfuse round trip
- file: `fullburn/engine/src/gateway.ts`
- evidence: GatewayTransport and TraceSink are interfaces; supplied concrete implementations are recordings, mocks, and MemoryTraceSink. There is no production transport adapting provider requests/responses or Langfuse sink. The AC1 test merely asserts a mock URL and in-memory event, while AC2 relies on authored placeholder recordings. Providing H2/H5/H6 credentials alone cannot make these adapters exist or demonstrate a live frontier-to-open-source rebind.
- reproduction: Attempt to assemble the documented hello-world using only production implementations from the tree. Identify the concrete HTTP transport and Langfuse sink; neither is supplied. Implement and contract-test those boundaries, then execute AC1 and AC2 against bounded live services, recording the served model and corresponding Langfuse trace/eval identifiers.

### X3-17 — severity 5 — The declared Workers runtime cannot construct the required production meter
- file: `fullburn/engine/src/trusted-clock.ts`
- evidence: FrozenCapsSpendMeter ultimately requires trustedClock, which throws whenever process.hrtime.bigint is unavailable. engine/wrangler.toml declares no nodejs_compat flag, and llm refuses the alternative MemorySpendMeter. workers-runtime.test.ts explicitly treats successful import followed by construction refusal as its expected result. That repairs module initialization but does not provide a functioning Foundation agent on the declared runtime.
- reproduction: Run the Worker under workerd with the supplied wrangler configuration and construct FrozenCapsSpendMeter before the hello-world call. Verify a successful supported clock and dispatch, not merely a clean import or a 404 response. The current no-process fixture predicts refusal before any LLM request.

## Invariants checked

- No write outside publish/pause/promote: no Marketing API write implementation is present; the Phase 6 write-verb property is not executable in Phase 0.
- Cross-tenant reads fail by construction: client-bound vault handles and collision-resistant key composition have test coverage; authenticated tenant authorization and warehouse isolation remain unverified.
- Append-only decisions with input snapshot and adversary verdict: the warehouse ledger is deferred to Phase 2; the in-memory availability audit is not that ledger.
- Big red button halts all spend within 60 seconds: no kill-switch implementation or client UI exists yet; not verified.
- Bracket protection window cannot be bypassed: bracket execution is deferred to Phase 5; not verified.
- External content is data, never instructions: the hostile fixture is passed through a mock response and checked against frozen configuration; this does not establish resistance by a live agent. No fixture instructions were followed in this review.
- VERDICT.md is hash-locked after launch: the Phase 6 artifact and enforcement are not present; no post-launch integrity claim is established.
- OAuth tokens remain confined to authorized secret handling: incomplete vault implementation and concrete outward leak paths found in cross-family metadata, grade tracing, and money-error reconstruction.
- Past-SLA human queue waits; locked flags remain inert: queue execution is deferred; frozen switchboard accessors reject staged and locked entries in supplied tests.
- Guard and checker require a negative proof: many paired negative tests exist, but current runner and binding boundaries still have uncovered cases; commit-level compliance cannot be established from file contents.
- Every mutation result requires a passing meta-check: three canaries and shared classification logic are present; no run was executed or accepted as evidence.
- Unreachable-guard sweep is mandatory and complete: an import-derived throw population and refusal-specific drivers exist; actual enumeration, reachability, and individual mutation results were not executed.
- Guards are locked by behavior rather than shape: substantial behavioral coverage exists, but several invariants still use source matching and selected witnesses; the root Class-2 scope mismatch illustrates an uncovered boundary.
- Behavioral ledger and CLAUDE claims require failing-test bindings: the suite checks a manually declared claims table and citation paths; excluded ledger contents and historical claims could not be independently reviewed.
- Fixes remove capabilities rather than spellings: serving provenance still admits laundering through bindRole, canonical expectations remain mutable, and registrar ownership can be claimed before direct gateway use.
- No verdict is reached outside default-suite visibility: runner bindings exist, but the presence of a declared prover does not establish coverage of every runner branch; cross-family scrub omissions demonstrate that limitation.
- Coverage exemptions must be measured: scan coverage compares tracked files against the walk and exempts measured binary content; the actual filesystem population was not enumerated here.
- Readability is not secret detection: the local scanner explicitly limits its claim to covered formats; no clean-secret verdict is issued by this read.
- Rulesets are tested against independently authored credential formats: corpus positives, placeholders, and rule-removal checks are present; gitleaks execution and current rule behavior remain unverified.
- CI gates are advisory until repository protection exists: the supplied records still identify H19/L37 as open; current GitHub protection settings were not queried.
- Workflow actions use immutable SHAs and least privilege: supplied third-party action references use commit SHAs and workflows declare contents: read; remote action contents and effective repository permissions were not inspected.
- Adversary discovery mirror is gated and identical: both supplied definition files match as text and are included in protected/reviewed scope; actual session registration was not tested.
- First action proves checkout identity: no shell session or checkout was available, so branch/head readiness was not performed.
- Source-writing tools are import-safe and fail closed: the main mutator has an entry-point guard and recovery marker, but concurrent invocation remains unsafe because marker acquisition is not exclusive.
- Completion is a measured exit code plus human acknowledgment: no completion command was run, no exit-zero claim is made, and excluded approval artifacts were not inspected.
- Completion checker never nests: VITEST and FULLBURN_DONE_ACTIVE refusal branches are present with CLI tests; execution was not verified.
- Empty output cannot establish a gate result: mutation parsing checks canaries and reconciled counts, but no real command output was collected during this read.
- Mutation entries are checked against the tree on every run: readThroughInFlight and staleEntries are wired into supplied tests; placement and behavioral detection were not executed.
- Lint is a type-aware promise-safety gate: both required rules are at error and production-path ignore checks exist; the linter and mutation proofs were not run.
- Cross-family reviewer is pinned and served identity is checked: pure functions and stand-in rejection tests are present; provider identity, actual routing, and response authenticity were not independently established.
- No edits while a checker runs: this is a process rule not enforceable or observable from the supplied snapshot.
- Checks inside the harness use original bytes where mutation changes their inputs: the staleness check and canary-target check read through the marker; broader runtime interactions were not executed.
- One harness per checkout and live markers are refused: an already-present live marker is rejected, but there is no lifetime exclusive lock; X3-03 remains a violation.
- Origin validation precedes the first vault read: the supplied llm ordering and read-count test support this specific property; they do not establish tenant-specific Gateway configuration.
- Secret inspection walks every depth: containsSecret has cycle and visit-count handling rather than a depth cutoff; outward error reconstruction and other trace boundaries still bypass safe containment.
- No pass, no bind on serving; every decision traced: arbitrary maps are rejected directly, but bindRole and registrar paths bypass the intended provenance restriction. LLM success/refusal and grade decisions were examined; no production Langfuse sink exists, and the credential-refusal path records contradictory charged events.

## Limitations (what a read cannot establish)

- This was a source-and-test read only. No commands, endpoint attacks, network calls, mutations, browser flows, runtime spend attempts, or repairs were executed. Reproduction steps are proposed deterministic checks, not claimed observations.
- The supplied verified-tree hash was not recomputed. Git index modes, symlinks, tracked-file completeness, branch history, and working-tree cleanliness were not independently inspected.
- The review bundle deliberately excludes fullburn/reports/ and fullburn/APPROVALS/. Historical findings, live-verification records, human acceptance of residual risks, authenticated Class-2 approvals, and gate acknowledgment therefore could not be validated.
- Current branch protection, required checks, CODEOWNER eligibility, approval authorship/push identity, CI conclusions, and artifact hashes require GitHub evidence not available in this read.
- Actual AI Gateway budget semantics, per-client key scope, concurrent billing behavior, timezone/reset behavior, provider usage receipts, and configured ceilings were not verified. A simulated refusing transport is not evidence of an authoritative upstream cap.
- Live Langfuse receipt, trace retention, log/trace secret scans, genuine role evals, model failover, and served-model provenance were not verified.
- The three examined decision paths were successful LLM dispatch, LLM refusal, and grade enforcement. Their local trace calls can be inspected, but none demonstrates receipt by a real Langfuse project.
- ClickHouse/Airbyte provisioning, encrypted-vault deployment, automatic rotation, domain ownership, trademark clearance, and threshold approval need external or human-owned evidence.
- Worker initialization and production-meter construction were not run under workerd. The supplied runtime test uses Node with its process global deleted, which is not equivalent to the deployed Workers runtime.
- Later-phase properties remain untested: policy-veto enforcement, publish/pause/promote authorization, trust-ladder transitions, bracket protection, proxy-only promotion refusal, second-client onboarding blocks, SLA waiting, emergency pause, and VERDICT integrity after first spend.
- API timeouts during brackets, Airbyte gaps, attribution-window edge days, duplicate purchase/webhook delivery, and warehouse reconciliation idempotency cannot be assessed as implemented behavior because those subsystems are not present in Phase 0.
- Mutation-suite determinism, shuffled-seed results, interruption recovery, concurrent harness behavior, lint cleanliness, gitleaks results, and CI enforcement were not established by execution.
- No source, grader, threshold, constitution, improvement-loop code, agent definition, or test file was modified. Phase B locks for these findings have not been written or executed.
- Spec conflicts and governance-policy changes require a written human decision; this report does not authorize changing the grader, security policy, runtime architecture, or completion criteria.
