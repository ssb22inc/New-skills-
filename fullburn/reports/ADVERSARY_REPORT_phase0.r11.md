# ADVERSARY REPORT phase0.r11
Verdict: FAIL
verified-tree: 95f8c07644d01a809f2353aeb271eafb630615c8

Round 11, same-family review of Fullburn Phase 0 at commit `d0e20e4` on branch
`claude/fullburn-engine-spec-r7v5lg`. Supersedes nothing — reports are
append-only; r10's FAIL and its ten findings are the immediate history this
round judges.

## Gate state — every number re-verified, none taken on trust

| gate | claimed | measured | verdict |
| --- | --- | --- | --- |
| `npx vitest run` | 296 passed | 296 passed / 20 files, exit 0 | matches |
| `npm run typecheck` | clean | clean, exit 0 | matches |
| `npm run leak-check` | clean | `leak/structural scan: clean`, exit 0 | matches |
| `npm run drill` | 1 passed, own runner | (see §Gate verification) | |
| `npm run mutate` | meta-check passed, 125 caught / 0 survived / 0 not found | (see §Gate verification) | |
| `npm run e2e` | — | (see §Gate verification) | |

Tree hash recomputed independently:

```
git ls-files -s -- 'fullburn/' '.github/' ':!fullburn/reports/' ':!fullburn/APPROVALS/' | git hash-object --stdin
95f8c07644d01a809f2353aeb271eafb630615c8
```

Matches the assigned scope hash.

---

# FINDINGS

Ranked by the severity order in `.claude/agents/engine-adversary.md`:
money loss > ban risk > data lies > isolation breaks > dummy-proof.

---

## R11-01 — SEVERITY 1 (money loss). The freeze is on the instance; the methods are on the prototype. R10-02 reproduces verbatim, one level up, on a frozen and branded production meter.

**$50 of real spend against a frozen $20/month and $5/day ceiling. 5,000
dispatches. Zero `CapError`s. `todayUsd()` and `monthUsd()` read $0.00
throughout. `Object.isFrozen(meter)` is `true` and `isFrozenCapsMeter(meter)` is
`true` at every point in the attack.**

### What the fix was supposed to be

Human ruling 2026-08-18, on R10-02:

> "Add `#assertAvailable()` to settle and freeze the meter instance. I'm
> explicitly signing off on the shape: **production meters are immutable**…"

R10-02's payload was `Object.defineProperty(meter, "settle", { value(r) {
this.release(r); } })` — a `settle` that releases mints headroom on every call,
so the ceiling never binds and the ledger never moves.

`FrozenCapsSpendMeter`'s constructor now ends with `Object.freeze(this)`
(spend-meter.ts:630), and the comment states the intent plainly:

> "Human ruling 2026-08-18: production meters are immutable. Freezing closes
> every method at once rather than enumerating which ones matter — and the
> enumeration is exactly what was wrong."

### Why it does not hold

`Object.freeze(this)` freezes **the instance**. `settle`, `release`, `reserve`,
`todayUsd`, `monthUsd`, `reservedUsd` and `setAvailable` are not own properties
of the instance — they are own properties of `MemorySpendMeter.prototype`, which
is an ordinary, extensible, unfrozen object. Class methods are defined
`{ writable: true, enumerable: false, configurable: true }`. Nothing in the
constructor, in `isFrozenCapsMeter`, or anywhere in the module freezes
`MemorySpendMeter.prototype` or `FrozenCapsSpendMeter.prototype`.

So the instance freeze refuses exactly one spelling of the attack — the one
r10 used — and leaves the identical attack open one link up the prototype
chain. "Freezing closes every method at once" is false: it closes zero methods,
because no method is on the frozen object.

The reach is *wider* than R10-02's, not narrower. R10-02 needed a reference to
a specific meter instance. This needs only `import { MemorySpendMeter }` — the
class is a public export of `engine/src/spend-meter.ts` (line 202) — or, from
any meter reference at all, `Object.getPrototypeOf(Object.getPrototypeOf(meter))`,
which `Object.freeze` does not restrict. One patch poisons **every**
`FrozenCapsSpendMeter` in the process, including ones constructed afterwards.

### Reproduction (executed, not argued)

```ts
import { llm } from "engine/src/gateway.ts";
import { MemorySpendMeter, isFrozenCapsMeter } from "engine/src/spend-meter.ts";
import { makeDeps, TEST_CLIENT } from "engine/test/helpers.ts";   // real FrozenCapsSpendMeter, frozen $5/day $20/mo

const { deps, meter } = makeDeps();
Object.isFrozen(meter);          // true  — R10-02's fix is in place
isFrozenCapsMeter(meter);        // true  — the brand holds

// R10-02's own payload is refused on the instance:
Object.defineProperty(meter, "settle", { value() {} });   // THROWS. Good.

// The same payload, one level up. Nothing refuses it:
Object.getOwnPropertyDescriptor(MemorySpendMeter.prototype, "settle");
//  => { writable: true, configurable: true, ... }
(MemorySpendMeter.prototype as any).settle = function (r) { this.release(r); };

isFrozenCapsMeter(meter);        // STILL true
Object.isFrozen(meter);          // STILL true

for (let i = 0; i < 5000; i++)
  await llm({ ...deps, bindings: ROLE_BINDINGS },
    { role: "hello-world", clientId: TEST_CLIENT, input: {}, trace: new TraceContext("t", TEST_CLIENT) });
```

Measured output:

```
[R11-PROTO] dispatched=5000 ok=5000 capErrors=0 todayUsd=$0.00 monthUsd=$0.00
            reservedUsd=$0.00 realSpend=$50.00 frozenDailyCap=$5.00 frozenMonthlyCap=$20.00
