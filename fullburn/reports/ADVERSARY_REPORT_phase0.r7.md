# ADVERSARY REPORT phase0.r7
Verdict: FAIL
verified-tree: 6f10a99d77a6a308c34709ac6a95c401fb7a0835

## Review scope and evidence status

Independent cross-family, source-only review of the code embedded in `CROSS_FAMILY_REVIEW_BRIEF.md` for target commit `6be41684d7ea2a747dac0254469aeadf9e906e04`. I did not receive the repository and therefore did not execute its 252-test suite or mutation harness.

I executed isolated reproductions of the exact relevant logic for R7-01, R7-02, and R7-08. All other findings are reasoned directly from the supplied source and are labelled accordingly. The reproduced checks do not prove repository wiring; they prove the supplied functions exhibit the stated behavior.

## Ranked findings

| ID | Severity | Domain | Gate consequence |
|---|---:|---|---|
| R7-01 | 1 — money loss | Adversary gate | A PASS can be hidden in an unclosed HTML comment and accepted. |
| R7-02 | 1 — money loss | Spend periods | The claimed client-local daily cap is implemented as UTC and can admit $20 in one local day under a $10 cap. |
| R7-03 | 1 — money loss | Spend clock | A valid but manipulated clock can manufacture fresh day and month ledgers. |
| R7-04 | 1 — money loss | Gateway departure | A transport may dispatch a billable request and then throw synchronously; the gateway releases its reservation. |
| R7-05 | 1 — money loss / 3 — data lie | Cost accounting | The meter commits a configured estimate, not the provider's actual charge, with no hard output limit or reconciliation. |
| R7-06 | 1 — money loss | Meter API | `record()` bypasses both caps, and `reserve()` accepts caller-selected ceilings. |
| R7-07 | 1 — money loss | Class-2 control | The gate verifies approval text, not that a human supplied it; an agent can manufacture a valid approval block. |
| R7-08 | 5 — dummy-proof | E2E expiry | Both the runner-target and substantive-test checks are syntactically forgeable. |
| R7-09 | 3 — data lie / 4 — isolation | Tracing | Error-trace loss is swallowed, and a scope-mismatch refusal emits a mixed-client trace identity. |
| R7-10 | 3 — data lie | Grade registry | Enforcement accepts caller-authored or incomplete grades; `enforcement([])` freezes nothing. |

## R7-01 — Unclosed HTML comment manufactures an invisible PASS

**Attacked:** `stripHtmlComments()`, `stripConcealed()`, `visibleHeaderLines()`, `parseVerdict()`, and `readTreeBinding()`.

**Observed — reproduced in isolation:** `stripHtmlComments()` removes only comments with a closing delimiter. An unclosed comment is left intact. `stripConcealed()` does not recognize the comment opener as a tag. The subsequent line scanner therefore reads the hidden lines normally. This source was parsed as `PASS` and bound to the target tree:

```text
# benign report
HTML-comment opener with no closing delimiter
Verdict: PASS
verified-tree: 6f10a99d77a6a308c34709ac6a95c401fb7a0835
```

The isolated result was `parsed_verdict = PASS`, the exact target tree, and `gate_would_accept = true`. In rendered Markdown, the lines after the unclosed comment opener are concealed.

**Why this is a defect:** The gate's central claim is that hidden verdicts are impossible. A manufactured PASS can open a money-path phase without a visible adversary decision. This invalidates the 59/59 mutation result because the missing mutation is the unclosed-comment case.

**Required correction:** Stop inferring Markdown visibility. Enforce the brief's positive grammar exactly: line 1 exact report title, line 2 exactly `Verdict: PASS|FAIL` with only an optional tightly specified parenthetical, line 3 exactly the 40-character tree hash, and reject comment openers, control characters, bidi characters, and any extra verdict or binding in the first ten lines. Add a deterministic test for an unclosed comment through end-of-file.

## R7-02 — UTC rollover breaches the client-local daily cap

**Attacked:** `utcDayKey()`, `utcMonthKey()`, and `MemorySpendMeter.#periods()` against the cap module's stated client-local semantics.

**Observed — reproduced in isolation:** `2026-08-16T23:59:00Z` and `2026-08-17T00:01:00Z` produce different ledger days (`2026-08-16` and `2026-08-17`) but both are `2026-08-16` in `America/New_York`. A client can settle $10 immediately before and $10 immediately after UTC midnight. The meter admits both because they use different UTC keys, although they total $20 in one client-local day under a $10 limit.

**Why this is a defect:** This is not merely an onboarding enhancement. `ClientCaps.dailyAiSpendUsd` promises a client-local day, while the enforcing ledger uses UTC. The comment discloses the mismatch but does not make the cap true. The same issue creates a local-month overrun window at UTC month rollover.

**Required correction:** Refuse spend until each real client has a validated IANA timezone from the protected market registry. Derive both keys from one trusted instant and that timezone. Add boundary tests on both sides of UTC midnight and local month rollover for negative and positive UTC offsets and daylight-saving transitions.

