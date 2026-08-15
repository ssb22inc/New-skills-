# ADVERSARY_REPORT_phase0 — Fullburn Phase 0 (Foundation)

Verdict: FAIL

verified-tree: 85842da766bdb838ea7acfc2110012669b7fdaa5

Adversary: engine-adversary (independent QA gatekeeper, `.claude/agents/engine-adversary.md`).
Date: 2026-08-15. Phase: 0. Tree hash computed after `git add` of the two test files
listed under "Tests added", via
`git ls-files -s -- fullburn/ ':!fullburn/reports/' ':!fullburn/APPROVALS/' | git hash-object --stdin`.

**FAIL blocks the phase gate.** Three severity-1 money-loss defects and three
control-plane defects are open. The builder reported that all 13 plan-review
changes (R1–R13) were incorporated; R1–R13 are broadly present in the code, but
they were verified by construction, not by attack. Every finding below was
reproduced by execution, not by reading.

---

## 0. What was actually executed

| Command | Result |
|---|---|
| `npm test` (before my tests) | 9 files, 57 tests, all green |
| `npm run typecheck` | clean (exit 0), and still clean with my tests added |
| `node engine/scripts/leak-check.mjs ..` | `leak/structural scan: clean` |
| `npm test` (after my tests) | 11 files, 83 tests, **23 failed / 60 passed** — the 23 are my finding-reproductions, left failing per the mandate |
| determinism check | full suite run 3× — identical results each run (`23 failed | 60 passed`) |
| throwaway probes | 5 probe suites under the scratchpad (money race, prototype pollution, gate wording, scanner categories, vault/trace leak); deleted after use |

No repo file was modified. Nothing was committed or pushed.

---

## 1. Findings, ranked by the mandate's severity order

Severity: 1 money loss > 2 ban risk > 3 data lies > 4 isolation breaks > 5 dummy-proof.
Control-plane findings (F4, F5, F14) are ranked immediately after money loss:
they are the gates that decide whether unreviewed money code ships at all.

### S1 · MONEY LOSS

#### F1 — The AI spend cap check races the meter; concurrent calls breach it without limit. NEW
`engine/src/gateway.ts:81-86` reads `meter.todayUsd()`, then `await`s the
transport, then records. Every in-flight call therefore evaluates the cap
against the same stale reading. There is no reservation, no compare-and-swap,
no per-client serialization.

Reproduction (`engine/test/adversary-phase0.test.ts` → F1):
1. Caps: `dailyAiSpendUsd: 0.05`; role `hello-world` costs `$0.01`/call → 5 calls max, ever.
2. Fire 20 `llm()` calls with `Promise.allSettled` against a transport that yields the microtask queue twice.
3. Observed: **20/20 permitted**, meter ends at **$0.2000** — 4× the cap. Transport recorded 20 real calls.

This is Law 2's "no runtime path may raise a cap" defeated by concurrency
alone. Workers handle requests concurrently by construction, so this is the
normal case, not an edge case. The same read-modify-write shape will be copied
into the Phase 5/6 ad-spend path if it is not fixed here.

#### F2 — A non-numeric meter reading fails OPEN. NEW
`projected = meter.todayUsd(...) + cost` is compared with `>`. `NaN > cap` and
`undefined + 0.01 > cap` are both **false**, so the guard passes and the call
proceeds. `caps.ts` has `assertSaneCap()` for the cap side (R2) but nothing
validates the *meter* side — the value that actually varies at runtime.

Reproduction (F2, two cases): a `SpendMeter` returning `NaN`, and one returning
`undefined`, both permit spend. A Durable Object returning a malformed/absent
counter is exactly this. Fail-closed requires rejecting any non-finite or
negative reading before the comparison.

#### F3 — Billable calls that fail after the transport are never metered. NEW
`meter.record()` runs only on the fully successful path, after
`validateOutput()`. A provider call that is made, billed, and then returns
output failing the schema costs real money and leaves the meter at 0 — forever,
for unlimited calls.

Reproduction (F3): 20 calls against a transport returning `{ not_the_schema: true }`
with a `$0.05` cap. Observed: **20 real upstream calls, meter = $0.00**, cap never
approached. The same hole applies to a transport timeout after the provider has
already processed the request. Metering must be tied to "the request left the
building", not to "the response pleased the validator".