```

Every dispatch reached the transport. `hello-world` costs $0.01/call, so $50.00
of provider spend landed against a $20.00/month ceiling the caps table froze and
a human signed. The daily ceiling was exceeded tenfold. Not one `CapError` was
raised, and both the day and month readings a client or operator would look at
stayed at exactly $0.00 for the whole run — a cap breach and a data lie in one
operation, which is the same sentence R5-01, R6-04 and R10-02 are each written
in.

Scaled to client zero's real numbers, this is unbounded: the $200/month and
$10/day ceilings on `pulsern` are enforced by the same two lines.

### Why this is not "the same finding, resubmitted"

It is the same *defect class*, and that is the point the human made two rounds
running. R10-02 was closed by making one object immutable. The object that
holds the money methods was not that object. Five rounds of this file's history
say that a fix which narrows the spelling of an attack rather than removing the
capability comes back — R7-06 → R8-01 (ceilings moved, seam moved with them),
R9-05 → R10-03 (clock bound, then bound to a mutable global), and now
R10-02 → R11-01 (instance frozen, prototype not).

The comment at spend-meter.ts:611-629 asserts the property it does not have,
which is independently a finding: it tells the next reader that enumeration was
the defect and freezing solved it, so the next reader will not look here.

### What would actually close it

Not my call to implement, and I am explicitly not fixing it. But the shape of
a structural close, for the human's ruling: the capability that must go away is
"a method used on the money path can be replaced after construction". Freezing
`MemorySpendMeter.prototype` and `FrozenCapsSpendMeter.prototype` at module
load is the minimum, and it is still an enumeration — of prototypes rather than
of methods. The stronger form is for `FrozenCapsSpendMeter` to install its own
non-configurable, non-writable own methods that close over the private state,
so there is no shared mutable object in the lookup path at all; then
`Object.freeze(this)` covers what it claims to cover.

Whatever is chosen, the test that locks it must EXECUTE the patched path — the
mutation table and this report both contain `Object.freeze` as a string
literal, so any check that greps for the freeze, asserts `Object.isFrozen`, or
reads a property descriptor passes with the guard reverted. That is the trap
that has now defeated six checks in this repo.

### Leg B — the same hole reopens the CEILING seam (R7-06 → R8-01's lineage)

`reserve` is on the same unfrozen prototype, so the fix human-ruled as "remove
the injection point entirely" is also undone by one assignment. Executed:

```ts
const proto = Object.getPrototypeOf(Object.getPrototypeOf(meter)); // no import needed
Object.isFrozen(proto);      // false
Object.isExtensible(proto);  // true
proto.reserve = function (clientId, amountUsd) { return real.call(this, clientId, 1e-6); };
```

```
[R11-RESERVE] dispatched=3000 realSpend=$30.00 ledgerSays=$0.003000 frozenDaily=$5.00
```

$30 of provider spend metered as three tenths of a cent. And the prototype is
reachable in two `getPrototypeOf` hops from any meter reference — importing
`MemorySpendMeter` is convenient, not required:

```
[R11-PROTO-NOIMPORT] ok=3000 spend=$30.00 vs frozen $5/day $20/mo; todayUsd=$0.00
```

Both legs are one root cause and one fix. Counted as one finding.

---

## R11-02 — SEVERITY 3 (data lies). The unreachable-guard sweep cannot tell "this guard fired" from "something threw", so it is blind to exactly the pattern it was created for. Measured: 19 of 35 money-path guards invisible.

The sweep is now a standing rule and a completed step, after the human's ruling:

> "the 'fix moved a check upstream of an older guard' pattern has now produced
> three dead guards. Make that sweep a permanent, completed step in every round…
> and add a test that fails if any guard in the invariant suite becomes
> unreachable."

### The defect, in one line

`invariants.test.ts:572`:

```ts
fired = e instanceof MeterUnavailableError || e instanceof CapError || e instanceof TypeError || e instanceof Error;
```

`e instanceof Error` subsumes the three disjuncts before it — they are dead
code inside the dead-code detector. What the predicate actually measures is
**"did the input throw anything at all"**, not "did this guard refuse".

That is precisely the wrong question for the pattern the sweep exists to catch.
When a fix moves a stricter check UPSTREAM of an older guard, the older guard's
firing input now throws at the upstream check — still an `Error` — so the sweep
reports the dead guard REACHABLE. The sweep is structurally incapable of
detecting upstream masking, which is the mechanism behind all three of the
guards it was written after (L28, R9-08a, R10-07a).

### Executed, not argued

I reverted each money-path guard in an isolated mirror of `d0e20e4` (own
`node_modules`, source restored from `git show d0e20e4:` between every case,
baseline 296/296 green and verified byte-identical to HEAD) and ran the sweep
against each.

`BLIND` = the guard was reverted and the sweep still passed.

| guard reverted | sweep | full suite |
| --- | --- | --- |
| assertUsableAmount domain check | detected | red |
| toMicros safe-integer range | detected | red |
| SpendReservation brand | detected | red |
| **meter requires a clock** | **BLIND** | red |
| meter requires a caps resolver | detected | red |
| **zoneDayKey non-finite instant** | **BLIND** | red |
| #assertForward backwards clock | detected | red |
| #assertForward high-water advance | detected | red |
| daily ceiling refusal | detected | red |
| **monthly ceiling refusal** | **BLIND** | red |
| **#read corrupt-ledger check** | **BLIND** | **GREEN** |
| settle #assertAvailable | detected | red |
| release #assertAvailable | detected | red |
| FrozenCapsSpendMeter finality | detected | red |
| **Object.freeze(this) on the meter** | **BLIND** | red |
| anchor spread tolerance | detected | red |
| **anchor non-finite reading** | **BLIND** | **GREEN** |
| **anchor uses the MEDIAN** | **BLIND** | **GREEN** |
| **trustedClock monotonic-backwards** | **BLIND** | red |
| isFrozenCapsMeter brand membership | detected | red |
| assertCapsUsable sign-off | detected | red |
| **fixture signature is not a real client** | **BLIND** | red |
| assertUsableZone Intl probe | detected | red |
| **effectiveAiCapsUsd narrowing Math.min** | **BLIND** | red |
| **day tightened by a narrowed month** | **BLIND** | red |
| **getCaps own-property guard** | **BLIND** | red |
| requireReservingMeter contract | detected | red |
| **llm() isFrozenCapsMeter refusal** | **BLIND** | red |
| **llm() `departed = true`** | **BLIND** | red |
| **llm() `!departed` release condition** | **BLIND** | red |
| llm() PreDispatchError release branch | detected | red |
| **llm() vault scope check** | **BLIND** | red |
| **llm() absent post() check** | **BLIND** | red |
| **llm() trace scope mismatch** | **BLIND** | red |
| **settleOrFailClosed rethrow** | **BLIND** | **GREEN** |

**19 of 35 blind. The sweep catches 46% of what it claims to sweep.**

### Two of the blind cases are the masking pattern itself, live today

**`meter requires a clock`.** The sweep's input is `new MemorySpendMeter()`.
Delete the clock check and the very next line — the caps-resolver check — throws
for the same input. An `Error` arrives, so the sweep records the clock guard as
reachable. The guard is dead and the sweep says it is alive. This is L28's
mechanism, reproduced against the sweep on the current tree.

**`zoneDayKey non-finite instant`.** The sweep's input drives a `NaN` clock.
Delete the `Number.isFinite(nowMs)` refusal and `Intl.DateTimeFormat.format(NaN)`
throws a native `RangeError` one line later. Same masking, different mechanism —
here the masker is a platform builtin, so no future refactor is even needed.

### The control-flow half has the same blind spot in its new place

The sweep's gateway half asserts that two inputs produce different observable
outcomes:

```ts
expect(preDispatch.today).toBe(0);
expect(mayHaveDeparted.today).toBeGreaterThan(0);
```

The formulation is unsound for the purpose. It proves that the decision point
**discriminates between those two inputs**; it does not prove **which line does
the discriminating**. Here the discrimination is performed by
`if (err instanceof PreDispatchError) { … throw err; }` versus
`settleOrFailClosed(…)`. The `departed` flag contributes nothing observable to
either branch, so:

```
llm() departed = true            → sweep BLIND
llm() !departed release condition → sweep BLIND
```

Both halves of the exact guard the sweep's own comment says it was widened to
cover are invisible to it. The comment claims the assertion runs "per decision
point, from the ledger"; `llm()` has at least eight decision points (trace
instance, scope mismatch, vault scope, brand, absent `post`, PreDispatchError,
settle failure, sink failure) and one pair is tested. Seven of them are in the
BLIND column above.

"Different observable outcomes" is a two-input restatement of "something
changed". It is the same heuristic the scalar half uses, with the same failure
mode: an outcome difference produced by a mechanism other than the guard under
test reads as coverage.

### What would answer the question the sweep is asking

The sweep needs to assert the IDENTITY of the refusal, not its existence — the
specific error message or a per-guard sentinel — so that a different guard
firing on the same input is a FAILURE rather than a pass. For control flow, the
question is not "do two inputs differ" but "does reverting this line change any
observable", which is what the mutation harness already answers correctly, and
which is how `departed` was found in the first place. The sweep currently
duplicates the harness's job with a weaker instrument and reports a stronger
result.

---

## R11-03 — SEVERITY 3 (data lies). Three money-path guards survive their own deletion against the ENTIRE 296-test suite, and none is disclosed. `npm run mutate` reports 0 survivors because none of them has a table entry.

The mutation harness's contract, in its own words: "a fix whose one-line revert
leaves the suite green is not protected by anything." The table has 125 entries
and all 125 are caught — verified independently below. But the table is a
hand-written list, so a guard with no entry is never asked the question.

From the matrix above, three reverts leave the whole suite green (the fourth,
`#read`'s corrupt-ledger check, is legitimately disclosed as L23):

