# ADVERSARY REPORT phase0.r13
Verdict: FAIL
verified-tree: f722e7f1b44a982b061033fcb905d5f9bfd5bb54

Round 13, same-family review of Fullburn Phase 0 at commit `cb48c05` on branch
`claude/fullburn-engine-spec-r7v5lg`. Reports are append-only; this supersedes
nothing. r12's FAIL and its nine findings are the immediate history judged here.

Tree hash recomputed independently, with the scope `adversary-gate.mjs` binds to:

```
git ls-files -s -- 'fullburn/' '.github/' ':!fullburn/reports/' ':!fullburn/APPROVALS/' | git hash-object --stdin
f722e7f1b44a982b061033fcb905d5f9bfd5bb54
```

(`git rev-parse HEAD^{tree}` = `5db3487a6999bc4ba7f2ab2ccc82fe169e75e16c`, the
whole-repo tree; the scope hash above is the one the gate binds to.)

---

## Gate state — every number re-measured, none taken on trust

| gate | claimed | measured | verdict |
| --- | --- | --- | --- |
| `npm test` | 324/324 | **324 passed / 24 files**, exit 0 | matches |
| `npm run typecheck` | clean | clean, exit 0 | matches |
| `npm run drill` | green | **1 passed**, exit 0, own runner | matches |
| `npm run test:shuffle` | 324/324 on seeds 7 / 42 / 1234 | 324/324 on all three, and on eight further seeds (1, 2, 3, 5, 11, 99, 777, 2026) | matches |
| `npm run mutate` | meta-check passed, then 151 / 151 caught / 0 survived / 0 not found | **meta-check: both canaries `ok`** (negative SURVIVED, positive CAUGHT); **151 mutations: 151 caught, 0 survived, 0 not found**, exit 0. Every per-entry evidence column reads a real vitest count (`N failed | M passed (324)`) — R12-08 stays fixed | matches |
| `npm run leak-check` | — | `leak/structural scan: clean`, exit 0 | |
| `npm run e2e` | — | 1 passed (`the e2e stage really drives a browser`) with `PLAYWRIGHT_CHROMIUM_PATH` set; without it the sandbox's pinned build number does not match and the launch fails — a sandbox artifact, not a defect | |
| `npm run owed-approvals` | a sixth set is owed | **21 entries owed** against base `0f966aa`, including `engine/src/spend-ledger.ts` and `engine/test/money-path-guards.ts` (added) | matches |
| post-run tree state | — | `git status --porcelain` empty, no `.mutate-inflight.json` | |

Every number the builder claimed is true. **The findings below are not things
the gates got wrong. They are things the gates do not ask about — and, in five
of eleven cases, things a gate claims in prose to ask about and does not.**

### One thing this round measured that no previous round did, and it holds

The unreachable-guard sweep's PREDICATE and its coverage of the guards it
currently enumerates are **real**. Rather than read the sweep, I disabled each
of the forty-seven `throw new …` guards in the four money-path modules in turn
(rewriting `throw new X(` to `void new X(`, one at a time, restoring between)
and ran `engine/test/invariants` against each:

```
47 guards disabled one at a time → 47 caught, 0 survived
```

R12-02's fix works for the population it enumerates. R13-06 below is about the
population's boundary, not about the guards inside it. Credit where it is owed:
this is the first round in which the sweep's coverage claim survived being
executed against every member of its own list.

**How the attacks were run.** An isolated mirror of `cb48c05` at
`/tmp/.../scratchpad/r13/`, its own git repo with `.github/` present so the
control-plane tests resolve, baseline verified green at 324/324 before and after
every experiment, and `git status` verified clean after each. `npm run mutate`
was run once, to completion, on the real tree, with nothing else writing to it.
**No file in the repository was modified**; the only addition is this report.

---

# FINDINGS

Ranked by the severity order in `.claude/agents/engine-adversary.md`:
money loss > ban risk > data lies > isolation breaks > dummy-proof.

---

## R13-01 — SEVERITY 1 (money loss). The ledger owns the arithmetic and STILL has a balance-write primitive: `reserve({… micros: -N …}, h)` followed by `settle(h)`. Both are methods the `SpendLedger` contract declares. No setter, no patch, no cast, no forgery, no test marker.

**$30 of real spend against a frozen $5/day and $20/month. 3,000 dispatches
through the real `llm()`. Zero `CapError`s. ONE production meter, constructed
once. `todayUsd()` and `monthUsd()` read $0.00 throughout.**

R12-01 measured exactly these numbers through `setCommittedMicros(period, 0)`.
The setter is gone. The capability is not.

### The measurement

