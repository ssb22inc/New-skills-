# Human Tasks — What Only You Can Do

Claude Code executes everything else. Spec references in parentheses. Nothing here may be worked around by the builder — a blocked task stays blocked until you clear it.

## Phase 0 (blocking — the rails)

- H1 · **fullburn.ai** — complete the domain registration and the formal trademark check (§11 Phase 0, §14). The name decision is made; only the paperwork remains.
- H2 · **Cloudflare account** — Workers Paid plan; enable AI Gateway, R2, Vectorize, Durable Objects, Workflows, Browser Rendering (§2.2). Create the API token for CI/deploy.
- H3 · **ClickHouse Cloud** — create the service (this is the warehouse, §2.1). Copy the HTTPS endpoint + credentials into the secrets vault, never into the repo.
- H4 · **Airbyte** — Airbyte Cloud account or a small VPS for OSS (§2.2, explicitly not Cloudflare). Claude Code automates connector provisioning after this exists.
- H5 · **Langfuse** — create the project (§2.3). Every LLM call and agent decision must trace here from the first hello-world (Law 11).
- H6 · **Model provider keys** — at least one frontier (Claude/GPT/Gemini) and one open-source route (Workers AI / Together / Groq / Fireworks), all wired through AI Gateway (§2.4). The family-diversity rule needs two families from day one (Law 13).
- H7 · **Secrets into CI + vault only** — GitHub Actions secrets and the encrypted vault are the only two homes for any key or token (§15). A token in code, logs, or traces is a critical defect the CI leak check must catch.
- H8 · **Approve `config/caps.ts` values** — per-client daily/total spend caps are yours to set; every future change is a human-approved commit (Law 2).
- H9 · **Approve initial Grade Registry A-thresholds** (§12) — tuned in Phase 0, human-owned thereafter (Law 14, Class 2).

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