**(a) `anchorWallMs`'s `!Number.isFinite(r.ms)` refusal** — new in `d73df4c`,
r10's R10-03 clock fix.

```ts
for (const r of readings) {
  if (!Number.isFinite(r.ms)) {           // ← revert this to `if (false)`
    throw new MeterUnavailableError(`time source ${r.name} is not a finite instant …`);
```

Reverted: sweep green, `npx vitest run` → **296 passed**. No mutation entry, no
ledger disclosure. The guard reads as protection on the money path's time
source and is held up by nothing.

**(b) The MEDIAN selection in `anchorWallMs`** — also new in `d73df4c`.

```ts
return readings.map((r) => r.ms).sort((a, b) => a - b)[1]!;   // → readings[0]!.ms
```

Reverted to a single source: **296 passed**. The file's comment states the
property this line exists for — "The median: one tampered source cannot drag it,
it can only fail the spread" — and `locks-r7`'s BOUND 3 tests the SPREAD check,
not the median. So the claim that cross-validation resists one tampered source
rests on two mechanisms, one of which has no test at all. Replacing the median
with `readings[0]` narrows the attack from "move two sources consistently" to
"move `Date.now`", which is R10-03's original target.

**(c) `settleOrFailClosed`'s rethrow** — `gateway.ts:387`, the whole reason the
function exists.

```ts
} catch (err) {
  throw new MeterUnavailableError(`spend was incurred but could not be recorded …`);
}
```

Made a silent `return`: **296 passed**. `llm()` then returns success for a call
whose charge was never recorded, and emits an `outcome: "ok"` trace carrying a
`costUsd` that no ledger holds — the file's own comment calls this "a data lie
about money".

**Why M-01 and M-04 do not catch it, and this is the load-bearing part.** Both
tests assert only the headroom:

```ts
expect(meter.reservedUsd(TEST_CLIENT), "…").toBeGreaterThan(before);
expect(meter.todayUsd(TEST_CLIENT), "a failed settle committed anyway").toBe(0);
```

