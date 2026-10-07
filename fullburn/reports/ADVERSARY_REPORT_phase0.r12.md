# ADVERSARY REPORT phase0.r12
Verdict: FAIL
verified-tree: 7eef336cb9d2d74ec5d33ee98c6342683f446326

Round 12, same-family review of Fullburn Phase 0 at commit `18e1681` on branch
`claude/fullburn-engine-spec-r7v5lg`. Reports are append-only; this supersedes
nothing. r11's FAIL and its seven findings are the immediate history judged
here.

Tree hash recomputed independently, with the same command r11 used:

```
git ls-files -s -- 'fullburn/' '.github/' ':!fullburn/reports/' ':!fullburn/APPROVALS/' | git hash-object --stdin
7eef336cb9d2d74ec5d33ee98c6342683f446326
```

(`git rev-parse HEAD^{tree}` = `b7de20c4714f1ecb224a98b3b8e1a1046a353ded`, the
whole-repo tree; the scope hash above is the one the adversary gate binds to.)

---

## Gate state — every number re-measured, none taken on trust

| gate | claimed | measured | verdict |
| --- | --- | --- | --- |
| `npm test` | 306/306 | **306 passed / 22 files**, exit 0 | matches |
| `npm run typecheck` | clean | clean, exit 0 (2.1s) | matches |
| `npm run drill` | green | **1 passed**, exit 0, own runner | matches |
| `npm run mutate` | meta-check passed, then 133 / 133 caught / 0 survived / 0 not found | **meta-check: both canaries `ok`; 133 mutations: 133 caught, 0 survived, 0 not found**, exit 0 | matches |
| `npm run leak-check` | — | `leak/structural scan: clean`, exit 0 | |
| `npm run e2e` | — | 1 passed (`the e2e stage really drives a browser`, 236ms) with `PLAYWRIGHT_CHROMIUM_PATH` set | |
| `npm run owed-approvals` | a sixth set is owed | **16 entries owed** against base `98a8646`, including `engine/src/spend-ledger.ts` (added) | matches |
| post-run tree state | — | `git status --porcelain` empty, no `.mutate-inflight.json`, `pgrep -c node` = 0 | |

Every number the builder claimed is true. The findings below are things the
gates do not ask about, not things the gates got wrong.

**How the attacks were run.** An isolated mirror of `18e1681` at
`/tmp/.../scratchpad/r12/repo/fullburn`, its own git repo with `.github/`
present so the control-plane tests resolve, source verified byte-identical to
`git show 18e1681:` for every file touched, baseline verified green at 306/306
before and after every experiment. **No file in the repository was modified**;
the only addition is this report. `npm run mutate` was run once, to completion,
on the real tree with nothing else running against it.

---

# FINDINGS

Ranked by the severity order in `.claude/agents/engine-adversary.md`:
money loss > ban risk > data lies > isolation breaks > dummy-proof.

---

## R12-01 — SEVERITY 1 (money loss). The ledger left the meter and arrived as a PUBLIC, UNFENCED MONEY-WRITE PRIMITIVE. `processLedger().setCommittedMicros(period, 0)` mints a fresh ceiling on every call — no patching, no forgery, no cast, no test marker. Both R11-07 fences are irrelevant to it.

**$30 of real spend against a frozen $5/day and $20/month. 3,000 dispatches
through the real `llm()`. Zero `CapError`s. ONE production meter, constructed
once. `todayUsd()` reads $0.00 throughout.**

### The measurement

```ts
import { llm } from "engine/src/gateway.ts";
import { FrozenCapsSpendMeter } from "engine/src/spend-meter.ts";
import { processLedger } from "engine/src/spend-ledger.ts";   // a public export

const meter = new FrozenCapsSpendMeter();   // ONE meter, correctly constructed, branded, frozen
const led   = processLedger();              // the interface. no cast.

for (let i = 0; i < 3000; i++) {
  await llm({ ...deps, meter, bindings: ROLE_BINDINGS },
    { role: "hello-world", clientId: "fixture-testco", input: {}, trace: new TraceContext(`a1-${i}`, "fixture-testco") });
  for (const period of [`d:${day}|fixture-testco`, `m:${month}|fixture-testco`])
    led.setCommittedMicros(period, 0);      // a method ON THE SpendLedger CONTRACT
}
```

```
[A1] served=3000 capErrors=0 realSpend=$30.00 frozenDaily=$5 frozenMonthly=$20 todayUsd=$0.00
```

Nothing here is an attack technique. `processLedger()` is exported from
`engine/src/spend-ledger.ts`. `setCommittedMicros` and `setReservedMicros` are
declared members of the `SpendLedger` interface — the interface the file's own
header says **"Phase 2's Durable Object implements exactly this"**. An ordinary
module written next month, importing what the module exports and calling what
the interface declares, zeroes any client's committed spend for any period.

### Why this is not L31(b), and not covered by the Phase 2 plan

L31(b) discloses that an **in-process patch** of `MemorySpendMeter.prototype.reserve`
still spends past the ceiling, and states the architectural close: "move the
reserve arithmetic INSIDE the ledger when the DO lands, so the cap is enforced
at the storage boundary and no in-process patch can reach past it."

That fix does not touch this. A monkey-patched prototype is recognisably an
attack; `led.setCommittedMicros(p, 0)` is the storage contract used as written.
A DO-backed `SpendLedger` implementing this same interface will expose the same
setter to the same callers, so **moving the arithmetic inside the ledger leaves
this open** — the ledger would then refuse an over-cap `reserve` while still
accepting "set this client's committed spend to zero" from anyone who can
import it. The planned close is for a different hole.