```ts
import { llm } from "engine/src/gateway.ts";
import { processLedger } from "engine/src/spend-ledger.ts";   // a public export

const { deps, meter } = makeDeps();          // ONE FrozenCapsSpendMeter
const led = processLedger();                 // the interface. no cast.

for (let i = 0; i < 3000; i++) {
  await llm({ ...deps, bindings: ROLE_BINDINGS },
    { role: "hello-world", clientId: "fixture-testco", input: {}, trace: new TraceContext(`a1-${i}`, "fixture-testco") });

  // THE ATTACK. Two methods the contract declares, in the order it declares them.
  const h = {};
  led.reserve({
    clientId: "fixture-testco",
    micros: -Math.min(led.committedMicros(c, day), led.committedMicros(c, month)),
    day, month,
    dailyCapMicros: 5_000_000, monthlyCapMicros: 20_000_000,   // the REAL caps
    dailyCapUsd: 5, monthlyCapUsd: 20,
  }, h);
  led.settle(h);                             // committed += (-N)
}
```

```
[A1] served=3000 capErrors=0 realSpend=$30.00 frozenDaily=$5 frozenMonthly=$20 todayUsd=$0.00 monthUsd=$0.00
```

### Why it works

`reserve()` never validates the sign of `req.micros`. The projection is
`committed + reservedIn + micros`, so a negative `micros` makes it SMALLER, the
two cap comparisons (`projected > cap`) pass trivially, `Number.isSafeInteger`
passes, and the handle is recorded. `settle()` then does the one write there is:

```ts
this.#committed.set(period, committed + open.micros);   // spend-ledger.ts:~213
```

with `open.micros` negative. The file's header says "there is no longer any way
to move a balance that is not a cap check". There is: it is a cap check that
cannot fail, because the caller chose the sign of the operand.

The caps are also the CALLER'S. `dailyCapMicros`/`monthlyCapMicros` arrive in the
`ReserveRequest`. The header of `SpendCeilings` in `spend-meter.ts` still carries
R7-06's reasoning — *"`reserve()` used to accept these as arguments, so any
direct caller could hand itself $1,000/$1,000 for a real client"* — and the
`ReserveRequest` interface reintroduces exactly that, one layer down, on the
interface the file tells Phase 2's Durable Object to implement unchanged.

### Leg B — why the R12-01 lock cannot see it, and why that is the same defect one level up

`engine/test/locks-r12.test.ts`'s contract fuzz is the artifact the round's
headline fix rests on, and ledger L31 describes it as fuzzing "every method the
interface declares … asserting none of them lowers a committed balance". It does
two things, and neither is that:

1. **It calls each method ALONE.** For every method name it tries thirteen fixed
   argument tuples and, after each single call, re-reads `todayUsd()`. Lowering a
   balance here takes TWO calls — `reserve` then `settle` — so the sequence that
   does it is outside the fuzz's alphabet by construction. `reserve` alone moves
   nothing; `settle({})` alone returns `null`.
2. **None of its tuples carries a negative `micros`.** The one `ReserveRequest`
   it builds is `{ …, micros: 0, dailyCapMicros: 0, monthlyCapMicros: 0, … }`.

So it enumerates method NAMES and ARGUMENT SHAPES. The capability lives in the
state machine, and the fuzz has no notion of one. This is the recurring root
cause applied to the LOCK rather than to the fix: it is a check against the
*spelling* `setCommittedMicros`, generalised over names, not a check that the
balance cannot fall.

### Leg C — the same two calls commit ANY amount for ANY client, and brick a live tenant

Because the ceilings are the caller's, the direction that raises a balance is
open too. Measured against client zero:

```
[B1] pulsern todayUsd=$199 monthUsd=$199 frozen=$10/day $200/mo
[B1] pulsern next reserve → CapError   (tenant bricked by an unrelated module)
```

An ordinary module that never intends harm — a reconciliation shim, a backfill —
can exhaust another tenant's month in one call. Law 3 wants that to fail by
construction.

### Leg D — `setHighWater(clientId, day)` is on the contract and validates nothing

```
[B2] after setHighWater("fixture-testco", "d:9999-12-31|fixture-testco"):
     MeterUnavailableError: clock moved backwards into a closed accounting day — refusing spend (fail closed)
[B3] setHighWater(…, "d:2030-01-01|…") then (…, "d:1970-01-01|…") → highWater = d:1970-01-01
     the ratchet is not a ratchet
```

One call permanently refuses a client's spend (fail-closed, but a denial of
service any module can inflict, with no audit entry — `availabilityAudit()`
records nothing about it). The reverse call un-does `#assertForward`'s ratchet.

### Leg E — the same input makes the `usable()` corruption guard fire, so the sweep's one DISCLOSED exemption is false

`invariants.test.ts` exempts the corrupt-ledger guard from the sweep with this
stated reason: *"committed totals only ever grow by settle … there is no input
that makes a stored total corrupt now that the setters are gone (R12-01)."*
Measured:

```
[F1] todayUsd after a negative settle → committed spend ledger is corrupt — refusing spend (fail closed)
[F1] next reserve                     → committed spend ledger is corrupt — refusing spend (fail closed)
```

The guard is reachable, the exemption is wrong, and the same input permanently
bricks the tenant. (Ledger L23 also still describes this guard as living in
`#read`, and describes `#close` deleting an entry before decrementing. Neither
`#read` nor `#close` exists any more — see R13-07.)