Both are true whether the guard rethrows or swallows, because the settle threw
INSIDE the meter before `#close` ran — the reservation stays open either way.
And both call `llm(...).catch(() => undefined)`, so neither ever asserts that
`llm()` rejects, which is the only thing the guard changes. **Two tests named
after the finding assert a fact that survives the guard's revert.** That is the
shape-assertion trap in behavioural clothing: real behaviour is driven, but the
behaviour asserted is not the behaviour the guard produces.

---

## R11-04 — SEVERITY 3 (data lies). The sixth shape-assertion trap: R9-03's blocking-runner fix is defeated by an ordinary import alias, and the drill that exists to prove it behaviourally cannot tell a blocking runner from an async one.

CLAUDE.md's standing rule: "A guard is locked by EXECUTING it, never by
asserting its shape… This has now defeated four separate checks (R8-09, R9-02,
R9-03, R9-04)." R10-09 was the fifth. Here is the sixth.

R9-03: the harness ran the suite with `execSync`, blocking the event loop, so
its SIGINT/SIGTERM handlers could never be serviced. r10 fixed R10-09 by
WIDENING the source regex from `execSync` to also match `spawnSync` and
`execFileSync` — a fix by enumerating spellings, which is R11-01's pattern in a
different file.

Three checks claim to lock it:

1. `invariants.test.ts:369` — `expect(runner).not.toMatch(/\b(?:execSync|execFileSync|spawnSync)\s*\(/)`
2. `invariants.test.ts:374` — `expect(loop).toMatch(/await measure\(/)`
3. `engine/test/drill/harness-interrupt.drill.ts` — the behavioural drill, its
   own CI stage since R10-05.

I restored R9-03 in full with an ordinary destructured import alias — no
obfuscation, and nothing a careless developer would not write by accident:

```js
import { spawn, spawnSync as runSuiteBlocking } from "node:child_process";
…
const rr = runSuiteBlocking(process.execPath, [VITEST_BIN, "run", "--silent"], { cwd: ROOT, encoding: "utf8" });
```

Measured against that tree:

```
does the invariants blocking-call check catch it?   Tests  15 passed (15)
does the drill catch it?                             ✓ SIGINT stops it … (19950ms)
```

**All three locks green with the event loop blocked for the entire duration of
every suite run.** Check 1 does not match `runSuiteBlocking(`. Check 2 still
matches, because `measure` is still awaited — it just awaits a promise resolved
after a synchronous call. And the drill passes: it took 20 seconds instead of
0.5, and its exit deadline is 30 seconds, so a blocked loop is inside tolerance.

The drill cannot detect this by construction. It asks "did the tree come back",
and it does — the queued handler runs when the blocking call returns. R9-03's
actual harm was that the signal did not STOP the run and further entries were
rewritten after it; the drill checks only the single file named in the marker,
and never that no further mutation followed the signal.

So the property "signals can be serviced promptly" is locked by a source regex
alone, evadable by an alias, in the file whose comment says the strings were
present and the behaviour absent.

### Same finding's second leg — the drill proves only that SOME restore path exists

Measured on the mirror, one mutation at a time:

| reverted | drill |
| --- | --- |
| `restoreInFlight()` removed from the SIGINT/SIGTERM handler | **passes** |
| `process.on("exit", restoreInFlight)` removed | **passes** |
| both removed | fails (correctly) |

Each restore path individually is a survivor: the signal handler calls
`process.exit(130)`, which fires the `exit` handler, which restores. So
`restoreInFlight()` inside the signal handler is dead code — it reads as the
mechanism that satisfies the standing invariant, and it can be deleted with
every gate green. L29 records that the runner has no mutation entries by
construction, so nothing else asks the question either.

---

## R11-05 — SEVERITY 3 (data lies). The `departed` test is confined and does bite, but it sets the precedent L28 exists to forbid — and nothing in the repo bounds the technique.

### The mock is confined, and the test does prove its claim

Verified, not assumed:

- `vi.mock("../src/spend-meter.ts", …)` appears in exactly one file
  (`departed-contract.test.ts:31`) — it is the only mock of any kind in the
  repo (`vi.mock`, `vi.doMock`, `vi.spyOn`, `mockImplementation` all return one
  hit). `vitest.config.ts` sets no `isolate: false` and no shared pool, so the
  module registry is per-file; `locks-r7`'s real `isFrozenCapsMeter`
  discriminations pass in the same run.
- Reverting `departed = true` in the mirror turns exactly one real test red —
  `departed-contract.test.ts` — and reverting `!departed` from the release
  condition does the same. The guard is genuinely live against the modelled
  violation; the test is not vacuous, and it is not passing for an unrelated
  reason.

### What is wrong is the precedent, and the missing disclosure

`departed` is dead on the production money path. `llm()` accepts only a branded
meter; every branded meter conforms; for every conforming meter, deleting
`departed = true` changes nothing observable. That is the same sentence L28
writes about `requireReservingMeter`, and L28 draws the conclusion the project
insists on:

> "its mutation entry is caught by that unit test, NOT by the money path, and
> this entry exists so the harness line is not read as protection it does not
> give"

`departed` got the opposite treatment. Its mutation entry (`mutate.mjs:85`,
"R7-04 departed set before dispatch") now reports **CAUGHT**, and the run's
125/125 line carries it — but the path that goes red is one where the
production guard that makes the violation unreachable has been **mocked away**.
There is no L31. A reader of the harness output cannot distinguish this entry
from one caught on the real money path, which is the exact confusion L28 was
written to prevent. The identical defect class got two different treatments in
consecutive rounds, and the weaker one is the newer.

### The technique is unbounded, and that is the part worth acting on

`vi.mock` of a source module replaces any export for that file's whole module
graph. Nothing in the repo constrains it: no invariant enumerates mocks, no
lock test asserts that money-path modules are unmocked, and `leak-check.mjs`
does not look. The consequence for the acceptance bar is specific:

**a guard is uncatchable by the mutation harness if the only test that drives it
mocks it away.** The harness measures "does the unit suite go red"; a mocked
guard cannot make it go red. Today `isFrozenCapsMeter` is safe because
`locks-r7` also drives the real one — but that is a coincidence of test
authorship, not a property. The repo now contains a worked example of the
technique, in a file whose comment presents it as the correct pattern for a
guard the type system "cannot yet refuse".

The invariant suite already enumerates writing tools from the filesystem
precisely so a new one is covered the day it lands (R10-08). Mocks of
`engine/src/**` and `config/src/**` want the same treatment: enumerated, and
each one either justified in the ledger or refused.

---

## R11-06 — SEVERITY 5 (dummy-proof). `setAvailable` is public on the frozen production meter, and the transport is already handed a reference to it.

`Object.freeze(this)` does not remove `setAvailable` — it is on the prototype
(R11-01), and it would be callable even if the instance freeze covered
everything, because it is a method rather than a property write.

`helpers.ts:56`'s `transportThatBreaksStorage(meter, …)` establishes the pattern
of handing the meter to the transport, and the human's R10-02 ruling
deliberately made `setAvailable` the fault-injection seam "from the transport".
Executed:

```ts
const { deps, meter } = makeDeps();
meter.setAvailable(false);
await llm(...)   // rejects
Object.isFrozen(meter)   // true
```

The direction is fail-closed, so this is not money loss: a bricked meter refuses
spend, it does not leak it. But a production meter now carries a public,
untyped, unaudited method that permanently halts a client's spend, callable by
any collaborator holding the reference, with no trace event of its own and no
way to distinguish it from a genuine storage outage in the audit record. The
"big red button" invariant wants that capability to exist; it wants it to be one
audited path, not an ambient method on the money object.

Recorded at severity 5 rather than higher because every consequence is a
refusal. Flagged because R10-02's ruling introduced it as a test seam and it
shipped as production surface.

---

## R11-07 — SEVERITY 1 (money loss). `deps.meter` is still caller-chosen, so a caller mints a fresh $200/month by constructing a meter. No patching, no forgery, no restart. This is the last unclosed instance of the pattern the last four rulings each closed one case of.

Executed through the real `llm()`, with the real `FrozenCapsSpendMeter`, no
mocks, no prototype writes, no forged handles:

```ts
for (let i = 0; i < 3000; i++) {
  const { deps } = makeDeps({ transport });   // a NEW FrozenCapsSpendMeter each iteration
  await llm({ ...deps, bindings: ROLE_BINDINGS }, { role: "hello-world", clientId: TEST_CLIENT, … });
}
```

```
[R11-FRESHMETER] dispatched=3000 realSpend=$30.00 vs frozen $5/day $20/month — no patching, no forgery
```

Every dispatch passed `isFrozenCapsMeter`. Every ceiling came from the frozen
table. Every meter was final, frozen, and correctly constructed. The cap never
engaged, because the ledger a cap is enforced against lives in the meter, and
the meter is an argument.

### Why this is not simply L14

L14 discloses this, and I am not claiming it is undisclosed. I am claiming the
disclosure describes a weaker property than the code has:

> "a fresh meter starts a fresh day, so a **Worker restart or DO eviction**
> grants a full ceiling again"

That frames it as an availability event outside anyone's control, unblocked by
H2. What the code actually permits is a caller-controlled money property:
constructing a meter is an ordinary expression, and `llm()` accepts whatever it
is handed. No restart, no eviction, no privilege — a `new` per call.

### Why it belongs at severity 1 this round rather than as a standing disclosure

Read the last four rulings as one sequence. Each closed one thing a caller could
choose that decides how many ceilings exist:

| round | the caller chose | the ruling |
| --- | --- | --- |
| R7-06 | the ceilings, as `reserve()` arguments | move them into the meter |
| R8-01 | the caps resolver, via `deps.meter` | "remove the injection point entirely" |
| R9-05 | the clock | "bind it by construction, do not bound the jump" |
| R10-03 | the clock's SOURCE | "a different source entirely" |
| R10-02 | the meter's methods | "production meters are immutable" |

Every one of those fixes narrowed what a caller may supply to the meter. None
of them addressed that **the caller supplies the meter**, which subsumes all of
them: the ledger is per-instance, and a fresh instance is a fresh ceiling. The
human's own words on R10-03 are the standard this fails: "If an irreducible
residual remains after that, it needs a test proving its bounds — a disclosure
alone is not acceptable. Four rounds running, a disclosed limitation became the
next round's severity-1; I'm not accepting a fifth."

This is that fifth. It is a disclosed limitation, disclosed in weaker terms than
it holds, and there is no test bounding it — nothing in the suite asserts that
two meters for one client cannot both spend a full ceiling, and nothing asserts
that `llm()` refuses a meter it did not resolve itself.

Not my call to design the fix, and I am explicitly not implementing one. The
shape that matches the four rulings above is for the meter to stop being an
argument: `llm()` resolves the client's meter from a module-owned registry (the
in-process stand-in for the Durable Object the ledger already names), and
`deps.meter` disappears the way `deps.capsTable` and the `reserve()` ceilings
arguments did. Whatever is chosen, per the human's standing requirement the
residual needs a test that EXECUTES the bound — a second meter for one client
must be observably unable to spend past the first one's remaining headroom.

---

# LEDGER JUDGMENTS (assignment 2)

Each disclosure claims a guard is unreachable for a stated reason. Judged
against execution, not against the reason as written.

**L19 — `assertCapsCoherent`'s call site in `getCaps`. UPHELD.** Every client in
the frozen table is coherent, so the call site cannot be made to fire without
shipping a bad cap table as scaffolding. The check itself is driven directly and
is caught. The disclosure is honest and the reasoning is sound.

