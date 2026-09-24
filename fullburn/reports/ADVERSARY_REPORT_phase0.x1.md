# ADVERSARY REPORT phase0.x1
Verdict: FAIL
verified-tree: abda5d88c24fa81a8675c3519b7181e110cf585e

Reviewer-family: OpenAI (gpt-6-astra via OpenRouter)

Round: x1, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `e9c05a4` on branch `claude/fullburn-engine-spec-r7v5lg`; verified tree `abda5d88c24fa81a8675c3519b7181e110cf585e` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-astra`, served `openai/gpt-6-astra` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1790226557-6cO6F7cPeDK3LRI5Kxgm.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 107 files, 1220856 bytes sent; omitted as binary: none.
Usage: 335433 prompt, 8358 completion tokens. Started 2026-09-24T05:09:17.416Z.
Verdict basis: 17 finding(s) at severities 1,2,3,5.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X-01 — severity 1 — Phase 0's merge-blocking acceptance criterion remains explicitly unmet
- file: `.github/workflows/fullburn-ci.yml`
- evidence: CLAUDE.md records main as unprotected and all CI gates as advisory; HUMAN_TASKS.md H19 remains blocking. done-lib.mjs also marks AC4-enforced unmeasurable because protection is absent. Workflow definitions and CODEOWNERS do not themselves prevent a merge. This is the existing F14/L37 blocker, not a claim that repository settings were inspected in this read.
- reproduction: With the human's authorization, inspect current branch rules and required checks, then open a disposable PR missing an adversary report and demonstrate that merging is prohibited. Repeat for changes deleting or disabling the workflow. No such current enforcement evidence is included in this bundle.

### X-02 — severity 1 — The new lint gate's controlling configuration is outside Class-2 protection
- file: `fullburn/engine/scripts/gate-lib.mjs`
- evidence: CLASS2_PATTERNS protects test-runner configurations, manifests and gate scripts but not fullburn/eslint.config.mjs. CODEOWNERS likewise has no rule covering that file. Its ignores array can exclude engine/src/** while leaving LINTED_FILES and REQUIRED_RULES unchanged. The lint integration plants are under engine/test/, so those plants would still exercise the rules while production code was excluded.
- reproduction: Evaluate isClass2('fullburn/eslint.config.mjs') and codeownersCovers for that path. In a disposable checkout, add engine/src/** to the lint ignores and plant a floating promise in engine/src/. Check that lint ignores the production defect while the existing lint configuration assertions and engine/test/ integration plants remain satisfied.

### X-03 — severity 1 — An added handwritten report can impersonate both required reviewers
- file: `fullburn/engine/scripts/gate-lib.mjs`
- evidence: checkAdversaryReport authenticates only a verdict token and tree hash. New reports are outside Class-2 patterns, outside CODEOWNERS coverage and excluded from VERIFIED_TREE_SCOPE. done.mjs passes all reports to C2 without filtering for the same family; C3 accepts any Reviewer-family string not containing Claude or Anthropic. Neither consumer verifies the workflow artifact hash, response provenance or authenticated reviewer identity. The runner's endpoint restrictions therefore do not protect the artifact ingestion boundary.
- reproduction: In a disposable repository with no fresh blocking report, add a report containing Verdict: PASS, the current verified-tree hash and Reviewer-family: OpenAI. Pass that report through checkAdversaryReport and the C3 family filter. The same report satisfies the predicates used by both C2 and C3 without either review occurring. If an old FAIL exists, a benign in-scope change makes it stale; the forged report can bind the new tree.

### X-04 — severity 1 — Crash recovery discards the recovery record for repository-root mutation targets
- file: `fullburn/engine/scripts/mutate-lib.mjs`
- evidence: mutate.mjs deliberately mutates .github/, .claude/ and DONE.md at the repository root. recoverInFlight only accepts paths inside WORKSPACE, which is fullburn/. For these legitimate targets it rejects the path and deletes the marker without restoring the file. The SIGINT drill normally interrupts the initial spend-meter canary and does not exercise this recovery boundary.
- reproduction: Use a disposable checkout. Save the original .github/CODEOWNERS, write the harness-shaped marker with that absolute path and workspace set to fullburn/, then alter CODEOWNERS as a mutation would. Call recoverInFlight. By the supplied code it returns repaired:false with outside the workspace, removes the marker and leaves CODEOWNERS altered. Repeat for the root adversary definition and DONE.md.

### X-05 — severity 1 — The gateway URL is caller-controlled, bypassing the designated primary spend control
- file: `fullburn/engine/src/gateway.ts`
- evidence: llm constructs new URL(model.gatewayRoute, deps.gatewayBaseUrl) without validating the scheme, origin, account or gateway. It then attaches the client's vault bearer key. Tests supply only a legitimate-looking base and assert against that same supplied base. spend-ledger.ts explicitly makes the external AI Gateway cap the primary authority, so directing the request elsewhere bypasses that authority as well as exposing the key.
- reproduction: With makeDeps and its recording transport, set gatewayBaseUrl to https://receiver.example.invalid/ and invoke a valid hello-world request. Inspect the recorded URL and authorization header. The code permits dispatch to that origin rather than refusing before credential access or transport invocation.

### X-06 — severity 1 — The primary AI spend ceiling has no implemented or verified production enforcement
- file: `fullburn/engine/src/spend-ledger.ts`
- evidence: The file explicitly states that its ledger is advisory and that real Gateway ceiling configuration remains blocked on H2/L4. gateway-cap-primary.test.ts substitutes a closure that implements its own ceiling; it establishes refusal propagation, not external enforcement. No production cap provisioning or verification implementation is included. This preserves the existing L4 blocker rather than reopening the human-accepted decision to demote in-process enforcement.
- reproduction: Provision a non-production Gateway with the approved daily and monthly per-client ceilings. Disable local ledger enforcement, exercise concurrent requests and separate processes through the real transport, and verify externally recorded spend and refusal behavior at both ceilings and accounting-period boundaries. The stand-in test cannot substitute for this acceptance evidence.

### X-07 — severity 1 — The mutation harness can report CAUGHT solely because its target text changed
- file: `fullburn/engine/test/invariants/invariants.test.ts`
- evidence: The default suite runs 'every mutation entry resolves to exactly one site' during every harness mutation. That test calls staleEntries against the currently mutated files. Replacing an entry's from text commonly makes that same entry stale, which fails the suite independently of any behavioral lock. The harness labels every nonzero suite exit CAUGHT. Its negative canary preserves the original from string by appending a comment, so it does not expose this contamination; the positive canary can be caught by staleness itself.
- reproduction: In a disposable checkout, add an otherwise unused exported constant and a mutation entry changing only its value, with no consumer or behavioral assertion. Run the entry and inspect the failing tests. The staleness invariant will reject the entry's now-absent original text, allowing the harness to print CAUGHT despite no test observing the changed behavior. Run the meta-check too: its comment-only negative canary does not exercise this failure mode.

### X-08 — severity 2 — Secret redaction leaves returned outputs and error-name paths exposed
- file: `fullburn/engine/src/gateway.ts`
- evidence: llm traces a redacted copy but returns the original output. hardening.test.ts deliberately supplies a provider greeting containing CANARY_SECRET and checks only sink.events. Separately, traceFailure records sinkErr.name and appends it to safe.message after redaction. redactValue also emits Error.name without redacting it. These are reachable leak boundaries despite the existing message-redaction tests.
- reproduction: Return {greeting: CANARY_SECRET} from the transport and assert that the resolved llm value contains no secret; the supplied implementation returns it unchanged. Next make sink.emit throw an Error whose name is CANARY_SECRET and inspect the final rejection message. Finally pass an Error with that name through redactValue and serialize the result.

### X-09 — severity 2 — The required encrypted, automatically rotated OAuth vault is still a memory backend
- file: `fullburn/engine/src/vault.ts`
- evidence: The only included backend stores plaintext SecretRecord objects in a Map. rotate is a manually invoked setter, with no scheduling, expiry, provider refresh, encrypted storage or credential-scope enforcement. done-lib.mjs explicitly records the rotation deliverable as unmet since F10. A scoped handle and a version increment do not implement Phase 0's vault deliverable.
- reproduction: Inspect the backend implementations and rotation callers, then run vault.test.ts: its rotation test explicitly invokes backend.rotate and proves only replacement/versioning. A Phase 0 acceptance test must instead exercise the real encrypted backend and automatic rotation, including failure and continued least-scope access.

### X-10 — severity 3 — Production serving does not require an evaluated or family-diverse binding
- file: `fullburn/config/src/models.ts`
- evidence: RoleBindings is a plain Record. bindRole performs validation, but llm accepts any caller-supplied bindings object and checks only that the requested role and model exist. The serving path never calls validateBindings or requires binding provenance. Existing tests themselves serve through manually spread bindings. Moreover, attestEvalRun is public and can mint an attestation from caller-written passing booleans, a limitation acknowledged in the source.
- reproduction: Call llm with a complete binding map assigning both genome-tagger and creative-decision-adversary to claude-sonnet, using valid fixture dependencies. Also serve genome-tagger with llama-70b without calling runEval or bindRole. The serving path dispatches both rather than enforcing the advertised family-diversity and no-pass-no-bind requirements.

### X-11 — severity 3 — The cross-family runner bypasses Law 11 and is rejected by the repository's own structural scan
- file: `fullburn/engine/scripts/cross-family-lib.mjs`
- evidence: PRODUCTION_ENDPOINT is a direct openrouter.ai endpoint, and cross-family-read.mjs fetches it without AI Gateway or a Langfuse sink. scan-lib.mjs includes openrouter.ai in PROVIDER_HOSTS, applies structural rules to fullburn/**/*.mjs and provides no exemption for this file. The workflow runs leak-check.mjs, so the newly introduced runner conflicts with both the standing law and the current CI scanner. The recorded routing instruction names OpenRouter but the supplied spec does not amend Law 11.
- reproduction: Run scanContent with this file's path and contents, or npm run leak-check. The provider-hostname finding follows directly from the included regex and scope. Resolve the routing/spec conflict with the human; do not silently weaken the scanner to make this call pass.

### X-12 — severity 3 — Completion condition C8 counts changed Class-2 files, not missing approvals
- file: `fullburn/engine/scripts/done.mjs`
- evidence: C8-owed runs owed-approvals.mjs and passes only when its printed count is zero. That script never reads approval documents; it prints every changed Class-2 transition. Thus a properly approved phase with any Class-2 changes still fails C8. gate-cli.test.ts already demonstrates that pasting the generated transitions opens class2-gate, but the completion checker does not consult that result.
- reproduction: Create a disposable branch with one Class-2 change and a valid approval, following gate-cli.test.ts. Confirm class2-gate accepts it. Run owed-approvals against the same base and pass its output to parseOwed: it still reports one entry, causing the C8 predicate to fail despite approval.

### X-13 — severity 3 — Perfect structured adversary outputs fail evaluation because arrays are compared by identity
- file: `fullburn/engine/src/eval-harness.ts`
- evidence: runEval scores expected fields using output[k] === v. The creative-decision-adversary golden set and recorded outputs define equal but separately allocated reasons arrays. Every one of those cases therefore fails the field comparison even when the verdict and reason text exactly match. Existing eval-rebind tests exercise only the genome-tagger's scalar fields.
- reproduction: Run runEval for creative-decision-adversary with its GOLDEN and RECORDED_CLAUDE_SONNET data. A correct structural comparison would score 3/3; the supplied comparison scores the separately allocated reasons arrays as mismatches. Repeat with a JSON serialization/deserialization round-trip to model real transport output.

### X-14 — severity 3 — The live Gateway and Langfuse acceptance path is not implemented
- file: `fullburn/engine/src/tracing.ts`
- evidence: The included trace implementation is MemoryTraceSink; GatewayTransport has no included production HTTP implementation. gateway.test.ts uses MockGatewayServer and the eval harness uses authored placeholder recordings. There is no Langfuse ingestion or eval-publication adapter. done-lib.mjs correctly leaves AC1-live unmet, but AC2's tests likewise establish fixture rebinding rather than live frontier-to-open-source service.
- reproduction: Locate the concrete production transport, Langfuse sink and live eval publisher needed to construct LlmDeps without test backends. They are absent from the supplied implementation. After implementation and provisioning, execute hello-world and a frontier-to-open-source rebind, then independently retrieve their traces and eval results from the real Langfuse project.

### X-15 — severity 3 — The behavioral-claims checker does not bind its assertions to the actual claims
- file: `fullburn/engine/test/invariants/invariants.test.ts`
- evidence: The 'every behavioural claim in the ledger still holds' test runs a handwritten CLAIMS array. Its connection to ledgerText is only that a row ID such as '| L31 |' exists. It does not enumerate new behavioral rows or compare the actual claim text, and it does not read CLAUDE.md. Nevertheless done.mjs C9 reports this test as proof that every ledger/CLAUDE behavioral row has a stale-claim lock.
- reproduction: In a disposable checkout, retain an existing ledger row ID but change its behavioral assertion, or add a new unsupported behavioral assertion to CLAUDE.md. Run the C9-targeted test. Its implemented predicates do not inspect those assertions, so the advertised completeness check cannot detect the change.

### X-16 — severity 5 — Required Phase 0 provisioning and human-owned deliverables remain open
- file: `fullburn/HUMAN_TASKS.md`
- evidence: H1 still requires domain registration and the formal trademark check; H3/H4 require ClickHouse and Airbyte provisioning; H9 requires approval of initial grade thresholds. grade-thresholds.ts explicitly says sign-off is pending. These are Phase 0 deliverables or prerequisites, not later-phase features. The supplied tree contains no closure evidence, and the completion requirement map explicitly leaves infrastructure and naming incomplete.
- reproduction: Obtain human-authenticated registration/trademark evidence, exercise authenticated health/access checks against the provisioned ClickHouse and Airbyte services, and verify the threshold approval against the exact protected content. Keep the phase gate closed until these requirements are evidenced; this read cannot perform those external checks.

### X-17 — severity 5 — The declared Workers scaffold imports a Node-only clock at module initialization
- file: `fullburn/engine/src/trusted-clock.ts`
- evidence: NATIVE is initialized with process.hrtime.bigint.bind(process.hrtime) at module load. index.ts transitively imports this file, while engine/wrangler.toml declares no nodejs_compat flag and claims the source uses no Node APIs. All included runtime tests use Vitest's node environment; the Playwright smoke does not load the Worker.
- reproduction: Build and start engine/wrangler.toml under workerd with the supplied configuration, then request the nominal 404 entrypoint. Verify module initialization rather than only the fetch body. The undeclared process dependency must be resolved and tested in the actual target runtime before the Workers foundation can be accepted.

## Invariants checked

- No write outside publish/pause/promote: no Marketing API write implementation is present; the runtime restriction is deferred to Phase 6, not verified here.
- Cross-tenant reads fail by construction: scoped vault key composition and mismatch tests are present; authenticated tenant isolation across warehouse, storage and public endpoints is not implemented or verified.
- Append-only decisions ledger captures every write: explicitly deferred to Phase 2; report append-only checks are not a substitute for this ledger.
- Big red button halts all spend within 60 seconds: no relevant UI or spend-stop implementation exists in Phase 0; not verified.
- Bracket protection window cannot be bypassed: bracket implementation is deferred to Phase 5; fixture verdict examples do not establish enforcement.
- External content is data, never instructions: hostile test strings were treated as data in this review. The current drill only returns a configured mock response and checks unchanged constants; it does not establish resistance of a live agent.
- VERDICT.md remains hash-locked after launch: launch and the lock are deferred to Phase 6; no post-launch property was verified.
- OAuth tokens exist only in the vault and never in logs or traces: FAIL by source inspection; X-08 identifies reachable redaction gaps and X-09 identifies the missing production vault.
- Past-SLA human-queue items wait: queue implementation is deferred to Phase 6; not verified.
- Locked market/channel flags are inert: frozen registries and refusing accessors have explicit negative tests; their execution and eventual production adapter integration were not verified.
- A guard and its checker require a demonstrated negative case: source contains many negative-case tests, but commit-level compliance cannot be established without history; X-07 shows the mutation checker can mask missing behavioral locks.
- Every mutation result requires a passing meta-check: both canaries are wired, but their design does not detect the self-induced staleness failure in X-07.
- Unreachable-guard sweep is complete each round: an import-derived throw population and driven refusal entries exist; execution and individual behavioral mutation coverage are not established by this read.
- Guards are locked by behavior rather than source shape: not consistently established; the mutation-staleness check in X-07 directly turns source-text disappearance into a caught mutation.
- Behavioral ledger and CLAUDE claims carry stale-claim tests: FAIL; X-15 shows that actual claim contents and newly added claims are not bound to the advertised checker.
- A completed fix must identify the capability removed: the money-path source acknowledges residual in-process capabilities; the designated external authority is still unverified, as recorded in X-06.
- No verdict is reached outside default-suite visibility: helper decisions have tests, but runner wiring still makes independent decisions; X-12 identifies an incorrect C8 decision in done.mjs.
- Coverage exemptions must be measured: the leak-read audit includes negative fixtures; full filesystem coverage, binary classification and actual scanner execution were not verified.
- Readability is not credential detection: the advisory scanner names covered formats and a credential corpus exists; no clean-secret verdict is issued by this read.
- A secret ruleset is checked against independently authored credential formats: corpus and rule-removal tests are present; independent authorship and executed detection results remain unverified.
- Repository gates remain advisory until protection is enabled: the supplied project record explicitly leaves this open; X-01 retains the Phase 0 blocker.
- Workflow actions are SHA-pinned and actions:write is restricted: the two supplied workflows declare contents:read and use SHA-form action references; remote action contents and effective repository permissions were not verified.
- The discovered adversary must match the reviewed, protected definition: the two supplied definitions are textually identical and the root path is included in the relevant protections; actual session registration was not verified.
- Each session first proves checkout identity: no git execution or authenticated checkout inspection was available.
- Source-writing tools are import-safe and crash-safe: FAIL; X-04 identifies unrecoverable legitimate root-level mutation targets, and X-07 compromises mutation evidence.
- Completion is a remeasured exit code rather than prose: the checker currently retains explicit blocking conditions, but X-03, X-12 and X-15 invalidate specific claimed condition checks.
- The completion checker never nests: environment refusals and dedicated tests exist; actual process behavior was not executed.
- Shell gates require positive evidence: some parsers require summaries, but successful lint with empty output is explicitly accepted; no claim of comprehensive non-vacuity is made.
- Mutation entries are checked against the current tree: the check exists, but its execution inside each mutation invalidates the behavioral interpretation of CAUGHT, as detailed in X-07.
- Lint is a type-aware defect gate: both intended rules and planted-defect tests exist; X-02 identifies unprotected production-scope control.
- Cross-family review uses a pinned reviewer read back from the router: the runner checks the model string, but X-03 shows downstream report acceptance does not authenticate runner provenance; actual served-model identity was not independently verified.
- No edits occur while a checker is in flight: no final tree remeasurement or enforced edit exclusion was established; this remains a process requirement, not a verified property.

## Limitations (what a read cannot establish)

- This was a source-and-test read only. No commands, tests, endpoints, malformed requests, cap breaches, browser flows, mutation runs or signal drills were executed. Reproduction steps describe checks to perform, not observed execution results.
- The supplied verified-tree hash was not independently recomputed. File modes, symlinks, git history, branch state and the exact byte-level correspondence between the bundle and the index were unavailable.
- VERIFIED_TREE_SCOPE excludes reports/ and APPROVALS/. Their referenced historical findings, written human acceptances, signatures, current review artifacts and gate acknowledgments were not supplied for verification. Related historical IDs are retained in evidence rather than declared resolved.
- The complete repository includes sibling product trees outside this bundle. Repository-wide leak coverage, CODEOWNERS population coverage and tests depending on those sibling trees cannot be established from the verified-scope text alone.
- No GitHub API access was available to inspect current protection, required checks, review identities or workflow artifact hashes. X-01 reports the explicitly open requirement in the supplied record, not a fresh measurement of GitHub settings.
- No live AI Gateway, Langfuse, provider billing, encrypted vault, ClickHouse or Airbyte service was inspected. Primary spend-cap behavior, credential rotation, trace delivery and live model rebinding remain unverified.
- Three llm decision paths were inspected: successful output, cap refusal and post-dispatch failure. They attempt sink emission in code; actual Langfuse receipt was not established. The cross-family runner has a separate direct network path.
- API timeout handling was inspected only through the local transport contract. Airbyte sync gaps, attribution-window edges, duplicate webhook delivery and revenue-reconciliation idempotence cannot be tested before their implementations exist.
- No real ad account was accessed. Policy vetoes, write-rate limits, trust-ladder progression, protection windows, proxy-only promotion refusal, queue SLA waiting and staggered onboarding remain later-phase verification obligations.
- No live injection, model-failover, backup-restore, account-recovery or rollback drill was performed. Synthetic hostile fixture text alone was not classified as an agent-followed injection.
- Model availability, provider routing guarantees, dependency publication, action commit provenance, domain registration and trademark status were not checked against external sources.
- No automated tests or report files were added during this read. Phase B requires deterministic reproductions of these findings, verified against pre-fix and post-fix trees, without allowing the mutation harness's own bookkeeping to supply the failure.