### Leg F — an ordinary production module carrying this compiles and passes everything

`engine/src/roll.ts`, twenty lines, importing only what the module exports and
calling only what the interface declares:

| check | result |
| --- | --- |
| `npm run typecheck` | **clean** |
| full unit suite | **329 passed (329)** |
| `engine/test/invariants` | **18 passed (18)** |
| `npm run leak-check` | **clean** |

### Why this is the sixth spelling, judged against the standing ruling

The human has named the root cause five times: *fixes that enumerate the
attack's spelling rather than removing the capability.* The sequence in this one
place is now: resolver seam (R7-06) → caller-supplied meter (R8-01) → clock
(R9-05) → instance patching (R10-02) → per-call construction (R11-07) → public
setter (R12-01) → **caller-signed arithmetic (this)**.

R12-01's own report wrote the acceptance criterion for its fix:

> "the lock must EXECUTE the bound: a module holding `processLedger()` must be
> observably unable to increase a client's remaining headroom."

It is observably able to. The arithmetic moved inside the ledger; the *operands*
did not. Moving the arithmetic is the right direction and is not the close: the
close is that the ledger derives everything it compares against from state it
owns — the client id and the amount are the only things a caller may name, the
period keys and the ceilings are the ledger's to resolve, and an amount that is
not a positive safe integer is refused before anything is projected.

**A Durable Object implementing this interface unchanged inherits all six legs.**

---

## R13-02 — SEVERITY 1 (money loss). Two more in-process money routes, both undisclosed and both simpler than the one L31(b) discloses: the `Symbol.for` slot has no occupant check, and the production ledger singleton is not frozen.

### Leg A — `globalThis[Symbol.for("fullburn.spend-ledger.process")]` is an unguarded money-write

`slot()` returns whatever it finds in the process-wide registry. It never asks
what that object is:

```ts
const existing = g[LEDGER_SLOT];
if (existing !== undefined) return existing;      // no brand, no instanceof, no check
```

Anything evaluated before `spend-ledger.ts` — a polyfill, an instrumentation
shim, a bundler-injected chunk, an import-order accident — owns every production
meter's ledger for the life of the process. Measured, through the real `llm()`
with a real `FrozenCapsSpendMeter`:

```
[C1] served=3000 capErrors=0 realSpend=$30.00 frozenDaily=$5 frozenMonthly=$20 todayUsd=$0.00
```

This capability **did not exist before this commit**. Until R12-06 the ledger
was a module-scoped `const`, unreachable from outside the module. The fix for
order-dependence made it a globally-addressable, globally-writable slot, and
nothing in the ledger, the tests, `CLAUDE.md` or L31 says so.

### Leg B — the singleton is not frozen, so an instance patch is enough

```
[E1] Object.isFrozen(processLedger()) = false
[E1] served=3000 capErrors=0 realSpend=$30.00 frozenDaily=$5 todayUsd=$0.00
```

`Object.defineProperty(processLedger(), "reserve", { value() {} })` — the exact
technique R10-02 closed on the meter, where the human ruled "production meters
are immutable" and `FrozenCapsSpendMeter`'s constructor calls `Object.freeze(this)`.
When the enforcement moved to the ledger, the ruling did not move with it.

### Why this matters more than it looks

L31(b) discloses ONE in-process residual — patching `MemorySpendMeter.prototype`
— and calls the prototype's unfrozen state a deliberate human ruling. That is
fine as far as it goes. But there are at least three routes and the disclosure
names the hardest one. A reader of L31 concludes the residual requires patching a
class prototype. It requires one global property assignment. This is a
disclosure that is incomplete in the direction that makes the system look safer,
which is the failure mode three consecutive rounds have already found here.

---

## R13-03 — SEVERITY 3 (data lies). L31(b) says `locks-r12` carries a test that MEASURES how far the prototype patch gets. There is no such test anywhere in the tree. Measured here: the bound is "unbounded".

Ledger L31(b), verbatim:

> "**(b) An in-process patch of `MemorySpendMeter.prototype` still spends
> unmetered, and this is MEASURED rather than described.** … `engine/test/
> locks-r12.test.ts` carries the BOUNDING test the standing ruling requires: it
> executes the patch and records exactly how far it gets, so the day the bound
> changes the test says so."

`engine/test/locks-r12.test.ts` is 246 lines and contains nine tests, in four
describes: the contract fuzz, the extra-capability check, the frozen-day spend
loop, three availability tests, the module-reset test, and two trusted-clock
tests. None of them patches a prototype. Searched exhaustively across the whole
tree:

```
grep -ran "MemorySpendMeter\.prototype|\.prototype\.reserve|\.prototype\.settle" engine/ config/
  → engine/src/gateway.ts:96 (a comment)     ← the only hit
grep -rn "R11-01" engine/ config/
  → engine/src/spend-ledger.ts:40 (a comment) ← the only hit
```

So I measured the bound the row says is measured:

```
[D1] served=3000 capErrors=0 realSpend=$30.00 frozenDaily=$5 todayUsd=$0.00
```

