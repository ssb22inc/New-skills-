# ADVERSARY REPORT phase0.x9
Verdict: FAIL
verified-tree: b454f167283b726dd2417d27a7ffe095785ccc4c

Reviewer-family: OpenAI (gpt-6-luna via OpenRouter)

Round: x9, CROSS-FAMILY READ of Fullburn Phase 0 (DONE.md §2.1.3; ENGINE_BUILD §2.4 family-diversity rule).
Target: commit `5bc9de3` on branch `HEAD`; verified tree `b454f167283b726dd2417d27a7ffe095785ccc4c` (hash of `git ls-files -s` over VERIFIED_TREE_SCOPE, computed by the runner, not by the reviewer).
Reviewer: requested `openai/gpt-6-luna`, served `openai/gpt-6-luna` (read back from the response; a mismatch writes no report). Endpoint: https://openrouter.ai/api/v1/chat/completions. Response id: gen-1791635224-2QdoeBLb2P9MvYUhZtDe.
Builder family: the code under review was written by a Claude-family model; this reviewer is not (the line 5 family is what done-lib reads).
Prompt: the human-owned adversary definition verbatim (sha256 d5a5402f42556818511dbf2e9b4f5f9eb1fe39ac9f40200bd6d0344361cd59ea) plus the builder-authored read addendum (sha256 6dd30a3cf2577d003cb7ce9910b14abca69e06093cf407f0baf89a7c97519fc7).
Bundle: 128 files, 1687738 bytes sent; omitted as binary: none.
Usage: 462311 prompt, 7477 completion tokens. Started 2026-10-10T12:27:04.156Z.
Verdict basis: 4 finding(s) at severities 1,2,3.

This file is written by `engine/scripts/cross-family-read.mjs` from the reviewer's structured answer. It is a READ: the reviewer had the tree as text and no execution; every property it could not establish that way is listed under Limitations, never counted as verified.

## Findings (ranked by severity, then file)

### X-01 — severity 1 — CI gates do not block merges without external branch protection
- file: `.github/workflows/fullburn-gates.yml`
- evidence: The workflow runs the adversary and Class-2 checks, but workflow files cannot make their status checks required. HUMAN_TASKS.md still lists H19 repository protection as a human task, and done-lib.mjs explicitly marks AC4-enforced unmeasurable because main has no branch protection. A cap-changing PR can therefore merge without the checks that are intended to protect it.
- reproduction: On the repository's GitHub settings, leave required status checks and no-bypass protection unset, then merge a PR that changes a protected cap path without a valid approval. The workflow may report failure, but the repository does not prevent the merge.

### X-02 — severity 1 — The LLM serving path accepts arbitrary transports that can bypass the Gateway cap and receive its credential
- file: `fullburn/engine/src/gateway.ts`
- evidence: LlmDeps.transport is caller-supplied and llm() only checks that it has a post() method. assertGatewayBase validates the URL string, not the transport's behavior. llm() passes the vault's AI Gateway bearer credential to that transport. A custom transport can ignore the URL, send the credential and request elsewhere, and avoid the AI Gateway's stated primary out-of-process spend cap.
- reproduction: Call the exported llm() with the launch bindings, a valid scoped vault, and a custom transport whose post() records the authorization header and returns a valid hello-world result without contacting the AI Gateway. The call is not structurally refused; the custom transport receives the Gateway credential and the Gateway's external cap is not involved.

### X-03 — severity 2 — Exported switchboard resolvers can activate a locked channel or market using fabricated bundle evidence
- file: `fullburn/config/src/channels.ts`
- evidence: resolveActiveChannel and resolveActiveMarket are exported and accept caller-created registry tables. assertActivationEarned checks only that a bundle activation has liveData: true and a report-shaped filename; it does not establish that the report exists or passed. The report-existence test checks only entries in the canonical registries, not arbitrary tables passed to these exported functions. Thus the frozen canonical flags do not make activation structurally impossible.
- reproduction: Call resolveActiveChannel with a table containing a complete TikTok entry, status: "on", and activation: { basis: "bundle", adversaryReport: "ADVERSARY_REPORT_fake.md", liveData: true }. The resolver accepts it without proving that the named report exists or is a live-data PASS. The analogous attack applies to resolveActiveMarket.