**L23 — `#read`'s corrupt-ledger check and `Object.hasOwn` on the narrowing
table. UPHELD, and confirmed by measurement.** `#read`'s revert is one of the
four that leaves the whole suite green, exactly as L23 predicts and explains.
The `Object.hasOwn` half is correct: `narrow()` is `Math.min`, so a polluted
entry can only tighten.

**L25 — `assertUsableZone`'s call site. UPHELD.** Every client declares a
resolvable zone, so the call site is unreachable. The claim that "the CHECK is
driven directly" is verified: reverting the `Intl` probe turns `locks-r7:61`
red.

**L28 — `requireReservingMeter` is not a live guard on the `llm()` path.
UPHELD, and it is the best-written entry in this ledger.** Confirmed by
measurement: reverting the contract check is caught, and it is caught by a unit
test rather than by the money path, exactly as the entry states. This entry is
the standard R11-05 says `departed` should have been held to.

**L29 — the harness runner, interrupt path and drill have no mutation entries.
UPHELD AS TO FACT, BUT ITS CONCLUSION IS NOW FALSE.** The factual claim is
right: the unit suite does not execute the runner, so entries written for it
would survive regardless. The conclusion the entry draws is that the property is
"covered instead by `npm run drill` as its own CI stage, and by the invariant
that reads the runner config". R11-04 measures both covers and finds them
green while R9-03 is restored in full. So the entry currently reads as "not
mutation-covered, but behaviourally covered", and the behavioural cover does not
hold. The entry needs correcting, not clearing.

**L30 — five clock-family guards are dead on the production path. ITS STATED
REASON IS STALE, AND ITS ENUMERATION IS NOW SHORT.**

The entry opens: "R9-05 bound `FrozenCapsSpendMeter` to `Date.now`, so the
guards that exist because a caller could supply a clock … can no longer be
reached through `llm()`." That has not been true since `d73df4c`: the meter is
bound to `trustedClock()`, not `Date.now`. The five guards remain dead on the
production path — the conclusion survives — but the reason given is a fact the
same round's other commit changed, in the artifact whose whole job is to be the
accurate record of what is and is not protected. L16 has twice been found to
claim a guarantee stronger than the code delivered; this is the same failure
mode in the same file.

More substantively, r10's clock fix ADDED guards to this family and none was
added to the entry:

- `anchorWallMs`'s `!Number.isFinite(r.ms)` — dead AND unprotected (R11-03a).
- the median selection — dead-adjacent AND unprotected (R11-03b).
- `NATIVE`'s module-load capture of `Date.now`/`Date` — I made it late-bound and
  the full suite stayed green, because the monotonic design makes it redundant.
  The file states its purpose as removing "the trivial 'patch it later' win";
  given `trustedClock()` never re-reads the wall clock after construction, that
  win does not exist to remove. It is defence in depth with no reachable input,
  which is precisely what this ledger's L19/L23/L25/L30 class is for.
- `trustedClock`'s `mono < lastMono` refusal — reachable only by patching
  `process.hrtime.bigint` before a fresh module import, which is what
  `locks-r7`'s BOUND 4 does. Live by test, dead by input on the production path.
  Worth naming for the same reason the other five are named.

**A clock finding I checked and did NOT sustain.** `locks-r7`'s BOUND 1 names
its own mutation — "make trustedClock read Date.now on each call" — and I
applied exactly that. The suite goes red. The anchor-plus-monotonic design's
central property is genuinely locked by execution, and R10-03's fix holds
against its stated attack. My earlier substitution of `anchorWallMs()` for the
monotonic advance left the suite green, but that mutation preserves
tamper-resistance (it re-reads through the same `NATIVE` captures), so green is
the correct answer and not a gap. Recorded because an adversary that reports
only its confirmations is not measuring anything.

---

# ASSIGNMENT 4 — THE META-CHECK AND THE HARNESS

**Can a run report a number without a passing meta-check? No — verified by
reading the control flow and by execution.** `mutate.mjs` runs the canaries
first, and every failure path (`!found`, `!meta.ok`) calls `process.exit(1)`
before the entry loop is entered. The canaries and `metaCheckVerdict` live in
`mutate-lib.mjs` and carry three mutation entries of their own (R10-01 ×3), all
caught. R10-01's fix holds.

**Can the canaries be satisfied by something other than what they claim?** The
negative canary appends `// meta-check canary` to a `const` and must SURVIVE —
it is a genuine no-op, and it is the half that catches R9-01's class. The
positive canary reverts the `SpendReservation` brand check and must be CAUGHT;
I confirmed independently that reverting that guard turns the suite red through
an executed path (`new SpendReservation(Symbol(…), …)` stops throwing), not a
shape assertion. Both canaries answer the question they pose.

**One limit worth stating, not a finding.** The meta-check proves the harness
can report both answers for two entries in one file. It does not and cannot
prove the table is COMPLETE, and completeness is where this round's gap is:
R11-03's three unprotected guards are invisible to a 125/125 run because no
entry names them. The harness answers "is every listed fix protected"; nothing
answers "is every guard listed". The sweep was supposed to be that second
instrument, and R11-02 measures how far short it falls.

**The detached spawn and process-group kill.** Verified behaviourally: after a
completed run and after the drill, `pgrep -c node` returns 0 and no
`.mutate-inflight.json` remains. R10-05b's orphan leak does not reproduce.
Stdout and stderr are separately buffered and the per-entry evidence column
carries real counts (`1 failed | 295 passed (296)`), so R10-10's diagnostic is
restored and readable.

---

# GATE VERIFICATION — measured, not accepted

| gate | result |
| --- | --- |
| `npx vitest run` | **296 passed / 20 files**, exit 0 — matches the claim |
| `npm run typecheck` | clean, exit 0 |
| `npm run leak-check` | `leak/structural scan: clean`, exit 0 |
| `npm run drill` | **1 passed**, exit 0, own runner; confirmed NOT matched by `vitest.config.ts`'s include |
| `npm run mutate` | meta-check: both canaries `ok`; **125 mutations: 125 caught, 0 survived, 0 not found**, exit 0 |
| `npm run e2e` | 1 passed (`the e2e stage really drives a browser`, 408ms) with `PLAYWRIGHT_CHROMIUM_PATH` set |
| post-run tree state | `git status --porcelain` clean apart from this report; **no `.mutate-inflight.json`**; `pgrep -c node` = 0 |