3,000 of 3,000. The bound is: there is none, within the process.

This is human ruling 6 exactly — *"No disclosure standing in for a fix … an
irreducible residual needs a test proving its bounds, not a note"* — with the
note claiming to be the test. It is worse than the disclosure r11 gave, because
r11's disclosure was honest about being a description.

---

## R13-04 — SEVERITY 3 (data lies). Shape-assertion trap #8, same file, fourth consecutive round. The blocking-call resolver reports a local module it was not given as CLEAN, not as unresolvable — so a helper one directory away restores R9-03's fully synchronous suite runner with the invariant green.

`blocking-calls.ts`'s own header states the contract:

> "What it cannot resolve statically it REFUSES: a namespace import, a default
> import, `require`, a dynamic `import()`, **or a re-export from a module it was
> not given**."

`blockingExports` does push `unresolvable` in that case. `blockingImports` — the
entry point, the function `blockingBindings` actually calls — does not:

```ts
const child = graph.get(spec);
// A local module we were not given is not "clean", it is unknown.
if (child === undefined || seen.has(spec)) continue;      // ← silently clean
```

and the invariant builds the graph from one directory, one extension:

```ts
const scripts = readdirSync(dir).filter((f) => f.endsWith(".mjs"));   // engine/scripts/*.mjs
const graph = new Map(scripts.map((n) => [`./${n}`, …]));
```

### Executed

`engine/scripts/helpers/blocking.mjs`, one line:

```js
export { spawnSync as runSync } from "node:child_process";
```

`mutate.mjs` imports it and runs the whole suite synchronously inside `run()` —
R9-03's defect restored exactly, the event loop blocked for every entry so no
signal handler can be serviced:

| check | result |
| --- | --- |
| `blockingBindings(mutate.mjs, graph)` | `{"names":[],"unresolvable":[]}` |
| `blockingCalls(...)` | `[]` |
| `engine/test/invariants` | **18 passed (18)** |
| full unit suite | **324 passed (324)** |

R12-04's fix taught the resolver to follow `export … from "./x.mjs"`. The
directory is the new spelling. R10-09 was the API name, R11-04 the import alias,
R12-04 the re-export, this is the path. Each fix enumerated one more.

The honest defence — the module says plainly that the behavioural lock is the
drill, not this check — is undercut by R13-05.

---

## R13-05 — SEVERITY 3 (data lies). The drill's "no source file is mutated after the signal" measures "the marker names a DIFFERENT path". Executed: two further rewrites of a money-path source file, 23.8 seconds after SIGINT, and `npm run drill` reported PASS.

The drill's own comment states the property it claims to have replaced timing with:

> "R9-03's recorded harm is 'three more source files were rewritten after the
> signal', so that is what is measured: the marker names the file being mutated,
> and it must not name a DIFFERENT one once the signal is in."

Those two sentences are not the same property. The watcher only records
`rec.path !== mutated.path`.

**And the interrupt point is fixed.** The drill waits 500 ms and signals as soon
as any file is broken — which is always the meta-check's NEGATIVE canary, on
`engine/src/spend-meter.ts`. The next three things the harness mutates are the
positive canary (`spend-meter.ts`), `N-01 clock default` (`spend-meter.ts`) and
`N-01 clock type guard` (`spend-meter.ts`). Only the fourth, `N-09`, touches a
different file. So there is a three-entry window in which the harness can keep
rewriting source after the signal and the watcher cannot see it — and R9-03's
recorded harm is *three*.

### Executed

A harness whose signal handler records the signal and defers servicing it until
later entries — a faithful model of the blocking loop R9-03 found, and of
R12-04's "services the signal, but only after doing more damage":

```
$ npm run drill
 ✓ mutation harness — an interrupted run restores the tree (R9-03) > SIGINT stops it,
   clears the marker, and leaves no file mutated                          23770ms
 Tests  1 passed (1)

$ cat /tmp/r13-rewrites.log            # appended by measure(), before each mutation
before        …/engine/src/spend-meter.ts
AFTER-SIGNAL  …/engine/src/spend-meter.ts
AFTER-SIGNAL  …/engine/src/spend-meter.ts
```

Two source rewrites after the signal was delivered, 23.8 s of continued
mutation, drill green.

### What DOES hold, tested

`process.on("exit", restoreInFlight)` is genuinely load-bearing and the drill
does catch its removal — I replaced it with `process.on("exit", () => {})` and
the drill went red on "an interrupted run left a guard reverted on disk". The
collapse of the three redundant restores into one was the right call. It is the
*bound on what happens between signal and exit* that is unmeasured.

Fix direction: watch the FILES, not the marker's path field — snapshot the mtime
or content hash of every file in `MONEY_PATH_SOURCES` (and every file any entry
names) at the moment the signal is sent, and assert none changes afterwards.

---

## R13-06 — SEVERITY 3 (data lies). The sweep's new completeness check has a hand-written population boundary and a substring coverage test. Both were executed; both let a new money-path guard in undriven and deletable. `CLAUDE.md`'s rewritten bullet overstates it — which is R12-02 verbatim.

