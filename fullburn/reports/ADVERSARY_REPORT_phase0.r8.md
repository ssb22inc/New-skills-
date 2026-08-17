# ADVERSARY REPORT phase0.r8
Verdict: FAIL
verified-tree: e586f0e2fb520e328455b5275fa92a172fbd40e7

Round 8, same-family review of Phase 0 at commit `7516cd4` on branch
`claude/fullburn-engine-spec-r7v5lg`. Every number below was executed in this
sandbox, not reasoned from source. The tree was verified byte-identical to
`HEAD` before and after every experiment.

## Gate state — independently re-run, not taken on trust

| Command | Claimed | Observed |
|---|---|---|
| `npx vitest run` | 277 passed | **277 passed, 19 files** ✓ |
| `npm run typecheck` | clean | **clean** ✓ |
| `npm run leak-check` | clean | **clean** ✓ (but see R8-07) |
| `npm run mutate` | 81 caught / 0 survived / 0 not found | **81 mutations: 81 caught, 0 survived, 0 not found** ✓ |
| `npm run e2e` | passes | **1 passed** ✓ (with `PLAYWRIGHT_CHROMIUM_PATH`) |
| tree hash | `e586f0e2…` | **`e586f0e2fb520e328455b5275fa92a172fbd40e7`** ✓ |

The builder's numbers are all true. They are also not the question. Eleven
mutations I wrote myself were applied to this tree; **six survived the full
suite**, four of them on the code the R7 fixes introduced.

## Ranked findings

| ID | Severity | Domain | Gate consequence |
|---|---:|---|---|
| R8-01 | 1 — money loss | Cap enforcement | `llm()` enforces the caller's ceiling, not the frozen table's. $50 committed against a $20 month, executed. |
| R8-02 | 1 — money loss | Meter API | `settle(handle, actualUsd)` is `record()` with a handle: uncapped write, and `settle(h,0)` bills the provider while the ledger reads $0.00. |
| R8-03 | 1 — money loss | Spend periods | R7-02 is protected at DAY granularity only. A one-line UTC revert of the MONTH key leaves 277/277 green and re-opens the breach on the real exposure ceiling. |
| R8-04 | 1 — control plane | Class-2 change control | The R7-07 in-repo half covers 38 of 97 Class-2 files, and the gate that enforces Class-2 never runs on the PR that deletes it. |
| R8-05 | 3 — data lie | Grade registry | R7-10 is defeated by mutating the genuine array in place; its area-count guard has no test at all. |
| R8-08 | 3 — money (latent) | Spend clock | The advancing half of R7-03's high-water guard survives deletion. |
| R8-07 | 3 — data lie | Leak scan | `leak-check` still reports "clean" for a root it cannot scan. |
| R8-06 | 5 — dummy-proof | E2E expiry | Fourth evasion, two ways: `test.skip()` in the body, and `testIgnore`/`testMatch`/`grep`. |
| R8-09 | 5 — process | Mutation harness | The project's acceptance bar for a fix is not a CI stage. |

---

## R8-01 — `llm()` no longer enforces the frozen cap table (severity 1)

**Attacked:** the R7-06 fix's effect on the only money path that exists.

Commit `858b766` did two things to `gateway.ts`. It removed the ceilings
argument from `reserve()` — the stated fix — and, in the same edit, it severed
the one connection between `config/caps.ts` and the enforcement point:

```diff
-    const caps = effectiveAiCapsUsd(req.clientId, deps.capsTable);
+    effectiveAiCapsUsd(req.clientId, deps.capsTable);
     ...
-    reservation = meter.reserve(req.clientId, card.costBudgetUsdPerCall, caps);
+    reservation = meter.reserve(req.clientId, card.costBudgetUsdPerCall);
```

The ceilings the meter enforces now come from the `CapsResolver` handed to
`new MemorySpendMeter(now, capsFor)`. `deps.meter` is supplied by whoever calls
`llm()`. `llm()` never checks that the meter it was given resolves against the
frozen table, and the value it computes from the frozen table is discarded.