Every number the builder claimed is true. That is worth stating plainly: the
gates are honest this round, and the findings above are things the gates do not
ask about, not things they got wrong.

Tree hash recomputed and matched: `95f8c07644d01a809f2353aeb271eafb630615c8`.

---

# THE TEN R10 FINDINGS — RE-ATTACKED INDIVIDUALLY

| r10 finding | claimed fix | verdict |
| --- | --- | --- |
| R10-01 meta-check guarded by nothing | canaries + verdict moved to `mutate-lib.mjs`, driven by `locks-r7`, three mutation entries | **FIXED** |
| R10-02 `settle` rewired to release | `Object.freeze(this)` in the constructor | **NOT FIXED — R11-01.** Freezes the instance; the methods are on an unfrozen shared prototype |
| R10-03 the clock is a mutable global | anchor-plus-monotonic, cross-validated | **FIXED.** BOUND 1's named mutation turns the suite red; the central property is locked by execution. Two new sub-guards ship unprotected and undisclosed (R11-03a/b) |
| R10-04 `paths-ignore` inverts R9-06's lock | parsed as the inverse, `negated` flag driven | **FIXED** |
| R10-05 `npm test` writes to the source tree | drill moved to `engine/test/drill/`, own runner and CI stage | **FIXED.** Verified excluded from the default include, and the enumeration sees it by name |
| R10-06 the drill is disabled by a file | pre-existing marker is an `expect(...).toBe(false)`, not a skip | **FIXED** |
| R10-07 dead guards (role-cost, `interrupted`) | both deleted | **FIXED** as to those two. The sweep created to stop recurrence does not work — R11-02 |
| R10-08 writing-tool enumeration one third fixed | walks the whole workspace, both write and spawn | **FIXED** |
| R10-09 blocking-call check, trap #5 | regex widened to `spawnSync`/`execFileSync` | **NOT FIXED — R11-04.** Widening the spelling list; an ordinary import alias evades it and the drill cannot tell |
| R10-10 the R9-01 diagnostic destroyed | stdout and stderr separated | **FIXED.** Per-entry evidence reads `1 failed \| 295 passed (296)` |

Eight of ten hold. The two that do not are both fixes that **enumerated the
attack rather than removing the capability** — the freeze that covered one
object of several, and the regex that listed three spellings of many. Both
recur in the same shape they were fixed in.

---

# STANDING INVARIANTS (CLAUDE.md §"Standing invariants") — run every round