`CLAUDE.md` now says:

> "`engine/test/money-path-guards.ts` reads every `throw new …` out of
> `spend-meter.ts`, `spend-ledger.ts`, `gateway.ts` and `caps.ts`, and the sweep
> FAILS naming any guard it did not drive — **so a guard added tomorrow fails
> the build the day it lands**."

Two ways a guard added tomorrow does not.

### Leg A — a money-path module that is not one of the four literal names

`MONEY_PATH_SOURCES` is a four-element array and **nothing in the repo checks
that it is complete.** A new module in the money path is simply absent from the
population.

```ts
// engine/src/spend-reconcile.ts — a Phase-2 reconciliation shim
export function reconciledMicros(estimate: number, receipt: number): number {
  if (!Number.isSafeInteger(receipt) || receipt < 0) {
    throw new MeterUnavailableError("receipt is not usable — refusing to reconcile (fail closed)");
  }
  return Math.max(estimate, receipt);
}
```

| state | `engine/test/invariants` |
| --- | --- |
| guard present, never driven | **18 passed (18)** |
| **guard deleted** | **18 passed (18)** |

### Leg B — a signature an unrelated entry's regex matches by accident

Coverage is `guards.some((entry) => entry.expect.test(g.signature))`. The
`expect` regexes are loose substrings of a refusal message. A new guard whose
message happens to contain one of them is counted as driven — by an entry that
fires a completely different guard in a different file. Added to
`InMemorySpendLedger.setHighWater` (a real validation this ledger badly needs,
see R13-01 leg D):

```ts
throw new MeterUnavailableError(`high-water day ${day} is not a finite non-negative number — refusing spend (fail closed)`);
```

`/is not a finite non-negative number/` belongs to the entry that drives
`toMicros(NaN)` in `spend-meter.ts`. Result:

| state | `engine/test/invariants` |
| --- | --- |
| new guard present, never driven | **18 passed (18)** |
| **new guard deleted** | **18 passed (18)** |

### Leg C — the same enumeration pattern in the writing-tool invariant

`WRITE_API` is a literal alternation of nine function names. `writeSync`,
`truncateSync`, `fs.promises.writeFile` via a namespace, and anything outside
`fullburn/` (the walk starts at the workspace root, but `mutate.mjs` itself
writes to `REPO_ROOT` for `.github/` entries) are not in it. Same class, lower
stakes — recorded rather than measured.

### What to do

The population boundary has to be derived, not typed: enumerate every module
reachable from `llm()` / `MemorySpendMeter` / `InMemorySpendLedger` by static
import, and require an entry or a disclosure for every throw in the closure. And
coverage must be matched one-to-one — an entry claims a specific `file:line`
guard, not "some guard whose message contains this phrase".

---

## R13-07 — SEVERITY 3 (data lies). The ledger-claims check — the mechanism built THIS round to stop corrections introducing false claims — binds two of its rows by grepping for a string, and does not bind two rows that make behavioural claims about code that no longer exists.

### Leg A — L31(a)'s binding survives a full revert of what it claims

```ts
{ row: "L31", claim: "the process ledger is keyed process-wide, not per module instance",
  holds: () => /Symbol\.for\(/.test(ledgerSrc) },
```

That is a substring test over the file. Executed — I reverted the slot to a
module-scoped `const` and left the string `Symbol.for("fullburn.spend-ledger.process")`
behind in a comment:

```ts
// R12-06 fixed this with Symbol.for("fullburn.spend-ledger.process").
const MODULE_LEDGER = new InMemorySpendLedger();
function slot(): InMemorySpendLedger { return MODULE_LEDGER; }
```

| check | result |
| --- | --- |
| `engine/test/invariants` (the claims check) | **18 passed (18)** — the row is now false and the check is green |
| full unit suite | 1 failed — `locks-r12` "a re-imported module instance finds the same ledger" |

The behaviour is locked elsewhere, so the capability is not open. But the
standing rule the human wrote is specifically *"a row asserting something about
code behaviour carries a test that fails when the assertion goes stale"*, and
this row's test does not. It is a shape assertion inside the mechanism built to
stop shape assertions.

### Leg B — L31's other claim is a two-name regex

```ts
holds: () => !/\bset(?:Committed|Reserved)Micros\s*\(/.test(contract)
```

The row it binds says "the `SpendLedger` contract declares no balance-write
primitive". R13-01 shows the contract declares one. The check greps for the two
names R12-01 happened to use. This is the clearest single illustration in the
tree of the recurring root cause: the row states a capability, the binding tests
a spelling, and the capability is present.

### Leg C — L30's binding is arity, not reachability

```ts
holds: () => FrozenCapsSpendMeter.length === 1 && MemorySpendMeter.length >= 2
```

The row claims five clock-family guards are unreachable through `llm()`.
`Function.length` is a proxy for one of the reasons that is true. It is adjacent
rather than wrong, and it is worth saying so: a reader of the ledger will believe
the reachability was executed.

### Leg D — two rows make behavioural claims with NO binding, and both are stale