*(Note: the trace-emission path is correctly ordered — `record()` precedes
`emitOrFail()`, so a sink outage does not lose the charge. That half is right.)*

### S1-ADJACENT · CONTROL PLANE

#### F4 — The adversary-report gate opens on a FAIL report. NEW
`gate-lib.mjs:26` takes the **first** line matching `/^\s*verdict\s*:/i` in the
whole document and accepts `/PASS\b/i`. It is fence-blind, prose-blind, and its
word boundary matches a hyphen.

Reproduction (F4, three cases, all currently `ok: true`):
- a fenced example `` Verdict: PASS `` inside a code block, followed by the real `Verdict: FAIL`;
- an indented prose line reading `Verdict: PASS (this line is an example…)` above the real `Verdict: FAIL`;
- `Verdict: PASS-PENDING-FIXES` (`\b` matches before the hyphen).

Correctly rejected (verified, no change needed): `PASSABLE`, `PASSED`,
`Verdict: FAIL` first, missing report, missing `verified-tree`, mismatched tree.
Lowercase `verdict: pass` is accepted; that appears intentional (`/i`) and I am
not filing it, but it widens the surface — I recommend anchoring the verdict to
the first non-blank, non-fenced line and matching `PASS` or `FAIL` exactly.

This is the Phase 0 adversary-focus item "try to bypass CI gate", and it works.
Note that this very report is written so its first verdict-matching line is the
real one.

#### F5 — `CLASS2_FILES` omits the grading code, the money paths, and the leak scanner. NEW
§12: "the registry, its thresholds, **and the grading code** are Class 2".
Law 15 / H17: "the Laws, spend caps, **money paths**, … the improvement loop's
own code". The list protects `caps.ts`, `grade-thresholds.ts`, the Laws docs and
three of the four gate scripts — and nothing else.

Verified unprotected (each returns `ok: true, "no Class-2 changes"`):
- `engine/src/grade-registry.ts` — the grading code itself. `engine/test/gates.test.ts:71-78` **asserts** that changing it needs no approval. An engine that can rewrite `computeGrades()` without human sign-off can grade itself A (Law 14 tamper-proofing, §12 "anti-Goodhart").
- `engine/src/gateway.ts` — where the cap check actually lives, and `engine/src/spend-meter.ts`. The cap *values* are Class 2 while the code that enforces them is not; deleting lines 81-86 of `gateway.ts` needs no approval.
- `engine/scripts/leak-check.mjs` — a CI gate, unlike its three siblings which are protected.
- `config/src/freeze.ts` — the immutability primitive behind Law 2 and Law 18.
- `vitest.config.ts` — its `include` globs decide whether the invariant suite runs at all.

#### F14 — Every gate is advisory: nothing requires the checks to be green, and approvals are self-servable. NEW (no in-repo test possible)
Three compounding facts:
1. `.github/workflows/fullburn-ci.yml` gates `adversary-gate` and `class2-gate` on `if: github.event_name == 'pull_request'`, and the workflow is defined by a file in the branch under test. A PR that deletes or renames that file runs no gate. Only branch protection with **required status checks** stops a red or gate-free merge, and `HUMAN_TASKS.md` never asks for it.
2. `class2-gate.mjs:26-31` reads approval docs from the **working tree** — any `.md` under `APPROVALS/`, regardless of who added it or whether it is part of the diff. An agent can write its own approval entry with the correct `content-hash` and pass its own Class-2 change. Only a CODEOWNERS rule on `APPROVALS/` makes "human-only" real.
3. `PHASE` is not Class 2; it is inside the verified tree, so it cannot be silently retargeted — that part holds.

Recommend adding **H19 — repository protection**: required checks (`verify`,
`adversary-gate`, `class2-gate`), no force-push to protected branches, and
CODEOWNERS on `APPROVALS/**` plus every `CLASS2_FILES` path. Until then, the
Class-2 gate is a convention with a hash on it, not a control.

### S3 · DATA LIES / GOVERNANCE

#### F6 — Grades resolve through the prototype chain; an empty snapshot can grade A. NEW
`grade-registry.ts:39,43` uses `snapshot[area]` and `metrics?.[key]` — direct
indexing, while the rest of the codebase uses `Object.hasOwn` guards
(`ownEntry`, `getCaps`, `requireActiveMarket`, all verified correct).
Reproduction (F6): with `Object.prototype["data-truth"] = { stripe_warehouse_drift_pct: 0 }`,
`computeGrades({})` returns **grade A, failing: [], missing: []** for an area with
no data at all. The builder's own "missing metrics are BELOW_A" fail-closed test
is bypassed.