**Executed.** `fixture-testco`'s frozen ceilings are `{dailyUsd: 5,
monthlyUsd: 20}`. With a meter built as
`new MemorySpendMeter(clock, () => ({dailyUsd: 100000, monthlyUsd: 100000, timeZone: "UTC"}))`,
5,000 `llm()` calls at `$0.01` each:

```
FROZEN CEILINGS for fixture-testco { dailyUsd: 5, monthlyUsd: 20, timeZone: 'UTC' }
A1 committed today USD: 50   month: 50
```

No `CapError`. 5,000 gateway requests dispatched. Before `858b766` this attack
was structurally impossible on the `llm()` path, because `llm()` itself computed
the ceiling from the frozen table and passed it in — the widening seam R7-06
found required bypassing `llm()` and calling `reserve()` directly. **The fix
moved that seam onto the public path and made it the only ceiling there is.**

**And the one guard that remains is unprotected.** I deleted
`effectiveAiCapsUsd(req.clientId, deps.capsTable);` from `llm()` outright — the
sole surviving enforcement of H8 sign-off on the LLM money path — and all 277
tests stayed green. The test that appears to cover it
(`gateway.test.ts`, "unsigned caps refuse ALL AI spend (R2, H8)") passes for an
unrelated reason: `makeDeps()`'s meter resolver is *also* `effectiveAiCapsUsd`,
so the refusal comes from the meter, not from the line under test. This is the
r6/r7 lesson exactly — the catch comes from somewhere other than the thing that
claims it.

**Why this is a defect:** Law 2 says spend caps live in `config/caps.ts` and no
runtime path may raise one. On this tree the frozen table does not reach the
comparison. R7-06's own standard applies unchanged: "no caller does that today"
is not a safety property, and here the caller is `llm()`'s own dependency
object.

**Required correction:** `llm()` must not accept a ceiling it has not verified.
Either the meter resolves from the frozen table by construction (no injectable
resolver on the production type), or `llm()` re-derives `effectiveAiCapsUsd()`
and refuses a meter whose resolved ceilings for this client differ from it. Add
a test that builds a wide meter and asserts the frozen ceiling still binds, and
a mutation entry for the sign-off call site that does not pass through a meter
resolver that duplicates the check.

---

## R8-02 — `settle(reservation, actualUsd)` is `record()` with a handle (severity 1)

**Attacked:** the money-write surface R7-05's fix added to the interface R7-06's
fix had just been cleaned.

`record()` was deleted in `858b766` because it "wrote committed day and month
values with no cap lookup, no sign-off check and no ceiling check." `7516cd4`
added an optional second parameter to `settle()` that does the same thing:

```ts
const micros = actualUsd === undefined ? open.micros : toMicros(actualUsd, "actual provider charge");
for (const period of [open.day, open.month]) {
  this.#committedMicros.set(period, this.#read(...) + micros);
}
```

No cap check, no ceiling comparison, no bound in either direction.

**Executed, against client zero's real signed caps ($10/day, $200/month):**

```
reserve("pulsern", 0.01); settle(r, 5000);
A2 committed: 5000 5000          <- $5,000 committed, no CapError
```

```
for (i<5000) settle(reserve("pulsern", 0.01), 0);
A2b after 5000 settled calls, todayUsd = 0
```

The second is the dangerous direction: 5,000 reservations taken, departed and
closed, and the ledger reads `$0.00`. That is a cap breach and a data lie in one
operation — the same sentence `spend-meter.ts` uses to describe R5-01.

**On the human's R7-05 ruling.** I am not re-litigating it. The ruling is that
the live number is an estimate trued up by daily reconciliation, and L26 records
that honestly. My finding is narrower and is about the mechanism, not the
policy: **the parameter added to implement the ruling has no production caller
at all.** `gateway.ts` calls `meter.settle(reservation)` with one argument on
both the success path and the error path. I confirmed the R7-05 mutation's only
catches are three `locks-r7` tests that call `settle(handle, actual)` directly:

```
× (R7-05) an actual charge above the estimate is what consumes the ceiling
× (R7-05) an actual charge below the estimate returns the difference
× (R7-05) a non-finite actual is refused rather than rounded away
```

So the fix committed an unrestricted money-write primitive to the interface this
file explicitly tells the Phase 5/6 ad-spend path to "adopt unchanged", and
bought nothing on the money path for it. That is the R7-06 finding, reopened by
the R7-05 fix, in the same commit series.

**Required correction:** either wire an actual charge through the transport
(a typed usage receipt, so the parameter has a producer), or remove the
parameter and let the daily reconciliation write its correction through its own
audited path. If it stays: bound it — an actual outside a configured multiple of
the reservation must refuse and alert rather than commit silently, and an actual
of `0` for a departed request must be refused, not honoured.

---

## R8-03 — the R7-02 fix is protected at day granularity only (severity 1)

**Attacked:** whether a one-line revert of the R7-02 fix leaves CI green.

`zoneMonthKey` is the one line that buckets the **monthly** ceiling — the one
`caps.ts` calls "the real exposure ceiling" and `spend-meter.ts` calls "what
bounds total exposure". I reverted only that line to UTC:

```js
// export function zoneMonthKey(nowMs, timeZone) {
-  return zoneDayKey(nowMs, timeZone).slice(0, 7);
+  void timeZone; return new Date(nowMs).toISOString().slice(0, 7);
```

**Result: `*** SURVIVED ***` — 277/277 still green.** The day key stays
client-local, so every R7-02 test passes; nothing anywhere exercises a
client-local month boundary.

**And the revert re-opens the breach.** I drove client zero's $200 month to
exactly $200 across twenty local days, then moved the clock to
`2026-09-01T00:30:00Z`:

```
local month key: 2026-08   UTC slice: 2026-09
month committed: 200
unmutated : reserve($1) throws   (correct — still August in New York)
mutated   : reserve($1) SUCCEEDS (a fresh $200 opened four hours early)
```

Four hours for New York; up to fourteen for a UTC+14 client. This is R7-02's own
shape — "$10 at 23:59Z and $10 at 00:01Z are two ledger days and ONE New York
day" — reproduced at the month, against the ceiling that actually bounds
exposure, on a tree that claims the finding closed.

The mutation harness's `R7-02 zone-bucketed day key` entry only catches this
incidentally, because `zoneMonthKey` happens to call `zoneDayKey`. A refactor
that inlines the month key — or an attacker who reads the entry list — walks
straight through.

**Required correction:** a lock test that drives a client-local month rollover
in a non-UTC zone from both sides, and a mutation entry that reverts
`zoneMonthKey` alone. Add the DST case for the month too: a month boundary in a
zone whose offset changed mid-month.

---

## R8-04 — the R7-07 in-repo half is holed on both artifacts (severity 1)

I accept the human's ruling and am not re-raising the missing branch-protection
half. Both of these are ways the **in-repo** half fails to do what it claims.

### (a) CODEOWNERS covers 38 of 97 Class-2 files

H19 requires "CODEOWNERS requiring your review on `fullburn/APPROVALS/**` and on
**every Class-2 path** listed in `engine/scripts/gate-lib.mjs`". Enumerated
mechanically against `isClass2()` over `git ls-files`:

```
tracked Class-2 files: 97   of which UNOWNED: 59
```

Removing the sibling trees (see observations), the unowned Fullburn set still
includes **every one of these**:

```
fullburn/package.json          fullburn/package-lock.json     fullburn/PHASE
fullburn/vitest.config.ts      fullburn/playwright.config.ts  fullburn/tsconfig*.json
fullburn/engine/wrangler.toml  fullburn/.gitignore            fullburn/config/package.json
fullburn/engine/package.json   fullburn/engine/tsconfig.json  fullburn/config/tsconfig.json
every file under fullburn/engine/test/ and fullburn/config/test/   (17 files)
every file under fullburn/engine/evals/                            (6 files)
```

These are not incidental. They are the specific paths this project's own history
records as lethal: `vitest.workspace.mts` silenced 165 of 168 tests with every
gate green (N-02); `package.json` redefined `npm test` into a no-op (R2-04);
`package-lock.json` "was the only executable thing left in the Class-1 surface"
and "decides what `vitest` actually is" (N-11); `PHASE` decides whether the H20
expiry fires at all; and `gate-lib.mjs` says of the test directories, "tests are
the only thing standing between a defect and a green gate, so silencing one is a
human decision."

The lock test is titled **"CODEOWNERS covers the approval mechanism and
everything it protects"** and asserts six hard-coded strings. It reads as
coverage of the Class-2 set and is coverage of six paths — the `CLASS2_FILES`
mistake H-03 already found once, in a new file.

### (b) The gate that enforces Class-2 does not run on `.github/` changes

`.github/**` is a `CLASS2_PATTERN`. `class2-gate` and `adversary-gate` are jobs
inside `fullburn-ci.yml`, whose trigger is:

```yaml
on:
  pull_request:
    paths: ["fullburn/**", ".github/workflows/fullburn-ci.yml"]
```

GitHub applies `paths` to the whole workflow, so **a PR that touches only
`.github/CODEOWNERS` triggers no workflow, runs no gate, and never executes the
`locks-r7` test that guards it.** The artifact created this round to make
"human-only" real can be deleted by a diff that runs nothing. The same holds for
any new `.github/workflows/*.yml` and for `.github/steps/**`.

No test asserts that the CI trigger's `paths` filter covers `CLASS2_PATTERNS`; I
grepped the whole test tree, and `.github/workflows/fullburn-ci.yml` appears only
once, as a Class-2 witness string.

**Required correction:** (i) generate CODEOWNERS from `CLASS2_PATTERNS`, or add a
test that fails when any `isClass2()` path under `fullburn/` or `.github/` has no
CODEOWNER rule — the same "every pattern must claim a witness" discipline
`locks-r5` already applies to `CLASS2_WITNESS_PATHS`; (ii) widen the workflow's
`paths` to cover `.github/**`, or drop the filter on the two gate jobs, and add a
test that holds the filter to the Class-2 pattern set.

---

## R8-05 — R7-10's provenance check is defeated by in-place mutation (severity 3)

**Attacked:** the `COMPUTED` WeakSet, on the axis its own comment names.

`enforcement()` proves the *array's* identity and then checks only its *length*
— "in case a caller mutated the array it was handed". Length is not what a
caller would mutate.

**Executed:**

```
const real = computeGrades({});          // every area BELOW_A
enforcement(real).length                 -> 24 actions
real[i] = { area: real[i].area, grade: "A", failing: [], missing: [] }   // in place
enforcement(real).length                 -> 0 actions
publishGradeReport(real, 0)              -> published, every area "A"
```

Identity holds (same array), length holds (same length), and every autonomy
freeze disappears. `publishGradeReport` — a client-visible number under Law 10 —
publishes the forgery. A second variant: `real[1] = real[0]` duplicates an area
and drops another; length is unchanged and enforcement proceeds on the wrong set.

R7-10's stated requirement included "validate exact area/metric coverage". Only
count is validated, and **even that guard has no test**: mutating
`if (grades.length !== GRADE_AREAS.length)` to `if (false)` survives the full
suite, because the one test that could reach it (`enforcement(real.slice(0, 1))`)
is refused by the identity check first. The guard added by the fix is dead
weight that reads as coverage.

**Required correction:** freeze the grade objects and the array in
`computeGrades`, and validate that the area names present are exactly
`GRADE_AREAS`' area names, in order, with no duplicates. Add a mutation entry
that removes the coverage check and a lock test that mutates a genuine result in
place.

---

## R8-08 — the advancing half of R7-03's clock guard is untested (severity 3)

```js
-    if (seen === undefined || day > seen) this.#highWater.set(clientId, day);
+    if (seen === undefined) this.#highWater.set(clientId, day);
```

**`*** SURVIVED ***`** — 277/277 green. With that revert the high-water mark pins
only the *first* day the meter ever saw for a client, so a clock may move
backwards into any day after it. The `locks-r7` test proves only the two-day case
that starts at the mark.

In the in-memory meter this does not mint headroom today, because every past
day's ledger is still in the map. L14 and L21 both say the meter becomes
Durable-Object-backed and day-keyed, where an evicted or pruned day *is* a fresh
ceiling — which is precisely the future R7-03 exists to protect. Filed at 3
rather than 1 because the exploit needs the storage change that is already
planned, not because the line is optional.

---

## R8-07 — `leak-check` still reports clean for a root it cannot scan (severity 3)

The fix added `assertScannableRoot(repoRoot)` so "a scan that cannot see its own
scope must say so, not pass." It is placed after an earlier return:

```js
export function scanTree(repoRoot) {
  const findings = [];
  if (!existsSync(repoRoot)) return findings;   // <- exits before the guard
  assertScannableRoot(repoRoot);
```

**Executed:**

```
$ node engine/scripts/leak-check.mjs /nonexistent-root
leak/structural scan: clean
exit=0
```

A typo in the CI argument, a renamed checkout directory, or a future job whose
`working-directory` changes produces a green scan over zero files. Same class as
the bug being fixed, one branch away.

**Required correction:** make a non-existent root an error, not an empty result,
and add a mutation entry for the early return.

---

## R8-06 — H20 e2e expiry, evasion number four (severity 5)

Two independent ways, both executed against `e2eVarianceHolds` / `runnerTargets`
as committed.

**(a) A runtime skip.** `.skip` and `.todo` as *modifiers* are refused. The
runtime form — idiomatic Playwright conditional skipping — is not:

```ts
test('intake confirm flow', async ({ page }) => {
  test.skip();                       // executes nothing from here
  await page.click('#confirm');
  expect(1).toBe(1);
});
```

```
A4a holds = true
```

`test.fixme()` in the body does the same. The title matches, the body contains
`page.`, `await` and `expect(` outside strings, and Playwright runs none of it.

**(b) A config that excludes the spec from the run.** `runnerTargets` reads only
`testDir`. Playwright decides what actually runs from `testDir` **and**
`testIgnore`, `testMatch`, `grep`, `grepInvert`, and per-project overrides of all
of them:

```
A4c testIgnore        -> runnerTargets = true    ({ testDir: "engine/test/e2e", testIgnore: "**/intake.spec.ts" })
A4c testMatch         -> runnerTargets = true    ({ testDir: "engine/test/e2e", testMatch: "smoke.spec.ts" })
A4c grep              -> runnerTargets = true    ({ testDir: "engine/test/e2e", grep: /smoke/ })
A4c projects/testMatch-> runnerTargets = true    ({ ..., projects: [{ testMatch: "smoke.spec.ts" }] })
```

Every one of those leaves the invariant asserting the variance holds while
Playwright never loads the spec that satisfies it. R6-03's own argument applies
verbatim: `testIgnore` and a per-project `testMatch` need no intent to deceive.

A third, smaller hole: `.filter(s => s.name !== "smoke.spec.ts")` carries no test
— removing it survives the full suite.

**Required correction:** R7-08's own remedy, which was not taken — query the
*resolved* runner configuration (`playwright test --list --reporter=json`) and
require execution evidence from a tagged test, rather than regexing the config
source. L24 already concedes the static check "cannot verify that the test is a
good one"; it should also concede, or fix, that it cannot verify the test runs.

---

## R8-09 — the mutation harness is not a CI stage (severity 5)

`npm run mutate` is the project's stated acceptance bar for a fix and the
mechanism by which four rounds of "unprotected fix" lessons are enforced. It
appears in `package.json` and in no CI job. A `*** SURVIVED ***` or a
`PATTERN-NOT-FOUND` is detected only when a human or an adversary runs it by
hand; between rounds, a refactor can quietly strand every entry that names a
moved line.

Second half: the harness runs `npx vitest run` only. A fix protected by
`typecheck`, `leak-check`, the integration CLIs or Playwright cannot be
represented in it at all — which is why R8-04(b), a CI-trigger defect, has no
mutation shape.

---

## Mutation-harness audit

The claim `81 mutations: 81 caught, 0 survived, 0 not found` is **true as run**,
and I verified the full log. Two qualifications:

1. **One entry's catch comes from a path with no production caller.**
   `R7-05 actual charge committed` is caught only by three `locks-r7` tests that
   invoke `settle(handle, actual)` directly. `gateway.ts` never passes an actual.
   The entry proves the parameter functions; it proves nothing about the money
   path (R8-02).
2. **Six of my eleven mutations survived**, four of them on R7 fix code:
   `zoneMonthKey` → UTC (R8-03), the high-water advance (R8-08), the R7-10 area
   count (R8-05), and the smoke-spec filter (R8-06). A seventh — deleting
   `effectiveAiCapsUsd()` from `llm()` — survived and is the evidence for R8-01.
   `reservedUsd`'s corruption guard also survived; that one is honest dead code
   of the L19/L23/L25 class, but it is not recorded in any of those rows.

Two of my mutations were semantic no-ops and are reported as such rather than as
survivors: moving `departed = true` inside the `try` before the `await` (already
what the code does), and a comment-only edit to `leak-check`. R7-04's own
mutation pair is sound — deleting `departed = true` and widening the
`PreDispatchError` test are both caught, and I could not construct a dispatch
path that reaches `post` with `departed` false.

## §10.2 standing-invariant checklist

| Invariant | Result |
|---|---|
| Writes-only; no mass-read of platform APIs (Law 1) | **PASS** — structural rule fires on a seeded `graph.facebook.com` fetch; write-verb half correctly deferred to Phase 6 |
| Spend caps present, immutable at runtime, tested by attempted breach (Law 2) | **FAIL** — immutable and present, but the enforced ceiling is the caller's (R8-01) and `settle()` writes past it (R8-02, R8-03) |
| Per-client isolation; seeded cross-tenant read fails (Law 3) | **PASS** — `vaultForClient("client-b").get("token")` throws `VaultError`; scope cannot be re-pointed |
| Every LLM call through AI Gateway; every decision traced (Law 11) | **PASS** — transport URL asserted against `gatewayBaseUrl`; refusals traced; trace loss now surfaced on the thrown error |
| Proxies-kill-only in code (Law 5) | Deferred to Phase 5 — declared, phase matches §11 |
| No prediction-gate code paths (Law 6) | **PASS** — structural rule fires on a seeded `predictedRoas < target` gate |
| Trust ladder cannot skip rungs (Law 8) | Deferred to Phase 5 — declared |
| `decisions` ledger append-only | Deferred to Phase 2 — declared |
| External content is data, never instructions | **PARTIAL PASS** — hostile payload through `llm()` leaves caps, bindings and channels untouched. I additionally swept the whole tree for instructions aimed at this review; the only matches are the project's own fixture and quoted history. **No prompt injection found.** |
| `VERDICT.md` hash-locked | Deferred to Phase 6 — file does not exist yet; report/approval append-only checks are live and verified in the integration suite |
| Tokens only in the vault | **PASS with a caveat** — `leak-check` clean over the whole repo; the vault never echoes a value even on a miss; but see R8-07 |
| Queue past SLA waits; locked flags structurally inert | **PARTIAL PASS** — `requireActiveChannel("tiktok")` and `("google")` both throw `SwitchboardError` (staged ≠ live); `activeChannels() === ["meta"]`. Queue half deferred to Phase 6 — declared |

## Governance checks (Phase A step 7)

- **`VERDICT.md` hash intact** — n/a, Phase 6 deliverable; the append-only
  machinery that will guard it is live and exercised against a real git repo.
- **Token scan** — clean. Residual R8-07.
- **Hostile instructions in fixtures** — swept; none aimed at this review. The
  seeded fixture is inert (invariants suite).
- **Queue item past SLA** — no queue exists; correctly declared not-yet-applicable.
- **Locked market/channel flag activation** — structurally impossible: no runtime
  mutation API, `deepFreeze`d registries, accessor-only reads enforced by a
  structural scan rule.
- **Second client while one is unstable** — no onboarding path exists.
- **Class-2 self-approval** — `checkApprovalAuthorship` refuses
  `Claude <noreply@anthropic.com>`, `github-actions[bot]`, `Claude Opus 5 <…>`;
  the CLI supplies `%an <%ae>` from git. This works. R8-04 is about the two
  artifacts around it, not this check.
- **Adversary did not modify anything** — no source file, test, config, ledger or
  existing report was edited. `git status` is empty; the tree hash after all
  experiments is `e586f0e2fb520e328455b5275fa92a172fbd40e7`, unchanged. Every
  probe ran from a scratch file outside the repo, copied in and removed. Nothing
  was committed. I have not touched the Grade Registry, its thresholds, the Laws,
  the improvement loop, or my own definition.

## Additional observations (not verdict-determining)

- **`CLASS2_PATTERNS` reaches outside Fullburn.** The unanchored rules
  (`package.json`, `package-lock.json`, `playwright.`, `e2e/`, `.gitignore`,
  `.nvmrc`, `tsconfig*.json`) classify 19 files in the sibling `haven/` and
  `pulsern/` trees as Class-2. The CI `paths` filter means `class2-gate` never
  sees a PR that touches only those, and a mixed PR would demand human approvals
  for files that have nothing to do with Fullburn. A scope mismatch in both
  directions; worth anchoring the patterns to `fullburn/` and `.github/`.
- **`validateOutput` still uses `key in obj`**, so an inherited property
  satisfies a required field, and numeric fields still accept `NaN` and
  infinities. R7 raised this as an observation; it is unchanged.
- **`new URL(model.gatewayRoute, deps.gatewayBaseUrl)`** still does not prove the
  result is an approved AI Gateway origin. R7's observation, unchanged.
- **Committed and zero-valued period entries are never pruned.** R7's
  observation, unchanged; it interacts with R8-08 once the meter is DO-backed.
- **`reservedUsd`'s corruption guard has no reachable input** — same honest class
  as L19/L23/L25 but recorded in none of them.

## Verdict basis

**FAIL.** R8-01, R8-02 and R8-03 are each independently sufficient: two are
executed cap breaches on client-zero-shaped caps, and the third is a one-line
revert of a severity-1 fix that leaves the whole suite green. R8-04 is a
control-plane failure in the artifact this round created to close a severity-1
control-plane finding.

The pattern across R8-01, R8-02 and R8-03 is one pattern: **each R7 fix closed
the specific hole the reviewer named and left the class open one step to the
side.** R7-06's ceilings moved from a parameter to a constructor; R7-05's
estimate problem was answered with an uncapped write; R7-02's UTC day was fixed
and its UTC month was not tested. R6 and R7 both concluded that surviving
severity-1s were unprotected rather than wrong. This round's are protected in the
place that was attacked and unprotected one line over.

## Minimum re-review gate

1. Reconnect `config/caps.ts` to the enforcement point on the `llm()` path, and
   lock it with a wide-meter test the frozen ceiling still refuses.
2. Give `settle()`'s actual charge a producer or remove it; bound it either way.
3. Lock the client-local **month** boundary with its own test and its own
   mutation entry, in a non-UTC zone, from both sides.
4. Generate or test-enforce CODEOWNERS coverage of the full Class-2 set, and make
   the CI trigger cover every `.github/` path the Class-2 patterns claim.
5. Freeze grade objects and validate exact area coverage by name.
6. Replace the e2e expiry's config-regex with resolved-runner evidence, and
   refuse a body that skips itself at runtime.
7. Add mutation entries for every guard named above, run the harness, and put it
   in CI.
8. Re-attack. This report remains FAIL for
   `e586f0e2fb520e328455b5275fa92a172fbd40e7`.