- **L21**: *"`#close()` accepts only handles the meter minted, proved by a private
  WeakSet"*. There is no `#close()` and no handle WeakSet. `spend-ledger.ts:199`
  says so in as many words: *"There is no `#close` helper doing the lookup a
  second time."* The mechanism is now the ledger's identity-keyed `#open` map.
  The conclusion happens to still be true; the row's stated reason names code
  that was deleted.
- **L23**: *"`#read`'s corrupt-ledger check … cannot fire … `#close` deletes an
  entry before decrementing so a negative cannot arise."* `#read` and `#close`
  are both gone, and R13-01 leg E shows a negative CAN arise and the guard DOES
  fire.

Neither row is in `CLAIMS`. `CLAIMS` has eight entries against thirty-two rows.
`CLAUDE.md` says: *"`engine/test/invariants/` binds each behavioural row to the
check that keeps it honest, and a row with no such binding must be phrased as an
open limitation."* L21 and L23 are phrased as conclusions, have no binding, and
are stale — which is the fourth consecutive round in which the ledger's
correction machinery produced or preserved a false claim.

---

## R13-08 — SEVERITY 4 (isolation break, with a money-path consequence). The money-path locks pass only because vitest gives each test FILE its own module registry. Share the registry — `--no-isolate`, or a single-fork pool — and six go red, including R12-01's headline lock. The new shuffled-suite stage cannot see it.

Measured on the unmodified tree:

| run | result |
| --- | --- |
| `npm test` | 324 passed |
| `npm run test:shuffle` (seeds 7, 42, 1234) | 324 passed ×3 |
| eight further shuffle seeds (1, 2, 3, 5, 11, 99, 777, 2026) | 324 passed ×8 |
| **`npx vitest run --no-isolate`** | **5 failed / 319 passed** |
| **`npx vitest run --pool=forks --poolOptions.forks.singleFork`** | **6 failed / 318 passed** |

The failures are money-path locks:

```
FAIL locks-r11 › a meter built after the ceiling is full refuses, and reads the real balance
FAIL locks-r11 › headroom held open by one handle is not available to another
FAIL locks-r11 › the meter exposes no way to halt a client's spend; the ledger does
FAIL locks-r12 › no method on the SpendLedger contract can lower a committed balance
FAIL locks-r12 › a halt requires a reason and is recorded
FAIL locks-r7  › the only caller input is a table that can narrow and never widen
```

### The cause, isolated

```
locks-r11 alone, singleFork                     → 5 passed
locks-r12 then locks-r11, singleFork            → 3 failed / 11 passed
the same two files, default (isolated) pool     → 14 passed
```

And the failures are not stale balances — they are **class identity**:

```
AssertionError: a fresh handle minted a fresh ceiling: expected error to be instance of CapError
- Expected: [Function CapError]
+ Received: [Error: AI spend cap breach refused: projected $5.0100 > daily cap $5 for "fixture-testco"]
```

`vi.resetModules()` inside `locks-r12.test.ts` — the file added this round to
lock R12-06 — gives every later file in a shared registry a SECOND copy of
`caps.ts` and `spend-ledger.ts`, and therefore a second `CapError` and a second
`MeterUnavailableError`. The `Symbol.for` slot correctly keeps one ledger across
both copies. The error classes it does not.

R12-06's diagnosis was *"`vi.resetModules()` inside the money-path lock file
splits the one process ledger in two"*. The fix made the LEDGER survive
`resetModules` and left `resetModules` where it was, so what splits in two now is
the error identity. Same call, same file, next spelling — and the CI stage built
to catch this class (three fixed seeds under per-file isolation) is blind to it
by construction.

### Why this is a money finding and not test hygiene

`gateway.ts:360` decides how to treat a refusal by class:

```ts
const safe = err instanceof CapError || err instanceof MeterUnavailableError
  ? redactInPlace(err, secrets)          // preserve identity: the caller can tell a breach from an outage
  : redactError(err, secrets, errorClassFor(err));
```

With two module copies, a real cap breach takes the second branch: the caller
loses the ability to distinguish "you hit your cap" from "storage is down",
which the comment on that line says is the whole point of the branch. And
`spend-ledger.ts`'s own header names the production cause: *"A bundler chunk
duplication or a dual-resolution alias does the same in production."* The repo
has demonstrated the dual-resolution condition inside its own test process.

---

## R13-09 — SEVERITY 3 (data lies). R12-01 leg B reproduces verbatim and unfixed: the "no production module reaches the ledger's test-only reset" enumeration is still non-recursive and still `.ts`-only, under a comment that says the opposite.

```ts
for (const f of readdirSync(root).filter((n) => n.endsWith(".ts"))) { … }
```

with the doc-comment: *"Enumerated from the filesystem, so a module added
tomorrow is covered."* Measured again on this tree, one production module
naming `resetProcessLedgerForTests`:

| module | `engine/test/invariants` |
| --- | --- |
| `engine/src/roll.ts` (control) | **1 failed / 17 passed — correct** |
| `engine/src/money/roll.ts` (one subdirectory down) | **18 passed — BLIND** |
| `engine/src/roll.mjs` | **18 passed — BLIND** |