### Why this is the recurring root cause, exactly

R7-06 deleted `record()` from `SpendMeter` with this reasoning, quoted from
`spend-meter.ts:117-121`:

> "`record()` IS GONE. It wrote committed day and month values with no cap
> lookup, no sign-off check and no ceiling check — **an unrestricted
> money-write primitive on the interface this file told the Phase 5/6 ad-spend
> path to 'adopt unchanged'**."

R8-02 deleted `settle(r, actualUsd)` for the same reason. `SpendLedger` puts it
back, one layer down, on the interface the Phase 2 Durable Object is told to
adopt unchanged. Before `18e1681` the committed figures lived in `#committed`,
a private field of the meter, reachable only by patching a prototype. This
commit made them reachable by importing a function.

### Leg B — the fences that were built are around the wrong door, and are themselves incompletely enumerated

The commit builds two fences on `resetProcessLedgerForTests`, on the stated
grounds that "a reset IS R11-07 in one call: wipe the committed micros and the
ceiling is fresh". Both fences were measured and both work **for the name they
enumerate**:

- the runtime fence (`__vitest_worker__`) refuses outside a test runner — driven
  in `locks-r11`, and it discriminates;
- the invariant `no production module reaches the ledger's test-only reset`
  goes red for a `.ts` module in `engine/src` that names the function.

Neither is relevant to `setCommittedMicros`. Measured, on the mirror, with a
production module added at `engine/src/roll.ts`:

```ts
import { processLedger } from "./spend-ledger.ts";
export function rollOver(period: string): void {
  processLedger().setCommittedMicros(period, 0);
  processLedger().setReservedMicros(period, 0);
}
```

| check | result |
| --- | --- |
| `engine/test/invariants` | **16 passed (16)** |
| full unit suite | **306 passed (306)** |
| `npm run leak-check` | **clean** |

And the fence that does exist is itself an enumeration of spellings.
`invariants.test.ts:683` is `readdirSync(root).filter((n) => n.endsWith(".ts"))`
over two literal directories. Measured:

| production module naming `resetProcessLedgerForTests` | invariant |
| --- | --- |
| `engine/src/roll.ts` (control) | **red — correct** |
| `engine/src/money/roll.ts` (one subdirectory down) | **16 passed — BLIND** |
| `engine/src/roll.mjs` | **16 passed — BLIND** |

`readdirSync` is not recursive. The test's own comment says "Enumerated from the
filesystem, so a module added tomorrow is covered." A module added tomorrow in a
subdirectory is not covered.

### Leg C — the same public surface is a cross-client read

`openEntries()` is on the `SpendLedger` contract and returns **every client's**
open reservations. Measured:

```
[G] openEntries visible to any holder: [{"clientId":"fixture-testco","micros":10000,"day":"d:2026-08-19|fixture-testco","month":"m:2026-08|fixture-testco"}]
```

`reservedUsd(clientId)` filters; the interface does not. Any holder of the
ledger enumerates every tenant's in-flight money. Law 3 wants that to fail by
construction.

### What would close it (not implemented here, and deliberately not)

The capability that must go away is "a caller outside the meter can write a
committed or reserved figure". The storage contract the DO implements should
expose no absolute setter at all — only cap-checked, handle-bound transitions
(`reserve`, `settle`, `release`), with `committedMicros`/`reservedMicros`
readable and nothing settable. Whatever is chosen, per the standing ruling the
lock must EXECUTE the bound: a module holding `processLedger()` must be
observably unable to increase a client's remaining headroom.

---

## R12-02 — SEVERITY 3 (data lies). The unreachable-guard sweep's PREDICATE was fixed and works. Its POPULATION was not touched: 16 entries against a money path carrying at least 30 fail-closed guards. Twelve measured blind, including every one of the six in `llm()` that R11-02 named.

### The half that was fixed, and it is a real fix

The predicate is now "did THIS guard refuse, with its own error class and its own
message", and it carries a three-way red-proof. I reverted eight of the sixteen
listed guards one at a time and ran only `engine/test/invariants`:

| guard reverted | sweep |
| --- | --- |
| meter requires a clock (**R11-02's masking case 1**) | **CAUGHT** |
| `zoneDayKey` non-finite instant (**masking case 2**) | **CAUGHT** |
| daily ceiling refusal | CAUGHT |
| `#assertForward` backwards clock | CAUGHT |
| anchor spread tolerance | CAUGHT |
| `FrozenCapsSpendMeter` finality | CAUGHT |
| `settle` `#assertAvailable` | CAUGHT |
| `requireReservingMeter` contract | CAUGHT |

Both of R11-02's live masking cases are now detected. That is worth stating
plainly: the instrument got sharper.

### The half that was not

R11-02's measurement was "19 of 35 money-path guards invisible". The response
sharpened the predicate on the sixteen entries that were already there and
**added none**. The nineteen blind guards were not fixed; they were left out of
the list. Measured, one revert at a time, sweep-only versus full suite:

| guard reverted | sweep (`engine/test/invariants`) | full suite |
| --- | --- | --- |
| `llm()` `departed = true` | **SURVIVED (16 passed)** | CAUGHT |
| `llm()` `!departed` release condition | **SURVIVED** | CAUGHT |
| `llm()` vault scope check | **SURVIVED** | CAUGHT |
| `llm()` absent `post()` check | **SURVIVED** | CAUGHT |
| `llm()` trace scope mismatch | **SURVIVED** | CAUGHT |
| `llm()` `isFrozenCapsMeter` refusal | **SURVIVED** | CAUGHT |
| monthly ceiling refusal | **SURVIVED** | CAUGHT |
| `trustedClock` monotonic-backwards refusal | **SURVIVED** | CAUGHT |
| `reserve`'s `#assertAvailable` | **SURVIVED** | CAUGHT |
| `reserve`'s positive-amount check | **SURVIVED** | CAUGHT |
| `#assertForward` high-water ADVANCE | **SURVIVED** | CAUGHT |
| `settleOrFailClosed` rethrow | **SURVIVED** | **SURVIVED** (see R12-03) |

Twelve, measured. Every one of the six `llm()` guards R11-02 listed is still
invisible to the sweep, including both halves of `departed` — the guard the
sweep's own comment says it was widened to cover.

### The control-flow half is textually unchanged from the version R11-02 called unsound

`invariants.test.ts:646-661` still asserts that two inputs produce different
observable outcomes:

```ts
expect(preDispatch.today).toBe(0);
expect(mayHaveDeparted.today).toBeGreaterThan(0);
```

R11-02: "It proves that the decision point discriminates between those two
inputs; it does not prove which line does the discriminating." That analysis was
accepted into `CLAUDE.md` as the reason the sweep is a standing rule, and the
formulation it criticised was carried forward verbatim. The measurement above is
its consequence: both halves of `departed` survive the sweep.

### The claims that are false as written

- `CLAUDE.md`: "`engine/test/invariants/` **drives every money-path guard** with
  an input written to MAKE IT FIRE and fails naming any that no longer can."
- Ledger L30 (corrected THIS round): "the unreachable-guard sweep no longer
  records `something threw` … so **these five are now verified to fire on their
  own messages**." Two of the five named — the high-water ADVANCE and the
  one-clock-read pairing in `#periods` — are not in the sweep at all, and the
  second is not a throwing guard, so it can never "fire on its own message".

A rule that overstates its own enforcement is the same defect as a guard that
overstates its coverage — this file's own words, one bullet above.

---

## R12-03 — SEVERITY 3 (data lies). R11-03 reproduces verbatim: three money-path guards still survive their own deletion against the ENTIRE 306-test suite, still with no mutation entry and still with no ledger disclosure.

Reverted one at a time on the mirror, full suite each time:

| guard reverted to a no-op | result |
| --- | --- |
| `anchorWallMs`'s `if (!Number.isFinite(r.ms))` → `if (false)` | **SURVIVED — 306 passed (306)** |
| `anchorWallMs`'s median → `readings[0]!.ms` | **SURVIVED — 306 passed (306)** |
| `settleOrFailClosed`'s `throw new MeterUnavailableError(...)` → `return;` | **SURVIVED — 306 passed (306)** |

None of the three appears in `mutate.mjs`'s 133 entries; I read the table. None
appears in the ledger's disclosure rows (L19, L23, L25, L28, L29, L30, L31).
`npm run mutate` prints `0 survived` because none of them is asked the question.

The third is the one that costs money in a way a client would see.
`settleOrFailClosed` is the whole reason the function exists — its own comment
calls a swallowed settle "a data lie about money". Made a silent `return`,
`llm()` returns success for a call whose charge was never recorded and emits an
`outcome: "ok"` trace carrying a `costUsd` no ledger holds. R11-03 explained why
M-01 and M-04 do not catch it — both assert facts that are true whether the
guard rethrows or swallows, and both `.catch(() => undefined)` so neither ever
asserts that `llm()` rejects. That analysis is confirmed by measurement and
nothing about it changed.

The median line is the load-bearing half of the claim `spend-meter.ts:544` makes
about the trusted clock — "one tampered source cannot drag it, it can only fail
the spread". Replace it with `readings[0]` and the whole suite is green, and the
attack narrows from "move two sources consistently" to "move `Date.now`", which
is R10-03's original target.

---

## R12-04 — SEVERITY 3 (data lies). Shape-assertion trap #7 — same line, same file, third consecutive round. The binding resolver reads only DIRECT `child_process` imports, so a one-line re-export helper restores a blocking runner with `blockingCalls` clean, invariants green, suite green, **and `npm run drill` PASSING** while source files are rewritten after the SIGINT.

R10-09 widened a name-matching regex. R11-04 walked past it with
`import { spawnSync as runSuiteBlocking }`. R11's fix resolves the *binding*
instead — which is still an enumeration, now of how the dependency is spelled
rather than of what it is called.

### Three evasions, measured at unit level against `blockingCalls`

| construction | `blockingBindings` | `blockingCalls` |
| --- | --- | --- |
| `import { spawnSync as runSuiteBlocking } from "./cp.mjs"` (a one-line re-export helper) | `{names:[],unresolvable:[]}` | `[]` |
| `runSuiteBlocking.call(null, …)` after a direct aliased import | `{names:["runSuiteBlocking"]}` | `[]` |
| `Reflect.apply(rb, null, …)` after a direct aliased import | resolved | `[]` |

The first needs no obfuscation at all:

```js
// engine/scripts/cp-util.mjs   — an ordinary helper module
export { spawnSync as runSync } from "node:child_process";
```

### End to end, on the mirror

I restored a blocking runner in `mutate.mjs` through that helper, in the form
that blocks the loop for three suite runs before yielding once — so a delivered
SIGINT waits behind up to three full suite runs:

| check | result |
| --- | --- |
| `engine/test/invariants` | **16 passed (16)** |
| full unit suite | **306 passed (306)** |
| **`npm run drill`** | **1 passed (1)** — 12.7s |
| entries mutated AFTER the SIGINT was delivered | **2** |

R9-03's recorded harm is "a Ctrl-C did not stop the harness … and three more
source files were rewritten after the signal". Two more source files were
rewritten after the signal here, with every gate green.

The drill is not blind in general — I also built the non-yielding form (R9-03 in
full) and the drill correctly FAILED at its 30s deadline. But the deadline is a
duration threshold, not a property: anything that services the signal inside 30
seconds passes, and the drill never asserts that **no further mutation followed
the signal**, which is R11-04's leg-1 analysis unchanged.

### Leg B — R11-04's second leg is untouched

Each restore path is still individually a survivor. Measured:

| mutation | invariants | drill |
| --- | --- | --- |
| `restoreInFlight()` removed from the SIGINT/SIGTERM handler | **16 passed** | **1 passed** |
| `process.on("exit", restoreInFlight)` removed | 1 failed | **1 passed** |
| `process.on("exit", () => {})` (keeps the string, drops the behaviour) **and** the handler's restore removed | **16 passed**, full suite **306 passed** | **FAILS — correct** |

So `restoreInFlight()` inside the signal handler is dead code that reads as the
mechanism satisfying the standing invariant, and can be deleted with every gate
green. And the only thing that noticed the second row is
`expect(runner).toMatch(/process\.on\(\s*["'`]?exit/)` — a regex over source,
in the same block that still does `expect(runner).toContain("SIGINT")`, which is
the exact check R9-03's write-up names as the one that was "grepping for the
strings SIGINT and SIGTERM". Row three shows what that regex is worth: keep the
string, drop the behaviour, and it passes.

---

## R12-05 — SEVERITY 3 (data lies). The ledger's disclosures are inaccurate or incomplete in four places, including both rows corrected THIS round for carrying false claims.

The ledger is the artifact the next round reads instead of the code. Each row
below was judged by execution, not by its own wording.

**L31(b) — accurate, and INCOMPLETE.** It names one method: "an in-process patch
of `MemorySpendMeter.prototype.reserve` still spends past the ceiling". The same
unfrozen prototype carries `settle`, and R10-02's exact payload works unchanged.
Measured:

```
[B4] settle→release: 5000 charges of $0.01 = $50.00 vs frozen $5/day; todayUsd=$0.00
[B5] reserve narrowed: real spend $30.00 metered as $0.003000 vs frozen $5/day
[B6] proto frozen=false extensible=true ctor=MemorySpendMeter
```

$50 through a frozen $5/day with the ledger reading $0.00, from
`MemorySpendMeter.prototype.settle = function (r) { this.release(r); }`. The
human declined a prototype freeze and I am not re-litigating that; what I am
reporting is that the disclosure enumerates one spelling of the residual it
discloses, which is the same disease one level up. It also carries no bounding
test, and the standing ruling is that an irreducible residual needs one.

**L31(a) — the bound is weaker than "per-process".** The row says "Two Workers,
or one Worker after an eviction, hold two ledgers and therefore two ceilings."
The real unit is the **module instance**, and a second one is obtainable inside
a single process. Measured:

```
[B3] after vi.resetModules: todayUsd=$0, second full ceiling minted=true
```

A meter that had exhausted the frozen $5/day refused; after `vi.resetModules()`
and a re-import, a new meter minted a full second ceiling — $10 against $5/day
in one process. Anything that yields two module instances of `spend-ledger.ts`
(a re-import, a bundler chunk duplication, a dual-resolution alias) yields two
ceilings, and that is a wider statement than the row makes.

**L30 — corrected this round, and the correction introduces a new false claim.**
See R12-02: "these five are now verified to fire on their own messages" is false
for two of the five. The row was corrected precisely because it had carried a
claim that was false as written. L16 has now done this twice; L30 has done it
once and immediately again.

**L29 — corrected this round, and the correction is wrong in two particulars.**
It states that `mutate.mjs` "carries live entries today — the crash-marker-before-
source-break ordering, the entry-point guard, the recovery call, **and the
blocking-call binding**", and that they are "caught … by `engine/test/invariants/`".
`mutate.mjs` carries exactly three entries (lines 166, 167, 169); the two
blocking-call-binding entries target `engine/test/blocking-calls.ts` and are
caught by `engine/test/blocking-calls.test.ts`, its own red-proof. A correction
row that names a file that does not hold the entry is the stale-pointer defect
the correction was written to fix.

**And a disease neither correction looked for. L14 and L17 both assert a
money-path defect that was fixed five rounds ago.** L14: "rollover is UTC, not
client-local". L17: "rollover is UTC rather than client-local". R7-02 replaced
the UTC key with `zoneDayKey(nowMs, caps.ianaTimeZone)`, the zone travels with
the ceilings, and both halves carry caught mutation entries. Measured:

```
[TZ] pulsern zone: America/New_York | UTC day: 2026-08-20 | ledger day: 2026-08-19
```

L14's other half — "a fresh meter starts a fresh day, so a Worker restart or DO
eviction grants a full ceiling again" — is now false within a process too, which
is the whole of R11-07's fix. Two rows describe the cap as broken in ways it is
not. That is the same failure mode as a row overstating a guarantee, pointed the
other way, and it is exactly what an audit of the other 29 rows was asked to
look for.

**Rows re-verified and UPHELD by execution this round** (each disclosed as
having no reachable input; each confirmed to survive the full suite, which is
what the disclosure predicts): L19 `assertCapsCoherent`'s call site, L23 `#read`'s
corrupt-ledger check and `Object.hasOwn` on the narrowing table, L25
`assertUsableZone`'s call site. L28 remains the best-written row in the file.
L31(c) is accurate: `(processLedger() as InMemorySpendLedger).clear()` works and
the row says so — measured, $10 against a frozen $5/day.