## R7-03 — The injected clock can mint unlimited fresh periods

**Attacked:** backwards time, future jumps, non-finite time, and period replay.

**Observed — reasoned:** Non-finite or out-of-range values eventually throw in `Date.toISOString()`, which fails closed. Valid but false timestamps do not. The constructor accepts any function and the meter stores no trusted-time attestation, last-seen instant, maximum skew, or monotonic-period rule. A clock that advances through distinct days admits $10 in every synthetic day. A clock that advances through distinct months resets the $200 monthly ledger each time. Moving backwards also re-enters any older period that still has headroom.

**Why this is a defect:** The cap is keyed by a caller-injected assertion about time. Protecting the arithmetic does not protect the namespace in which the arithmetic is stored.

**Required correction:** The production meter must own a trusted clock source. Reject non-finite time, unacceptable wall-clock skew, and period movement inconsistent with the durable last-seen period. Persist the last-seen trusted instant/period in the same serialized store as spend. Test alternating dates, large forward jumps, backward month jumps, and restart behavior.

## R7-04 — Synchronous post-dispatch throw is treated as pre-departure

**Attacked:** the `departed` transition around `deps.transport.post()`.

**Observed — reasoned from exact control flow:** `departed` becomes true only after `post()` returns. The `GatewayTransport` contract does not promise that a synchronous throw means no I/O occurred. A conforming JavaScript implementation can enqueue or dispatch the provider request and then throw synchronously during local bookkeeping. Assignment to `inFlight` never completes, `departed` remains false, and the outer catch calls `release()`. Repetition produces billable provider calls with restored headroom and a zero meter.

**Why this is a defect:** The comment calls a synchronous throw proof that nothing left the building, but the interface supplies no such proof. This recreates the exact r3 failure shape at the transport boundary.

**Required correction:** Split transport preparation from dispatch. Only a typed, unforgeable `PreDispatchError` produced before the dispatch primitive may release. Once dispatch is invoked, conservatively settle unless the transport returns a verifiable not-sent receipt. Add a deterministic transport that records a dispatch and then throws synchronously; it must consume headroom.

## R7-05 — Reserved estimate is not a hard provider-cost ceiling

**Attacked:** actual provider charge versus `card.costBudgetUsdPerCall`.

**Observed — reasoned:** The gateway reserves and settles only the static role-card value. The request body carries `contextBudgetTokens` but no enforced maximum output-token value, provider-price snapshot, usage receipt, or actual-cost reconciliation. The transport result is treated solely as model output. If the provider price changes, the gateway route ignores the advisory budget, retries upstream, or output usage exceeds the estimate, real spend can exceed $200 while the local ledger remains at or below $200.

**Why this is a defect:** A budget estimate is not a ceiling. The file comments repeatedly call the committed number billable spend, but it is only predicted spend. Law 2 explicitly says local enforcement must not be delegated to gateway configuration, so an unshown external account cap cannot cure the supplied code.

**Required correction:** Reserve a mathematically proven worst-case cost using protected model pricing and hard input/output limits enforced at the transport boundary. Reconcile against a signed provider/gateway usage receipt, retaining conservative headroom when actual cost is unknown. Alert and halt on price-version mismatch. Test a response whose reported actual cost exceeds the reservation.

## R7-06 — Public meter routes bypass protected caps

**Attacked:** `record()` and direct use of `reserve()`.

**Observed — reasoned:** `record(clientId, usd)` writes committed day and month values with no cap lookup, sign-off check, or ceiling check. `reserve(clientId, amount, caps)` accepts its ceilings from its caller, so a direct caller can supply $1,000/$1,000 for `pulsern`. The current `llm()` path supplies narrowed protected caps, but the meter itself does not enforce them.

**Why this is a defect:** The source admits that `record()` is a cap bypass and simultaneously says this contract can be adopted unchanged by the Phase 5/6 money path. A known unrestricted money-write primitive is incompatible with Law 2. "No caller today" is not a safety property.

**Required correction:** Remove `record()` from the production interface. Make protected caps an internal meter dependency keyed by client; do not accept ceilings from money-path callers. If migration import is necessary, isolate it in an offline human-only tool that cannot be linked into the worker. Add compile-time architecture tests and runtime attempts to widen caps through every exported method.

## R7-07 — Class-2 approval proves bytes, not a human decision

**Attacked:** `checkClass2Approvals()` against Law 15's human-only requirement.

**Observed — reasoned:** A PR author or autonomous agent can calculate the base commit and both content hashes, add a new approval Markdown file containing the expected four fields, and satisfy the gate. The supplied code verifies no signature, trusted identity, CODEOWNER review, protected-environment attestation, or out-of-band approval record. Append-only prevents later alteration but does not prove authorship at creation.

**Why this is a defect:** This lets the same agent changing caps, money paths, the Laws, tests, or the gate mint the evidence that supposedly forbids it. Because the approved files include all money enforcement and CI, the consequence is severity 1. The comment acknowledging that identity is unproved is evidence of an open exception, not compliance with Law 15.