r12 reported this with the same table. It was not fixed and it is not disclosed.
A finding that is reproduced by re-running the previous round's own measurement
costs the round nothing to fix and is the cheapest possible signal that the
report was read for its headline only.

---

## R13-10 — SEVERITY 3 (data lies). L32 says the mock enumeration covers "the whole test tree". It walks `engine/test/` only, so `config/test/` can mock `config/src/caps.ts` undeclared.

L32:

> "`engine/test/invariants/` enumerates every `vi.mock` of a module under
> `*/src/` across the whole test tree and fails on any that is not declared with
> a ledger row."

The walk starts at `new URL("../", import.meta.url)` — `engine/test/`.
`config/test/` holds four test files that `vitest.config.ts` includes and this
check never sees. Executed, `config/test/zz-mock.test.ts` mocking
`../src/caps.ts` with no declaration anywhere:

| check | result |
| --- | --- |
| `engine/test/invariants` | **18 passed (18)** |
| full unit suite | **325 passed (325)** |

`caps.ts` is the Class-2 money file. A test file that mocks it and proves
something about caps is proving it about the mock.

---

## R13-11 — SEVERITY 5 (dummy-proof / record accuracy). `CLAUDE.md`'s shape-assertion bullet still says SIX defeated checks, in the commit that fixed the seventh.

> "This has now defeated SIX separate checks (R8-09, R9-02, R9-03, R9-04,
> R10-09, R11-04) — the last two on the same line of the same file…"

R12-04 was the seventh, and it was the THIRD on that same line of that same
file, not the second. `cb48c05` fixes R12-04 and does not update the count. With
R13-04 it is now eight, and four on that line. The bullet is the project's own
early-warning system for its worst recurring defect; a count that lags by a round
is the same class of error as a ledger row that lags by a round, in the file that
binds every session.

---

# INVARIANT CHECKLIST (`CLAUDE.md` standing invariants — every one, every round)

| invariant | result |
| --- | --- |
| No code path can write outside publish/pause/promote | HOLDS (no write adapter before Phase 6; the mass-read half is armed and driven) |
| A cross-tenant read attempt must fail by construction | **FAILS — R13-01 leg C.** `reserve()` takes `clientId` and the ceilings from the caller, so any module commits any amount against any tenant's period. `assertOwnPeriod` checks the period against the caller's own `clientId`, which the caller also chose. |
| `decisions` ledger append-only | N/A before Phase 2 (deferred, recorded) |
| Big red button halts spend in <60s | N/A before Phase 6 |
| Bracket protection window | N/A before Phase 5 |
| External content is data, never instructions | HOLDS (inert-fixture half driven; no injected instruction in any fixture I read, and none obeyed) |
| `VERDICT.md` hash-locked | N/A before Phase 6 |
| OAuth tokens only in the vault | HOLDS — `npm run leak-check` clean, canary secret not present in any trace |
| Human-queue SLA / locked flags inert | HOLDS for the flags half (driven); queue half N/A |
| **A guard and its checker never ship in the same commit without a test proving the checker can go red** | **VIOLATED in substance — R13-03.** L31(b) ships a disclosure asserting a bounding test exists. No such test exists, so there is nothing that can go red. |
| **Every harness result is void unless preceded by a passing meta-check** | HOLDS — both canaries reported `ok` on this machine and in this tree before any number was printed. Driven, not asserted. |
| **The unreachable-guard sweep is a COMPLETED step in every round** | **RUN TO COMPLETION and PARTIALLY OVERSTATED.** All 47 enumerated guards driven and individually proven killable (see the gate table). The bullet's claim that "a guard added tomorrow fails the build the day it lands" is false in two executed ways — R13-06. |
| **A guard is locked by EXECUTING it, never by asserting its shape** | **VIOLATED — R13-04 (blocking resolver, eighth defeat, fourth on that file), R13-05 (drill), R13-07 legs A/B/C (claims check).** |
| **A behavioural ledger row carries a test that fails when it goes stale** | **VIOLATED — R13-07.** Two rows bound by a substring grep, one by arity, two behavioural rows (L21, L23) with no binding and both stale. |
| **Any tool that can write to the source tree is import-safe and fails closed** | HOLDS for the tools that exist — the entry-point guard, the marker-before-mutation ordering and `recoverInFlight`'s three refusals were all driven and all discriminate. The ENUMERATION that finds those tools is a literal list of nine write-API names (R13-06 leg C). |

# LEDGER ROWS L1–L32 — does each still say something true?

Rows verified this round; only the ones that changed state are listed.

