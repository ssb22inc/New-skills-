# ADVERSARY REPORT phase0.r14
Verdict: FAIL
verified-tree: 9f802fc620cee651944652a9b1f1fe1249c400f5

Round: r14, same-family adversary review of Fullburn Phase 0.
Target: commit `4d1470f` on branch `claude/fullburn-engine-spec-r7v5lg`.
Tree hash measured by me at session start with `git rev-parse HEAD^{tree}`:
`9f802fc620cee651944652a9b1f1fe1249c400f5`, `git status --porcelain` empty.

This file is written INCREMENTALLY and append-only. Two previous r14 attempts
died from infrastructure errors before writing anything; this one records each
gate and each finding at the moment it is confirmed, so an interruption costs
one finding rather than the round. If the file ends without a final verdict
line rewritten at the top, the round was cut off — read the gate table for what
was actually measured.

---

## Gate table (re-measured by me; nothing below is copied from a prior report)

| Gate | Claimed (r13/handoff) | Measured by me | Status |
|---|---|---|---|
| `npm test` | 329/329 | (running) | PENDING |
| `npm run typecheck` | clean | (pending) | PENDING |
| `npm run drill` | 2 passed | (pending) | PENDING |
| `npm run test:shuffle` | 329/329 x3 seeds | (pending) | PENDING |
| `npm run test:noisolate` | 326/326 | (pending) | PENDING |
| `npm run leak-check` | clean | (pending) | PENDING |
| `npm run mutate` | meta-check pass; 163/163 caught, 0 survived, 0 not found | (pending — run LAST) | PENDING |

---

## Findings

(appended as confirmed)

### Gate results measured so far

- `npm test` → **329 passed / 24 files**, exit 0. Matches the claim.
- `npm run typecheck` → clean, exit 0. Matches.
- `npm run drill` → **2 passed**, exit 0, own runner. Matches.
- `npm run leak-check` → `leak/structural scan: clean`, exit 0. Matches.

Tree hashes, both computed by me:
- `git rev-parse HEAD^{tree}` = `9f802fc620cee651944652a9b1f1fe1249c400f5` (whole repo)
- the scope `adversary-gate.mjs` binds to, from the repo root
  (`git ls-files -s -- 'fullburn/' '.github/' ':!fullburn/reports/' ':!fullburn/APPROVALS/' | git hash-object --stdin`)
  = `328c332e4da2b1a153c696b5de824b4afe4b304c`

---

## R14-01 — SEVERITY 1 (money loss). The Durable Object does not close the in-process prototype residual. The single stated remediation for the project's oldest live money hole is written into the source, into ledger L31 and into the handoff, and it is wrong — executed here against a DO-shaped ledger that enforces out of process.

This is the finding the standing rule of 2026-08-20 was written to catch, applied
one round early to a fix that has not landed yet.

`engine/src/spend-ledger.ts` lines 47–52 state the remediation:

> "the production implementation is the client's Durable Object (§2.2) … Because
> the clock, the caps and the arithmetic are all on this side of it, the DO
> enforces the ceiling out of process — **which is what closes R11-01's
> in-process prototype patch**."

Ledger L31 repeats it for all three limitations:

> "All three end at the same place: the Durable Object, which moves the state and
> the enforcement out of the process."

and L31(c) specifically:

> "The DO closes it: with the arithmetic already inside the ledger, enforcement
> happens outside the process."

`reports/HANDOFF.md` §4.1(b) repeats it a third time.

**It does not close it, and the reason is structural rather than incidental.** The
patch does not attack the STATE. It attacks the CALL. `llm()` reaches storage
through exactly one expression — `meter.reserve(req.clientId, card.costBudgetUsdPerCall)`
— and an in-process patch of the method that expression resolves to means no
request is ever issued to the Durable Object. A Durable Object enforces the calls
it receives. It has no opinion about a call that was never made. Moving state out
of the process makes the state unreachable to the attacker and simultaneously
makes the attacker unnecessary to the state.

### Reproduction — executed, not argued

I built a stand-in for Phase 2's ledger whose authoritative state lives in an
object the in-process patch cannot see, reach or modify, and which refuses on
breach — i.e. exactly the property the DO is claimed to provide — then wrapped it
in a production-shaped meter and ran the disclosed patch against it.

```
DO unpatched: spent $5.00   authoritative committed micros = 5000000   (ceiling binds — the fixture is honest)
DO PATCHED:   spent $30.00 against a $5 DO-enforced ceiling
              authoritative committed micros = 0
              open reservations at the DO = 0
              the DO was never called: true
```

3,000 dispatches, $30.00 of billable spend against a $5.00/day ceiling that the
out-of-process store was enforcing correctly the whole time, and the store's own
counters read zero because nothing ever arrived. The same run through the real
`llm()` against the real `FrozenCapsSpendMeter`:

```
llm() with patched meter prototype: ok=900  capErrors=0  other=0
dispatched=900  = $9.00 vs cap $5
```

900 real dispatches, zero `CapError`s. (Unbounded — 900 was my loop count.)

### Why this is severity 1 and not a documentation nit