#### F12 — The Grade Registry is missing two of §12's eight areas. NEW
`GRADE_AREAS` defines 6 areas. §12's table defines 8: **WordPress / SEO** and
**Business health (ours)** are absent entirely. An area with no thresholds is
never computed, never drops below A, and never triggers the Law 14 freeze. The
missing Business-health area is the one carrying guarantee exposure ≤ cap with
"sales auto-pause above it" (§12, §14, Law 17). Not disclosed in the ledger.
Reproduction: `config/test/adversary-phase0.test.ts` → F12.

#### F9 — A binding score has no provenance; "no pass, no bind" is enforced against a caller-chosen number. NEW
`bindRole(bindings, role, modelId, harnessScore: number)` validates finiteness
and the threshold, but nothing ties the number to the harness having executed
the golden set. calling `bindRole` for the
`genome-tagger` role with the `llama-70b` candidate and a hand-written score of
`1.0` binds a model that actually scores 0.4 — verified, with no eval run. `42` is also
accepted, though `runEval` can only ever return `passed/total ∈ [0,1]`.
Law 13 / §2.4 say a model "holds the role only while passing that role's eval
suite"; today that is convention (Law 4 says gates are code, not judgment).
Minimum fix: reject scores outside `[0,1]`; proper fix: take the `EvalResult`
and verify its `role`/`modelId`/`total > 0` match the rebind.
Reproduction: F9 (three cases; the negative-score case already passes).

#### F15 — AC 2 is not demonstrated: the "rebind" in the suite is a no-op. NEW
Phase 0 AC 2 is "rebinding a role **from a frontier model to an open-source
model** passes its evals and serves with zero code change".
`engine/test/eval-rebind.test.ts:20-33` rebinds `genome-tagger` from `qwen-72b`
to `qwen-72b` — it is already bound to qwen at launch. No frontier→open-source
transition occurs anywhere in the suite. Ledger L2 discloses that the recorded
outputs are placeholders; it does not disclose that the rebind itself is
vacuous. I have encoded the real transition (frontier route → open-source route,
same call site) as a passing AC lock test in `engine/test/adversary-phase0.test.ts`.

#### F8 — A failed LLM call emits no trace at all. NEW
Law 11: "every agent decision is traced; untraced decisions are bugs." Verified:
a transport that throws produces **zero** trace events — no error trace, no cost
record, nothing in Langfuse. Failures are exactly the events an operator needs.
Reproduction: F8.

#### F13 — Two §10.2 checklist entries labelled LIVE assert nothing, and the file's own count is wrong. NEW
`engine/test/invariants/invariants.test.ts`:
- `"LIVE — spend caps present, immutable, breach-tested"` → `expect(true).toBe(true)`
- `"LIVE — tokens exist only in the vault…"` → `expect(true).toBe(true)`
Both pass on a repo with `caps.ts` and the leak scanner deleted. R10's value was
enumerating the checklist so nothing hides; two entries are labelled LIVE while
proving nothing.
- `"LIVE — every LLM call routes through AI Gateway with a trace (Law 11)"` asserts only `validateBindings(ROLE_BINDINGS)`, which is the family-diversity invariant, not the routing/tracing one.
- The comment claims "12 bullets in §10.2; **4 are live** below, 8 carry explicit markers" — there are **5** `LIVE —` entries. Bookkeeping in the file that exists to prevent bookkeeping drift.
Reproduction: F13 (two cases).