**Required correction:** Bind each approval to an authenticated human identity and the exact transition outside the PR author's write authority—for example a protected GitHub Environment or signed attestation verified against an allowlisted human key, with branch rules preventing the automation principal from satisfying it. Add a negative integration test in which the automation actor authors a perfectly formed approval block.

## R7-08 — E2E expiry is forgeable in two independent ways

**Attacked:** `runnerTargets()`, `namedTestBody()`, and `e2eVarianceHolds()`.

**Observed — reproduced in isolation:** 

1. `runnerTargets()` returned true for a config with literal `testDir: "safe-e2e"` followed by computed property `["testDir"]: "empty-e2e"`, while JavaScript's actual final value was `empty-e2e`.
2. `e2eVarianceHolds()` accepted a no-op named test whose body only assigned the string `"await page.goto(); expect("`. It performed no page action and no assertion.

**Why this is a defect:** Regex over TypeScript source is not runner configuration evaluation or test execution. The gate can mechanically expire H20 while Playwright runs the wrong directory or a test does nothing.

**Required correction:** Query the resolved Playwright configuration/programmatic test list and require execution evidence from a tagged test. The substantive test should assert a project-controlled marker or coverage contract, not token substrings. Add the two reproduced cases as negative tests.

## R7-09 — Error decisions may be untraced and cross-scoped

**Attacked:** `traceFailure()` and the trace-context mismatch path.

**Observed — reasoned:** `traceFailure()` catches and discards every sink error, then `llm()` throws the underlying error. That is an untraced refusal despite the file's explicit claim that every exit is traced. Separately, when `req.trace.clientId !== req.clientId`, the failure event combines `traceId` from the supplied context with `clientId` from the request, producing an event whose two identity fields refer to different clients. Invalid requests also reuse predictable `untraced-${role}` IDs.

**Why this is a defect:** Law 11 defines untraced as a bug, and Law 3 requires per-client isolation everywhere. A trace sink keyed by `traceId` can misattribute, merge, or overwrite these events.

**Required correction:** Emit refusals through a durable fail-closed audit channel or explicitly halt the worker when the audit record cannot be persisted. On scope mismatch, emit only to a neutral security stream with independently generated collision-resistant event identity; never combine identities from two client scopes.

## R7-10 — Grade enforcement trusts grades supplied by its caller

**Attacked:** omission, fabrication, and partial grade arrays.

**Observed — reasoned:** `enforcement([])` returns no actions. A caller can pass an A for a failing area, omit configured areas, duplicate areas, or pass a hand-built `AreaGrade`; there is no completeness validation or unforgeable attestation linking the input to `computeGrades()`. `publishGradeReport()` accepts the same fabricated structure.

**Why this is a defect:** The registry does not guarantee that below-A freezes autonomy; it only translates an untrusted list. This permits both a data lie and failure to halt improvements.

**Required correction:** Make one authority accept the raw snapshot, compute the complete configured area set, persist the report, and apply enforcement atomically. If intermediate grade objects remain public, brand them privately and validate exact area/metric coverage. Add tests for empty, partial, duplicate, unknown, fabricated-A, and reordered inputs.

## Additional observations not used to determine the verdict

- `validateOutput()` uses `key in obj`, so inherited properties satisfy required fields; numeric fields accept `NaN` and infinities; `typeof null === "object"`; and arrays satisfy an `object` property type. This is a structured-output data-integrity gap.
- `new URL(model.gatewayRoute, deps.gatewayBaseUrl)` does not prove the result is an approved AI Gateway origin. An absolute route or misconfigured base can send directly to a provider or another host unless an unshown configuration layer prevents it.
- Committed and zero-valued reserved period entries are never pruned. A manipulable clock accelerates unbounded map growth; ordinary operation grows them indefinitely over time.

## Verdict basis

FAIL is required independently by R7-01, R7-02, R7-04, R7-05, R7-06, and R7-07. The first is a reproduced gate bypass; the second is a reproduced mismatch in the enforcing period key; the remaining severity-1 findings are direct control-flow or authority failures visible in the supplied source. Phase 0 must not open on this tree.

## Minimum re-review gate

1. Fix R7-01 and add the unclosed-comment mutation before relying on any subsequent adversary verdict.
2. Replace UTC/client-supplied period authority with durable client-local trusted-time enforcement.
3. Make dispatch state and actual cost conservative and auditable across all transport outcomes.
4. Remove caller-controlled money-write/cap seams.
5. Require authenticated human approval outside the automation principal's authority.
6. Replace source-regex E2E evidence with resolved-runner and executed-test evidence.
7. Add deterministic tests for every exploit described above, then rerun the full suite and mutation harness.
8. Obtain a new cross-family adversary verdict bound to the resulting tree. This report remains FAIL for `6f10a99d77a6a308c34709ac6a95c401fb7a0835`.