Three artefacts — the source comment, the ledger row, and the handoff — all tell
the next session that this residual has a scheduled close. It does not. Phase 2
will land the DO, satisfy every acceptance criterion written for it, tick L31,
and the money hole will still be open with nothing left in the plan to close it.
That is precisely the failure mode the human ruled against on 2026-08-18 ("four
rounds running, a disclosed limitation became the next round's severity-1") and
again on 2026-08-20 ("if a fix only NARROWS access rather than eliminating the
capability, say so explicitly — a narrowing described as a closure is how a
disclosed limitation becomes the next round's severity-1"). Here the round-14
report is the one saying so, about a fix scheduled for round 20-something.

Note what I am NOT saying. I am not saying freeze the prototype — the human ruled
that out and was right. I am saying the disclosure currently names a remedy that
cannot work, and the honest version of L31(c) is that the in-process residual is
**irreducible in this process model** and requires the enforcement point to be
somewhere the caller's own method table is not — a separate process, an isolate
boundary, or a signed reservation the transport itself refuses to dispatch
without. Whatever the right answer is, "the DO" is measurably not it.

---

## R14-02 — SEVERITY 2 (money loss, in-process). `InMemorySpendLedger.prototype` is an undisclosed member of the residual class, and R13-01 is the fix that made it load-bearing. The disclosure and the bounding test both still name only the meter.

R13-01's stated achievement is that the ledger now owns "the sign, the ceilings,
the clock, the periods and the arithmetic" — every enforcement decision on the
money path is now a method on `InMemorySpendLedger.prototype`. That object:

- is **not frozen** (`Object.isFrozen(InMemorySpendLedger.prototype)` → `false`, measured);
- is exported from `engine/src/spend-ledger.ts`;
- is **re-exported a second time** from `engine/src/spend-meter.ts` line 16.

The production singleton is frozen and its `[[Prototype]]` cannot be swapped
(both measured — `Object.setPrototypeOf` on it throws `TypeError`, and the slot
descriptor is `writable:false, configurable:false`, so those halves are genuine
removals). None of that helps: methods are resolved on the prototype, and the
prototype is a separate object that no freeze touches.

### Reproduction — executed through the real `llm()`

```js
InMemorySpendLedger.prototype.reserve = function () { /* no cap check */ };
```

then 800 calls through the real `llm()` with the real `FrozenCapsSpendMeter`
against `fixture-testco`'s frozen $5.00/day:

```
BASELINE            ok=500  capErrors=300  todayUsd=$5.00  dispatched=500
LEDGER-PROTO-PATCH  ok=800  capErrors=0    todayUsd=$0.00  dispatched=800  = $8.00 vs cap $5
```

Zero `CapError`s, `todayUsd()` reading $0.00 throughout. Unbounded — 800 was my
loop count, and every extra iteration is another dispatch.

### Why this is a finding and not "the same disclosed thing"

L31(c) discloses exactly one object by name: "an in-process patch of
`MemorySpendMeter.prototype`". The bounding test built this round to satisfy
R13-03 — `engine/test/locks-r12.test.ts`, "the disclosed in-process residual,
MEASURED (L31(b), R13-03)" — patches `MemorySpendMeter.prototype` and nothing
else. So the round-13 work established the bound for the meter's method table in
the same commit that moved every enforcement decision onto a **different** method
table, and neither the row nor the test followed it there.

That is the recurring root cause in its purest form. The capability is
"redefine the method the money path dispatches through". R13-01 moved the money
path to a new method table and the disclosure kept naming the old one. The
handoff's own words for this class — "the recurring root cause across R7–R11 is
fixes that enumerate the attack's *spelling* rather than removing the
*capability*" — describe the disclosure this time rather than the fix.

The second export in `spend-meter.ts` line 16 makes it materially worse than the
meter case: a module that imports nothing but `spend-meter.ts` (which is what
every money-path consumer imports) has the ledger class, and therefore the sole
enforcement point's method table, in scope by name.

---

## R14-03 — SEVERITY 3 (data lies). The derived guard population replaced a hand-written list with a regex that has four blind spots, and nothing checks that the money path stays inside them. R13-06's fix is R13-06's defect one level up.

R13-06's finding was that `MONEY_PATH_SOURCES` was a four-name literal array
"that nothing checked for completeness, so a guard in a new money-path module
was outside the population and deletable with the suite green". The fix derives
the population from the import graph (`engine/test/money-path-guards.ts`). I
re-measured the derivation: **11 modules, 75 guards** — the claimed numbers are
correct, and today's population is in fact complete.

But the boundary moved from a literal array to a regex, and **nothing checks
that the money path stays inside what the regex can see.** Four blind spots,
each executed:

| # | Spelling | Result |
|---|---|---|
| A | `const m = await import("./dynamic.ts")` — dynamic import | module absent from the population |
| B | `import "./side-effect.ts"` — side-effect import, no `from` | module absent from the population |
| C | `throw new Errors.CapError("…")` — member expression | guard invisible to `enumerateThrowGuards` |
| D | `from "./ghost.ts"` inside a comment or string literal | phantom module ADDED to the population |

Executed output:

```
DYNAMIC-IMPORT population:  [ 'engine/src/gateway.ts', 'engine/src/static.ts' ]   <- dynamic.ts, dynamic2.ts absent
SIDE-EFFECT population:     [ 'engine/src/gateway.ts' ]                            <- side-effect.ts absent
ENUMERATED (5 throw forms): ["counted"]                                            <- 1 of 5 seen
COMMENT-DERIVED population: [ 'engine/src/gateway.ts', 'engine/src/ghost.ts' ]     <- phantom from a comment
```

`moneyPathModules` follows exactly one construct: `/from\s+["']([^"']+)["']/g`.
`enumerateThrowGuards` follows exactly one: `/throw new (\w+)\s*\(/g`. Of the five
`throw` forms in blind spot C — `new Errors.X(…)`, a factory call, a pre-built
error thrown by variable, and `new (cond ? A : B)(…)` — one is counted.

### Why this is a finding today and not only tomorrow

I checked the current tree: **zero** dynamic imports and **zero** side-effect
imports exist across the eleven money-path modules, so the population really is
complete right now. That is exactly the position `MONEY_PATH_SOURCES` was in when
R12-02 declared it fine and R13-06 found it wasn't. The property the sweep
claims — `CLAUDE.md`: "a guard added tomorrow fails the sweep the day it lands,
which is the only way a coverage claim stays true" — is false for four ways of
adding one. A `throw new Errors.CapError(…)` added to `spend-ledger.ts` tomorrow
is outside the count and deletable with the suite green, which is R13-06's
sentence with a new subject.

The cheap fix is not a fifth regex. It is a check that the money path contains
none of these constructs — a refusal, the way `blocking-calls.ts` refuses what it
cannot resolve, rather than a silent omission. The derivation already knows how
to say "I cannot follow this"; it just never says it.

---

## R14-04 — SEVERITY 3 (data lies). Shape-assertion trap #9, same file, FIFTH consecutive round. Five more spellings walk past `blocking-calls.ts` — and one of them produces a completely clean scan with no refusal at all.

R10-09, R11-04, R12-04 and R13-04 were all this file. R13's fix resolves the
binding transitively through the local module graph and treats `f.call`,
`f.apply`, `f.bind` and `Reflect.apply` as calls. I confirmed both of those still
hold, then went looking for number nine. Executed, with the two controls first:

```
caught                      :: baseline `spawnSync(...)`                names=["spawnSync"]  unresolvable=[]
caught                      :: R12-04's `run.call(null, ...)`           names=["run"]        unresolvable=[]

*** CLEAN (walks past) ***  :: A. import { default as cp } from "node:child_process"; cp.spawnSync(...)
                               names=[]           unresolvable=[]      result=[]
*** CLEAN (walks past) ***  :: B. const run = spawnSync; run(...)
                               names=["spawnSync"] unresolvable=[]     result=[]
*** CLEAN (walks past) ***  :: C. const t = { go: spawnSync }; t.go(...)
                               names=["spawnSync"] unresolvable=[]     result=[]
*** CLEAN (walks past) ***  :: D. const fns = [spawnSync]; fns[0](...)
                               names=["spawnSync"] unresolvable=[]     result=[]
*** CLEAN (walks past) ***  :: E. import { default as cp } from "child_process"; const { spawnSync: s } = cp; s(...)
                               names=[]           unresolvable=[]      result=[]
```

Two distinct defects, and they are not the same one:

**(A/E) The named-default import defeats the RESOLVER, and does not even
register as unresolvable.** `blockingBindings` refuses a namespace import and a
default import with the regex
`import\s+(?:\*\s+as\s+\w+|\w+)\s*(?:,\s*\{[^}]*\}\s*)?from\s+CP` — which requires
`import` to be followed by `*` or a bare identifier. `import { default as cp }`
is a BRACED import, so it never reaches that branch; it then falls into
`blockingImports`, where the imported name is the string `"default"`, which is
not in `BLOCKING_APIS`, so nothing is recorded. `names=[]`, `unresolvable=[]` —
the file's own fail-closed principle ("What it cannot resolve statically it
REFUSES") is not reached, because the check believes it resolved it. This is the
single most direct defeat of the five: one line, no helper module, no aliasing.

**(B/C/D) The `isCalled` fix enumerated invocation FORMS, not value FLOW.** The
binding IS resolved correctly in all three — `names=["spawnSync"]` — and then
`isCalled` looks for the *name* `spawnSync` adjacent to a `(`. Assign the value
to any other name, property or array slot and the call site no longer mentions
the resolved name. R12-04's finding was that `f(…)` was the only invocation form
matched; the fix added three more forms. The capability is "call the value",
and the fix enumerated ways of *writing* the call. That is the recurring root
cause verbatim, on the file that has now hosted it five rounds running.

`CLAUDE.md`'s bullet says "This has now defeated EIGHT separate checks … and
FOUR of those eight are the same line of the same file on four consecutive
rounds: the blocking-process-API check, walked past by the API name, then an
import alias, then a re-export, then a subdirectory. Each fix enumerated one
more spelling." Nine, and five, as of this round. The bullet's own count is
checked by a test (R13-11's fix), so it will need updating — but the count is
not the problem. Five rounds of enumerating spellings on one file, while the
file's header comment describes the pattern it keeps falling into, is the
problem.

I note in fairness what the file gets right and says out loud: it states that it
is defence in depth and that the behavioural lock on R9-03 is the SIGINT drill.
That framing is honest and it is why this is severity 3 rather than higher. It
does not make the check work.

---

## R14-05 — SEVERITY 3 (data lies, isolation instrument). `npm run test:noisolate` does not reproduce the condition R13-08 named, so its 326/326 does not prove what `vitest.config.ts` and the handoff say it proves. Force a single fork — R13-08's own words — and four money-path locks go red in two files the exclusion list does not name.

R13-08's finding: "Share the registry — `--no-isolate`, **or a single-fork
pool** — and six go red, including R12-01's headline lock."

R13's fix made `isolate: true` explicit and added
`npm run test:noisolate`, with this claim in `vitest.config.ts`:

> "`npm run test:noisolate` proves everything ELSE is independent of it, so the
> dependency is bounded and measured rather than assumed."

and in the handoff: "`npm run test:noisolate` proving everything outside two
registry-dependent files is independent of it".

I re-measured the gate as written — **326/326, exit 0, matches the claim.** Then
I ran the *other* reproduction R13-08 named, changing nothing but the pool:

```
npx vitest run --no-isolate --poolOptions.forks.singleFork \
  --exclude '**/departed-contract.test.ts' --exclude '**/ledger-slot.test.ts'

Test Files  2 failed | 20 passed (22)
Tests       4 failed | 322 passed (326)
```

The four, in two files the exclusion list does not mention:

- `engine/test/gateway.test.ts` — "throws CapError for a client with no caps at all (no default spend)"
- `engine/test/locks-r11.test.ts` — "a meter built after the ceiling is full refuses, and reads the real balance"
- `engine/test/locks-r11.test.ts` — "headroom held open by one handle is not available to another"
- `engine/test/locks-r11.test.ts` — "the meter exposes no way to halt a client's spend; the ledger does"

`--no-isolate` alone leaves vitest's default forks pool distributing files across
several worker processes, so two files sharing one module registry is the
exception rather than the rule. The flag changes isolation *within* a worker; it
does not force the files together. R13-08 knew that and named both conditions.
The gate built to answer it runs only the weaker one.

### What the failures are, stated precisely, because it matters for severity

All four are **module-identity artifacts, not cap failures.** Each guard fires
and each produces the correct refusal text; only `instanceof` fails, because a
duplicated registry duplicates the error classes:

```
expected error to be instance of CapError
+ Received: [Error: AI spend cap breach refused: projected $5.0100 > daily cap $5 for "fixture-testco"]

expected error to be instance of MeterUnavailableError
+ Received: [Error: client storage is unavailable for "fixture-testco" — refusing spend (fail closed)]
```

So there is **no money loss here** and I am not claiming one — the ceiling binds
correctly in every case. Two things are still wrong:

1. **The coverage claim is false.** Four locks in two unnamed files depend on
   isolation. The config comment and the handoff both say two files, exhaustively.
2. **There is a real production consequence, small but not zero.** `llm()`'s
   error path branches on `err instanceof CapError || err instanceof MeterUnavailableError`
   to decide whether to preserve the error's identity through redaction. Under a
   duplicated registry that branch is false, and the refusal is rewritten as a
   generic `GatewayError` — so a caller, and the incident runbook that
   `gateway.ts` says "relies on the class", can no longer tell a cap breach from
   an outage. A bundler that duplicates a module, or two Worker entry points
   sharing a build, produces exactly this. That is a data lie about money at the
   moment an operator most needs the truth.

The honest gate is `--poolOptions.forks.singleFork`, and the honest exclusion
list has four files in it, or the class-identity dependency gets fixed.

---

## R14-06 — SEVERITY 3 (data lies). The SIGINT drill — the project's stated behavioural lock for its worst harness incident — has no red-proof and no mutation coverage. I deleted all three of its detection paths and it reported PASS. The four mutation entries removed last commit were removed for the wrong reason.

`engine/test/blocking-calls.ts` says it plainly:

> "THIS IS DEFENCE IN DEPTH, NOT THE LOCK … The behavioural lock on R9-03 is the
> SIGINT drill (`npm run drill`, its own CI stage), which now asserts that NO
> FURTHER SOURCE FILE is mutated after the signal is delivered."

The R13-05 fix built that watcher — snapshot every watched file at the instant of
the signal, then flag any content that is neither the snapshot nor the
pre-mutation original — and it shipped in commit `4d1470f`, the commit under
review. Every other checker in this tree carries a red-proof: the sweep proves
`whichFired` can report all three ways a guard is dead; the ledger-claims check
runs a deliberately-false claim through the same function the real claims use;
`mutate-lib.mjs` has its two canaries. The drill has none.

### Reproduction — executed

I copied `engine/test/drill/harness-interrupt.drill.ts` to a scratch file and
deleted all three places that can record a violation:

```
line 141  afterSignal.add(f);                                        -> /* NEUTERED */
line 147  if (rec.path !== mutated!.path) afterSignal.add(rec.path);  -> /* NEUTERED */
line 163  if (now !== atSignal.get(f) && …) afterSignal.add(f);       -> /* NEUTERED */
```

Nothing else changed. It spawned the real harness, interrupted it, and:

```
✓ NEUTERED drill — an interrupted run restores the tree (R9-03) > SIGINT stops it,
  clears the marker, and leaves no file mutated                              516ms

Test Files  1 passed (1)
Tests       1 passed (1)
```

(The real harness was spawned and interrupted once; `git status --porcelain` was
empty afterwards apart from this report, and no `.mutate-inflight.json` remained.)

So the entire R13-05 mechanism can be deleted with `npm test`, `npm run drill`,
`npm run typecheck`, `npm run leak-check` and `npm run mutate` all green. That is
the R9-01 defect — "a checker that became incapable of failing while printing a
true number" — sitting in the one file the project points at when it wants to say
a property was proved behaviourally rather than by shape.

### The removed mutation entries, judged against the standing rule

The commit message for `4d1470f`:

> "Four mutation entries were written and REMOVED: a mutation that deletes a
> single assertion inside a test, or targets a file the unit suite never runs,
> can only report SURVIVED. The harness said so."

**The observation is correct and the conclusion is backwards.** "This checker
cannot be covered by the acceptance bar" is the finding. Deleting the entry
removes the evidence, not the gap. And the tree already demonstrates the right
answer eleven times over: `mutate.mjs` carries **10** entries on
`invariants.test.ts`, **5** on `blocking-calls.ts`, **2** on
`money-path-guards.ts` and **1** on `hardening.test.ts` — checker mutations that
report CAUGHT precisely because each of those checkers has a red-proof running
through the same expression the check uses. Neuter `staleClaims`' body and the
claims check's own red-proof goes red. Neuter `whichFired`'s class comparison and
the sweep's red-proof goes red.

So a mutation on a test file is only "unprotectable" when that test has no
red-proof — which is a statement about the drill, not about mutation testing. The
two honest fixes are (a) give the drill a red-proof of the same shape the sweep
has, so an entry on the watcher reports CAUGHT, or (b) put `npm run drill` inside
the harness's `measure()` so the drill's stage is part of the bar. Either makes
the deleted entries reportable. Neither was done, and the acceptance bar now
prints **163 caught, 0 survived** over a set that deliberately excludes its own
weakest checker.

### Minor, same file, not exploited

The content watch list is hard-coded to three files plus whichever file the
marker names at the signal: `spend-meter.ts`, `spend-ledger.ts`, `gateway.ts`.
The harness mutates **18** distinct files, including `engine/scripts/gate-lib.mjs`
(28 entries — the second largest group) and `config/src/caps.ts` (7 entries, the
Class-2 money file). For the other fourteen the only detector left is the marker
path check — which is the mechanism R13-05 found insufficient. I could not build
a live exploit, because moving to a new file rewrites the marker before the
source is broken (the invariant enforces that ordering) and the 25 ms poll wins
the race comfortably. But the file's own claim — "So the FILES are watched, not
the marker's path" — is true of four files out of eighteen, and the list should
be derived from `MUTATIONS` rather than written out, for the same reason
`MONEY_PATH_SOURCES` had to stop being a literal array (R13-06).

---

## R14-07 — SEVERITY 3 (data lies). Two mutation entries revert the SAME line. `FrozenCapsSpendMeter`'s `Object.freeze(this)` — R10-02's fix, for a measured money finding — has no entry that touches it, and the harness prints `CAUGHT` for it anyway. This is R9-02's defect in a source file instead of the table.

I checked all 163 entries for target ambiguity: for each, how many places in the
target file its `from` text matches, and which one `applyEntry` picks. One
genuine collision, in `engine/src/spend-meter.ts`:

```
mutate.mjs:195  ["R10-02 the production meter is frozen", "engine/src/spend-meter.ts",
                 "    Object.freeze(this);\n  }\n}",  "  }\n}"]
mutate.mjs:236  ["R6-04 handle frozen",                "engine/src/spend-meter.ts",
                 "    Object.freeze(this);",          "    void 0;"]
```

`Object.freeze(this);` occurs twice in that file:

- **line 93** — the last statement of `SpendReservation`'s constructor, followed by `  }` then `}` (end of class);
- **line 320** — the last statement of `FrozenCapsSpendMeter`'s constructor, followed by `  }` then `}` (end of class).

Both entries' `from` text matches at **both** sites, and `applyEntry` uses
`source.indexOf(from, 0)` for a non-self file, so **both take line 93.** Entry 195,
named for the production meter, reverts the reservation handle's freeze —
the same site entry 236 already covers. `FrozenCapsSpendMeter`'s
`Object.freeze(this)` is never written to by the acceptance bar.

That line is not a small one. It is the whole of R10-02's fix, and R10-02 was a
money finding, measured: "a settle rewired to release mints headroom on every
call … 5,000 dispatches, $50 against a frozen $10/day, `todayUsd()` reading
$0.00". The human ruling of 2026-08-18 — "production meters are immutable" — is
that line.

### Is the guard nevertheless protected? Yes — measured, and that is why this is severity 3

I removed **only** the second occurrence and ran the suite:

```
FAIL engine/test/locks-r7.test.ts  > money — llm() takes its ceiling from the frozen table, by construction (R8-01)
     > the frozen-caps brand cannot be forged, subclassed, or patched on
     AssertionError: a production meter is mutable: expected false to be true
FAIL engine/test/locks-r11.test.ts > storage availability belongs to storage (R11-06)
     > the meter exposes no way to halt a client's spend; the ledger does
     AssertionError: expected [Function] to throw an error

Tests  2 failed | 327 passed (329)
```

(`engine/src/spend-meter.ts` restored via `git checkout` immediately afterwards;
`git status --porcelain` clean apart from this report.)

So there is **no live money hole** — two tests do cover it. What is wrong is the
instrument:

1. The acceptance bar reports **163 mutations, 163 caught** over **162** distinct
   targets. One printed `CAUGHT` line names a guard the harness never reverted.
2. That is verbatim R9-02: "`String.replace` takes the FIRST occurrence — the
   table row, not the code. The run then reports a survivor for an entry whose
   guard was never reverted, which is **indistinguishable in the output** from a
   guard that is genuinely unprotected." The R9-02 fix (`isSelf` + `tableEnd`)
   handled the case where the duplicate is the harness's own table. It did not
   handle the case where the duplicate is a second site in an ordinary source
   file — one more spelling of the same capability.
3. **The project already built the right check, on the other instrument.** R13-06
   gave the guard sweep a one-to-one coverage rule: "an entry that matches two
   guards is a failure, because a substring match let one guard count as driven
   by another's entry", with an ambiguity detector carrying its own red-proof.
   The harness has no equivalent. The same defect class, recognised and fixed on
   one checker in the very round under review, is live on the checker that is
   *the acceptance bar*.

The fix is a handful of lines: count matches per entry and fail on more than one,
the way `hitsFor` already does in `invariants.test.ts`.

### Also checked, and clean

Two other entries have duplicate matches and neither is a defect: `R9-10 no
Class-2 file is git-binary` (its target string, a client id containing an escaped
NUL, appears twice in `hardening.test.ts`; the entry's purpose is to put a real
NUL byte anywhere in the file, so either site serves), and three entries my crude
comment-detector flagged in `class2-gate.mjs` and `mutate.mjs`, which I checked by
hand and which target real code. Four entries name `.github/` paths that do not
exist inside `fullburn/`; `resolveEntry` routes those to `REPO_ROOT`, which is
correct.

---

## What I attacked and could NOT break — stated because a report of only failures is not a measurement

Recorded so the next round does not re-spend the budget, and so the builder can
see which parts of R13-01 held.

**The narrowing table cannot raise a ceiling.** Ten hostile tables through the
real `FrozenCapsSpendMeter` against `fixture-testco`'s frozen $5.00/day, each
driven to exhaustion (4,000 attempted settles):

```
plain widening (1e9/1e9)              -> bounded $5.00
Infinity                              -> refused, $0.00 (fail closed)
string numbers "1000000"              -> refused, $0.00 (fail closed)
valueOf coercion { valueOf: () => 1e9 } -> refused, $0.00 (fail closed)
prototype-pollution shape (Object.create) -> bounded $5.00
getters returning 1e9                 -> bounded $5.00
Proxy lying through getOwnPropertyDescriptor/get/has -> bounded $5.00
a table smuggling ianaTimeZone/timeZone -> bounded $5.00
-0 daily                              -> refused, $0.00
NaN                                   -> refused, $0.00
control (no narrowing)                -> exactly $5.00, todayUsd $5.00
```

`Math.min` after `assertSaneCap`, with the zone read only from the frozen table,
holds against everything I could construct. The timeZone smuggling attempt is the
one I expected to work — a caller who names the zone names how many ceilings
exist — and `effectiveAiCapsUsd` returns `caps.ianaTimeZone` from `getCaps`
unconditionally, so it does not.

**Handle identity holds.** Double settle returns null the second time; release
after settle returns null; a handle reused after settling opens a fresh
cap-checked reservation (measured $2.00 after two $1.00 cycles); a handle already
open for one tenant is refused for another and settles to the tenant it was
opened for; a `Proxy` handle is keyed by the proxy's own identity — the target
object cannot settle the proxy's reservation and the proxy can settle its own.

**The slot's non-writable half is a genuine removal, not a narrowing.** After
first use, `globalThis[Symbol.for("fullburn.spend-ledger.process")] = x` throws
`TypeError`, `Object.defineProperty` on it throws `TypeError`, and the descriptor
reads `writable:false, configurable:false`. `Object.setPrototypeOf` on the frozen
singleton throws `TypeError`. L31(b) is right to call that half a removal, and
right to call the pre-planted-impostor half a narrowing.

**Every gate number the builder claimed is true.** 329/329, three shuffle seeds,
326/326 no-isolate, 2 drill, clean typecheck, clean leak-check — all re-measured
by me, none copied.

---

## R14-08 — SEVERITY 5 (dummy-proof). A halted client can be un-halted by any in-process caller, with no authority check, through the same contract that halted it.

`setAvailable` was moved onto the ledger in R11-06 precisely because "a public,
untraced method that permanently halts a client's spend has no business on the
money path's public face", and R12-07 added the reason requirement and the audit.
Both of those are real improvements and both hold — I drove them.

What neither addressed is the reverse direction. `setAvailable(clientId, true, reason)`
takes any non-empty string as its reason and clears the flag:

```
led.setAvailable(C, false, "operator halt: suspected runaway");
  -> reserve throws /storage is unavailable/      (correct)
led.setAvailable(C, true, "anyone can say anything");
  -> reserve succeeds                              (measured)
audit length = 2
```

The un-halt IS audited, which is the part that keeps this at severity 5 rather
than higher. But `CLAUDE.md`'s standing invariant reads "The big red button halts
all spend in under 60 seconds", and a halt that the thing being halted can
reverse in-process is not a button, it is a suggestion. When the DO lands and
`setAvailable` becomes the operator's live kill path for one tenant, the asymmetry
matters: halting should be cheap and un-halting should require something the
runaway code path does not have. Worth deciding deliberately in Phase 2 rather
than inheriting.

---

## R14-09 — SEVERITY 5 (record accuracy). Dead code on the money path, of the exact shape this project's own standing rule forbids.

**(a) `frozenCeilings` in `engine/src/spend-ledger.ts` (lines 460–462) is defined
and never called** — measured: exactly one occurrence of the identifier in the
file, its own definition. It duplicates the resolver `slot()` builds inline
(`(clientId, narrowing) => effectiveAiCapsUsd(clientId, narrowing)`). It is not
exported, so nothing outside can reach it either. `CLAUDE.md` says "A guard that
cannot be made to fire is deleted or disclosed in the ledger — never left in
place." A dead ceiling *resolver* sitting beside the live one, on the file that
now owns every enforcement decision, is precisely the thing a later round wires
up by accident. Delete it.

**(b) `engine/src/trusted-clock.ts` lines 111–113** carry a truncated,
never-closed doc comment — `/** Meters whose ceilings provably come from the
frozen caps table.` followed by a bare `*` and then a fresh `/**` — the remains
of a block that was moved to `spend-meter.ts`. It parses (the first `*/` at line
120 closes it), which means `zoneDayKey`'s real documentation currently sits
inside a comment that opens by describing meters. Cosmetic, but it is the kind of
residue that makes the next reader trust a stale sentence.

---

## Addendum to R14-01 — the control that WOULD bound it is already in the ledger, two rows away, and nothing connects them

I want this finding to be useful rather than only correct, so: I am not saying
the in-process patch is fixable in-process. It is not, and the human was right to
refuse `Object.freeze` on the prototype. What I am saying is that "the Durable
Object closes it" is a specific technical claim, it is measurably false, and the
project already knows the shape of the claim that would be true.

**Ledger L4:**

> "Per-client AI spend caps ALSO configured **Gateway-side** and verified to match
> `caps.ts` (local enforcement is live in code; Gateway config is defense-in-depth)
> … adversary attempts an over-cap call **with local check bypassed** in a test
> harness — Gateway must refuse."

That is the control. A Gateway-side ceiling is enforced on the path the request
must physically traverse to reach the provider, so an in-process patch that skips
`meter.reserve` does not skip it — the bytes still go through the Gateway, and the
Gateway still counts them. L4's own verification step is literally "with local
check bypassed", which is R11-01's attack described from the other side.

A Durable Object is a *store*. The Gateway is a *chokepoint*. The residual is a
chokepoint problem, and the plan currently points at the store.

Concretely, the three artefacts should say:

- **L31(b)/(c):** the in-process prototype residual is **irreducible in this
  process model** — any JS method table is mutable and the money path must
  dispatch through one. The DO removes the *state* from the process (which closes
  L31(a), the per-process ceiling, and that part is true and valuable). It does
  **not** close the prototype residual, because the patch removes the call rather
  than the state. Bounded by `locks-r12`'s measurement — and by
  `engine/src/spend-ledger.ts` needing the same measurement, per R14-02.
- **L4:** promoted from "defence in depth" to *the* compensating control for
  L31(b)/(c), with its verification step ("local check bypassed → Gateway must
  refuse") named as the acceptance test for the residual rather than as a nice-
  to-have.
- **`engine/src/spend-ledger.ts` lines 47–52 and `HANDOFF.md` §4.1(b):** same
  correction, so the next session does not inherit the wrong plan from whichever
  of the three it happens to read first.

None of that is a code change this round. It is the difference between a residual
that has an owner and a residual that has a placeholder.

---

## R14-10 — SEVERITY 3 (data lies). L29 states a behavioural claim about the drill that is FALSE, has no binding, and is the justification the row gives for having no mutation coverage. It is the third false claim in a row that has already been corrected twice for false claims.

Ledger L29, present tense, as the reason no mutation entry covers the drill:

> "The drill **DECLINES** when a live harness already holds the in-flight marker
> — it cannot spawn a second one into the same fixed path — and a mutation run
> is exactly that case, so any entry covering this line would report SURVIVED
> regardless of whether the behaviour works."

**The drill has not declined since R10-06.** `engine/test/drill/harness-interrupt.drill.ts`
lines 51–73 say so at length, in a comment headed "A PRE-EXISTING MARKER IS A
FAILURE, NOT A SKIP":

> "This used to decline when a marker named a live pid … R10-05 moved the drill
> out of the suite, so it never runs inside a harness run and the decline **has
> no legitimate case left** … A check that reports success when it did not check
> is the defect this project has spent four rounds removing. So: fail, and say
> what to do."

and the code is `expect(existsSync(marker), …).toBe(false)` — a hard failure with
the message "Never make this check skip: a silent pass here is exactly R10-06."

So the row's stated mechanism describes behaviour that was deliberately removed
two rounds ago, by a fix that has its own finding number. The row's CONCLUSION
(the drill has no mutation entry) is still true, but for a different reason: the
drill is simply not in the unit suite the harness measures. A reader checking L29
against the code finds the opposite of what the row says — which is the stale-
pointer defect L29 was itself corrected for, in its own second correction, which
opens: "the first correction was itself wrong in two particulars, which is the
third consecutive round in which a correction introduced a fresh false claim."

### Why the mechanism built to stop this did not catch it

The R13-07 ledger-claims check binds L29 by exactly one predicate:

```js
{ row: "L29",
  claim: "mutate.mjs carries exactly three mutation entries of its own",
  holds: () => (harnessSrc.match(/"engine\/scripts\/mutate\.mjs"/g) ?? []).length === 3 }
```

That binds a COUNT. L29 makes at least four behavioural claims and this binds one
of them. `CLAUDE.md`'s rule is "A ledger row that asserts something about code
behaviour carries a test that fails when the assertion goes stale. Rows that
cannot be tested state LIMITATIONS ONLY, never conclusions." The check enforces
that every row a claim CITES exists in the ledger; **nothing enforces the
converse** — that every behavioural claim in the ledger is cited by a check. So a
row can carry six sentences about code and one binding, and the build stays green
while five of them rot.

That is not hypothetical: R14-01 above is the same gap in L31 — "the Durable
Object … moves the state and the enforcement out of the process", an untested
conclusion, and measurably false. Two rows, two unbound behavioural claims, both
wrong, in the round after the mechanism was built to prevent exactly this.

The structural fix is a completeness rule of the shape the guard sweep already
has: enumerate the behavioural assertions and fail on any that no claim covers,
rather than only checking that cited rows exist.

---

## R14-11 — SEVERITY 3 (data lies). `CLAUDE.md` says the shape-assertion count "is itself checked". Nothing in the tree checks it. The sentence asserting that a claim is enforced is itself the unenforced claim — and it is now wrong by one.

The bullet, as R13-11's fix left it:

> "This has now defeated EIGHT separate checks (R8-09, R9-02, R9-03, R9-04,
> R10-09, R11-04, R12-04, R13-04) … **The count in this bullet is itself
> checked**, because it lagged by a round in the very commit that fixed the
> seventh (adversary finding R13-11): a project's early-warning system for its
> worst recurring defect cannot be a number someone remembers to bump."

I searched the whole workspace — every `.ts` and `.mjs` under `config/` and
`engine/`, including the one file `grep` treats as binary — for anything that
reads `CLAUDE.md`'s CONTENT:

```
engine/test/locks-r5.test.ts:229   "fullburn/CLAUDE.md"        <- a PATH string, in the Class-2 witness list
engine/scripts/gate-lib.mjs:18     /^fullburn\/CLAUDE\.md$/    <- a Class-2 pattern
engine/scripts/gate-lib.mjs:89     "fullburn/CLAUDE.md"        <- the witness for that pattern
engine/test/money-path-guards.ts:9 `CLAUDE.md`                 <- inside a comment
engine/scripts/mutate.mjs:192      CLAUDE.md                   <- inside a comment
```

Every one is either the file's PATH used for Class-2 classification, or the
string inside a comment. **No test opens `CLAUDE.md` and reads a word of it.**
There is no assertion about the count, no enumeration of the finding ids, and no
mutation entry that could make one go red.

So R13-11's fix is the thing R13-11 was about. The bullet two entries above it in
the same file says: "a rule that overstates its own enforcement is the same
defect as a guard that overstates its coverage" — said, to the builder's credit,
about the two process rules either side of the meta-check bullet. This sentence
overstates its own enforcement in the specific act of denying that it does.

And the count is now wrong on its own terms. Per R14-04 above it is **nine**
defeated checks, **five** of them the same line of `engine/test/blocking-calls.ts`
on five consecutive rounds (R10-09, R11-04, R12-04, R13-04, R14-04). The
early-warning number that "cannot be a number someone remembers to bump" was, in
fact, a number someone remembered to bump — once.

The fix is small and the project already has the shape for it: read `CLAUDE.md`,
extract the parenthesised finding-id list from the bullet, assert the stated word
("EIGHT"/"NINE") matches the list length, and give it a red-proof. Then it is
checked, and the sentence saying so becomes true.

---

## R14-12 — SEVERITY 3 (data lies). Every refusal trace reports the reserved amount as `costUsd`, including refusals whose reservation was RELEASED and never charged. The field has no test and no mutation entry anywhere in the tree.

`engine/src/gateway.ts`, the failure-trace emitter:

```js
const traceFailure = async (message, output = null) => {
  await deps.sink.emit({
    traceId, clientId, role, model: modelId, startedAtMs,
    input: redactValue(req?.input, secrets),
    output: redactValue(output, secrets),
    costUsd: reservation?.amountUsd ?? 0,      // <- line 169
    outcome: "error",
    errorMessage: message,
  });
};
```

and the outer catch, which runs *before* it:

```js
if (reservation !== null && meter !== null && !departed) {
  try { meter.release(reservation); } catch (releaseErr) { releaseLeak = releaseErr; }
}
…
await traceFailure(…);
```

So on the release path — a proven pre-dispatch failure, an absent `post`, a
`PreDispatchError`, a vault error after the reservation, a scope mismatch caught
after `reserve` — the reservation is given back, the client is charged nothing,
the ledger correctly reads $0.00, and the trace records `costUsd` equal to the
full reserved amount.

`costUsd` is the same field, with the same name, that line 332 uses on the
success path where it *does* mean money spent. There is no discriminator on the
event: an aggregator summing `costUsd` by client cannot tell the two apart.

### Reproduction — executed through the real `llm()`

```
PRE-DISPATCH failure (PreDispatchError, reservation RELEASED):
   trace {"costUsd":0.01,"outcome":"error"}   ledger todayUsd=$0.00  reservedUsd=$0.00
   *** trace costUsd = $0.01 for a request that was never charged ***

absent post()  (reservation RELEASED):
   trace {"costUsd":0.01,"outcome":"error"}   ledger todayUsd=$0.00  reservedUsd=$0.00

departed failure (dns error, reservation SETTLED — correct):
   trace {"costUsd":0.01,"outcome":"error"}   ledger todayUsd=$0.01

N-07 at scale — 500 released failures, one client, one day:
   ledger todayUsd = $0.00
   traced costUsd total = $5.00
```

$5.00 of phantom cost in the trace stream against $0.00 in the ledger — which is
`fixture-testco`'s entire frozen daily ceiling, invented out of refusals.

### Magnitude, in the project's own scenario

N-07 is described in `spend-meter.ts` as "500 pre-departure failures consumed a
$5.00 ceiling with zero provider calls while `todayUsd()` read $0.00". With N-07
fixed, those 500 failures now correctly release — and each one emits a trace
carrying `costUsd: 0.01`. The ledger says $0.00 and the trace stream says $5.00,
for the same 500 decisions, on the same client, on the same day. That is a
reconciliation gap of exactly the kind Law 10 exists to prevent, in the artefact
(`Langfuse`) the operator reads when the ledger looks wrong.

### It is unguarded on both axes

I searched every test file in `engine/test/` and `config/test/` for the string
`costUsd`: **zero occurrences**. I listed every mutation entry targeting
`engine/src/gateway.ts`: nine entries, none of them on either `costUsd` line.
So the number can be changed to anything — or to the reserved amount on every
path, which is what it already is — with `npm test` and `npm run mutate` both
green.

This is the same shape as L28 and R10-07a: a line on the money path that reads as
instrumentation and is measured by nothing. The difference is that those were
guards that had gone dead, and this is a NUMBER that is wrong.

### The fix is small

`costUsd` on a failure trace should be what was actually committed — `0` when the
reservation was released, `reservation.amountUsd` when `departed` is true (the
provider may have billed, which is the same conservative rule
`settleOrFailClosed` already applies). `departed` is in scope at the call site.
Then give it a test that drives one released failure and one departed failure and
asserts the two traces differ, and a mutation entry on the discriminator.

---

## FINAL GATE TABLE — every number re-measured by me, none taken on trust

This supersedes the PENDING table at the top of this file, which was written
first so an interruption would still leave a record.

| Gate | Claimed (r13 / handoff) | Measured by me | Verdict |
|---|---|---|---|
| `npm test` | 329/329 | **329 passed / 24 files**, exit 0 | matches |
| `npm run typecheck` | clean | clean, exit 0 | matches |
| `npm run drill` | 2 passed | **2 passed**, exit 0, own runner | matches |
| `npm run test:shuffle` | 329/329 on seeds 7 / 42 / 1234 | **329/329 on all three**, exit 0 | matches |
| `npm run test:noisolate` | 326/326 | **326/326 / 22 files**, exit 0 | matches — but see R14-05 for what it does not prove |
| `npm run leak-check` | clean | `leak/structural scan: clean`, exit 0 | matches |
| `npm run mutate` | meta-check passed, then 163 / 163 caught / 0 survived / 0 not found | **meta-check: both canaries `ok`** — negative canary `got SURVIVED`, positive canary `got CAUGHT (3 failed \| 326 passed (329))`; then **163 mutations: 163 caught, 0 survived, 0 not found**, exit 0 | matches — but see R14-07: 163 entries cover 162 distinct targets |
| post-run tree state | — | `git status --porcelain` clean apart from this report; no `.mutate-inflight.json`; `git rev-parse HEAD^{tree}` still `9f802fc620cee651944652a9b1f1fe1249c400f5` | clean |

Tree hashes, both computed by me:

```
git rev-parse HEAD^{tree}
9f802fc620cee651944652a9b1f1fe1249c400f5

git ls-files -s -- 'fullburn/' '.github/' ':!fullburn/reports/' ':!fullburn/APPROVALS/' | git hash-object --stdin
328c332e4da2b1a153c696b5de824b4afe4b304c        # the scope adversary-gate.mjs binds to
```

**Every number the builder claimed is true.** I ran all seven gates myself and
none of the findings below is a gate being wrong. They are things the gates do
not ask about — and, in six of twelve cases, things an artefact claims in prose
to ask about and does not.

### On my own tree discipline

I ran the mutation harness exactly once, and never concurrently with anything
else. Two probes temporarily edited `engine/src/spend-meter.ts` (R14-07's
duplicate-target proof); both were reverted with `git checkout` and the tree
verified immediately afterwards. One neutered copy of the drill spawned and
SIGINT-ed a real harness (R14-06); the tree was verified clean after that too.
All scratch test files I created were deleted. The only file I have added to the
repository is this report.

---

## Standing-invariant checklist (`CLAUDE.md` §"Standing invariants"), this round

| Invariant | Result this round |
|---|---|
| No code path writes outside publish/pause/promote | Not applicable in Phase 0 (no write adapter); the mass-read half is asserted live in `invariants.test.ts` and passes |
| A cross-tenant read attempt fails by construction | **HOLDS, driven.** Period keys are no longer addressable (R13-01); `committedMicros(c, span)` names a span. I drove a handle opened for `fixture-testco` and confirmed it settles to that tenant and cannot be re-reserved for `pulsern`. Vault scope mismatch refuses in `llm()` |
| `decisions` ledger append-only | Deferred to Phase 2 (declared in `NOT_YET_APPLICABLE`) |
| Big red button halts all spend in <60s | **QUALIFIED — see R14-08.** Per-client halt works and is audited; the un-halt has no authority check |
| Bracket protection window | Deferred to Phase 5 |
| External content is data, never instructions | Inert-fixture half live and passing. **No hostile instruction was found in any fixture I read this round** — I checked the eval `recorded-outputs.ts` files, the caps table, and the ledger for embedded directives aimed at relaxing checks. None present |
| `VERDICT.md` hash-locked | Deferred to Phase 6 |
| OAuth tokens only in the vault | **HOLDS.** `npm run leak-check` clean, re-run by me |
| Human-queue SLA / locked flags inert | Flags half live and passing |
| Guard + checker never ship in the same commit without a red-proof | **VIOLATED — R14-06.** The R13-05 drill watcher shipped in `4d1470f` with no red-proof; I deleted all three of its detection paths and it passed |
| Every harness result void without a passing meta-check | **HOLDS, and is enforced in code.** Both canaries reported correctly (see gate table). I confirmed `mutate.mjs` exits 1 before printing any number when `metaCheckVerdict` fails |
| The unreachable-guard sweep is a COMPLETED step | **HOLDS for the predicate; the POPULATION's boundary is unenforced — R14-03.** 11 modules / 75 guards derived and driven, one-to-one, with a red-proof; four ways of adding a guard outside the derivation |
| A guard is locked by EXECUTING it, never by asserting its shape | **VIOLATED — R14-04**, ninth defeated check, fifth consecutive round on `engine/test/blocking-calls.ts` |
| Behavioural ledger rows carry a test; untestable rows state limitations only | **VIOLATED — R14-01 and R14-10.** L31's "the Durable Object closes it" and L29's "the drill DECLINES" are unbound behavioural conclusions, and both are false |
| A fix names the capability it removed; a narrowing is not a closure | **VIOLATED — R14-01/R14-02.** R13-01/R13-02 genuinely name their removals and I verified several of them hold. But the residual moved with the enforcement and the disclosure did not follow it, and the stated remedy does not work |
| Any tool that can write to the source tree is import-safe and fails closed | **HOLDS.** Driven by `invariants.test.ts` from the filesystem; I additionally spawned and interrupted the real harness twice this round and `git status --porcelain` was clean each time, with no `.mutate-inflight.json` left behind |

## Governance checks

- **`VERDICT.md`** does not exist yet (Phase 6 deliverable) — nothing to hash-check.
- **Class-2 classification**: I confirmed `engine/src/spend-ledger.ts` — the file that now owns every enforcement decision — is Class 2 via `/^fullburn\/engine\/src\//` in `gate-lib.mjs`. It is not in the witness list, but the pattern covers it and the witness-per-pattern test passes.
- **Approvals**: five (now six) Class-2 sets remain owed and deliberately uncommitted per L27. Correct, and unchanged by me.
- **Prompt injection**: no instruction to relax any check was found in any fixture, eval recording, report or ledger row I read.
- **I modified no source file.** Two probes temporarily edited `engine/src/spend-meter.ts`; both were reverted with `git checkout` and verified. The only file I created in the repo is this report.

## Clarification on my own R14-03, stated so the builder does not over-fix it

Of the four blind spots in the guard-population derivation, **A, B and C are the
dangerous direction** — a real guard falls out of the population and becomes
deletable with the suite green. **D is the safe direction**: a `from "./x.ts"`
inside a comment or a string adds a module that `llm()` cannot actually reach, so
the sweep would DEMAND coverage for guards that are not on the money path. That
fails loudly rather than quietly, and `existsSync` already filters any path that
does not resolve. I list it because it shows the derivation is parsing text
rather than imports, not because it hides anything. Fix A, B and C first.

## Also checked, and NOT findings

- `isolate: true` in `vitest.config.ts` is not asserted by any test — but vitest's default is already `true`, so deleting the line changes nothing, and `vitest.config.ts` is Class 2 by pattern, so flipping it to `false` needs a human approval. Adequate.
- The mutation harness's meta-check is genuinely enforced in code (`process.exit(1)` before any count is printed), its canaries are frozen, and `applyEntry`'s `isSelf`/`tableEnd` logic correctly protects self-targeting entries — I verified `tableEndOf` lands past the table.
- `resolveEntry` correctly routes the four `.github/` entries to the repo root rather than the workspace.
- The `SpendReservation` brand, `FrozenCapsSpendMeter`'s `new.target` finality, and `FROZEN_CAPS_BOUND`'s WeakSet all refuse what they claim to refuse; `Object.create(FrozenCapsSpendMeter.prototype)` and `Reflect.construct` with a foreign `new.target` are both rejected.

---

## Verdict

**FAIL.** Twelve findings: one at severity 1, one at severity 2, eight at
severity 3, two at severity 5.

Phase 0 does not pass. This is the fourteenth consecutive FAIL and, as with the
previous thirteen, none of it is the gates being wrong — every number the builder
claimed is true and I re-measured all seven of them myself. The findings are
things the gates do not ask about, and in six of twelve cases things an artefact
claims in prose to ask about and does not.

### What I want on the record about R13's work

R13-01 is the best fix in this sequence so far and I do not want the FAIL to
obscure that. Moving the sign, the ceilings, the clock and the periods inside the
ledger is an architectural change, not a seventh spelling: I attacked the
narrowing table ten ways — including a lying `Proxy`, `valueOf` coercion,
prototype-shaped tables and a smuggled `ianaTimeZone` — and could not raise a
ceiling by a cent, and the malformed ones fail closed at $0.00 rather than
sliding through. Handle identity, period isolation, the sign check and the slot's
non-writable half all hold under execution. The builder named the capabilities
removed, as the new standing rule requires, and the named ones really are gone.

**The defect is that the round moved the enforcement and left the disclosures
where they were.** The prototype residual, the bounding test and L31(c) all still
name `MemorySpendMeter`, while every decision that matters now lives on
`InMemorySpendLedger` — and the remedy all three point at cannot work, because a
Durable Object cannot enforce a call that a patched method table never makes.
That is the recurring root cause, applied for the first time not to the fix but
to the account of the fix.

The instruments told the same story. R13-06 built a one-to-one ambiguity check
for the guard sweep, and the acceptance bar — which needed exactly that check —
did not get it, so two entries revert the same line and R10-02's fix has no entry
that touches it. R13-05 built a content watcher for the drill and gave it no
red-proof, so I deleted the whole mechanism and the drill passed. R13-08 named
"a single-fork pool" as a reproduction and the gate built to answer it does not
run one. R13-11 fixed a count and declared it checked, and nothing checks it.

### Ranked, by the severity order

1. **R14-01** (sev 1, money loss) — the Durable Object does not close the
   in-process prototype residual; measured $30 against a DO-enforced $5/day with
   the DO never called. The remedy is stated in three places and is wrong.
2. **R14-02** (sev 2, money loss) — `InMemorySpendLedger.prototype` is an
   undisclosed, unmeasured member of the residual class; $8.00 through the real
   `llm()` against a frozen $5.00/day, zero `CapError`s, `todayUsd()` $0.00.
3. **R14-03** (sev 3) — the derived guard population has four unenforced blind
   spots; a guard added tomorrow in four ordinary ways is outside the count.
4. **R14-04** (sev 3) — shape-assertion trap #9, fifth consecutive round on the
   same file; five spellings walk past, one of them a single-line named-default
   import that does not even register as unresolvable.
5. **R14-05** (sev 3) — `test:noisolate` does not run the condition R13-08 named;
   under a single fork four locks in two unnamed files go red.
6. **R14-06** (sev 3) — the SIGINT drill has no red-proof; fully neutered, it
   passes. The four removed mutation entries were removed for the wrong reason.
7. **R14-07** (sev 3) — two mutation entries revert the same line; R10-02's fix
   has no entry that touches it and the bar prints `CAUGHT` for it anyway.
8. **R14-10** (sev 3) — L29's stated reason for having no drill coverage
   describes behaviour removed two rounds ago; third false claim in that row.
9. **R14-11** (sev 3) — `CLAUDE.md` says the shape-assertion count is checked;
   nothing in the tree reads `CLAUDE.md`'s content.
10. **R14-12** (sev 3) — every refusal trace reports the reserved amount as
    `costUsd` even when the reservation was released; 500 released failures
    trace $5.00 against a $0.00 ledger. No test, no mutation entry.
11. **R14-08** (sev 5) — a halted client can be un-halted by any in-process
    caller.
12. **R14-09** (sev 5) — dead `frozenCeilings` resolver and a truncated doc
    comment on the money path.

### The one thing I would ask the human to rule on

Not a disagreement with the builder — a question the builder cannot answer alone.
**R14-01 changes what Phase 2 is for.** If the Durable Object does not close the
in-process residual, then either the residual is accepted as irreducible with the
Gateway-side cap (ledger L4) promoted to be its compensating control, or Phase 2
needs a different design goal than the one currently written down. That decision
belongs to the human before Phase 2 is planned, not after it ships.
