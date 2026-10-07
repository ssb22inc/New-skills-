# ADVERSARY REPORT phase0 — r4 (targeted fix pass b1fc37d: regression, mutation-lock audit, fresh attack)
Verdict: FAIL
verified-tree: 6faddf79932352eb57b6adab9d4a3bea2a2b2835

Scope of this review, as set by the human: (1) regression on the 7 money-loss and
control-plane findings b1fc37d claims to fix, (2) independent verification of the
14 mutation locks, (3) fresh attack on code this commit introduced or rewrote.
The ~30 queued r3 findings disclosed in ledger L15 were deliberately NOT
re-litigated; I confirmed L15 describes them honestly and moved on.

**Verdict basis.** FAIL on three independent grounds, each reproduced by execution:
one of the 7 findings (R3-CP-03) is not closed at all and its original attack works
verbatim through a sibling filename; two more (M-03, R3-CP-02) are closed only in
part; and one of the 14 mutation locks (H-04) does not fail against the mutation its
own test comment names. Five new confirmed findings sit at money-loss, ban-risk or
data-lie severity.

**Credit where it is due, stated plainly:** the two worst money defects in the r3
report are genuinely and completely dead. M-01's unbounded cap breach (2000 billable
calls with the cap never engaging) now stops at exactly 500 calls / $5.00. M-04's
untested `settled` flag now has two tests that both go red on either form of the
revert. 13 of the 14 mutation locks hold, and I verified every one of them myself by
applying the mutation and watching the suite. That is a real improvement over r3,
where roughly fifteen fixes had no test at all.

---

## 1. What I executed

Baseline, real repo at `b1fc37d`, working tree clean before and after:

```
$ npm test
 Test Files  15 passed (15)
      Tests  168 passed (168)
$ npm run typecheck        -> exit 0
$ node engine/scripts/leak-check.mjs ..
leak/structural scan: clean -> exit 0
$ git status --porcelain   -> (empty)
```

Gates run against the commit under review (`class2-gate.mjs . 81ac30a`):

```
CLASS-2 GATE FAIL: Class-2 changes without a matching human approval for this
transition (Law 2/14/15): engine/scripts/class2-gate.mjs (modified),
engine/scripts/gate-lib.mjs (modified), engine/scripts/scan-lib.mjs (modified),
engine/src/gateway.ts (modified), engine/src/spend-meter.ts (modified),
engine/test/locks.test.ts (added), engine/test/scan-lib.test.ts (modified)
```

That is the CORRECT behaviour, not a finding: seven Class-2 paths changed and the
approvals are the human's to write. `adversary-gate.mjs` likewise refuses on tree
staleness until this report lands. Noted so the human knows the commit is not
self-approving.

All mutation, replay and probe work ran in throwaway clones under the scratchpad
(`work/`, `cp1/`, `render/`). Nothing was written into the repo. Markdown rendering
claims were verified independently with `marked@15`, not asserted.

---

## 2. Regression on the 7 fixed findings