---

## R12-06 — SEVERITY 3 (data lies). The unit suite is ORDER-DEPENDENT: four of six shuffle seeds go red. The cause is `vi.resetModules()` inside the money-path lock file, which splits the one process ledger in two — the property R11-07's whole fix rests on, violated inside the project's own suite.

Determinism is a stated Phase B rule: "Flaky tests are findings against you."
Measured on the mirror, `--sequence.shuffle --sequence.seed=N`:

| seed | result |
| --- | --- |
| 1 | 306 passed |
| 3 | 306 passed |
| 7 | **1 failed** — `locks-r7 > the reserving-meter contract refuses a meter missing any money method` |
| 42 | **1 failed** — `locks-r7 > a client with no resolvable accounting zone cannot spend` |
| 1234 | **1 failed** — same |
| 5, 9 | **1 failed** — same |

The failures are module-identity artifacts: `expected error to be instance of
MeterUnavailableError` when the error IS a `MeterUnavailableError` — from a
second module instance.

The source is `locks-r7.test.ts:512-514`, BOUND 4:

```ts
const { resetModules } = await import("vitest").then((v) => ({ resetModules: v.vi.resetModules }));
resetModules();
const fresh = await import("../src/spend-meter.ts");
```

After that line the file's static imports (`MeterUnavailableError`,
`resetProcessLedgerForTests`) and any later dynamic import
(`await import("../src/gateway.ts")`, `await import("./helpers.ts")`) belong to
**different module graphs**, with different error classes and — this is the
money part — **different `PROCESS_LEDGER`s**. Measured on a file with the same
shape (`beforeEach(resetProcessLedgerForTests)`, then a `vi.resetModules()`
test, then spend through the re-imported module):