| invariant | result |
| --- | --- |
| No code path can write outside publish/pause/promote | **PASS (partial by design).** Mass-read half armed and driven; write-verb half correctly deferred to Phase 6 |
| A cross-tenant read attempt must fail by construction | **PASS.** `vaultForClient` scope test drives it; `llm()` refuses a mismatched vault and a cross-client trace context |
| `decisions` ledger append-only with inputs snapshot | **DEFERRED** to Phase 2, declared |
| Big red button halts all spend in <60s | **DEFERRED** to Phase 6. Note R11-06: `setAvailable` is an ambient, untraced approximation of it on the production meter today |
| Bracket protection window cannot be bypassed | **DEFERRED** to Phase 5, declared |
| External content is data, never instructions | **PASS (partial).** Hostile payload driven through `llm()`; caps, bindings and channels unchanged. Full crawler drill deferred to Phase 1 |
| `VERDICT.md` hash-locked after launch | **N/A** — no `VERDICT.md` exists at Phase 0; report/approval append-only checks are live and were exercised |
| OAuth tokens only in the vault | **PASS.** `leak-check` clean; vault never echoes a value, not even on a miss |
| Human-queue item past SLA leaves the engine waiting | **DEFERRED** to Phase 6, declared |
| Locked market/channel flags structurally inert | **PASS.** `activeChannels()` = `["meta"]`; `tiktok` and staged `google` both refuse |
| A guard and its checker never ship in the same commit without a test proving the checker can go red | **PASS this round.** No new guard+checker pair landed; the meta-check enforces the mechanised half |
| Every harness result void unless preceded by a passing meta-check | **PASS.** Enforced in code; verified by control flow and by the run |
| The unreachable-guard sweep is a completed step, not best-effort | **FAIL — R11-02.** It is completed, and it is 46% effective, and it is blind to its own motivating pattern |
| A guard is locked by EXECUTING it, never by asserting its shape | **FAIL — R11-04** (trap #6), and **R11-03c** (M-01/M-04 execute real behaviour but assert a fact that survives the guard's revert) |
| Any tool that can write to the source tree is import-safe and fails closed | **PASS as to import-safety and recovery** — driven on a fixture, and the completed run left no marker and no orphans. **Partial as to signal handling** — see R11-04 |

## Phase A step 7 — governance checks

- **`VERDICT.md` hash intact after launch** — not applicable at Phase 0; no such
  file. Ledger L22/L27 correctly record that report and approval integrity hold
  in CI only, and that branch protection (H19) is what makes the diff
  unavoidable. Unchanged this round.
- **Leaked tokens in code, logs, traces** — none. `leak-check` clean over the
  whole workspace; the vault's miss path was driven and does not echo the
  canary.
- **Hostile instructions in fixtures** — I swept the repo for text directed at a
  reviewing agent (`ignore previous`, `you must return PASS`, `relax the check`,
  `do not report`, and variants) across `.ts`, `.md`, `.mjs`, `.yml` in
  `fullburn/` and `.github/`. **One hit, and it is the deliberate seeded fixture**
  in `invariants.test.ts:723`. It did not steer this review, and the invariant
  that drives it through `llm()` confirms caps, bindings and channels are
  unchanged after it passes through. No injection attempt found against me.
- **Stall a queue item past SLA** — the human-queue console is a Phase 6
  deliverable; declared in `NOT_YET_APPLICABLE` with the correct phase.
- **Activate a locked market/channel flag** — attempted and structurally
  refused (`SwitchboardError` for `tiktok` and for staged `google`).
- **Onboard a second client while one is unstable** — no onboarding path exists
  at Phase 0; `getCaps` refuses any client absent from the frozen table, so a
  second client cannot spend at all without a Class-2 approved commit. Correct
  by construction for this phase.
- **Class 2 routed as Class 1** — no such attempt found. `config/caps.ts`,
  `.claude/`, `engine/src/**` and `.github/**` are all inside `CLASS2_PATTERNS`,
  the workflow's `paths:` filter is held to that set by a driven test, and the
  gate CLIs refuse a replayed, rewritten, or automation-authored approval —
  all eleven `gate-cli` integration tests pass.

## Observability (Phase A step 4)

Three decision paths checked for a trace: a cap refusal, a schema failure, and a
successful dispatch. All three emit through `deps.sink`, refusals included, and
`emitOrFail` makes a lost success-trace fatal. A lost FAILURE trace is recorded
on the error the caller receives rather than swallowed (`traceLost`). Every LLM
dispatch goes through `new URL(model.gatewayRoute, deps.gatewayBaseUrl)` and the
invariant asserts the request URL starts with the gateway base. No untraced
decision found.

---

# SPEC FINDINGS (for the human, not silently patched)

1. **The interface `SpendMeter` still shapes a hole.** `llm()` takes the meter as
   a dependency, and every fix since R7-06 has narrowed what may be handed to it
   without questioning that it is handed at all (R11-07). ENGINE_BUILD.md §2.2
   names the Durable Object as the meter's home; the Phase 0 in-memory stand-in
   inherits the interface but not the singleton-per-client property that makes a
   cap a cap. Whatever Phase 5/6 adopts "unchanged" will inherit the hole.
2. **"Production meters are immutable" is not expressible with `Object.freeze`
   alone** in a class-based design, because methods live on a shared prototype.
   If the ruling is to stand as written, the design needs own, non-configurable
   methods closing over private state — which is a shape decision, not a patch,
   and belongs to the human.
3. **The ledger's disclosure discipline is drifting in one specific way**: L30's
   stated reason was invalidated by a commit in the same round and not updated,
   and `departed` received a test where the identical class (L28) received a
   disclosure. A disclosure whose REASON is stale is worse than none, because it
   is the artifact the next round reads instead of the code.

---

# TESTS ADDED

**None, deliberately.** This is Phase A. Every finding above was reproduced by
executing the real code — through the real `llm()`, the real
`FrozenCapsSpendMeter`, the real harness and the real drill — in an isolated
mirror of `d0e20e4` with its own `node_modules`, with source restored from
`git show d0e20e4:` between every case and the baseline verified byte-identical
to HEAD and green at 296/296. **No file in the repository was modified**; the
only addition is this report. Phase B tests follow once the human has ruled on
R11-01 and R11-07, per the rule that I do not fix the builder's code beyond what
a test requires.

The reproductions are recorded above in enough detail to be re-run directly, and
each one names the assertion that must go red against the pre-fix code.

---

# VERDICT

## FAIL

**Findings by severity: 2 at severity 1, 4 at severity 3, 1 at severity 5.**

| # | severity | one line |
| --- | --- | --- |
| R11-01 | 1 — money loss | The meter freeze covers the instance, not the shared prototype: `settle` rewired to release puts $50 through a frozen $20/month with the ledger reading $0.00, and `reserve` rewired narrows the charge — R10-02 and R8-01 both reproduce on a frozen, branded meter |
| R11-07 | 1 — money loss | `deps.meter` is still caller-chosen, so constructing a meter per call mints a fresh ceiling: 3,000 dispatches, $30 against a frozen $5/day, no patching and no forgery — the last unclosed instance of the pattern R7-06, R8-01, R9-05 and R10-03 each closed one case of |
| R11-02 | 3 — data lies | The unreachable-guard sweep tests `e instanceof Error`, so it cannot tell "this guard fired" from "something threw": 19 of 35 money-path guards invisible, including both halves of `departed` and the two guards whose maskers are live today |
| R11-03 | 3 — data lies | Three money-path guards survive their own deletion against the entire 296-test suite with no mutation entry and no ledger disclosure — two from r10's clock fix, and `settleOrFailClosed`'s rethrow, whose M-01/M-04 tests assert a fact that survives the guard's revert |
| R11-04 | 3 — data lies | Shape-assertion trap #6: R9-03's blocking-runner fix is evaded by an ordinary `import { spawnSync as … }` alias, and the drill passes with the event loop blocked for every suite run — and each of the two restore paths is individually a survivor |
| R11-05 | 3 — data lies | The `departed` mock is confined and the test does bite, but its mutation entry reports CAUGHT from a path where the production guard is mocked away, with no L28-style disclosure — and nothing in the repo bounds mocking a money-path module |
| R11-06 | 5 — dummy-proof | `setAvailable` is a public, untraced method on the frozen production meter that permanently halts a client's spend, callable by any collaborator holding the reference |

**FAIL blocks the phase gate.** The blocking findings are R11-01 and R11-07;
both are money loss, both were executed against the real money path, and both
are the same defect the last five rulings have each closed one instance of — a
capability narrowed rather than removed.

R11-02 is not a blocker on its own, but it is the instrument the human made a
mandatory completed step so that a sixth dead guard would be caught before it
became a severity-1. It did not catch R11-01, it did not catch R11-03, and it
cannot catch the pattern it was named for. Fixing R11-01 without fixing R11-02
leaves the next round with the same blind sweep and a new spelling.

This verdict can be overridden only by the human, in writing, recorded here.
