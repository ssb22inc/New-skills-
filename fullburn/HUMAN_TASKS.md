# Human Tasks — What Only You Can Do

Claude Code executes everything else. Spec references in parentheses. Nothing here may be worked around by the builder — a blocked task stays blocked until you clear it.

## Phase 0 (blocking — the rails)

- H1 · **fullburn.ai** — complete the domain registration and the formal trademark check (§11 Phase 0, §14). The name decision is made; only the paperwork remains.
- H2 · **Cloudflare account** — Workers Paid plan; enable AI Gateway, R2, Vectorize, Durable Objects, Workflows, Browser Rendering (§2.2). Create the API token for CI/deploy.
- H3 · **ClickHouse Cloud** — create the service (this is the warehouse, §2.1). Copy the HTTPS endpoint + credentials into the secrets vault, never into the repo.
- H4 · **Airbyte** — Airbyte Cloud account or a small VPS for OSS (§2.2, explicitly not Cloudflare). Claude Code automates connector provisioning after this exists.
- H5 · **Langfuse** — create the project (§2.3). Every LLM call and agent decision must trace here from the first hello-world (Law 11).
- H6 · **Model provider keys** — at least one frontier (Claude/GPT/Gemini) and one open-source route (Workers AI / Together / Groq / Fireworks), all wired through AI Gateway (§2.4). The family-diversity rule needs two families from day one (Law 13).
- H6b · **Cross-family adversary re-review** (adversary finding R9b, Phase 0) — the Phase 0 build adversary ran on the same model family as the builder because the build harness only offers Claude models. Once H6 provides a non-Claude route, re-run the Phase 0 adversary review on that model and record deltas as findings. Tracked as ledger item L8; Phase 0's verdict stays conditional on it.
- H7 · **Secrets into CI + vault only** — GitHub Actions secrets and the encrypted vault are the only two homes for any key or token (§15). A token in code, logs, or traces is a critical defect the CI leak check must catch.
- H8 · **Approve `config/caps.ts` values** — per-client daily/total spend caps are yours to set; every future change is a human-approved commit (Law 2).
- H9 · **Approve initial Grade Registry A-thresholds** (§12) — tuned in Phase 0, human-owned thereafter (Law 14, Class 2).
- H19 · **Repository protection — without this every CI gate is advisory** (adversary finding F14, ledger L11). On GitHub, for the default branch and every phase branch: (1) **required status checks** — `verify`, `adversary-gate`, `class2-gate` — so a red or gate-free PR cannot merge; (2) **no force-push / no branch deletion**; (3) **CODEOWNERS requiring your review on `fullburn/APPROVALS/**` and on every Class-2 path** listed in `engine/scripts/gate-lib.mjs`. Reason this is yours alone: the workflow file lives in the branch under test, so a PR that deletes it runs no gate, and the approval mechanism proves *what* was approved by content hash but never *who* wrote it — only CODEOWNERS makes "human-only" real. (~15 min)

## Class-2 approvals owed for the Phase 0 fix commit

The Phase 0 adversary fixes touch files that are Class 2 by their own rule, so this PR needs approval entries from you before it can merge (format in `APPROVALS/README.md`; `sha256sum <file>` from the repo root gives the hash). Nothing here changes a *value* you own — caps and thresholds keep their pending-sign-off state — but the rule is the rule, and the builder must never write its own approval:

- `fullburn/config/src/caps.ts` — removes the runtime cap-widening seam (a caller could hand `llm()` its own table with a forged sign-off), adds the two fixture clients the tests drive, and records that ad-spend caps have no enforcement path before Phase 6.
- `fullburn/engine/src/gateway.ts`, `fullburn/engine/src/spend-meter.ts` — the reserve-then-settle cap path (fixes the concurrency breach).
- `fullburn/engine/src/grade-registry.ts` — own-property lookups so a polluted prototype cannot forge an A.
- `fullburn/config/src/grade-thresholds.ts` — adds the nine §12 A-criteria that had no threshold (so an area could hold "A" with CAC 4x baseline and injection drills failing) plus per-metric domain bounds.
- `fullburn/config/src/models.ts`, `fullburn/engine/src/eval-harness.ts` — binding attestations must now come from an executed run over the role's declared golden set.
- `fullburn/engine/scripts/gate-lib.mjs`, `adversary-gate.mjs`, `class2-gate.mjs`, `diff-lib.mjs`, `leak-check.mjs`, `scan-lib.mjs`, `fullburn/vitest.config.ts` — gate hardening.
- `fullburn/engine/src/vault.ts`, `tracing.ts`, `redact.ts` — cross-tenant key collision, failure traces, and redaction of trace payloads.
- **The package manifests and the test tree are now Class 2** (`package.json` ×3, `tsconfig*.json`, `fullburn/(config|engine)/test/**`, `PHASE`): `config/package.json` could redirect the `@fullburn/config/caps` import to an attacker module without touching `caps.ts`, and `fullburn/package.json` could redefine `npm test` so the entire invariant suite became a no-op — both with no approval required. Expect approval entries for these paths on future PRs; that friction is the point.

**Added by the r3 fix pass:** `fullburn/engine/src/` is now Class 2 in full (a seven-file list left `index.ts`, the deployed Worker entrypoint, free to re-export an unmetered `llm()`), as are `vitest.workspace.ts` and any `wrangler.toml`. Approval entries now also carry `base-commit:` — see below.

**Note on approval format:** entries now name a TRANSITION **and the pull request it belongs to** — `base-commit:` (the sha this PR branches from), `from-content-hash:` (the content at that base) and `content-hash:` (the new content). Content hashes alone were not enough: once your own revert restored the previous bytes, every approval ever issued from those bytes was re-armed, and copying one back in re-authorized the revoked change with no forgery at all. A base commit occurs once. See `APPROVALS/README.md`.

## Before client zero spends a dollar (Phase 6)

- H10 · **Meta assets** — client-owned Business Manager with verified domain, plus the warmed backup ad account (§6.1). Developer app with Marketing API access, writes-only usage (Law 1).
- H11 · **`VERDICT.md`** — sign off the pre-registered absolute thresholds for the PulseRN sprint (target CAC, payback period, D30 retention) before hash-lock (§14). After the first dollar it is unchangeable.
- H12 · **Client-zero budget** — approve the $2,000 / 30-day concentrated sprint (~$66/day) (§14). The 90-day trickle was killed as a false-verdict risk.
- H13 · **PulseRN claims ceiling** — confirm the NCSBN non-affiliation disclaimer wording for ads/landing pages; the claims adversary blocks anything past the site's own "honest readiness estimate" ceiling (§14).
- H14 · **Legal texts** — DPA, no-cross-client-training clause, case-study rights in the client contract template (§7 step 9); attorney review before any cohort client signs.

## Standing (forever)

- H15 · **The gavel** — one daily 15-minute human-queue session; severity 1–2 same day, 3–5 within 72h (§5.1). Past SLA the engine waits — your latency is the throttle, by design.
- H16 · **Phase gates** — each phase needs your ack on a green adversary report before the next begins (§10.1). Never pre-approve.
- H17 · **Class 2 approvals** — Laws, caps, money paths, pricing, the Grade Registry, the improvement loop's own code: only you, forever (Law 15, §13).
- H18 · **Quarterly drills** — backup restore, Meta account recovery, red button <60s, model failover; results are graded (§15, §12).
