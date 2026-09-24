# ADVERSARY REPORT phase0.x2
Verdict: FAIL
verified-tree: c69931a45743502b49c99fb6907a04d65a2e5e1b

Reviewer-family: OpenAI (gpt-6-astra via OpenRouter)

Round: x2, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `8c7afee` on branch `claude/fullburn-engine-spec-r7v5lg`; verified tree `c69931a45743502b49c99fb6907a04d65a2e5e1b` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-astra`, served `openai/gpt-6-astra` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1790234612-4vGpSgwA9TUsp0feJbrg.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 108 files, 1260891 bytes sent; omitted as binary: none.
Usage: 346055 prompt, 9970 completion tokens. Started 2026-09-24T07:23:32.366Z.
Verdict basis: 20 finding(s) at severities 1,2,3,5.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X2-01 — severity 1 — The required merge-blocking control remains explicitly unresolved
- file: `fullburn/HUMAN_TASKS.md`
- evidence: H19 remains blocking. CLAUDE.md records main as unprotected and every CI gate as advisory; done.mjs hard-fails C8-identity for the same reason. CODEOWNERS and passing gate functions do not implement Phase 0 AC4, which requires CI to block a PR missing an adversary report.
- reproduction: Under the human's authenticated account, inspect protection on every protected target branch and attempt to merge a disposable PR with a missing report and failing checks. Completion requires an observed refusal, required CODEOWNER approval, and protection against bypass. The supplied tree itself records this as unresolved L37/F14.

### X2-02 — severity 1 — Concurrent mutation harnesses can restore or overwrite each other's active mutations
- file: `fullburn/engine/scripts/mutate.mjs`
- evidence: Every invocation calls recoverInFlight() immediately. The marker contains pid, but recoverInFlight() never checks whether that process is alive, and there is no exclusive run lock. A second invocation therefore treats the first invocation's active marker as crash recovery. Both subsequently write source and remove the same marker.
- reproduction: In a disposable checkout, start one harness and wait for an active marker, then start another. Observe the second restoring the first's active target. Drive overlapping measure/restore operations and verify whether each run measures its own mutation and restores the original checkout. A deterministic test can first demonstrate that recoverInFlight() restores a marker belonging to a live process instead of refusing.

### X2-03 — severity 1 — The authoritative spend cap exists only as a test assumption
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: The implementation explicitly demotes the process ledger to advisory and identifies an external per-client Gateway cap as the primary control, still blocked on H2/L4. gateway-cap-primary.test.ts supplies its own closure that enforces a ceiling; it does not provision or inspect a real Gateway policy. llm() has no prerequisite proving that the selected gateway and credential have the approved daily and monthly limits.
- reproduction: Retain the already-disclosed prototype-bypass test, but run the acceptance drill against the real configured Gateway using sandbox credentials and approved minimal limits. Demonstrate daily and monthly refusal, client-local accounting semantics, concurrent requests, and refusal with local accounting disabled. Do not treat the in-process stand-in as proof that this Phase 0 control is installed.

### X2-04 — severity 2 — The primary secret scanner's repository configuration is outside change control
- file: `.github/workflows/fullburn-ci.yml`
- evidence: The workflow delegates primary detection to gitleaks without pinning a protected configuration file. CLASS2_PATTERNS and CI_SCOPE_GLOBS do not cover root .gitleaks.toml or .gitleaksignore. Thus scanner configuration can be introduced as a Class-1, out-of-scope change even though it determines which credentials the primary gate reports.
- reproduction: In a disposable repository, add a root .gitleaks.toml extending the default rules and applying an all-path allowlist. Confirm isClass2('.gitleaks.toml') and inScope(['.gitleaks.toml']) both return false, then run the pinned action against a synthetic credential fixture. The scanner's configuration and ignore inputs must be protected and exercised with a negative test.

### X2-05 — severity 2 — The cross-family runner persists and logs unredacted upstream responses
- file: `fullburn/engine/scripts/cross-family-read.mjs`
- evidence: The runner prints raw non-JSON response prefixes and JSON error bodies, saves rejected answers verbatim, and saves successful raw responses verbatim. It never redacts against OPENROUTER_API_KEY. The workflow uploads those raw files and prints rendered reports to its job summary. The integration tests exercise upstream errors but never an error or answer echoing the credential.
- reproduction: Use the local stand-in with a synthetic API key. Return that key first in an error message, then in a non-JSON body, then in a valid review's evidence or limitations. Assert it appears in neither captured output nor any report/raw artifact. These paths currently copy it unchanged.

### X2-06 — severity 2 — The credential-output refusal misses secrets below the redactor's depth limit
- file: `fullburn/engine/src/gateway.ts`
- evidence: llm() compares two redactValue() serializations and returns the original output when they match. redactValue() replaces content deeper than MAX_DEPTH with the same '[depth limit]' marker regardless of the secrets argument. validateOutput() permits additional properties, so a valid greeting plus a deeply nested credential passes validation and both comparisons while the original secret-bearing object is returned.
- reproduction: Have the mock transport return {greeting:'ok', extra:<object nested beyond eight levels containing CANARY_SECRET>}. Assert llm() rejects and its resolved output never contains the canary. The existing X1-08a test covers only a top-level greeting echo.

### X2-07 — severity 2 — Preserving money-error objects preserves secret-bearing fields and frozen messages
- file: `fullburn/engine/src/redact.ts`
- evidence: redactInPlace() returns the original CapError or MeterUnavailableError. It changes only message and stack, retains name, cause and custom properties, and returns the original object unchanged when rewriting fails. gateway.ts uses this function on its outer money-error path. This contradicts the neighboring redactError() rationale that the original error's fields are leak surfaces.
- reproduction: Construct a genuine FrozenCapsSpendMeter with a narrowing-table getter that throws Object.freeze(new CapError(CANARY_SECRET)). Dispatch through llm() with a normal scoped vault and assert the thrown message and failure trace contain no canary. Also test a mutable CapError with the canary in name, cause and an enumerable custom property. These errors reach the outer catch after redaction secrets have been loaded.

### X2-08 — severity 2 — The Phase 0 encrypted, auto-rotated OAuth vault is not implemented
- file: `fullburn/engine/src/vault.ts`
- evidence: The only backend supplied is MemoryVaultBackend, storing plaintext SecretRecord objects in a Map. rotate() is a manually invoked setter; there is no encrypted backend, automatic rotation scheduler, provider revocation, or deployed least-scope policy. done-lib.mjs explicitly marks D-vault-rotation unmet. This is a current Phase 0 deliverable, not a later-phase feature.
- reproduction: Map the Phase 0 vault requirement to the actual backend and rotation entry point. The available tests exercise only in-memory lookup and a direct rotate() call. Require sandbox-backed encryption, automatic rotation, old-credential invalidation, scoped access and leak tests before accepting this deliverable.

### X2-09 — severity 3 — Serving can bypass eval-gated binding entirely
- file: `fullburn/config/src/models.ts`
- evidence: RoleBindings is an ordinary caller-created record. llm() now calls validateBindings(), but that checks completeness, known model IDs and family diversity only; it does not require bindRole() provenance or an eval result. A caller can directly select an unevaluated model. Separately, attestEvalRun() remains publicly callable with invented booleans, and runEval() authenticates case IDs and field names rather than canonical inputs and expected values.
- reproduction: Call llm() with {...ROLE_BINDINGS, 'genome-tagger':'llama-70b'} and a schema-valid transport response, without running any eval or calling bindRole(). It reaches the transport. Also replace the golden expectations with the candidate's recorded wrong answers while retaining the declared IDs and required fields; runEval() can produce a passing attestation. Family-diversity enforcement is not eval-gated admission.

### X2-10 — severity 3 — The cross-family implementation contradicts the structural gate that CI runs
- file: `fullburn/engine/scripts/cross-family-lib.mjs`
- evidence: PRODUCTION_ENDPOINT contains openrouter.ai. scan-lib.mjs includes that domain in PROVIDER_HOSTS, applies structural checks to fullburn/**/*.mjs, and provides no exemption for cross-family-lib.mjs. Consequently the required leak/structural CLI reports this committed implementation as a Law 11 violation. The runner also bypasses the engine Gateway and tracing path; its claimed human routing ruling has not been reconciled with the checked constitution.
- reproduction: Run scanContent('fullburn/engine/scripts/cross-family-lib.mjs', fileContents), or npm run leak-check. Expect the provider-hostname finding. Escalate the routing/spec conflict to the human; do not silently weaken the scanner or claim this tree's structural scan is clean.

### X2-11 — severity 3 — Completion accepts incomplete mutation evidence and ignores the harness exit status
- file: `fullburn/engine/scripts/done-lib.mjs`
- evidence: parseMutate() recognizes only a generic negative and positive canary, although the harness now requires two distinct negative canaries. mutateCondition() accepts zero mutations and does not reconcile caught against total. In done.mjs, C5 evaluates parsed output without consulting r.code. The tests explicitly accept an old two-canary transcript.
- reproduction: Pass a transcript containing 'ok negative canary', 'ok positive canary' and '0 mutations: 0 caught, 0 survived, 0 not found' to parseMutate()/mutateCondition(); it returns PASS. Test a missing rewrite canary, inconsistent counts, and a nonzero harness exit accompanied by a success-looking summary. Each must fail C5.

### X2-12 — severity 3 — One cross-family report can satisfy both required independent reviews
- file: `fullburn/engine/scripts/done.mjs`
- evidence: C2 passes every phase report to checkAdversaryReport() without filtering for the builder's family. C3 filters that same collection for non-Claude reports. A sole fresh cross-family PASS therefore satisfies both conditions. C4 then equates those two header verdicts with zero open findings without examining finding dispositions. Protecting report authorship does not make one review into two.
- reproduction: Provide exactly one current-tree report with Verdict: PASS and Reviewer-family: OpenAI, with no same-family report. Exercise the C2/C3 selection logic and observe both succeed. Add an unresolved finding in its body and observe the header-only gate still succeeds. Add deterministic tests for separate reviewer populations and explicit finding disposition.

### X2-13 — severity 3 — The claimed 'origin checked before vault read' lock proves the wrong property
- file: `fullburn/engine/src/gateway.ts`
- evidence: llm() primes secrets using deps.vault.get('ai-gateway-key') before assertGatewayBase(). The priming exception is swallowed. eval-rebind.test.ts uses a vault that throws on read and concludes the origin check came first because the eventual error is the origin refusal. That test passes even though the forbidden read already happened.
- reproduction: Replace the throwing-only vault fixture with a read counter or spy. Invoke llm() using an off-origin gatewayBaseUrl and assert zero reads. The current path increments the counter before rejecting the origin. The fix comment, test title and ordering claim must agree with the executed behavior.

### X2-14 — severity 3 — Grade enforcement decisions have no traced execution path
- file: `fullburn/engine/src/grade-registry.ts`
- evidence: computeGrades(), gradeAndEnforce(), enforcement() and publishGradeReport() have no trace dependency or traced wrapper. A below-A snapshot produces trust-step-down, improvement-halt and human-alert decisions without emitting any trace. The grade tests check returned actions and JSON only. Law 11 and the Phase 0 tracing deliverable apply to decisions, not just calls to llm().
- reproduction: Execute gradeAndEnforce() with a seeded data-truth dip and publish the resulting grades. Confirm that no TraceSink or Langfuse event is produced. Require a traced public decision boundary carrying the input snapshot, computed grades and enforcement result while keeping pure calculation helpers testable.

### X2-15 — severity 3 — Availability audit entries are externally rewritable
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: setAvailable() pushes mutable objects into #audit, and availabilityAudit() returns only this.#audit.slice(). Callers receive the actual event objects and can rewrite clientId, reason, available and seq. The test checks that truncating the returned array does not truncate the ledger, but never mutates an entry.
- reproduction: Record a halt, obtain availabilityAudit(), and modify the first entry's reason and available fields using a runtime cast. Read availabilityAudit() again and observe the rewritten history. Add a test that mutates individual entries, not just the returned array length.

### X2-16 — severity 3 — Live Gateway, Langfuse and warehouse Phase 0 deliverables remain absent
- file: `fullburn/engine/src/tracing.ts`
- evidence: Tracing provides only MemoryTraceSink and an interface. The engine supplies no production GatewayTransport or Langfuse sink; evals use authored RecordedTransport outputs. HUMAN_TASKS keeps H2–H6 open, and PHASE0_REQUIREMENTS hard-codes AC1-live and warehouse provisioning as unmeasurable. Thus a real hello-world trace, a real frontier-to-open-model eval/rebind, a Langfuse project/eval integration, and provisioned ClickHouse/Airbyte are not demonstrated or implemented by these fixtures.
- reproduction: Trace each Phase 0 requirement to an executable production adapter and infrastructure verification command. Run the real hello-world and model-swap acceptance checks and query the resulting Langfuse trace/eval records. Verify ClickHouse and Airbyte service readiness with sandbox credentials. Memory events and authored recordings cannot satisfy these live requirements.

### X2-17 — severity 3 — The supposedly exhaustive guard population silently drops ordinary static imports
- file: `fullburn/engine/test/money-path-guards.ts`
- evidence: moneyPathModules() recognizes imports only at the beginning of a line and silently skips unresolved files. unfollowable() refuses dynamic imports but does not detect a static import the population parser missed. Therefore the import graph is not exhaustive despite the sweep's completeness claim.
- reproduction: Supply a synthetic gateway module containing `import './a.ts'; import './b.ts';` on one line and give b.ts a unique throw guard. moneyPathModules() follows a.ts but omits b.ts, while unfollowable() reports no problem. Also test a missing relative module. The population must enumerate or explicitly refuse every dependency edge.

### X2-18 — severity 5 — The naming/legal Phase 0 deliverable is still blocking
- file: `fullburn/HUMAN_TASKS.md`
- evidence: H1 still requires domain registration and the formal trademark check. done-lib.mjs marks D-name unmeasurable, and the supplied scope contains no completed verification. ENGINE_BUILD.md explicitly requires both during Phase 0; a chosen name and preliminary conflict scan are not completion.
- reproduction: Have the human provide registration confirmation and the formal trademark-check result, then record the gate disposition through the approved process. Until that evidence exists, leave this deliverable unmet.

### X2-19 — severity 5 — A money-path lock depends on real time and can fail across midnight or scheduler delays
- file: `fullburn/engine/test/locks-r7.test.ts`
- evidence: The production-clock test reads the real trustedClock twice, requires a delta below one second, and requires both readings to have the same UTC date. The suite does not freeze these observations. Midnight between reads or a delayed worker violates these assertions without any production defect, contrary to the deterministic-lock requirement.
- reproduction: Drive equivalent readings on opposite sides of UTC midnight or suspend the worker between the adjacent reads for more than one second. The assertions fail even though monotonic time is correct. Separate deterministic clock-contract tests from explicitly bounded runtime smoke observations.

### X2-20 — severity 5 — The declared Workers target still cannot construct the production meter
- file: `fullburn/engine/wrangler.toml`
- evidence: The Worker configuration declares no nodejs_compat flag. trustedClock() requires process.hrtime.bigint and refuses construction when it is absent. FrozenCapsSpendMeter constructs that clock through processLedger(), and llm() accepts no alternative meter. workers-runtime.test.ts now positively asserts refusal at construction; it proves importability, not a usable Workers LLM path.
- reproduction: Run the declared entry point under workerd with this configuration and attempt to construct FrozenCapsSpendMeter for a hello-world call. Require a real Workers-runtime acceptance test that can dispatch through the approved adapters, not merely a Node subprocess that removes globalThis.process.

## Invariants checked

- Phase 0 deliverable checklist: TypeScript/workspace scaffold, frozen caps, role cards, model registry, Grade Registry scaffold, CI definitions, CLAUDE.md and mirrored adversary definition are present; this read does not establish execution success.
- Phase 0 deliverable checklist: switchboard skeleton and scoped vault interface are present; encrypted automatic rotation, live Gateway/Langfuse adapters and evals, ClickHouse/Airbyte provisioning, domain registration and formal trademark completion remain unmet or unsupported by supplied evidence.
- Phase 0 acceptance checklist: AC1 live round-trip/trace is unmet; AC2 is demonstrated only with authored transport fixtures and has an admission bypass; AC3 has seeded computation/publication tests; AC4 merge blocking remains unresolved; AC5 has direct runtime-mutation refusal tests, not executed here.
- No writes outside publish/pause/promote: no Marketing API adapter is present in the reviewed production sources; the write-verb runtime invariant is deferred to Phase 6, not passed.
- Cross-tenant reads fail by construction: scoped vault lookups and collision tests were examined; warehouse isolation, authenticated tenant authority and per-client infrastructure cannot be established from this scaffold.
- Append-only decisions ledger captures every write: the decisions warehouse is not implemented; separately, the current availability audit exposes mutable entries.
- Big red button halts spend within 60 seconds: no button, write adapter or executable end-to-end drill exists at Phase 0; not verified.
- Bracket protection cannot be bypassed: bracket runtime is not implemented; golden answers are not enforcement.
- External content is data, never instructions: hostile test strings were treated as fixture data. The inert echo test does not demonstrate model resistance; no fixture-following agent path was established by this read.
- VERDICT.md hash-lock after launch: no launch artifact or post-launch hash enforcement was supplied; this is deferred and not verified.
- OAuth tokens remain in the vault: failed review of containment; deep returned outputs, money-error preservation and cross-family raw response handling expose credential-leak paths.
- Past-SLA queue items wait and locked flags remain inert: queue behavior is deferred; frozen registries and requireActive accessors reject staged/locked entries in the examined code and tests.
- A guard and checker need a red-proof: numerous negative fixtures and mutation entries exist, but the origin-before-vault test demonstrates a checker passing for the wrong reason; commit-level compliance is unverified.
- Every mutation result requires a passing meta-check: the harness runs three canaries, but the completion parser does not require all three or a successful process exit.
- Unreachable-guard sweep must be complete: guard-specific refusal checks exist, but the import population can silently omit static dependencies; exhaustive coverage is not established.
- Guards are locked by execution, not shape: many tests execute behavior, but several coverage checks still inspect source strings; the unexecuted suite is not a runtime proof.
- Behavioral ledger and CLAUDE claims carry stale-detection tests: reviewed bindings do not authenticate the full prose claim; the false vault-ordering assertion is a concrete counterexample. The actual ledger was excluded from the bundle.
- Capability removal rather than spelling changes: external spend authority is explicitly disclosed rather than proven; remaining eval-admission and credential-output capabilities are identified in findings.
- No verdict is reached outside default-suite visibility: runner bindings exist, but C2/C3 review selection and C5 exit handling still contain consequential wiring decisions not proven by their pure-function tests.
- Coverage exemptions must be measured: leak-walk coverage has negative fixtures; guard-graph missing dependencies still disappear silently.
- Readability is not secret detection: custom patterns were reviewed as advisory only; no clean-tree or clean-log credential claim is made.
- Secret rules require independently authored credential cases: the supplied corpus exercises positive and negative formats; neither corpus execution nor primary scanner efficacy was observed.
- Repository gates remain advisory until protected: the tree explicitly records the unresolved external blocker; CODEOWNERS alone is not enforcement.
- Workflow actions are SHA-pinned and permissions declared: the supplied workflow references use commit SHAs and declare contents: read; external action internals and actual token permissions were not verified.
- Adversary discovery location must be equally gated: root and workspace definitions match in supplied text, and root .claude is included in Class-2, ownership and verified scope; actual harness registration is not observable here.
- First session action proves the checkout: branch, HEAD and checkout readiness cannot be established from the textual bundle.
- Source-writing tools are import-safe and fail closed: entry guards and crash markers exist, but concurrent harnesses are not mutually excluded.
- Done is a measured exit code: no completion run was performed; current hard-coded unmet requirements keep completion blocked, and additional evidence-validation defects were found.
- Completion checker never nests: VITEST/FULLBURN_DONE_ACTIVE refusal code and subprocess tests were examined, not executed.
- Empty output is not passing evidence: several parsers reject absent results, but the mutation completion condition accepts a zero-mutation summary.
- Mutation entries are checked against the tree: marker-aware staleness checks exist; their success, target count and individual behavioral catches require execution.
- Lint is type-aware over the intended TypeScript surface: both required rules and source-path ignore checks exist; .mjs runners remain outside that gate by design.
- Cross-family reviewer is pinned and read back: request/response model comparison and off-production forced FAIL exist; served identity, network provenance and independent same-family review were not verified.
- No edit while a checker runs: process convention is stated, but no exclusive tree lock or final tree revalidation establishes it mechanically.
- Checks inside the harness read original bytes through the marker: the staleness and canary-presence checks use this mechanism; concurrent marker ownership remains unsafe.
- The historical cross-family-versus-same-family finding comparison is a process claim: earlier report artifacts were not supplied, so its counts and attribution are not verified.
- Three decision paths examined for observability: llm success, llm cap refusal and grade enforcement. The first two call a TraceSink but have no supplied production Langfuse sink; grade enforcement has no trace path.
- Family diversity: default creative-domain bindings differ and the serving path validates diversity; this does not establish eval eligibility, monthly failover success or reviewer provenance.
- Sequential phases and human authority: PHASE is 0; no authenticated approval history, accepted deferrals or current-tree gate acknowledgement was available for verification.

## Limitations (what a read cannot establish)

- This was a read-only review. No commands, endpoints, adversarial requests, tests, mutation probes, browser flows or cloud services were executed. Reproduction instructions describe checks to perform, not observed runs.
- The supplied verified scope excludes fullburn/reports/ and fullburn/APPROVALS/. Historical findings, written human acceptances, ledger contents, current review artifacts and approval authorship could not be independently checked. New findings use X2-prefixed IDs rather than reassigning earlier X IDs.
- The supplied tree identifier, file completeness, Git index modes, commit history, dirty-tree state and correspondence between reviewed bytes and deployed code could not be recomputed.
- GitHub branch protection, required-check identities, CODEOWNER enforcement, bypass permissions, PR behavior and action internals require authenticated external verification. Repository prose documenting their absence is not a fresh API measurement.
- Live Gateway cap configuration, credential-to-client binding, daily/monthly boundary semantics, concurrency behavior, provider billing and actual Langfuse delivery remain unverified. A same-process transport stand-in establishes none of those external properties.
- Real workerd compatibility, dependency installation, lint/typecheck results, five shuffled suite runs, mutation meta-check results, individual mutation catches and signal/crash restoration were not established.
- No production logs or Langfuse traces were supplied for token scanning. No claim is made that the tree or its external artifacts contain no live credentials.
- Airbyte gaps, duplicate webhook reconciliation, attribution-window edges, bracket timeouts, proxy-only promotion attempts, protection-window kills and trust-ladder skips require later-phase runtime paths that are absent here.
- Second-client onboarding while unstable, per-client warehouse/DO/R2/Vectorize isolation, queue SLA waiting and kill-switch timing were not executable from the Phase 0 scaffold.
- Monthly research citation verification, Grade Registry trendlines, live A-grades, failover and injection drills, canary deployment and exact rollback restoration were not available.
- No files were modified and no deterministic lock tests were added. Phase B remains pending fixes or explicit written human dispositions and an execution-capable adversary run.
