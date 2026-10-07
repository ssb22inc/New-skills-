# ADVERSARY_REPORT_phase0 — r3 (findings preserved; synthesis interrupted)

Verdict: FAIL

verified-tree: (not computed — see note below)


> **How this file was produced.** Five adversaries attacked commit `7a8067e`; every
> claim was then independently re-attacked by a separate skeptic agent. 47 findings
> survived verification, 2 were refuted. The synthesis agent that normally writes
> this report was cut off by the account's monthly spend limit, and one verifier
> (`R3-CP-05`) was cut off by a model safeguard flag, so its claim is EXCLUDED here
> rather than counted.
>
> This document is therefore a **mechanical extraction of the verified findings**,
> assembled by the builder from the run journal — not an adversary-authored
> synthesis. The verdict follows the rule the review was given ("FAIL if any
> confirmed finding is money-loss, ban-risk, data-lie or isolation severity"), not
> from any builder judgement. No `verified-tree` hash is claimed, so this report
> cannot open the gate under any circumstances; the gate remains closed.
>
> A proper r3 synthesis — including the regression table for R2-01..R2-34 and the
> mutation-testing section — still needs to be written by an adversary.

## Confirmed findings by severity

- **1 money-loss**: 4
- **money-loss**: 3
- **2 ban-risk**: 3
- **ban-risk**: 1
- **3 data-lie**: 3
- **data-lie**: 17
- **4 isolation**: 4
- **isolation**: 4
- **dummy-proof**: 6
- **5 dummy-proof**: 2

## Regression status reported per dimension


### money path — engine/src/spend-meter.ts, engine/src/gateway.ts, config/src/caps.ts

- confirmed closed: 9
- **still open: 2**

> R2-16 — the ledger-lie leg is still open AND has been made materially worse. The r2 report accepted severity 3 explicitly on the evidence that a leaked reservation occupies exactly the headroom a settled charge would, so "lockout happens at call #100 in BOTH the defective and healthy runs" and "there is no cap breach, no runaway spend". That is no longer true: with the release() now wired into the outer catch, the leaked reservation is refunded instead, so the cap never engages. Measured: 2000 billable provider calls, committed $0.0000, reserved $0.0000, 0 cap refusals — versus a healthy control that stops dead at 500 calls / $5.00. todayUsd() still reports $0.00 for real provider spend (the original data lie), and now the meter no longer even self-limits. Filed as M-01 at severity 1. R2-16's own hypothesis about DO eviction resurrecting headroom is now moot — the headroom comes back without any eviction. Separately, R2-16's honest caveat that "no shipped meter throws from settle" still holds, and I confirmed MemorySpendMeter.settle/release still skip #assertAvailable() (a settle while the meter is marked unavailable still commits — the conservative direction, so not filed).


> R2-03 — closed in behaviour, still unlocked in CI. See M-02: one line, 148/148 green. The r2 report's own §10.2 reasoning for filing R2-07 at severity 1 applies here unchanged.


### control plane — engine/scripts/gate-lib.mjs, adversary-gate.mjs, class2-gate.mjs, diff-lib.mjs, .github/workflows/fullburn-ci.yml, APPROVALS/README.md

- confirmed closed: 13
- **still open: 2**

> R2-05 — the from-hash binding stops replay only while the tree is not in the approved FROM state. A revert puts it back there byte-for-byte, re-arming every superseded approval. Executed end to end on caps.ts (7x unapproved raise, class2-gate 'Class-2 changes carry transition approvals', EXIT=0) and on the CI workflow (both gate jobs deleted; class2-gate EXIT=0, adversary-gate EXIT=0, npm test 148/148, typecheck 0, leak-check clean, zero new approvals). See R3-CP-01.


> R2-09 — the fence tracker compares only the marker character, not the fence length, so a 3-backtick fence closes a 4-backtick one. Executed through the shipped CLI: a report whose prose verdict is `Verdict: FAIL` and whose only PASS sits inside a nested code example printed 'adversary report PASS and bound to the current tree', EXIT=0. This is the exact `````markdown`-wrapping case the r2 report enumerated. See R3-CP-02.


### data truth (grade-registry.ts, grade-thresholds.ts, models.ts attestation, eval-harness.ts)

- confirmed closed: 8
- **still open: 1**

> R2-23 — open. The fix addressed the substituted-SET half (case ids must match GOLDEN_SET_CASE_IDS) and left both of R2-23's stated causes standing: the golden set's CONTENT is still a caller-supplied argument, and `Object.entries(gcase.expected).every(...)` is still vacuously true on an empty map. Executed against the real harness with the real committed recordings: llama-70b honestly scores 0.2 and is refused; the same run with `expected: {}` on the same five declared ids scores 1.0 and BINDS; narrowing `expected` to the one field llama answers correctly also scores 1.0 and BINDS. R2-23 pre-emptively stated that a 'total must equal the declared golden-set size' check 'would not save it' — that is the check that was implemented. Filed as DT-01, with DT-02 showing it is worse for the two roles that have no golden set at all and DT-04c showing the new check has no test protecting it.


### isolation, secrets, tracing, scanner — engine/src/redact.ts, tracing.ts, vault.ts, engine/scripts/scan-lib.mjs, leak-check.mjs

- confirmed closed: 8
- **still open: 2**

> R2-13 — NOT CLOSED for its central claim (the registry half), PARTIALLY closed elsewhere. What WAS fixed: PROVIDER_HOSTS and PLATFORM_API_HOSTS are now domain-level, so `const host = "api." + "openai.com"` and `fetch(`https://graph.facebook.com/${v}/me`)` both fire (mutation M7 turns the suite RED). The prediction rule is now stem-based and catches expectedRoas / predicted_roas / forecastCtr / projectedRevenue / estimatedConversion / winProbability. What was NOT fixed: (a) REGISTRY_INDEXING is still `\b(?:MARKETS|CHANNELS)\s*\[` — I re-ran all seven spellings and only `CHANNELS["google"]` is caught; `CHANNELS.google`, `const { tiktok } = CHANNELS`, `Object.values(CHANNELS)`, `Object.entries(MARKETS)`, `import { CHANNELS as C }` + `C.tiktok`, and `const R = CHANNELS; R["tiktok"]` are all MISSED. The runtime half is also unchanged: executed against config/src/channels.ts, `CHANNELS.google` returns {"status":"staged","writeAdapter":null,"decisionAdversaryRules":null,"fatigueModel":null} and `const { tiktok } = CHANNELS` returns the locked entry, both without ever entering requireActiveChannel. CLAUDE.md's standing invariant 'locked market/channel flags are structurally inert' remains false — it is still a regex that misses dot access, exactly as R2-13 stated. (b) The provider rules still miss every form R2-13 named as 'the default way to write the thing': `import { openai } from "@ai-sdk/openai"`, `import { ChatOpenAI } from "@langchain/openai"`, `import { VertexAI } from "@goog


> R2-29 — NOT CLOSED for the scope half; PARTIALLY closed for extensions, and the fix that was made is untested. I rebuilt the r2 probe: a synthetic repo root with the SAME `sk-ant-...` token planted in 28 files, then called the real scanTree(). Result: 9 of 28 caught. Now SCANNED (genuine progress): `.github/workflows/*.yml`, `.github/dependabot.yml`, `.log`, `.csv`, `.sql`, `.sh`, `.env.production`, `.cjs`. Still BLIND: `pulsern/app/config.ts`, `pulsern/.env`, `haven/ops/deploy.sh` — R2-29 established in-repo that pulsern is client zero with a live $70/day cap, and both sibling trees are still present at the repo root while ROOTS is hardcoded to ['fullburn', '.github'] (leak-check.mjs:18). Also blind: every repo-root file (`README.md`, `scripts/release.sh`, `.env`), and the extensions `.pem`, `.key`, `.har`, `.bak`, `.text`, `.py`, `.p12`, `.tf`, `.tfvars`, `.properties`, `Dockerfile`, `Makefile`. The `.pem`/`.key` gap is the sharp one and R2-29 called it by name: SECRET_PATTERNS carries a private-key-block rule that still cannot fire on the two file extensions that format actually uses. R2-29's recommended fix shape (invert SCANNED to a skip-denylist so unknown extensions fail closed) was not taken. `.github/workflows/fullburn-ci.yml` still restricts `on.pull_request.paths` to `fullburn/**` plus the workflow file, so a token committed to `pulsern/` does not even start the job. Finally, mutation M5 (revert ROOTS to ['fullburn']) leaves the suite 148/148 GREEN and leak-check c


### honesty, completeness, and whether the tests actually defend the fixes (mutation testing, Phase 0 AC checklist, ledger audit, Class-2 approval-list audit, §10.2 self-check, adversary-lock-test adjudication)

- confirmed closed: 24
- **still open: 3**

> R2-13 — PARTIALLY open and undisclosed. The prediction-gate rule was genuinely rebuilt as stems (expectedRoas, predicted_roas, forecastRoas, projectedRevenue, estimatedCtr all CAUGHT) and the host rules are now domain-level (concat and subdomain variants CAUGHT). But REGISTRY_INDEXING is byte-identical to before — still /\b(?:MARKETS|CHANNELS)\s*\[/ — and the r2 report named dot access and destructuring as the legs the finding survived on. Executed against the real scanContent: CHANNELS.google MISSED, `const { tiktok } = CHANNELS` MISSED, Object.values(CHANNELS) MISSED, Object.entries(CHANNELS) MISSED, alias-then-dot MISSED; only the bracket form is caught, and scan-lib.test.ts:69 still asserts only the bracket form. Also still MISSED: env.AI.run('@cf/meta/llama-3-8b-instruct'), @ai-sdk/openai, @langchain/openai, @google-cloud/vertexai, and the azure-openai, bedrock, deepseek, x.ai, cohere and ollama hosts; and structural rules still early-return on non-code files, so graph.facebook.com in engine/wrangler.toml or engine/src/hosts.json is MISSED. CHANNELS and MARKETS remain exported raw, so CLAUDE.md's 'locked market/channel flags are structurally inert' still rests on a regex that misses dot access. Nothing in the commit message, HUMAN_TASKS.md or the ledger records this residue.


> R2-25 — PARTIALLY open. The spec-bullet half is genuinely closed. The 'deferral count drifted' and 'phase falsified' halves are not. The self-check's only cross-relation is `live + NOT_YET_APPLICABLE.length >= bullets`, so a live invariant can be deleted as long as the claimed count is decremented in the same edit. Executed: removed the LIVE Law-3 cross-tenant isolation invariant, added a NOT_YET_APPLICABLE entry reading 'per-client isolation (Law 3), applicableFromPhase: 9, deferred by an unreviewed edit', decremented '7 are live below' to 6 and toHaveLength(7) to (8) — full suite 147 passed, 0 failed. Separately, changing VERDICT.md's applicableFromPhase from 6 to 1 keeps the suite at 148 (the only assertion is > 0), and gutting a LIVE test body to expect(true).toBe(true) while keeping its it("LIVE — …") title also keeps 148 — which is verbatim the F13 standard the file's own header sets ('an entry that asserts nothing is worse than an absent one').


> R2-29 — PARTIALLY open and undisclosed. ROOTS = ['fullburn', '.github'] closes the .github half the finding named, but the finding also named the sibling client trees: 'pulsern is client zero … its app and its own workflows sit in this repo unscanned.' They still are. I ran the shipped walk() over /home/user/New-skills-/pulsern and /haven: 346 files that leak-check would scan are never visited. No realized leak today — I ran scanContent over all 346 and got 0 secret-pattern hits (14 structural hits, all 'LLM provider hostname' in pulsern's own product code, which is arguably out of Law 11's scope). But the gap is real and appears in no ledger entry.


---

## Findings


### M-01 · 1 money-loss · The r2 fix converted R2-16 from a self-limiting ledger lie into an unbounded cap breach: a settle() that throws after a billable call is now RELEASED, so the cap never engages

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** Law 2 (no runtime path may raise a cap); CLAUDE.md prime directive 2; ENGINE_BUILD.md §12 (0 cap breaches); §10.2 line 282

**Reproduction:** Wrap MemorySpendMeter in a meter that delegates everything except settle(), which throws (a DO storage put failing, or any fallible collaborator). Transport resolves normally with valid output. Client testco, role hello-world ($0.01/call), real frozen cap $5.00. Fire 2000 sequential llm() calls. Mechanism: gateway.ts:171 `meter.settle(reservation)` throws BEFORE `settled = true` at :172, so the outer catch at :190 sees `!settled` and calls `meter.release(reservation)` at :196 — returning headroom for a request the provider already billed.

**Observed:** OBSERVED: BILLABLE provider calls = 2000; committed $0.0000; reserved $0.0000; release() called 2000 times; 2000 rejections; 2000 traces; cap never refused a single call. The loop stops only because I stopped it. HEALTHY CONTROL, same cap, same role: ok = 500, capRefused = 1500, billable transport calls = 500, committed $5.0000 — the cap binds exactly. The r2 report's own recorded pre-fix numbers for R2-16 were `committed $0.0000, reserved $0.9900` with `lockout happens at call #100 in BOTH the defective and healthy runs` — the leaked reservation occupied the headroom, so the cap still held and the finding was rated severity 3 on that basis. Post-fix reserved is $0.0000 and lockout never happens. The r2 fix removed the only thing that bounded the loss. Redaction and tracing (R2-16 legs c and d) are genuinely closed: the planted canary came out `[redacted]` in both the error message and the trace payload, and every failure emitted a trace.

**Independent verifier:** REPRODUCED BY EXECUTION against the current tree (7a8067e), and the "introduced by the fix" attribution independently verified against the pre-fix tree (df95668).

WHAT I RAN. Baseline first: npm test 148/148 green, npm run typecheck clean, node engine/scripts/leak-check.mjs .. -> "leak/structural scan: clean". Then a throwaway probe under scratchpad (never in the repo; git status --porcelain empty at the end): a SpendMeter delegating todayUsd/reservedUsd/record/reserve/release to a real MemorySpendMeter, with settle() throwing Error("storage put failed"). Transport resolves valid output and counts calls. Client "testco" (real frozen cap dailyAiSpendUsd $5.00, no narrowing table), role "hello-world" ($0.01/call), sequential llm() loop.

OBSERVED, current tree:
  DEFECTIVE n=2000: billable transport calls 2000, ok 0, CapError refusals 0, committed $0.0000, reserved $0.0000, release() called 2000x, traces 2000, canary leaks 0.
  HEALTHY CONTROL n=2000 (plain MemorySpendMeter): billable 500, ok 500, CapError 1500 first at call #500, committed $5.0000 — the cap binds exactly.
  DEFECTIVE n=20000: billable 20000 = $200.00 of provider spend against a $5.00 cap = 40x breach, committed $0.0000, reserved $0.0000, CapError 0. The cap never refused a single call; the loop stops only where I set n.

PRE-FIX BASELINE (I extracted df95668 into scratchpad with rewired workspace symlinks and ran the equivalent probe, injecting the same $5.00 ceiling through the then-supported capsTable):
  PRE-FIX DEFECTIVE n=2000: billable 500, CapError 1500 first at #500, committed $0.0000, reserved $5.0000, traces 0, release() 0.
Pre-fix the leaked reservation occupied the headroom, so lockout happened at the same call as the healthy control — a bounded ledger lie, which is exactly why r2 rated R2-16 severity 3. Post-fix the reservation is RETURNED and nothing bounds the loss. The claimant's framing is accurate and their quotation of the r2 report checks out (absolute numbers differ only because testco's ceiling is $5.00 now versus the $1.00 table r2 injected; the shape is identical).

MECHANISM CONFIRMED at engine/src/gateway.ts:171-172 — meter.settle(reservation) executes before settled = true, so a throwing settle leaves settled === false; the catch at :194 tests !settled and calls meter.release(reservation) at :196. The settled flag is the code's own proxy for "the request never left the building" and cannot distinguish a pre-transport failure from a post-transport settle failure. The comment at :191-193 ("Anything that threw before the request left the building never became billable, so its headroom returns to the client") asserts a precondition the guard does not check — so this violates the code's own claim as well as the spec.

SECOND ENTRANCE THE CLAIMANT DID NOT NAME: the identical ordering bug is on the transport-error leg, :165 meter.settle(reservation) before :166 settled = true. With transport throwing AND settle throwing: billable 2000, committed $0.0000, CapError 0 — a 4x breach on the very path whose stated purpose is "the provider may well have billed it, so the reservation is SETTLED, not released (F3)".

COVERAGE GAP: engine/test/hardening.test.ts:18 (R2-07, transport-throw branch) and :44 (R2-02, pre-transport failure) both drive an infallible MemorySpendMeter. Nothing among the 148 tests exercises a settle() that throws — precisely the case that collapses the distinction those two tests rely on.

PREMISE HONESTY: the defect requires a fallible settle. That is permitted rather than exotic — spend-meter.ts:68 documents no no-throw contract while its siblings todayUsd/reserve/record all throw MeterUnavailableError by design; spend-meter.ts:20-23 names the client's Durable Object as production backing; and llm() distrusts the meter everywhere else (requireReservingMeter, reservation-shape validation). I checked whether the shipped MemorySpendMeter self-limits: after corrupting the committed ledger via record(), reserve() also throws ("committed spend ledger is corrupt — refusing spend (fail closed)"), so the in-memory meter is self-limiting there. The live exposure is the documented DO backing and any future meter.

LEGS (c) AND (d) OF R2-16 ARE GENUINELY CLOSED, as the claimant stated: the planted canary appeared 0 times in error messages and false in trace payloads on the defective run, and every one of the 2000 failures emitted a trace.

SPEC: Law 2 (no runtime path may raise a cap) — the cap constant is not mutated, but the enforced ceiling on real provider spend becomes unbounded, which is the sharper clause at ENGINE_BUILD.md §10.2 line 282 ("Spend caps present, immutable at runtime, tested by attempted breach") and §12 line 370 ("0 cap breaches"). Not disclosed anywhere in LIVE_VERIFICATION_LEDGER L1-L13 (L4 covers only Gateway-side defense-in-depth), and not deferred to a later phase — this is the one cap the spec says is enforced today.

SEVERITY: claimant said 1; I confirm 1 unchanged. Measured 40x cap breach with the cap never engaging is top-band money loss, and §12's marketing-engine A-criterion is literally "0 cap breaches".

INCIDENTAL, NOT PROMOTED, OUTSIDE THIS FINDING: in the healthy control the canary did appear in trace payloads — the CapError refusal traces, because `secrets` is still [] when reserve() throws at :143 and is only populated at :152. That is only a leak if a caller places the vault secret in req.input, which was my own contrivance; flagging it for the report author rather than claiming it as reproduced.


### M-02 · 1 money-loss · R2-03's fix has no lock test — a one-line revert of `Math.min(ceiling, requested)` restores runtime cap widening with 148/148 tests green, typecheck PASS and leak-check clean

**Spec:** ENGINE_BUILD.md §10.2 ("Spend caps present, immutable at runtime, tested by attempted breach"); Law 2

**Reproduction:** In config/src/caps.ts, in effectiveDailyAiCapUsd, change `return Math.min(ceiling, requested);` to `return requested;`. Run `npm test`, `npm run typecheck`, `node engine/scripts/leak-check.mjs .`. Then fire 2000 llm() calls for testco with `capsTable: { testco: { dailyAiSpendUsd: 1e9 } }`.

**Observed:** OBSERVED with the mutation in place: Test Files 14 passed, Tests 148 passed; typecheck PASS; `leak/structural scan: clean`; then ok = 2000, capRefused = 0, billable = 2000, committed $20.0000 against testco's frozen $5.00 daily cap. Against the shipped (unmutated) code the identical probe gives ok = 500, capRefused = 1500, committed $5.0000. The shipped code is correct — I attacked it with 16 vectors (plain 1e9, NaN, Infinity, -1, 0, numeric string '1e9', undefined, empty entry, a double-read getter, prototype-only entry, a __proto__ key, clientId '__proto__'/'constructor'/'toString', a Proxy claiming 1e9, and a narrowing carrying a forged humanSignoff for the unsigned client pulsern) and every one was refused or clamped to the frozen ceiling. What is missing is the guarantee that it stays correct: no test anywhere asserts that a narrowing table cannot widen. This is R2-07's exact shape (`§10.2: tested by attempted breach`) applied to the R2-03 fix. Related: M5 (removing assertCapsUsable from the same function) IS caught by a test, so the sign-off half is locked and only the ceiling half is not.

**Independent verifier:** REPRODUCED IN FULL, from scratch, by execution at commit 7a8067e.

CONTROL (shipped, unmutated) — throwaway probe under scratchpad, 2000 llm() calls for testco with capsTable {testco:{dailyAiSpendUsd:1e9}}: effectiveDailyAiCapUsd(testco,{1e9}) = 5; ok=500, capRefused=1500, billableTransportCalls=500, committedUsd=$5.0000 against the frozen $5.00 ceiling. Shipped code is correct.

MUTATION — config/src/caps.ts:113, `return Math.min(ceiling, requested);` -> `return requested;`. Observed: `npm test` = Test Files 14 passed, Tests 148 passed; `npm run typecheck` exit 0; `node engine/scripts/leak-check.mjs .` = "leak/structural scan: clean". Same probe then gives effectiveDailyAiCapUsd(testco,{1e9}) = 1000000000; ok=2000, capRefused=0, billableTransportCalls=2000, committedUsd=$20.0000 — a 4x breach of the frozen $5.00 cap, and 2000 was only my loop bound, not a limit. Unbounded runtime cap widening, restored by one line, behind a green suite.

STRUCTURAL CORROBORATION: `grep -rn effectiveDailyAiCapUsd config/test engine/test` returns 0 hits — no test imports the function at all. config/test/caps.test.ts imports only CAPS_TABLE, CapError, assertCapsUsable, getCaps. Both narrowing fixtures in the suite (engine/test/helpers.ts:15 LOW_CAP_NARROWING = 0.05; engine/test/adversary-phase0.test.ts:25 LOW_AI_CAP = 0.05) sit BELOW the $5.00 ceiling, so Math.min and a bare `requested` are indistinguishable to every existing test.

CLAIMANT'S CONTRAST CASE ALSO VERIFIED: deleting `assertCapsUsable(caps)` from the same function fails exactly 1 test (147/148), engine/test/gateway.test.ts:59 "unsigned production caps refuse ALL AI spend until H8". The sign-off half is locked; the ceiling half is not. The claimant characterised this correctly.

CORRECTION TO THE CLAIMANT'S EVIDENCE (does not change the verdict): they did not run the fourth CI gate. config/src/caps.ts IS in CLASS2_FILES (engine/scripts/gate-lib.mjs:47). I committed the mutation in a scratch git worktree and ran `node .../class2-gate.mjs <wt> 7a8067e` -> "CLASS-2 GATE FAIL: Class-2 changes without a matching human approval for this transition (Law 2/14/15): fullburn/config/src/caps.ts (modified)", exit 1. So the correct statement is 3 of 4 CI gates green, not a fully green gate set. This does not rescue the finding: (a) ENGINE_BUILD.md §10.2 requires caps be "tested by attempted breach", and a change-control gate answers "did a human sign this diff", never "is this diff safe" — a reviewer reading a one-line `return requested;` under a comment block that still claims narrowing-only gets zero signal from any test; (b) LIVE_VERIFICATION_LEDGER L11 and L13 already disclose that repo protection and CODEOWNERS on APPROVALS/** are absent, so the approval gate proves what was approved and never who, i.e. it is advisory today; (c) the already-accepted precedent R2-07 mutated engine/src/gateway.ts, which is ALSO in CLASS2_FILES — M-02 therefore sits under identical change-control coverage to a finding this project accepted at severity 1.

SEVERITY: 1 confirmed, not inflated. No money leaks today — the shipped clamp is correct and I verified it. What is missing is the guarantee that it stays correct, and §10.2 places "tested by attempted breach" under Law 2 ("No runtime path may raise a cap"). Consistent with the R2-07 precedent. Not disclosed anywhere in the ledger (L1-L13 do not cover it) and not deferred by the spec to a later phase — this cap is enforced NOW, at engine/src/gateway.ts:138.

Repo left clean: caps.ts restored via git checkout, scratch worktree removed, temp branch deleted, `git status --short` empty, suite re-run 148/148 green, typecheck exit 0, leak-check clean. All probe files live only under the scratchpad.


### M-03 · 1 money-loss · The "daily" AI cap has no day boundary and no persistence — a meter restart grants a fresh full daily cap, and a client that spends its day is locked out forever

**Spec:** Law 2; ENGINE_BUILD.md §2.2 (per-client Durable Object backing); caps.ts:19 and spend-meter.ts:48 self-description

**Reproduction:** grep -rniE "rollover|midnight|reset|dayKey|new Date|Date.now" engine/src config/src returns NOTHING. Probe: (a) fire 600 llm() calls for testco at a fixed clock, (b) advance deps.now() by 7 days and fire 10 more, (c) replace deps.meter with a fresh MemorySpendMeter (what a Worker/Durable Object restart or eviction does) at the SAME wall-clock instant and fire 600 more.

**Observed:** OBSERVED: (a) ok = 500, committed $5.00 — cap binds. (b) one WEEK later: ok = 0, committed still $5.00 — the client is refused permanently; the cap never rolls over, so a $5.00/day budget is really a $5.00/lifetime budget and the bracket cannot kill losing ads on day 2. (c) after a fresh meter at the same instant: ok = 500 again, total billable in one wall-clock moment = 1000 calls = $10.00 against a $5.00 DAILY cap. Nothing persists and nothing is keyed to a date, so the enforced unit is meter lifetime, not client-local day. caps.ts:19 documents dailyAiSpendUsd as "Max AI spend per client-local day" and spend-meter.ts:48 documents todayUsd as "Committed spend today" — both assert a property the code does not have, and spend-meter.ts:21-23 tells the Phase 5/6 ad-spend path to adopt this contract unchanged. The r2 report noted the absence of a reaper twice (lines 263, 293) but only as context inside R2-01/R2-02; it was never filed and is still open.

**Independent verifier:** REPRODUCED BY EXECUTION. Baseline first: from /home/user/New-skills-/fullburn at 7a8067e, `npm test` = 148/148 green, `npm run typecheck` clean, `node engine/scripts/leak-check.mjs ..` = "leak/structural scan: clean", `git status --porcelain` empty before and after (probe lived only in scratchpad).

STATIC: `grep -rniE "rollover|midnight|reset|dayKey|day-boundary|localDay|new Date|Date.now|reaper|utcDay" engine/src config/src` returns ZERO hits. `grep -rn "\.now()" engine/src config/src` returns exactly ONE hit — gateway.ts:85 `const startedAtMs = deps.now()`, a trace timestamp. No spend accounting anywhere is keyed to a date.

PROBE (scratchpad/m03-probe.ts, driving the real llm() with the real frozen caps table; testco dailyAiSpendUsd=$5.00, role hello-world costBudgetUsdPerCall=$0.01 → 500 calls fills the cap):
  (a) 600 calls at fixed clock T0=2025-08-12T12:00:00Z → ok=500/600, committed=$5.0000, CapError x100, transportCalls=500. Cap binds correctly.
  (b) same meter, deps.now() advanced +7 days → ok=0/10, committed still $5.0000, CapError x10. 
  (b2) same meter, +365 days → ok=0/10, committed still $5.0000, CapError x10. The client is refused PERMANENTLY; the cap never rolls over.
  (c) fresh MemorySpendMeter at the SAME wall-clock instant T0 (what an isolate/DO eviction or restart does) → ok=500/600 again, 500 additional real transport POSTs. TOTAL billable at one wall-clock instant = 1000 calls = $10.00 against a $5.00 DAILY cap.
Both halves match the claimant's evidence exactly. The enforced unit is meter lifetime, not client-local day.

WHY IT IS A GENUINE VIOLATION, NOT A MISREAD OR A DEFERRAL:
1. The code affirmatively claims the property it lacks. caps.ts:19 documents dailyAiSpendUsd as "Max AI (LLM/render) spend per client-local day ... Enforced locally in llm() pre-call (R3)"; spend-meter.ts:48 documents todayUsd as "Committed spend today". The SAME file explicitly discloses that dailyAdSpendUsd and totalAdSpendUsd are "NOT YET ENFORCED ANYWHERE" — so the deliberate absence of any such caveat on dailyAiSpendUsd is an assertion, not an omission.
2. It is NOT in the honest-unknowns ledger. LIVE_VERIFICATION_LEDGER.md L1-L13 contains nothing about rollover or persistence; L4 goes the other way and states "local enforcement is live in code; Gateway config is defense-in-depth."
3. It was NOT filed in r2. Checked all 34 titles (`grep -n "^#### R2-"`). The phrases at report lines 263 and 293 appear only as consequence framing inside R2-01 and R2-02. Genuinely open, genuinely unfiled.
4. The spec does not defer it. Phase 0 delivers live AI Gateway wiring and llm() enforces this cap today; §2.5 requires client-local clocks for exactly this class of window.
5. It is a CONTRACT defect, not an in-memory artifact — this is the key point that survives the obvious "the DO will fix it" rebuttal. SpendMeter.todayUsd(clientId) takes only a clientId: no date, no timezone parameter exists anywhere in the interface. config/src/markets.ts:19 defines localeClock and it is plumbed to nothing. A Durable-Object-backed implementation faithful to this interface inherits the identical no-rollover defect, and spend-meter.ts:21-23 explicitly instructs the Phase 5/6 ad-spend path to adopt this contract "unchanged". Separately, MemorySpendMeter writes only to in-process Maps and never to DO storage, so even the stated production backing loses state on the routine eviction that half (c) models.

CORRECTION TO THE CLAIMANT (does not lower severity): nothing constructs a MemorySpendMeter in production today — engine/src/index.ts only re-exports it and the sole instantiations are in tests — so the permanent-lockout half cannot strand a live client at this instant. The claimant's "$5.00/lifetime budget" framing is accurate for the meter's lifetime but slightly overstates present blast radius.

SEVERITY: claimant said 1 (money loss); CONFIRMED at 1. Half (c) is a direct Law 2 cap breach — 2x the daily ceiling billable at a single wall-clock moment, unbounded across N restarts — against §12's "0 cap breaches" A-threshold, and it propagates to the ad-spend path by the code's own written instruction. Half (b) additionally reproduces the exact shape r2 accepted as money-loss in R2-01 (a permanently bricked budget disables the bracket's ability to kill losing ads, Law 19's kill scenario) and is a data lie on top: todayUsd() reports "today" for a number that spans all time.


### M-04 · 1 money-loss · The `settled` flag — the only thing preventing a reservation from being both settled and released — has no test; removing the guard leaves the suite green

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** ENGINE_BUILD.md §10.2 ("tested by attempted breach"); spend-meter.ts:66-70 interface contract

**Reproduction:** In engine/src/gateway.ts:194 change `if (reservation !== null && meter !== null && !settled) {` to `if (reservation !== null && meter !== null) {`. Run npm test and npm run typecheck.

**Observed:** OBSERVED: Test Files 14 passed, Tests 148 passed; typecheck PASS. Nothing detects it. Stated plainly: no money moves today, because MemorySpendMeter#close deletes the handle from #open on the first close, so a release-after-settle is a no-op (I verified settle-after-release, double-settle and release-after-settle all leave committed $0.01 / reserved $0.00 exactly). The guard is load-bearing only for a meter that does not keep a handle registry — e.g. a Durable-Object-backed meter that decrements `reserved` by reservation.amountUsd — which is exactly what spend-meter.ts:21-23 invites Phase 5/6 to write, and the SpendMeter interface documents no idempotency requirement for release(); the assumption lives only in a comment at gateway.ts:195. Same class as R2-07 (a one-line revert of a money-path invariant behind a fully green gate set), which the previous adversary filed at severity 1.

**Independent verifier:** REPRODUCED BY EXECUTION. Baseline on the real repo (7a8067e, tree clean): npm test 14 files/148 passed; npm run typecheck exit 0; node engine/scripts/leak-check.mjs .. -> "leak/structural scan: clean". I then copied the repo to scratchpad (m04clean / m04mut, nothing written in the repo) and applied the exact mutation at engine/src/gateway.ts:194, removing "&& !settled". Result: npm test 148 passed, npm run typecheck exit 0. Nothing in the gate set detects it. The headline claim reproduces exactly.

I did not take the claimant's consequence analysis on trust either. Probe (scratchpad/m04*/engine/test/zz-m04-probe.test.ts) drove llm() through every path that reaches the catch block AFTER a settle: transport throw (gateway.ts:165), schema-invalid (:174 after settle at :171), and sink-down (emitOrFail at :177 after settle).
- Shipped MemorySpendMeter, clean tree: committed $0.010000 / reserved $0.000000 on all three. Mutated tree: IDENTICAL, $0.010000 / $0.000000. The claimant's honest disclosure is correct — #close deletes the handle on first close, so release-after-settle is a no-op and no money moves today.
- A meter that satisfies the declared SpendMeter interface but decrements `reserved` on release: clean tree ops [reserve|settle], reserved $0.00. Mutated tree ops [reserve|settle|release], reserved $-0.010000 per call.
- 40-call loop at a $0.05 narrowed cap with that meter: clean tree = 5 billable calls, refused at iteration 5, committed $0.050000. Mutated tree = 40 billable calls, NEVER refused, committed $0.400000 — an 8x cap breach that does not stop.

WHY IT IS REAL, NOT A STYLE POINT. git diff df95668 7a8067e -- engine/src/gateway.ts confirms `settled` (lines 96/166/172/194) is entirely new in the r2 fix — pre-fix there was no release in the outer catch at all. So this is new money-path code introduced by the fix. It is load-bearing (proved above). It has zero coverage: no test in the 148 asserts anything about the meter after a post-settle failure, which is why the revert is invisible. ENGINE_BUILD.md §10.2 line 282 requires spend caps "tested by attempted breach" every run; this branch has no attempted-breach test. Separately, gateway.ts:193 asserts "`release` is idempotent and never throws for a stale handle" as a property of the meter, while the SpendMeter interface at spend-meter.ts:67-70 documents no idempotency requirement — the cross-module contract exists only in that comment. Not disclosed in LIVE_VERIFICATION_LEDGER.md (L1-L13 say nothing about meter idempotency), and not deferred by the spec.

ONE SUPPORTING ARGUMENT OF THE CLAIMANT'S IS WRONG, CORRECTED HERE. They cite spend-meter.ts:21-23 as "inviting Phase 5/6 to write" a registry-less DO meter. It says the opposite: "this in-memory implementation has the same contract so the Phase 5/6 ad-spend path can adopt it unchanged" — i.e. keep the handle registry. The real exposure is the bare SpendMeter interface a new implementer codes against, which is silent on idempotency. The finding survives on that basis; the cited "invitation" does not.

SEVERITY. Holding at 1 because this project's ladder is by harm domain (money path) and offers no lower money tier — the same basis on which R2-07 was filed and accepted. But ranking it plainly as the weakest form of a severity-1, and I want the difference from R2-07 on the record: R2-07's one-word revert lost money against the SHIPPED stack (200 billable calls, meter $0.0000). M-04's revert loses $0.00 against the shipped stack; materialisation needs a second meter that does not exist yet. It should sit below any severity-1 that moves money today. The remedy is one lock test (drive a post-settle failure with a non-idempotent meter and assert release is never called / reserved never goes negative), not a code change — gateway.ts as shipped is correct.

Repo working tree left clean: git status --porcelain empty, git diff --stat empty. All mutation and probe work confined to /tmp/claude-0/-home-user-New-skills-/64269547-e557-5483-8b4d-c2147d059962/scratchpad/m04clean and .../m04mut.


### R3-CP-01 · money-loss · R2-05 NOT CLOSED: approval replay still works whenever the human's revocation restores the prior bytes — a revert re-arms every superseded approval

**Spec:** Law 2 / Law 13 / §13 Class 2 (money paths and the gates are human-only); APPROVALS/README.md 'an approval can only be used from the exact state you approved leaving'

**Reproduction:** In a clone: (B) raise config/src/caps.ts dailyAdSpendUsd 70→500 with a January approval carrying from=sha256(70-version), to=sha256(500-version); class2-gate exit 0. (C, BASE) human revokes: sed back to 70 — byte-identical to the pre-raise content, confirmed by sha256 — with a February approval from=sha256(500) to=sha256(70); class2-gate exit 0. Attacker branch from C: restore the 500 content and `cp APPROVALS/2026-01-02-caps-raise.md APPROVALS/2026-08-15-restore.md` (cmp confirms byte-identical to the human's own artifact). Run `node fullburn/engine/scripts/class2-gate.mjs . <BASE>`. Repeated with .github/workflows/fullburn-ci.yml: approve dropping the two gate jobs, revert (git revert → byte-identical), then re-drop them and replay the March approval verbatim.

**Observed:** caps variant: `class2 gate: Class-2 changes carry transition approvals`, ATTACK EXIT=0, with caps.ts reading dailyAdSpendUsd: 500 and the diff being exactly `A APPROVALS/2026-08-15-restore.md` + `M config/src/caps.ts`. Workflow variant, full CI surface: class2-gate exit 0, adversary-gate exit 0 ('PASS and bound to the current tree' + 'reports append-only holds'), npm test 148/148, typecheck 0, leak-check clean — and `grep '^  [a-z-]*:'` on the workflow leaves only the `verify` job: both adversary-gate and class2-gate jobs are gone with zero new human approvals. The from-hash binding only blocks replay while the tree is NOT in the approved FROM state; a revert is precisely the operation that puts it back there, so every approval the human has ever signed becomes re-armed the moment its change is reverted. Mitigation observed and reported honestly: the caps variant leaves config/test/caps.test.ts failing 1/148 on a hardcoded 70, and that test file IS now Class-2 so it cannot be silenced without approval — but the workflow variant has no such literal anywhere (grep for fullburn-ci/adversary-gate:/class2-gate: across engine/test and config/test returns nothing) and stays 148/148 green.

**Independent verifier:** CONFIRMED by execution. I reproduced both variants from scratch in a private clone at 7a8067e (/tmp/.../scratchpad/verify-R3-CP-01, since deleted). I did not reuse the claimant's setup. The real repo working tree is clean and untouched.

WHAT I RAN — caps variant (isolated clone, branch off 7a8067e):
- Commit A: sed dailyAdSpendUsd 70->500 in fullburn/config/src/caps.ts + APPROVALS entry from-content-hash=sha256(70-version) content-hash=sha256(500-version). class2-gate exit 0 (legitimate).
- Commit B (BASE): real `git revert --no-edit --no-commit A`. Verified post-revert sha256 == pre-raise sha256 (printed "YES"). Added the human's revocation approval from=sha256(500) to=sha256(70). class2-gate exit 0 (legitimate revocation).
- ATTACK from B: re-set 500, and recovered the human's own January approval verbatim via `git show A:fullburn/APPROVALS/2026-01-02-caps-raise.md > fullburn/APPROVALS/2026-08-15-restore.md`. No forgery.
- OBSERVED: diff = `A .../2026-08-15-restore.md` + `M .../caps.ts`; caps.ts line 37 reads `dailyAdSpendUsd: 500,`; `node fullburn/engine/scripts/class2-gate.mjs . <B>` printed "class2 gate: Class-2 changes carry transition approvals", exit 0.

WHAT I RAN — workflow variant (the load-bearing one):
- Commit C: truncate .github/workflows/fullburn-ci.yml to its first 31 lines (drops the `adversary-gate` and `class2-gate` jobs) + approval from=sha256(full) to=sha256(stripped). class2-gate exit 0.
- Commit D (BASE): real `git revert` of C. Verified post-revert workflow sha256 == the original (printed "YES"). + revocation approval from=sha256(stripped) to=sha256(full). class2-gate exit 0.
- ATTACK from D: re-truncate to 31 lines, and `git show C:fullburn/APPROVALS/2026-03-01-ci-temp-disable.md > fullburn/APPROVALS/2026-08-15-ci-maintenance.md` (byte-identical, confirmed with diff).
- OBSERVED: `grep '^  [a-z-]*:'` on the workflow leaves only `push:` and `verify:` — both gate jobs gone. class2-gate exit 0. npm test 148/148 exit 0. typecheck exit 0. leak-check "clean" exit 0. Zero new human approvals in the diff.

NEGATIVE CONTROL (so I am not calling a real fix vacuous): from the same BASE, replaying the same approval doc against a DIFFERENT strip (30 lines, so the to-hash differs and the tree is not in the signed transition) produced "CLASS-2 GATE FAIL ... .github/workflows/fullburn-ci.yml (modified)", exit 1. The transition binding does real work — it blocks off-transition replay. The defect is that a revert is exactly the operation that restores the signed FROM state, and revert-after-revocation is the canonical way a human undoes a Class-2 change. So R2-05's own repro scenario (raise -> revoke -> replay) survives verbatim. Narrowed, not closed.

WHY THIS IS A SPEC/CLAIM VIOLATION, not a misread:
- fullburn/engine/scripts/class2-gate.mjs:4-5 claims approvals bind the transition "so a superseded approval cannot be replayed to reinstate content a human already revoked." Directly falsified above.
- fullburn/reports/LIVE_VERIFICATION_LEDGER.md L13 states "approvals are now transition-bound (from-hash -> to-hash) so a superseded approval cannot be replayed (R2-05)". False as written — so this is NOT already honestly disclosed; the ledger affirmatively denies it. L11's "gates are advisory pending branch protection" does not cover this: the gate here emits a green, affirmatively misleading signal ("Class-2 changes carry transition approvals") over a change no human approved.
- APPROVALS/README.md:18-23 presents the January-cap-approval-copied-back scenario as the defeated attack. That exact worked example is what I reproduced.
- Law 2 ("changing them requires a human-approved commit") and §13 Class 2 (human-only) are violated: the human signed a different, earlier commit and then explicitly signed its reverse; nothing records supersession, so every approval ever signed re-arms the moment its change is reverted.
- gate-lib.mjs:213-215 is the one honest description ("A transition can only be replayed if the tree is in exactly the state the human signed off FROM") — the residual is stated there but contradicted in the two places a reviewer would actually read.
- Not deferred: Phase 0's adversary focus (§11) is explicitly "try to bypass CI gate", and §10.3 makes the gate a Phase 0 deliverable.

LOCK-TEST GAP (supports "not closed"): engine/test/gates.test.ts:183 is titled "ATTACK: replaying a superseded approval does not re-authorize old content (R2-05)" but only exercises `from-content-hash: 000older` — i.e. the branch where the tree has moved to a different from-state, which is the branch that IS blocked. The revert branch, which is R2-05's own repro, has no test. And I confirmed the claimant's point: `grep -rn "fullburn-ci|adversary-gate|class2-gate|workflows" engine/test config/test` returns nothing, so the workflow variant has no literal guarding it anywhere and stays 148/148 green.

TWO CORRECTIONS TO THE CLAIMANT'S WRITE-UP (finding stands; evidence was overstated in one step):
1. The claimant reports "adversary-gate exit 0" for the workflow variant as if it followed from the replay alone. It does not. On the bare replay adversary-gate exits 1: `.github/` is inside TREE_SCOPE (adversary-gate.mjs:22), so stripping the workflow moves the tree hash and the standing report's verified-tree binding goes stale — I saw "report verified tree 85842da7... but current fullburn tree is 7088c775... — re-run the adversary", exit 1. It only reaches exit 0 after the attacker ALSO adds a self-authored fullburn/reports/ADVERSARY_REPORT_phase0.r3.md carrying the recomputed verified-tree and `Verdict: PASS`, which is permitted because reports/ is excluded from TREE_SCOPE, additions pass checkReportsAppendOnly, and reports/ is not in CLASS2_PATTERNS. I executed that extra step and then got "adversary gate: ... PASS and bound to the current tree" + "reports append-only holds", exit 0. So the end state the claimant describes (entire CI surface green, both gate jobs deleted, no new human approval) is real — it just takes one more step than stated.
2. The claimant's mitigation note is accurate and I verified it: the caps variant leaves config/test/caps.test.ts:10 failing 1/148 on a hardcoded `.toBe(70)`, and that path IS Class-2 via /^fullburn\/(?:config|engine)\/test\//, so it cannot be silenced without another approval.

SEVERITY: keep 1. The caps variant restores a revoked Law-2 money constant (the r2 report filed R2-05 under "S1 · MONEY LOSS"); note honestly that dailyAdSpendUsd is not yet enforced anywhere before Phase 6, so no dollar moves today. The variant that stays fully green is the workflow one, which deletes the entire Class-2 control plane and therefore unlocks every money path behind it — band 1a on this project's ladder, immediately below money loss. Either way it does not drop below ban risk.

ADJACENT OBSERVATION (not the finding, observed in passing): APPROVALS/README.md:35 says entries are "append-only history, like reports/", but nothing enforces it — checkReportsAppendOnly only matches fullburn/reports/ADVERSARY_REPORT_*. My `git revert` of commit C deleted the March approval doc outright and both gates stayed green. It did not weaken the attack (the artifact is recoverable from git history either way), but the documented append-only property of APPROVALS/ is unenforced.


### R3-CP-03 · money-loss · fullburn/vitest.workspace.ts is Class-1 and silences 145 of 148 tests — R2-08's defect class through a sibling filename the pattern set misses

**Spec:** §10.3 CI gates; gate-lib.mjs:23-26 'The gates themselves and everything that decides whether they run'

**Reproduction:** In a clone, commit a single new file fullburn/vitest.workspace.ts containing `export default [{ test: { include: ["engine/test/vault.test.ts"] } }];`, then run `node fullburn/engine/scripts/class2-gate.mjs . HEAD~1` and `npm test`. Also reproduced with no commit at all: leave the file untracked and add it to .git/info/exclude (or to the Class-1 fullburn/.gitignore).

**Observed:** `class2 gate: no Class-2 changes`, EXIT=0; `npm test` drops from 148 tests to 'Tests 3 passed (3)'. vitest 2.1.9 honours vitest.workspace.ts over vitest.config.ts. CLASS2_PATTERNS protects /^fullburn\/vitest\.config\.ts$/ and package.json but not the sibling that overrides them. In the untracked+excluded variant, `git status --porcelain` is empty, assertCleanTree passes (the gate proceeds to the report check), and the verified-tree hash is unchanged at 77f4cd8f4613e3f645531841ba44296ade6f15ef — so R2-19's fix, which is otherwise sound, is bypassed with no artifact in the PR whatsoever. Every caps-immutability, spend-meter, grade-registry and gate test is lost in that state. (The untracked variant matters because ledger L5 records that CI has never run on GitHub Actions — every gate run today is local.)

**Independent verifier:** REPRODUCED BY EXECUTION, both variants, in a full copy of the repo at /tmp/.../scratchpad/repo (real repo left untouched: HEAD 7a8067e, `git status --porcelain` empty, no vitest.workspace.ts, no .git/info/exclude entry).

BASELINE (real repo, /home/user/New-skills-/fullburn): `npm test` -> "Test Files 14 passed (14) / Tests 148 passed (148)". vitest 2.1.9 (node_modules/vitest/package.json).

VARIANT A — COMMITTED FILE, ALL FIVE CI STEPS GREEN.
Ran in the clone: wrote fullburn/vitest.workspace.ts containing exactly `export default [{ test: { include: ["engine/test/vault.test.ts"] } }];`, committed it as the only change, then:
- `node fullburn/engine/scripts/class2-gate.mjs . HEAD~1` -> "class2 gate: no Class-2 changes", EXIT=0
- `npm test` (from fullburn/) -> " ✓ |0| engine/test/vault.test.ts (3 tests)" / "Test Files 1 passed (1) / Tests 3 passed (3)", EXIT=0. The `|0|` project prefix confirms vitest resolved the workspace file and discarded vitest.config.ts's include globs. 145 of 148 tests silently gone.
- `npm run typecheck` -> EXIT=0; `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean", EXIT=0.
- `adversary-gate.mjs . HEAD~1` was the only blocker, and only on tree-hash staleness ("code changed after the adversary judged it"). I then tested whether that backstop holds, exactly as R2-08 did: computed the new scope hash the way the gate computes it (63e23a41...), committed a 4-line self-authored `reports/ADVERSARY_REPORT_phase0.probe.md` with `Verdict: PASS` + `verified-tree: 63e23a41...` (an ADD, which checkReportsAppendOnly permits), re-ran both gates -> "adversary gate: ADVERSARY_REPORT_phase0.probe.md: adversary report PASS and bound to the current tree" EXIT=0, and "class2 gate: no Class-2 changes" EXIT=0. Every job green, no human approval anywhere.

VARIANT B — UNTRACKED + EXCLUDED. This is the worse one and it defeats R2-19's fix.
- CONTROL first, to prove the R2-19 fix is otherwise sound: reset to 7a8067e, planted fullburn/vitest.workspace.ts untracked, no exclude. `git status --porcelain` -> "?? fullburn/vitest.workspace.ts"; adversary-gate -> "ADVERSARY GATE FAIL: working tree has unstaged or untracked changes in the verified scope", EXIT=1. R2-19's fix (adversary-gate.mjs:36, `l.startsWith("??")`) genuinely works for the plain case.
- Then appended `fullburn/vitest.workspace.ts` to `.git/info/exclude`. Result: `git status --porcelain` -> EMPTY. Scope hash `git ls-files -s -- fullburn/ .github/ :!fullburn/reports/ :!fullburn/APPROVALS/ | git hash-object --stdin` -> 77f4cd8f4613e3f645531841ba44296ade6f15ef, byte-identical to the clean baseline hash I measured before planting anything — exactly the value the claimant reported. adversary-gate got PAST assertCleanTree and failed on the report check instead, which is positive proof the clean-tree guard passed.
- Committed a PASS report bound to 77f4cd8f (reports/ is excluded from TREE_SCOPE, so committing it does not move the hash). The ENTIRE PR diff is then `A fullburn/reports/ADVERSARY_REPORT_phase0.probe.md` — one file. adversary-gate EXIT=0 ("PASS and bound to the current tree" + "reports append-only holds"), class2-gate EXIT=0, `npm test` -> "Tests 3 passed (3)" EXIT=0. A tree hash certifying 148 tests, while 3 run, with zero code artifact in the diff.

WHY THIS IS A REAL DEFECT AND NOT A MISREAD.
`isClass2()` returns false for fullburn/vitest.workspace.ts (verified by direct import of gate-lib.mjs), and also for vitest.workspace.js, vitest.workspace.mts and vite.config.ts — all of which vitest honours. It returns true only for the one literal /^fullburn\/vitest\.config\.ts$/. This falsifies two of the code's own claims: gate-lib.mjs:23-26 "The gates themselves and everything that decides whether they run", and the suite's own contract at engine/test/adversary-phase0.test.ts:170 — "the test-runner config can disable the invariant suite, so it is Class 2". vitest.workspace.ts IS test-runner config, it DOES disable the invariant suite, and it is not Class 2. Spec-wise this sits under §10.3 and Phase 0's stated adversary focus ("try to bypass CI gate") and its AC ("CI blocks a PR missing an adversary report"); nothing defers it.

NOT DISCLOSED, NOT PRE-EXISTING-EXCUSED. Ledger L5 discloses only that CI has never run on GitHub Actions — which is what makes every gate run today local, where this works. L11/L13 cover who-approved, not what-is-protected. R2-19 used vitest.workspace.ts merely as the vehicle to demonstrate untracked-file impact; the builder fixed the untracked leg (correctly) but never brought the filename into CLASS2_PATTERNS, so the committed variant is entirely new ground and passes every gate. This is R2-08's defect class (protect the runner config, miss the thing that overrides it) surviving through a sibling filename the pattern set does not match. The claimant's "introduced by the r2 fix: false" is accurate.

SEVERITY CORRECTION. The claimant filed this as money-loss (rank 1). The correct rank under this project's own established ladder (ADVERSARY_REPORT_phase0.r2.md:197-212, and confirmed by placement: R2-08, the identical defect class, sits in "### S1a · CONTROL PLANE", not "### S1 · MONEY LOSS") is 1a — control plane. No dollars move at Phase 0; what is lost is every caps-immutability, spend-meter, cap-race, grade-registry and gate test standing between a money defect and a green gate. That is control plane, ranking immediately after money loss and above ban risk. The finding's reality and blocking force are unaffected by this correction.


### R3-CP-04 · money-loss · The deployed Worker entrypoint is Class-1: engine/src/index.ts and engine/wrangler.toml can repoint llm() at an unmetered, untraced shadow module with every gate green

**Spec:** Law 2 (spend caps immutable at runtime); Law 9 (every LLM call through AI Gateway, every decision traced); §13 Class 2

**Reproduction:** In a clone, add fullburn/engine/src/shadow.ts exporting an `llm` with no cap check, no spend meter and no trace, and change engine/src/index.ts's `export { llm, validateOutput } from "./gateway.ts"` to take llm from ./shadow.ts. Commit; run class2-gate, npm test, typecheck, leak-check; then import the entrypoint the way wrangler deploys it.

**Observed:** Diff is `M fullburn/engine/src/index.ts` + `A fullburn/engine/src/shadow.ts`. `class2 gate: no Class-2 changes`, EXIT=0. npm test 148/148, typecheck 0, leak-check clean. `node --experimental-strip-types` importing ./engine/src/index.ts prints `deployed entrypoint llm() -> UNMETERED`. CLASS2_PATTERNS names only 7 files in engine/src (gateway, spend-meter, grade-registry, vault, tracing, redact, eval-harness); index.ts — the file wrangler.toml names as `main` — is not one of them, and wrangler.toml itself, which decides which module `main` points at, is also Class-1. This is exactly the lever R2-04 was filed for (the file that decides which module a specifier resolves to is strictly more powerful than the module) surviving in a different file. No dollar moves today because Phase 0 has no deploy path, but the redirect executes now and lands the moment Phase 5/6 does.

**Independent verifier:** REPRODUCED BY EXECUTION, twice, via two independent levers. Repo left clean at 7a8067e; all work in a scratchpad clone.

Baseline (untouched tree, /home/user/New-skills-/fullburn): npm test 148/148, npm run typecheck exit 0, node engine/scripts/leak-check.mjs .. -> "leak/structural scan: clean".

Gate predicate probed directly (node -e importing engine/scripts/gate-lib.mjs):
  fullburn/engine/src/index.ts   -> isClass2 = false
  fullburn/engine/wrangler.toml  -> isClass2 = false
  fullburn/engine/src/gateway.ts -> isClass2 = true
  fullburn/engine/src/shadow.ts  -> isClass2 = false

LEVER 1 (index.ts). Added engine/src/shadow.ts exporting an `llm` with no effectiveDailyAiCapUsd() call, no meter.reserve/settle, no TraceContext check and no sink.emit; changed index.ts line 3 from `export { llm, validateOutput } from "./gateway.ts"` to `"./shadow.ts"`. Diff is exactly `M fullburn/engine/src/index.ts` + `A fullburn/engine/src/shadow.ts`. Gates on the exploited tree: `class2 gate: no Class-2 changes` EXIT=0; `leak/structural scan: clean` EXIT=0; typecheck exit 0; npm test 148/148 (14 files). All four green.

Runtime probe (node --experimental-strip-types) importing the module wrangler.toml names as `main`, driving client zero `pulsern`, whose caps.ts humanSignoff is null so every spend path must refuse (H8):
  untouched tree  -> gateway.ts llm(): REFUSED (CapError: caps lack human sign-off (H8)), transport posts=0; deployed index.ts llm(): REFUSED, posts=0, trace events=1; entry.llm === gateway.llm -> true.
  exploited tree  -> gateway.ts llm(): REFUSED identically (the Class-2 file is genuinely untouched); DEPLOYED index.ts llm(): ALLOWED, transport posts=1, url=https://evil.example/v1/, authHeader=null, trace events=0; entry.llm === gateway.llm -> false.
So the deployed entrypoint made a live transport call for an unsigned client, at a caller-supplied non-Gateway URL, with zero cap check, zero spend reservation and zero Langfuse trace.

LEVER 2 (wrangler.toml), independent of lever 1 and not requiring any edit to index.ts. On a branch off the base: left index.ts byte-identical (git diff HEAD~1...HEAD -- index.ts = 0 lines), added entry-fast.ts re-exporting shadow's llm, and sed'd `main = "src/index.ts"` -> `main = "src/entry-fast.ts"`. Diff: A entry-fast.ts, A shadow.ts, M fullburn/engine/wrangler.toml. Gates: `class2 gate: no Class-2 changes` EXIT=0, leak-check clean, typecheck 0, npm test 148/148. Probe against the wrangler-designated entry: ALLOWED, posts=1, trace events=0.

WHY IT IS A GENUINE VIOLATION, NOT A MISREAD. gate-lib.mjs:5-14 states in its own words that the pattern rewrite exists because "`config/package.json` redirected the `@fullburn/config/caps` specifier to an attacker module without touching caps.ts" and that "Patterns cover the directory, so a rename lands inside the protected set rather than outside it." The r2 fix applied a whole-directory pattern to config/src/ but an ENUMERATION to engine/src/ — /^fullburn\/engine\/src\/(?:gateway|spend-meter|grade-registry|vault|tracing|redact|eval-harness)\.ts$/, exactly 7 files. index.ts, the file wrangler.toml names as `main`, is not one of them; wrangler.toml, which decides which module `main` resolves to, matches no pattern at all. This is R2-04's class (the file that decides which module a specifier resolves to is strictly more powerful than the module) closed at the reported instance and left open in the deployed entrypoint — i.e. a fix that moved the defect rather than closing the class. It violates Law 2 (the only cap enforced today, dailyAiSpendUsd, plus the H8 sign-off refusal, are both skipped on the money path) and Law 11 / CLAUDE.md directive 9 (every LLM call through AI Gateway, every decision traced; the shadow path posts to an arbitrary URL and emits nothing). §13 lists money paths and the Grade Registry as Class 2; this change-control root does not cover them at the entrypoint.

The test suite is not a control: `grep -rn "index.ts|src/index|wrangler" engine/test config/test engine/scripts vitest.config.ts` returns NO hits — nothing anywhere asserts what the deployed entrypoint re-exports.

NOT ALREADY DISCLOSED: I read reports/LIVE_VERIFICATION_LEDGER.md in full; L1-L13 cover live Gateway/Langfuse, eval recordings, Gateway-side caps, GitHub Actions, domain, workerd pool, cross-family review, ClickHouse/Airbyte, vault encryption, repo protection, eval attestation provenance and approval authorship. None of them mention the entrypoint, wrangler.toml, or module-resolution redirection. Not deferred by the spec either.

CORRECTIONS TO THE CLAIMANT. (1) Cited "Law 9" is CLAUDE.md's numbering; ENGINE_BUILD.md numbers the same clause Law 11. Immaterial. (2) The claimant UNDERSTATES the blast radius: the same index.ts also re-exports computeGrades, enforcement and publishGradeReport from grade-registry.ts, so the identical one-line redirect routes around the GRADER — a §12 / Law 14 human-change-only surface — while class2-gate still prints "no Class-2 changes". I executed the llm half only; the grader half is structurally identical but I flag it as an UNVERIFIED HYPOTHESIS, not reproduced. (3) "introduced by the r2 fix: false" is correct as stated — index.ts was absent from the pre-fix literal CLASS2_FILES list too.

SEVERITY: money-loss (1) CONFIRMED, not corrected. The bypassed controls are the AI spend cap and the H8 sign-off, and the gate meant to stop this is live and green on this tree today. The claimant honestly notes no dollars move in Phase 0 (no deploy script exists — grep for deploy/wrangler in engine/package.json, package.json and .github/workflows returns nothing). That does not downgrade it: R2-04 was accepted at C1 under materially identical conditions with no live money, and grading a change-control hole by whether the current phase can spend would let every money-path bypass ship before Phase 6.


### A1 · 2 ban-risk · The redaction boundary has two named exemptions: a CapError or MeterUnavailableError message is written verbatim into the trace event's errorMessage and thrown to the caller with its full stack

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** gateway.ts:14-17 claims unconditionally 'Every error and every traced payload is redacted against the vault secret (R2-14, R2-27)'. ENGINE_BUILD.md §10.2 / CLAUDE.md standing invariant: 'OAuth tokens live only in the vault; one appearing in code, logs, or traces is a critical defect.'

**Reproduction:** gateway.ts:202-205 reads `const safe = err instanceof CapError || err instanceof MeterUnavailableError ? err : redactError(err, secrets, errorClassFor(err)); await traceFailure(safe.message);`. Two of the classes that can cross this line are exempted from redactError and their message is then used as the trace's errorMessage. Probe p2 cases 19 and 20: (19) a meter whose settle() throws `new MeterUnavailableError('meter blew up while holding Bearer <canary>')` — settle is called at gateway.ts:171 AFTER `secrets = [key.value]` is populated at :152; (20) a meter whose reserve() throws `new CapError('cap msg carrying Bearer <canary>')`.

**Observed:** Executed. Case 19 emitted, verbatim, to the trace sink: {"traceId":"t1","clientId":"testco","role":"hello-world","model":"claude-sonnet","startedAtMs":1755000000000,"input":{},"output":null,"costUsd":0.01,"outcome":"error","errorMessage":"meter blew up while holding Bearer canary-vault-value-do-not-leak-8891"} — traceLeak=true AND thrownLeak=true (the caller also receives the raw message plus the original untruncated stack, which redactError would have replaced). Case 20 identical with costUsd 0. Every other error class in the same catch (BindingError, TraceEmitError, GatewayError, SchemaError) IS redacted — I confirmed cases 01-18 all show traceLeak=false. HONEST REALISM, stated against my own finding: the only in-repo producers of these two classes are config/caps.ts and spend-meter.ts, whose messages interpolate only constant labels, clientId and dollar amounts — none of which is the secret — and in production the meter is the client's Durable Object, which never sees the AI-Gateway key. So there is no live carrier today. I file it anyway because (a) the file's own contract is stated unconditionally and is false, (b) it is the trace sink — the exact surface §10.2 singles out — and (c) the fix is one line: redact the message while still preserving the class, which the code already knows how to do via errorClassFor.

**Independent verifier:** REAL — reproduced from scratch by execution, and the claimant actually UNDERSTATED it.

BASELINE RUN (from /home/user/New-skills-/fullburn): `npm test` → 14 files / 148 tests passed. `npm run typecheck` → exit 0. `node engine/scripts/leak-check.mjs .` → "leak/structural scan: clean", exit 0. `git status --porcelain` empty before and after my work. Probes lived only in the scratchpad, driven by `npx vitest run --config <scratchpad>/vitest.probe.config.ts` (root pinned to the repo so the workspace aliases resolve).

CONFIRMED CORE CLAIM (probe a1 case 19, re-confirmed independently in probe a2 case 4). A meter whose `settle()` throws `new MeterUnavailableError("meter blew up while holding Bearer <canary>")` — `settle` is called at /home/user/New-skills-/fullburn/engine/src/gateway.ts:171, and again at :165 in the transport-failure branch, both AFTER `secrets = [key.value]` is populated at :152 — produced, verbatim, on the trace sink:
{"traceId":"t1","clientId":"testco","role":"hello-world","model":"claude-sonnet","startedAtMs":1755000000000,"input":{},"output":null,"costUsd":0.01,"outcome":"error","errorMessage":"meter blew up while holding Bearer canary-vault-value-do-not-leak-8891"}
traceLeak=true, thrownLeak=true. The caller received the ORIGINAL object: class `MeterUnavailableError`, message verbatim, and an 11-frame untruncated stack (`at MemorySpendMeter.meter.settle ... at Module.llm (/home/user/New-skills-/fullburn/engine/src/gateway.ts:171:11)`). My control in the same file — a plain `Error` carrying the same canary thrown from `transport.post` — came back `"Error: Error: http 500 with header Bearer [redacted]"`, traceLeak=false, stack collapsed to one line. So the two exempted classes at gateway.ts:202-204 are demonstrably the only holes, exactly as claimed, and gateway.ts:14-17's unconditional "Every error and every traced payload is redacted against the vault secret (R2-14, R2-27)" is false as written. Not disclosed anywhere in LIVE_VERIFICATION_LEDGER.md L1–L13, and not deferred by ENGINE_BUILD.md — §10.2 names traces explicitly.

CORRECTION TO THE CLAIMANT'S CASE 20. Their case-20 evidence does not show what they think. (i) `reserve()` is called at gateway.ts:143, BEFORE `secrets` is populated at :152, so `secrets` is empty there and `redactError` would have been a no-op anyway — a verbatim message on that path proves nothing about the exemption. (ii) In a probe that imports `CapError` via the `@fullburn/config/caps` alias, the class is a DIFFERENT object from the one gateway.ts holds; I logged `alias CapError === abs CapError ? false` and the injected CapError came out as class `GatewayError` with a redactError-style `"Error: "` prefix — i.e. the exemption never fired. The CapError exemption is nonetheless real: I proved it with an in-gateway producer instead, a genuine cap breach via a narrowing capsTable ($0.001 ceiling), which returned class `CapError`, an unprefixed message, and an 11-frame original stack — the signature of the `safe = err` branch. A CapError raised from `settle()` (the only post-secrets producer) would therefore leak identically; I could not execute that half because of the module-duplication artifact above, so I label that specific variant a HYPOTHESIS. The MeterUnavailableError half needs no such caveat — it is fully executed and confirmed twice.

WHAT THE CLAIMANT MISSED — the exemption also regresses R2-27 and R2-28 (probe a4, using Object.defineProperty so the getter is not shadowed by the own `message` property that `super()` installs). A `MeterUnavailableError` whose `message` getter throws on first read, thrown from `settle()`, gave: TRACE EVENT COUNT = 0 (nothing emitted at all), and the caller got a bare `Error: "boom from message getter"` that is NOT `instanceof MeterUnavailableError`. The bare `safe.message` read at gateway.ts:205 throws inside the catch clause itself, so it escapes `llm()` before `traceFailure` is ever called. My control with the identical shape on a non-exempt class emitted a proper event (`errorMessage: "Error: [unprintable error]"`) and preserved `GatewayError`. So the exemption (a) silently produces an untraced money-path exit — the exact R2-28 defect the same file's header claims to have closed — and (b) destroys the fail-closed class discrimination that is the sole reason the exemption exists.

SEVERITY 2 CONFIRMED, not corrected. It matches project precedent: the r2 report ranked R2-14 (credential reaching the trace sink) at ban-risk with the reasoning "the exposed material is the AI-Gateway credential ... with money-loss exposure once this same code path carries Meta OAuth tokens in Phase 3." I independently checked the claimant's honesty caveat and it holds — `llm()` never hands the key to the meter, and the in-repo producers in spend-meter.ts and config/src/caps.ts interpolate only constant labels, clientId and dollar amounts, so there is no live carrier today. That argues against escalation, not against the finding. It does not argue for downgrade either: `deps.meter` is injected, spend-meter.ts:21-23 states the contract exists "so the Phase 5/6 ad-spend path can adopt it unchanged," and in production it is the client's Durable Object — an RPC boundary whose error objects llm() does not control. Combined with the untraced-exit regression (a Law 11 violation on a money path, live today with no future phase required), severity 2 is right.

Not a style opinion: the file states an unconditional contract that execution falsifies, on the one surface §10.2 names by name, and the fix the claimant describes is available — `errorClassFor` already exists and simply omits these two classes; adding them lets `redactError` preserve identity and redact, closing the leak, the untraced exit, and the class destruction at once.


### A2 · 2 ban-risk · R2-14 is not closed for binary payloads: a Uint8Array/Buffer response body reconstructs the gateway key byte-for-byte inside the emitted trace

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** ENGINE_BUILD.md §10.2 names Langfuse traces explicitly as a place a token must never appear; redact.ts:52-55 claims redactValue scrubs 'any string containing a secret'.

**Reproduction:** redactValue (redact.ts:63-69) treats a TypedArray as a plain object: Object.keys() returns numeric indices and each value is a number, so `typeof value === 'number'` returns it unchanged at line 61. Probe p2 case 22: a transport that returns `{ greeting: 'hi', raw: new TextEncoder().encode(JSON.stringify(headers)) }`, i.e. the mirrored `authorization: Bearer <canary>` header as bytes. Standalone equivalent in p1: `redactValue(new TextEncoder().encode(SECRET), [SECRET])` and the same with `Buffer.from(SECRET)`.

**Observed:** Executed. p1: typedArrayRecovered = 'canary-vault-value-do-not-leak-8891', typedArrayLeaks = true; bufferRecovered = 'canary-vault-value-do-not-leak-8891'. p2 case 22 end-to-end: `traces=1 outcome=ok`, a naive JSON substring check on the event reports traceLeak=false — which is exactly why this survived the R2-14 fix and why the existing gateway.test.ts assertion style (JSON.stringify(sink.events) not containing the canary) cannot catch it — but my byte reconstructor over the event tree reports byteLeak=true: the emitted TraceEvent's output field is {"0":123,"1":34,...} which decodes to the full authorization header. ArrayBuffer, Map, Set and Date degrade to `{}` instead (no leak, but see A5). REALISM: needs a transport that returns a non-JSON body (res.arrayBuffer() / a Buffer for a non-JSON provider error envelope) combined with the same echo/mirroring premise the builder already accepted when fixing R2-14. Phase 0 ships no real transport; the ban-risk band is inherited from R2-14 because the exposed material is the AI-Gateway credential and the same code path carries Meta OAuth tokens from Phase 3.

**Independent verifier:** REPRODUCED FROM SCRATCH BY EXECUTION. Verdict: real, severity 2 confirmed (claimant's band is right, but their scope is too narrow — see below).

WHAT I RAN
Baseline, from /home/user/New-skills-/fullburn: `npm test` -> 14 files / 148 tests passed; `npm run typecheck` -> clean; `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean". All three gates are green while the defect is live, so the suite does not detect it. Working tree left clean (`git status --porcelain` empty); probes written only under the scratchpad.

Probe 1 (standalone, redact.ts direct import): redactValue(new TextEncoder().encode(SECRET), [SECRET]) returns {"0":99,"1":97,"2":110,...}; decoding those numeric keys in index order yields exactly "canary-vault-value-do-not-leak-8891". Identical result for Buffer.from(SECRET). Control: redactValue(SECRET, [SECRET]) -> "[redacted]". ArrayBuffer, DataView, Map and Set degrade to {} (no leak) — matches the claimant.

Probe 2 (end-to-end through llm(), real gateway.ts + real ROLE_BINDINGS + MemoryTraceSink, transport mirrors the actual authorization header it was handed):
 - Case A, body { greeting:"hi", raw: bytes(JSON.stringify(headers)) }: outcome resolved, traces=1. Naive `JSON.stringify(sink.events).includes(SECRET)` -> FALSE. Byte reconstruction over the event tree -> TRUE at $.0.output.raw, decoding to {"authorization":"Bearer canary-vault-value-do-not-leak-8891","x-fullburn-client":...}. Raw emitted field: output = {"greeting":"hi","raw":{"0":123,"1":34,"2":97,...}}.
 - Case B, body { greeting:"hi", raw: Buffer.from(headers.authorization) }: same, decodes to "Bearer canary-vault-value-do-not-leak-8891".
 - Case C control, headers mirrored as a plain STRING (the original R2-14 shape): no leak by either check — that half of R2-14 is genuinely closed.
 - Case D, schema-fail path with a bytes-only body: no leak (traceFailure passes output=null).

WHY IT IS A GENUINE VIOLATION, NOT A MISREAD
ENGINE_BUILD.md §10.2 line 291: "a token appearing in code, logs, or Langfuse traces is a critical defect" — stated structurally, with no likelihood qualifier. CLAUDE.md standing invariant repeats it. redact.ts:6-7 states trace payloads are in scope precisely because "§10.2 names Langfuse traces explicitly as a place a token must never appear", and redact.ts:52-55 claims exotic objects "degrade to a constant rather than throwing" — a TypedArray does not degrade to a constant, it is expanded into a fully recoverable numeric map that a real Langfuse sink will persist verbatim. The guard certifies more than it checks. Not disclosed anywhere in LIVE_VERIFICATION_LEDGER.md (L1 covers live round-trip verification, L10 covers vault encryption/rotation; neither covers redaction completeness), and not deferred by the spec — the builder accepted trace-payload redaction as in-scope Phase 0 work when it fixed R2-14.

The R2-14 regression test itself is the corroborating evidence: engine/test/hardening.test.ts:165 "trace payloads are redacted, not just error messages" asserts `expect(JSON.stringify(sink.events)).not.toContain(CANARY_SECRET)`. My probe 2 shows that exact assertion returning false on an event from which the credential is fully recoverable. So the fix's own guard test is blind to the residue, which is why 148 green tests do not contradict this.

SCOPE CORRECTION — THE CLAIMANT UNDERSTATED IT
The defect is not TypedArray-specific and does not require a binary transport. redactText is plaintext-substring-only, so redaction is defeated by any encoding. Probe 3 (redactValue direct, byte/base64/hex/join reconstructors):
 - Uint8Array -> LEAK; Buffer -> LEAK
 - plain number[] of bytes -> LEAK  (this shape survives res.json() — no binary transport needed)
 - base64 string -> LEAK, emitted as "Y2FuYXJ5LXZhdWx0LXZhbHVlLWRvLW5vdC1sZWFrLTg4OTE="  (also survives res.json(); this is the MOST realistic carrier, e.g. a base64 error envelope)
 - hex string -> LEAK, "63616e6172792d7661756c74..."
 - secret split across two adjacent fields -> LEAK, {"a":"canary-vault-valu","b":"e-do-not-leak-8891"}
 - plain string control -> safe "[redacted]"
So the claimant's realism caveat ("needs a transport returning a non-JSON body") is stricter than reality: a pure-JSON provider response carrying base64 or a byte array reaches the same outcome.

SEVERITY
Confirmed at 2 (ban risk), unchanged. Consistent with how the r2 report banded R2-14 for the identical exposure class — the AI-Gateway credential, the key guarding the only spend path, with money-loss exposure once this same redactValue boundary carries Meta OAuth tokens in Phase 3. §10.2 declares the exposure critical on structure, not on probability, which is the standard this project applies elsewhere. I did NOT downgrade despite the honest mitigations (Phase 0 ships no real transport; every transport in the tree is a test mock; the credential must be echoed back by the provider) because those are likelihood arguments and the identical premise was already accepted by the builder when it wrote hardening.test.ts:167's echoing transport. The incremental delta over R2-14 is narrower reachability, not a different harm class.

CLAIMANT ACCURACY: reproduction steps accurate, evidence accurate, "introduced by the r2 fix" fair (redactValue and its passing guard test are both new in 7a8067e; pre-fix the trace payload had no redaction at all, so the fix reduced but did not close the leak). Their one error is under-scoping it to binary payloads.


### A3 · 2 ban-risk · emitOrFail interpolates a hostile sink error's `name` verbatim — falsifying the comment three lines above it — and a throwing `name` getter escapes as the wrong error class

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** tracing.ts:43-45: 'Emit, converting any sink failure into a hard TraceEmitError. The sink's own error text is never interpolated verbatim — callers pass already-redacted detail, and the sink never sees secrets in the first place.'

**Reproduction:** tracing.ts:50-52 builds the message as `...(Law 11): ${err instanceof Error ? err.name : 'unknown sink error'}`. `err.name` IS the sink's own error text and it is read unguarded — the same unguarded-hostile-accessor pattern R2-27 was filed for, in the sibling file the fix pass also touched. Probe: four hostile sink errors through emitOrFail, then the two interesting ones end-to-end through llm() on the success path.

**Observed:** Executed. (i) A sink error with `name = 'E-CLIENT-OAUTH-TOKEN-abc123'` produces, end-to-end from llm(): `TraceEmitError: trace emission failed — refusing to proceed untraced (Law 11): E-CLIENT-OAUTH-TOKEN-abc123`. The known gateway key would be scrubbed by gateway.ts's downstream redactError, but redactText only knows `secrets = [key.value]`, so any OTHER secret the sink implementation embeds in its error name passes through untouched. (ii) A sink error whose `name` is a getter that throws: emitOrFail throws the getter's own error instead of a TraceEmitError; end-to-end llm() then throws `GatewayError: Error: nm [redacted]` with `e instanceof TraceEmitError === false`. The gateway key is redacted (good), but the fail-closed trace-loss signal is misclassified as a provider error — and gateway.ts:210-211 states explicitly that 'tests and the incident runbook both rely on the class'. No test covers either case.

**Independent verifier:** REPRODUCED BY EXECUTION — both halves. Severity corrected 2 -> 3.

WHAT I RAN
Baseline first, from /home/user/New-skills-/fullburn: `npm test` -> 14 files / 148 tests passed; `npm run typecheck` -> clean; `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean"; `git status --porcelain` -> empty before and after. Then throwaway vitest probes under the scratchpad (own subdir, since sibling adversaries' probes share that directory), importing the real engine/src/tracing.ts, engine/src/gateway.ts and engine/test/helpers.ts. Repo worktree left clean; probes deleted.

HALF (i) — VERBATIM INTERPOLATION OF SINK-SUPPLIED TEXT: CONFIRMED
Six hostile sink errors through `emitOrFail` (engine/src/tracing.ts:46-54):
  P1 name = 'E-CLIENT-OAUTH-TOKEN-abc123' -> TraceEmitError: "trace emission failed — refusing to proceed untraced (Law 11): E-CLIENT-OAUTH-TOKEN-abc123"  (sink text, verbatim)
  P2 name = 'E-<vault canary>'            -> raw canary present in the message out of emitOrFail
  P5 name = a NON-STRING object with a hostile toString -> "...(Law 11): obj canary-vault-value-do-not-leak-8891"  (the `typeof name === "string"` guard redact.ts:29 uses does NOT exist here; the template literal coerces)
  P6 thrown plain object -> "unknown sink error" (correct)
So tracing.ts:43-45's "The sink's own error text is never interpolated verbatim" is false as written: `err.name` is sink-authored text, read unguarded, interpolated with no redaction pass. P5 is a wrinkle the claimant did not report and makes it worse (arbitrary-length attacker string, not just a class name).
CORRECTION TO THE CLAIMANT: end-to-end through `llm()` the vault key IS scrubbed — E3 gave "Error: trace emission failed — ... (Law 11): E-[redacted]". So the actual reproduced leak is only of secrets that are NOT the vault key (E1 passed 'E-CLIENT-OAUTH-TOKEN-abc123' through untouched). The claimant said this correctly. A real Langfuse client putting a secret in `name` (a class identifier) rather than `message` is hypothetical — I did not reproduce a live secret escape via llm().

HALF (ii) — THROWING `name` GETTER ESCAPES AS THE WRONG CLASS: CONFIRMED, and this is the stronger half
  P3 direct: emitOrFail threw the GETTER'S OWN Error (ctor=Error, instanceof TraceEmitError=false, message "nm <canary>"). The unguarded read at tracing.ts:51 is exactly the pattern R2-27 was filed for, in the sibling file the same fix pass touched — redact.ts got a try/catch (redact.ts:26-41), tracing.ts did not.
  E2 end-to-end via llm(): threw `GatewayError`, `instanceof TraceEmitError === false`, message "Error: nm [redacted]". This directly contradicts gateway.ts:210-211's own stated contract ("Preserve the error's identity ... tests and the incident runbook both rely on the class"): a Law-11 trace-loss event is handed to the operator as a provider error. errorClassFor() never sees a TraceEmitError because emitOrFail never constructed one.

COVERAGE / DISCLOSURE — both checked, claimant is right
No test exercises a hostile sink error: `emitOrFail` has exactly one caller (gateway.ts:177) and the only sink-failure test is `MemoryTraceSink.setFailing` throwing a plain `new Error("sink outage")` (gateway.test.ts:38). hardening.test.ts:136-162's R2-27 lock covers the TRANSPORT side only. Nothing in LIVE_VERIFICATION_LEDGER L1-L13 discloses this; not deferred by ENGINE_BUILD.md.

WHY SEVERITY 2 (BAN RISK) IS WRONG
Ban risk is policy-violating creative, write-rate abuse, mass platform reads. Nothing here touches a platform API. I probed the money and fail-closed axes explicitly: with the throwing-name sink, `llm()` THREW (never returned an untraced result), transportCalls=1, todayUsd=$0.01, reserved=$0.00 — settlement is correct, headroom is not stranded, Law 11 fail-closed holds. So it is not severity 1 either, and not severity 4 (the vault key does not escape through llm(); isolation is intact). What remains is a guardrail comment asserting a protection the code does not have, plus a fail-closed signal misclassified as a provider error against an explicitly load-bearing class contract — a truthfulness/diagnosability defect. Severity 3.

REAL AND WORTH FIXING: guard the accessor (try/catch + `typeof err.name === "string"`) and run the interpolation through `redactText`, mirroring what redact.ts already does three lines away — or drop the interpolation entirely, which is what the comment already claims happens.


### H-02 · ban-risk · R2-13's registry half is byte-identical to the pre-fix code and the residue is disclosed nowhere — CHANNELS.google, destructuring, env.AI.run() and six provider hosts are still invisible, while the commit claims all 34 findings fixed

**Spec:** Law 1, Law 11, Law 18, §2.5, §10.2 bullets 1/4; CLAUDE.md standing invariant 'locked market/channel flags are structurally inert' and stack pin on Workers AI

**Reproduction:** Drive the real scanContent from engine/scripts/scan-lib.mjs with path 'fullburn/engine/src/adapters/meta.ts' over 25 hostile spellings. See /tmp/claude-0/.../scratchpad/scanprobe.mjs.

**Observed:** Observed CAUGHT/MISSED (real scanContent):
  MISSED  const c = CHANNELS.google;            CAUGHT  const c = CHANNELS["google"];
  MISSED  const { tiktok } = CHANNELS;
  MISSED  Object.values(CHANNELS) / Object.entries(CHANNELS) / alias-then-dot
  MISSED  await env.AI.run('@cf/meta/llama-3-8b-instruct', {prompt})
  MISSED  import { openai } from "@ai-sdk/openai"   MISSED  "@langchain/openai"   MISSED  "@google-cloud/vertexai"
  MISSED  openai.azure.com · bedrock-runtime.amazonaws.com · api.deepseek.com · api.x.ai · api.cohere.ai · localhost:11434
  MISSED  graph.facebook.com written into engine/wrangler.toml or engine/src/hosts.json (structural rules early-return on non-code files)
  CAUGHT  expectedRoas · predicted_roas · forecastRoas · projectedRevenue · estimatedCtr  (this half WAS genuinely rebuilt)
scan-lib.mjs:59-61 (REGISTRY_INDEXING) still cites only F19 and is unchanged; the three rules that WERE widened carry explicit '(R2-13)' comments, so the omission is visible in the file itself. scan-lib.test.ts:69-72 still asserts only the bracket form; the new test at :84 'catches the NATURAL spellings, not just the literal ones (R2-13)' covers hosts and prediction identifiers and does not touch the registry. CHANNELS and MARKETS are exported raw and merely frozen, so CLAUDE.md's standing invariant 'locked market/channel flags are structurally inert' still rests entirely on a regex that misses the most natural spelling. env.AI.run is named in CLAUDE.md's stack pin as something that must 'always [go] through AI Gateway, never direct'.

**Independent verifier:** REPRODUCED IN FULL, by execution, from scratch. real=true; severity confirmed at ban-risk (not raised).

WHAT I RAN

(1) Baseline at 7a8067e, clean tree, from /home/user/New-skills-/fullburn: `npm test` -> 14 files / 148 tests passed; `npm run typecheck` -> exit 0; `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean", exit 0. So the builder's green claim is real; the question is what green means.

(2) Byte-identity check, by git rather than by eye: `git show df95668:fullburn/engine/scripts/scan-lib.mjs` line 54 vs /home/user/New-skills-/fullburn/engine/scripts/scan-lib.mjs:61 — both are exactly `export const REGISTRY_INDEXING = /\b(?:MARKETS|CHANNELS)\s*\[/;` under an identical comment citing only F19. `git show 7a8067e -- fullburn/engine/scripts/scan-lib.mjs` touches SECRET_PATTERNS, PROVIDER_HOSTS, PROVIDER_SDKS, PLATFORM_API_HOSTS, PREDICTION_GATE_IDENTIFIERS and TEST_OR_FIXTURE — and never REGISTRY_INDEXING. The three widened rules each carry an explicit "(R2-13)" comment in the source; the registry rule does not. The omission is visible in the file itself, as the claimant said.

(3) Independent probe of the real scanContent (my own 29-case list, not the claimant's file), path 'fullburn/engine/src/adapters/meta.ts', at /tmp/claude-0/-home-user-New-skills-/64269547-e557-5483-8b4d-c2147d059962/scratchpad/h02probe.mjs. Observed:
  MISSED  CHANNELS.google · const { tiktok } = CHANNELS · Object.values(CHANNELS) · Object.entries(CHANNELS) · alias-then-dot (const R = CHANNELS; R.tiktok) · import-rename (CHANNELS as CH) · MARKETS.EU
  CAUGHT  CHANNELS["google"]  (the one literal the F19 report used as its example)
  MISSED  await env.AI.run('@cf/meta/llama-3-8b-instruct', {prompt}) and the bare form
  MISSED  @ai-sdk/openai · @langchain/openai · @google-cloud/vertexai · @aws-sdk/client-bedrock-runtime
  MISSED  myco.openai.azure.com · bedrock-runtime.us-east-1.amazonaws.com · api.deepseek.com · api.x.ai · api.cohere.ai · localhost:11434
  MISSED  graph.facebook.com written into engine/wrangler.toml, engine/src/hosts.json, engine/src/hosts.yaml — scanContent early-returns at scan-lib.mjs:105 on !CODE_FILE, while leak-check.mjs:15 SCANNED happily reads .toml/.json/.yaml
  CAUGHT  expectedRoas · predicted_roas · forecastRoas · projectedRevenue · estimatedCtr — the prediction half WAS genuinely rebuilt, and I confirm that. (pWin and m.predicted.roas still miss, minor.)
  CAUGHT  api.openai.com · graph.facebook.com (controls fire, so the harness is wired correctly)

(4) THE DECISIVE TEST — end to end, not rule-level. I planted fullburn/engine/src/adapters/google-ads.ts importing CHANNELS from @fullburn/config/channels and reading the staged Google flag three natural ways (`CHANNELS.google`, `const { tiktok } = CHANNELS`, `Object.values(CHANNELS)`) plus `env.AI.run("@cf/meta/llama-3-8b-instruct", { prompt })`. Result: leak-check "clean" exit 0; `npm run typecheck` exit 0; `npm test` 148/148 passed. Every gate green on engine code that reads a staged channel flag without ever entering requireActiveChannel and calls Workers AI without AI Gateway. (My first draft tripped typecheck on noUncheckedIndexedAccess — 'c is possibly undefined'; one `?.` cleared it. That is a type nit a builder fixes reflexively, not a guardrail.) File deleted, `git reset`, `git status --porcelain` empty, baseline re-run green.

(5) Runtime half, via npx tsx against the real modules: CHANNELS.google -> {"status":"staged","writeAdapter":null,"decisionAdversaryRules":null,"fatigueModel":null}; destructured tiktok -> status "locked"; Object.values(CHANNELS).length -> 4 — none of it passing through requireActiveChannel, which does correctly throw when actually called. CHANNELS is exported raw and merely deepFrozen. So CLAUDE.md's standing invariant "locked market/channel flags are structurally inert" is not structural: it rests entirely on a regex that misses the most natural spelling.

(6) Disclosure check: `git show 7a8067e -- fullburn/reports/LIVE_VERIFICATION_LEDGER.md` adds L12 and L13 only, neither about the scanner. Repo-wide grep for "partially fixed|residue|not fully closed|known gap|accepted risk" across *.md/*.mjs/*.ts returns nothing outside the r2 FAIL report itself. reports/ contains only phase0, phase0.r2, the ledger and a README — no fix report. The commit message asserts "fix all 34 confirmed re-review findings" and "typecheck and scan clean". The residue is disclosed nowhere.

(7) Test-backstop check: engine/test/scan-lib.test.ts's registry test still asserts only `CHANNELS["google"]` plus the channels.ts allowlist case; the new test "catches the NATURAL spellings, not just the literal ones (R2-13)" covers hosts and prediction identifiers and contains no registry case at all. So the R2-13 test written to prove the fix silently skips the half that was not fixed.

WHY IT IS A GENUINE VIOLATION, NOT A COVERAGE WISH
Not a style opinion, not deferred by spec, not in the ledger. §2.5 and Law 18 are launch-config, in force now; the CLAUDE.md stack pin ("always through AI Gateway, never direct") is in force now. I discount deliberate self-sabotage (string concat, import("ope"+"nai")) exactly as the r2 report did. What survives is the default way to write the code: dot access and destructuring on a frozen exported record, env.AI.run, and the mainstream @ai-sdk/* and @langchain/* wrappers. And the honesty half is independently real: a commit claiming 34/34 fixed, with a per-rule "(R2-13)" comment on the three rules it did fix, reads as complete while one rule was left untouched and the accompanying test avoids it.

SEVERITY — CLAIMANT GOT IT RIGHT, I DID NOT CORRECT IT
I considered raising to money-loss: env.AI.run bypasses gateway.ts, which is where the per-client spend meter and caps.ts enforcement live, so an uncapped, untraced LLM spend path would be invisible to every gate (also Law 9). But I did not reproduce a live cap breach — no such call exists in the tree today, and severity 1 should mean money actually at risk now. The concrete first realization is Phase 5 building the Google adapter against a staged flag whose decisionAdversaryRules and fatigueModel are both null: ads on a channel with no ban-risk decision rules and no fatigue model. That is ban-risk. Severity 2 stands.


### M-05 · 3 data-lie · One exit from llm() emits no trace and escapes unredacted — deps.now() is read outside the try block, defeating R2-28's "every exit is traced" for that path

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** Law 11 / CLAUDE.md invariant 9 (untraced decision = bug); gateway.ts:13-17 self-description

**Reproduction:** Call llm() with deps.now = () => { throw new Error('clock dead <secret>'); }. gateway.ts:85 `const startedAtMs = deps.now();` sits above the try that begins at :117, so nothing catches it.

**Observed:** OBSERVED: the raw Error propagates out of llm() with the planted canary string intact in .message and .stack (leak: true), and the sink received 0 events. Every other throw site I drove — missing binding, unregistered model, meter without reserve(), a meter returning a reservation for another client, a reservation with amountUsd NaN, unknown client, unsigned client pulsern, a trace context scoped to another client, throwing settle, throwing release — emitted exactly 1 trace each with the canary redacted. gateway.ts:13-17 states "Every exit is traced, including refusals (adversary finding R2-28)" and "Every error and every traced payload is redacted"; both claims are false for this one path. Honest reachability caveat: `now` is injected and would be Date.now in production, so this is a hole in the stated invariant rather than a live leak. Note also that on every pre-vault failure `secrets` is still [], so redactValue traces req.input verbatim on those paths.

**Independent verifier:** REPRODUCED by execution, but the claimant's severity and half its evidence are wrong.

WHAT REPRODUCES. Probe (scratchpad only; repo tree left clean) calling llm() with deps.now = () => { throw new Error('clock dead <canary>') }, everything else healthy (valid TraceContext, scoped vault, working meter/sink, role hello-world): the raw error escapes with err.constructor.name === "Error" (never converted by errorClassFor/redactError), err.stack retains the original frames with top frame "at Module.llm (engine/src/gateway.ts:85:28)", and sink.events.length === 0. Control probe throwing the same canary from vault.get() — the same kind of failure one step further down but inside the try — yields GatewayError, a stack rewritten to "Error: <msg>", and sink.events.length === 1. So gateway.ts:85 `const startedAtMs = deps.now();` genuinely sits above the try that opens at :117, and that exit is untraced. My own extension: line 90 (`req?.trace instanceof TraceContext`) is in the same unguarded prologue — a req with a throwing `trace` getter also produced 0 sink events and a raw Error. The hole is the prologue, not only now().

INTRODUCED BY THE R2 FIX: confirmed. `git show df95668:./engine/src/gateway.ts` shows the pre-fix llm() had no wrapping try, no traceFailure helper, and read startedAtMs deep in the body after vault/meter. The r2 fix added the universal handler plus the gateway.ts:13-17 claim "Every exit is traced, including refusals (adversary finding R2-28)" and hoisted startedAtMs to :85 — outside it. The invariant is new and one exit was left outside it. Nothing in LIVE_VERIFICATION_LEDGER.md L1-L13 discloses it; no spec clause defers it. No test is falsified: hardening.test.ts:86 asserts only that specific named refusals emit a trace, never universality — so the file's own prose is the only thing contradicted, which is exactly why it survives a green 148-test suite.

WHY SEVERITY 3 IS WRONG (corrected to 5). (1) The "escapes unredacted / leak: true" framing does not survive its own control. The claimant asserts every other throw site "emitted exactly 1 trace each with the canary redacted"; in my control the canary passed through a TRACED path verbatim, in both err.message and the emitted event's errorMessage — because on every pre-transport path `secrets` is still [] and redactText is a no-op. The claimant concedes this in their closing note, contradicting their own headline. The real, reproducible delta is only 0-vs-1 trace and raw-vs-synthesized stack (the latter does drop cause/custom props, a genuine but marginal difference). (2) No decision is made on this path: no reservation, no spend, no client-visible number — nothing about it is a data lie, so severity 3 does not fit. (3) Reachability is nil today: `grep -rn "now:"` finds injectors only in engine/test/helpers.ts:46 and engine/test/adversary-phase0.test.ts:52; there is no production composition root in the repo at all, and Date.now does not throw. req is constructed by internal callers.

It remains a real finding rather than style: a guardrail file states a universal guarantee ("Every exit is traced") that execution shows it does not provide, and the mandate treats untraced exits as findings. Severity 5 — dummy-proof/hygiene tier: it misleads any reader or operator relying on the stated invariant, and it will become live the moment a composition root injects a fallible clock.

Suite state at verification: npm test 148/148 pass, npm run typecheck clean, node engine/scripts/leak-check.mjs . reports "leak/structural scan: clean", git status --porcelain empty.


### M-06 · 3 data-lie · The fixture client `testco` is a fully spendable client in the real frozen caps table carrying a builder-written sign-off — the repo's only spendable client is one no human signed, and the Class-2 approval request misdescribes it

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** Law 2; CLAUDE.md prime directive 2 and Law 15/§13 (Class 2); H8

**Reproduction:** Call llm() with clientId 'testco' and no capsTable at all. Also: getCaps('testco') / assertCapsUsable(getCaps('testco')); ls APPROVALS; grep -n 'fixture' HUMAN_TASKS.md; node engine/scripts/class2-gate.mjs . df95668.

**Observed:** OBSERVED: llm() for testco with NO narrowing table resolves — committed $0.0100, 1 trace, cap $5.00/day AI plus $1/day and $1 total ad spend. The only real client, pulsern, is refused: `CapError: caps lack human sign-off (H8) — all spend paths refuse`. So H8's guarantee ("while humanSignoff is null, caps are structurally UNUSABLE: every spend path must refuse") is today satisfied by exactly one client, and that client's signature is the string constant FIXTURE_SIGNOFF at caps.ts:31, written by the builder; assertCapsUsable only tests `typeof === 'string' && length > 0`. R2-03's sharpest half was "an agent must not be able to sign its own caps" — the runtime seam is closed, but the same forgery now exists as a literal inside the frozen table, and any future caps.ts edit can self-sign identically. There is no structural guard, no scanner rule and no test that a fixture client cannot be reached by non-test code (grep for testco/FIXTURE finds only caps.ts, helpers.ts and unrelated scanner constants). Supporting: APPROVALS/ contains only README.md — no approval entry exists for this Class-2 caps.ts change (the gate does correctly flag it on a PR diff: `CLASS-2 GATE FAIL: ... fullburn/config/src/caps.ts (modified)`), and HUMAN_TASKS.md:23 asks the human to approve caps.ts because it "adds the two fixture clients the tests drive" when the table contains one fixture. The human is being asked to sign a description that does not match the file.

**Independent verifier:** REPRODUCED BY EXECUTION, but only one of its three strands is a genuine finding; the severity is right.

WHAT I RAN (from /home/user/New-skills-/fullburn, working tree left clean, probes only in scratchpad):
- npm test -> 148 passed / 14 files; npm run typecheck -> clean; node engine/scripts/leak-check.mjs . -> "leak/structural scan: clean".
- node engine/scripts/class2-gate.mjs . df95668 -> "CLASS-2 GATE FAIL: Class-2 changes without a matching human approval for this transition (Law 2/14/15): fullburn/config/src/caps.ts (modified), ..." (26 paths). ls APPROVALS/ -> README.md only.
- /tmp/.../scratchpad/probe-m06.ts run with `node --experimental-strip-types` from the repo root: NON-TEST code importing engine/src/gateway.ts by absolute path, calling llm() with NO capsTable at all.
- git diff df95668 7a8067e -- fullburn/config/src/caps.ts ; git log --all -S "two fixture clients".

WHAT I SAW (matches the claimed evidence exactly):
  CAPS TABLE: {"pulsern":{...,"dailyAiSpendUsd":25,"humanSignoff":null},"testco":{"dailyAdSpendUsd":1,"totalAdSpendUsd":1,"dailyAiSpendUsd":5,"humanSignoff":"TEST FIXTURE — not a real client"}}
  SPENDABLE: testco ; REFUSED: pulsern -> CapError: caps lack human sign-off (H8) — all spend paths refuse
  TRANSPORT HIT: https://gateway.ai.cloudflare.com/v1/acct/fullburn/anthropic/claude-sonnet
  llm(testco) RESOLVED; committed spend 0.01; 1 trace. llm(pulsern) THREW CapError; committed 0.
git diff confirms the r2 commit added EXACTLY ONE client (testco) plus the FIXTURE_SIGNOFF literal; git log -S confirms HUMAN_TASKS.md:23 wording was introduced by 7a8067e, so "introduced by the r2 fix: true" holds.

STRANDS I REJECT:
(1) "Any future caps.ts edit can self-sign identically" is verbatim ledger L13 ("the Class-2 gate proves what was approved, never who approved it — any actor with write access can still author one") plus L11 (CODEOWNERS/branch protection absent, gates advisory). Honestly disclosed -> not a finding.
(2) The fixture-in-the-frozen-table design itself is a defensible R2-03 trade, disclosed in caps.ts:27-31 and engine/test/helpers.ts:6-10; the alternative it replaced was the severity-1 runtime cap-widening seam. Real-money exposure is nil: no write path before Phase 6, no testco vault key in production, caps are $1/$1/$5.

THE STRAND THAT IS REAL: HUMAN_TASKS.md:23 asks the human to approve config/caps.ts because it "adds the two fixture clients the tests drive". It adds ONE (testco). The only other entry is pulsern — client zero, the real $2,000-sprint client (ENGINE_BUILD.md §14). Both readings are false: there is no second fixture, or pulsern is being labelled a fixture. Approvals are content-hash bound (APPROVALS/README.md transition format), so signing this would stamp Class-2 authorization (Law 15 / H17, human-only) on a change to the spend table that the human was told something untrue about — while that same file claims at caps.ts:20-24 that the H8 marker is "Set only via a Class-2 approved commit", with no APPROVALS entry in existence and the gate failing. This is not in the ledger and is not a style opinion. The claimant is also right that nothing structurally contains the fixture: grep finds testco only in config/src/caps.ts and engine/test/helpers.ts, and there is no test, no scan-lib rule and no gate-lib rule asserting a fixture client is unreachable from src/ — my probe is itself proof that non-test code reaches it and commits spend.

SEVERITY: 3 (data lie) is correct, not 1. No cap is breached and no real money is reachable; the defect is a false statement about a money-path file in the artifact that carries the human's authorization. Fix belongs to the builder: correct HUMAN_TASKS.md:23 to describe the diff exactly (adds one fixture client, testco, with a builder-authored sign-off marker; pulsern unchanged and still unsigned), and add the missing guard if the fixture stays in the frozen table.


### R3-CP-02 · data-lie · R2-09 NOT CLOSED: a 3-backtick fence closes a 4-backtick fence, so the gate reads PASS out of a code example while the report's prose verdict says FAIL

**Spec:** Law 9 / §10.3 AC4 (CI blocks a PR whose adversary report is not PASS); gate-lib.mjs:82-85 stated contract

**Reproduction:** In a clone, compute the tree hash the gate itself computes, delete the stale reports, and commit one report whose rendered text reads 'The engine is NOT safe. Nineteen severity-1 findings remain open.' followed by a ````markdown block containing a nested ``` example with `Verdict: PASS`, then a plain `Verdict: FAIL` and a matching `verified-tree:` line. Run `node fullburn/engine/scripts/adversary-gate.mjs .`

**Observed:** `adversary gate: ADVERSARY_REPORT_phase0.r3.md: adversary report PASS and bound to the current tree`, ADVERSARY-GATE EXIT=0. gate-lib.mjs:83-85 claims 'Fences must be closed by the SAME marker — ``` cannot be closed by ~~~'; the implementation stores only `fenceMatch[1][0]`, the marker CHARACTER, and ignores CommonMark's rule that a closing fence must be at least as long as the opening one. The r2 report listed this exact case (' ````markdown outer fence wrapping a ``` example → GATE-OPENS') and it is untouched. Direct probe (scratchpad/pv.mjs) confirms the same for ~~~~ /~~~ , and finds two further hiding places in the same parser: a `<details>` block (renders collapsed on GitHub; parser reads the PASS inside it) and YAML front matter. gates.test.ts:112 'ATTACK: a fence cannot be closed by a different marker (R2-09)' is green because it only tests the marker-character case.

**Independent verifier:** REPRODUCED BY EXECUTION, end to end, from scratch.

Baseline: /home/user/New-skills-/fullburn at 7a8067e, `npm test` = 148 passed (148), working tree clean before and after; all probes ran in scratchpad and the clone was deleted.

(1) Library probe (scratchpad/probe.mjs importing parseVerdict from /home/user/New-skills-/fullburn/engine/scripts/gate-lib.mjs) printed: PASS for the 4-backtick-outer/3-backtick-inner case, PASS for the ~~~~/~~~ case, PASS for a <details> block, PASS for YAML front matter, and FAIL for the plain control.

(2) End-to-end through the shipped CLI: cloned the repo, git rm'd both stale reports, computed the tree hash using the gate's own algorithm (git ls-files -s -- fullburn/ .github/ :!fullburn/reports/ :!fullburn/APPROVALS/ | git hash-object --stdin -> 11ecaec3a378807224efd1a203b6d14a367d1a03), committed one report whose prose reads "The engine is NOT safe. Nineteen severity-1 findings remain open. Do not merge." with a ````markdown block containing a nested ``` example holding `Verdict: PASS`, followed by a plain `Verdict: FAIL` and the matching verified-tree line. `node fullburn/engine/scripts/adversary-gate.mjs .` printed "adversary gate: ADVERSARY_REPORT_phase0.r3.md: adversary report PASS and bound to the current tree", ADVERSARY-GATE EXIT=0. The same clone before the swap exited 1.

(3) Render independently confirmed, not assumed: installed marked@15 in scratchpad and rendered the exact committed file. The PASS lands inside <pre><code class="language-markdown">...</code></pre>; the only paragraph-level verdict is <p>Verdict: FAIL</p>.

This falsifies the code's own stated contract at gate-lib.mjs:82-85 ("The verdict is the first verdict line that is (a) not inside a fenced code block"). The implementation at gate-lib.mjs:93 does `const marker = fenceMatch[1][0]` — the marker CHARACTER only, discarding fence length — and the same bug is duplicated at gate-lib.mjs:118 in readTreeBinding. CommonMark requires a closing fence at least as long as the opening one, so a 3-backtick fence cannot close a 4-backtick fence; this parser lets it, and everything inside the example is then read as prose.

REGRESSION STATUS: NOT CLOSED. reports/ADVERSARY_REPORT_phase0.r2.md:607 lists this exact row (````markdown outer fence wrapping a ``` example -> GATE-OPENS) under S1a CONTROL PLANE. The builder's lock test engine/test/gates.test.ts:110-113 covers only the marker-character case (``` opened, ~~~ attempted close); it is green and the fence-length hole is entirely untouched. Nothing in reports/LIVE_VERIFICATION_LEDGER.md (L1-L13, read in full) discloses it, and no spec clause defers it — ENGINE_BUILD.md:307 requires CI to block a PR whose adversary report is not PASS, and Law 9 / section 10.3 is defeated here, not merely misreported.

WHERE THE CLAIMANT OVERREACHED (three of four legs hold): the YAML front-matter leg does NOT hold as a hiding place. Rendered with marked, `---\nVerdict: PASS\n---` produces <hr><h2>Verdict: PASS</h2> — a large, plainly visible heading, so the "invisible verdict" framing fails there, exactly as the r2 adversary discounted the table-cell case for the same reason. It still shows the parser reading a verdict from a position it should not, but it is not a concealment vector. The <details> leg DOES hold: marked emits <p>Verdict: PASS</p> inside <details>, which GitHub renders collapsed — that is a genuine hiding place and a fresh sub-case beyond R2-09's original list.


### R3-CP-06 · data-lie · The R2-10 fix fails open on any FAIL report whose verdict line does not parse: a blockquoted or homoglyph FAIL bound to the current tree is silently ignored while a PASS opens the gate

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** §12 Adversary layer '0 unreviewed FAILs'; engine-adversary.md:41 'FAIL blocks the phase gate'

**Reproduction:** In a clone with a fresh PASS report present, add a second report bound to the identical tree hash whose verdict line is (a) `> Verdict: FAIL` — a blockquote, which renders as fully visible prose — and separately (b) `Vеrdict: FAIL` with a Cyrillic е. Run `node fullburn/engine/scripts/adversary-gate.mjs .` Control: the same fixture with a plain `Verdict: FAIL`.

**Observed:** Control (plain FAIL + fresh PASS): `ADVERSARY GATE FAIL: ...verdict is not PASS: "Verdict: FAIL" (an unresolved FAIL on this tree blocks regardless of any PASS)`, EXIT=1 — the R2-10 fix works for the case it was written for. Blockquote variant: `adversary gate: ADVERSARY_REPORT_phase0.r4.md: adversary report PASS and bound to the current tree`, EXIT=0. Homoglyph variant: identical, EXIT=0. Root cause: judgeReport returns fresh:false when parseVerdict returns null, and checkAdversaryReport's freshFail filter is `j.fresh && !j.ok`, so a report that carries a valid verified-tree binding for THIS tree — proof it is a judgement of this exact code — is treated as not-about-this-tree rather than as unresolved. The behaviour is also internally inconsistent: an unrecognised TOKEN (`Verdict: PASSABLE`) is fresh and blocks, while an unrecognised LINE FORMAT is ignored entirely. One character in the second adversary's report (L8/H6b requires a cross-family re-review of this exact tree) is enough to make its FAIL non-blocking, and nothing warns.

**Independent verifier:** REPRODUCED BY EXECUTION, and broader than claimed. Fresh clone of 7a8067e in scratchpad; repo tree left clean (git status --porcelain empty).

Setup: fresh PASS report bound to current tree 77f4cd8f4613e3f645531841ba44296ade6f15ef -> `node fullburn/engine/scripts/adversary-gate.mjs .` EXIT=0. Then added a SECOND report bound to the IDENTICAL tree hash, varying only the verdict line:
- `Verdict: FAIL` (control) -> EXIT=1, "ADVERSARY GATE FAIL: ...r4.md: verdict is not PASS: \"Verdict: FAIL\" (an unresolved FAIL on this tree blocks regardless of any PASS)". Fix works for the case written for.
- `> Verdict: FAIL` (blockquote) -> EXIT=0, "adversary gate: ...r3.md: adversary report PASS and bound to the current tree".
- `Vеrdict: FAIL` (Cyrillic e) -> EXIT=0, identical.
Both claimed variants confirmed verbatim.

WIDER THAN CLAIMED - also fail open (EXIT=0) with an unresolved tree-bound FAIL present: `**Verdict:** FAIL` (standard Markdown bold, the most common real-world rendering), `## Verdict: FAIL` (heading), `- Verdict: FAIL` (list item), `  Verdict: FAIL` (one leading space), `VERDICT — FAIL`, and a report stating findings in prose with no verdict line. Contrast: `Verdict: PASSABLE` DOES block (EXIT=1) - unrecognised TOKEN blocks, unrecognised LINE FORMAT is ignored. The claimant's internal-inconsistency point is confirmed.

ORDER-INDEPENDENT, not a filename-sort artifact. Direct probe of checkAdversaryReport (/tmp/claude-0/-home-user-New-skills-/64269547-e557-5483-8b4d-c2147d059962/scratchpad/probe.mjs): unparseable FAIL sorting FIRST -> GATE-OPENS; sorting LAST -> GATE-OPENS; three simultaneous unparseable FAILs + one PASS -> GATE-OPENS. Plain-FAIL controls shut in both orders.

MOST DAMNING PROBE: an unparseable FAIL with NO PASS present correctly SHUTS the gate ("report has no 'Verdict:' line outside a code fence"). Add a fresh PASS and both the block AND the diagnostic vanish. The gate output never names the FAIL report at all - nothing warns. That is precisely the "someone else passed it is not a review" scenario gate-lib.mjs:156-162 claims to prevent.

ROOT CAUSE CONFIRMED AT SOURCE. /home/user/New-skills-/fullburn/engine/scripts/gate-lib.mjs:137 `if (!verdict) return { ok: false, fresh: false, reason: "report has no 'Verdict:' line outside a code fence" };` returns BEFORE readTreeBinding is consulted, so a report carrying a valid verified-tree binding for THIS EXACT TREE is classified "not about this tree" instead of "unresolved"; checkAdversaryReport's filter at :178 `judged.find((j) => j.fresh && !j.ok)` therefore skips it, and :183 `judged.find((j) => j.ok)` opens on the PASS.

SPEC VIOLATION IS GENUINE. ENGINE_BUILD.md:373 requires "0 unreviewed FAILs" for the Adversary layer; .claude/agents/engine-adversary.md:41 "FAIL blocks the phase gate. You cannot be overridden by the builder - only by the human, in writing, recorded in the report." Here a tree-bound FAIL is overridden automatically by a pre-existing file, with no human and nothing in writing. The gate prints an affirmative PASS claim the evidence in reports/ contradicts.

AGGRAVATING, NOT DISCLOSED. reports/ADVERSARY_REPORT_phase0.r2.md:3 shows the de facto required format is plain `Verdict: FAIL` at column 0, but grep of ENGINE_BUILD.md and reports/README.md shows the verdict-line schema is documented NOWHERE. Ledger L8/H6b requires a second, non-Claude adversary to re-review this exact tree - that reviewer has no spec to conform to and one formatting choice makes its FAIL non-blocking. Nothing in reports/LIVE_VERIFICATION_LEDGER.md (L1-L13) discloses this, so the "already honestly disclosed" exemption does not apply.

SHIPS GREEN. npm test = 148 passed / 14 files; npm run typecheck clean. engine/test/gates.test.ts:57 is the sole R2-10 test and uses a plain `Verdict: FAIL`; gates.test.ts:87 exercises the blockquote skip only in the PASS direction (a quoted PASS must not be read), which does not conflict with treating a tree-bound unparseable report as unresolved.

ONE METADATA CORRECTION (does not change real=true): the claim's `introduced by the r2 fix: true` is imprecise. `git show df95668:fullburn/engine/scripts/gate-lib.mjs` shows the multi-report path AND the fresh:false-on-null-verdict classification both predate the r2 fix. What 7a8067e did was promote the freshFail branch to primary and authoritative; pre-fix that branch was unreachable whenever a fresh PASS existed, so this gap was masked by the larger R2-10 hole. The fix is therefore INCOMPLETE rather than defect-introducing. The substantive claim - the R2-10 fix fails open on any FAIL whose verdict line does not parse - is exactly correct and fully reproduced.

SEVERITY UPHELD at 3 / data-lie as filed. The gate asserts a review state ("adversary report PASS and bound to the current tree") that the contents of reports/ contradict - the system lying about its own governance, the same class R2-10's own report assigned to its mislabeled-test half. It is not itself severity 1: it moves no money directly. It does inherit severity-1 blast radius through what it gates, but per the ladder as written the defect class is a data lie, not a money loss.


### R3-CP-07 · data-lie · Four of the r2 fixes are behaviourally present but have zero test coverage — each is erased by a one-line revert with 148/148 still green

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** engine-adversary.md Phase B step 1-2 (every gap gets a deterministic test that fails pre-fix); §10.3

**Reproduction:** Apply each mutation to the fixed code in a clone and run `npm test`: (M7) delete ` || (isReport(f.oldPath) && f.status === "renamed")` from checkReportsAppendOnly [R2-06 second half]; (M10) drop ".github/" from adversary-gate.mjs TREE_SCOPE [R2-18 hash half]; (M11) restore the `!l.startsWith("??")` exemption in assertCleanTree [R2-19]; (M15) delete /^\.github\// from CLASS2_PATTERNS [R2-18 class-2 half].

**Observed:** All four: `Tests 148 passed (148)`. Each is verified load-bearing by CLI execution — with the fix in place a report rename gives 'ADVERSARY GATE FAIL: adversary reports are append-only ... renamed', a .github edit changes the tree hash (405ff72d… vs 77f4cd8f…), an untracked fullburn or .github file gives 'working tree has unstaged or untracked changes in the verified scope', and a workflow edit gives 'CLASS-2 GATE FAIL ... .github/workflows/fullburn-ci.yml (modified)'. So the suite asserts none of them. No test file imports adversary-gate.mjs at all, so assertCleanTree, TREE_SCOPE and currentFullburnTreeHash are entirely untested — the same gap the r2 report filed as R2-33. Contrast M13 (neutering parseVerdict) → 14 failures, which is the positive result that closes R2-17. Honest qualification: gate-lib.mjs and adversary-gate.mjs are themselves Class-2, so the revert is not free — but R3-CP-01 shows how a replayed approval buys exactly that, and the point of a test is to back up the human who reviews a large refactor.

**Independent verifier:** REPRODUCED BY EXECUTION — all four mutations confirmed, in a git clone of 7a8067e under scratchpad (repo working tree left clean; `git status --porcelain` empty).

BASELINE: /home/user/New-skills-/fullburn `npm test` -> "Tests 148 passed (148)"; `npm run typecheck` clean; `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean". Clone baseline also 148/148.

M7 (gate-lib.mjs:196, R2-06 second half) — deleted ` || (isReport(f.oldPath) && f.status === "renamed")` -> Tests 148 passed (148). Load-bearing probe importing both copies, input [{status:"renamed", oldPath:"fullburn/reports/ADVERSARY_REPORT_phase0.r2.md", path:"fullburn/reports/notes.md"}]: FIXED -> ok:false "adversary reports are append-only; modified/deleted/renamed: ...r2.md"; MUTATED -> ok:true "reports append-only holds". gates.test.ts:72-77 exercises only "modified" and "added"; the sole test naming R2-06 (gates.test.ts:202) covers the Class-2 rename half via checkClass2Approvals, a different function.

M10 (adversary-gate.mjs:22, R2-18 hash half) — dropped ".github/" from TREE_SCOPE -> 148 passed (148). Load-bearing: with .github/ in scope the hash is 77f4cd8f4613e3f645531841ba44296ade6f15ef and appending a line to .github/workflows/fullburn-ci.yml moves it to 72402ffb0ddff891939ec93676a3e91f72f85659; without .github/ in scope the hash is 8b4e5b5a441ecd75a9fa678f262514ee14d5ac54 BEFORE AND AFTER the identical edit, so a report bound pre-edit still reads fresh.

M11 (adversary-gate.mjs:36, R2-19) — restored `!l.startsWith("??")` -> 148 passed (148). Load-bearing via the real CLI `node engine/scripts/adversary-gate.mjs ..` with an untracked fullburn/engine/src/shadow.ts planted and the mutation STAGED so the tree was otherwise clean: FIXED -> "ADVERSARY GATE FAIL: working tree has unstaged or untracked changes in the verified scope ... ?? fullburn/engine/src/shadow.ts"; MUTATED -> assertCleanTree passed and the gate walked on to the report-freshness check instead. Compounding: the workflow runs both gates only after actions/checkout@v4 (fullburn-ci.yml lines 34-42), i.e. always on a clean tree, so this guard can never fire in CI either — a unit test is its only possible coverage.

M15 (gate-lib.mjs:24, R2-18 class-2 half) — deleted /^\.github\// from CLASS2_PATTERNS -> 148 passed (148). isClass2(".github/workflows/fullburn-ci.yml"): FIXED true, MUTATED false. Real CLI in two-commit form (M15 landed in base, follow-up commit edits ONLY the workflow): `node engine/scripts/class2-gate.mjs .. <base>` -> "class2 gate: no Class-2 changes", exit 0. With the fix in place the same edit -> "CLASS-2 GATE FAIL ... .github/workflows/fullburn-ci.yml (modified)". CLASS2_FILES still lists the path but gates.test.ts asserts only string membership in that array, which executes no policy.

POSITIVE CONTROL (claimant's M13): injecting `return {token:"PASS", line:"Verdict: PASS"}` at the top of parseVerdict -> "14 failed | 134 passed (148)". The suite genuinely bites where tests exist, so the four green results are real coverage gaps, not a harness artifact.

COVERAGE CENSUS: R2 ids referenced in test files are R2-03,04,05,06,08,09,10,11,13,14,15,20,21,22,25,26,31,32,34. R2-18, R2-19 and R2-33 appear in none. grep across *.ts/*.mjs/*.yml/*.json finds no importer of adversary-gate.mjs, so assertCleanTree, TREE_SCOPE and currentFullburnTreeHash are wholly untested — the same gap the r2 report filed as R2-33(a), which this commit claims to have fixed.

SPEC VIOLATION CONFIRMED: engine-adversary.md Phase B step 1 requires a deterministic test for every gap that fails pre-fix and passes after; step 2 requires every acceptance criterion encoded permanently. Four r2 fixes ship with none. Not covered by any ledger entry — L1..L13 do not mention test coverage of the gates — so this is not honestly disclosed, and it is not deferred to a later phase (§10.3 and Phase B are Phase 0 obligations).

SEVERITY: claimant's "data-lie" (3) is correct, keep it. The r2 report classifies this exact class as [A7-honesty], which maps to 3 in this project's convention. Not 1/2: the revert is not itself a live money or ban path, and the claimant's own qualification is accurate — gate-lib.mjs and adversary-gate.mjs are both Class-2, so the revert requires an approval. Not lower than 3: M10/M15 unlock the file that determines whether the money and ban gates execute at all, so a silent regression there re-opens the whole Class-2 bypass chain, and a test is the only backstop behind human review of a 34-finding refactor.

TWO IMMATERIAL CORRECTIONS TO THE CLAIM: (a) the claimant's post-tamper hash "405ff72d..." is not independently reproducible because it depends on their tamper content — I reproduce their 77f4cd8f... baseline exactly and get 72402ffb... for mine; the mechanism is identical. (b) their M7/M11 CLI evidence requires the mutation to be staged first, otherwise the mutated file itself dirties the tree and masks the result.


### DT-01 · data-lie · R2-23 NOT CLOSED: runEval checks only the golden set's case IDs, never its assertions — a model that honestly scores 0.2 binds at 1.0 with a genuine attestation

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** ENGINE_BUILD.md §2.4 'Eval-gated swaps … No pass, no bind'; Law 13

**Reproduction:** Both halves executed through the real runEval + real bindRole with the repo's own committed fixtures (engine/evals/genome-tagger/*). (a) zero-assertion: goldenSet = GOLDEN.map(c => ({id: c.id, input: c.input, expected: {}})) — the five DECLARED ids g1..g5, real inputs, real RECORDED_LLAMA_70B recordings, only the expected maps emptied. (b) narrowed-assertion: expected reduced to the single field llama-70b happens to answer correctly. Both then bindRole(ROLE_BINDINGS, 'genome-tagger', 'llama-70b', result.attestation).

**Observed:** Control first: the honest run scores 0.2 and bindRole throws 'model "llama-70b" scored 0.2 < threshold 0.8 — no pass, no bind'. (a) prints score 1, total 5, passed 5, failures [] and bindRole returns {"hello-world":"claude-sonnet","genome-tagger":"llama-70b","creative-decision-adversary":"claude-sonnet"}. (b) identical: score 1 -> bound. These are not forgeries — attestEvalRun minted them, the WeakSet contains them, the arithmetic closes — so R2-22's branded-attestation fix cannot see them. The declared-ID check at eval-harness.ts:68-76 compares only `goldenSet.map(c => c.id)` against GOLDEN_SET_CASE_IDS; the pass/fail comparison at eval-harness.ts:90, `Object.entries(gcase.expected).every(...)`, is still vacuously true on an empty map. R2-23 named both causes and explicitly predicted that a declared-size/id check 'would not save it'; that is exactly the check that was built. Reachability is Class-1: isClass2('fullburn/engine/src/rebind-job.ts') returns CLASS1, so a new engine/src module can pass its own case array to runEval and never touch a Class-2 path — the human-approval gate on engine/evals/** and models.ts is bypassed without editing either. Consequence: Law 13's 'a model holds a role only while it passes that role's eval suite' is unenforced, and the model-layer Grade metric roles_below_eval_threshold would read 0 while a failing model holds a role.

**Independent verifier:** REPRODUCED by execution from scratch at commit 7a8067e (clean tree; baseline npm test 148/148 green, typecheck clean, leak-check clean).

Probe under scratchpad, node --experimental-strip-types, using the repo's real runEval / RecordedTransport / bindRole and the committed engine/evals/genome-tagger fixtures (resolved to the same module instance the harness imports — confirmed by the branded instanceof + WeakSet checks passing):
- CONTROL (real GOLDEN + RECORDED_LLAMA_70B): score=0.2 total=5 passed=1, bindRole REFUSED with 'model "llama-70b" scored 0.2 < threshold 0.8 ... no pass, no bind'.
- (a) zero-assertion (declared ids g1..g5, real inputs, real recordings, expected maps emptied): score=1 total=5 passed=5 failures=[] -> BOUND {"hello-world":"claude-sonnet","genome-tagger":"llama-70b","creative-decision-adversary":"claude-sonnet"}.
- (b) narrowed-assertion (expected reduced to the field the model itself answered): score=1 total=5 passed=5 -> BOUND.
- (c) negative control (id "x1"): REFUSED — 'golden set for "genome-tagger" does not match the ids declared on its role card'. So the built check works for exactly what it checks: ids, never assertions.

These attestations are genuine (minted by attestEvalRun, in the WeakSet, arithmetic closes), so R2-22's branded-attestation defence cannot see them. Root cause as claimed: eval-harness.ts:68-76 compares only goldenSet.map(c=>c.id) against GOLDEN_SET_CASE_IDS; eval-harness.ts:90 Object.entries(gcase.expected).every(...) is vacuously true on an empty map. Line 64 rejects a set of zero CASES ("an eval over nothing proves nothing") but nothing rejects a case with zero ASSERTIONS.

Not already disclosed. I separately executed the ledger's L12 path (attestEvalRun with fabricated all-true outcomes -> score 1 -> bound), confirming L12 is real and disclosed. But L12's stated mitigation ("require the attestation to carry a Langfuse run id the registry can independently confirm") does not reach DT-01: a runEval pass over emptied expected maps executes every case and would carry a real run id while still scoring 1.0. DT-01 also needs no malice — a case authored or fetched with an empty expected map (exactly the L2/L3 regeneration path) silently scores PASS.

The code's own claims are falsified: eval-harness.ts:5-9 "the set is checked against the ids the role card declares — a caller cannot substitute a friendlier set" (variant (b) substituted a friendlier set) and models.ts:114-116 "so the harness cannot be pointed at a friendlier set (adversary finding R2-23)". R2-23 explicitly predicted a declared-id/size check would not save it; that is the check that was built. R2-23 is NOT closed.

Reachability confirmed: isClass2('fullburn/engine/src/rebind-job.ts') returns CLASS1 (CLASS2_PATTERNS enumerates only gateway|spend-meter|grade-registry|vault|tracing|redact|eval-harness under engine/src), so a new engine/src module can pass its own case array to runEval without touching engine/evals/** or config/src/models.ts.

Supporting fact, also executed: the R2-23 guard is entirely untested — I deleted the whole declared/supplied block from eval-harness.ts and npm test still reported 14 files / 148 tests passed. Restored with git checkout --; working tree left clean.

Severity: claimant's data-lie (3) is correct and I am not raising it. Phase 0 wires no money path; the consequence is Law 13 ("a model holds a role only while it passes that role's eval suite", §2.4 "No pass, no bind") unenforced, and the model-layer Grade metric roles_below_eval_threshold reading 0 while a 0.2-scoring model holds a role — a client/registry-visible number the evidence does not support.


### DT-02 · data-lie · Two of three roles declare golden-set case IDs that correspond to no golden set in the repo — the pre-write decision adversary is rebindable on a wholly invented eval

**Spec:** ENGINE_BUILD.md §2.4 role cards ('a golden eval set in Langfuse'), §11 Phase 0 AC 2

**Reproduction:** ls engine/evals -> only genome-tagger/ exists, yet GOLDEN_SET_CASE_IDS declares hello-world:['h1'] and creative-decision-adversary:['a1','a2','a3'], and their RoleCard.goldenSet paths are 'evals/hello-world' and 'evals/creative-decision-adversary'. Executed: cases = ['a1','a2','a3'].map(id => ({id, input:{}, expected:{verdict:'PASS'}})) with new RecordedTransport({a1:C, a2:C, a3:C}) where C is ONE constant object {verdict:'PASS', reasons:[]}; runEval(deps,'creative-decision-adversary','gpt-5',cases,transport,client) then bindRole.

**Observed:** Prints B1-score 1, threshold 0.9, failures [], and bindRole returns {"hello-world":"claude-sonnet","genome-tagger":"qwen-72b","creative-decision-adversary":"gpt-5"} — the §5.2 pre-write kill/promote adversary role rebound on an eval whose cases, inputs, expectations and 'model outputs' were all invented in the same 6 lines. Same for hello-world at threshold 1.0 with a single fabricated case. The comment at models.ts:114-116 says the ids are 'Declared HERE, next to the role card, so the harness cannot be pointed at a friendlier set and a fabricated run cannot invent its own coverage' — true only for genome-tagger, the one role with a committed golden file. For the other two the check validates invented ids against invented ids. Not disclosed anywhere: ledger L2 covers regenerating genome-tagger's recorded OUTPUTS; nothing states that two roles have no golden set at all. A constant-output transport does score 1.0 (the fresh-attack question), because the caller supplies the expectations it is scored against.

**Independent verifier:** CONFIRMED by execution. Severity stands at 3 (data-lie).

WHAT I RAN (from /home/user/New-skills-/fullburn, baseline first: `npm test` -> 14 files / 148 tests passed; `npm run typecheck` clean; `node engine/scripts/leak-check.mjs .` -> "leak/structural scan: clean"; `git status --porcelain` empty before and after — no repo writes).

Probe: /tmp/claude-0/-home-user-New-skills-/64269547-e557-5483-8b4d-c2147d059962/scratchpad/dt02.mjs.ts, run as `node --experimental-strip-types <probe>`, importing the REAL /home/user/New-skills-/fullburn/config/src/models.ts, /home/user/New-skills-/fullburn/engine/src/eval-harness.ts and /home/user/New-skills-/fullburn/engine/test/helpers.ts. Verbatim output:

  A  score/total/passed/failures: 1 3 3 []
  A  card threshold: 0.9 goldenSet path: evals/creative-decision-adversary
  A  bindRole -> {"hello-world":"claude-sonnet","genome-tagger":"qwen-72b","creative-decision-adversary":"gpt-5"}
  B  score/total/failures: 1 1 []
  B  bindRole -> {"hello-world":"gpt-5","genome-tagger":"qwen-72b","creative-decision-adversary":"claude-sonnet"}
  C  score/total/failures: 1 5 []
  C  bindRole -> {"hello-world":"claude-sonnet","genome-tagger":"llama-70b","creative-decision-adversary":"claude-sonnet"}
  C2 vacuous-expected score: 1 failures: []
  D  refused: golden set for "hello-world" does not match the ids declared on its role card (expected h1; got zzz)

A is the claimed reproduction, exactly as described: three cases with ids a1/a2/a3, `input:{}`, `expected:{verdict:"PASS"}`, one constant object `{verdict:"PASS",reasons:[]}` served for all three by RecordedTransport -> genuine EvalResult score 1.0 against threshold 0.9 -> `bindRole` moves the §5.2 pre-write kill/promote adversary role to gpt-5. B reproduces the same for hello-world at threshold 1.0 with one fabricated case. Every case id, input, expectation and "model output" was authored inside the probe.

CORPUS CHECK (the load-bearing half of the claim): `find engine/evals -type f` returns exactly two files, both under engine/evals/genome-tagger/ (golden.ts, recorded-outputs.ts). `grep -rn '"h1"|"a1"' --include=*.ts --include=*.md .` (excluding node_modules) matches ONLY /home/user/New-skills-/fullburn/config/src/models.ts:118 and :120. So h1/a1/a2/a3 exist nowhere except the declaration itself — no golden file, no recorded outputs, no test. And `grep -rn goldenSet` confirms `RoleCard.goldenSet` (the strings "evals/hello-world" and "evals/creative-decision-adversary") is read by nothing: it appears only in the interface, three card literals, one unrelated test literal, and as the *parameter name* in eval-harness.ts. The two declared paths point at directories that do not exist and nothing checks.

WHY IT VIOLATES THE CODE'S OWN CLAIM: config/src/models.ts:114-116 states the ids are "Declared HERE, next to the role card, so the harness cannot be pointed at a friendlier set and a fabricated run cannot invent its own coverage (adversary finding R2-23)". Probe D shows the check that backs that sentence is real but narrow — it refuses id `zzz`. For hello-world and creative-decision-adversary there is no committed set behind the ids, so the check compares invented ids against invented ids and the sentence is false for two of three roles. engine/src/eval-harness.ts:5-11 makes the same claim ("a constant-output transport cannot manufacture coverage it did not have") — A and B are constant-output transports manufacturing full coverage.

NOT DISCLOSED: reports/LIVE_VERIFICATION_LEDGER.md L2 covers only regenerating genome-tagger's recorded OUTPUTS from live models; L12 covers the in-process provenance ceiling of attestEvalRun; L3 covers Langfuse eval push. No entry states that two of three roles have no golden set at all. ENGINE_BUILD.md §11 Phase 0 lists the "Langfuse eval harness" as a deliverable and AC 2 requires a rebind that "passes its evals"; §2.4 requires every role card to carry a golden eval set. Two roles carry none, and the phase-0 artifact does not say so. That is the data-lie.

SEVERITY: claimant said data-lie; correct. The concrete, executed harm is a false verification claim in code plus an undisclosed coverage gap in a Phase-0 sign-off artifact. I considered raising it — the affected role is the pre-write kill/promote gate (Law 5, §5.2) and an unqualified model holding it is a money-loss path — but no money path calls bindRole in Phase 0, so I am not inflating it on unexecuted future harm. It should be re-ranked to severity 1 the moment Phase 5/6 wire the decision adversary to writes.

ONE CORRECTION TO THE CLAIMANT, AND A LARGER SIBLING DEFECT I FOUND WHILE VERIFYING: DT-02's causal story is partly wrong. The missing golden file is NOT what makes the rebind possible. Probe C shows genome-tagger — the ONE role with a committed golden set — binds llama-70b at score 1.0/5-of-5 using the real declared ids g1..g5 with invented inputs and a single invented expectation `{hook:"x"}`. Per r2 R2-22, llama-70b genuinely scores 0.2 against the real GOLDEN set. `runEval` validates case IDs only; case CONTENT (input + expected) remains 100% caller-supplied for every role, and engine/evals/genome-tagger/golden.ts is never loaded by the harness. Probe C2 additionally shows R2-23's explicitly-named cause 2 is still open: the five real ids with `expected:{}` on every case still score 1.0 and bind, because eval-harness.ts:90 `Object.entries(gcase.expected).every(...)` is vacuously true on an empty map — a case asserting nothing passes. So the R2-23 fix closed the id-substitution half and left both the content half and the zero-assertion half open. Those are separate, higher-severity findings for the report; DT-02 itself is real and stands on its own as the undisclosed-coverage half.


### DT-03 · data-lie · Residual R2-20: blended_roas has no domainMax and organic_clicks_vs_baseline_pct has no bounds at all — Number.MAX_VALUE grades A

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** ENGINE_BUILD.md §12 (Law 14); grade-thresholds.ts:18-23 stated contract

**Reproduction:** Programmatically enumerate every threshold with op '<', '<=' or '>=' that is missing domainMin or domainMax, substitute Number.MAX_VALUE (and -Number.MAX_VALUE where domainMin is absent) into an otherwise all-A snapshot derived from GRADE_AREAS, and call computeGrades.

**Observed:** marketing-engine.blended_roas (op >=, domainMin 0, no max) reading 1.7976931348623157e+308 -> A; reading 1e12 -> A. wordpress-seo.organic_clicks_vs_baseline_pct (op >=, NO domainMin, NO domainMax) reading 1.7976931348623157e+308 -> A; 1e12 -> A. Every other unbounded ordered metric is saved incidentally by the direction of its operator (reconciliation_drift_pct, stripe_warehouse_drift_pct, red_button_drill_seconds, human_queue_median_latency_hours all use '<'). This is the failure mode grade-thresholds.ts:18-23 declares it fixes — 'a reading outside the metric's declared domain is corrupt … must fail CLOSED' — and R2-20 explicitly named organic clicks among the spoofable set. A revenue/spend ratio over near-zero spend, or a clicks/baseline ratio over a near-zero baseline, is the ordinary nightly path that produces such a reading, and a spoofed A suppresses enforcement() entirely, which is the gate for Class-1 auto-ship (Law 15) and for onboarding the next client (Law 17). HUMAN_TASKS.md:26 tells the human this change added 'per-metric domain bounds' without noting the two metrics that have none.

**Independent verifier:** REPRODUCED BY EXECUTION at commit 7a8067e. Baseline first: `npm test` 148/148 green, `npm run typecheck` clean, `node engine/scripts/leak-check.mjs ..` clean.

Probe written to /tmp/claude-0/-home-user-New-skills-/64269547-e557-5483-8b4d-c2147d059962/scratchpad/dt03.ts (nothing written in the repo), run with `node --experimental-strip-types`, importing the real /home/user/New-skills-/fullburn/config/src/grade-thresholds.ts and /home/user/New-skills-/fullburn/engine/src/grade-registry.ts. It builds an all-A snapshot DERIVED FROM GRADE_AREAS itself (not hand-copied), then substitutes Number.MAX_VALUE and 1e12 into every '>=' metric and -Number.MAX_VALUE / -1e12 into every '<'/'<=' metric, and calls computeGrades + enforcement.

Control: all-A snapshot -> every area A, enforcement() -> 0 actions. Negative control (data-truth.stripe_warehouse_drift_pct = 5) -> BELOW_A, failing=["stripe_warehouse_drift_pct"], 3 enforcement actions. So the harness is wired correctly.

FOUR SPOOFED-A CASES, exactly the two metrics claimed:
  marketing-engine.blended_roas = 1.7976931348623157e+308 -> A, failing=[], enforcementActions=0
  marketing-engine.blended_roas = 1000000000000            -> A, failing=[], enforcementActions=0
  wordpress-seo.organic_clicks_vs_baseline_pct = 1.7976931348623157e+308 -> A, failing=[], enforcementActions=0
  wordpress-seo.organic_clicks_vs_baseline_pct = 1000000000000            -> A, failing=[], enforcementActions=0
All 9 other ordered metrics were caught (BELOW_A, 3 actions each).

Bounds audit dumped from the live module confirms the mechanism. config/src/grade-thresholds.ts:36 `blended_roas` op '>=' value 4 domainMin 0 domainMax UNDEFINED; :70 `organic_clicks_vs_baseline_pct` op '>=' value 0 domainMin UNDEFINED domainMax UNDEFINED. Every other '>=' metric carries domainMax 100 (:53, :71, :72, :80, :89) and every '<' metric carries domainMin 0 (:37, :61, :81, :102), which is the bound that blocks each operator's permissive direction. Only these two are open. `isUsableReading` (grade-registry.ts:32) rejects only non-finite values, and Number.MAX_VALUE is finite, so the R2-20 fix does not touch this path.

This violates the code's own stated contract, not merely a style preference. grade-thresholds.ts:18-23 declares domain bounds exist because "a corrupt reading must fail CLOSED rather than satisfy an ordered comparison by being absurd", and grade-registry.ts:36 repeats "a reading outside the metric's declared domain is corrupt, not good news." R2-20 (report line 1079, spoofable set enumerated at lines 1110-1113) named organic clicks explicitly among the spoofable metrics; the original attack still succeeds on that exact metric key. `blended_roas` did not exist before this commit — it was added by the R2-21 fix with a domainMin only — so this is partly a defect the fix introduced. A revenue/spend or clicks/baseline ratio over a near-zero denominator produces a huge FINITE double (x/0 gives Infinity and is caught; x/tiny is not), so this is the ordinary nightly-reconciliation path, and computeGrades is a public export with no upstream sanitizer.

ADDITIONAL EVIDENCE the fix is unguarded: I deleted `inDomain(t, actual) &&` from the '>=' branch of metricPasses (one line) and re-ran the suite -- 148/148 STILL GREEN. The '>=' domain path has zero test coverage. engine/test/grade-registry.test.ts:117, the test titled "out-of-domain readings fail CLOSED, not open (R2-20)", exercises only +/-Infinity and NaN on stripe_warehouse_drift_pct and -5 on red_button_drill_seconds -- both '<' metrics -- and never a finite-but-absurd reading. I restored the file with `git checkout --`; final state verified clean: `git status --short` empty, 148/148 green, typecheck clean, leak-check clean.

NOT ALREADY DISCLOSED: reports/LIVE_VERIFICATION_LEDGER.md L1-L13 contains no entry about residual unbounded metrics (grep for domain/bound/R2-20 returns only L13, unrelated). HUMAN_TASKS.md:26 tells the human the change adds "per-metric domain bounds" with no carve-out for the two metrics that received none. The spec does not defer this to a later phase; §12 is a Phase 0 deliverable and AC3 depends on it.

SEVERITY CONFIRMED AS CLAIMED (data-lie, 3). Not 1 or 2: every money- and ban-critical metric (cap_breaches, policy_strikes, cross_tenant_events, token_leaks, guarantee_exposure_within_cap, family_diversity_holds) uses ==0/==true and is immune by strict equality -- I verified those ops are unaffected. The harm is that a corrupt reading grades A instead of failing closed, which suppresses enforcement() entirely and thereby satisfies the "every area holding A" gate for Class-1 auto-ship (Law 13) and next-client onboarding (Law 15). That is the same escalation path the prior adversary calibrated as severity 3 in R2-20, so the claimant's severity is right.

ONE CORRECTION to the claim's wording (does not change the verdict): the claimant says the other unbounded ordered metrics are "saved incidentally by the direction of their operator." That is inaccurate -- reconciliation_drift_pct, stripe_warehouse_drift_pct, red_button_drill_seconds and human_queue_median_latency_hours are saved by an explicit domainMin: 0, which is precisely the correct bound for a '<' metric; their missing domainMax is genuinely harmless. The finding is also narrower in scope than R2-20 was (2 metrics rather than 8). Neither point rebuts the reproduction.


### DT-04 · data-lie · Four of the r2 fixes are unlocked: a one-line revert of each keeps 148/148 green, typecheck and leak-check clean, and demonstrably reopens the original finding

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** ENGINE_BUILD.md §10.1 step 4 — 'Tests must fail before the fix and pass after'

**Reproduction:** Four independent single-edit mutations, each followed by npm test / npm run typecheck / node engine/scripts/leak-check.mjs ., then by my probe to confirm the original attack works again; each file restored from backup afterwards.

**Observed:** (a) grade-registry.ts:33 `Number.isFinite(actual)` dropped from isUsableReading -> 148/148 GREEN, and blended_roas: Infinity grades A again (R2-20 reopened). The R2-20 lock test (grade-registry.test.ts:117-128) only probes stripe_warehouse_drift_pct and red_button_drill_seconds, both of which are caught by their domain bounds instead, so it passes without the finiteness guard at all. (b) models.ts:197 `|| !GENUINE.has(att)` removed -> 148/148 GREEN, and Object.create(EvalAttestation.prototype) + Object.assign binds llama-70b (R2-22's actual fix, deleted, unnoticed). (c) eval-harness.ts:68-76, the entire declared-set check that is R2-23's fix, deleted -> 148/148 GREEN, typecheck clean, leak-check clean; zero tests exercise it. (d) eval-harness.ts:38 `Object.hasOwn(...) ? ... : undefined` reverted to a raw index -> 148/148 GREEN, and the polluted-prototype run scores 1.0 with zero recordings (R2-24 reopened verbatim). Contrast proving this is not a generic 'tests are editable' complaint: neutering inDomain() fails 1 test; deleting two §12 criteria fails the R2-21 test; deleting the pairing block fails the R2-26 test; renaming an area fails 4 tests. Four guards are locked and four are not, and the four unlocked ones are precisely the ones whose original findings I can reopen with one line.

**Independent verifier:** VERDICT: REAL, with one sub-claim corrected. Reproduced independently from scratch by execution at /home/user/New-skills-/fullburn (baseline first: npm test = 148/148, npm run typecheck clean, node engine/scripts/leak-check.mjs . = "leak/structural scan: clean", git status empty). Each mutation was applied one at a time via python3 in-place edit, verified with `git diff --stat` to be the single intended line/block, gated with all three commands, probed, then restored from a backup in scratchpad. Final state re-verified: working tree clean, 148/148, typecheck clean, leak-check clean.

(a) CONFIRMED VERBATIM. engine/src/grade-registry.ts:33 `return typeof actual === "number" && Number.isFinite(actual);` -> `return typeof actual === "number";`. Result: 148/148 GREEN, typecheck clean, leak-check clean. My probe (all-A snapshot, one metric perturbed): `marketing-engine.blended_roas = Infinity -> A failing=[]` and `enforcement(computeGrades(...)) -> []`. Also `wordpress-seo.organic_clicks_vs_baseline_pct = Infinity -> A`. That is R2-20's exact claim ("+Infinity satisfies every >= threshold... a spoofed A suppresses enforcement() entirely") reopened by one line, with the suite still green. The claimant's diagnosis of why is also correct: the R2-20 lock test (engine/test/grade-registry.test.ts:117-128) only perturbs `stripe_warehouse_drift_pct` and `red_button_drill_seconds`, both op "<" with `domainMin: 0`, so `inDomain()` catches -Infinity/+Infinity/NaN/-5 without the finiteness guard ever being consulted. It is `inDomain`, not `isUsableReading`, that is under test.

(b) CONFIRMED VERBATIM. config/src/models.ts:197 `if (!(att instanceof EvalAttestation) || !GENUINE.has(att))` -> `if (!(att instanceof EvalAttestation))`. Result: 148/148 GREEN, typecheck clean, leak-check clean. Probe: `Object.create(EvalAttestation.prototype)` + `Object.assign(..., {role:"genome-tagger", modelId:"llama-70b", score:1, total:5, passed:5, outcomes:[g1..g5 passed]})` -> `bindRole` returns `{"hello-world":"claude-sonnet","genome-tagger":"llama-70b","creative-decision-adversary":"claude-sonnet"}`. llama-70b genuinely scores 0.2 against the committed recordings (verified: control run score 0/0.2 path, threshold 0.8). No eval was executed. The WeakSet brand — which IS R2-22's fix — has zero coverage; only the `instanceof` half is tested (the plain literal is still refused, as my second probe confirmed), and config/test/models.test.ts:12-15 asserts that adversary-phase0.test.ts "proves that a hand-written literal does not bind at all", which exercises only `forced(n)` bare numbers.

(c) HALF TRUE — the coverage half is real, the "reopens the original finding" half is NOT. Deleting engine/src/eval-harness.ts:66-76 (the whole declared-set block, plus the now-unused GOLDEN_SET_CASE_IDS import) -> 148/148 GREEN, typecheck clean, leak-check clean. So "zero tests exercise it" is confirmed. BUT it does not reopen R2-23: with the block gone, both of R2-23's original constructions are still refused, by `attestEvalRun`'s independent coverage check in models.ts:180-186. Probe output under the mutation: rigged 1-case set -> "eval run does not cover role \"genome-tagger\"'s declared golden set (expected g1,g2,g3,g4,g5; got g1)"; 20 synthetic cases -> same refusal listing s0..s19. So (c) is a redundant defense-in-depth layer with no lock test, not a reopened defect. The finding's title overstates this one of the four.

(d) CONFIRMED VERBATIM. engine/src/eval-harness.ts:38 `Object.hasOwn(this.#outputs, this.#currentCase) ? this.#outputs[this.#currentCase] : undefined` -> `this.#outputs[this.#currentCase]`. Result: 148/148 GREEN, typecheck clean, leak-check clean. Probe, `new RecordedTransport({})` (zero recordings) both times: control (clean prototype) -> `{score:0, passed:0, failures[0]="g1: Error: no recorded output for case \"g1\""}`, bindRole refused "no pass, no bind"; polluted (`for (const g of GOLDEN) Object.prototype[g.id] = {...g.expected}`) -> `{score:1, passed:5, failures:[]}` and bindRole SUCCEEDED, binding llama-70b. R2-24 reproduced word for word.

CONTRAST CONTROLS — I ran two of the claimant's four myself rather than take them on trust, because this is the load-bearing distinction between a real coverage gap and a generic "tests are editable" complaint. Neutering `inDomain()` to `return true` -> 1 test fails (147/148). Deleting the builder-with-no-adversary pairing block in models.ts -> 1 test fails (147/148). So locked guards do fail the suite; the four in this finding do not. The claim is properly calibrated.

SEVERITY: claimant said data-lie (3); I agree, keep it. The direct spec violation is ENGINE_BUILD.md §10.1 step 4 / the adversary mandate's Phase B rule ("The test must fail against the pre-fix code and pass after") — three of these fixes ship with no test that fails without them, so §10.2's "green CI + adversary report" gate is not actually holding them. The harm class is inherited from the findings they fail to guard: R2-20 lets a corrupt reading grade an area A and suppress enforcement(), which is the gate for Class-1 auto-ship (Law 13/15) and next-client onboarding (Law 17) — a data lie that becomes an autonomy grant; R2-22/R2-24 forge the eval gate for roles including creative-decision-adversary (§5.2, pre-write kill/promote path). A regression-guard gap cannot outrank the finding it guards, and the prior adversary rated all three severity 3. Not 1 or 2: exploitation of any of these requires a repo code change, not untrusted input.

SEPARATE, MATERIAL, NOT PART OF DT-04 — reproduced on UNMUTATED HEAD, tree clean: R2-23's cause 2 is still open in the shipped code. Taking the real GOLDEN set, keeping all five declared ids and real inputs, and emptying only the `expected` maps yields `{"score":1,"total":5,"passed":5,"failures":[]}` for llama-70b (true score 0.2) and `bindRole` binds it. The declared-set check compares ids only, and `Object.entries(gcase.expected).every(...)` at eval-harness.ts:90 is vacuously true on an empty map — exactly the case R2-23 isolated so it could not be dismissed as an artifact of a tiny set. The builder's fix closed cause 1 (substituted set) and left cause 2 untouched, while eval-harness.ts:5-12 now claims "a constant-output transport cannot manufacture coverage it did not have". Recommend the parent file this as its own finding.

PROCESS CAVEAT: mid-session I observed engine/src/grade-registry.ts's `>=` branch read once without `inDomain(t, actual)` and later with it, while `git diff` showed only my own edit — consistent with another agent concurrently mutating the same working tree (other agents' probe files are present in the shared scratchpad). Every result above was taken with `git diff` verified to contain only my single intended mutation, and the final clean-HEAD gate run reproduces baseline exactly, so I do not believe any of the four results is confounded; flagging it so the parent knows concurrent mutation testing on one tree is happening.


### C2 · 3 data-lie · redactValue silently destroys or mislabels trace payloads in five common shapes — including writing the literal '[redacted]' where nothing was ever redacted

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** redact.ts:52-53: 'Deep-redacts a value destined for a trace sink. Structure is preserved so a trace stays useful.' Law 11 makes the trace the operator's only record of a decision.

**Reproduction:** All five executed through redactValue with a live secrets array, and shape (b) also end-to-end through llm() (p2 case 23).

**Observed:** Executed. (a) Map/Set/Date/Error all serialise to `{}` — `redactValue(new Map([['k',v]]))` -> {}, `new Date(0)` -> {} (JSON '{}' rather than an ISO string), `{e: new Error('...')}` -> {"e":{}}. The payload is gone with no marker. (b) A JSON.parse'd `__proto__` own-key is DROPPED from the trace and installed as the output object's prototype instead: input `{"__proto__":{"stolen":"<secret>"}}` -> `JSON.stringify(out)` is `{}` while `out.stolen` is '[redacted]'; with a sibling key, `{"__proto__":{...},"normal":"keep"}` -> `{"normal":"keep"}`, Object.keys = ['normal'], and getPrototypeOf(out) !== Object.prototype. Reachable end-to-end (p2 case 23) via any transport that JSON.parses a provider/proxy response — JSON.parse is the standard way to create an own `__proto__` property. No secret escapes (the value is redacted before assignment, and `out` is a fresh literal so Object.prototype is not touched globally) — the harm is that the one field a reviewer would most want to see is the one silently deleted, on an object then handed across the sink boundary with an attacker-chosen prototype. (c) A single enumerable getter that throws collapses the ENTIRE object to the string '[redacted]' — I lost a 2-key object to one hostile field. (d) Depth > 8 returns the literal '[redacted]', indistinguishable from a real redaction: an operator reading a truncated trace concludes a secret was present when none was. (e) Symbol-keyed values are dropped (no leak; noted for completeness). NOT filed as findings, stated for the record: a secret split across two sibling fields is not redacted (`{a: S.slice(0,17), b: S.slice(17)}` came back verbatim) — that is inherent to substring matching and requires deliberate mangling; and redactValue only knows the gateway key, so a client OAuth token pasted into `input` reaches the trace unscrubbed — R2-14's own text already scoped that out and it needs the shape-based scan scan-lib already has.

**Independent verifier:** CONFIRMED — reproduced from scratch by execution, both in isolation and end-to-end through the real `llm()` path. Severity 3 stands.

WHAT I RAN
Two throwaway vitest probes under the scratchpad (never in the repo): one calling `redactValue` directly from /home/user/New-skills-/fullburn/engine/src/redact.ts with `secrets=[CANARY_SECRET]`, one driving the real `llm()` in /home/user/New-skills-/fullburn/engine/src/gateway.ts with the real `ROLE_BINDINGS`, real frozen caps table, real vault and `MemoryTraceSink` via `makeDeps()`. Also `npm test` (14 files / 148 tests green) and `git status --porcelain` (empty, before and after).

WHAT I SAW — end-to-end through llm(), reading sink.events[0] directly:
(b) `__proto__` — transport returns `JSON.parse('{"greeting":"ok","__proto__":{"debugAuth":"Bearer <SECRET>"}}')`. Emitted `event.output` is `{"greeting":"ok"}`; `Object.keys` = ['greeting']; `event.output.debugAuth` === 'Bearer [redacted]'; `Object.getPrototypeOf(event.output) !== Object.prototype`. The attacker-chosen field is deleted from the audit record and reinstalled as the prototype of the object handed across the sink boundary. Confirmed independently: no secret escapes (`JSON.stringify(sink.events).includes(SECRET)` === false) and no global pollution (`({}).debugAuth` === undefined). Reachable because `await res.json()` is JSON.parse — the standard way to mint an own `__proto__` key.
(d) depth>8 — a 10-deep provider payload containing NO secret anywhere (verified: `JSON.stringify(transport.response).includes(SECRET)` === false) emits `...{"nested":"[redacted]"}`. The trace asserts a redaction that never happened. This is the literal data-lie and the strongest component.
(c) throwing getter — a provider body `{greeting:"ok", conversionValueUsd:9999, decision:"promote"}` plus one enumerable getter that throws emits `event.output === "[redacted]"` — the entire string, not an object. A whole decision payload destroyed by one hostile field, and mislabelled as a redaction.
(a) toJSON loss — `input:{windowStart:new Date("2026-08-01T00:00:00Z"), note:"attribution window"}` emits `{"windowStart":{},"note":"attribution window"}`. Plain `JSON.stringify(new Date(0))` yields `"1970-01-01T00:00:00.000Z"`, so `redactValue` actively destroys data the sink would otherwise have kept: rebuilding via `Object.keys` bypasses `toJSON`.

WHY IT IS A REAL VIOLATION, NOT A STYLE OPINION
It contradicts the function's own docstring at redact.ts:52-53 ("Structure is preserved so a trace stays useful") and ENGINE_BUILD.md Law 11 ("Every agent decision is traced in Langfuse. Untraced decisions are treated as bugs"), which makes the trace the operator's audit record. It is newly introduced by the r2 fix: `git show df95668:engine/src/redact.ts` contains zero occurrences of `redactValue` — the function is new in 7a8067e. It is not disclosed anywhere in LIVE_VERIFICATION_LEDGER.md L1-L13 (I read all thirteen; none covers trace-payload fidelity) and is not deferred by the spec. It is untested: the only `redactValue` test, hardening.test.ts:165 "trace payloads are redacted, not just error messages", asserts non-leakage plus `toContain("[redacted]")` — nothing asserts fidelity, so a `[redacted]` written over innocuous data satisfies it. The builder was prototype-aware elsewhere (gateway.ts:118/120/123 use `ownEntry` precisely to avoid prototype lookups) and missed the write side in redact.ts:66.

CORRECTIONS TO THE CLAIMANT
Shape (a) is overstated as filed. Map, Set and a nested Error serialise to `{}` under plain `JSON.stringify` too (I ran the baselines: Map -> {}, {e:new Error()} -> {"e":{}}) — for a JSON sink `redactValue` is not the cause of loss there, so those three are not defects on their own. The genuine sub-case is `toJSON`-bearing objects, chiefly Date, which the claimant did name correctly. Shape (e) (symbol keys) is not a defect at all — `JSON.stringify` drops them identically; the claimant conceded this and it should not be counted. The claimant's "no secret escapes" caveat on (b) is accurate and I verified it myself rather than taking it.

SEVERITY
3 is correct. No money loss, no ban risk, no cross-tenant read, no credential escape — the harm is confined to corrupting the record Law 11 mandates: fields silently deleted (b), whole decision payloads destroyed (c), and a false "[redacted]" claim written where nothing was redacted (d). That is a lie in the audit record, which is rung 3, not rung 5.


### H-03 · data-lie · The Class-2 fix moved authority from CLASS2_FILES to isClass2() but left the lock tests asserting the demoted list — 7 of 13 CLASS2_PATTERNS have no test, including the money-path sources, the gate scripts, .github/, the Laws, and the adversary's own mandate file

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** Law 15 / §13 Class 2; ENGINE_BUILD.md §10.2; .claude/agents/engine-adversary.md line 45

**Reproduction:** In the clone, neuter one CLASS2_PATTERN at a time (replace with /^__never__$/) and run the full suite. Then drive the real isClass2 export over the affected paths.

**Observed:** CLASS2_PATTERN sweep, full suite after each:
  GREEN  /^fullburn\/CLAUDE\.md$/            GREEN  /^fullburn\/ENGINE_BUILD\.md$/
  GREEN  /^fullburn\/\.claude\//             GREEN  /^fullburn\/engine\/src\/(gateway|spend-meter|grade-registry|vault|tracing|redact|eval-harness)\.ts$/
  GREEN  /^\.github\//                       GREEN  /^fullburn\/engine\/scripts\//
  GREEN  /^fullburn\/vitest\.config\.ts$/    GREEN  /^fullburn\/engine\/evals\//
  RED    config/src/ · package.json · tsconfig · PHASE · (config|engine)/test/
Driving the real isClass2 with the engine/src pattern removed:
  class1 fullburn/engine/src/gateway.ts   [still in CLASS2_FILES]
  class1 fullburn/engine/src/spend-meter.ts   [still in CLASS2_FILES]
  class1 fullburn/engine/src/grade-registry.ts   [still in CLASS2_FILES]
  class1 fullburn/engine/src/vault.ts   [still in CLASS2_FILES]
With the engine/scripts pattern removed: class1 fullburn/engine/scripts/gate-lib.mjs. With the three constitution patterns removed: class1 fullburn/CLAUDE.md, class1 fullburn/ENGINE_BUILD.md, class1 fullburn/.claude/agents/engine-adversary.md. Every one of these at 148/148 green.
Root cause: gate-lib.mjs:40-41 demotes CLASS2_FILES to 'Retained for callers/tests … isClass2 is the authority', but engine/test/adversary-phase0.test.ts:151-176 (the F5 lock block) and gates.test.ts:129-144 both assert `expect(CLASS2_FILES).toContain(p)` — the dead list. Only gates.test.ts:250 exercises isClass2, and only for the 7 paths the r2 findings named. The engine-adversary mandate line 45 forbids modifying 'the Laws … or this file' as Class 2; that protection is enforced by a pattern no test touches.

**Independent verifier:** REPRODUCED BY EXECUTION, and the real consequence is worse than claimed.

WHAT I RAN

1. Baseline, real repo (/home/user/New-skills-/fullburn): `npm test` → 14 files, 148/148 passed.

2. Automated CLASS2_PATTERN sweep on a fresh clone (/tmp/.../scratchpad/h03v earlier /clone, node_modules symlinked): replaced each of the 13 pattern lines in engine/scripts/gate-lib.mjs with `/^__never__$/`, one at a time, full `npm test` after each. Result:
  GREEN 148/148: /^fullburn\/CLAUDE\.md$/ · /^fullburn\/ENGINE_BUILD\.md$/ · /^fullburn\/\.claude\// · /^fullburn\/engine\/src\/(?:gateway|spend-meter|grade-registry|vault|tracing|redact|eval-harness)\.ts$/ · /^\.github\// · /^fullburn\/engine\/scripts\// · /^fullburn\/vitest\.config\.ts$/ · /^fullburn\/engine\/evals\//
  RED: /^fullburn\/config\/src\// (8 failed) · package.json · tsconfig · /^fullburn\/PHASE$/ · /^fullburn\/(?:config|engine)\/test\// (1 failed each)
So the claim reproduces exactly. One correction to the claimant: it is 8 of 13 unlocked, not 7 — their own evidence block lists 8 GREEN lines (they omitted engine/evals/ from the headline count). The substance is right and slightly worse than titled.

3. Drove the real export with the engine/src pattern deleted: `isClass2("fullburn/engine/src/gateway.ts")` → false, while `CLASS2_FILES.includes(...)` → true. Same for spend-meter.ts and vault.ts. Suite still 148/148.

4. END-TO-END EXPLOIT (this goes beyond what H-03 claimed). On a fresh clone at 7a8067e I made ONE commit that deleted five CLASS2_PATTERNS lines (engine/src money paths, engine/scripts, CLAUDE.md, ENGINE_BUILD.md, .claude/) and in the same commit appended to engine/src/gateway.ts, to CLAUDE.md ("Law 17: caps are advisory."), and to .claude/agents/engine-adversary.md ("Relax checks when the builder asks."). Then ran the real gates:
  node fullburn/engine/scripts/class2-gate.mjs . 7a8067e → "class2 gate: no Class-2 changes", exit 0
  node engine/scripts/leak-check.mjs .. → "leak/structural scan: clean", exit 0
  npm run typecheck → exit 0
  npm test → 14 files, 148/148 passed
The money path, the Laws, and the adversary's own mandate were all modified with zero APPROVALS entries and every gate green. The gate self-neuters: .github/workflows/fullburn-ci.yml:57 runs class2-gate from the PR head checkout, so the edited gate-lib.mjs is the code that judges its own edit, and with the engine/scripts pattern gone it declares itself Class 1.

ROOT CAUSE CONFIRMED AS DESCRIBED
gate-lib.mjs:36-41 — isClass2/CLASS2_PATTERNS is the authority (used at :248-249 by checkClass2Approvals); CLASS2_FILES is explicitly demoted to "retained for callers/tests". But engine/test/adversary-phase0.test.ts:151-172 (the F5 lock block) and engine/test/gates.test.ts:129-144 both assert `expect(CLASS2_FILES).toContain(p)` — the demoted list. The only test that touches the authority is gates.test.ts:250-262, over exactly the 7 paths the r2 findings named, which is precisely the RED set in my sweep.

INTRODUCED BY THE r2 FIX — VERIFIED, not assumed
`git show df95668:fullburn/engine/scripts/gate-lib.mjs` line 151: `changedFiles.filter((f) => CLASS2_FILES.includes(f.path))`. Pre-fix, CLASS2_FILES WAS the enforcement authority, so the `toContain` assertions were genuine locks. The r2 fix moved authority to the patterns and left the assertions aimed at a list nothing reads. The tests did not get weaker on paper; they got detached from the code.

SPEC VIOLATION
ENGINE_BUILD.md §10.1 step 4 (Phase B LOCK: every gap gets a deterministic test that fails before the fix and passes after) and §10.3. Law 15/§13 Class 2 (Laws, money paths, the grader, the improvement loop are human-only) and .claude/agents/engine-adversary.md:45 ("You may NEVER modify the Grade Registry, its thresholds, the Laws, the improvement-loop code, or this file") are enforced solely by patterns no test exercises. Not disclosed in LIVE_VERIFICATION_LEDGER.md — L11 and L13 cover "who approved", not "what is protected"; this is a different hole.

SEVERITY CORRECTION
Claimant filed 3 (data lie). The unlocked patterns include fullburn/engine/src/gateway.ts and spend-meter.ts — the cap-check and spend-accounting code — and I demonstrated an unapproved edit to gateway.ts landing with all gates green. Per the mandate's ranking that is 1, money loss (with a secondary 2/ban-risk and a constitutional-bypass dimension: the same commit rewrote the Laws and the adversary's mandate undetected). Not a style opinion, not a hypothesis: executed, exit codes and test counts above.

Repo left clean: `git status --porcelain` in /home/user/New-skills- returns empty; all mutation was done in clones under the scratchpad.


### H-04 · data-lie · R2-22's WeakSet is the only thing that makes an attestation unforgeable, and it has no test — removing one clause binds a model that scores 0.4 with 148 tests green

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** §2.4 'no pass, no bind'; Law 13; §12 Model-layer A-criterion; §10.2 (a fix must be tested by attempted breach)

**Reproduction:** In the clone, change `if (!(att instanceof EvalAttestation) || !GENUINE.has(att))` to `if (!(att instanceof EvalAttestation))` in config/src/models.ts. Run npm test. Then run: `const forged = Object.create(EvalAttestation.prototype); forged.role='genome-tagger'; forged.modelId='llama-70b'; forged.score=1.0; forged.total=5; forged.passed=5; forged.outcomes=[]; bindRole(ROLE_BINDINGS,'genome-tagger','llama-70b',forged)`.

**Observed:** CONTROL (shipped): instanceof EvalAttestation: true / refused: BindingError | bindRole requires an attestation from an executed eval run for "genome-tagger" — a literal is not evidence an eval ran (§2.4, Law 13)
MUTATED: instanceof EvalAttestation: true / >>> FORGED ATTESTATION BOUND: {"hello-world":"claude-sonnet","genome-tagger":"llama-70b","creative-decision-adversary":"claude-sonnet"} — with npm test at 148 passed / 0 failed, typecheck 0, leak-check clean.
llama-70b's real score against the genome-tagger golden set is 0.4 (engine/test/eval-rebind.test.ts:49-54). Removing the constructor's ATTESTATION_BRAND check separately is also green (148). Why nothing catches it: the only 'a literal does not bind' tests are config/test/adversary-phase0.test.ts:20-39 and config/test/models.test.ts:57-64, and every one passes a BARE NUMBER (42, -1, 1.0, NaN), which fails `instanceof` before the WeakSet is ever consulted. No test hands bindRole a correctly-shaped object.

**Independent verifier:** REPRODUCED BY EXECUTION. Verdict: REAL. Severity confirmed as data-lie (3) — no correction. One factual error in the claim, corrected below; it makes the finding worse, not weaker.

WHAT I RAN (all from a throwaway copy at scratchpad/clone, since deleted; /home/user/New-skills-/fullburn working tree verified clean before and after — `git status --porcelain .` = 0 lines).

1. BASELINE on shipped 7a8067e: `npm test` -> 14 files / 148 passed, 0 failed. `npm run typecheck` -> exit 0. `node engine/scripts/leak-check.mjs .` -> "leak/structural scan: clean", exit 0.

2. CONTROL (shipped code, probe at config/test/zz-probe.test.ts in the clone): built `const forged = Object.create(EvalAttestation.prototype)` with role='genome-tagger', modelId='llama-70b', score=1.0, total=5, passed=5, outcomes=[] and called `bindRole(ROLE_BINDINGS,'genome-tagger','llama-70b',forged)`.
   OBSERVED: `instanceof EvalAttestation: true` / `refused: BindingError | bindRole requires an attestation from an executed eval run for "genome-tagger" — a literal is not evidence an eval ran (§2.4, Law 13)`.
   This proves the claim's load-bearing premise: the forgery clears `instanceof`, so `GENUINE.has(att)` at config/src/models.ts:197 is the SOLE thing refusing it.

3. MUTATION (one-line revert): changed config/src/models.ts:197 from `if (!(att instanceof EvalAttestation) || !GENUINE.has(att)) {` to `if (!(att instanceof EvalAttestation)) {`.
   OBSERVED with the probe removed: `npm test` -> 14 files / 148 passed, 0 failed. `npm run typecheck` -> exit 0. leak-check -> clean. All three gates green with the guard gone.
   OBSERVED with the probe re-added: `instanceof EvalAttestation: true` / `>>> FORGED ATTESTATION BOUND: {"hello-world":"claude-sonnet","genome-tagger":"llama-70b","creative-decision-adversary":"claude-sonnet"}`.

4. GROUND TRUTH on the bound model: I computed it rather than trusting either party. `runEval(deps,'genome-tagger','llama-70b',GOLDEN,new RecordedTransport(RECORDED_LLAMA_70B),TEST_CLIENT)` returns `{"score":0.2,"passed":1,"total":5,"failures":["g1: field mismatch","g2: field mismatch","g4: field mismatch","g5: field mismatch"]}` against `evalThreshold` 0.8.
   CORRECTION TO THE CLAIM: the claimant wrote 0.4. The real score is 0.2 — the forged bind installs a model that fails its role by 4x, not 2x. The claimant's cited lines (engine/test/eval-rebind.test.ts:49-54) only assert `toBeLessThan(threshold)` and never print a number, which is presumably where 0.4 came from. The r2 report at reports/ADVERSARY_REPORT_phase0.r2.md:1183-1187 already records 0.2 and matches my run.

5. SECOND MUTATION (claim's secondary assertion, verified separately on a restored clone): deleted the `if (brand !== ATTESTATION_BRAND) { throw ... }` block from the EvalAttestation constructor (config/src/models.ts:151-153). `npm test` -> 148 passed, `npm run typecheck` -> exit 0. Confirmed green. Note the honest scope: with the WeakSet intact this layer is not independently exploitable (a directly-constructed instance is still not in GENUINE), so it is an unlocked defense-in-depth layer, not a second exploit. The WeakSet clause alone is the whole breach.

WHY NOTHING CATCHES IT — verified, not assumed. I enumerated every `bindRole(` call site in the suite (12 total): config/test/models.test.ts:47,53,59,61,73,77; config/test/adversary-phase0.test.ts:23,27,38; engine/test/eval-rebind.test.ts:37,53. Every negative case passes a BARE NUMBER (`forced(42)`, `forced(-1)`, `forced(1.0)`, `Number.NaN`, `1`), all of which fail `instanceof` and short-circuit before the WeakSet is ever consulted. Every other call site passes a genuine `attestEvalRun` product. Zero tests exercise the `GENUINE.has` clause. `grep` for `Object.create` across all non-node_modules .ts/.mjs returns nothing. The claim is exact on this point.

WHY IT IS A SPEC VIOLATION, NOT A STYLE OPINION.
- The engine-adversary mandate, Phase B rule 1: "For every gap found, write a deterministic automated test that reproduces it... The test must fail against the pre-fix code and pass after." R2-22's pre-fix defect was "a correctly-shaped hand-written object binds." No test in the suite reproduces that. The fix shipped without its lock.
- This is the identical defect class the builder already accepted and fixed as R2-26, whose own test comment (config/test/models.test.ts:28-31) reads: "the F11 fix was the pairing check, but its lock test passed for a different reason (completeness), so deleting the pairing loop left the suite green." Same failure mode, same commit, one guard over. Consistency requires the same verdict.
- Exploited, it violates §12's Model-layer A-criterion verbatim: "Every bound model >= its role's eval threshold." A 0.2 model sits in genome-tagger while the Grade Registry keeps publishing A — a grade the evidence does not support. That is severity 3, data lies ("numbers a client could see that the warehouse doesn't support"), which is exactly where the claimant put it. Not severity 1: Phase 0 has no live spend path off this role and Law 4 keeps money on deterministic rules. Not severity 2: no platform write surface is involved.

NOT EXCUSED BY THE LEDGER. I checked L12 (reports/LIVE_VERIFICATION_LEDGER.md:24) specifically, since the code comment at models.ts:137-141 points there. L12 discloses a DIFFERENT gap — that any in-repo module importing the factory can legitimately call it, i.e. no cryptographic provenance. It says nothing about the guard being untested. Worse, L12 makes the affirmative claim that attestEvalRun "mints an unforgeable branded object, so a literal no longer binds (R2-22)". My mutation shows that unforgeability is one deleted clause deep with 148/148 still green, so L12 is currently asserting more assurance than the suite defends. The disclosure does not cover the finding; it is partly undermined by it.

NOT DEFERRED. R2-22 is a Phase 0 finding fixed in this commit, and the Phase B lock obligation attaches now.

RESIDUAL DOUBT: none on reproduction. The one thing I want on record is scope — the SHIPPED code behaves correctly and refuses the forgery (step 2). This is a lock/coverage defect: the guard works but is undefended against a one-line revert, which is precisely the standard §10 and the adversary mandate set. Anyone reading the finding should not conclude that 7a8067e as shipped binds unevaluated models. It does not.


### H-05 · data-lie · R2-23's golden-set coverage checks — in both attestEvalRun and runEval — have no test; disabling either lets a one-case fabricated run score 1.0

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** §2.4 eval-gated swaps; §11 Phase 0 AC 2; §12 Model-layer

**Reproduction:** Clone. (a) config/src/models.ts: replace `if (expected.length !== actual.length || expected.some((id,i)=>id!==actual[i]))` with `if (outcomes.length < 0)`. (b) engine/src/eval-harness.ts: replace `if (supplied.length !== expected.length || expected.some((id,i)=>id!==supplied[i]))` with `if (goldenSet.length < 0)`. Run npm test after each.

**Observed:** P9 attestEvalRun coverage check disabled -> exit=0 passed=148 failed=0 :: GREEN
P11 runEval declared-set check disabled -> exit=0 passed=148 failed=0 :: GREEN
P10 duplicate-case-id check removed -> exit=0 passed=148 failed=0 :: GREEN
On shipped code the check bites (`eval run does not cover role "genome-tagger"'s declared golden set (expected g1,g2,g3,g4,g5; got made-up)`), so the fix is real — it is simply undefended. The reason no test catches it: config/test/models.test.ts:16-21's `att()` helper always builds outcomes FROM GOLDEN_SET_CASE_IDS[role], so it can never violate coverage; eval-rebind.test.ts always passes the real GOLDEN set. The only near-miss, 'an empty golden set is refused', is caught by the separate length-0 guard.

**Independent verifier:** REPRODUCED BY EXECUTION in a throwaway copy (/tmp/.../scratchpad/h05); real tree left clean (git status empty, 148/148 green).

Baseline h05: npm test = 14 files / 148 passed; npm run typecheck exit 0; node engine/scripts/leak-check.mjs . = "leak/structural scan: clean".

(A) config/src/models.ts:182 `if (expected.length !== actual.length || expected.some(...))` -> `if (outcomes.length < 0)`: npm test = 148 passed, typecheck exit 0, leak-check clean. Exploit confirmed: ground truth runEval(genome-tagger, llama-70b, GOLDEN, RECORDED_LLAMA_70B) = score 0.2 / total 5 / passed 1 against threshold 0.8; with the mutation attestEvalRun("genome-tagger","llama-70b",[{caseId:"made-up",passed:true}]) minted score=1 total=1 and bindRole returned {"hello-world":"claude-sonnet","genome-tagger":"llama-70b","creative-decision-adversary":"claude-sonnet"}. Restored file -> same probe: MINT REFUSED: `eval run does not cover role "genome-tagger"'s declared golden set (expected g1,g2,g3,g4,g5; got made-up)`. So the shipped guard works and nothing in the suite locks it.

(B) engine/src/eval-harness.ts:72 -> `if (goldenSet.length < 0)`: npm test = 148 passed, typecheck clean. Untested, confirmed. BUT the claimant's consequence is WRONG for this half: I ran both original R2-23 constructions through the mutated runEval and both were refused by the attestEvalRun backstop ("RUNEVAL REFUSED: eval run does not cover ... got g1" and "... got s0,s1,s10,..."). Disabling the runEval half alone does NOT produce a fabricated 1.0 or a bind; only the attestEvalRun half is exploitable.

(C) Removing the duplicate-case-id line (models.ts:179): npm test = 148 passed — but not exploitable. With it removed, dup-padded outcome lists were still refused by the coverage comparison ("got g1,g1,g2,g3,g4" and "got g1,g1,g2,g3,g4,g5"), i.e. the dup check is subsumed by the coverage check. P10 is a redundant-guard observation, not a hole.

Coverage claim verified: grep over all .ts/.mjs finds no test asserting /does not cover/, /does not match the ids/, or /repeats a case id/. models.test.ts:16-21's att() helper builds outcomes FROM GOLDEN_SET_CASE_IDS[role] so it structurally cannot violate coverage; eval-rebind.test.ts always passes the real GOLDEN; the 'empty golden set' near-miss is caught by the separate length-0 guard at eval-harness.ts:64. This is a direct Phase-B LOCK violation ("the test must fail against the pre-fix code and pass after") for the R2-23 fix.

SEVERITY CORRECTED 3 -> 5. The previous report set this calibration itself: R2-33 ("hardening this commit advertises has zero test coverage") was explicitly corrected from 3 down to 5 — "the hardening genuinely works... no false number is produced, so this is not a data lie; it is a build-protocol/Phase-B LOCK gap, and rung 5 is the honest floor"; R2-34 (untested, silently relaxable market guard) sits in S5 as well. Shipped code here emits no false number via this path — I verified the guard bites. Practical priority is above the rung (same caveat R2-33 carried) because the unlocked guard is the eval gate deciding which model holds creative-decision-adversary, a §5.2 pre-write role. Partial compensating control: both files are in CLASS2_FILES (gate-lib.mjs:49,59) so a PR touching them needs an approval doc — though ledger L11/L13 record that this proves what was approved, not who, and branch protection is not yet enabled. Not disclosed by any ledger entry (L2 = placeholder outputs, L3 = Langfuse push, L12 = in-process attestation ceiling); none covers test coverage of these guards.

ADJACENT LIVE DEFECT found while reproducing (NOT H-05, for the parent's queue, severity 3): R2-23's second cause is still open on SHIPPED code. runEval checks case ids but not that a case asserts anything — passing the real GOLDEN ids with `expected: {}` returned {"score":1,"total":5,"passed":5,"failures":[]} on unmutated code and bindRole BOUND llama-70b to genome-tagger. Root: `Object.entries(gcase.expected).every(...)` at eval-harness.ts:90 is vacuously true on an empty map.


### H-06 · data-lie · F6's own-property guard in computeGrades has no test — with it removed, a polluted prototype makes an EMPTY snapshot grade security-isolation "A" and enforcement drops from 3 actions to 0, at 148 green

**Spec:** Law 14; §12 (registry is the enforced invariant); §10.2

**Reproduction:** Clone: in engine/src/grade-registry.ts replace `Object.hasOwn(snapshot, areaDef.area)` with `true`. npm test -> 148 green. Then: `Object.prototype['security-isolation'] = {cross_tenant_events:0, bot_filtration_pct:99, wp_credentials_admin_wide:false, token_leaks:0}; computeGrades({})`.

**Observed:** CONTROL (shipped): security-isolation from an EMPTY snapshot -> {"area":"security-isolation","grade":"BELOW_A","failing":[],"missing":["cross_tenant_events","bot_filtration_pct","wp_credentials_admin_wide","token_leaks"]} / enforcement actions: 3
MUTATED: security-isolation from an EMPTY snapshot -> {"area":"security-isolation","grade":"A","failing":[],"missing":[]} / enforcement actions: 0
npm test on the mutated tree: 148 passed, 0 failed. The existing F6 test (engine/test/adversary-phase0.test.ts 'a polluted prototype must not forge an A out of an empty snapshot') goes red only for the SEPARATE missing-metrics-fail-closed clause — I confirmed that by mutating that clause instead, which does go red across 3 tests. So the own-property guard, which is what the fix comment at grade-registry.ts:57-59 names, is carried by no assertion. Law 14: below-A must freeze autonomy and alert the human; here it freezes nothing.

**Independent verifier:** REPRODUCED BY EXECUTION. Verdict: real, but the claimed severity is wrong.

WHAT I RAN
Baseline, real repo at /home/user/New-skills-/fullburn (HEAD 7a8067e, tree clean): `npm test` -> 148 passed / 14 files; `npm run typecheck` -> clean; `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean". I then `cp -a` the whole tree to the scratchpad (.../scratchpad/mut) and did every mutation there. The real working tree was never modified — re-confirmed `git status --porcelain` empty and HEAD still 7a8067e at the end.

CONTROL (shipped code, clone, probe test importing engine/src/grade-registry.ts directly)
With `Object.prototype['security-isolation'] = {cross_tenant_events:0, bot_filtration_pct:99, wp_credentials_admin_wide:false, token_leaks:0}` and `computeGrades({})`:
  {"area":"security-isolation","grade":"BELOW_A","failing":[],"missing":["cross_tenant_events","bot_filtration_pct","wp_credentials_admin_wide","token_leaks"]}
  enforcement(): 24 actions total, 3 for security-isolation. A-graded areas: [].

MUTATED (`Object.hasOwn(snapshot, areaDef.area)` -> `true` at /home/user/New-skills-/fullburn/engine/src/grade-registry.ts:61)
  {"area":"security-isolation","grade":"A","failing":[],"missing":[]}
  enforcement(): 18 actions, 0 for security-isolation. A-graded areas: ["data-truth","security-isolation"].
Full gate on the mutated tree: `npm test` -> 148 passed, 0 failed; `npm run typecheck` -> clean; leak-check -> clean. Exactly as claimed.

SHARPER THAN THE CLAIM — I restored the LITERAL pre-F6 source line
`git show 39324eb:fullburn/engine/src/grade-registry.ts` shows the pre-F6 body was `const metrics = snapshot[areaDef.area];`. I pasted that exact line back into the clone (leaving the F6 fix comment above it in place). Result: the F6 regression test itself, `engine/test/adversary-phase0.test.ts:176` "a polluted prototype must not forge an A out of an empty snapshot", PASSES, and the suite is 148 green. So the test filed to lock F6 does not fail against the code F6 was filed against — a direct violation of §10.1 step 4 and the adversary mandate's Phase B step 1 ("must fail against the pre-fix code and pass after"). CI cannot distinguish F6-fixed from F6-unfixed.

ROOT CAUSE, CONFIRMED
The F6 test pollutes only `stripe_warehouse_drift_pct` for area "data-truth", but config/src/grade-thresholds.ts:59-65 gives data-truth TWO metrics (`incrementality_gap_stated` was added by the R2-21 fix). The second stays missing, so `missing.length === 0` fails and the assertion is satisfied by the fail-closed clause, never by the own-property guard. I confirmed the claimant's corroborating mutation: keeping the guard and changing line 72 to `failing.length === 0 ? "A" : "BELOW_A"` -> 3 failed / 145 passed (the F6 test plus "missing metrics are BELOW_A, never assumed fine" and "an entirely absent area is BELOW_A"). The F6 test is red only for a clause two other tests already cover.

THIS IS NOT ALREADY DISCLOSED — AND IT FALSIFIES THE PRIOR REPORT
LIVE_VERIFICATION_LEDGER.md L1-L13 contains nothing on this. Worse, ADVERSARY_REPORT_phase0.r2.md R2-33(c) explicitly asserts: "Prototype-pollution coverage does exist elsewhere (switchboard.test.ts:26, adversary-phase0.test.ts:175 for F6), which makes eval-harness the one guard left unlocked." That sentence is false by execution — adversary-phase0.test.ts:175 locks nothing, and eval-harness was not the only unlocked guard. The r2 disposition table (line 1767) also declares F6 "CLOSED", justified by re-attacking the shipped behaviour, which does not speak to the lock. The narrowed R2-33 scope plausibly left this guard unlocked on purpose.

WHY SEVERITY 3 IS WRONG
The shipped code is genuinely correct — I attacked it seven ways and it held: empty object, `null`, `[]`, `Object.create(null)`, a `JSON.parse('{"__proto__":{...}}')` snapshot carrying `__proto__` as an own key, and metric-level pollution against a present-but-empty area, all -> BELOW_A with 4 missing; positive control with a real full snapshot -> A (so the guard is not over-blocking either). No false grade is produced today, so no client-visible number is wrong and Law 14 currently freezes exactly what it should. `grep` for consumers shows the only reference outside the module and its tests is a passthrough re-export at engine/src/index.ts:5 — nothing carries the grade to a human yet. The defect is that CI cannot see a regression, not that the engine lies. That is precisely the reasoning the r2 report itself applied when it corrected R2-33 — the identical defect class — "from the claimed 3 down to 5 ... All three pieces of hardening genuinely work ... It is a build-protocol/Phase-B LOCK gap, and rung 5 is the honest floor." Consistency demands the same rung here.

The claimed *consequence* text ("Law 14: below-A must freeze autonomy and alert the human; here it freezes nothing") is only true of the mutant, not of shipped code, and overstates the finding.

VERDICT: real = true. Genuine, previously unreported Phase-B LOCK gap at engine/src/grade-registry.ts:57-61, whose fix is a one-line test change (pollute a COMPLETE area payload, e.g. all four security-isolation metrics, so the assertion depends on the own-property guard alone). Severity 5, not 3. Note for the report: it also warrants a severity-5 honesty finding against ADVERSARY_REPORT_phase0.r2.md R2-33(c), which asserted a lock that execution shows does not exist.


### H-07 · data-lie · R2-20's finiteness guard has no test — dropping Number.isFinite makes +Infinity grade wordpress-seo "A", because two §12 metrics carry no domain bounds

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** Law 14; §12; adversary finding R2-20's own stated contract ('out-of-domain readings now fail closed')

**Reproduction:** Clone: in engine/src/grade-registry.ts change `return typeof actual === "number" && Number.isFinite(actual);` to `return typeof actual === "number";`. npm test. Then computeGrades with `{'wordpress-seo': {organic_clicks_vs_baseline_pct: Infinity, cwv_pass_rate_pct: 80, indexation_health_pct: 96, mutations_reversible_pct: 100, verdicts_before_window_close: 0}}`.

**Observed:** CONTROL: wordpress-seo with organic_clicks = +Infinity -> {"area":"wordpress-seo","grade":"BELOW_A","failing":["organic_clicks_vs_baseline_pct"],"missing":[]}
MUTATED: -> {"area":"wordpress-seo","grade":"A","failing":[],"missing":[]}   with npm test 148 passed / 0 failed.
The R2-20 lock test only exercises inDomain (mutating inDomain to always-true goes red); it never exercises isUsableReading. The mutation is only exploitable because grade-thresholds.ts:70 `organic_clicks_vs_baseline_pct` and :82 `client_screens` declare no domainMin/domainMax, so inDomain waves Infinity through. Both halves of the R2-20 fix are needed and only one is defended.

**Independent verifier:** REAL — reproduced from scratch by execution. Severity confirmed as data-lie (3); the claimed evidence is correct in its core but understates the blast radius and contains one wrong sub-claim.

WHAT I RAN (all from /home/user/New-skills-/fullburn; probes only under scratchpad/h07, never in the repo):
1. Baseline: `npm test` -> 148 passed / 14 files. `npm run typecheck` clean. `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean".
2. CONTROL probe (unmutated HEAD 7a8067e) driving computeGrades/enforcement from an all-A snapshot via `npx vitest run --root . --config /dev/null --dir <scratchpad>/h07`:
   wordpress-seo organic_clicks_vs_baseline_pct=+Infinity -> {"grade":"BELOW_A","failing":["organic_clicks_vs_baseline_pct"]} enforcement=3. Correct, fails closed.
3. MUTATION, exactly as the claimant specified — engine/src/grade-registry.ts:33 `return typeof actual === "number" && Number.isFinite(actual);` -> `return typeof actual === "number";`
   - `npm test` -> **148 passed / 0 failed**. `npm run typecheck` -> clean.
   - Same probe -> {"area":"wordpress-seo","grade":"A","failing":[],"missing":[]} **enforcement=0**.
   A one-line revert of a guard the file's own docstring calls the R2-20 fix restores a lying grade with the full suite green. That is precisely the Phase B rule in .claude/agents/engine-adversary.md ("The test must fail against the pre-fix code and pass after") not being met for half of the R2-20 fix.

4. ASYMMETRY confirmed. Mutating the other half instead — `inDomain` forced to `return true` — turns the R2-20 lock test red (1 failed / 147 passed, engine/test/grade-registry.test.ts:117 "out-of-domain readings fail CLOSED, not open (R2-20)"). So inDomain is locked; isUsableReading's finiteness is not. Reason: that test only uses `stripe_warehouse_drift_pct` (op "<", domainMin 0) and `red_button_drill_seconds` (domainMin 0) — both are caught by inDomain alone under the mutation, so it never exercises the finiteness branch.

BROADER THAN CLAIMED (found by sweeping every numeric metric under the mutation): the exploit is not confined to wordpress-seo. `marketing-engine.blended_roas` (config/src/grade-thresholds.ts:36, op ">=" 4, domainMin 0, no domainMax) also flips: blended_roas=+Infinity -> {"area":"marketing-engine","grade":"A","failing":[]} enforcement=0. domainMin alone does not stop +Infinity on a ">=" metric. That is the top §12 row and it is equally undefended.

ONE SUB-CLAIM IS WRONG: the claimant cites grade-thresholds.ts:82 `client_screens` as a second exploitable metric. It is not. Its op is "==" against 4, and Infinity !== 4, so it fails closed with or without the mutation — verified in both control and mutated runs: {"area":"dummy-proof","grade":"BELOW_A","failing":["client_screens"]}. The strict-equality ops (==, ==0, ==true) are immune, exactly as the original R2-20 write-up calibrated. NaN also still fails closed everywhere (it loses every comparison by accident), so the live gap is specifically **+Infinity on an unbounded-above ">=" metric**: organic_clicks_vs_baseline_pct (:70) and blended_roas (:36).

WHY IT VIOLATES THE SPEC/ITS OWN CLAIMS: grade-registry.ts:26-31 states out-of-domain readings "now fail closed into the enforcement path". Only one of the two mechanisms delivering that contract is regression-locked. Consequence if it regresses: computeGrades reports A, enforcement() returns [] — no STEP_DOWN_TRUST_LADDER, no HALT_AUTO_IMPROVEMENTS, no ALERT_HUMAN. Law 12/14 enforcement is silently suppressed by an impossible reading (an over-empty-denominator ratio out of ClickHouse/Stripe is the ordinary nightly path).

SEVERITY: keep 3 / data-lie, unchanged from the claimant. The direct consequence is a false published grade plus suppressed autonomy freezing, not a cap breach — no money moves off this number in Phase 0. I considered escalating because blended_roas is the money area, but the money-critical metrics themselves (cap_breaches, policy_strikes, cross_tenant_events, token_leaks, guarantee_exposure_within_cap) all use ==0/==true and remain immune, so 3 is the honest rank.

NOT already disclosed: reports/LIVE_VERIFICATION_LEDGER.md L1-L13 contains nothing about grade-registry finiteness or mutation coverage (L10-L13 cover vault encryption, repo protection, eval-attestation provenance, and approval authorship). Not deferred by ENGINE_BUILD.md §12 either.

Repo left clean: engine/src/grade-registry.ts restored from backup, `git status --porcelain` and `git diff --stat` both empty, final `npm test` 148 passed, typecheck clean, leak-check clean.


### H-08 · data-lie · The §10.2 self-check counts entries instead of identifying them — a live invariant (including Law 3 cross-tenant isolation) can be deleted and reclassified as "deferred to Phase 9" in one edit with the suite green; deferral phases can be falsified; and a gutted LIVE body still counts as coverage

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** §10.2 standing invariants; Law 3; adversary finding F13 and R2-25

**Reproduction:** Clone, engine/test/invariants/invariants.test.ts. (a) Delete the `it("LIVE — per-client isolation: cross-tenant secret read fails structurally (Law 3)", …)` block, add `{ invariant: "per-client isolation (Law 3)", applicableFromPhase: 9, reason: "deferred by an unreviewed edit — nobody notices" }` to NOT_YET_APPLICABLE, change "7 are live below" to "6 are live below" and `toHaveLength(7)` to `(8)`. Run npm test. (b) Change VERDICT.md's applicableFromPhase from 6 to 1. (c) Replace the Law-18 LIVE test body with `expect(true).toBe(true)`, keeping its title.

**Observed:** (a) full suite: Test Files 14 passed (14) / Tests 147 passed (147) — the Law 3 cross-tenant isolation invariant is gone from the checklist and nothing objects.
(b) Tests 10 passed (10) — the only assertion on applicableFromPhase is `> 0`.
(c) Tests 10 passed (10) — the self-check counts occurrences of `it("LIVE — `, so a vacuous body reads as coverage.
Control, confirming the half that IS fixed: deleting a §10.2 bullet from ENGINE_BUILD.md, renaming the §10.2 heading, and ADDING a bullet each make 'the checklist checks ITSELF against the spec (R2-25)' fail. The only cross-relation is `expect(live + NOT_YET_APPLICABLE.length).toBeGreaterThanOrEqual(bullets)` — 6+8 >= 12 holds. The file's own header states the standard this violates: 'an entry that asserts nothing is worse than an absent one, because it reads as coverage (adversary finding F13)'.

**Independent verifier:** REAL — reproduced by execution, with one sub-claim of the claimant's evidence corrected and one mitigation the claimant omitted.

Setup: copied the repo (minus .git/node_modules) to the scratchpad with node_modules symlinked. Baseline in the clone: `npm test` → Test Files 14 passed / Tests 148 passed, identical to the real repo. Real repo left clean (`git status --porcelain` empty, 148 green, leak-check clean).

(a) DELETING A LIVE INVARIANT — CONFIRMED, verbatim. In engine/test/invariants/invariants.test.ts I deleted the whole `it("LIVE — per-client isolation: cross-tenant secret read fails structurally (Law 3)", …)` block, inserted `{ invariant: "per-client isolation (Law 3)", applicableFromPhase: 9, reason: "deferred by an unreviewed edit — nobody notices" }` into NOT_YET_APPLICABLE, changed "7 are live below"→"6" and `toHaveLength(7)`→`(8)`. Result: `npm test` → Test Files 14 passed (14) / Tests 147 passed (147); `npm run typecheck` clean; `node engine/scripts/leak-check.mjs ..` → "leak/structural scan: clean"; `grep -c 'LIVE — per-client isolation'` → 0. Both self-checks pass: the live-count regex matches the doctored comment, and `live + NOT_YET_APPLICABLE.length >= bullets` is 6+8=14 ≥ 12 — a `>=`, so padding the deferral list always satisfies it. §11 of ENGINE_BUILD.md has no Phase 9 (it runs 0–8+ then SI); the fabricated phase is never checked against the phase plan.

(b) FALSIFYING THE DEFERRAL PHASE — CONFIRMED, both directions. `applicableFromPhase: 6 → 1` on the VERDICT.md entry → 148 passed. `6 → 99` → 148 passed. The only assertion is `toBeGreaterThan(0)`, and the `reason` string still reads "VERDICT.md is written in Phase 6" while the field says 99.

(c) GUTTED LIVE BODY — CLAIMANT'S EVIDENCE IS WRONG, THE SUBSTANCE HOLDS. The exact literal they used, `expect(true).toBe(true)`, does NOT pass the suite: the full run FAILS at engine/test/adversary-phase0.test.ts:265 (`expect(checklist).not.toMatch(/expect\(true\)\.toBe\(true\)/)`) → 1 failed | 147 passed. Their "Tests 10 passed (10)" came from running only the invariants file, which is not "the suite green" — that part of the report is not reproducible as written. However the guard is a literal-string regex and is trivially evaded: replacing the same Law-18 body with `expect(activeChannels().length).toBeGreaterThan(0);` — which would pass even if tiktok and google were live, i.e. asserts nothing about Law 18 — gives 14 passed / 148 passed, typecheck clean. So the claim "a gutted LIVE body still counts as coverage" is true; the specific repro they published is not.

CONTROL — the fix is real but one-directional. Deleting the "Per-client isolation: a seeded cross-tenant read attempt must fail (Law 3)" bullet from §10.2 of ENGINE_BUILD.md does fail: "the checklist checks ITSELF against the spec (R2-25)" → AssertionError: expected 11 to be 12. The new check pins the spec's bullet COUNT and the live-count arithmetic; it never pins the identity of any bullet, never maps a bullet to an entry, and never validates a phase number against §11.

REGRESSION FAILURE THE CLAIMANT DID NOT MENTION — the more serious half. Commit 7a8067e says "fix all 34 confirmed re-review findings" and the test carries the comment "(R2-25)". All three of R2-25's original sub-attacks still reproduce unchanged post-fix: (a) replacing the `VERDICT.md hash-locked at client-zero launch` entry with `{invariant: "an invariant nobody ever wrote down", …}` → 148 passed with `grep -c VERDICT invariants.test.ts` = 0; (b) phase 5→99 → 148 passed; (c) appending an 8th fabricated deferral and bumping only `toHaveLength(7)`→`(8)`, leaving the header reading "7 carry explicit deferral markers" → 148 passed with the comment now stating a false count. R2-25 is not closed; it is partially closed on the spec side only. The r2 report's own diagnosis — "the mechanism exists, works, and was applied to `it("LIVE — ` and never to NOT_YET_APPLICABLE; the asymmetry is the finding" — is still true after the fix.

MITIGATION THE CLAIMANT OMITTED, stated honestly. engine/test/invariants/invariants.test.ts is Class 2 (pattern `^fullburn/(?:config|engine)/test/`). I exercised the real gate: git repo with the (a) edit on a branch, `node fullburn/engine/scripts/class2-gate.mjs . master` → "CLASS-2 GATE FAIL: Class-2 changes without a matching human approval for this transition … invariants.test.ts (modified)", exit 1. So "one edit … nobody notices" overstates it — the edit requires an APPROVALS transition doc. But that does not dissolve the finding: the approval names only sha256 from-hash→to-hash plus an unvalidated free-text `Reason:` line, so the human sees no signal that a Law 3 live assertion vanished, while the one mechanism built to make coverage self-evident reports full green. Ledger L11 records that branch protection and required checks are not in place (gates advisory today) and L13 that an approval proves what, never who — neither discloses this defect, so it is not already-disclosed.

SEVERITY — claimant's "data-lie" is correct, keep it at 3. It is not client-visible, so not a strict "numbers a client could see", but it is the engine asserting coverage its evidence does not support to the adversary and the human, which is the same class of lie one level in. It is not itself an isolation break (4) — engine/test/vault.test.ts and hardening.test.ts still exercise the vault's cross-tenant refusal — it is the mechanism that would let an isolation break ship looking covered.


### H-09 · data-lie · R2-06's report-append-only half has no test — removing the rename clause lets a standing FAIL report be renamed out of existence while the gate prints "reports append-only holds"

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** Law 9; §10.3; engine-adversary.md line 41 (a FAIL blocks and cannot be overridden by the builder)

**Reproduction:** Clone: in gate-lib.mjs checkReportsAppendOnly, change the filter to `(f) => isReport(f.path) && f.status !== "added"`. npm test. Then call `checkReportsAppendOnly([{status:'renamed', oldPath:'fullburn/reports/ADVERSARY_REPORT_phase0.md', path:'fullburn/reports/old-notes.md'}])`.

**Observed:** P7 mutation -> exit=0 passed=148 failed=0 :: GREEN.
CONTROL (shipped): {"ok":false,"reason":"adversary reports are append-only; modified/deleted/renamed: fullburn/reports/ADVERSARY_REPORT_phase0.md"}
MUTATED: {"ok":true,"reason":"reports append-only holds"}
The class-2 half of R2-06 IS defended (removing the oldPath isClass2 push goes red, and parseNameStatus's rename handling is tested in hardening.test.ts:194). The report half is not: gates.test.ts:72-77 only drives status 'modified' and 'added'. This is the same shape as the false claim the r2 report identified as the reason C4 survived the first fix pass ('Report append-only — modified, deleted and renamed reports all blocked. CONFIRMED-COVERED'), reintroduced one layer down.

**Independent verifier:** REPRODUCED BY EXECUTION. Baseline: npm test 148/148, typecheck 0. Control: shipped checkReportsAppendOnly (engine/scripts/gate-lib.mjs:193-203) driven with {status:'renamed', oldPath:'fullburn/reports/ADVERSARY_REPORT_phase0.md', path:'fullburn/reports/old-notes.md'} returns {"ok":false,"reason":"adversary reports are append-only; modified/deleted/renamed: fullburn/reports/ADVERSARY_REPORT_phase0.md"} - shipped code is correct. P7 mutation (line 196 -> `(f) => isReport(f.path) && f.status !== "added"`): npm test = Test Files 14 passed, Tests 148 passed, typecheck exit 0, ZERO tests fail; same probe now returns {"ok":true,"reason":"reports append-only holds"}. Confirmed end-to-end, not just at unit level: in a throwaway clone under the scratchpad I committed the mutation, planted a standing FAIL report bound to the current tree (adversary-gate exit 1, "an unresolved FAIL on this tree blocks regardless of any PASS"), then `git mv`d it to reports/old-notes.md and added a PASS report bound to the same hash (reports/ is excluded from TREE_SCOPE so the hash does not move). Gate output: "adversary report PASS and bound to the current tree" / "reports append-only holds" / exit 0 - a standing FAIL erased with the gate green. Feeding that same real diff (R100<TAB>...r3.md<TAB>...old-notes.md) through parseNameStatus into the SHIPPED lib returns ok:false, so the hole is purely the missing test. Coverage asymmetry confirmed by mutation in both directions: deleting the Class-2 rename clause (gate-lib.mjs:249) makes 1 test fail (gates.test.ts:202); deleting the report rename clause (gate-lib.mjs:196) makes 0 tests fail. grep -rn checkReportsAppendOnly finds exactly two test call sites, gates.test.ts:73 (status 'modified') and :75 (status 'added'); nothing anywhere drives 'renamed' or 'deleted' on a report path. hardening.test.ts:193-199 covers parseNameStatus's rename output, not the append-only consumer. Not disclosed: LIVE_VERIFICATION_LEDGER L1-L13 says nothing about this (L11/L13 are repo protection and approval authorship, different gaps), and §10.3/Law 9 are Phase 0, not deferred. SEVERITY CONFIRMED AT 3 (data-lie), neither raised nor lowered: no live hole exists today so it is not sev 1 or 2, but it sits above dummy-proof because the single unpinned clause is the one that lets a builder rename a blocking FAIL out of existence (engine-adversary.md line 41 - a FAIL cannot be overridden by the builder) while the gate prints the affirmative sentence "reports append-only holds", i.e. the system asserting a fact it no longer verifies. Same shape as confirmed r2 finding R2-07 (lock test covering only one of a finding's two named paths), and the r2 report itself identified an unbacked "renamed reports blocked - CONFIRMED-COVERED" claim as the reason C4 survived the first fix pass; that claim is now reintroduced one layer down. Repo left clean: final npm test 148/148, typecheck 0, leak-check clean, git status --porcelain empty; all probes under the scratchpad.


### H-10 · data-lie · F14's added-in-this-diff approval filter has no real test — its named test passes for a different reason, and removing the filter re-enables harvesting a pre-existing approval at 148 green

**Spec:** Law 2/14/15; §13 Class 2; adversary finding F14

**Reproduction:** Clone: in gate-lib.mjs checkClass2Approvals, change `.filter((d) => d.status === undefined || d.status === "added")` to `.filter(() => true)`. npm test. Then call checkClass2Approvals with a doc of status 'modified' carrying BOTH `from-content-hash: cafe01` and `content-hash: deadbeef`, against a modified caps.ts whose hashes match.

**Observed:** P4 mutation -> exit=0 passed=148 failed=0 :: GREEN.
CONTROL: {"ok":false,"reason":"Class-2 changes without a matching human approval for this transition (Law 2/14/15): fullburn/config/src/caps.ts (modified)"}
MUTATED: {"ok":true,"reason":"Class-2 changes carry transition approvals"}
Why the named test does not bite: gates.test.ts:158-166 'ATTACK: a pre-existing approval already in the tree is not harvested (F14)' supplies a stale doc containing only `content-hash: deadbeef` and NO from-content-hash, so with the status filter removed it still fails on the from-hash comparison (null !== 'cafe01'). The test is green because of R2-05's transition binding, not because of the F14 filter it names. That is precisely the 'a green test whose name states a property the code does not have' pattern the r2 report filed twice (R2-10, R2-26).

**Independent verifier:** REPRODUCED BY EXECUTION, but severity corrected 3 -> 5.

WHAT I RAN (repo /home/user/New-skills-/fullburn at 7a8067e; probes only under scratchpad; working tree verified clean at the end via `git -C /home/user/New-skills- status --porcelain` = empty).

1) Baseline `npm test`: 14 files, 148 passed.

2) Direct probe of checkClass2Approvals (scratchpad/probe-h10.mjs), UNMUTATED, with the claimant's exact fixture (doc status "modified", content `approves: fullburn/config/src/caps.ts` + `from-content-hash: cafe01` + `content-hash: deadbeef`; changedFiles [{status:"modified",path:caps}]; hashOf->deadbeef; baseHashOf->cafe01):
   -> {"ok":false,"reason":"Class-2 changes without a matching human approval for this transition (Law 2/14/15): fullburn/config/src/caps.ts (modified)"}  == claimed CONTROL.

3) Applied the one-line mutation at gate-lib.mjs:255, `.filter((d) => d.status === undefined || d.status === "added")` -> `.filter(() => true)`:
   - same probe -> {"ok":true,"reason":"Class-2 changes carry transition approvals"}  == claimed MUTATED.
   - `npm test` -> Test Files 14 passed, Tests 148 passed, 0 failed. `npm run typecheck` clean. `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean".
   So the added-in-this-diff filter is deletable at 148 green.

4) I independently confirmed WHY the named test does not bite, rather than taking the claimant's reading. I re-ran the gates.test.ts:158-166 fixture with the status flipped to "added" (filter fully satisfied): it STILL returns ok:false. The fixture carries no `from-content-hash` and the test passes no `baseHashOf`, so it dies on the transition comparison (null !== "unavailable"). The test is green because of R2-05's transition binding, not because of the F14 filter in its name. Claimant's analysis is correct.

5) Coverage gap is total: grep shows engine/scripts/class2-gate.mjs (the only production caller) is not imported or executed by any test.

WHY IT IS STILL A REAL FINDING: ADVERSARY_REPORT_phase0.r2.md:1775 books F14 CLOSED on the grounds that "The `status === "added"` filter does what it claims," and gates.test.ts:158 is the test named "(F14)" that is supposed to hold it. It holds nothing. That is the same "green test whose name states a property the code does not have" pattern the r2 report filed as R2-10/R2-26, and it violates the mandate's Phase B rule that every acceptance criterion be encoded as a permanent test.

TWO CORRECTIONS TO THE CLAIMANT'S FRAMING (from a 4-way mutation matrix I ran against the REAL class2-gate.mjs in a throwaway clone, on a genuine attacker branch: caps.ts modified + a stale APPROVALS/old.md EDITED to name the exact new transition):
   control -> CLASS-2 GATE FAIL
   lib filter removed only -> CLASS-2 GATE FAIL   (class2-gate.mjs:27 independently filters f.status === "added")
   caller filter removed only -> CLASS-2 GATE FAIL (the lib filter catches it)
   BOTH removed -> "class2 gate: Class-2 changes carry transition approvals"  <- hole open
 (a) The title's claim that removing the filter "re-enables harvesting a pre-existing approval" is true of the library function in isolation only. Through the SHIPPED gate it is not: two independent one-line reverts are required, not one. The lib filter is genuine defense-in-depth, not dead code, and not a single point of failure.
 (b) A genuinely untouched pre-existing approval file can never be harvested under any filter setting, because the caller only builds approvalDocs from files present in the diff. The filter's real job is narrower than the F14 headline: rejecting an approval doc EDITED in this diff (git status M).

SEVERITY: claimant said data-lie (3). Corrected to dummy-proof/honesty (5). Runtime behaviour is correct today — the real gate refuses the attack in every single-mutation configuration; there is no money loss, no ban risk, no client-visible number, no tenant exposure. This is a coverage + test-name-honesty defect. The project's own calibration is decisive: R2-26 is the structurally identical finding (a fix removable at green whose lock test passes for a different reason) and the r2 adversary filed it [A5-honesty] with the explicit reasoning "This is a coverage defect, not a behaviour defect, and there is no money or ban exposure today." The claimant also cites R2-10 as precedent, but R2-10 was a live behaviour defect (fresh FAIL not blocking) — the wrong twin. Defense-in-depth argues for 5 or lower, not 3.

NOT already disclosed: ledger L11 and L13 cover only WHO authored an approval (CODEOWNERS/H19) and repo protection; neither covers the untested added-in-this-diff filter.


### H-11 · data-lie · R2-31's fail-closed hash sentinel has no test — changing "unavailable" to "deleted" lets an approval reading deleted/deleted authorize a modification

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** Law 2/14/15; §13; adversary finding R2-31

**Reproduction:** Clone: in gate-lib.mjs safeHash, change `if (typeof fn !== "function") return "unavailable";` to `return "deleted";`. npm test. Then call checkClass2Approvals with hashOf and baseHashOf both undefined and an approval doc reading `approves: fullburn/config/src/caps.ts / from-content-hash: deleted / content-hash: deleted` against `{status:'modified', path:'fullburn/config/src/caps.ts'}`.

**Observed:** P8 mutation -> exit=0 passed=148 failed=0 :: GREEN.
CONTROL: {"ok":false,"reason":"Class-2 changes without a matching human approval for this transition (Law 2/14/15): fullburn/config/src/caps.ts (modified)"}
MUTATED: {"ok":true,"reason":"Class-2 changes carry transition approvals"}
gates.test.ts:213-223 covers only the throwing-hashOf path (which safeHash's catch maps to 'deleted' by design); the typeof-guard branch, whose whole purpose is to return a sentinel no approval can name, is untested. The distinction between the two sentinels is load-bearing and undefended.

**Independent verifier:** REPRODUCED IN FULL, from a clean clone, by execution. Corrected severity: 5 (dummy-proof / regression-durability), NOT 3 (data-lie).

WHAT I RAN
Baseline, /home/user/New-skills-/fullburn @ 7a8067e: `npm test` -> 14 files, 148 passed.
Tarred the tree (excluding node_modules) to scratchpad/fb, re-ran `npm test` -> 148 passed (clone is faithful).
Applied the single-line mutation in scratchpad/fb/engine/scripts/gate-lib.mjs:279
  `if (typeof fn !== "function") return "unavailable";`  ->  `... return "deleted";`
`npm test` -> Test Files 14 passed (14), Tests 148 passed (148). MUTATION SURVIVES, SUITE GREEN.

Behavioural probe (scratchpad/probe.mjs), importing each gate-lib.mjs directly and calling
checkClass2Approvals with changedFiles [{status:"modified", path:"fullburn/config/src/caps.ts"}],
hashOf undefined, baseHashOf undefined, and one added approval doc reading
`approves: fullburn/config/src/caps.ts / from-content-hash: deleted / content-hash: deleted`:
  CONTROL (shipped): {"ok":false,"reason":"Class-2 changes without a matching human approval for this transition (Law 2/14/15): fullburn/config/src/caps.ts (modified)"}
  MUTATED:           {"ok":true,"reason":"Class-2 changes carry transition approvals"}
Byte-identical to the claimant's evidence.

WHY IT IS REAL
1. Coverage claim confirmed by reading /home/user/New-skills-/fullburn/engine/test/gates.test.ts. The R2-31 test ("ATTACK: deleting a Class-2 file needs approval and does not crash the gate") supplies a THROWING hashOf plus a real baseHashOf, so it exercises safeHash's catch, never the typeof guard. Three earlier class-2 tests do reach the typeof guard (they omit baseHashOf entirely), but none asserts anything about the sentinel's value — which is exactly why the mutant lives.
2. The distinction is genuinely load-bearing, and I proved it with real git rather than asserting it. In scratchpad/live (a real `git clone` of the repo) I authored a legitimate human deletion approval — `from-content-hash: <sha256 of caps.ts at base> / content-hash: deleted` — and ran `node fullburn/engine/scripts/class2-gate.mjs . 7a8067e`. Output: `class2 gate: Class-2 changes carry transition approvals`, EXIT=0. So "deleted" is a token humans legitimately write into approvals and the shipped gate accepts; "unavailable" is not. They are not interchangeable, and nothing in the suite pins that.
3. This is squarely the failure class the review brief names: a fix defeated by a one-line change with the suite still green. ENGINE_BUILD.md §10.1 step 4 requires, for every gap, a deterministic test that fails before the fix and passes after. safeHash's typeof branch — added by the r2 fix, whose entire stated purpose (gate-lib.mjs:275-277) is "a sentinel no approval will match" — has no such test.
4. Not already disclosed: LIVE_VERIFICATION_LEDGER L1..L13 covers only CODEOWNERS/who-approved (L11, L13). Nothing about sentinel coverage. Not deferred by the spec. Not a style opinion.

WHY SEVERITY 3 IS WRONG
Nothing here produces a false client-visible number, a broken revenue join, or a warehouse-unsupported claim, so "data-lie" does not apply. The failure mode is an unapproved Class-2 change being admitted; Class-2 covers config/src/caps.ts, so the theoretical ceiling is money (1). But I confirmed the shipped code fails CLOSED today, and the typeof branch is unreachable from the only shipping caller — class2-gate.mjs:35-38 always passes both hashOf and baseHashOf as functions — so exploiting the mutant requires a second, independent defect (a caller dropping an argument). The r2 report ranked parent finding R2-31 at 5 on precisely this "it fails closed" reasoning; the same reasoning binds here. What is missing is the test that keeps it failing closed, not a live bypass. That is severity 5.

SECONDARY OBSERVATION (reproduced, but I am NOT escalating it — it is downstream-blocked)
safeHash's CATCH branch already returns "deleted", a token in the human approval vocabulary, and that collision is reachable in shipped code. In scratchpad/live I replaced fullburn/config/src/caps.ts with a dangling symlink; `git diff --name-status -M` reports `T`, which diff-lib.mjs's parseNameStatus maps to "modified" via its else branch; class2-gate's hashOf then throws ENOENT, wantTo becomes "deleted", and the deletion approval above authorized it — EXIT=0 on the class-2 gate. It is not an independent bypass, because the file must be unreadable-as-a-file for hashOf to throw: with the clone's workspace links repaired, `npm run typecheck` exits 2 (TS2307 x5, "Cannot find module '@fullburn/config/caps'") and `npm test` gives 7 failed / 7 passed. CI blocks it loudly one step later. Recording it because it is the reachable form of the same undefended distinction, and because my first typecheck run in that clone falsely returned 0 — the copied node_modules/@fullburn/config resolved back to the pristine original tree. Anyone re-running this must repair the workspace symlinks first or they will get a false green.

REPO HYGIENE
I wrote nothing into the repo; all probes are under scratchpad/. /home/user/New-skills-/fullburn/engine/scripts/gate-lib.mjs:279 is verified unmutated at HEAD 7a8067e. NOTE FOR THE ORCHESTRATOR: `git status --porcelain` shows a dirty working tree I did not create — fullburn/engine/src/eval-harness.ts has a live one-line mutation reverting the R2-24 fix (`Object.hasOwn(this.#outputs, ...)` replaced by a bare `this.#outputs[this.#currentCase]` lookup). That is another adversary's in-flight probe left uncleaned on the shared tree. It does not affect any result above (my probes imported gate-lib.mjs directly and gates.test.ts is untouched by it), but it must be reverted before anyone trusts a `npm test` run on this checkout.


### H-12 · data-lie · R2-24's own-property lookup in RecordedTransport has no test — reverting to prototype-chain resolution is green at 148

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** §2.4; §11 Phase 0 AC 2; adversary finding R2-24

**Reproduction:** Clone: in engine/src/eval-harness.ts change `const out = Object.hasOwn(this.#outputs, this.#currentCase) ? this.#outputs[this.#currentCase] : undefined;` to `const out = this.#outputs[this.#currentCase];`. npm test.

**Observed:** P12 mutation -> exit=0 passed=148 failed=0 :: GREEN. The R2-24 finding was that with Object.prototype polluted, a candidate with ZERO recordings scores 1.0 and binds. The fix is correct on shipped code but no test pollutes the prototype and re-runs an eval, so the guard can be removed by any refactor. Lower blast radius than H-04/H-05 because attestEvalRun's coverage check still requires the right case ids — but H-05 shows that check is itself undefended, and the two removed together restore R2-24 in full.

**Independent verifier:** REPRODUCED BY EXECUTION, from scratch.

Baseline: `npm test` at 7a8067e = 14 files / 148 passed.

Probe (throwaway, outside the repo: /tmp/.../scratchpad/h12probes/h12.test.ts + h12.config.mjs, run with `npx vitest run --config`), written with a CONTROL case so the bind path itself is proven sound:
- CONTROL, real RECORDED_QWEN_72B -> {"score":0.8,"passed":4,"total":5}; bindRole -> BOUND.
- ATTACK on SHIPPED code, `new RecordedTransport({})` (zero recordings) with `for (const g of GOLDEN) Object.prototype[g.id] = {...g.expected}` -> {"score":0,"total":5,"passed":0,"failures":["g1: ... no recorded output for case \"g1\"", x5]}; bindRole -> REFUSED ("scored 0 < threshold 0.8 ... no pass, no bind"). Pollution confirmed visible: a raw index on a bare {} returned the polluted g1 object. So the Object.hasOwn guard at eval-harness.ts:38 is genuinely load-bearing.

Mutation exactly as the claimant specified, at /home/user/New-skills-/fullburn/engine/src/eval-harness.ts:38 (`Object.hasOwn(this.#outputs, this.#currentCase) ? this.#outputs[this.#currentCase] : undefined` -> `this.#outputs[this.#currentCase]`):
- Same probe -> {"score":1,"total":5,"passed":5,"failures":[]}; bindRole -> BOUND. A candidate with ZERO recordings binds to genome-tagger.
- `npm test` -> 14 files / 148 passed, exit 0. `npm run typecheck` -> clean. `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean".
Restored from snapshot; `git status --porcelain` empty; `npm test` 148 green again. Repo left clean.

WHY THIS IS A FINDING, NOT A STYLE OPINION: the guard is behaviorally load-bearing (score 0/REFUSED vs 1.0/BOUND) and nothing in the suite, typechecker, or structural scanner notices its removal. ENGINE_BUILD.md §10.1 step 4 and the engine-adversary Phase B mandate both require a deterministic test that fails pre-fix and passes post-fix for EVERY gap found; R2-24 was a confirmed gap and has none. The project has already accepted this exact finding class: R2-33 ("hardening this commit advertises has zero test coverage") was confirmed, and the builder answered it by creating engine/test/hardening.test.ts, whose own header reads "Regression cover for hardening that previously shipped with none (R2-07, R2-19, R2-27, R2-28, R2-30, R2-33)" — and left R2-24's guard out of it. engine/test/eval-rebind.test.ts has 4 tests and none pollutes the prototype. It is also NOT covered by the ledger: L2 and L12 disclose placeholder recordings and the in-process attestation ceiling, neither of which is this.

CORRECTION TO THE CLAIMANT (in the finding's favour, band unchanged): their blast-radius caveat is wrong. They wrote that impact is limited because "attestEvalRun's coverage check still requires the right case ids" and that R2-24 is restored in full only when H-05 is removed too. That mitigation does not exist. runEval iterates the role's DECLARED golden set, so `outcomes` covers exactly g1..g5 by construction and attestEvalRun's coverage check is satisfied for free. The single line reverted ALONE minted a genuine branded EvalAttestation with score 1 and bindRole accepted it — R2-24 restored in full, no H-05 required, no combination needed.

SEVERITY: claimant said data-lie (3); I concur. The directly demonstrated harm is a fabricated eval score and attestation — evidence that a model passed its role's eval suite (Law 11, §2.4) when it answered nothing — i.e. a number the underlying run does not support. It sits adjacent to money (the same harness gates creative-decision-adversary, the role that attacks kill/promote proposals before any write, §5.2), but no spend breach or write is demonstrated at Phase 0 and exploitation presupposes in-process prototype pollution, so I do not raise it to 1 or 2. Severity 3 stands.


### B1 · 4 isolation · SCANNED and CODE_FILE diverged in the rewrite: .cjs and .jsx are read but get ZERO structural checking, and .mts/.cts are invisible to the scanner entirely

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** ENGINE_BUILD.md §10.2 / Laws 1, 6, 11, 18 — the structural rules encode 'no such code path exists' claims over engine code.

**Reproduction:** leak-check.mjs:15 widened SCANNED to `ts|tsx|mjs|cjs|js|jsx|json|jsonl|md|toml|ya?ml|txt|log|csv|tsv|sh|bash|sql|ini|conf|xml|html` (R2-29 fix) but scan-lib.mjs:63 left CODE_FILE at `/\.(?:ts|tsx|mjs|js)$/`. scanContent therefore early-returns at line 105 for .cjs and .jsx before any structural rule runs, and leak-check never even opens .mts/.cts. Probe: the same violating content `import Anthropic from "@anthropic-ai/sdk"; fetch("https://api.anthropic.com");` at `fullburn/engine/src/x.<ext>`.

**Observed:** Executed. Structural findings by extension: .ts 2, .tsx 2, .mjs 2, .js 2, .cjs 0, .jsx 0, .mts 0, .cts 0. Cross-checked against the walk: the planted-token probe shows `fullburn/engine/src/a.cjs` IS scanned (secret rules fire) — so the file is read, opened, and silently exempted from Law 1/6/11/18 with no signal. In a `"type": "module"` workspace (package.json:4) `.cjs` is the standard way to write a CommonJS file, and scan-lib.mjs:42 already special-cases `require(...)` provider imports — i.e. the rules anticipate CommonJS code that the file filter then refuses to check.

**Independent verifier:** REPRODUCED BY EXECUTION. Confirmed real; severity 4 is correct and I am not changing it.

WHAT I RAN
(1) scanContent probe: identical violating payload (@anthropic-ai/sdk import + api.anthropic.com + graph.facebook.com + "claude-sonnet" + CHANNELS["google"] + predictedRoas) at fullburn/engine/src/x.<ext> for 8 extensions. Result: .ts 6 findings, .tsx 6, .mjs 6, .js 6 — .cjs 0, .jsx 0, .mts 0, .cts 0.
(2) Synthetic repo root through the real walk()/scanTree() exported from leak-check.mjs, one file per extension carrying both a planted sk-ant- token and provider violations. Walk yielded a.cjs, a.js, a.jsx, a.mjs, a.ts, a.tsx; .mts and .cts never appear. Findings: .ts/.tsx/.mjs/.js each got the secret finding PLUS both Law 11 structural findings; a.cjs and a.jsx got ONLY the secret finding. So .cjs/.jsx are opened and read, then silently exempted from Laws 1/6/11/18 and §2.4 with no signal; .mts/.cts are invisible to the scanner entirely.
(3) Gate run: npm test 148/148 green, npm run typecheck clean, node engine/scripts/leak-check.mjs .. -> "leak/structural scan: clean". The gap survives the whole green gate; nothing in engine/test/scan-lib.test.ts (or anywhere) asserts SCANNED/CODE_FILE extension parity.

CODE CONFIRMED: leak-check.mjs:15 SCANNED = /\.(?:ts|tsx|mjs|cjs|js|jsx|json|jsonl|md|toml|ya?ml|txt|log|csv|tsv|sh|bash|sql|ini|conf|xml|html)$/ vs scan-lib.mjs:63 CODE_FILE = /\.(?:ts|tsx|mjs|js)$/, with the early return at scan-lib.mjs:105. Note .cjs/.jsx genuinely fail CODE_FILE because the pattern is anchored ($) — "x.cjs" has no ".js" at end.

INTRODUCED-BY-THE-FIX CLAIM: verified, and half-correct. At df95668 (pre-r2) leak-check.mjs:12 was /\.(?:ts|tsx|mjs|js|json|md|toml|ya?ml|txt|env)$/ and scan-lib.mjs:56 was already /\.(?:ts|tsx|mjs|js)$/ — the code-bearing halves were EXACTLY equal. Commit 7a8067e widened SCANNED for the R2-29 fix (adding cjs, jsx) and left CODE_FILE untouched, creating the read-but-unchecked class. .mts/.cts were in neither regex before or after, so that half is a pre-existing blind spot rather than fix-introduced. The claimant's "introduced by the r2 fix: true" holds for .cjs/.jsx only.

NOT A MISREAD, NOT DISCLOSED, NOT DEFERRED: LIVE_VERIFICATION_LEDGER L1-L13 contains nothing about scanner extension coverage. The scan-lib.mjs header comment does name ".ts/.tsx/.mjs/.js", but that documents the constant, not the fact that the walk was deliberately widened past it — and R2-13 already treated the analogous "structural rules early-return on files SCANNED happily reads" behaviour as a defect, not a disclosure. ENGINE_BUILD.md §10.2 defers nothing here; these are standing invariants checked every run.

MATERIALITY (why this is not a style opinion): package.json:5 is "type": "module", so .cjs is the standard way to write a CommonJS module in this workspace; scan-lib.mjs:42-43 PROVIDER_SDKS explicitly matches require(...) provider imports, i.e. the rules anticipate exactly the CommonJS code the file filter then refuses to check. The repo already ships six executable .mjs files under engine/scripts/, so "engine code is all .ts" is not a property this codebase holds. tsconfig.json include is *.ts only, so such a file would also escape typecheck — nothing else backstops it.

SEVERITY: kept at 4. It is a detector-coverage hole rather than a live breach (no .cjs/.jsx/.mts/.cts file exists in the tree today), though the rules it disables span Law 11 (gateway bypass -> untraced/uncapped spend), Law 1 (platform-host -> ban risk), Law 6 and Law 18. The prior report ranked the two structurally identical defects — R2-13 (rules miss natural spellings) and R2-15 (exemption swallows production source paths) — at [A1-isolation] and [A7-isolation], i.e. severity 4. Same defect class, same rank; the claimant graded it consistently with established precedent.

Repo working tree left clean (git status --porcelain empty); all probes written under the scratchpad only.


### B2 · 4 isolation · The relaxed PEM rule's 80-character body window misses standard OpenSSL encrypted-private-key armor — a real format the pre-relaxation header-only rule caught

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** ENGINE_BUILD.md §10.2 / §15; scan-lib.mjs:23-25 comment claims the body requirement exists only so 'reports and runbooks legitimately quote the header'.

**Reproduction:** The rule is `/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,80}?[A-Za-z0-9+/]{40,}/`. Standard `openssl rsa -aes256` output puts `Proc-Type: 4,ENCRYPTED` + `DEK-Info: AES-256-CBC,<32 hex>` between the header and the body; `openssl pkcs12 -out` and PuTTY/ssh imports add `Comment:` / `Bag Attributes` / `friendlyName` / `Key Attributes` lines. Past ~80 characters of armor the lazy window can no longer reach the base64 body.

**Observed:** Executed, 13 private-key formats through scanContent. CAUGHT: plain PKCS#1, PKCS#8, OPENSSH, EC, ENCRYPTED PKCS#8, Proc-Type+DEK-Info alone (79 chars — one character inside the window), GCP service-account JSON with \n escapes, and pkcs12 Bag Attributes when they sit OUTSIDE the BEGIN line. MISSED: `Proc-Type: 4,ENCRYPTED` + `DEK-Info: AES-256-CBC,...` + `Comment: "deploy"` (a single extra armor line tips it over); Bag Attributes/friendlyName/localKeyID placed inside the block; a PEM whose base64 is wrapped at 16 columns; and a CRLF variant with a `bag attributes:` line. Also still missed (pre-existing, not a regression, but real private-key formats): `-----BEGIN PGP PRIVATE KEY BLOCK-----`, RFC4716/SSH2 `---- BEGIN SSH2 ENCRYPTED PRIVATE KEY ----` (four dashes), and PuTTY `.ppk`. COMPOUNDING FACT from B-scope: `.pem` and `.key` are still not in SCANNED at all, so this rule cannot fire on the two file extensions the format actually uses (R2-29 said this in as many words). Mutation M8 shows why the relaxation happened — reverting to the header-only rule makes leak-check flag scan-lib.test.ts and the r2 report itself. That is a self-scan problem and should be solved with the DECLARED_FIXTURES mechanism that already exists, not by weakening the detector.

**Independent verifier:** REPRODUCED BY EXECUTION. Confirmed real; severity 4 (isolation) is correct.

WHAT I RAN
Baseline in /home/user/New-skills-/fullburn: `npm test` = 148 passed / 14 files; `npm run typecheck` = clean; `node engine/scripts/leak-check.mjs ..` = "leak/structural scan: clean".
`git show 7a8067e -- engine/scripts/scan-lib.mjs` confirms the r2 fix replaced /-----BEGIN [A-Z ]*PRIVATE KEY-----/ with /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,80}?[A-Za-z0-9+/]{40,}/ at scan-lib.mjs:25. Regression is builder-introduced, as claimed.

I did not reuse the claimant's strings. I generated real key material with openssl 3.0.13 in the scratchpad (genrsa 2048; `openssl rsa -aes256 -traditional`; `-des3 -traditional`; `pkcs8 -topk8 -nocrypt`) and measured the armor:
  armor chars between header end and body (LF)  = 80
  same key with CRLF line endings               = 84
  window allowed by the rule                    = 80
Standard `openssl rsa -aes256 -traditional` output is caught with a margin of EXACTLY ZERO characters. One extra byte defeats it.

Per-case through scanContent (current rule / pre-relaxation rule):
  -aes256 -traditional, LF                        CAUGHT / CAUGHT (boundary)
  same key, CRLF                                  MISSED / CAUGHT
  + one `Comment: "deploy"` armor line            MISSED / CAUGHT
  + pkcs12 Bag Attributes/friendlyName in block   MISSED / CAUGHT

END-TO-END, not just the regex: I built a synthetic root and called scanTree() from leak-check.mjs with two files under fullburn/ in extensions that ARE scanned (ops/runbook.md, ops/evidence.log), each containing a complete working encrypted RSA private key (one CRLF, one with pkcs12 Bag Attributes). Result: `scanTree findings: []`. The full leak scan reports clean on two real private keys. The pre-relaxation rule flags both.

STRONGER THAN CLAIMED (my own addition): the `[A-Za-z0-9+/]{40,}` body requirement also misses FULLY UNENCRYPTED keys when the base64 is wrapped below 40 columns — unencrypted PKCS#8 and PKCS#1 wrapped at 16 cols both MISSED (old rule CAUGHT). That is plaintext key material, and it is a defect in the body requirement itself, independent of the 80-char window. The claimant listed 16-col wrapping only for the encrypted case.

MUTATION M8 RE-RUN (read-only, against the real tree via walk() from leak-check.mjs): the header-only rule would flag exactly two files — fullburn/engine/test/scan-lib.test.ts and fullburn/reports/ADVERSARY_REPORT_phase0.r2.md. Both are self-scan false positives on the scanner's own proof. DECLARED_FIXTURES (scan-lib.mjs:86) already exists as the narrow exact-string mechanism for precisely this. The builder had a legitimate problem and solved it by weakening the detector globally rather than declaring two known-benign quotations.

WHY THE SKEPTICAL DEFENSES FAIL
- Not disclosed in the ledger: L1-L13 contain nothing about PEM detection. L5 covers proving leak-check against real secret material IN CI (blocked on H7); this defect reproduces locally in the sandbox with no GitHub involved, so L5 does not excuse it.
- Not deferred by spec: ENGINE_BUILD.md §11 Phase 0 names "OAuth secrets vault ... with a log/trace leak check in CI" a deliverable; §10.2 calls a token in code/logs a critical defect.
- Not a style opinion: real, working key material passes a control whose entire purpose is to stop it.
- The code's own claim is contradicted: the comment at scan-lib.mjs:23-25 says the body requirement exists only so reports may quote the header. It in fact also drops real keys.

COMPOUNDING CLAIM VERIFIED: SCANNED in leak-check.mjs:15 still omits .pem and .key, so the rule cannot fire on the two extensions the format actually uses — R2-29 named .pem explicitly and it was not fixed. That is a separate B-scope finding, not this one; B2 stands on its own because .md/.log/.json/.txt ARE scanned and I demonstrated the miss there.

SEVERITY: keep 4. Grade Registry §12 files "0 token leaks in code/logs/traces" under Security / isolation. Not severity 2 — this is a detector gap in a guardrail, not an active ban-risk write path.

REPO HYGIENE: I wrote nothing into the repo; all probes live under the scratchpad. `git status` shows `M fullburn/engine/src/gateway.ts` (a startedAtMs mutation probe) which is NOT mine — it is a concurrent adversary's in-flight work, left untouched rather than reverted.


### B3 · 4 isolation · One genuinely untraced, unredacted exit from llm() remains: deps.now() is called outside the try block

**Spec:** Law 11 (ENGINE_BUILD.md:38) 'Every agent decision is traced in Langfuse. Untraced decisions are treated as bugs.'; gateway.ts:14-17 'Every exit is traced, including refusals (adversary finding R2-28)'.

**Reproduction:** gateway.ts:85 `const startedAtMs = deps.now();` sits above the try at :117, so a clock that throws escapes llm() before traceFailure is reachable. Probe p2 case 18: deps.now = () => { throw new Error('clock <canary>'); }.

**Observed:** Executed: `18 deps.now throws -> threw err=Error traces=0 thrownLeak=true`. Compare case 12 (CAP BREACH) which now correctly reports traces=1 outcome=error. Full census: TRACED=24, UNTRACED=3 of 27. The other two untraced cases are the sink itself being broken (17 sink outage on success, 26 deps.sink missing) — those are inherent and correctly fail closed, so they are not findings. This one is not inherent: moving line 85 inside the try, or defaulting it, closes it. REALISM: `now` is `() => Date.now()` in every current call site, so the trigger is a malformed dependency graph, not an attacker. Filed because R2-28's fix is stated as 'every exit is traced' and the census shows it is 'every exit reachable after line 85'.

**Independent verifier:** REPRODUCED by execution on pristine 7a8067e. Baseline first: npm test 148/148 green, npm run typecheck clean, node engine/scripts/leak-check.mjs .. "leak/structural scan: clean". Then an independent probe built from scratch against engine/src (not test/helpers.ts) exercising 12 exits of llm(): controls 00 success, 01 cap breach, 02 transport throws, 03 unknown role, 04 cross-client trace context ALL emit exactly traces=1 (01-04 outcome=error). But deps.now throwing yields threw=Error traces=0 — no trace event at all. I also found two adjacent triggers the claimant did NOT report: deps.now missing and deps.now not a function both give TypeError with traces=0.

NOT INHERENT — proven, not argued. I temporarily patched engine/src/gateway.ts (let startedAtMs = 0 at :85; startedAtMs = deps.now() as first statement inside the try at :117), re-ran the probe: all four now-related cases became traces=1 outcome=error, while case 11 (sink missing) correctly stayed traces=0; the suite stayed 148 green. Restored with git checkout; git status --porcelain empty; defect reproduces again on the clean tree. So this exit is genuinely closable and is categorically distinct from the sink-outage exits the claimant correctly excluded as inherent.

WHAT MAKES IT REAL: gateway.ts:14-17 asserts "Every exit is traced, including refusals (adversary finding R2-28)". That absolute is falsified on a path that could trace and does not. R2-28's substantive half IS closed (controls 01 and 04 prove the cap-breach and cross-tenant refusals now emit).

SEVERITY CORRECTED 4 -> 5. The claimant's severity-4 (isolation) rating is unjustified. Nothing here touches a tenant boundary. R2-28 originally earned rung 4 because its untraced set contained cross-tenant refusals; that half is now closed (case 04 = traces=1). What remains moves no money (case 05 reserves and spends $0), risks no ban, tells no client-visible lie, and reads no cross-client data. It is an operability/dummy-proof gap: a misconfigured dependency graph yields a raw TypeError with no trace instead of a traced error — rung 5.

TWO CLAIMANT ERRORS. (a) Law 11 is NOT violated: it reads "Every agent DECISION is traced"; a clock throwing at :85 crashes before any decision exists. The finding stands only on the code's own header claim, not on the Law — the claimant's primary spec citation is wrong. (b) The "unredacted" half of the title does not hold up: the canary in the thrown message is present only because I authored it into the dependency's own throw, and under the patch the canary actually reached the TRACE SINK (traceLeak went false->true) because `secrets` is still [] until :152. The proposed one-line move fixes tracing and slightly worsens redaction; they are not one defect closable together as claimed.

REACHABILITY BOUND (why 5, not higher): `now` is a required field (readonly now: () => number, gateway.ts:32), so tsc rejects any typed call site omitting it — the missing/not-a-function cases required `as any`. The only two constructions in the tree (engine/test/helpers.ts:46, engine/test/adversary-phase0.test.ts:52) are () => <constant>; Date.now() does not throw; no production wiring exists in Phase 0. Trigger is a malformed dependency graph, not an attacker.

Checked L1-L13 in reports/LIVE_VERIFICATION_LEDGER.md — not disclosed there. Not a style opinion; not deferred by the spec. Adjacent issue for the builder, outside B3: cases 09/10 show now() returning a non-number is written verbatim into the trace's startedAtMs (NaN, or an arbitrary object) with no validation, and that one survives the proposed fix.


### B4 · 4 isolation · R2-15 residual: engine/evals/ is still a blanket exemption from all five structural rules, and it still protects zero files

**Spec:** scan-lib.mjs:65-71 justifies the exemption as being for 'tests and recorded fixtures'; ENGINE_BUILD.md §11 puts the live eval harness in engine/evals/.

**Reproduction:** TEST_OR_FIXTURE (scan-lib.mjs:72-76) retains `/^fullburn\/engine\/evals\//` alongside the two correctly-anchored test clauses. I re-ran R2-15's decisive test: `fullburn/engine/evals/live/runner.ts` and `fullburn/engine/evals/genome-tagger/fixture.ts` both return 0 findings for content violating all five rules, while `fullburn/engine/src/gateway.ts` returns 5.

**Observed:** Executed. Then I re-ran the beneficiary check: `engine/evals/` contains exactly two files (genome-tagger/recorded-outputs.ts, genome-tagger/golden.ts) and I scanned both AS IF they were ordinary production source — 0 findings each. So the clause protects nothing today, and it blanket-exempts precisely the directory §11 designates for the live eval harness, the most plausible place for real provider-SDK code that bypasses AI Gateway. I state the builder's progress plainly: the clause is now ANCHORED (`^fullburn/engine/evals/`), so `engine/src/evals/` is no longer exempt — this is a genuine narrowing and the /test/ half of R2-15 is fully closed. What remains is the one sub-clause R2-15's body called out by name and argued should be deleted outright.

**Independent verifier:** REPRODUCED BY EXECUTION. Verdict: real, with one spec citation corrected and the severity corrected.

WHAT I RAN (all from /home/user/New-skills-/fullburn; probes in scratchpad only; tree left clean).

1. Baseline. `npm test` -> 14 files / 148 tests passed. `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean", exit 0. `npm run typecheck` -> clean. So I am attacking the same green state the builder claims.

2. Direct reproduction. Wrote /tmp/.../scratchpad/b4probe.mjs importing scanContent from /home/user/New-skills-/fullburn/engine/scripts/scan-lib.mjs and fed one blob violating ALL FIVE structural rules at once (`import Anthropic from "@anthropic-ai/sdk"`, `https://api.anthropic.com/v1/messages`, `"claude-sonnet"`, `CHANNELS["google"]`, `predictedRoas`). Findings-count per path:
   5  fullburn/engine/src/gateway.ts
   0  fullburn/engine/evals/live/runner.ts
   0  fullburn/engine/evals/genome-tagger/fixture.ts
   0  fullburn/engine/evals/live-provider-adapter.ts
   5  fullburn/engine/src/evals/runner.ts
   5  fullburn/engine/src/test/harness.ts
   5  fullburn/engine/src/ab-test/thing.ts
   0  fullburn/engine/test/helpers.ts
The claimant's decisive test reproduces exactly. Mechanism confirmed by reading the code: TEST_OR_FIXTURE (scan-lib.mjs:72-76) still carries `/^fullburn\/engine\/evals\//` as a third clause; it feeds STRUCTURAL_EXEMPT, which drives a blanket early-return at scan-lib.mjs:~103 (`if (!CODE_FILE.test(path) || STRUCTURAL_EXEMPT.some((a) => a.test(path))) return findings;`) — one bypass over Law 1, Law 6, Law 11, Law 18 and section 2.4 together.

3. Fair-play checks that could have refuted it, and did not. Secret rules genuinely still apply under the exemption: scanContent("fullburn/engine/evals/live/runner.ts", "const k='sk-ant-ABCDEFGH12345678';") returns the anthropic-key finding. And the builder's R2-15 narrowing is REAL, exactly as the claimant conceded: `engine/src/evals/`, `engine/src/test/`, `engine/src/ab-test/` and `config/src/test/` all now return 5, so the `/test/` half of R2-15 is fully closed and the anchoring works. This finding is only the residual sub-clause.

4. Beneficiary check (the load-bearing one). Copied scan-lib.mjs to scratchpad, removed ONLY the line `/^fullburn\/engine\/evals\//,`, and re-walked the real repo with leak-check.mjs's own ROOTS (["fullburn", ".github"]), SKIP_DIRS and SCANNED filter, scanning `engine/evals/`'s two real files (genome-tagger/recorded-outputs.ts, genome-tagger/golden.ts) as ordinary production source: CLEAN, zero findings. The clause protects nothing today. `find engine/evals -type f` confirms exactly those two files exist.

5. Decisive in-repo deletion test. Applied the same one-line deletion to engine/scripts/scan-lib.mjs itself, then ran the real gates: `npm test` -> 148/148 passed, `node engine/scripts/leak-check.mjs ..` -> clean, exit 0. Nothing in the suite pins the clause — engine/test/scan-lib.test.ts:95-101 ("the test exemption is anchored to the real test roots (R2-15)") asserts only the two anchored test clauses and never asserts engine/evals/ is exempt. Reverted with `git checkout -- engine/scripts/scan-lib.mjs`; `git status --short` is empty and the file is byte-identical to my pre-probe copy. So the clause can be deleted at zero cost and buys zero protection: it is pure exemption surface.

WHY THIS IS A DEFECT AND NOT A STYLE OPINION. The scanner's stated purpose is to encode absence claims and catch builder error. The code's own justification (scan-lib.mjs:65-71) is that "tests and recorded fixtures must be able to contain the very strings these rules ban — that is how the rules themselves get verified", and the R2-15 remediation comment claims the list is "ANCHORED to the two real test roots". `engine/evals/` is a third clause, is not a test root, and by execution is needed by no file. Even the strongest forward-looking defence I could construct for it — a recorded-output fixture keyed by a literal model id — would need relief from MODEL_IDS only, which MODEL_ID_ALLOWLIST already grants separately; the clause instead hands out a blanket early-return over PROVIDER_HOSTS, PROVIDER_SDKS, PLATFORM_API_HOSTS and PREDICTION_GATE_IDENTIFIERS, none of which any fixture can need. The exemption is strictly broader than any justification available to it.

CORRECTION 1 — the claimant's spec clause is overstated. They assert "ENGINE_BUILD.md section 11 puts the live eval harness in engine/evals/". I read section 11 Phase 0 (ENGINE_BUILD.md:304-309): it lists "Langfuse eval harness" as a deliverable but names NO path, and the harness in fact lives at /home/user/New-skills-/fullburn/engine/src/eval-harness.ts, which is NOT exempt (my probe returns 5 for fullburn/engine/src/evals/runner.ts). So the spec does not designate that directory. The finding survives on the code's own claim rather than on section 11, and the "most plausible place for provider-SDK code" argument is weaker than the claimant stated — it rests on the directory's name, not on the spec.

CORRECTION 2 — severity. Claimed "4 isolation" is wrong: nothing here touches cross-client data access. The claimant appears to have mistaken the "[A7-isolation]" AREA tag in the R2-15 heading (ADVERSARY_REPORT_phase0.r2.md:872) for a severity band; that same finding's body (line 907) ranks it "at the low end of band 2". The rules this clause disables map to ban risk (PLATFORM_API_HOSTS — CLAUDE.md prime directive 1: mass platform reads are what gets accounts banned) and AI-Gateway bypass producing untraced LLM calls (Laws 9/11). Correct severity: 2, low end of band, consistent with the prior report's own ranking. Mitigating and stated plainly: no offending code exists today, there is no external attacker in the threat model, and landing this requires builder error inside engine/evals/ — which is exactly the failure mode this scanner exists to catch.

NOT ALREADY DISCLOSED. I read reports/LIVE_VERIFICATION_LEDGER.md in full (28 lines, L1-L13). No ledger item covers scanner exemptions; L5 covers only proving leak-check against real secret material on a real PR. So this is not an honestly-disclosed known gap, and it is not deferred to a later phase — the scanner is a Phase 0 deliverable that is being relied on now.


### H-13 · isolation · R2-30's fix is defended only against the delimiter that was previously used — reverting the vault key to a ':' delimiter restores a cross-tenant secret read with 148 tests green

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** Law 3 (per-client isolation, cross-client read is a critical defect); §15; §12 Security/isolation A-criterion '0 cross-tenant events'

**Reproduction:** Clone: in engine/src/vault.ts change `return `${clientId.length}:${clientId}:${name.length}:${name}`;` to `return `${clientId}:${name}`;`. npm test. Then: `const b = new MemoryVaultBackend(); b.set('acme:corp','meta-oauth','TENANT-A-SECRET'); vaultForClient(b,'acme').get('corp:meta-oauth').value`.

**Observed:** M8b mutation -> exit=0 passed=148 failed=0 :: GREEN (the NUL-delimiter revert, M8, correctly goes RED).
CONTROL (shipped): refused: secret "corp:meta-oauth" not found for scoped client
MUTATED: >>> CROSS-TENANT READ: TENANT-A-SECRET (tenant 'acme' read tenant 'acme:corp' secret)
Why: hardening.test.ts:180-191 sets only 'acme corp' (space) and 'acme\x00corp' (a real 0x00 byte, verified by hexdump) and probes only ':' and '\x00' as the injected separator against those two fixtures. It pins the fix to the specific collision the finding used rather than to the property the fix claims — vault.ts:52-56 says 'no two distinct (clientId, name) pairs can ever produce the same key'. A property test over adversarial clientIds would hold; this fixture does not.

**Independent verifier:** REPRODUCED BY EXECUTION, and the claim is if anything understated.

Method: copied the repo to scratchpad (repo working tree confirmed clean, `git status --porcelain` empty, vault.ts:58 unchanged). All mutation happened in the clone.

Baseline: real repo `npm test` -> 14 files, 148 passed.

CONTROL (shipped engine/src/vault.ts:58, length-prefixed key): probe importing the real module -> `refused: secret "corp:meta-oauth" not found for scoped client`. Matches claimant.

MUTANT M8b (`return `${clientId}:${name}`;`, a one-line revert to a single-separator scheme):
  probe -> `>>> CROSS-TENANT READ: TENANT-A-SECRET (tenant 'acme' read tenant 'acme:corp' secret)`
  `npm test`  -> Test Files 14 passed (14), Tests 148 passed (148), exit 0
  `npm run typecheck` -> exit 0
  `node engine/scripts/leak-check.mjs .` -> "leak/structural scan: clean", exit 0
Every gate in the build protocol is green while a cross-tenant secret read is live.

MUTANT M8 (real 0x00 byte delimiter, the pre-fix implementation): `FAIL engine/test/hardening.test.ts:189 > vault key composition (R2-30)`. So the guard does fire — for exactly one delimiter.

I extended the attack beyond the claim with a black-box property probe (scratchpad/prop.mjs; alphabet {"a",":","|"}, all strings of length<=3 -> 39 clientIds x 39 names; it never touches #key, only observable read behaviour):
  shipped   -> PROPERTY HOLDS (0 cross-tenant collisions)
  ':' variant -> PROPERTY VIOLATED: 342 cross-tenant collisions, e.g. tenant "a:a" reads tenant "a"'s secret "a:a"; 148/148 tests green
  '|' variant -> PROPERTY VIOLATED: 342 cross-tenant collisions; 148/148 tests green
So the guard is blind not just to ':' but to EVERY single-separator scheme except the one NUL the finding historically used. hardening.test.ts:180-191 seeds only 'acme corp' (space) and 'acme\x00corp' and probes only ':' and '\x00' as the injected separator against those two fixtures — the two probes miss because the fixture separator (space/NUL) differs from the probe separator, not because the encoding is sound.

Why this is a genuine defect and not a style opinion:
- It falsifies the code's own claim. vault.ts:52-56 states "no two distinct (clientId, name) pairs can ever produce the same key (Law 3)". The test carrying the R2-30 name asserts nothing of the sort.
- The test's own title, "no clientId can collide into another tenant's secret, whatever it contains", is false as written. That is a test that lies about its coverage.
- It violates the adversary mandate Phase B rules 1-2 ("write a deterministic test that reproduces it... encode every acceptance criterion as a permanent test so regressions are caught forever") and CLAUDE.md's standing invariant "A cross-tenant read attempt must fail by construction". The regression is reintroducible in one line with the full suite, typecheck and leak-check all green.
- It is not honestly disclosed. LIVE_VERIFICATION_LEDGER L10 covers only encryption/auto-rotation of the vault; nothing in L1-L13 discloses that the key-composition property is untested. §12's security/isolation A-criterion "0 cross-tenant events" is asserted against a fixture, not a property.
- It carries forward: the H7 encrypted backend will need its own key composition, and a property test transfers where a two-value fixture does not.

Severity CONFIRMED as claimed: 4 / isolation. Not higher — no money path, no platform write, no client-visible number is affected. Not lower — the failure mode it fails to guard is cross-client secret access, which the severity ladder places at 4, and CLAUDE.md calls a suspected cross-tenant leak an immediate human escalation.

One honest qualifier the claimant should have stated explicitly, and which I verified: the SHIPPED code is correct. The length-prefix encoding genuinely holds the property (0 collisions across my 39x39 probe). There is no live cross-tenant read on commit 7a8067e. H-13 is a latent regression-guard defect, not a currently-exploitable one — but it is exactly the class of defect the builder was asked to close with a deterministic test, and the test does not close it.


### H-14 · isolation · The spend meter's cross-client reservation guard has no test — removing it lets any tenant close another tenant's in-flight reservation by guessing the sequential id r1, r2, …

**Spec:** Law 3; Law 2; §12 Security/isolation '0 cross-tenant events'

**Reproduction:** Clone: in engine/src/spend-meter.ts delete `if (open.clientId !== reservation.clientId) return null;` from #close. npm test. Then: `const m = new MemorySpendMeter(); m.reserve('tenant-a', 0.01, 0.02); m.settle({id:'r1', clientId:'tenant-b', amountUsd:0.01});`

**Observed:** Q11 mutation -> exit=0 passed=148 failed=0 :: GREEN.
CONTROL (shipped): after B settles forged r1 -> A committed: 0  A reserved: 0.01 (guard holds)
MUTATED: MUTATED Q11 -> A committed: 0.01  A reserved: 0
So tenant B can force-commit tenant A's in-flight reservation (charging A) or release it (freeing headroom the cap is holding, which is the F1 concurrency breach re-armed). Reservation ids are `r${seq}` from a single shared counter — trivially guessable. The guard's own comment names the threat ('A reservation handle from another meter, or a forged one, must not move another client's ledger') and spend-meter.test.ts has no forged-handle case. Note spend-meter.ts:21-23 instructs the Phase 5/6 ad-spend path to adopt this implementation unchanged.

**Independent verifier:** REPRODUCED BY EXECUTION, from scratch, in /home/user/New-skills-/fullburn.

BASELINE: `npm test` -> 14 files, 148 passed, exit 0.

CONTROL (shipped code): probe at scratchpad/probe.mjs run with `node --experimental-strip-types` importing engine/src/spend-meter.ts. tenant-a reserves $0.01 (cap $0.02); tenant-b calls m.settle({id:'r1', clientId:'tenant-b', amountUsd:0.01}). Observed: "A committed: 0  A reserved: 0.01" — guard holds, exactly as the claimant reported.

MUTATION Q11: deleted the single line `if (open.clientId !== reservation.clientId) return null;` from #close (verified unique, 1 occurrence). Gates re-run against the mutant:
  - `npm test`            -> Test Files 14 passed, Tests 148 passed, exit 0
  - `npm run typecheck`   -> exit 0
  - `node engine/scripts/leak-check.mjs .` -> "leak/structural scan: clean", exit 0
All three gates GREEN with the guard deleted. This is precisely the condition the task defines as a finding: a fix defeated by a one-line revert with the suite still green.

MUTANT BEHAVIOUR: same probe -> "after B settles forged r1 -> A committed: 0.01  A reserved: 0". Tenant B force-committed tenant A's in-flight reservation, charging A. I added a second variant the claimant did not run: A pinned at its $0.02 cap (further reserve correctly throws CapError), then B calls release({id:'r1', clientId:'tenant-b'}) -> A's next reserve SUCCEEDS ("BREACH: A got headroom back"). The missing test therefore guards a cap-breach path, not merely an isolation path.

Confirmed there is no forged-handle case in engine/test/spend-meter.test.ts (read in full, 7 tests: accumulation, release, idempotency, per-client caps, non-finite refusal, unavailable meter, assertUsableAmount). The nearest test, "caps are per client" (lines 44-49), only settles well-formed self-owned handles and so never exercises the guard.

TWO CORRECTIONS TO THE CLAIM:
1. Metadata "introduced by the r2 fix: false" is WRONG. `git show 7a8067e -- fullburn/engine/src/spend-meter.ts` emits `+    if (open.clientId !== reservation.clientId) return null;` and `+    // A reservation handle from another meter, or a forged one, must not move`. The guard is new r2 code shipped with zero coverage. Prior report M6 (reports/ADVERSARY_REPORT_phase0.r2.md:1748) documents the pre-fix forge-charges-victim behaviour this guard closes, so the builder hardened a known threat and left it unpinned.
2. SEVERITY CORRECTED 4 -> 1. The release variant frees cap headroom (runaway spend = money loss, the top class), and spend-meter.ts:21-23 explicitly directs the Phase 5/6 ad-spend path to adopt this implementation unchanged, so the unpinned guard propagates to real ad dollars. Isolation (4) captures only the read/attribution half of the exposure.

NOT EXCLUDED BY ANY EXEMPTION: not a style opinion (executed, divergent observable behaviour); not correct-behaviour-misread (control and mutant differ as claimed); not disclosed in reports/LIVE_VERIFICATION_LEDGER.md L1-L13 (L4 covers Gateway-side cap config, a different control); not deferred by spec — ENGINE_BUILD.md §10.2 makes per-client isolation a standing every-run invariant, §12 requires "0 cross-tenant events", and the adversary mandate Phase B requires a deterministic test for every acceptance criterion.

SCOPE NOTE (separate observation, not part of H-14, offered for the fresh-attack sweep): even in shipped code a forged handle carrying the CORRECT victim clientId — m.settle({id:'r1', clientId:'tenant-a'}) — passes the guard and committed $0.01 against tenant-a. The guard checks handle self-consistency, not caller ownership, so it raises the bar to "also know the tenant id" rather than closing the forge path.

REPO LEFT CLEAN: `git checkout engine/src/spend-meter.ts`; `git status --porcelain` empty; file byte-identical to the pre-mutation copy (diff -q clean); `npm test` 148 passed again. All probes lived under the scratchpad, none in the repo.


### H-15 · isolation · getCaps()'s own-property guard has no test — removing it mints a $1e9 self-signed cap for a client that has no entry, contradicting caps.ts's own header

**Spec:** Law 2 ('No runtime path may raise a cap'); H8; §10.2 bullet 2

**Reproduction:** Clone: in config/src/caps.ts change `const raw = Object.hasOwn(CAPS_TABLE, clientId) ? CAPS_TABLE[clientId] : undefined;` to `const raw = CAPS_TABLE[clientId];`. npm test. Then: `Object.prototype['attacker-co'] = {dailyAdSpendUsd:1e9, totalAdSpendUsd:1e9, dailyAiSpendUsd:1e9, humanSignoff:'self'}; getCaps('attacker-co')`.

**Observed:** Q4 mutation -> exit=0 passed=148 failed=0 :: GREEN.
CONTROL (shipped): refused: no caps configured for client "attacker-co" — spend is forbidden
MUTATED: MUTATED Q4 -> getCaps('attacker-co'): {"dailyAdSpendUsd":1000000000,"totalAdSpendUsd":1000000000,"dailyAiSpendUsd":1000000000,"humanSignoff":"self"}
That is both an invented client and a forged H8 sign-off in one step. caps.ts:5-6 states 'there is deliberately no setter API and no default cap — an unknown client has NO cap and therefore may spend NOTHING'; invariants.test.ts:78 tests only `getCaps('never-onboarded')` on an unpolluted prototype, which the mutated code still refuses. No test pollutes the prototype against getCaps, even though the sibling guard in requireActiveChannel/requireActiveMarket carries the identical comment.

**Independent verifier:** CONFIRMED by execution. Everything the claimant asserted reproduced exactly.

WHAT I RAN (all from /home/user/New-skills-/fullburn)
1. Baseline: `npm test` -> 14 files, 148 passed. `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean".
2. Control probe (shipped code), /tmp/.../scratchpad/probe.mjs via `node --experimental-strip-types`, importing config/src/caps.ts directly:
   - CLEAN getCaps('attacker-co') -> refused: `no caps configured for client "attacker-co" — spend is forbidden`
   - After `Object.prototype['attacker-co'] = {dailyAdSpendUsd:1e9,totalAdSpendUsd:1e9,dailyAiSpendUsd:1e9,humanSignoff:'self'}` -> still refused, same message. Shipped code is CORRECT.
3. Mutation, caps.ts:69, exactly as the claimant specified — `Object.hasOwn(CAPS_TABLE, clientId) ? CAPS_TABLE[clientId] : undefined` -> `CAPS_TABLE[clientId]`:
   - `npm test` -> Test Files 14 passed, Tests 148 passed (148), exit 0. `npm run typecheck` -> exit 0. `leak-check` -> "clean". THE ENTIRE GATE IS GREEN ON A DELETED LAW-2 GUARD.
   - Same probe -> POLLUTED getCaps('attacker-co'): {"dailyAdSpendUsd":1000000000,"totalAdSpendUsd":1000000000,"dailyAiSpendUsd":1000000000,"humanSignoff":"self"}
4. I extended past the claim to check whether the mint reaches the enforced money path (probe2.mjs, mutation still applied): `effectiveDailyAiCapUsd('attacker-co')` returned 1000000000. That is the value llm() enforces against per caps.ts:17-19 — so the mint is not inert, it produces a live $1e9 AI ceiling, and `assertCapsUsable` passes on the forged `humanSignoff:'self'`. One nuance in the builder's favour: pollution does NOT forge sign-off for the real unsigned client zero — `assertCapsUsable(getCaps('pulsern'))` still threw `caps lack human sign-off (H8)`, because the own-property `pulsern` record shadows the prototype. The exposure is invented clients only.
5. `git checkout -- config/src/caps.ts`; re-ran probe (both cases refused again) and `npm test` (148 passed). `git status --porcelain` empty — tree clean. Nothing written inside the repo.

WHY IT IS A REAL FINDING, NOT A STYLE OPINION
The shipped behaviour is correct, so Law 2 is not breached today — this is a regression-durability defect, and it is a legitimate one on three independent grounds:
- ENGINE_BUILD.md §10.2 bullet 2 does not say caps must merely be immutable, it says "tested by attempted breach (Law 2)". This breach vector is untested. `config/test/caps.test.ts` covers frozen-object mutation, unknown client, empty id, arity, and H8 — never a polluted prototype. invariants.test.ts:73-81 likewise only calls `getCaps('never-onboarded')` on a clean prototype, which the MUTATED code still refuses. That is why 148/148 survived.
- The project's own standard already treats this exact vector as test-worthy: `config/test/switchboard.test.ts:26-34` runs "ATTACK prototype pollution: cannot inject an active market" against the identical sibling guard in markets.ts:45/channels.ts:35, and `engine/test/adversary-phase0.test.ts:175-177` (F6) tests the same vector against grade-registry. caps.ts — the highest-value guard of the three, the money one — is the only member of the family with no test. This is an inconsistency in the suite, not an aesthetic preference.
- caps.ts:5-6 states as a normative claim "an unknown client has NO cap and therefore may spend NOTHING". A one-line change that falsifies the file's own header with CI fully green is precisely the "fix defeated by a one-line revert with the suite still green" case the mandate names as a finding.
Not disclosed in LIVE_VERIFICATION_LEDGER.md (L1-L13 — I grepped it for prototype/hasOwn/caps; only L4 touches caps, and it is about Gateway-side defense-in-depth, unrelated). Not deferred by the spec to a later phase.

SEVERITY CORRECTION: claimant filed 4/isolation. That is wrong. Nothing cross-tenant happens — 'attacker-co' is an invented client, not another tenant whose data is read; no isolation boundary is crossed. What the missing test protects is an unbounded spend ceiling plus a forged H8 marker, i.e. the money column. §10.2 puts caps under Law 2 explicitly. Rank it severity 1 (money loss), qualified in the report as regression-durability rather than a live breach, so the builder is not misled into thinking shipped code is currently leaking money — it is not.

REMEDY (for the builder, not applied by me): add to config/test/caps.test.ts a pollution attack mirroring switchboard.test.ts:26-34 — pollute Object.prototype with a fake client id in a try/finally, assert `getCaps` and `effectiveDailyAiCapUsd` both throw CapError, and assert `assertCapsUsable(getCaps('pulsern'))` still throws. It must fail against the mutated line and pass against the shipped one; I verified both halves of that gradient above.


### H-16 · isolation · The leak scan still never walks the sibling client trees named in R2-29 — 346 files, including client zero's app and ops scripts, are outside every scan, and the gap is in no ledger entry

**Spec:** §10.2 (tokens exist only in the vault; a token in code, logs or traces is a critical defect); §15; adversary finding R2-29

**Reproduction:** node -e with the shipped leak-check walk(): iterate /home/user/New-skills-/pulsern and /haven, count files matching the SCANNED extension set, and run each through scanContent.

**Observed:** files that WOULD be scanned in siblings: 346
findings if they were scanned: 14 (all 'LLM provider hostname' in pulsern/api/*.js, pulsern/assets/*, pulsern/ops/*)
secret-pattern findings in siblings: 0
leak-check.mjs:18 sets ROOTS = ['fullburn', '.github'] and its own comment cites R2-29 for the .github half only. R2-29's text named both halves: '`pulsern` is client zero, with live $70/day / $2,000 caps in config/src/caps.ts, and its app and its own workflows sit in this repo unscanned.' No realized leak today (0 secret hits, and I checked), so this is filed at isolation rather than higher — but it is a partial fix presented as complete, with no ledger entry disclosing the remainder.

**Independent verifier:** REPRODUCED BY EXECUTION; claim is accurate, including its exculpatory half.

What I ran:
(1) `node engine/scripts/leak-check.mjs ..` from /home/user/New-skills-/fullburn (verbatim the CI step at .github/workflows/fullburn-ci.yml:31) -> "leak/structural scan: clean", exit 0.
(2) Synthetic-root plant (R2-29's own method), in scratchpad: six IDENTICAL sk-ant-api03-... tokens in fullburn/engine/src/a.ts, .github/workflows/w.yml, pulsern/ops/seed.mjs, pulsern/api/ai.js, haven/src/x.ts and a repo-root .md. The shipped scanTree() returned exactly 2 hits - fullburn and .github. R2-29's original probe returned 1. The .github half is genuinely closed; the sibling half and repo-root files remain structurally invisible.
(3) Re-ran the claimant's census through the shipped walk()+scanContent(): pulsern 118 files/11 findings, haven 228/3 = exactly 346 files and 14 findings, all Law-11 structural ("LLM provider hostname"/"provider SDK import"), 0 secret-pattern hits. Numbers match the claim precisely.
(4) Baseline sanity: npm test 148/148 green (14 files), npm run typecheck clean. Repo working tree left clean (git status empty); all probes under scratchpad.

Why it is a genuine defect, not a misread:
- leak-check.mjs:5 documents its parameter as <repo-root> and CI passes `..` (the actual repo root), but :18 ROOTS = ["fullburn", ".github"] silently walks 2 of 4 top-level trees. Undisclosed scope limit on a security control.
- The :16-17 comment cites R2-29 as its justification while closing only the .github half. R2-29's title and body named both halves ("its app, ops scripts and its own workflows sit in this repo, entirely unscanned"). Commit 7a8067e is titled "fix all 34 confirmed re-review findings". grep for R2-29 across the tree returns only those two comments - nothing discloses the remainder.
- Not in the ledger: I read L1-L13. L5 covers "leak-check proven against real secret material"; no entry covers scan scope. The project's own disclosure mechanism was not used, so this is not "honestly disclosed".
- Counter-hypotheses tested and rejected: the siblings are NOT untracked/ignored - git ls-files shows 125 tracked files in pulsern and 243 in haven, so a pasted key there is a committed secret. pulsern/ops/* today handle SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY and TWILIO_AUTH_TOKEN, exactly the file shape where a pasted key lands. pulsern is named client zero at ENGINE_BUILD.md:407 and carries live caps at config/src/caps.ts:36. No other scanner covers the siblings.

SEVERITY: claimant's "isolation" is CORRECT, keep it - do not escalate. The prior adversary filed R2-29 itself under "S4 - ISOLATION" (report line 1392/1474) on the same reasoning (no realized secret hit), and what remains is strictly smaller than what was filed then, since the acute half (workflows, which actually handle secrets plumbing) is now fixed. Realized harm channel would be ban-risk (sev 2), but I verified 0 secret hits across all 346 sibling files with all shipped patterns, so escalation would be inflation.

CAVEAT FOR THE BUILDER (against the claimant's framing): the "14 findings if scanned" figure is NOT 14 latent defects - all 14 are Law-11 structural rules that do not govern separate client applications. Adding the siblings to ROOTS as-is would turn CI red on 14 false positives. Correct fix shape is split scope: secret patterns repo-wide and fail-closed on unknown extensions, structural/Law rules confined to fullburn/ - plus either a ledger entry or a CI `paths` filter that no longer exempts sibling-only commits (today a pulsern-only commit does not even start the job).


### R3-CP-08 · dummy-proof · parseNameStatus does not unquote git paths, so adds and deletes inside protected directories escape Class-2 whenever the filename requires quoting

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** §13 Class 2; diff-lib.mjs stated purpose (both sides of every change kept)

**Reproduction:** In a clone, commit two new files, `fullburn/config/src/cáps.ts` (exporting a 1e9 cap table) and `fullburn/engine/scripts/géte.mjs`, then run `node fullburn/engine/scripts/class2-gate.mjs . <BASE>`.

**Observed:** `git diff --name-status -M` emits `A	"fullburn/config/src/c\303\241ps.ts"` and `A	"fullburn/engine/scripts/g\303\251te.mjs"`; the gate prints `class2 gate: no Class-2 changes`, EXIT=0. parseNameStatus splits on tabs and never strips git's core.quotePath quoting or octal escapes, so the leading `"` makes every CLASS2_PATTERN miss. Neither CLI passes `-z`. Bounded honestly: the OLD side of a rename is emitted unquoted and IS still caught (verified for both tab-containing and non-ASCII destinations — 'renamed-away', EXIT=1), and no currently tracked file has a quotable name, so this is a boundary hole rather than a live bypass. It becomes a live deletion bypass the moment any protected directory acquires a non-ASCII filename.

**Independent verifier:** REPRODUCED BY EXECUTION in a throwaway clone off 7a8067e; repo left clean (git status empty, HEAD 7a8067e).

Baseline first: npm test = 148 passed/14 files, npm run typecheck clean, node engine/scripts/leak-check.mjs .. = "leak/structural scan: clean".

(1) ADD case reproduced exactly as claimed. Committed fullburn/config/src/caps.ts with an acute-accent 'a' (a 1e9 cap table) and fullburn/engine/scripts/gete.mjs with an acute-accent 'e'. `git diff --name-status -M <BASE>...HEAD | cat -A` emits: A^I"fullburn/config/src/c\303\241ps.ts"$ and A^I"fullburn/engine/scripts/g\303\251te.mjs"$. `node fullburn/engine/scripts/class2-gate.mjs . <BASE>` printed "class2 gate: no Class-2 changes", EXIT=0.

(2) CONTROL proves the filename is the only variable: the identical add named fullburn/config/src/caps2.ts gives "CLASS-2 GATE FAIL: Class-2 changes without a matching human approval for this transition (Law 2/14/15): fullburn/config/src/caps2.ts (added)", EXIT=1.

(3) DELETION half is LIVE, not just a boundary. From the attack commit, `git rm` of the accented caps file yields `D "fullburn/config/src/c\303\241ps.ts"` and the gate again prints "class2 gate: no Class-2 changes", EXIT=0 - a Class-2 file deleted with the gate certifying zero Class-2 changes.

(4) NO SECOND LINE OF DEFENCE: on the attack branch npm test = 148 passed and leak-check = clean. scan-lib.mjs has no rule guarding cap sourcing.

(5) CLAIMANT UNDER-SCOPED IT, TWICE.
  (a) It is not non-ASCII-specific. Pure-ASCII names containing a double-quote or backslash force git quoting unconditionally (independent of core.quotePath) and escape identically: A "fullburn/config/src/ca\"ps.ts" and A "fullburn/engine/scripts/back\\slash.mjs" -> "no Class-2 changes", EXIT=0. So no exotic filesystem or locale is needed.
  (b) The rename bound is real but understated. `git mv fullburn/config/src/caps.ts <accented>` fails the gate ONLY on the old side ("fullburn/config/src/caps.ts (renamed-away)"); the destination is absent from the failure list. One human approval of an innocuous-looking rename therefore walks caps.ts permanently OUT of Class-2 - every subsequent edit and its eventual deletion go unapproved. That is a durable defeat of Law 2, not a curiosity.

ROOT CAUSE: /home/user/New-skills-/fullburn/engine/scripts/diff-lib.mjs:12 does `line.split("\t")` and never strips git's core.quotePath quoting or octal escapes. Neither CLI (class2-gate.mjs:21, adversary-gate.mjs:74) passes -z or sets core.quotePath=false. All 13 CLASS2_PATTERNS in gate-lib.mjs are anchored `^fullburn\/...` or `^\.github\/`, so a leading double-quote makes every one miss. engine/test/hardening.test.ts feeds parseNameStatus only plain ASCII (lines 195, 202), which is why 148 green tests say nothing about this.

NOT ALREADY DISCLOSED: LIVE_VERIFICATION_LEDGER L1-L13 make no mention of path quoting; L13 covers only who-approved-vs-what-approved. NOT DEFERRED: ENGINE_BUILD.md Sec 13 Class 2 is a standing law, and diff-lib.mjs's own header claims renames now "land inside the protected set rather than outside it". INTRODUCED BY THE R2 FIX: diff-lib.mjs is new in 7a8067e.

APPEND-ONLY HALF IS GENUINELY CLOSED (verified): a report rename emits the old path unquoted (R100 fullburn/reports/ADVERSARY_REPORT_phase0.r2.md "...r2\303\261.md") and checkReportsAppendOnly matches on oldPath, so reports cannot acquire a quotable name in the first place.

SEVERITY CORRECTION 5 -> 1. The Class-2 gate's entire purpose is blocking unapproved changes to money paths (config/src/ = caps.ts) and to the gates themselves (engine/scripts/, .github/). I landed a 1e9 cap table into config/src/ while the gate printed "no Class-2 changes". Bounded honestly: turning that into real spend needs a companion edit in a non-Class-2 module (config/package.json is itself Class-2 and ASCII, so the exports map remains gated), and no currently tracked file has a quotable name - so it is defeated change-control on the money path rather than a live cap breach today. Still severity 1, not dummy-proof.


### R3-CP-09 · dummy-proof · A human-approved rename of a Class-2 file is inexpressible as APPROVALS/README.md documents, and the gate leaks a raw git 'fatal:' line instead of a verdict

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** §13 Class 2; APPROVALS/README.md 'A change that renames a Class-2 file needs approval for BOTH paths'

**Reproduction:** In a clone, `git mv fullburn/config/src/caps.ts fullburn/config/src/caps.v2.ts` and write the approval exactly as APPROVALS/README.md prescribes — a block for the old path with `content-hash: deleted`, and a block for the new path with `from-content-hash: absent` (README: 'absent for a new file'). Run class2-gate. Then retry with `from-content-hash: deleted` on the new path.

**Observed:** Documented form: `fatal: path 'fullburn/config/src/caps.v2.ts' exists on disk, but not in <BASE>` printed to stderr, then `CLASS-2 GATE FAIL: ... caps.v2.ts (renamed)`, EXIT=1. Undocumented form: EXIT=0. Cause: for a rename destination checkClass2Approvals takes the non-'added' branch and calls safeHash(baseHashOf, path), whose catch returns the string "deleted" — so the sentinel meaning 'this transition ends in absence' is silently reused for 'the base content could not be read', and the only accepted approval reads 'from-content-hash: deleted' on a file that is being created. This is R2-31's family (approval inexpressible, operator sees a git error rather than the gate's verdict) reintroduced for renames by the R2-05/R2-31 fix, and APPROVALS/README.md is wrong as written. It fails closed, so nothing lands — the harm is that a legitimate human-approved rename is blocked with misleading output.

**Independent verifier:** REPRODUCED BY EXECUTION, both halves, in a fresh clone at 7a8067e (repo working tree left clean; scratch clone deleted).

(1) Documented form fails. `git mv fullburn/config/src/caps.ts fullburn/config/src/caps.v2.ts`, approval written exactly as APPROVALS/README.md prescribes (old path: from-content-hash=<base sha>, content-hash: deleted; new path: from-content-hash: absent per README's "absent for a new file", content-hash=<new sha>). `node engine/scripts/class2-gate.mjs .. 7a8067e` printed:
  fatal: path 'fullburn/config/src/caps.v2.ts' exists on disk, but not in '7a8067e'
  CLASS-2 GATE FAIL: Class-2 changes without a matching human approval for this transition (Law 2/14/15): fullburn/config/src/caps.v2.ts (renamed)
  EXIT=1

(2) Undocumented form passes. Same diff, `absent` -> `deleted` on the new path only: still leaks the same raw `fatal:` line, then `class2 gate: Class-2 changes carry transition approvals`, EXIT=0.

(3) Control I added to bound it: moving the file AND replacing its contents makes git report D+A instead of R100; with the documented `absent` form that gives EXIT=0 with no `fatal:` line. So the documented procedure is correct only for a move git does NOT detect as a rename, and wrong for exactly the case the README's rename sentence addresses.

Mechanism confirmed in source: gate-lib.mjs:262 `const wantFrom = f.status === "added" ? "absent" : safeHash(baseHashOf, f.path);` — a rename destination has status "renamed", so "absent" is unreachable for it. safeHash (gate-lib.mjs:278-286) calls baseHashOf, which shells `git show <base>:<newpath>`; the path does not exist at base, git writes `fatal:` to inherited stderr and execSync throws, and the catch returns the string "deleted". The sentinel documented as "this change removes the file" is silently reused for "base content unreadable", so the only accepted approval for a file being CREATED reads `from-content-hash: deleted`.

Introduced by the r2 fix — verified: at df95668 there is no from-content-hash, no baseHashOf, no safeHash, no `-M` on the diff, and the README has no rename clause. All of it arrives in 7a8067e.

Not caught, not disclosed: engine/test/gates.test.ts:203-211 has only the NEGATIVE rename case (rename with no approval -> blocked); there is no test for an approved rename, and the stub `baseHashOf = () => "cafe01"` (:127) never throws so the sentinel branch is never exercised. npm test = 148/148 passing with the defect live. LIVE_VERIFICATION_LEDGER.md has no mention of renames, "absent", or the sentinel, so L1..L13 do not cover it. It is Phase-0 material (§13 Class 2 + a live APPROVALS/README.md), not deferred.

SEVERITY: claimant's "dummy-proof" (5) is correct and I am not changing it. It fails closed — the documented form exits 1 and nothing lands, and the undocumented form still requires a hand-written human approval carrying the correct new-content sha, so no unauthorized change is admitted. No money path, no ban risk, no isolation break. Not a severity-3 data lie either: the false statement (`from-content-hash: deleted` on a file being created) sits in an internal governance record, not a client-visible number. Same reasoning R2-31 used to rank itself 5. The real harm is that a legitimate human-approved rename of a Class-2 file is inexpressible as documented and the operator sees a raw git error instead of the gate's verdict.

SECONDARY OBSERVATION (not escalated, worth passing to the builder): because safeHash's catch returns a constant, the "from" pin degenerates to a fixed sentinel for every rename destination and conveys no base-state information. That is no weaker than `absent` already is for added files, so it is not an R2-05 replay regression — but the R2-05 transition-pinning property genuinely does not hold on the rename-destination path.


### DT-05 · dummy-proof · Two threshold values are weaker than the only numbers the spec quantifies, and H9 asks the human to approve them without naming them

**Spec:** ENGINE_BUILD.md §12 rows 'Marketing engine' and 'Business health'; §6 economics targets; §5.1 SLAs

**Reproduction:** Line-by-line compare of GRADE_AREAS against the §12 'A means' column plus the sections §12 defers to for the numbers; then computeGrades on an all-A snapshot with blended_roas 4.2 and human_queue_median_latency_hours 71.

**Observed:** All 8 §12 rows and all 32 'A means' criteria are present and biting (verified: the 10 criteria R2-21 listed as missing now each drop their area, 21 enforcement actions), so R2-21 is closed. Two VALUES diverge from the spec's own quantifications: (1) blended_roas >= 4 — §12 says 'blended ROAS >= target' and the only target the spec states is §6's '$1 in -> $5 out'; a reading of 4.2 grades A. (2) human_queue_median_latency_hours < 72 — §5.1 sets severity 1-2 at same-day and 3-5 at 72h, so a median under 72h is satisfied by a month in which every severity-1 item breached its SLA; §12 says 'median latency < SLA', which for the severities that matter is 24h. Both are Class-2 values the human owns, and this is a judgment call for them rather than a code defect — but HUMAN_TASKS.md H9 asks for sign-off on 'initial Grade Registry A-thresholds' without stating either number or the divergence, so the human cannot exercise that judgment from the task list alone.

**Independent verifier:** REPRODUCED BY EXECUTION. Severity confirmed as dummy-proof (5); the claim's "introduced by the r2 fix: false" metadata is CORRECTED to true for the ROAS half.

WHAT I RAN. From /home/user/New-skills-/fullburn: `npm test` (14 files / 148 tests green), `npm run typecheck` (clean), `node engine/scripts/leak-check.mjs ..` ("leak/structural scan: clean"). All probes were written into a pristine `git archive HEAD` copy under the scratchpad; the real working tree is left clean (`git status --porcelain` = 0).

BEHAVIOUR REPRODUCED. I built an all-A snapshot generated from GRADE_AREAS itself and called computeGrades/enforcement in /home/user/New-skills-/fullburn/engine/src/grade-registry.ts:
- blended_roas 4.2 -> marketing-engine grade "A", failing []. Boundary probe: 4.0 -> A, 3.99 -> BELOW_A.
- human_queue_median_latency_hours 71 -> business-health grade "A".
- Both together -> all 8 areas A and enforcement() returns 0 actions.
Both values are exactly as claimed, at /home/user/New-skills-/fullburn/config/src/grade-thresholds.ts:36 ({key:"blended_roas", op:">=", value:4}) and :102 ({key:"human_queue_median_latency_hours", op:"<", value:72}).

THE DIVERGENCE IS REAL. Grepping ENGINE_BUILD.md for every ROAS/SLA quantification: the ONLY ROAS target stated is §6 line 210, "Economics targets: ... $1 in -> $5 out", i.e. ROAS 5. §12 line 370 says "blended ROAS >= target". The encoded 4 therefore matches no number anywhere in the spec (line 409's "30-day ROAS >= 1.5" is the client-zero $2K sprint EXTENSION rule, explicitly not the operating target). For latency, the only quantification is §5.1 line 184: "Severity 1-2: same day. Severity 3-5: 72h." §12 line 377 says "median latency < SLA". A single blended median compared to 72 is the loosest of the two bands, so a month in which every severity-1 item breached its same-day SLA still grades A.

H9 DISCLOSURE GAP CONFIRMED. /home/user/New-skills-/fullburn/HUMAN_TASKS.md:16 reads in full: "H9 - Approve initial Grade Registry A-thresholds (§12) - tuned in Phase 0, human-owned thereafter (Law 14, Class 2)." No number, no divergence. Grepping every .md in the repo for `blended_roas`/`median_latency` returns one hit, an unrelated test-snapshot value in the r2 report. The human is asked to approve 32 numbers by reference.

TWO FINDINGS THE CLAIMANT MISSED, BOTH AGGRAVATING.
(1) `git show df95668:fullburn/config/src/grade-thresholds.ts | grep -c blended_roas` returns 0 — the value 4 was INTRODUCED BY THE R2 FIX COMMIT (7a8067e), not pre-existing. Meanwhile HUMAN_TASKS.md:21 tells the human "Nothing here changes a *value* you own - caps and thresholds keep their pending-sign-off state." That is inaccurate for a brand-new Class-2 value that never had a prior state. (human_queue_median_latency_hours 72 did pre-exist, so the claim's metadata is half right.)
(2) The builder's own all-A fixture in engine/test/grade-registry.test.ts:8,34 uses blended_roas 5.1 and latency 18 — the SPEC's numbers, not the encoded thresholds. Nothing anywhere exercises the 4-5 or 18-72 gap.

NOTHING DEFENDS THE VALUES IN CODE. I widened the bar in the scratchpad copy (4 -> 1, 72 -> 720, i.e. a 30-day median latency) and re-ran the full suite: all 148 tests still pass. No test pins the threshold values. The sole defence is the class2-gate (confirmed: engine/scripts/gate-lib.mjs:48 lists config/src/grade-thresholds.ts as Class 2) plus H9 sign-off — and H9 names neither number. So the disclosure gap IS the entire defence, which makes it load-bearing rather than cosmetic. This also engages §12's anti-Goodhart clause ("No agent... may move the bar it is measured against"): the builder authored a bar one notch easier than the spec's own target and the human's check is defeated by omission.

WHY NOT real=false. Not already disclosed: LIVE_VERIFICATION_LEDGER L1-L13 contain no threshold-value entry. Not a duplicate of R2-21: I re-ran that attack and all 32 criteria bite (32/32, zero dead), so R2-21 is genuinely closed — R2-21 and the r2 report's spec-observation #6 concern MISSING criteria, not divergent values. Not deferred: §12 says thresholds are "tuned in Phase 0", the current phase. Not a style opinion: it is a specific numeric divergence from two specific, quoted spec clauses.

SEVERITY. Dummy-proof (5) is correct on this project's ladder and I am not raising it. No money loss is reproducible today: ad-spend caps are unenforced until Phase 6 (honestly disclosed in caps.ts), no warehouse exists (ledger L9), and the ROAS bar only gates autonomy step-downs with no live autonomy to step down. I could not establish that grade reports reach the client surface (§8's four screens), so severity 3 does not apply either. The actionable defect is the uninformed human sign-off. Flagging for the human: the ROAS half should be re-rated upward if grade reports ever become client-visible, or once Phase 6 puts real spend behind the Law 14 freeze.


### C1 · 5 dummy-proof · Two r2 fixes are defeated by a one-line revert with the suite still 148/148 green: R2-27's hostile-value guard and R2-29's .github scan root

**Spec:** engine-adversary.md Phase B: 'For every gap found, write a deterministic automated test that reproduces it. The test must fail against the pre-fix code and pass after.' CLAUDE.md build protocol: nothing is done until the adversary's deterministic tests are green in CI.

**Reproduction:** Nine one-line mutations, each applied, measured with `npm test` + `node engine/scripts/leak-check.mjs ..`, then restored with `git checkout -- .`. M4: redact.ts `describe()` — replace `try {` with `if (true) {` and drop the catch, i.e. reinstate the unguarded read R2-27 was filed for. M5: leak-check.mjs:18 — `const ROOTS = ["fullburn", ".github"]` back to `["fullburn"]`.

**Observed:** Executed. M4: Test Files 14 passed, Tests 148 passed, leak-check clean — and the defect is fully back. Unit level: a thrown value with a throwing `message` getter escapes redactError as `Error: boom canary-vault-value-do-not-leak-8891`; a Proxy with a throwing getPrototypeOf trap escapes as `Error: proto canary-...`. End-to-end level: a vault whose get() throws such an object makes llm() exit with `thrown ctor: Error | leaked canary: true | trace events: []` — the exact R2-27 signature, raw secret plus zero traces. The same probe against the shipped code gives `GatewayError | leaked canary: false | msg: [unprintable error] | trace events: ["error"]`. M5: 148/148 green and leak-check clean, while the planted-token walk proves `.github/workflows/fullburn-ci.yml` becomes invisible again. CONTROL, so this is calibrated and not a blanket complaint: M1 (R2-30 NUL key), M2 (R2-14 un-redacted trace input/output), M3 (R2-15 bare /test/ exemption), M6 (R2-28 refusal trace), M7 (R2-13 literal provider hosts), M8 (PEM header-only) and M9 (empty DECLARED_FIXTURES) ALL turn the suite red — seven of nine fixes are properly guarded. Only these two are not. Tree verified clean afterwards: `git status --porcelain` empty, 148/148 green, typecheck clean, leak-check clean.

**Independent verifier:** REPRODUCED BY EXECUTION. Confirmed real, with one mechanism correction and a severity correction.

WHAT I RAN (all from /home/user/New-skills-/fullburn, probes in scratchpad only, tree restored with `git checkout -- .` after every mutation).

Baseline @7a8067e, clean tree: `npm test` 14 files / 148 tests passed; `npm run typecheck` clean; `node engine/scripts/leak-check.mjs ..` "leak/structural scan: clean".

M4 — /home/user/New-skills-/fullburn/engine/src/redact.ts, `describe()`: `try {` -> `if (true) {`, `} catch { return UNPRINTABLE; }` -> `} return UNPRINTABLE;` (reinstates the unguarded read R2-27 was filed for).
  - npm test: Test Files 14 passed, Tests 148 passed. typecheck clean. leak-check clean.
  - Ran engine/test/hardening.test.ts alone: 11/11 passed. That file contains the test LITERALLY NAMED for this fix — "a hostile thrown value cannot smuggle the secret out through a getter" (hardening.test.ts:136, under `describe("secret containment (R2-14, R2-27)")`). It passes against the pre-fix code, so it never reproduced R2-27. Its hostile object's getter throws `new Error("boom")` — no canary — so the escaping error carries nothing to assert on.
  - My unit probe against `redactError` directly: with M4 it THROWS OUT the attacker's raw error — `Error: boom canary-vault-value-do-not-leak-8891` (plain object with throwing `message` getter), `Error: getter canary-...` (real Error with a redefined throwing `message`), `Error: proto canary-...` (Proxy with throwing getPrototypeOf/get/ownKeys). Shipped code returns `Error: [unprintable error]`, leaked=false, for all three.
  - End-to-end through the real `llm()` with a vault whose `get()` throws such a value: with M4 -> `thrown ctor: Error | leaked canary: true | msg: Error: boom canary-vault-value-do-not-leak-8891 | trace events: []`. Shipped -> `GatewayError | leaked canary: false | msg: Error: [unprintable error] | trace events: ["error"]`. Exact R2-27 signature: raw secret out, zero traces.

MECHANISM CORRECTION the claimant overstated: "the defect is fully back" is too broad. I also ran the TRANSPORT-throw path (the path R2-27 was originally filed on) under M4 and it stayed safe: `GatewayError | leaked canary: false | msg: Error: boom [redacted] | trace events: ["error"]`. Reason: gateway.ts:167 throws out of the inner catch into the outer catch at gateway.ts:190, which calls `redactError` a second time (gateway.ts:202-204) with `secrets` already populated, so the attacker string gets redacted. The leak returns only on paths that fail BEFORE `secrets = [key.value]` (gateway.ts:151-152) — e.g. a throwing `vault.get()` — where `secrets` is `[]` and `describe()` is the only guard. This narrows the blast radius; it does not make the finding false. The R2-27 unit guard is genuinely unlocked, and there is a live end-to-end path with zero coverage.

M5 — engine/scripts/leak-check.mjs:18, `const ROOTS = ["fullburn", ".github"]` -> `["fullburn"]`.
  - npm test 148/148 passed; typecheck clean; `node engine/scripts/leak-check.mjs ..` clean.
  - Structural proof it is unreachable: nothing in engine/test or config/test imports `scanTree` or `walk`. scan-lib.test.ts (21 tests) only calls `scanContent(path, content)` with inline strings, so ROOTS cannot be observed by the suite by construction.
  - Behavioural proof on a SYNTHETIC root in scratchpad (no repo writes): planting one `sk-ant-api03-...` in `fullburn/engine/src/a.ts` and one in `.github/workflows/fullburn-ci.yml`, then walking with the shipped rules — ROOTS=["fullburn"] walks 1 file, 1 finding; ROOTS=["fullburn",".github"] walks 2 files, 2 findings including `.github/workflows/fullburn-ci.yml: possible anthropic key`. The workflow that legitimately handles secrets goes invisible again, silently.

CALIBRATION (I did not take the claimant's control set on trust): M1 — vault.ts `#key` length-prefix -> `${clientId} ${name}`: Tests 1 failed | 147 passed. M3 — scan-lib.mjs TEST_OR_FIXTURE anchored regex -> bare `/\/test\//`: Tests 1 failed | 147 passed. So the suite really does lock other r2 fixes; this is a targeted gap, not a blanket complaint.

SPEC BASIS: engine-adversary.md Phase B.1 — "For every gap found, write a deterministic automated test that reproduces it. The test must fail against the pre-fix code and pass after." Violated twice: for R2-29 no such test exists at all; for R2-27 a test exists, is named for the finding, and passes against pre-fix code. CLAUDE.md build protocol — "Nothing is 'done' until the engine-adversary subagent returns a PASS report and its deterministic tests are green in CI" — is unmet for these two. Not disclosed anywhere in LIVE_VERIFICATION_LEDGER.md (L1-L13 say nothing about unguarded fixes; L5 concerns live secret material, a different point).

SEVERITY CORRECTED 5 -> 4. "Dummy-proof" is the wrong bucket: nothing here concerns a non-technical client misusing or misreading output. The scale ranks a finding by the harm it bears on, and what is left unguarded is secret containment on both counts — R2-27 was filed in the r2 report as `[A4-isolation]` and its silent regression puts the vault token into an escaping error with no trace (CLAUDE.md standing invariant 11: "OAuth tokens live only in the vault; one appearing in code, logs, or traces is a critical defect"), and R2-29's regression blinds the token scanner to the one directory in the repo that legitimately handles secrets. Isolation / secret containment = severity 4. It is not severity 3 or higher: the shipped code at 7a8067e is correct today, so no secret is currently escaping and no money or ban-risk path is touched.


### C3 · 5 dummy-proof · The new stem-based prediction rule fires on ordinary reconciliation and eval naming, and simultaneously misses this codebase's own money-identifier convention

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** Law 6 (CLAUDE.md:10) 'No prediction gates. LLM prediction only tiebreaks which candidates ship — never blocks or greenlights on predicted performance.' ENGINE_BUILD.md:127 mandates a `counterfactual_ledger` holding 'projected cost had it kept running (feeds the monthly client report)'.

**Reproduction:** The rule is `/\b(?:predict|forecast|projected|expected|estimated)[A-Za-z_]*(?:Performance|Ctr|CTR|Roas|ROAS|Winner|Probability|Score|Conversion|Revenue|_ctr|_roas|_winner|_score)\b|.../`. Probed with 18 evasion candidates and 8 legitimate-code candidates at `fullburn/engine/src/x.ts`.

**Observed:** Executed. FALSE POSITIVES (all CAUGHT, all legitimate, none of which gates anything): `const expectedRevenue = warehouse.actualRevenue;` (the standard reconciliation expected-vs-actual pairing Law 10 requires), `const estimatedRevenue = clickhouse.query('sum(revenue)')`, `const expectedConversion = stripeVerifiedConversions;` (warehouse-VERIFIED revenue, i.e. the opposite of a proxy gate), `const estimatedScore = evalHarness.score();`, `const projectedScore = 0; // budget pacing`, and even a prose comment `/** expectedScore from the eval golden set */`. ENGINE_BUILD.md:127's own `counterfactual_ledger` becomes uncodeable as `projectedRevenue`. EVASIONS (all MISSED) — the trailing `\b` means any suffix breaks the rule, and this repo suffixes every money identifier: `predictedRevenueUsd`, `predictedRoasUsd`, `predicted_roas_usd`, `expectedRoas7d`, `predictedCtr30d`, `predictedScoreV2` are all MISSED while the unsuffixed `predictedRevenue` is CAUGHT. The house convention is visible throughout the code I read — `dailyAiSpendUsd`, `costBudgetUsdPerCall`, `amountUsd`, `todayUsd`, `reservedUsd`, `fromMicros` — so the single most likely real spelling evades. Also still missed from R2-13's original list: `pWin`, `predicted.roas` (member access), `likelyRoas`, `roasForecast`, `ctrPrediction`, `probabilityOfWin`. STATED PLAINLY: leak-check is clean on the repo today, so there is no live false positive — the harm is prospective, and it is the bad kind, because the first engineer to hit a red CI on `expectedRevenue` will be arguing to weaken the rule rather than to fix code.

**Independent verifier:** REPRODUCED BY EXECUTION. Ran from /home/user/New-skills-/fullburn at commit 7a8067e: `npm test` (14 files, 148 passed), `npm run typecheck` (clean), `node engine/scripts/leak-check.mjs ..` (clean). Then probed /home/user/New-skills-/fullburn/engine/scripts/scan-lib.mjs directly via a throwaway script in scratchpad, calling scanContent("fullburn/engine/src/x.ts", src).

EVASION HALF — CONFIRMED. Baseline `const predictedRevenue = m();` and `const predictedRoas = m();` are CAUGHT. Every suffixed variant is MISSED: predictedRevenueUsd, predictedRoasUsd, predicted_roas_usd, predictedRoasMicros, expectedRoas7d, predictedCtr30d, predictedScoreV2, predictedRevenues (plural), forecastRoasBand, expectedCtrLift. Root cause is the trailing \b in scan-lib.mjs:55 — the noun alternation (?:Performance|Ctr|CTR|Roas|ROAS|Winner|Probability|Score|Conversion|Revenue|_ctr|_roas|_winner|_score) must terminate on a word boundary, so any alphanumeric or underscore suffix defeats the whole alternative and backtracking cannot recover. The claimant's house-convention argument holds on measurement, not assertion: `grep -rnoE "\b[a-zA-Z_]*(Usd|_usd|Micros|micros)\b" engine/src config/src` yields dailyAiSpendUsd x13, dailyAdSpendUsd x8, amountUsd x8, totalAdSpendUsd x7, committedMicros x7, reservedMicros x6, capUsd x6, amountMicros x6, fromMicros x5, todayUsd x4, effectiveDailyAiCapUsd x4, reservedUsd x3, costUsd x3, capMicros x2. Every money identifier in this codebase carries a unit suffix, so the single most probable real spelling of a prediction gate (predictedRoasUsd) evades the rule that exists to catch it.

This falsifies the code's own claim. scan-lib.mjs:51-53 states the rule is "Stem-based rather than an enumeration of exact spellings (R2-13): any identifier built from predict/forecast/projected + a performance noun." predictedRevenueUsd is exactly such an identifier and is not caught. Per the mandate, a fix that only moved the defect is a finding, and the fix moved it from "wrong exact spellings" to "wrong suffixes."

REGRESSION HALF — R2-13 IS ONLY PARTIALLY CLOSED. R2-13 enumerated four misses: expectedRoas, predicted_roas, pWin, m.predicted.roas. Re-ran all four. expectedRoas -> CAUGHT (fixed). predicted_roas -> CAUGHT (fixed). `const pWin = m(); if (pWin < 0.4) return 'block';` -> MISSED. `if (m.predicted.roas < 2) return 'block';` -> MISSED. Two of the four cases the fix was written against are still open, and the rule only adds \b(?:win|success)Probability\b which does not reach pWin. Also missed: likelyRoas, roasForecast, ctrPrediction, probabilityOfWin.

FALSE-POSITIVE HALF — CONFIRMED. All of the following fire the prediction-gate finding at fullburn/engine/src/x.ts, and none of them gates anything: `const expectedRevenue = warehouse.actualRevenue;` (the expected-vs-actual reconciliation pairing Law 10 requires), `const estimatedRevenue = clickhouse.query('sum(revenue)');`, `const expectedConversion = stripeVerifiedConversions;`, `const estimatedScore = evalHarness.score();`, `const projectedScore = 0; // budget pacing`, `const projectedConversion = 0;`, and the bare prose comment `/** expectedScore from the eval golden set */`. The comment case matters: scan-lib.mjs:104 documents "Structural rules are claims about CODE, not about prose describing code," but that exemption only reaches non-CODE_FILE paths — a comment inside a .ts file is scanned as code. Confirmed the exemption list (STRUCTURAL_EXEMPT at :78) covers only fullburn/{config,engine}/test/, fullburn/engine/evals/, *.test.ts and the scanner itself, so engine/src/eval-harness.ts — real production code — cannot legally name a variable expectedScore or estimatedScore.

WHERE THE CLAIMANT OVERSTATED, AND I CORRECTED IT. The claim that "ENGINE_BUILD.md:127's own counterfactual_ledger becomes uncodeable as projectedRevenue" is not sustained by the spec text. :127 mandates "projected cost had it kept running," and I verified projectedCost and projectedCostUsd are both CLEAN (Cost is not in the noun list). :137's "expected metric impact" -> expectedMetricImpact is also CLEAN. So the spec-mandated field names are codeable; the false-positive case rests on expectedRevenue/expectedScore/estimatedScore, which is enough on its own.

WHY THIS IS NOT DISMISSIBLE. Not a style opinion: it is a measured failure of a guardrail against its own stated contract. Not disclosed in LIVE_VERIFICATION_LEDGER.md — L1..L13 cover gateway/Langfuse liveness, warehouse provisioning, vault encryption, repo protection and attestation provenance; none mention scanner coverage. Not deferred to a later phase: leak-check is itself a Phase 0 deliverable and the rule is armed today. Test coverage is the reason it survived — engine/test/scan-lib.test.ts:64-67 asserts exactly two positive strings (predictedRoas, winProbability) and zero negative/false-positive cases and zero suffixed variants, so the suite stays green at 148 across every miss above.

SEVERITY CORRECTION. Tiers 2 (ban risk), 3 (data lies) and 4 (isolation) plainly do not apply. Tier 5 is "anything a non-technical client could misuse or misread" — this rule is invisible to clients, so 5 is a category error. PREDICTION_GATE_IDENTIFIERS exists for one purpose: enforcing Law 6, which governs whether a model may block or greenlight creative spend. A detector that fails open on this repo's own money-naming convention lets "wrong kill/promote logic" ship undetected, which is tier 1's definition. I record it as tier 1 with the honest qualifier that the harm is prospective — the repo is clean today and there is no live money path in Phase 0 — and I note that the false-positive half taken alone would rate a 5.

REPO STATE. I made no writes to the repo; all probes live under the scratchpad. Unrelated observation for the parent: fullburn/engine/src/redact.ts showed as modified (2 insertions, 3 deletions) partway through my run despite a clean `git status --porcelain` at my start. That edit is not mine — a concurrent agent appears to be writing to the tree.


### H-17 · dummy-proof · HUMAN_TASKS.md's Class-2 approval list is wrong in both directions — it names four paths this commit never touched, and it defers eight test-tree paths the gate demands approvals for in this very commit

**INTRODUCED BY THE r2 FIX PASS.**

**Spec:** Law 15 / §13 Class 2 (human-only); H17; APPROVALS/README.md

**Reproduction:** Classify every path in `git show --name-status -M 7a8067e` through the real isClass2(), then compare against the '## Class-2 approvals owed for the Phase 0 fix commit' section. Then run `node engine/scripts/class2-gate.mjs . df95668` from the repo root.

**Observed:** class2-gate against the real base: EXIT=1, listing 26 unapproved Class-2 paths (APPROVALS/ contains only README.md, so no approval exists for anything).
Over-listed but NOT in the commit: fullburn/engine/src/tracing.ts (git show --name-only | grep -c tracing.ts -> 0), fullburn/vitest.config.ts, package.json x3, tsconfig*.json, fullburn/PHASE.
Under-listed: the test-tree bullet reads 'Expect approval entries for these paths on FUTURE PRs; that friction is the point' — but the gate demands them NOW for eight paths in this diff: config/test/{caps,models,switchboard}.test.ts and engine/test/{eval-rebind,gates,gateway,grade-registry,scan-lib}.test.ts, plus helpers.ts, invariants/invariants.test.ts and the added hardening.test.ts.
Net effect: a human following HUMAN_TASKS.md would sha256sum roughly 18 paths, four of which are unchanged, and class2-gate would still exit 1 on the eight it told them to defer. The human signs off on a different set than the one they changed — which is the failure mode the section exists to prevent.

**Independent verifier:** REPRODUCED. Ran `node fullburn/engine/scripts/class2-gate.mjs . df95668` from /home/user/New-skills- : EXIT=1, "CLASS-2 GATE FAIL: Class-2 changes without a matching human approval for this transition (Law 2/14/15)" listing 26 paths. `ls fullburn/APPROVALS/` contains only README.md, so no approval exists for anything. Independently classified all 30 paths of `git show --name-status -M 7a8067e` through the REAL isClass2()/parseNameStatus() imported from gate-lib.mjs and diff-lib.mjs: 26 Class-2, 4 not (APPROVALS/README.md, HUMAN_TASKS.md, and the two reports/ files).

Reconciled against the "## Class-2 approvals owed for the Phase 0 fix commit" section. The section's owed-now bullets name 17 paths. Both directions of the claim hold, under BOTH plausible PR bases:

OVER-LISTED (base df95668): fullburn/engine/src/tracing.ts and fullburn/vitest.config.ts are named as owed but are not in the diff. `git log -1 -- fullburn/engine/src/tracing.ts` -> df95668 (the PREVIOUS commit); `git log -1 -- fullburn/vitest.config.ts` -> 51432ac (two commits before df95668, in neither fix commit). Under the most charitable base 39324eb (treating both fix commits as one PR), tracing.ts becomes legitimate but vitest.config.ts is still over-listed.

UNDER-LISTED: the final bullet reads "Expect approval entries for these paths on future PRs; that friction is the point" for `fullburn/(config|engine)/test/**`, yet the gate demands them NOW for 11 test-tree paths in this very diff (13 under base 39324eb): config/test/{caps,models,switchboard}.test.ts, engine/test/{eval-rebind,gates,gateway,grade-registry,scan-lib,hardening}.test.ts, engine/test/helpers.ts, engine/test/invariants/invariants.test.ts.

INTRODUCED BY THE R2 FIX — confirmed by `git show 7a8067e -- fullburn/HUMAN_TASKS.md`. The pre-fix bullet read "gate hardening AND THE NEWLY PROTECTED FILES", where vitest.config.ts was a correct newly-protected mention. The r2 fix truncated the tail to "gate hardening" while keeping vitest.config.ts in the path list, turning a true statement into a false one. And it ADDED tracing.ts to the vault/redact bullet in a commit that does not touch tracing.ts. So "introduced by the r2 fix: true" is correct.

NOT DISCLOSED: ledger L13 discloses that approvals prove what, not who (CODEOWNERS/H19) — a different gap. `grep -rn HUMAN_TASKS --include=*.ts --include=*.mjs` finds no test binding the doc to the gate, so this drifted silently and will keep drifting.

CORRECTIONS TO THE CLAIMANT (direction right, counts wrong): (1) "four paths this commit never touched" — strictly TWO in the owed-now bullets (tracing.ts, vitest.config.ts). package.json x3 / tsconfig*.json / PHASE appear only in the final bullet that explicitly defers them to future PRs, so the claimant double-counted them, once as over-listed and again as the source of the under-listing. (2) "eight test-tree paths" — actually ELEVEN under base df95668 (13 under 39324eb); the claimant's own enumeration adds to 11, so only the headline number is wrong. (3) "roughly 18 paths" a human would hash — 17.

SEVERITY CONFIRMED AT 5 (dummy-proof), no escalation. Enforcement is correct: the gate demands all 26 and exits 1, so nothing merges unapproved. Extra approval blocks for untouched paths are inert — checkClass2Approvals iterates only `touched` — and a from==to self-loop block opens no future replay window, because approvals must be ADDED in the same diff and a transition only matches from the exact base state. The harm is precisely what the section exists to prevent: the human sha256sums a set that differs from the set that changed, signs off on two files they did not touch, and the gate is still red on the eleven the doc told them to defer.

Baseline confirmed green and unaffected: npm test 148/148, npm run typecheck clean, `node engine/scripts/leak-check.mjs ..` -> "leak/structural scan: clean", `git status --porcelain` empty. This is a documentation-only defect; the gate code itself is correct here.


### H-18 · dummy-proof · `npm run invariants` — the standalone invariant-suite stage §10.3 names — runs zero tests and exits 1 on the shipped tree

**Spec:** §10.3 CI gate; §11 Phase 0 deliverable 'CI pipeline'

**Reproduction:** From /home/user/New-skills-/fullburn: `npm run invariants`.

**Observed:** > vitest run --dir engine/test/invariants
  include: config/test/**/*.test.ts, engine/test/**/*.test.ts
  No test files found, exiting with code 1
EXIT=1
The `--dir` flag does not compose with the root-relative include globs in vitest.config.ts. No live risk today because .github/workflows/fullburn-ci.yml runs `npm test` rather than this script, so the invariants do execute in CI — but §10.3 defines the gate chain as 'typecheck → unit → integration → Playwright e2e → invariant suite', package.json advertises the stage, and the script cannot run. It is a false surface, recorded in no ledger entry. (It is also how I discovered it: the r2 report's R2-08 attack turned on rewriting this very script.)

**Independent verifier:** REPRODUCED BY EXECUTION on the shipped tree at commit 7a8067e, working tree clean before and after.

What I ran, from /home/user/New-skills-/fullburn:

1. `npm run invariants` → verbatim output:
   > vitest run --dir engine/test/invariants
   include: config/test/**/*.test.ts, engine/test/**/*.test.ts
   exclude: **/node_modules/** ...
   No test files found, exiting with code 1
   EXIT=1
   Exactly as claimed. The advertised standalone stage runs zero tests and hard-fails.

2. `npx vitest run engine/test/invariants` (path filter instead of --dir) → 1 file, 10 tests, all pass. So the invariant suite genuinely exists and is healthy; only the package.json script is broken.

3. `npm test` → 14 files / 148 tests pass, and the listing includes `engine/test/invariants/invariants.test.ts (10 tests)`. The invariants DO execute under the default script.

ROOT CAUSE confirmed as claimed: /home/user/New-skills-/fullburn/vitest.config.ts sets `include: ["config/test/**/*.test.ts", "engine/test/**/*.test.ts"]`. Those globs are resolved relative to the `--dir` root, so under `--dir engine/test/invariants` vitest looks for engine/test/invariants/engine/test/**/*.test.ts, which matches nothing. `--dir` does not compose with root-relative include globs.

SPEC / CLAIM VIOLATION — real, not a style opinion:
- ENGINE_BUILD.md §10.3 ("### 10.3 CI gate", line 296) defines the chain as "typecheck → unit → integration → Playwright e2e → invariant suite". package.json line 14 advertises `"invariants": "vitest run --dir engine/test/invariants"` as that stage, and the script cannot run. A stage the repo names and cannot execute is a false surface — precisely the dummy-proof class (a non-technical operator or a future automation shelling the advertised stage sees a red exit and concludes the invariants are broken, or "fixes" CI by wiring it to the broken script).
- Not disclosed anywhere. I grepped .github/workflows, package.json and reports/LIVE_VERIFICATION_LEDGER.md for "invariants": the only hit is package.json:14. Ledger L1..L13 do not cover it — L5 covers "CI runs on GitHub Actions with secrets in repo settings", a different thing entirely. So the "already honestly disclosed" exit does not apply.
- Not deferred to a later phase: §11 Phase 0 names "CI pipeline" as a Phase 0 deliverable (ENGINE_BUILD.md line 306).

CORRECTION TO THE CLAIMANT'S EVIDENCE (does not change the verdict): the claimant located the workflow as `.github/workflows/fullburn-ci.yml` inside fullburn/. There is no .github directory under /home/user/New-skills-/fullburn — the file lives at the monorepo root, /home/user/New-skills-/.github/workflows/fullburn-ci.yml. I read it, and the claimant's substantive point holds: its `verify` job runs `npm run typecheck`, then step "Unit + invariant suite" runs `npm test` (not `npm run invariants`), then the leak-check. Since `npm test` picks up engine/test/invariants/invariants.test.ts, the invariants really do execute in CI, and the broken script is never invoked there.

SEVERITY — claimant said dummy-proof (5); I confirm 5, no escalation. I checked for a path to a higher class and found none: there is no money, ban, data-lie or isolation exposure, and the failure mode is fail-CLOSED (exit 1), so even a Class-1 auto-pipeline gate (§13 "full invariant suite") that shelled this script would block rather than wave a change through. The defect is that the repo advertises a runnable gate stage that does not run — a false surface, severity 5.

Files: /home/user/New-skills-/fullburn/package.json (line 14), /home/user/New-skills-/fullburn/vitest.config.ts, /home/user/New-skills-/.github/workflows/fullburn-ci.yml, /home/user/New-skills-/fullburn/engine/test/invariants/invariants.test.ts.


### H-19 · dummy-proof · Ledger L1–L13 are individually accurate — L12's in-process-ceiling admission is correct — but four unmet items have no entry, so the ledger overstates how much of Phase 0 is known-and-tracked

**Spec:** §11 Phase 0 deliverables and AC; §10.3; Law 9; adversary finding R7 (the ledger's own purpose)

**Reproduction:** Read LIVE_VERIFICATION_LEDGER.md against the executed Phase 0 deliverable/AC checklist below and against findings H-02, H-16, H-18.

**Observed:** L12 VERIFIED ACCURATE by execution: on shipped code `Object.create(EvalAttestation.prototype)` with role/modelId/score set IS refused, and a fabricated one-case run through the real factory IS refused — so 'a literal no longer binds' is true, and 'any module that can import the factory can call it … not cryptographic provenance' is exactly the residual gap. L13 accurate (approvals are transition-bound; I reproduced the replay refusal). L1–L11 accurate as far as is checkable in-sandbox.
MISSING ENTRIES: (1) the R2-13 scanner residue — registry dot-access/destructuring, env.AI.run(), @ai-sdk/@langchain wrappers, six provider hosts, non-code files (H-02); (2) the sibling client trees are never scanned (H-16); (3) `npm run invariants` is broken (H-18); (4) §10.3's 'integration' and 'Playwright e2e' stages have no code and no deferral entry anywhere (L7 covers only the workerd pool).
PHASE 0 CHECKLIST (executed): MET — monorepo scaffold; config/caps.ts; Grade Registry scaffold + thresholds (8 areas, 32 metrics); CLAUDE.md + adversary agent; switchboard files present; AC3 (registry computes and publishes from seeded data); AC5 (cap constants exist, runtime mutation throws TypeError — verified). PARTIAL, ledger-disclosed — model abstraction layer (L2, L3); AI Gateway wiring (L1, L4); Langfuse tracing helper (L1, L3); AC1 (L1); AC2 (rebind gpt-5 → qwen-72b passes in-sandbox at eval-rebind.test.ts:20, live half L2); AC4 (gates work in-sandbox, never run on github.com — L5); OAuth vault (L10); CI pipeline (L5). NOT MET, ledger-disclosed — ClickHouse + Airbyte (L9); fullburn.ai + trademark (L6); cross-family adversary re-review (L8, and I am again a Claude-family adversary, so L8 remains open after this review too). PARTIAL, NOT disclosed — switchboard 'structurally inert' (true only through the accessors; CHANNELS/MARKETS are exported raw and dot access is unscanned, H-02); CI pipeline's integration/e2e/invariants stages (H-18).
ITEM 6, ADJUDICATED CLEAN: neither engine/test/adversary-phase0.test.ts nor config/test/adversary-phase0.test.ts appears in `git show --stat 7a8067e` — the builder did not touch the adversary lock tests in this commit. The two BUILDER MODIFICATION banners in those files date from df95668 and both hold up: the F3 banner replaced 'all 20 billable calls are metered' with 'the cap bounds them to 5 and every one is charged', which I confirmed is strictly stronger (mutating the cap comparison to capMicros*2 fails that test), and the F9 casts preserve the runtime refusal (mutating assertAttestation's WeakSet does not save them because they pass bare numbers — that is H-04, a coverage gap, not a weakening). R2-17's vacuous-hash defect was closed in gate-lib rather than by editing the lock test, and I proved the F4 block is now genuinely reached: relaxing parseVerdict's column-0 anchor makes adversary-phase0.test.ts's 'prose decoy' test go RED, which was impossible before the fix.

**Independent verifier:** REAL, but only one of the four claimed omissions survives. Severity corrected upward to 3 on the project's own precedent.

WHAT I RAN (all from /home/user/New-skills-/fullburn, probes under scratchpad, working tree left clean — final `git status --porcelain` empty):
- `npm test` → 14 files, 148 passed. `npm run typecheck` → clean. `node engine/scripts/leak-check.mjs ..` → "leak/structural scan: clean".
- `npm run invariants` → `No test files found, exiting with code 1`. Broken, reproduced. BUT `npx vitest run --reporter=verbose | grep invariants` shows engine/test/invariants/invariants.test.ts DOES execute under `npm test`, and /home/user/New-skills-/.github/workflows/fullburn-ci.yml:28-29 runs `npm test` under the step name "Unit + invariant suite". So the invariant STAGE is genuinely covered in CI; only the standalone script is dead.
- scan-lib probe (scratchpad/probe.mjs, importing the shipped engine/scripts/scan-lib.mjs): 13 bypass classes MISSED — `MARKETS.de`, `const {tiktok} = CHANNELS`, `env.AI.run(...)`, `@ai-sdk/openai`, `@langchain/openai`, deepseek/x.ai/perplexity/cohere/replicate/huggingface/azure-openai/bedrock hosts; controls `api.openai.com` and `MARKETS["de"]` CAUGHT. Structural rules also skip .py/.go/.sh. H-02's residue is real.
- scanTree probe on a fresh fakeroot with fullburn/, haven/, pulsern/ each holding a planted token: only `fullburn/engine/src/a.ts` reported; haven/ and pulsern/ secrets missed. leak-check.mjs:18 `ROOTS = ["fullburn", ".github"]`. H-16 real. (Note: /home/user/New-skills-/haven and /pulsern really exist.)
- `grep -rn -i "playwright|e2e|integration"` across the repo, HUMAN_TASKS.md, both adversary reports, APPROVALS/, .claude/ and the CI workflow: ZERO hits in any code or config. fullburn-ci.yml runs typecheck → npm test → leak-check → adversary-gate → class2-gate. §10.3 (ENGINE_BUILD.md:296) mandates "typecheck → unit → integration → Playwright e2e → invariant suite".

WHY IT IS REAL — item (4) only. "CI pipeline" is a named Phase 0 deliverable and §10.3 is its definition. Two of its five stages have no code, and NOTHING in the repo records that: ledger L5 discloses a different thing (never run on github.com / real secret material), HUMAN_TASKS.md is silent, both adversary reports are silent. The builder silently decided two spec'd stages are unnecessary. That is precisely the defect the ledger exists to prevent: F10 in reports/ADVERSARY_REPORT_phase0.md:190 ("The live-verification ledger omits unmet Phase 0 deliverables") was accepted on identical logic, and the fix was to ADD rows L9/L10/L11 — including L10 (vault encryption), which is fully buildable in-sandbox and is not a "live half" at all. So the ledger's de-facto contract in this project is "unmet Phase 0 deliverables get an entry", not the narrow live-half wording in its header. Under that contract the missing CI stages qualify and are absent.

WHERE THE CLAIMANT OVER-REACHES — items (1), (2), (3) do NOT belong in the ledger. H-02, H-16 and H-18 are open defects being filed as findings in this very review cycle. The ledger tracks what will remain unmet after the gate closes and cannot be fixed here; a bug the builder is about to fix is already "known-and-tracked" by the finding itself. Demanding a ledger row for every live finding is double-bookkeeping and would dilute the artifact. The claimant's arithmetic ("four unmet items") is therefore 1, not 4.

ALSO CONFIRMED, in the claimant's favour: L1–L13 are individually accurate as far as is checkable in-sandbox — I re-read all thirteen against the code (L7 vs vitest.config.ts `environment: "node"`, L10 vs vault.ts's in-memory Map, L11 vs the absence of any CODEOWNERS file, L12's in-process-ceiling wording vs the attestation factory). No entry overstates. The defect is purely the omission.

SEVERITY. The claimant filed 5 (dummy-proof). The identical prior finding F10 was banded S3 · DATA LIES / GOVERNANCE in reports/ADVERSARY_REPORT_phase0.md (section header at line 131). The ledger is the gating honesty artifact — its own text says "While any entry is open, every phase verdict is CONDITIONAL" — so an unmet spec'd deliverable element missing from it misrepresents the phase's completeness to the human at the gate. Consistency with F10 requires 3, not 5. It sits at the low end of that band (the omitted stages have nothing to exercise in Phase 0 — no endpoints, no UI), and the right remedy is one ledger row plus a human decision on whether §10.3's integration/e2e stages are deferred to Phase 1, not building Playwright now.


---

## Refuted claims (do not re-spend effort)

- **M-07** — The behaviour reproduces exactly, but it violates neither the spec nor the code's own claims, so it is not a finding.

REPRODUCED (probes under scratchpad; repo tree left clean; `npm test` 148/148 green, `npm run typecheck` clean):
Two MemorySpendMeter instances, same client. A.reserve("acme",0.01,25) -> {id:"r1"}; B.reserve("acme",4.99,25) -> {id:"r1"}. A.settle(hB) => A.today 0.01, A.reserved 0; B.today 0, B.reserved 4.99. Ids are per-meter (`#seq`), so B's handle collides with A's own r1 and the open.clientId guard (spend-meter.ts:151) passes. The claimant's forgery-guard confirmations are 
- **H-01** — Mechanics reproduce exactly; the causal claim does not survive. Ran the claimant's probe unmodified against the shipped tree (commit 7a8067e, no file edited, repo left clean; baseline 148/148 green, typecheck clean, leak-check clean): a genuine attestEvalRun('genome-tagger','llama-70b', all-failed) scores 0; bindRole with default cards refuses ('scored 0 < threshold 0.8'); with caller cards at evalThreshold 0 it BINDS; with side:'neutral' cards it binds builder onto the adversary's family; validateBindings passes a family-colliding map under neutral cards. All four observations confirmed.

But