```
[C2] spent through the RE-IMPORTED module: $5 against a frozen $5/day;
     the original module's ledger reads $0
```

Spend made through one instance is invisible in the other, and the
`beforeEach` reset every other test in that file depends on can no longer reach
the ledger the meters under test are writing to. In declaration order nothing
money-related is imported after line 514, so today it is latent; shuffling the
order is enough to expose it, and adding one money test after BOUND 4 would make
it a wrong answer rather than a red test.

Separately: running the suite in one module registry
(`--pool=threads --poolOptions.threads.singleThread --no-isolate`) turns
`departed-contract.test.ts` red — its `vi.mock` of `engine/src/spend-meter.ts`
leaks to every other file. The suite's correctness currently depends on vitest's
per-file isolation defaults, which no test asserts and which a config change
would remove silently. That is R11-05's unbounded-mocking observation with a
measurement attached.

---

## R12-07 — SEVERITY 4 (isolation break). R11-06 moved `setAvailable` off the meter and onto a PROCESS-WIDE object, so one client's storage flag now halts every client's spend — still untraced, still callable by any module holding the import.

Measured:

```ts
const m = new FrozenCapsSpendMeter();
processLedger().setAvailable(false);
m.reserve("pulsern", 0.01);   // an unrelated client
m.todayUsd("pulsern");
```

```
[B2] unrelated client "pulsern" blocked=true read=MeterUnavailableError
```

The direction is fail-closed, so this is not money loss — a bricked ledger
refuses spend, it does not leak it. But R11-06's complaint was "a production
meter carries a public, untyped, unaudited method that permanently halts a
client's spend, callable by any collaborator holding the reference, with no
trace event of its own". The method moved; every clause of that sentence still
holds, and the blast radius grew from one meter to the whole process, crossing
tenant boundaries. `spend-ledger.ts:47-50` says availability "is traced by
whoever operates it" — nothing in the repo traces it, and there is no operator
path to trace.

Combined with R12-01's leg C (`openEntries()` returns every tenant's open
reservations), the `SpendLedger` contract is now a cross-tenant surface in both
directions: read and halt.

---

## R12-08 — SEVERITY 3 (data lies). The harness's per-entry evidence column is corrupted again, for exactly the three entries that lock this round's headline fix. R10-10 recurring, introduced by this commit's own test name.

From the run I executed:

```
CAUGHT             R11-07 production meter shares the process ledger  |  refuses when no test runner is present 1ms
CAUGHT             R11-07 the process ledger is one object            |  refuses when no test runner is present 1ms
CAUGHT             R11-07 reset fenced to a test runner               |  refuses when no test runner is present 5ms
```

130 of 133 entries print `N failed | M passed (306)`. These three print a test
title. The cause is `mutate.mjs:379`:

```js
const m = /Tests\s+(.*)$/m.exec(out) ?? /Tests\s+(.*)$/m.exec(err);
```

