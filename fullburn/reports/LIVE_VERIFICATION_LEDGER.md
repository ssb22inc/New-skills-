# LIVE VERIFICATION LEDGER (adversary finding R7)

Machine-readable list of acceptance criteria whose LIVE halves cannot be
verified in the build sandbox. Each entry: what is unmet → which human task
unblocks it → the exact verification to run once unblocked. An entry leaves
this ledger only when its verification has been executed and recorded by the
adversary. **While any entry is open, every phase verdict is CONDITIONAL, and
Phase 1 implementation cannot be adversary-passed (its brief generator needs a
live LLM path).**

| # | Blocked verification | Phase/AC | Blocking task | Verification when unblocked |
|---|---|---|---|---|
| L1 | Hello-world call round-trips through the REAL Cloudflare AI Gateway and the trace appears in the REAL Langfuse project | Phase 0 AC 1 (live half) | H2, H5, H6, H7 | `llm()` with role `hello-world` against production `gatewayBaseUrl` + Langfuse sink; adversary independently confirms the trace in the Langfuse UI |
| L2 | Genome-tagger golden-set outputs regenerated from LIVE models (current recorded outputs are authored placeholders that exercise the harness only) | Phase 0 AC 2 (live half) | H6 | Re-run `runEval` with fresh transport recordings for each candidate; commit recordings; re-run rebind test |
| L3 | Eval results pushed to Langfuse (eval harness ↔ Langfuse adapter live) | Phase 0 deliverable (Langfuse eval harness, live half) | H5 | Harness pushes an eval run; adversary confirms it in Langfuse |
| L4 | Per-client AI spend caps ALSO configured Gateway-side and verified to match `caps.ts` (local enforcement is live in code; Gateway config is defense-in-depth) | Phase 0 (§2.2) | H2 | Configure Gateway caps; adversary attempts an over-cap call with local check bypassed in a test harness — Gateway must refuse |
| L5 | CI runs on GitHub Actions with secrets in repo settings; leak-check proven against real secret material | Phase 0 (§10.3) | H7 | First real PR exercises all three gates on github.com |
| L6 | fullburn.ai registered; formal trademark check completed | Phase 0 deliverable | H1 | Registrar + trademark confirmation recorded here |
| L7 | Workers-runtime test pool (workerd) in CI — engine src is written platform-neutral against the Workers target (wrangler.toml committed), but tests currently execute on Node | Phase 0 (§2.2, R12 partial) | none (buildable; queued behind Phase A findings) | Add @cloudflare/vitest-pool-workers, run suite under workerd, record parity |
| L8 | Cross-family adversary re-review: this phase's build adversary ran on the SAME model family as the builder (harness limitation) — §2.4 family diversity violated for the review itself | Phase 0 process (R9b) | H6b | Re-run the Phase 0 adversary review on a non-Claude model; record deltas as findings |
| L9 | **ClickHouse Cloud instance + Airbyte instance provisioned** — named Phase 0 deliverables with no code, no connection and no schema in the repo. Phase 0 could otherwise be signed off with no warehouse and no ingestion (adversary finding F10) | Phase 0 deliverable | H3, H4 | Provision both; connect a Worker to ClickHouse over HTTPS and land one row; adversary confirms the row and the per-client schema isolation |
| L10 | **OAuth vault is least-scope but neither encrypted nor auto-rotated** — `MemoryVaultBackend` is in-memory plaintext with a manual `rotate()`. §15 requires vault-encrypted, auto-rotated secrets with a drilled breach runbook (adversary finding F10) | Phase 0 deliverable (§15) | H7 | Back the vault with encrypted storage + automatic rotation; run the breach runbook drill (revoke → rotate → notify → audit) and record time-to-rotate |
| L11 | **Repository protection is not in place** — required status checks, no-force-push, and CODEOWNERS on `APPROVALS/**` + every Class-2 path. Until then the CI gates are advisory and an approval entry proves *what* was approved, never *who* approved it (adversary finding F14) | Phase 0 (§10.3) | H19 | Enable protection on GitHub; adversary attempts a merge with a red check and a self-authored approval — both must be refused |

Ledger is append-only: cleared entries get a `CLEARED <date> <evidence>` line,
never deletion.