### X-04 — severity 3 — Phase 0 deliverables and acceptance criteria remain explicitly unmeasurable or absent
- file: `fullburn/engine/scripts/done-lib.mjs`
- evidence: PHASE0_REQUIREMENTS explicitly records AC1-live, AC4-enforced, D-vault-live, D-warehouse, and D-name with command: null, which makes the completion check fail. The tree contains no provisioned ClickHouse/Airbyte or domain/trademark evidence, no real Gateway-to-Langfuse round-trip, no deployed Durable Object CipherStore/Worker key binding/rotation cron, and no current phase-0 adversary report bound to this tree. These are Phase 0 requirements, not merely later-phase features.
- reproduction: Run npm run done -- phase in the target checkout: the listed null-command requirements are reported as not measurable and C1 cannot pass. For the missing report, inspect fullburn/reports/ for a phase-0 report bound to the current verified tree; none is included in this verified tree.

## Invariants checked

- Writes-only rule: no Marketing API write adapter is present in Phase 0; no out-of-scope write path is evidenced, but the future write-verb restriction is not yet applicable.
- Spend caps immutable at runtime: frozen caps and runtime-mutation tests exist; ad-spend caps are explicitly not enforced until Phase 6. Execution was not available.
- Per-client isolation: vault scoping and tests cover separate client identifiers; production Durable Object/warehouse isolation is not implemented or verified.
- Deterministic gates before LLM judgment: configuration, cap checks, schema checks, and deterministic grade logic are present; production execution was not verified.
- Proxies kill only and revenue promotes: no bracket or promotion path exists in Phase 0; not applicable yet.
- No prediction gates: structural scan rules and tests are present; the scanner was not executed on this tree.
- Exploration quota: no creative-slot implementation exists in Phase 0; not applicable yet.
- Trust ladder: no trust-ladder state machine exists in Phase 0; not applicable yet.
- Every LLM call through AI Gateway and every decision traced: adapters and trace boundaries exist, but llm() accepts arbitrary transports and the real Gateway/Langfuse integration is unverified.
- Honest reporting and warehouse-backed client-visible numbers: no client reporting or warehouse joins exist in Phase 0; not applicable yet.
- Models interchangeable, roles permanent, and builder/adversary family-diverse: role bindings and eval machinery exist; live provider evals and serving were not executed.
- Grade Registry A invariant: seeded grade computation and traced enforcement code/tests exist; live data and continuous enforcement are absent.
- Self-improvement caged: no self-improvement loop exists in Phase 0; not applicable yet.
- WordPress mutations diff-logged and reversible: no WordPress integration exists in Phase 0; not applicable yet.
- Staggered onboarding and stable-client gate: no onboarding/client stability system exists in Phase 0; not applicable yet.
- Switchboard locked flags structurally inert: canonical registries are frozen and tested, but exported resolver functions accept fabricated tables and activation evidence; finding X-03.
- Decisions ledger append-only and captures every write: no decisions ledger exists in Phase 0; explicitly deferred to Phase 2.
- Big red button halts spend in under 60 seconds: no UI or spend-control surface exists in Phase 0; not applicable yet.
- Bracket protection window cannot be bypassed: no bracket exists in Phase 0; not applicable yet.
- External content is data, never instructions: only a limited inert fixture check is present; crawler/research injection drills are deferred and no agent execution was verified.
- VERDICT.md hash-locked after client-zero launch: VERDICT.md is not present; client-zero launch is a later phase.
- OAuth tokens only in the vault: encrypted vault mechanisms and redaction tests exist, but live vault provisioning is absent and scanning/execution was not possible.
- Human-queue SLA waits rather than acts; locked flags stay inert: queue behavior is deferred to Phase 6; the locked-flag claim is weakened by finding X-03.
- Harness/checker invariants: extensive deterministic tests and mutation machinery are present in the tree; their execution and meta-check results could not be verified.

## Limitations (what a read cannot establish)

- This is a read-only review of the provided tree; I could not run unit, integration, invariant, e2e, mutation, or workerd tests, nor submit malformed requests or execute the runtime attacks.
- I could not inspect GitHub branch-protection/ruleset settings, required-check enforcement, bypass lists, or live approval authentication. The tree itself states that branch protection is absent/unmeasured.
- I could not call the production AI Gateway, Langfuse, vault, ClickHouse, Airbyte, or external services, so live round-trips, trace delivery, secret handling in deployed logs, and infrastructure provisioning are unverified.
- I could not verify the fullburn.ai registration or formal trademark check, nor execute the crawler injection, queue-SLA, promotion, kill-window, second-client onboarding, or real spend-cap drills.