| r3 finding | Closed? | Evidence (executed) |
|---|---|---|
| **M-01** settle() throws → reservation released → unbounded breach | **CLOSED** | 2000 `llm()` calls, real frozen `testco` $5.00 cap, meter whose `settle()` always throws: `billableProviderCalls=500 ok=0 capRefused=1500 released=0 reserved=$5.0000`. The cap binds at exactly the ceiling. r3 measured 2000 billable with the cap never refusing once. |
| **M-02** `Math.min(ceiling,requested)` had no lock test | **CLOSED** | Mutation `return requested;` → 1 test red (`locks.test.ts:103`). The sign-off leg (`assertCapsUsable`) → 2 tests red. |
| **M-03** the "daily" cap has no day | **PARTIAL — see N-01** | With an injected clock the rollover is correct: day 1 `ok=500`, +7 days `ok=500`, and a reservation opened at 23:59:59 settles against the day it was taken. But `MemorySpendMeter`'s constructor defaults to `now = () => 0`, so a default-constructed meter is frozen at `1970-01-01` and never rolls over. Every construction site in the repo except the three M-03 lock tests uses the default. Measured: `firstBurst ok=500, thenMore ok=0, committed=$5.0000` — the pre-fix permanent lockout, verbatim. |
| **M-04** the `settled` flag had no test | **CLOSED** | Both forms of the revert go red: dropping `!departed` from the release condition → 2 tests red; moving `departed = true` back to after `settle()` → the same 2 tests red. |
| **R3-CP-01** approval replay after a revert | **PARTIAL — see N-03** | r3's exact attack is now refused: branch from the revoked tip, restore the $500 cap, copy the human's January approval byte-for-byte → `CLASS-2 GATE FAIL … config/src/caps.ts (modified)`, exit 1. Two residual routes survive (below). |
| **R3-CP-02** a 3-backtick fence closes a 4-backtick fence | **PARTIAL — see N-04, N-05** | The headline is fixed: the ` ````markdown ` / ` ``` ` nest now parses `FAIL`, and so does the `~~~~`/`~~~` variant. But the `<details>` concealment leg, confirmed inside this same r3 finding, is untouched; and `readTreeBinding` — named at `gate-lib.mjs:118` in the r3 write-up as carrying the identical bug — was not fixed, and I built a working gate-opening exploit from it. |
| **R3-CP-03** `vitest.workspace.ts` silences the suite | **NOT CLOSED — see N-02** | `fullburn/vitest.workspace.mts` is Class-1. vitest 2.1.9 honours it. 165 of 168 tests vanish with every gate green. |
| **R3-CP-04** the deployed entrypoint is Class-1 | **CLOSED** | `isClass2` now returns true for `engine/src/index.ts`, `engine/src/shadow.ts`, any depth under `engine/src/`, and `fullburn/engine/wrangler.{toml,json,jsonc}`. Residuals are pattern-shape only (`engine/deploy/wrangler.toml`, `package-lock.json` — N-11). |
| **R3-CP-06** unparseable fresh FAIL fails open | **CLOSED** | All eight r3 variants now block: `> Verdict: FAIL`, Cyrillic `Vеrdict`, `**Verdict:** FAIL`, `## Verdict: FAIL`, `- Verdict: FAIL`, leading-space, `VERDICT — FAIL`, and a report with no verdict line. Reopened by a different route in N-04 — the fix itself is sound. |