`Tests\s+` matches inside the test name `resetProcessLedgerForTes**ts **refuses
when no test runner is present`, which vitest prints above the summary.
Reproduced directly:

```
captured: "refuses when no test runner is present 1ms"
```

The CAUGHT/SURVIVED verdict is unaffected — it comes from the child's exit code
— so this is not a wrong number. It is the loss of the diagnostic R10-10 was
raised about and that r11 recorded as "restored and readable": the per-entry
counts are what made R9-01 visible in the first place, and they are missing for
the three entries covering the newest money-path fix. Any future test whose name
contains `Tests ` hijacks the column for every entry that makes it fail.

---

## R12-09 — SEVERITY 3 (data lies). R11-05 is unaddressed, and its identifier has been reassigned to a different fix — so the record now reads as though it were closed.

`CLAUDE.md` (changed in this commit), `invariants.test.ts:524` and
`mutate.mjs:320-327` all attribute the sweep-predicate fix to **R11-05**. The
sweep-predicate finding was **R11-02**. R11-05 was a different finding: the
`departed` mutation entry reports CAUGHT from a path where the production guard
is `vi.mock`ed away, with no L28-style disclosure, and nothing in the repo bounds
mocking a money-path module.

Verified unchanged this round:

- `vi.mock("../src/spend-meter.ts", …)` is still the only mock in the repo, still
  in `departed-contract.test.ts:31`;
- `mutate.mjs:85` "R7-04 departed set before dispatch" still reports CAUGHT and
  still carries into the 133/133 line;
- there is no L32; the ledger ends at L31;
- no invariant enumerates mocks of `engine/src/**` or `config/src/**`, and
  `leak-check` does not look.

L28 exists precisely so a harness line is "not read as protection it does not
give". The identical defect class still has two different treatments in the same
repo, and now the weaker one is filed under a number that reads as fixed.

`CLAUDE.md`'s new sentence also states the sweep "carries its own red-proof for
each of the three ways a guard can be dead" — that part is true and I verified
it — immediately after the sentence R12-02 measures as false.

---

# THE SEVEN R11 FINDINGS — RE-ATTACKED INDIVIDUALLY

| r11 finding | claimed fix | verdict |
| --- | --- | --- |
| R11-01 prototype patch defeats the meter freeze | ledger moved out of the meter; prototype freeze explicitly declined | **NOT CLOSED, disclosed as L31(b).** Measured again: `settle`→release puts $50 through a frozen $5/day with `todayUsd()` $0.00; `reserve` narrowed meters $30 as $0.003. The disclosure names only `reserve` — R12-05 |
| R11-02 sweep tests `e instanceof Error` | predicate now matches error class + refusal message, with a three-way red-proof | **HALF FIXED.** Predicate verified on 8 listed guards including both masking cases. Population unchanged: 12 money-path guards measured blind, including all six `llm()` guards R11-02 named — R12-02 |
| R11-03 three guards survive their own deletion | — | **NOT FIXED, NOT DISCLOSED.** All three reproduce against 306/306 — R12-03 |
| R11-04 blocking-runner alias, trap #6 | `blocking-calls.ts` resolves the import binding | **NOT CLOSED — trap #7.** A one-line re-export walks past it with the drill green and two files rewritten after the SIGINT; `.call`/`Reflect.apply` too; leg B untouched — R12-04 |
| R11-05 `departed`'s mutation entry is caught from a mocked path | — | **NOT FIXED; the ID was reused for R11-02's fix** — R12-09 |
| R11-06 `setAvailable` on the production meter | moved to `SpendLedger` | **FIXED as to the meter, WIDENED as to blast radius.** Now process-wide and cross-client, still untraced — R12-07 |
| R11-07 a fresh meter mints a fresh ceiling | one module-scoped `PROCESS_LEDGER`; the meter is a handle | **FIXED for the named attack, and it holds.** My own re-run: 3,000 dispatches with a brand-new `FrozenCapsSpendMeter` each time → `served=500 refused=2500 realSpend=$5.00` against a frozen $5/day, ledger $5.00. But a fresh ceiling is still obtainable by `setCommittedMicros` (R12-01), by a cast + `clear()` (L31c), and by a module re-import (R12-05) |

**The judgment the brief asked for: is the ledger move the architectural fix, or
the fifth spelling?** It is a genuine architectural fix for the thing it names —
constructing a meter no longer constructs a ceiling, and that is measured, not
argued. It is also the fifth spelling in one specific respect: the state a cap is
enforced against moved from a private field into a public, exported, unfenced
interface, and the fences built around it enumerate one function name
(`resetProcessLedgerForTests`) rather than removing the capability (arbitrary
writes to committed and reserved figures). Two rounds ago the caller chose the
meter's methods; one round ago the caller chose the meter; now the caller
chooses the balance.

---

# STANDING INVARIANTS (CLAUDE.md) — run every round