#### F10 — The live-verification ledger omits unmet Phase 0 deliverables. NEW
The ledger is the gating honesty artifact ("while any entry is open, every phase
verdict is CONDITIONAL"). Two Phase 0 deliverables are unmet and absent from it:
- **ClickHouse Cloud + Airbyte provisioned** (deliverable; H3/H4) — no entry. Phase 0 could be signed off with no warehouse and no ingestion, and nothing in the gating list would say so.
- **OAuth secrets vault "encrypted, auto-rotated"** — `MemoryVaultBackend` is in-memory, plaintext, and rotation is a manual `rotate()` call. Least-scope is genuinely structural (R11, verified). The encrypted + auto-rotated halves are unimplemented and appear nowhere in the ledger; `vault.ts`'s comment mentions H7, but a source comment is not the ledger.
L8 **is** present and accurate (this review runs on the builder's model family —
recorded limitation, H6b). L1–L7 are accurate as written.
Reproduction: F10 (two cases).

### S4 · ISOLATION / SECRETS

#### F7 — The vault secret escapes through a transport error. NEW
`llm()` hands `Bearer <secret>` to a transport it does not control and does not
wrap the call. A transport whose error carries request context — common in HTTP
clients — propagates the secret out of `llm()` in `err.message`/`err.stack`,
into whatever logs it. Reproduction (F7): a transport throwing
`upstream 401: ${JSON.stringify(headers)}` yields an error containing the canary.
The builder's own "no error path leaks the vault secret" test (`gateway.test.ts:113`)
covers three non-transport paths only, so this is uncaught.
§10.2: "a token appearing in code, logs, or traces is a critical defect."
Fix shape: wrap `transport.post` and rethrow a `GatewayError` with the secret
redacted (and never interpolate raw sink errors either — `emitOrFail` splices
`err.message` into its own message verbatim).

#### F16 — The leak scanner is blind to the token types this product will actually hold. NEW (no test added; see below)
Every category the scanner *claims* was verified to fire (sample strings kept in
the scratchpad, never in the repo): Anthropic `sk-ant-`, Stripe/OpenAI
`sk-live|test|proj-`, `whsec_`, `AKIA…`, `ghp_…`, PEM private keys, provider
hostnames, provider SDK imports, raw model ids outside config/evals/tests — and
the allowlist correctly exempts `config/src/models.ts`, `engine/evals/`, `/test/`.
So it does what it says. What it does not cover is the crown jewels (§15):
- **Meta/Facebook** long-lived tokens (`EAA…`) — the Marketing API credential, Law 1's write path;
- **Google** OAuth/API keys (`ya29.…`, `AIza…`) — GA/GSC;
- Slack `xoxb-`, and modern OpenAI project keys without the `live|test|proj` infix;
- SDK access via `require("…")` or dynamic `import("…")`, and hostnames assembled from template fragments — both slip past `PROVIDER_SDKS`/`PROVIDER_HOSTS`.
It also only walks `fullburn/` and only `.ts/.tsx/.mjs/.js/.json/.md/.toml/.yaml`
— a `.env`, `.txt` log, or fixture dump is not scanned.
No test added: adding pattern coverage is a builder decision about which shapes
to adopt, and I will not encode my preferred regex set as a requirement.

### S5 · DUMMY-PROOF / LOW

- **F11 — Family diversity is vacuous when one side is unbound.** `validateBindings` compares builder vs adversary roles *present in the bindings map*; dropping the adversary binding satisfies Law 13 trivially. Nothing asserts every declared role card has a launch binding. Reproduction: `config/test/adversary-phase0.test.ts` → F11 (the "every role card carries a binding" case currently passes; the vacuity case fails).
- **F17 — `runEval` uses a raw index on `ROLE_CARDS`.** `eval-harness.ts:57` (`ROLE_CARDS[role] === undefined`) resolves inherited properties, so a polluted prototype defeats its unknown-role guard. Not exploitable further (`bindRole` and `llm` both use `ownEntry` and reject), but it is the one lookup in the codebase that breaks the otherwise consistent own-property discipline. No test added — the exploit terminates harmlessly.
- **F18 — `leak-check.mjs` is not import-safe.** Importing it for a unit test runs the whole filesystem walk against `process.cwd()` and can `process.exit(1)` inside the test worker. That is why `scanContent` has zero unit coverage despite being exported "for unit-testability"; my probes needed a `process.chdir` to import it at all. Split the CLI from the library.
- **F19 — Nothing structurally bans direct switchboard indexing.** `MARKETS`/`CHANNELS` are exported, so future code can read `CHANNELS["google"]` and use a staged entry without ever calling `requireActiveChannel`. The leak scanner already demonstrates the pattern for structural bans; a rule for direct registry indexing outside the accessor would close it before Phase 5 builds the Google adapter.

---

## 2. Attacks that were attempted and **refuted** (no finding)

Recorded so the next adversary does not re-spend the effort:

- **Runtime cap mutation** — `deepFreeze` + no setter; mutation and table-injection both throw `TypeError`. CONFIRMED-COVERED (`config/test/caps.test.ts`).
- **Unknown client / unsigned caps / meter unavailable / over-cap sequential** — all refuse. CONFIRMED-COVERED (`gateway.test.ts`, `caps.test.ts`).
- **Exactly-at-cap boundary** — `projected > cap` permits the call that lands exactly on the cap and refuses the next. Correct semantics for a maximum; deliberate and tested.
- **Float dust at the boundary** — `0.05000000000000001`-style accumulation resolves *against* the client (refused). Fails closed.
- **Prototype pollution** — caps, markets, channels, models, role cards and bindings all use `Object.hasOwn` guards and refuse forged entries. CONFIRMED-COVERED (`switchboard.test.ts`) and re-verified directly for `getCaps`/`ownEntry`/`bindRole`. (Exceptions: F6 grade snapshot, F17 `runEval`.)
- **Same-family binding; below-threshold, NaN and Infinity scores** — all refused. CONFIRMED-COVERED (`config/test/models.test.ts`); Infinity re-verified by probe.
- **Staged / locked flag activation** — no mutation API, frozen registry, `requireActive*` refuses `staged` exactly like `locked`, forged clones cannot influence resolution, `activeChannels()` returns `["meta"]` only. No code path activates them. CONFIRMED-COVERED (`switchboard.test.ts`, `invariants.test.ts`).
- **Cross-client vault key collision** — I suspected the `MemoryVaultBackend` composite key `${clientId} ${name}` was space-delimited and forgeable; it is a **NUL byte** (`\0`). `read("acme", "corp meta-oauth")` does not reach `set("acme corp", "meta-oauth")`. Deliberate and correct.
- **Cross-client vault handle / cross-client trace context** — both refused structurally (different object, not different argument). CONFIRMED-COVERED (`gateway.test.ts`, `invariants.test.ts`).
- **Trace sink outage** — the call fails; R8 holds. CONFIRMED-COVERED.
- **Canary in traces** — emitted trace JSON never contains the secret (it is not in `input`/`output`/headers-in-event). CONFIRMED-COVERED. The leak in F7 is via the transport's own error, not the trace.
- **Report gate: missing / FAIL-first / stale tree / no `verified-tree` / `PASSABLE` / `PASSED`** — all correctly rejected. CONFIRMED-COVERED (`gates.test.ts`) plus probe variants.
- **Class-2 gate: missing approval, wrong hash, approval for a different path, deleted Class-2 file** — all blocked (deletion blocks by an uncaught `ENOENT` in `hashOf`, i.e. fails closed but noisily). CONFIRMED-COVERED.
- **Report append-only** — modified, deleted and renamed reports all blocked. CONFIRMED-COVERED.

---

## 3. §10.2 standing-invariant checklist — honesty review

| # | §10.2 bullet | Status claimed | My verdict |
|---|---|---|---|
| 1 | Writes-only; no mass platform reads (Law 1) | deferred → Phase 2 | **Weak.** This is a *negative* invariant — "no such path exists" — which is cheap to assert now and is exactly the guard you want live *before* the code it forbids lands. `leak-check.mjs` already proves the pattern. Deferring it removes the check at the moment it starts to matter. |
| 2 | Spend caps present, immutable, breach-tested (Law 2) | LIVE | **Dishonest as written** — `expect(true).toBe(true)` (F13). The real coverage exists elsewhere and is good, but this entry proves nothing. And the breach test is sequential only — F1 shows concurrent breach is unguarded. |
| 3 | Per-client isolation; cross-tenant read fails (Law 3) | LIVE | **Honest.** Real assertions, structural scoping. Good. |
| 4 | Every LLM call via AI Gateway; every decision traced (Law 11) | LIVE | **Mislabelled** — the entry asserts family diversity, not routing or tracing (F13). Routing/tracing are genuinely proven in `gateway.test.ts`; the checklist entry just points at the wrong thing. Also F8: failures are untraced. |
| 5 | Proxies kill, never promote (Law 5) | deferred → Phase 5 | Accurate. |
| 6 | No prediction-gate code paths (Law 6) | deferred → Phase 4 | **Weak, same reason as #1** — a negative invariant, assertable today. |
| 7 | Trust ladder cannot skip rungs (Law 8) | deferred → Phase 5 | Accurate. |
| 8 | `decisions` ledger append-only | deferred → Phase 2 | Accurate. |
| 9 | External content is data, never instructions | deferred → Phase 1, plus a STUB | Accurate but the STUB is decorative: it asserts `hostile.includes("IGNORE")`, i.e. that the fixture string exists. Harmless, honestly labelled STUB. |
| 10 | `VERDICT.md` hash-locked | deferred → Phase 6 | Accurate. |
| 11 | OAuth tokens only in the vault | LIVE | **Dishonest as written** — `expect(true).toBe(true)` (F13). Actual coverage in `gateway.test.ts` is good but incomplete (F7). |
| 12 | Queue past SLA waits; locked flags inert | deferred (queue half → Phase 6) + LIVE (flags half) | **Honest**, and the split is legitimate. The flags half has real assertions. |

**Deferred markers: 8, and the count is right — but the accounting is not.**
Bullet 12 is legitimately split (half deferred, half live) while bullet 9 appears
twice (deferred *and* as a STUB), so 8 markers + 5 LIVE entries covers 12 bullets
only by that double-count. Every `applicableFromPhase` I checked against §11 is
correct (queue console → Phase 6, ladder → Phase 5, crawler → Phase 1,
`VERDICT.md` → Phase 6, ClickHouse schema → Phase 2, creative → Phase 4).
The file's own comment says "4 are live"; there are 5.

---

## 4. Phase 0 deliverables & acceptance criteria

### Deliverables
| Deliverable | Status |
|---|---|
| Monorepo scaffold (Workers/TypeScript) | **Met.** Workspaces, strict TS, `wrangler.toml`. Tests run on Node, not workerd — disclosed as L7. |
| `config/caps.ts` | **Met.** Constants, frozen, no setter, no default cap, sign-off gate. Values pending H8 and structurally unusable until then — good. |
| Model abstraction layer (`models.ts`, role cards, Langfuse eval harness, family-diversity) | **Partial.** Registry/cards/harness present and the harness genuinely computes scores. Langfuse eval push = L3. Family diversity: F11 (vacuous when unbound). Binding provenance: F9. |
| Grade Registry scaffold + initial A-thresholds | **Partial.** Computes, publishes, fails closed on missing metrics, typed enforcement actions. **Two of eight §12 areas missing (F12)**; prototype leak (F6). Thresholds pending H9. |
| CI pipeline | **Partial.** Workflow present, three jobs, gate logic unit-tested. F4 (verdict parsing), F5 (Class-2 list), F14 (nothing requires the checks). Live run on github.com = L5. |
| AI Gateway wiring with per-client keys | **Partial (as designed).** Gateway-only routing enforced by the structural scan; per-client key from the scoped vault. Live wiring = L1/L4. |
| Langfuse project + tracing helper | **Partial.** Helper + fail-closed emit present and good. Project = L1/L3. F8: failures untraced. |
| `CLAUDE.md` + adversary agent installed | **Met.** Both present; Stop hook wired. |
| ClickHouse Cloud + Airbyte provisioned | **Not met and NOT in the ledger — F10.** |
| OAuth vault (encrypted, auto-rotated, least-scope) + CI leak check | **Partial.** Least-scope is structural and genuinely good; leak check exists and fires on every category it claims (F16 lists what it does not claim). **Encrypted + auto-rotated unimplemented and not in the ledger — F10.** |
| Switchboard skeleton (US + Meta on, rest locked & inert) | **Met.** Best-built component in the phase. |
| fullburn.ai registered + trademark check | **Not met, honestly disclosed as L6 / H1.** |

### Acceptance criteria
| AC | Status |
|---|---|
| AC1 — hello-world round-trips through AI Gateway and appears in Langfuse | **Contract half met; live half open (L1).** Honest. |
| AC2 — rebinding frontier → open-source passes evals and serves with zero code change | **Not demonstrated — F15.** The suite's rebind is `qwen-72b` → `qwen-72b`. Now encoded as a real AC lock test by me. Recorded outputs are placeholders (L2, honest). |
| AC3 — Grade Registry computes and publishes a grade from seeded data | **Met**, subject to F12 (missing areas) and F6. |
| AC4 — CI blocks a PR missing an adversary report | **Logic met and unit-tested; defeated in practice by F4 and F14.** Live proof = L5. |
| AC5 — cap constants exist and a test proves runtime mutation fails | **Met.** CONFIRMED-COVERED, verified by execution. |

---

## 5. Tests added (Phase B — LOCK)

Both files are deterministic: no timers, no `Date.now()`, no randomness, no
network. Concurrency in F1 is driven by fixed microtask yields — verified
identical across three consecutive full-suite runs. **They are left failing on
purpose**; each maps to a finding above, and the adversary does not fix builder
code.

- `/home/user/New-skills-/fullburn/engine/test/adversary-phase0.test.ts` — F1, F2 (×2), F3, F4 (×3), F5 (×5), F6, F7, F8, F10 (×2), F13 (×2), plus the passing **AC 2 lock test** (real frontier → open-source rebind, same call site).
- `/home/user/New-skills-/fullburn/config/test/adversary-phase0.test.ts` — F9 (×3, one already passing), F11 (×2, one already passing), F12.

Current suite state: **83 tests, 23 failing, 60 passing.** All 23 failures are
the reproductions above. `npm run typecheck` and `node engine/scripts/leak-check.mjs ..`
both remain clean with these files in the tree.

---

## 6. Spec-level observations for the human (not silently patched)

1. **§10.3 assumes a control the repo cannot create.** "A phase branch cannot merge without the adversary report committed alongside green CI" is only true with required status checks + CODEOWNERS. Add **H19 — repository protection** to `HUMAN_TASKS.md` (see F14). Without it, every gate in this phase is a suggestion.
2. **"Human-only" needs an identity, not a hash.** The Class-2 design proves *what* was approved (content-hash) but never *who* approved it. Any agent with write access can author its own approval. Consider signed commits or CODEOWNERS-enforced review on `APPROVALS/**`.
3. **§10.2's negative invariants should be live from Phase 0.** "No mass platform reads", "no prediction-gate code paths" and "no writes outside publish/pause/promote" are absence claims — cheapest to assert while they are trivially true, and they must be armed *before* the code that could violate them lands, not after. Recommend converting them from `NOT_YET_APPLICABLE` markers into structural-scan rules now.
4. **The spec does not say where spend metering lives, and Phase 0 chose the weakest possible place.** F1/F3 are architectural, not typos: a per-request in-memory counter cannot enforce a per-client daily cap under concurrency. §2.2 names the Durable Object as the per-client serialization point; consider making the spec explicit that every cap check is a reserve-then-settle operation inside the client's DO, so Phase 5/6 cannot repeat this shape with real ad dollars.
5. **Cap semantics for AI spend use a per-call *budget estimate*, not actual cost.** `costBudgetUsdPerCall` is a role-card constant; real provider cost varies. Phase 2+ needs a reconciliation path, or the AI cap will drift from reality in exactly the direction that costs money.
6. **Ad-spend caps have no enforcement path at all in Phase 0** — only `dailyAiSpendUsd` is ever consulted. That is correct for this phase (writes land Phase 6), but nothing in the repo says so, and `caps.ts` reads as though all three are enforced. A comment or ledger entry would stop a later phase assuming the guard already exists.
7. **L8 is correctly recorded and I am the subject of it.** This review ran on the same model family as the builder, in violation of Law 13 / §2.4 for the review itself. Treat these findings as necessary-but-not-sufficient: a non-Claude adversary must repeat Phase 0 under H6b before the gate is considered fully attacked. My verdict does not clear that requirement.

---

## 7. Gate status

**FAIL.** Findings F1, F2, F3 (money loss), F4, F5, F14 (control plane) must be
fixed and re-attacked before the Phase 0 gate may open. F6–F13 and F15–F19 must
be fixed or explicitly accepted by the human in writing, recorded here.

Per §10.1 step 6, this returns to the builder. The adversary cannot be overridden
by the builder — only by the human, in writing, in this report. When the fixes
land, the tree hash changes and this report becomes stale by construction:
re-run the adversary, do not edit this file (reports are append-only).

On re-run, the earliest a verdict could read
`PASS (CONDITIONAL — live verification ledger L1–L8 open; same-family build review pending H6b)`
is after all six S1/control-plane findings are closed and the ledger has been
completed per F10.