| row | verdict |
| --- | --- |
| L14, L17, L19, L20, L24, L25, L26, L27, L28, L29 | still true as written; L29's second correction (three `mutate.mjs` entries, caught by `blocking-calls.test.ts`) verified by count and by the passing mutation entries |
| **L21** | **STALE.** Names `#close()` and a handle WeakSet, neither of which exists. Conclusion incidentally still true; stated mechanism is deleted code. No binding. |
| **L23** | **FALSE.** `#read`/`#close` are gone, and the corrupt-ledger guard IS reachable (R13-01 leg E). The sweep's `DISCLOSED` exemption citing this row is therefore a stale exemption for a live guard — which the sweep's own last assertion exists to prevent, and cannot detect because it only checks that the exemption matches *some* guard. |
| **L30** | Weakened. The row is true; its binding tests arity (R13-07 leg C). |
| **L31** | **THREE FALSE CLAIMS.** (i) "no balance-write primitive at all" — R13-01. (ii) "(b) … this is MEASURED rather than described … `locks-r12` carries the BOUNDING test" — no such test exists, R13-03. (iii) "(a) … The slot is keyed off `Symbol.for` … and a test drives the re-import" — the re-import test is real, but the row does not disclose that the slot is now writable by anything in the process, R13-02. |
| **L32** | **OVERSTATED.** "across the whole test tree" is `engine/test/` only — R13-10. |
| L8 | still open and still gating: every review including this one has run on the builder's model family. |

# TESTS THIS ROUND WOULD ADD (Phase B, not written into the tree — findings go back to the builder)

Per the standing rule that fixes go to the builder, these are specified rather
than committed. Each must fail against `cb48c05` and pass after the fix.

1. **`reserve` refuses a non-positive `micros` and derives its own ceilings.** Drive
   `processLedger().reserve({… micros: -1 …}, {})` and assert it throws; then
   assert the committed total is monotonically non-decreasing across a fuzz that
   SEQUENCES contract methods (random walks over `reserve → settle → release →
   setHighWater`), not one that calls each in isolation.
2. **The slot has an occupant check.** Plant a foreign object at
   `Symbol.for("fullburn.spend-ledger.process")`, construct a
   `FrozenCapsSpendMeter`, assert it refuses.
3. **The production ledger is frozen**, and a redefinition attempt throws.
4. **The prototype-patch bound is measured**, once, with a number in the
   assertion — the test L31(b) claims exists.
5. **The drill watches FILES.** Hash every file any mutation entry names at the
   instant SIGINT is sent; assert none changes afterwards. Red-proof it against a
   harness that defers the signal by N entries.
6. **`MONEY_PATH_SOURCES` is derived**, and coverage is matched `file:line`, not
   by substring. Red-proof: a new guard in a new module, and a new guard whose
   message contains a covered phrase.
7. **`blockingImports` refuses an unresolved local specifier** (push
   `unresolvable`, do not `continue`), and the invariant's graph walks the tree
   rather than one directory and one extension.
8. **The suite is order-independent under a SHARED registry**, not only under
   three seeds with per-file isolation: add `--no-isolate` (or a single-fork
   pool) as a CI stage, and remove `vi.resetModules()` from the money-path lock
   file — put the re-import test in its own file with its own process.
9. **The reset-reachability walk is recursive** and covers `.mjs`/`.cjs`.
10. **The mock enumeration walks `config/test/` too.**

# SPEC OBSERVATIONS (for the human, not silently patched)

1. **`ReserveRequest` is the wrong contract shape for Phase 2.** §2.2 says the
   Durable Object implements `SpendLedger` unchanged. As written, that DO would
   accept the client id, the period keys, the amount AND both ceilings from
   whatever calls it. Every one of those except client id and amount is a thing
   the enforcement boundary should resolve for itself; three of the six money
   findings in this report are consequences of that one design choice. The
   interface should be `reserve(clientId, micros, handle)` with the ledger
   resolving periods and ceilings from the frozen table and the clock it trusts.
2. **The project's checks are converging on "enumerate the population" as the
   universal fix, and the population boundary is always hand-written.** Four
   literal filenames (`MONEY_PATH_SOURCES`), one literal directory
   (`engine/scripts/*.mjs`), one non-recursive `readdirSync`, one test-root URL,
   nine write-API names. Each is the same defect the sweep was built to remove,
   moved out one ring. It may be worth a standing rule: *an enumeration that
   defines a security population must be derived from the import graph or the
   filesystem walk, never typed — and must carry a test that adds a member and
   watches the check go red.*
3. **L8 still gates.** Thirteen rounds, one model family. The finding rate has not
   fallen (r11: 7, r12: 9, r13: 11), which is itself evidence that same-family
   review is not exhausting the space.

# VERDICT

**FAIL.** Two severity-1 money-loss findings, both reachable by an ordinary
module importing what the module exports and calling what the interface
declares; eight severity-3 data lies, five of which are checks or ledger rows
that claim in prose to enforce something they were measured not to enforce; one
severity-4 isolation break with a money-path consequence.

R12-01's fix — moving the arithmetic into the ledger — is **the right direction
and not the architectural close.** It removed the setter and kept the operands
caller-supplied, so it is the sixth spelling by the human's own standard. The
close is that the enforcement boundary derives everything it compares against
from state it owns.

This verdict cannot be overridden by the builder. Phase 0's gate stays shut.