| invariant | result |
| --- | --- |
| No code path can write outside publish/pause/promote | **PASS (partial by design).** Mass-read half armed; write-verb half correctly deferred to Phase 6. **Note:** `SpendLedger` is now an unrestricted write path to money state — R12-01 |
| A cross-tenant read attempt must fail by construction | **FAIL — R12-01 leg C and R12-07.** The `llm()` halves hold and were driven (foreign vault → `vault scope mismatch`, foreign trace → `scoped to a different client`), but `processLedger().openEntries()` returns every tenant's open reservations and `setAvailable(false)` halts every tenant |
| `decisions` ledger append-only with inputs snapshot | **DEFERRED** to Phase 2, declared |
| Big red button halts all spend in <60s | **DEFERRED** to Phase 6. R12-07: `processLedger().setAvailable(false)` is now an ambient, untraced, process-wide approximation of it |
| Bracket protection window cannot be bypassed | **DEFERRED** to Phase 5, declared |
| External content is data, never instructions | **PASS (partial).** Hostile payload driven through `llm()`; caps, bindings and `activeChannels()` byte-identical before and after; refusal traced. Full crawler drill deferred to Phase 1 |
| `VERDICT.md` hash-locked after launch | **N/A** — no `VERDICT.md` at Phase 0; report/approval append-only checks live and exercised in the gate-CLI suite |
| OAuth tokens only in the vault | **PASS.** `leak-check` clean over the workspace; the canary secret appears in no trace event I produced |
| Human-queue item past SLA leaves the engine waiting | **DEFERRED** to Phase 6, declared |
| Locked market/channel flags structurally inert | **PASS.** `activeChannels()` = `["meta"]`; `tiktok` and staged `google` both refuse |
| Guard + checker never ship in one commit without a red-proof | **PASS in form, WEAK in substance.** New checkers this round (`blocking-calls.ts`, the sweep's predicate, the reset-naming invariant) each ship with a red-proof, and each red-proof was verified to go red. But `blocking-calls.ts`'s red-proof only exercises the spellings it already knows — R12-04 |
| Every harness result void without a passing meta-check | **PASS.** Enforced in `mutate-lib.mjs`, driven by `locks-r7`, three entries, all caught. I read the control flow: every failure path exits 1 before the entry loop. Verified in the run I executed |
| The unreachable-guard sweep is a completed step, not best-effort | **FAIL — R12-02.** Completed, sharper, and covering 16 of ≥30 money-path guards; 12 measured blind |
| A guard is locked by EXECUTING it, never by asserting its shape | **FAIL — R12-04** (trap #7), and the runner block still does `expect(runner).toContain("SIGINT")` and a source regex for the exit handler, both of which pass with the behaviour removed |
| Any tool that can write to the source tree is import-safe and fails closed | **PASS as to import-safety and recovery.** The entry-point guard is fail-closed (I ran `node -e "import(...)"`: nothing starts). Recovery is driven on a real fixture with all four refusal cases. The completed run left no marker and no orphans. **Note:** a FAILING drill SIGKILLs the harness and leaves the tree mutated plus a marker; nothing but the next `npm run mutate` consults that marker |

## Phase A step 7 — governance checks

- **`VERDICT.md` intact after launch** — not applicable at Phase 0. L22/L27
  correctly record that report and approval integrity hold in CI only.
- **Leaked tokens** — none. `leak-check` clean; no canary in any trace I emitted.
- **Hostile instructions in fixtures** — I swept `.ts`/`.md`/`.mjs`/`.yml` under
  `fullburn/` and `.github/` for text directed at a reviewing agent. One hit, the
  deliberate seeded fixture in `invariants.test.ts`. It did not steer this
  review; I drove it through `llm()` and confirmed caps, bindings and channels
  unchanged. **No injection attempt was found against me this round.**
- **Stall a queue item past SLA** — Phase 6 deliverable, declared.
- **Activate a locked market/channel flag** — attempted, structurally refused.
- **Onboard a second client while one is unstable** — no onboarding path exists;
  `getCaps` refuses any client absent from the frozen table.
- **Class 2 routed as Class 1** — no such attempt found. `npm run owed-approvals`
  prints 16 owed entries for this commit, including the new
  `engine/src/spend-ledger.ts`; per L27 they are deliberately uncommitted. The
  eleven gate-CLI integration tests pass.

## Observability (Phase A step 4)

Three decision paths driven and checked for a trace: a cap refusal, a schema
failure, and a successful dispatch.

```
[G] traces: [ 'error' ] [ 'error' ] [ 'ok' ]
[G] request url: https://gateway.ai.cloudflare.com/v1/test-account/fullburn/anthropic/claude-sonnet
```

All three emit; the dispatch goes through the AI Gateway base URL; the vault
canary appears in none of the emitted events. No untraced decision found on the
`llm()` path. **One untraced decision found off it:**
`SpendLedger.setAvailable` — a process-wide, cross-client spend halt with no
trace event and no operator path (R12-07).

---

# SPEC FINDINGS (for the human, not silently patched)

1. **`SpendLedger` is being designed as a storage interface when the money
   property it must carry is an authorisation boundary.** L31(b) already plans to
   move the reserve arithmetic inside it for Phase 2. That is necessary and not
   sufficient: as long as the same interface also exposes `setCommittedMicros`,
   `setReservedMicros` and `setAvailable` to any importer, the boundary enforces
   a cap against callers who go through `reserve` and hands the balance to
   everyone else (R12-01). The interface should carry no absolute setters at all
   before the DO adopts it — the file itself says the DO "implements exactly
   this", so the shape decided now is the shape shipped.

2. **The sweep and the mutation table answer complementary questions and neither
   answers "is every guard covered".** The table asks "is every LISTED fix
   protected"; the sweep asks "does every LISTED guard still fire". Both lists
   are hand-written, and every finding in R12-02 and R12-03 lives in the gap
   between them. The instrument that would close it is mechanical: enumerate
   `throw new (CapError|MeterUnavailableError|SpendLedgerError)` from the money
   modules' source and fail when a thrown site has neither a sweep entry naming
   its message nor a mutation entry nor a ledger disclosure. That is a
   completeness check over the guards, not another check of a guard, and it is
   the only thing measured this round that would have caught R12-02 and R12-03
   before an adversary did.

3. **The disclosure discipline needs a review step of its own.** Four rows are
   inaccurate today (L14, L17, L29, L30) and two of those four were rewritten
   this round specifically because they had been inaccurate. A ledger row is
   read by the next round instead of the code; when it is wrong it is worse than
   absent. Rows should carry the command that re-verifies them, the way the
   "Verification when unblocked" column already does for the blocked half.

4. **The mocking question R11-05 raised is still open and is now unlabelled.**
   `vi.mock` of a money-path module makes a guard uncatchable by the mutation
   harness. One such mock exists, it is confined, and its confinement is a
   coincidence of vitest's default isolation rather than a property anything
   asserts (R12-06). Either enumerate mocks of `engine/src/**` and `config/src/**`
   and justify each in the ledger, or assert the isolation the suite depends on.

---

# TESTS ADDED

**None, deliberately.** This is Phase A. Every finding above was reproduced by
executing the real code — the real `llm()`, the real `FrozenCapsSpendMeter`, the
real `processLedger()`, the real harness and the real drill — in an isolated
mirror of `18e1681` whose source was verified byte-identical to `git show
18e1681:` and whose baseline was verified green at 306/306 before and after every
experiment. No file in the repository was modified; the only addition is this
report. Phase B tests follow once the human has ruled on R12-01, per the rule
that I do not fix the builder's code beyond what a test requires.

Each reproduction above names the assertion that must go red against the
pre-fix code, and every number in it is one I measured.

---

# VERDICT

## FAIL

**Findings by severity: 1 at severity 1, 7 at severity 3, 1 at severity 4.**

| # | severity | one line |
| --- | --- | --- |
| R12-01 | 1 — money loss | The ledger left the meter as a public unfenced money-write primitive: `processLedger().setCommittedMicros(period, 0)` puts $30 through a frozen $5/day with one correctly-constructed meter, zero `CapError`s and `todayUsd()` at $0.00 — no patch, no cast, no test marker, and both R11-07 fences irrelevant |
| R12-07 | 4 — isolation | `setAvailable` moved from the meter to a process-wide ledger, so one flag halts every client's spend — measured against an unrelated tenant — still untraced; `openEntries()` hands any holder every tenant's open reservations |
| R12-02 | 3 — data lies | The sweep's predicate was fixed and works; its population was not — 16 entries against ≥30 money-path guards, 12 measured blind including all six `llm()` guards R11-02 named, while `CLAUDE.md` and L30 both say it drives every one |
| R12-03 | 3 — data lies | R11-03 verbatim: the anchor's non-finite refusal, the median selection and `settleOrFailClosed`'s rethrow each survive their own deletion against all 306 tests, with no mutation entry and no disclosure |
| R12-04 | 3 — data lies | Shape-assertion trap #7 on the same line, third round running: a one-line re-export restores a blocking runner with `blockingCalls` clean, invariants and suite green, **the drill passing**, and two source files rewritten after the SIGINT; `.call`/`Reflect.apply` too; leg B untouched |
| R12-05 | 3 — data lies | Four ledger rows are inaccurate — L31(b) names one of two patchable methods ($50 through $5/day via `settle`), L31(a) says "per-process" where the unit is the module instance, and the L29 and L30 corrections written THIS round each introduce a fresh false claim; L14 and L17 still describe a UTC rollover that R7-02 fixed |
| R12-06 | 3 — data lies | The suite is order-dependent (4 of 6 shuffle seeds red) because `vi.resetModules()` runs inside the money-path lock file, splitting the one process ledger in two — $5 spent through one instance reads $0.00 in the other |
| R12-08 | 3 — data lies | The harness's evidence column is corrupted for exactly the three entries locking this round's headline fix: `/Tests\s+(.*)$/m` matches inside `resetProcessLedgerForTests refuses…`, so R10-10's diagnostic is lost again |
| R12-09 | 3 — data lies | R11-05 is unaddressed and its identifier was reassigned to R11-02's fix in `CLAUDE.md`, the invariant suite and the mutation table, so the record reads as though it were closed |

**FAIL blocks the phase gate.** The blocking finding is R12-01: it was executed
against the real money path, it is not covered by the Phase 2 architectural plan
the ledger already records, and it is the same root cause the human has now named
five times — a fix that enumerates the spelling of the danger
(`resetProcessLedgerForTests`) instead of removing the capability (writing the
balance a cap is enforced against).

Two things should be said in the builder's favour, because an adversary that
reports only its findings is not measuring either. R11-07's fix **holds against
its own attack** — 3,000 dispatches with a fresh production meter each time
spent exactly $5.00 against a frozen $5.00/day. And the sweep's new predicate
**works**: both of the masking cases R11-02 demonstrated are now caught. Those
are real closes, and this round's severity-1 is in the surface the close
created, not in the close.

R12-02 and R12-03 are not blockers on their own, but they are the instruments
that were supposed to find R12-01 before I did. The sweep does not cover the
ledger's guards; the mutation table has two entries for `spend-ledger.ts` and
neither asks whether the interface can be used to reset a balance. Fixing
R12-01 without closing the completeness gap leaves the next round with the same
two hand-written lists and a new spelling.