**Score: 5 of the 9 finding IDs (the human's "7") fully closed — M-01, M-02, M-04,
R3-CP-04, R3-CP-06; 3 partial — M-03, R3-CP-01, R3-CP-02; 1 not closed — R3-CP-03.**

---

## 3. My own mutation-lock verification

Method: fresh clone at `b1fc37d`, apply one mutation, `npm test`, record, `git checkout`
and repeat. I did not read the builder's claim and confirm it; I derived each mutation
from the `// MUTATION:` comment in `locks.test.ts` and applied it myself.

| # | Mutation (as the test comment names it) | Suite | Test that caught it |
|---|---|---|---|
| 1 | `gateway.ts`: drop `!departed` from the release condition | **RED** 2/168 | M-01/M-04 both tests |
| 2 | `gateway.ts`: move `departed = true` back to after `settle()` | **RED** 2/168 | M-01/M-04 both tests |
| 3 | `caps.ts`: `Math.min(ceiling, requested)` → `requested` | **RED** 1/168 | "a caller-supplied table cannot raise the frozen ceiling" |
| 4 | `caps.ts`: delete `assertCapsUsable(caps)` | **RED** 2/168 | M-02 sign-off test + `gateway.test.ts` H8 test |
| 5 | `spend-meter.ts`: drop the day component from the ledger key | **RED** 2/168 | both M-03 rollover tests |
| 6 | `spend-meter.ts`: remove the `open.clientId !== reservation.clientId` guard | **RED** 1/168 | H-14 cross-tenant reservation test |
| 7 | `caps.ts`: `getCaps` `Object.hasOwn` → direct index | **RED** 1/168 | H-15 prototype-pollution test |
| 8 | `models.ts`: remove the `GENUINE` WeakSet clause from `assertAttestation` | **GREEN 168/168 — LOCK DOES NOT HOLD** | *(nothing)* |
| 9 | `grade-registry.ts`: `computeGrades` `Object.hasOwn` → direct index | **RED** 1/168 | H-06 empty-snapshot test |
| 10 | `vault.ts`: `#key` → single-delimiter join | **RED** 1/168 | H-13 collision test |
| 11 | `gate-lib.mjs`: compare only the fence character, not its length | **RED** 1/168 | R3-CP-02 test |
| 12 | `gate-lib.mjs`: judge the verdict before establishing freshness | **RED** 1/168 | R3-CP-06 test |
| 13 | `gate-lib.mjs`: remove the base-commit clause from the approval match | **RED** 1/168 | R3-CP-01 test |
| 14 | `gate-lib.mjs`: remove any of the four new `CLASS2_PATTERNS` (tested individually: `engine/src/`, `vitest*`, `wrangler.*`, `.gitignore`) | **RED** 1/168 each | R3-CP-03/04 pattern test |
| 15 | `redact.ts`: `redactError` rethrows the original error | **RED** 1/168 | F7 secret-containment test |

**13 of the 14 named locks hold. Lock 8 does not.**

Three further mutations I applied that the builder did not claim, recorded because two
of them matter:

| Mutation | Suite | Consequence |
|---|---|---|
| `gateway.ts`: strip the try/catch out of `settleOrFailClosed`, leaving a bare `meter.settle()` | GREEN | Money-neutral (the throw still propagates, `departed` is already true, nothing is released). Not a defect — recorded so the human knows the wrapper is decoration, not a control. |
| `scan-lib.mjs`: make `withoutFixtures` strip `<fixture>[A-Za-z0-9]*` instead of the exact string | GREEN | The new "the fixture allowlist is exact strings only" test does not actually lock exactness. Related to N-06. |
| `class2-gate.mjs`: rename the `baseCommit:` property so the library receives `undefined` | GREEN | **Disables the entire R3-CP-01 fix in one line, with the suite green.** See N-03. |

### 3.1 Lock 8 in detail (H-04 — the attestation WeakSet)

The mutation is exactly the one the test comment names. With it applied, the suite is
168/168 green **and** the guard is demonstrably load-bearing:

```
MUTATED (WeakSet clause removed): bindRole ACCEPTED a hand-built 'attestation'
  for an eval run that never executed.
  genome-tagger now bound to: qwen-72b   outcomes recorded: []
SHIPPED refused: bindRole requires an attestation from an executed eval run …
```

Why the test misses it: `locks.test.ts:179` forges a **plain object literal**, which the
surviving `att instanceof EvalAttestation` half rejects on its own. The WeakSet is the
only thing that stops `Object.create(EvalAttestation.prototype)` — an object that *is*
an instance, carries `score: 1`, `passed: 1`, `total: 1` and an empty `outcomes` array,
and binds a role on evidence of a run that never happened (Law 13, §2.4, and §12's
"every bound model ≥ its role's eval threshold"). Reproduction: apply the mutation,
then

```ts
const forged = Object.assign(Object.create(EvalAttestation.prototype), {
  role: "genome-tagger", modelId: "qwen-72b", outcomes: [], total: 1, passed: 1, score: 1,
});
bindRole(ROLE_BINDINGS, "genome-tagger", "qwen-72b", forged);   // accepted
```

The fix is one line in the existing test: forge with `Object.create(EvalAttestation.prototype)`
instead of a literal. The shipped code is correct; only its lock is hollow.

---

## 4. New findings, ranked

### N-01 · 1 money-loss · `MemorySpendMeter`'s default clock is `() => 0`, so M-03's day key is frozen at 1970-01-01 and no construction site in the repo ever rolls over

**Spec:** Law 2; `caps.ts:19` ("Max AI spend per client-local day"); `spend-meter.ts:98-103`
(the fix's own comment: "Ledgers are keyed by (client, UTC day) so the cap rolls over
exactly once per day").

**Reproduction.** Drive the real `llm()` with the real frozen caps table
(`testco`, $5.00/day, role `hello-world` at $0.01/call) against `new MemorySpendMeter()`
— the default construction, which is what `engine/test/helpers.ts:32` and every other
call site uses:

```
M-03 DEFAULT meter: firstBurst ok=500  thenMore ok=0  committed=$5.0000  dayKeyClock=epoch
M-03 clocked meter: day1 ok=500 ; +7d ok=500          (the fix works WHEN given a clock)
```

**Observed.** With the default constructor the day key is `"1970-01-01"` forever, so the
client is refused permanently after its first $5.00 — M-03 half (b), the "$5/day budget
is really $5/lifetime" defect, entirely intact. The fix is opt-in and the default is the
bug. `grep -rn "new MemorySpendMeter"` returns 16 sites; three of them (the M-03 lock
tests) pass a clock, thirteen do not. The project's own harness makes the divergence
visible: `makeDeps()` gives `llm()` `now: () => 1_755_000_000_000` (Aug 2025) while
constructing the meter with the epoch clock — two clocks on one money path, plumbed to
nothing.

**Not disclosed.** Ledger L14 says rollover is UTC rather than client-local and that a
fresh meter starts a fresh day. It nowhere says the default meter has no day boundary at
all, and the code comment asserts the opposite.

**Severity 1** by this project's ladder: it is the same defect r3 filed at money-loss, in
the same file, after the commit that claims to have fixed it. Blast radius today is
bounded — nothing constructs a meter in production yet — but the contract defect r3
identified is untouched: `SpendMeter.todayUsd(clientId)` still takes no date, so the day
remains an implementation detail of one implementation and a DO-backed meter written to
this interface inherits the original defect.

---

### N-02 · 1 money-loss (control plane) · R3-CP-03 is NOT closed: `fullburn/vitest.workspace.mts` is Class-1 and silences 165 of 168 tests with every gate green

**Spec:** §10.3 CI gates; `gate-lib.mjs:26` ("The gates themselves and everything that
decides whether they run"); Phase 0 adversary focus ("try to bypass CI gate").

**Root cause.** The widened pattern is `/^fullburn\/vitest[^/]*\.(?:ts|js|mjs|json)$/`.
vitest 2.1.9 resolves workspace files from
`WORKSPACES_NAMES = ["vitest.workspace","vitest.projects"]` ×
`WORKSPACES_EXTENSIONS = [".ts",".mts",".cts",".js",".mjs",".cjs",".json"]`
(`node_modules/vitest/dist/chunks/constants.fzPh7AOq.js:11-19`). The pattern covers four
of the seven extensions. `.mts`, `.cts` and `.cjs` are Class-1.

**Reproduction, executed end to end in a clone:**

```
$ printf 'export default [{ test: { include: ["engine/test/vault.test.ts"] } }];\n' \
    > fullburn/vitest.workspace.mts
$ git add -A && git commit -m "chore: add a vitest workspace file"
$ git diff --name-status $BASE...HEAD
A       fullburn/vitest.workspace.mts
$ node fullburn/engine/scripts/class2-gate.mjs . $BASE
class2 gate: no Class-2 changes                                   EXIT=0
$ npm test
 ✓ |0| engine/test/vault.test.ts (3 tests)
 Test Files  1 passed (1)      Tests  3 passed (3)
$ npm run typecheck                                               EXIT=0
$ node engine/scripts/leak-check.mjs ..
leak/structural scan: clean                                       EXIT=0
```

Completing the chain exactly as r3 did (the tree hash moves, so a report bound to the new
hash is added — reports are add-permitted and L11/L13 disclose that authorship is
unverified):

```
$ node fullburn/engine/scripts/adversary-gate.mjs . $BASE
adversary gate: ADVERSARY_REPORT_phase0.probe.md: adversary report PASS and bound to the current tree
adversary gate: reports append-only holds                         EXIT=0
$ node fullburn/engine/scripts/class2-gate.mjs . $BASE
class2 gate: no Class-2 changes                                   EXIT=0
```

Every caps-immutability, spend-meter, cap-race, grade-registry, isolation and gate test
is gone, and the diff is two added files with no human approval. This is R3-CP-03's
original attack, unchanged, through an extension the widened pattern still misses.

**Also Class-1, same family:** `vitest.workspace.cts`, `vitest.workspace.cjs`,
`vitest.projects.mts`, `vitest.config.mts`, `vite.config.ts`, `fullburn/engine/.gitignore`,
`fullburn/engine/deploy/wrangler.toml`. (`vitest.config.mts` and `vite.config.ts` are not
independently exploitable while `vitest.config.ts` exists, because vitest takes the first
existing name in list order — but they are one deletion away, and deleting
`vitest.config.ts` is itself Class-2, so the combination fails closed today.)

---

### N-03 · 1 money-loss (control plane) · The base-commit binding fails open on an omitted argument, is erasable in one untested line, and still admits a replay under the wiring APPROVALS/README.md documents

Three legs. The r3 attack itself is closed (§2 above); these are what remains.

**Leg A — fail-open default.** `gate-lib.mjs:295` is
`(baseCommit === undefined || b.base === baseCommit)`. Direct call:

```
with baseCommit given (different): {"ok":false, …}   ← blocked
with baseCommit OMITTED          : {"ok":true,  "reason":"Class-2 changes carry transition approvals"}
```

**Leg B — one untested line erases it.** No test anywhere imports `class2-gate.mjs`
(`grep -rn "class2-gate" engine/test config/test` → 0 hits). Renaming the `baseCommit:`
property in `class2-gate.mjs:41` leaves the library receiving `undefined`, restores full
approval replay, and the suite stays **168/168 green**. The R3-CP-01 lock test exercises
the library only, always passing `baseCommit` — exactly the shape of gap this commit set
out to eliminate.

**Leg C — replay from the approval's own base.** APPROVALS/README.md instructs the human
to write `base-commit: <sha the pull request branches from — git merge-base origin/main HEAD>`.
Under that wiring the replay works. Executed:

```
A = b1fc37d                       (caps.ts dailyAdSpendUsd: 70)
B = A + raise 70→500  + human approval {base:A, from:sha(70), to:sha(500)}   gate exit 0
C = B + revoke 500→70 + human approval {base:B, from:sha(500), to:sha(70)}   gate exit 0
     (the revert is byte-identical to A — confirmed by sha256)

ATTACK 1 (r3's): branch from C, restore 500, copy the January approval verbatim
  class2-gate . C   -> CLASS-2 GATE FAIL … caps.ts (modified)          EXIT=1   ✔ closed

ATTACK 2 (new): branch from A instead, restore 500, replay the same approval
  merge-base(C, HEAD) = A
  class2-gate . $(git merge-base C HEAD) -> "Class-2 changes carry transition approvals"  EXIT=0
  git merge attack2 into C  ->  0 conflicts,  caps.ts line 37: dailyAdSpendUsd: 500
```

The merge is conflict-free *because* the revert restored the original bytes, so the
revoked $500 cap lands on the target branch. Under the wiring the CI workflow actually
uses (`origin/${{ github.base_ref }}` — the tip, not the merge base) attack 2 is refused,
which I also verified (`EXIT=1`). So the strength of a Class-2 money gate depends on
which ref the caller passes, and the documented invocation is the weak one. Ledger L5
records that CI has never run on GitHub Actions, so every gate run today is a local one.

**Severity 1** — this is the R3-CP-01 finding's own domain (money paths / Class-2 change
control), reached by three routes the fix did not consider.

---

### N-04 · 3 data-lie (control plane) · A plainly rendered, correctly bound `Verdict: FAIL` is silently ignored, because `readTreeBinding` still ignores fence length

**Spec:** §12 ("0 unreviewed FAILs"); `engine-adversary.md:41` ("FAIL blocks the phase
gate … only by the human, in writing"). The r3 R3-CP-02 write-up named this function
explicitly: *"the same bug is duplicated at gate-lib.mjs:118 in readTreeBinding."* The
fix was applied to `parseVerdict` only; `gate-lib.mjs:128-134` still stores
`fenceMatch[1][0]` — the marker character, discarding length.

**Reproduction.** A report file containing:

```
# ADVERSARY REPORT phase0.r5
Verdict: FAIL

The verdict line format, for reference:
````markdown
```
````
verified-tree: <CURRENT TREE HASH>

Nineteen severity-1 findings remain open. Do not merge.
```

CommonMark (verified with `marked@15`) renders this as
`<p>Verdict: FAIL</p>` … `<p>verified-tree: <CURRENT></p>` — a human reviewer sees a
FAIL correctly bound to this exact tree. The gate does not:

```
parseVerdict     : {"token":"FAIL","line":"Verdict: FAIL"}
gate, FAIL alone : {"ok":false,"reason":"r5-FAIL.md: report has no 'verified-tree:' binding (stale-report protection)"}
gate, FAIL+PASS  : {"ok":true, "reason":"r4-PASS.md: adversary report PASS and bound to the current tree"}
```

Mechanism: the odd fence-line count makes `readTreeBinding` believe the binding sits
inside a code block; `judgeReport` returns `fresh:false`; `checkAdversaryReport`'s
`fresh && !ok` filter skips it; the sibling PASS opens the gate and **the output never
names the FAIL report at all**. This is R3-CP-06's defect class — a tree-bound FAIL
failing open with no warning — restored through the sister parser the fix left alone.
The cross-family adversary that L8/H6b requires is precisely the party this silences.

---

### N-05 · 3 data-lie (control plane) · `<details>` concealment survives: a PASS hidden in a collapsed block opens the gate while the visible prose says "do not merge"

Documented inside r3's R3-CP-02 evidence ("The `<details>` leg DOES hold … a genuine
hiding place"). Untouched by the fix, which addressed fence length only.

```
Report:  # r
         The engine is NOT safe. Do not merge.
         <details><summary>appendix</summary>

         Verdict: PASS

         </details>
         verified-tree: <CURRENT>

parseVerdict -> PASS
gate         -> {"ok":true,"reason":"z.md: adversary report PASS and bound to the current tree"}
```

`marked@15` render, confirmed independently:
`<p>The engine is NOT safe. Do not merge.</p>` then `<details><summary>appendix</summary>`
`<p>Verdict: PASS</p>` `</details>` — a `<details>` element with no `open` attribute,
i.e. collapsed by default in every renderer including GitHub. `stripHtmlComments`
handles `<!-- -->`; nothing handles `<details>`.

The general defect is that `parseVerdict` decides visibility from four Markdown rules
(fence, indent, blockquote, column 0) while the artifact is rendered HTML. The durable
fix is a positive schema — the verdict must be line 2 of the file, at column 0, before
any fence or HTML block — not a growing list of hiding places.

---

### N-06 · 2 ban-risk · The `DECLARED_FIXTURES` allowlist is a token-hiding place: substitution runs *before* the secret rules, so a declared string spliced into a live token clears the scanner

**Spec:** §10.2 / §15 ("a token appearing in code, logs, or traces is a critical defect").

`scan-lib.mjs:95-99` does `content.split(fixture).join("[test-fixture]")` and then runs
`SECRET_PATTERNS` over the *result*. Executed against the shipped scanner:

```
CLEAN    bare declared fixture                             (intended)
FLAGGED  real-shaped token beside the fixture              (intended)
CLEAN    a live token that BEGINS with the fixture:  sk-ant-ABCDEFGH12345678ZZZZyyyyXXXXwwww9999
CLEAN    fixture spliced into a live token:          sk-ant-api0sk-ant-ABCDEFGH123456783-LIVEKEYMATERIAL1234567890
CLEAN    fixture used to split an AWS key:           AKIAsk-ant-ABCDEFGH12345678ABCDEFGHIJKLMNOP
```

Two distinct consequences. (a) Any real Anthropic key whose body begins
`ABCDEFGH12345678` is now permanently invisible to CI — vanishingly unlikely, but the
commit's own new test *asserts* that property (`expect(scanContent(path,
"sk-ant-ABCDEFGH12345678")).toHaveLength(0)`). (b) More usefully to an attacker, the
substitution is a general splitter: inserting the declared string eight characters into
any `sk-ant-` / `AKIA` / `whsec_` literal breaks the match while `grep sk-ant-` still
finds the material.

The mechanism predates the second entry — the canary splits tokens the same way — but
the new entry is itself a **token-shaped prefix of a live pattern**, which is what makes
it materially different from an obviously-synthetic canary string. And the guard test
added alongside it does not lock the property it claims: rewriting `withoutFixtures` to
strip `<fixture>[A-Za-z0-9]*` leaves the suite 168/168 green.

**Remedy (not applied — findings go back to the builder):** run the allowlist as an
exception *after* a pattern match — "this specific matched span equals a declared
fixture" — rather than as a text substitution before scanning.

---

### N-07 · 1 money-loss (weakest form; needs a meter other than `MemorySpendMeter`) · A `release()` that throws leaks headroom silently and bricks the client's day with zero provider calls

Scope item: *"what happens if release() itself throws?"* `gateway.ts:205-212` swallows it.

**Reproduction.** Meter whose `release()` throws; `gatewayBaseUrl` invalid so `new URL()`
throws *after* `reserve()` and *before* departure — a pure pre-departure failure, exactly
the case the release branch exists for:

```
ops(first 6) = [reserve|release-THROWS|reserve|release-THROWS|reserve|release-THROWS]
ok=0  capRefused=200  reserved=$5.0000  committed=$0.0000   (cap $5.00)
```

500 failures that never reached the provider consume the entire daily ceiling; the client
is then refused for the rest of the day (and, per N-01, forever under the default clock).
Nothing is traced about the leak — the `catch {}` is silent — and `todayUsd()` reports
`$0.0000` while $5.00 of headroom is gone.

`gateway.ts:203-204` asserts "`release` is idempotent and never throws for a stale
handle" as a property of the meter; `spend-meter.ts:69-70` documents no such requirement.
r3 raised this cross-module contract gap under M-04; the M-04 fix addressed the flag and
left the contract. **No money moves today** — `MemorySpendMeter.release` cannot throw —
so this is the same "weakest severity-1" the project accepted for M-04. Ranked 1 for
consistency with that precedent, and I want it on record as ranking below N-01/N-02/N-03.

---

### N-08 · 3 data-lie · A request that provably never left the building is settled as billable

`departed = true` is set at `gateway.ts:168`, before the `try` that wraps
`transport.post`. Anything that throws *inside* that try — including the transport
callable being absent or throwing synchronously, i.e. before any I/O — reaches the inner
catch and is settled:

```
transport.post is not a function (never departs)   ops=[reserve|settle] committed=$0.0100
transport.post throws SYNCHRONOUSLY                ops=[reserve|settle] committed=$0.0100
```

The direction is conservative (over-charge, not under-charge) and the behaviour is
unchanged from the pre-fix code, so this is not a regression. It is filed because the new
flag makes an explicit claim the code does not honour — *"The flag answers 'did it leave
the building', which is the only question the release decision may depend on"* — and
because combined with N-07 a misconfigured transport consumes a real client's daily cap
with zero provider calls. `decisions`-ledger accuracy (§3, Law 10) rests on this
boundary being real, not approximate.

**Also verified, and clean:** across all six paths I drove — success, transport rejection,
schema-invalid response, absent transport, synchronous throw, pre-departure failure — a
reservation is **never both settled and released, and never neither**. Every path shows
exactly one terminal meter operation. The `departed` flag itself is correct.

---

### N-09 · 3 data-lie · Across a UTC midnight, an in-flight reservation is invisible in both `todayUsd()` and `reservedUsd()`

```
midnight in-flight: reservedUsd before=$3  after=$0   todayUsd after=$0
                    additional $1 reservations accepted on the new day = 5 (cap $5)
  after settle, viewed from the prior day: todayUsd(2026-08-15) = $3
```

The accounting is correct — the spend lands on the day it was made — but `reservedUsd`
exists precisely so "an operator staring at `todayUsd() === 0` while every call is
refused" can see where the headroom went (R2-02, `spend-meter.ts:50-54`). During the
rollover window that property is lost: $3 is held, both readings say $0, and no interface
exists to ask about another day. Low blast radius, honest to report.

---

### N-10 · 5 dummy-proof · APPROVALS/README.md documents a base-commit the gate does not compute

README: `base-commit: <sha the pull request branches from — git merge-base origin/main HEAD>`.
`class2-gate.mjs:41`: `git rev-parse <baseRef>`, and the CI passes
`origin/${{ github.base_ref }}` — the **tip**. Executed on a branch that is behind main:

```
README says base-commit = git merge-base origin/main HEAD = b1fc37d…
CI computes baseCommit  = git rev-parse origin/main       = 7e54200…
DIFFERENT -> an approval written exactly as documented is rejected
```

Fails closed (an honest human is blocked, not an attacker admitted), so severity 5. But
it means an approval is bound to *"whatever main's tip is when CI happens to run"*: any
unrelated merge into main between signing and CI invalidates a valid human approval and
forces it to be rewritten. `class2-gate.mjs` is also internally inconsistent — the diff
uses `${baseRef}...HEAD` (merge-base) while `baseHashOf` and `baseCommit` read the tip.

---

### N-11 · HYPOTHESIS (not reproduced end to end) · `fullburn/package-lock.json` is Class-1 and decides what `npm ci` installs

Confirmed by execution: `isClass2("fullburn/package-lock.json") === false`, and
`.github/workflows/fullburn-ci.yml` installs with `npm ci`, which resolves strictly from
the lockfile (`resolved` URL and `integrity` both live there and both are attacker-
editable in a Class-1 diff). That is the same "everything that decides whether the gates
run" class the widened patterns were written to close: the lockfile decides what `vitest`
*is*. I did **not** execute the tamper — it needs registry access this sandbox does not
have — so this is a hypothesis on the exploit, not on the Class-1 status, which is fact.
Of the 443 tracked files, 64 are Class-2 and 379 Class-1; inside `fullburn/` the entire
Class-1 surface is now `APPROVALS/README.md`, `HUMAN_TASKS.md`, `package-lock.json` and
`reports/`. The lockfile is the only executable thing left in it.

---

## 5. Is ledger L15 honest?

**Yes.** Verified:

- r3 contains 47 findings (52 `###` headings minus 5 section headings) — matches "the r3 review confirmed 47".
- This pass addresses 9 finding IDs (M-01..M-04, R3-CP-01/02/03/04/06 — the human's "7", counting R3-CP-03/04 as one) and locks 6 further r3 findings (H-04, H-06, H-13, H-14, H-15, C1) plus M-02's two legs. 47 − 9 − 6 = 32, i.e. "~30 remain open". Honest.
- The four examples L15 names are all genuinely still open. Spot-checked by execution: `npm run invariants` still reports "No test files found, exiting with code 1" (H-18); `haven/` and `pulsern/` — 379 Class-1 files including client zero's app and ops scripts — are still outside every leak-scan root (H-16 / R2-29); `gateway.ts:213` still exempts `CapError` and `MeterUnavailableError` from redaction (A1).
- L14 is accurate as far as it goes on the UTC-vs-local and restart-persistence points.

**One ledger gap, folded into N-01:** L14 states the rollover is UTC rather than
client-local, which implies a rollover exists. It does not disclose that the default
constructor freezes the clock at the epoch so that no construction site in the repo rolls
over at all, and the code comment beside it asserts the opposite.

**Say it plainly:** the phase cannot be called done while L1–L15 are open. Thirty-odd
confirmed findings the human deliberately deferred are still defects; deferring them was
a scoping decision, not a resolution, and the ledger is the only thing keeping that
distinction honest.

---

## 6. Spec-level observations for the human (not findings)

1. **Class-2 has swallowed the codebase.** Inside `fullburn/`, Class-1 is now four
   paths. Every code change — production source, both test trees, scripts, manifests,
   runner config — is a Class-2 change requiring a signed approval naming a base commit
   that main's next merge invalidates (N-10). That is a lot of ceremony per commit, and
   ceremony that fires on everything stops being a signal. Worth deciding deliberately
   whether the gate should be *deny-by-default with a small explicit Class-1 allowlist*
   (which would also have caught `vitest.workspace.mts` and `package-lock.json`) rather
   than an ever-growing pattern list that a new filename keeps outrunning. Three rounds
   of review have now each found the same defect class through a new filename.

2. **The day belongs in the `SpendMeter` interface, not in one implementation.**
   `todayUsd(clientId)` still takes no date and `markets.ts` `localeClock` is still
   plumbed to nothing. Until the interface carries the day, every future meter — the
   Durable Object one §2.2 promises — can reintroduce M-03 while satisfying the contract.
   Relatedly, `llm()` has `deps.now` and never gives it to the meter: two clocks on one
   money path.

3. **The verdict-line schema is still specified nowhere.** ENGINE_BUILD.md and
   reports/README.md say nothing about it, while three findings across two rounds have now
   turned on its parsing. L8/H6b requires a second, non-Claude adversary to review this
   exact tree; that reviewer has no format to conform to, and N-04/N-05 show two ways its
   FAIL could be discarded without anyone noticing. Pin the schema in §10.3: *verdict on
   line 2, column 0, `Verdict: PASS|FAIL`, before any fence or HTML block; tree binding on
   line 3; anything else is a hard gate failure.*

4. **`fullburn/APPROVALS/` is outside `TREE_SCOPE`**, so an adversary PASS is by
   construction not a statement about the approvals directory, and `APPROVALS/README.md`
   — the document telling the human how to sign — is Class-1.

5. **The commit does not pass its own Class-2 gate** (§1). That is correct and expected;
   noting it so the human knows seven approval entries are outstanding, and that r3's
   H-17 (the `HUMAN_TASKS.md` approval list is wrong in both directions) is still queued
   and now also needs `engine/src/**`, `wrangler.*` and `.gitignore` reflected.

---

## 7. Repo hygiene

All mutation, replay, render and probe work ran under
`/tmp/claude-0/…/scratchpad/{work,cp1,render}`. Nothing was written into the repository
except this report. `git status --porcelain` is empty; the suite is 168/168, typecheck
exit 0, `leak/structural scan: clean` on the untouched tree.

No builder code was fixed. Every finding above is reproduced by execution except N-11,
which is labelled a hypothesis.
