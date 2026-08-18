# ADVERSARY REPORT phase0.r10
Verdict: FAIL
verified-tree: 02f7d4aa88fc6358e8ee748fee31ff7cde5ee5cb

Round 10, same-family review of Phase 0 at commit `80cf983` on branch
`claude/fullburn-engine-spec-r7v5lg`. Every number below was executed in this
sandbox against disposable clones under the session scratchpad. The working tree
at `/home/user/New-skills-` was verified byte-identical to `HEAD` before and
after every experiment; its verified-scope hash is the one bound above.

**A methodological correction I owe this report before its numbers.** My first
disposable copies symlinked `node_modules` back into the real checkout. npm
workspace links are relative, so `@fullburn/config` resolved back OUT to the real
repository's `config/` — every mutation of `config/src/*` in those copies was a
no-op and printed a spurious `*** SURVIVED ***`. Two candidate severity-1
findings (`r4-lock8 WeakSet brand`, `R7-02 zone travels with the ceilings`) died
there: I could see the mutated byte on line 236 of `caps.ts` and the runtime
still read the original value. Every measurement below was re-taken in a copy
with its own `node_modules`, where `@fullburn/config` resolves inside the copy,
verified explicitly with `realpathSync`. I record this because an adversary who
reports an artifact as a finding does to the builder exactly what R9-01 did to
the human.

## Gate state — independently re-run, not taken on trust

| Command | Claimed | Observed |
|---|---|---|
| `npx vitest run` | 292 passed | **292 passed, 19 files** ✓ |
| `npm run typecheck` | clean | **clean** ✓ |
| `npm run leak-check` | clean | **clean** ✓ |
| `npm run e2e` | passes | **1 passed** ✓ (with `PLAYWRIGHT_CHROMIUM_PATH`) |
| `npm run mutate` | meta-check passed, 115 caught / 0 survived / 0 not found | **meta-check passed (both canaries), 115 mutations: 115 caught, 0 survived, 0 not found** ✓ — full table, run to completion, tree clean and marker gone afterwards |
| tree hash | `02f7d4aa…` | **`02f7d4aa88fc6358e8ee748fee31ff7cde5ee5cb`** ✓ |

**Every number the builder claims is true, and this time the mutation number is
also capable of being false — I watched it refuse to report one.** That is a real
and large improvement over r9, and it is worth saying plainly before the findings
that follow.

One caveat on how I obtained the suite number: `npx vitest run` on this tree
spawns the mutation harness against the working tree (R10-05), so I never ran it
in `/home/user/New-skills-`. Every suite figure above comes from a clone.

On a loaded machine I also watched the meta-check correctly refuse to report a
number (`negative canary … got CAUGHT` → `HARNESS RESULT IS VOID`, exit 1). It is
also, as R10-01 shows, held in place by nothing at all.

## Ranked findings

| ID | Severity | Domain | Gate consequence |
|---|---:|---|---|
| R10-01 | 1 — money loss (verification) | Meta-check | The meta-check is enforced by nothing. Deleting it whole leaves 292/292, typecheck clean, leak-check clean; no test names it and no mutation entry covers it. The rule every other number now depends on is prose. |
| R10-02 | 1 — money loss | Cap enforcement | `settle` redefined to release on a GENUINE `FrozenCapsSpendMeter` still passes `isFrozenCapsMeter`. Executed through the real `llm()`: 5,000 dispatches, **$50 against a frozen $10/day and $200/month**, `todayUsd()` and `monthUsd()` both reading $0.00. |
| R10-03 | 1 — money loss | Cap enforcement | The "bound" clock is the mutable global `Date.now`. Executed: 3,000 dispatches, **$30 against a frozen $200/month**, no `CapError`. R9-05 reproduced through the type built to close it. |
| R10-04 | 1 — control plane | CI trigger | `paths-ignore` is parsed as if it were `paths`. One ordinary YAML line makes the R9-06 lock PASS while the workflow runs on **no pull request at all** — adversary-gate and class2-gate never execute. |
| R10-05 | 1 — money loss (verification) | Standing invariant | `npm test` now spawns the real mutation harness against the working tree, rewrites `engine/src/spend-meter.ts`, and orphans a vitest process tree per run (measured: 0 → 2 processes at ~90% CPU, permanent). The unit suite has become a tool that writes to the source tree, and the invariant's enumeration cannot see it. A failing drill leaves a money-path file mutated on disk. |
| R10-06 | 3 — data lie | Verification integrity | The R9-03 drill — the only behavioural proof of the interrupt property, deliberately entry-less (L29) — is silently disabled by any file at the fixed marker path naming a live pid, and it reports **PASS**, not skip. The R9-09 `.gitignore` removed the one thing that used to notice such a file. |
| R10-07 | 3 — data lie | Unreachable guards | The sweep, run to completion. Four dead guards — one NEW this round, on the money path, undisclosed and untested — plus verdicts on L28 and L29. |
| R10-08 | 3 — data lie | Standing invariant | R9-07 is one third fixed: the write-API regex widened, the enumeration still walks one directory and one extension and asserts membership rather than a count. Its own comment is falsified by R10-05. |
| R10-09 | 3 — data lie | The three new rules | All three are prose. Rule 3 in particular: the four shape assertions in `invariants.test.ts` all pass against a behavioural revert of the property they name — the fifth instance of the trap, executed. |
| R10-10 | 3 — data lie | Harness output | The per-entry evidence line is now garbage (`\| 1 ⎯⎯⎯⎯⎯⎯⎯`). The R9-03 async fix merged stderr into the buffer the summary regex reads, so the exact diagnostic that EXPOSED R9-01 no longer exists. |

---

## R10-01 — the meta-check is guarded by nothing (severity 1)

**Attacked:** assignment 2 — "can a run report a number without the meta-check
having passed."

Yes: delete the meta-check. It is a `const META = [...]` array and a `for` loop
inside `mutate.mjs`'s CLI block. Nothing else in the repository refers to it.

```
$ grep -rl "meta-check" fullburn --include=*.ts --include=*.mjs --include=*.md
fullburn/engine/test/integration/gate-cli.test.ts   <- a comment, in prose
fullburn/engine/scripts/mutate.mjs                  <- the thing itself
fullburn/CLAUDE.md                                  <- the standing rule, in prose
```

**Executed** — the whole `META` array, its loop, and both `HARNESS RESULT IS
VOID` exits removed (3,001 bytes), nothing else changed:

```
$ npx vitest run       Tests  292 passed (292)
$ npm run typecheck    (clean)
$ npm run leak-check   leak/structural scan: clean
```

No mutation entry names it either — I read all 115. `npm run mutate` then prints
`115 mutations: 115 caught, 0 survived, 0 not found` and exits 0 with the
meta-check gone, and the `mutation-harness` CI job goes green.

**Why this is the round's first finding.** CLAUDE.md now says "Every harness
result is void unless preceded by a passing meta-check", and the same file says,
two bullets above, "A guard and its checker never ship in the same commit without
a test proving the checker can still go red." The meta-check shipped with **no
checker at all** — not a shape check, not a driven one, not an entry. It is the
single point on which every other number in this round's gate state now rests,
and it is one deletion from gone with every gate green. That is R8-09's shape
(the acceptance bar that was not a stage), one level up.

I want to be exact about what is and is not wrong here. The meta-check itself is
well built. The negative canary is genuinely behaviour-free (a comment appended
to `const MICROS_PER_USD = 1_000_000;`), the positive canary reverts a guard that
a real test drives, a moved target text is `HARNESS RESULT IS VOID` rather than a
silent skip, and I watched it correctly void a run under CPU starvation. The
defect is that nothing holds it there.

**Required correction:** drive it. Extract the canary loop into `mutate-lib.mjs`
as a pure function over an injected `measure`, unit-test that (a) a canary
returning the wrong answer produces `ok: false`, and (b) `found: false` produces
`ok: false`; assert in `locks-r7` that the runner calls it BEFORE the first
`MUTATIONS` entry, by executing a harness whose canaries are stubbed to fail and
asserting exit 1 with no summary line. Add a mutation entry that deletes the
call. A shape check on `mutate.mjs` will not do — the table contains its own
targets as string literals, which is the trap this repo has now lost five checks
to.

---

## R10-02 — `settle` rewired to release breaches the cap through the production meter (severity 1)

**Attacked:** assignment 5 — "can $200/month, $10/day … be exceeded by ANY
route", against `isFrozenCapsMeter`'s deliberate asymmetry.

`isFrozenCapsMeter` pins `reserve` to `MemorySpendMeter.prototype.reserve` and
deliberately does not pin `settle`, `release`, `todayUsd` or `monthUsd`. The
source argues the asymmetry at length and states the safety property it rests on:

> A `settle` that throws or does nothing cannot mint headroom: the reservation
> simply stays open, and `reserve` counts open reservations against the same
> ceiling. So pinning `reserve` is exactly Law 2's requirement.

The enumeration is incomplete. A `settle` that **releases** mints headroom on
every call. `llm()` calls `settleOrFailClosed` on the departed path, which calls
`meter.settle(reservation)` — and `requireReservingMeter` binds whatever `settle`
is on the instance at that moment.

**Executed** against the real `llm()`, real `ROLE_BINDINGS`, real vault, real
frozen caps, real client `pulsern` ($10/day, $200/month, America/New_York), with
a genuinely-constructed `FrozenCapsSpendMeter`:

```js
const meter = new FrozenCapsSpendMeter();
const realRelease = meter.release.bind(meter);
Object.defineProperty(meter, "settle", { value: (r) => realRelease(r) });
```

```
A1 isFrozenCapsMeter after patching settle: true
A1 dispatched: 5000   committed today: $0.00   month: $0.00   first error: NONE
A1 real dollars dispatched at $0.01/call: $50.00  against a frozen $10/day + $200/month
```

Five thousand requests reached the transport. Nothing refused. The loop stopped
at 5,000 because that is where I stopped it. `todayUsd()` and `monthUsd()` read
**$0.00** the whole time — a cap breach and a data lie in one operation, which is
the sentence this file already uses about R5-01 and R8-02.

**The control, in the same run:** an unmodified `FrozenCapsSpendMeter` refuses at
exactly 1,000 dispatches — `CapError: projected $10.0100 > daily cap $10 for
"pulsern"`. The primary cap works. It is the pin that is one method short.

**And the technique is in-repo and blessed.** `engine/test/helpers.ts`'s
`meterWithFailingSettle` does exactly this — `Object.defineProperty(meter,
"settle", …)` and `Object.defineProperty(meter, "release", …)` on a genuine
production meter — with a comment explaining that it is safe because `settle`
cannot mint headroom. This finding is that comment being wrong.

The forgery routes are all closed, and I checked them: a subclass throws
(`new.target`), `Reflect.construct(MemorySpendMeter, …, FrozenCapsSpendMeter)`
gets no brand, `Object.create(FrozenCapsSpendMeter.prototype)` gets no brand, and
an own-property `reserve` override is refused. The hole is only in what the brand
declines to check.

**Required correction:** pin `settle` and `release` to the prototype as well, or
make the argument true by construction — take the settle/release path off the
instance entirely (a module-private function that reads the ledger directly, so
there is no instance property to redefine). If the storage-failure paths (M-01,
M-04, N-07) still need fault injection, give `MemorySpendMeter` an explicit
test-only fault flag rather than leaving a redefinable money method on the
production type; that is the same move the human already ruled for the clock. Add
a mutation entry that unpins `settle`.

---

## R10-03 — the "bound" clock is a mutable global (severity 1)

**Attacked:** the R9-05 fix, on the axis the human's ruling named — "no
injectable clock seam on that type, same structural closure as R8-01."

```ts
super(() => Date.now(), (clientId) => effectiveAiCapsUsd(clientId, narrowing));
```

The two halves of that line have different closure properties and only one of
them is structural.

- `effectiveAiCapsUsd` is an **ES module import binding**. It cannot be
  reassigned from outside `caps.ts`, and the table it reads is `deepFreeze`d.
  That is the R8-01 closure, and it holds — I could not move it.
- `Date.now` is a **writable, configurable property of a global object**. The
  arrow function resolves it at every call, so any code anywhere in the process
  chooses the meter's accounting period.

**Executed**, same real `llm()` path, same real `pulsern`:

```js
let t = Date.parse("2026-01-15T12:00:00Z");
Date.now = () => (t += 40 * 24 * 3600 * 1000);   // one month-plus per read
```

```
A2 dispatched: 3000   first error: NONE
A2 real dollars dispatched: $30.00   against a frozen $200/month
```

Three thousand dispatches, **$30 against a frozen $200/month**, no `CapError`.
R9-05's result at a smaller magnitude, through the constructor written to make it
impossible.

**Why this is not "an attacker with global access can do anything."** The
resolver proves it does not have to be: the same constructor, one argument over,
is genuinely closed against in-process tampering. And the realistic actor is not
an attacker. It is `vi.useFakeTimers()` / `vi.setSystemTime()` in any test file in
this suite, a date-mocking library, an APM or tracing SDK that wraps `Date.now`
for timing, or a Workers polyfill. Any of those silently re-buckets the
production cap, and nothing in the tree would notice — there is no test, no
mutation entry, and no ledger row for it.

**Required correction:** capture the clock at module load —
`const NOW = Date.now.bind(Date);` at the top of `spend-meter.ts`, used by
`FrozenCapsSpendMeter` — so the binding is as immutable as the resolver's. Add a
mutation entry that restores `() => Date.now()`, and lock it by executing:
patch `globalThis.Date.now`, drive `llm()`, assert the `CapError` still lands.

---

## R10-04 — `paths-ignore` inverts R9-06's lock (severity 1)

**Attacked:** the R9-06 fix, and whether the new parser closes the class or one
spelling of it.

`workflowPathFilters` matches `/^(\s*)paths(-ignore)?:\s*(.*)$/` — it captures
`paths-ignore` filters and returns them in the same list, with the same meaning,
as `paths` filters. `globsAdmit(globs, witness)` is then read by the lock as "a
PR touching `witness` runs the gate". For a `paths-ignore` filter the identical
answer means the exact opposite.

**Executed** against the real `gate-lib.mjs`:

```
B2 filters: [["fullburn/**",".github/**"],["fullburn/**",".github/**"],["fullburn/**",".github/**"]]
B2 lock passes while paths-ignore excludes EVERY Class-2 path (CI never runs on a PR)? true
```

The workflow under test differs from the committed one by one line inside the
`pull_request:` block:

```yaml
  pull_request:
    paths: ["fullburn/**", ".github/**"]
    paths-ignore: ["fullburn/**", ".github/**"]
```

GitHub runs that workflow on **no pull request at all**. `adversary-gate` and
`class2-gate` are both `if: github.event_name == 'pull_request'`, so both are
gone; so is every §10.3 stage and the mutation harness. And
`locks-r7.test.ts`'s "CI runs on every Class-2 path, so no Class-2 diff can
arrive ungated" reports green, because for every filter in the list — including
the ignore list — every witness is admitted.

This is R8-04b restored, by a rewrite one line long, under the lock written this
round specifically to stop R8-04b being restored by a rewrite one line long. It
is the fourth consecutive round in which the CI-trigger lock has been walked
around by an ordinary YAML edit, and the second in which the parser written to
close the previous walk-around opened the next one.

A narrower variant is refused, for the record: `paths-ignore: [".github/**"]`
alone fails the lock, because the `fullburn/**` witnesses are then not admitted.
The evasion needs the ignore list to be a superset of the witnesses — which, for
an author who wants CI quiet, is the natural thing to write.

**Required correction:** `paths-ignore` is not `paths` and must not share a
return channel with it. Return `{ kind: "paths" | "paths-ignore", globs }`, and
have the lock assert that every witness is admitted by every `paths` filter AND
**excluded** by every `paths-ignore` filter. Add a mutation entry that adds a
`paths-ignore`. And state the residual: a static parse of one workflow cannot
model `on:` at the job level, reusable workflows, or `if:` conditions, so this is
a tripwire and the ledger should say so.

---

## R10-05 — `npm test` writes to the source tree and leaks a CPU-bound process per run (severity 1)

**Attacked:** the R9-03 fix's new surface, as assignment 3 asks — "the runner is
now ASYNC and spawns children."

The R9-03 drill lives in `engine/test/integration/gate-cli.test.ts`. That file is
matched by `vitest.config.ts`'s `include: ["engine/test/**/*.test.ts"]`. So the
drill runs under `npm test`, under `npm run integration`, and under every one of
the 117 suite runs the mutation harness itself launches.

What it does is spawn the real harness against the real workspace:

```ts
const child = spawn(process.execPath, ["engine/scripts/mutate.mjs"], { cwd: workspace, stdio: "ignore" });
```

### (a) `npm test` mutates `engine/src/spend-meter.ts`

Observed directly, polling `git status` at 0.4 s while a harness ran:

```
01:34:02.61  markerpid=32336  dirty= M fullburn/engine/src/spend-meter.ts;
01:34:03.33  markerpid=32336  dirty= M fullburn/engine/src/spend-meter.ts;
…
```

The drill takes 616 ms in a passing run — it detects the harness's negative
canary at its first 500 ms poll and interrupts there — so on a good day the
damage is a transient comment. On a bad day it is not: when I reverted the
harness to a blocking runner to test R10-09, the drill failed after 158 s and
SIGKILLed the harness, and the tree was left as

```
 M fullburn/engine/src/spend-meter.ts
```

with the money-path file mutated on disk and every other gate green. The marker
means the *next* `npm run mutate` repairs it. Nothing forces a next run.

### (b) every run permanently consumes a CPU core

The harness's signal handler kills its child with `current?.kill("SIGKILL")`. The
child is the **`npx` shim**, not the vitest process it exec-chains to, so the
real vitest process and its tinypool workers are orphaned to init and never
reaped. Measured on a fresh clone with nothing else running:

```
BEFORE orphan vitest: 0
      Tests  292 passed (292)
AFTER orphan vitest:
14567     1       00:02 92.6 node (vitest 1)
14570     1       00:02 87.0 node (vitest 2)
```

Two processes at ~90% CPU, on a 4-core box, forever. And the causation is exact —
with the drill made to decline, the same command leaks nothing:

```
[R9-03 drill] a mutation harness (pid 1) already holds the marker — declining…
      Tests  292 passed (292)
AFTER orphans: 0
```

This is the "~350 orphaned vitest workers" the round brief warns about, and it is
not a previous session's ghost: it is one per test run, reproducible from clean.
It also explains why the harness slows down as it goes, and it feeds directly
back into the measurement — I watched the meta-check itself go VOID under the
load four orphans created, and r9's unfixed observation stands that inside the
main loop a load-induced flake is a free CAUGHT (`run()` reports CAUGHT for any
non-zero child exit, including a kill and a timeout).

### (c) a killed test runner leaves a harness running loose

Observed in this session, unintentionally, which is the most honest kind of
evidence:

```
31106  29894  16:45  /opt/node22/bin/node engine/scripts/mutate.mjs
29894      1  16:53  node (vitest 2)        <- orphaned worker, PPID 1
31751  31106  10:50  npm exec vitest run --silent
```

An orphaned vitest worker still parenting a live mutation harness, which was
still spawning full suites and still rewriting `copy3`'s source, sixteen minutes
after the command that started it had been killed. The drill's cleanup is
`finally { if (child.exitCode === null) child.kill("SIGKILL"); }` — a `finally`
does not run when the worker holding it is killed, and a SIGKILLed harness
restores nothing.

### (d) and the standing invariant is now false

CLAUDE.md: "**Any tool that can write to the source tree is import-safe and fails
closed** … Enumerated from the filesystem and checked in
`engine/test/invariants/`, so a new writing tool is covered the day it lands."

The new writing tool is `vitest`. It is not in `engine/scripts/`, it does not end
in `.mjs`, it has no crash marker, no `process.on("exit")` restore and no
`recoverInFlight` — and the enumeration that claims to cover it lives inside the
suite it is now describing. The invariant checks three files and asserts a
membership; the tool that violates it is the one running the assertion.

**Required correction:** the drill must not spawn a harness into the real
workspace from the ordinary test suite. Copy the workspace to a temp directory
(the same `mkdtempSync` pattern every other test in that file already uses) and
drill the harness there — then a killed runner damages a scratch tree and nothing
else. Spawn the suite as `node node_modules/vitest/vitest.mjs` (or `detached:
true` plus `process.kill(-pid)`) so the kill reaches the process the harness
actually started. And take the drill out of `npm test`'s include set: it belongs
in `npm run integration`, once.

---

## R10-06 — the drill is disabled by a file, and reports PASS (severity 3)

The drill declines when the marker names a live pid. That is the right call and
L29 explains it. But "declines" is `return;` — a **passing test**, not a skip —
and the condition is decided by an untracked file at a fixed path whose contents
nobody owns.

**Executed:**

```
$ echo '{"path":"…/spend-meter.ts","original":"x","workspace":"…","pid":1}' \
    > engine/scripts/.mutate-inflight.json
$ npx vitest run
[R9-03 drill] a mutation harness (pid 1) already holds the marker — declining to spawn a second.
      Tests  292 passed (292)
$ ls engine/scripts/.mutate-inflight.json   # still there
```

pid 1 is alive on every machine. The drill is now permanently inert, the suite is
green, and the file survives the run because nothing cleans it up.

The drill is the ONLY behavioural proof of R9-03's fix — deliberately so: L29
records that it can carry no mutation entry, and R10-09 shows the four shape
checks beside it do not hold the property. So a one-line file, in a directory
nobody diffs, silently retires the only thing proving that an interrupted
mutation run restores the tree.

**And r9's fail-closed backstop was removed by the R9-09 fix.** r9 recorded that
a stray marker was at least caught by `adversary-gate.mjs`'s `assertCleanTree`,
because it showed up as untracked. `.gitignore` now lists
`fullburn/engine/scripts/.mutate-inflight.json`, so `git status` is silent and
`assertCleanTree` sees nothing. The gitignore was the right call for the
committed-marker problem; it also deleted the only external observer of the file.

**Required correction:** declining must not look like passing. Use vitest's
`ctx.skip()` so the run reports a skip, and assert in the invariant suite that
the drill was not skipped in CI (`--reporter=json`, or an env flag CI sets that
turns the decline into a failure). Put the marker under a per-run temp path so
"a harness is running" is not decided by a file an unrelated actor can create,
which also lets the drill run nested and lets L29's behaviour get a real entry —
L29 itself names that as the unblocking condition.

---

## R10-07 — the unreachable-guard sweep, run to completion (severity 3)

The human's instruction, restated for this round: sweep everywhere a newly-added
fail-closed check now precedes an older one, and confirm no existing guard has
gone dead. I enumerated rather than sampled: every `throw`, every `return false`
and every `assert*` call site in `engine/src/`, `config/src/`, `engine/scripts/`
and `engine/test/e2e-variance.ts`, asking of each whether any input reaching that
line can fail it. Results with a verdict for each.

### (a) NEW, DEAD, UNDISCLOSED, UNTESTED — `llm()`'s role-cost check

`gateway.ts:223`:

```ts
assertUsableAmount(card.costBudgetUsdPerCall, "role cost budget");
```

`card` is `ownEntry(ROLE_CARDS, role)`, and the `undefined` case has already
thrown 35 lines above. `ROLE_CARDS` is a `deepFreeze`d module constant; every
`costBudgetUsdPerCall` in it is a positive finite literal (0.01, 0.02, 0.05).
`ownEntry` is `Object.hasOwn` + index, so it can only return a member of that
frozen table. **No input can fail this line.** It has no test, no mutation entry
and no ledger row, and it sits three lines above the `isFrozenCapsMeter` check
where a reader looking for the money guards will read it as one.

This is the **third** instance of the class in this one function: `L28`
(`requireReservingMeter`) and `R9-08a` (the post-reserve validation, correctly
deleted this round) are the first two. The pattern is now established well enough
to name: every time a structural check is added at the top of `llm()`, the
value-shaped checks below it die and nobody notices.

**Verdict: delete it.** Unlike L28's guard it has no future contract — `ROLE_CARDS`
is Class-2 and frozen, and a malformed card is a compile-time and Class-2-review
problem, not a runtime one. If it is kept, it must be disclosed and the frozen
table must be validated at import instead (which is where L19 already says the
answer lies).

### (b) NEW, DEAD, AND ITS REACHABLE FORM WOULD BE A BUG — `mutate.mjs`'s `interrupted`

```js
let interrupted = false;
for (const sig of [...]) process.on(sig, () => { interrupted = true; …; process.exit(130); });
…
for (const [name, file, from, to] of MUTATIONS) {
  if (interrupted) break;
```

Every assignment to `interrupted` is followed, on the same synchronous tick, by
an unconditional `process.exit(130)`. The loop can therefore never observe it.
The flag and the `break` are dead.

They are not harmless dead code. If the `break` *were* reachable, control would
fall through to

```js
console.log(`\n${MUTATIONS.length} mutations: ${MUTATIONS.length - survived - notFound} caught, …`);
```

— a partial run would print a complete-looking `115 mutations: 115 caught, 0
survived, 0 not found` and `harnessVerdict(0,0).ok` would exit 0. The dead code
encodes exactly the lie the meta-check exists to prevent.

**Verdict: delete `interrupted` and the `break`**, or — if a partial run is to be
representable at all — make that path print `HARNESS RESULT IS VOID` and exit
non-zero, never a summary.

### (c) MADE DEAD ON THE PRODUCTION PATH BY R9-05, UNDISCLOSED — the clock family

Binding the clock closed the R9-05 seam and, as a side effect, took five guards
off the only money path that exists. Each is still reachable through
`MemorySpendMeter` — which `llm()` refuses — and each has a mutation entry caught
only through that test-only type:

| Guard | Entry | Reachable from `FrozenCapsSpendMeter`? |
|---|---|---|
| `MemorySpendMeter`'s `typeof now !== "function"` | `N-01 clock type guard` | No — the subclass always passes a function |
| `zoneDayKey`'s `!Number.isFinite(nowMs)` | `R7-03 non-finite instant refused` | No — `Date.now()` is always finite |
| `#assertForward`'s backwards refusal | `R7-03 backwards clock refused` | Only via a real system clock step |
| `#assertForward`'s high-water advance | `R8-08 high-water mark advances` | Same |
| `reserve`'s `caps === null \|\| typeof caps !== "object"` | `H8 ceilings object not required` | No — `effectiveAiCapsUsd` returns a frozen object or throws |

**Verdict: keep every one of them, and disclose the set.** They are real contracts
for the DO-backed meter (L14/L17/L21) and the arguments in the source are sound.
What is not sound is five lines in the harness output that read as money-path
protection when the catch comes from a type the money path rejects. That is
precisely what L28 exists to prevent being read the wrong way, and L28 covers one
line while five more of the same shape were created this round. One ledger row
naming all five, and a comment in the table, closes it honestly.

### (d) DEAD, SAME CLASS AS L19/L25, UNDISCLOSED — `getCaps`'s five `assertSaneCap` calls

Every value in `CAPS_TABLE` is a positive finite literal in a `deepFreeze`d
table, so none of the five call sites in `getCaps` can fire. The CHECK is driven
directly and its mutation (`R6-05/M12 assertSaneCap`) is caught by that unit
test, not by the call sites. This is exactly the class L19 records for
`assertCapsCoherent` and L25 for `assertUsableZone` — the same function, the same
argument, two rows already written, and these five never named.

**Verdict: keep, and extend L19/L25 to say "and the five `assertSaneCap` calls".**
A row that names two of seven members of a class reads as if the class has two
members.

### (e) The two already disclosed — judging the calls

**L28 (`requireReservingMeter`) — the call was right; the follow-through was
not.** Keeping the guard and unit-testing it is correct: `SpendMeter` declares all
four methods optional, so the contract genuinely binds a future implementation.
r9 asked for one more thing — annotate the `R5-07 reservedUsd required` entry in
the table itself, as the table already does for R6-05/M4, M6, M7 and M14, so the
harness line cannot be read as money-path protection without also reading L28.
That was not done; the entry sits unannotated between `R5-07 assertCleanTree` and
`R5-08 one clock read`.

**L29 (the R9-03 `await` entry) — the call was right; the disclosure understates
its cost.** Removing an entry that reports SURVIVED regardless of whether the
behaviour works is the correct decision, and saying so instead of weakening the
entry into something a grep satisfies is the right instinct — this is the best
judgment call in the commit. But the row's cost accounting is one line: "proven by
the drill". It does not say that (i) the drill reports PASS when it declines and
any file with a live pid makes it decline forever (R10-06), (ii) the drill's
proof mechanism is spawning the real harness against the working tree on every
`npm test`, with a money-path source file mutated in the process and a CPU-bound
orphan left behind (R10-05), or (iii) the four shape checks that surround it in
the invariant suite all pass against a behavioural revert (R10-09). A disclosure
whose stated residual is "none — this is a disclosure, not a blocked
verification" is understating a great deal.

### (f) Checks I confirmed still reachable

`isFrozenCapsMeter`'s null/type test, the brand test and the prototype pin (all
three driven, and I attacked all three — see R10-02); `new.target`; the
`SpendReservation` brand (reachable from outside the module, which is what makes
the meta-check's positive canary a legitimate choice); `toMicros`' safe-integer
bound; `reserve`'s `clientId` and `amountMicros <= 0` checks; `#close`'s
`open === undefined`; `settleOrFailClosed`'s catch; `assertCapsUsable` (reachable
via `fixture-unsigned`); `narrow`'s `assertSaneCap` on the caller-supplied table;
`workflowPathFilters`' three unreadable branches; `recoverInFlight`'s four
refusals; `tableEndOf`'s throw; `applyEntry`'s `at === -1`. No further dead guards
in this round's diff.

---

## R10-08 — the writing-tool enumeration is one third fixed (severity 3)

R9-07 asked for three things: widen the write-API definition, walk the whole
workspace rather than one directory, and assert a count rather than a membership.
One was done.

```ts
const dir = new URL("../../scripts/", import.meta.url);
const scripts = readdirSync(dir).filter((f) => f.endsWith(".mjs"));
const WRITE_API = /\b(?:writeFileSync|appendFileSync|rmSync|…)\s*\(/;
const writers = scripts.filter((f) => WRITE_API.test(readFileSync(new URL(f, dir), "utf8")));
expect(writers, "no writing tool found — the enumeration is broken").toContain("mutate.mjs");
```

The API list is genuinely better, and driving the library claim by importing and
watching a canary is a real improvement. But the enumeration is still
`engine/scripts/*.mjs`, and the assertion is still membership. Measured on this
tree it sees three files (`mutate.mjs`, `mutate-lib.mjs`, `diff-lib.mjs` — the
last only because the word `rename (` appears in a doc comment, which is its own
comment on the method). A writing tool in `engine/`, in `config/`, at the repo
root, or written in TypeScript is invisible, and so is one that shells out
(`execSync("sed -i …")`).

The comment above it still says:

> It is enumerated from the filesystem, not from a list, so a NEW writing tool is
> covered the day it lands rather than the day someone remembers.

R10-05 is the counterexample, and it is not hypothetical or future: the new
writing tool landed in the same commit as this comment, it is `vitest`, and the
test asserting the claim is running inside it.

**Required correction:** walk the workspace, not one directory; include `.ts`;
and assert a count against a committed expected set so a tool that drops out of
the regex fails closed for every file, not only for `mutate.mjs`. Then state the
residual plainly: a static scan cannot enumerate writing tools, so this is a
tripwire and not a proof — and the tripwire has now missed one.

---

## R10-09 — the three new standing rules are prose, and rule 3 has its fifth victim (severity 3)

**Rule 1 — "a guard and its checker never ship in the same commit without a test
proving the checker can still go red."** Enforced nowhere. No CI step, no gate, no
test. The clearest evidence that it is not operating is that this commit's
headline artifact — the meta-check — shipped with no checker at all (R10-01).

**Rule 2 — "every harness result is void unless preceded by a passing
meta-check."** R10-01. Prose.

**Rule 3 — "a guard is locked by EXECUTING it, never by asserting its shape."**
The brief asked me to find the fifth check this trap has defeated. It is the
block that claims to hold R9-03's own fix.

`invariants.test.ts:341-349` makes four assertions about the harness runner:

```ts
expect(runner, `${f} has no restore-on-exit path`).toMatch(/process\.on\(\s*["'`]?exit/);
expect(runner, `${f} never recovers a previous crashed run`).toMatch(/recoverInFlight\(/);
expect(runner, `${f} blocks the event loop …`).not.toMatch(/execSync\s*\(/);
expect(runner, `${f} does not await the suite …`).toMatch(/await\s+\w*[Rr]un\(|await measure\(/);
```

**Executed.** I reverted the runner behaviourally — `run()` rewritten to a
blocking `spawnSync`, everything else untouched:

```
--- invariant suite (the check that claims to hold this property):
      Tests  14 passed (14)
--- the drill (the behavioural proof):
      Tests  1 failed | 11 skipped (12)      (158s: SIGINT did not stop the harness)
```

All four pass. `spawnSync(` does not match `execSync\s*\(`; `process.on("exit"`
and `recoverInFlight(` are untouched; and `await measure(` is satisfied by the
**meta-check's own call site**, so the fourth assertion holds even if every
`await` in the runner loop is removed. The harness once again blocks the event
loop for the entire suite and its signal handlers once again cannot run — R9-03,
exactly, with the invariant green.

To be fair to the file: it says so. The comment above those four lines is one of
the most honest things in this repo — "THESE FOUR ARE SHAPE CHECKS, AND SHAPE
CHECKS DO NOT LOCK A GUARD … Read these four as a fast smoke over a property the
drill establishes, never as the establishment of it." So this is not a concealed
defect; it is a disclosed one whose disclosure rests entirely on the drill. The
finding is that the drill is R10-05 and R10-06 — it damages the tree to do its
job, it is silenced by a file, and when it declines it reports PASS. The single
load-bearing behavioural proof in the harness is the least protected thing in it.

The by-name presence check on the drill (`expect(drill).toContain('it("SIGINT
stops it…')`) guards deletion, which is legitimate and the file correctly
distinguishes it. It does not guard the drill returning early.

---

## R10-10 — the diagnostic that exposed R9-01 has been destroyed (severity 3)

r9 found R9-01 by reading the per-entry evidence column:

```
CAUGHT             R8-STANDING self-targeting entries cannot rewrite the table  |  1 failed | 286 passed (287)
```

The `1 failed` was the tell — exactly one test failing, the same one, on every
entry. On this tree that column reads:

```
CAUGHT             N-01 clock default  |  1 ⎯⎯⎯⎯⎯⎯⎯
CAUGHT             N-04/05 header window  |  1 ⎯⎯⎯⎯⎯⎯⎯
  ok   positive canary — a reverted guard must be CAUGHT  |  got CAUGHT  (1 ⎯⎯⎯⎯⎯⎯⎯)
```

The R9-03 rewrite merges the child's stderr into the same buffer the summary
regex reads (`child.stderr.on("data", (d) => (out += d))`), and `/Tests\s+(.*)$/m`
is unanchored, so it now matches vitest's `⎯⎯ Failed Tests 1 ⎯⎯` banner, which
appears **before** the summary line. Every entry's evidence is a decoration
count.

This matters more than cosmetics. The evidence column is the only per-entry
signal an operator or a reviewer gets, and it is the one that caught the worst
defect this build has produced. An entry caught by one unrelated failing test and
an entry caught by the twelve tests that exist for it are now indistinguishable.

**Required correction:** parse the child's **stdout** for the summary, keep
stderr separate, and anchor the pattern (`/^\s*Tests\s+(.*)$/m` over stdout, last
match). Assert it in a test by feeding a recorded vitest output through a pure
extractor — a behaviour, and one a table entry cannot satisfy.

---

## Mutation-harness audit

The table has 115 entries; I read every one.

I re-ran the whole table to completion in a clone with its own `node_modules`,
on an otherwise idle machine:

```
META-CHECK — proving the harness can report both answers
  ok   negative canary — a comment-only edit must SURVIVE  |  got SURVIVED
  ok   positive canary — a reverted guard must be CAUGHT   |  got CAUGHT
…
115 mutations: 115 caught, 0 survived, 0 not found
```

Tree clean afterwards, marker gone, exit 0. **The builder's number is correct and
I could not make it lie.** Two things about the run belong in this report more
than its arithmetic does.

**First, the meta-check works, and it is the round's real improvement.** On a
machine loaded by four leaked vitest workers it printed

```
  FAIL negative canary — a comment-only edit must SURVIVE  |  got CAUGHT  (246 passed (246))

META-CHECK FAILED: expected SURVIVED, got CAUGHT.
The suite is red for a change that alters no behaviour …
HARNESS RESULT IS VOID.
```

and exited 1 without a number. That is the correct behaviour and it is what r9
asked for. It also means the harness's validity is a function of machine load,
which is fail-closed for the meta-check and fail-OPEN for the 115 entries that
follow it: `run()` reports CAUGHT for any non-zero child exit, so a load-induced
timeout, an OOM kill of the child, or a `npx` that fails to start is a free
CAUGHT for whatever mutation happened to be applied. r9 raised this; it is
unfixed; and R10-05 guarantees the load grows.

**Second, my own two candidate survivors were artifacts, and I killed them
myself.** `r4-lock8 WeakSet brand` and `R7-02 zone travels with the ceilings`
both reported `*** SURVIVED ***` and both are in `config/src/`. They survived
because my copy's `node_modules` was a symlink and `@fullburn/config` resolved
out to the real repository — the mutation was written to a file nothing imported.
I verified the mechanism directly (`caps.ts` line 236 reading `timeZone: "UTC"`
on disk while `effectiveAiCapsUsd("pulsern").timeZone` returned
`America/New_York`) and re-ran with a private `node_modules`, where
`realpathSync` confirms the workspace link resolves inside the copy. **I make no
survivor claim against this tree.** The builder's `0 survived` is not contradicted
by anything I measured.

Entries I attacked and found genuinely protected, for the record: the five
`R8-01` brand entries (I could not forge the brand by subclass,
`Reflect.construct`, `Object.create`, or own-property `reserve` override — see
R10-02's control), `R9-04`'s two CODEOWNERS entries (I re-ran the owner-stripped
and last-match-wins cases against the real file and the matcher now discriminates
correctly), `R9-06`'s block-sequence pair (the parser genuinely reads both
spellings and returns `null` for what it cannot read — R10-04 is about a
different key, not about this parser being wrong), `R9-09`'s marker refusals (I
could not make `recoverInFlight` write outside the workspace, create a file, or
honour another checkout's marker), `R9-10` (no tracked Class-2 file carries a NUL
in its first 8000 bytes; `hardening.test.ts` now diffs as text), and `R9-02`'s
`applyEntry` pair, which is now genuinely driven — the pure-function test
constructs the both-places case and asserts which occurrence is chosen, and a
table entry cannot satisfy that. That fix is correct and is the model the rest of
this round should have followed.

Entries that remain caught by something other than the path they name, none of
them newly so: `R5-07 reservedUsd required` (L28, still unannotated in the table),
the two `R7-10` grade entries, and the five clock-family entries R10-07(c) names.

`tableEnd` is still the FIRST `"\n];"` in `mutate.mjs`. A future entry whose
`from` or `to` text contains that sequence moves the boundary into the table and
re-opens R9-02. r9 raised it; unchanged.

## §10.2 standing-invariant checklist

| Invariant | Result |
|---|---|
| Writes-only; no mass-read of platform APIs (Law 1) | **PASS** — structural rule fires on a seeded `graph.facebook.com` fetch; write-verb half correctly deferred to Phase 6 |
| Spend caps present, immutable at runtime, tested by attempted breach (Law 2) | **FAIL** — $50 against a frozen $10/day and $200/month through the production meter with `settle` rewired (R10-02); $30 against a frozen $200/month by patching the clock the meter binds (R10-03). The unmodified meter refuses at exactly $10.00, which is the half that works |
| Per-client isolation; seeded cross-tenant read fails (Law 3) | **PASS** — `vaultForClient("client-b").get("token")` throws `VaultError`; scope cannot be re-pointed; `llm()` refuses a cross-scoped trace context and a mismatched vault |
| Every LLM call through AI Gateway; every decision traced (Law 11) | **PASS** — transport URL asserted against `gatewayBaseUrl`; refusals traced under their own identity; trace loss surfaced on the thrown error |
| Proxies-kill-only in code (Law 5) | Deferred to Phase 5 — declared, phase matches §11 |
| No prediction-gate code paths (Law 6) | **PASS** — structural rule fires on a seeded `predictedRoas < target` gate |
| Trust ladder cannot skip rungs (Law 8) | Deferred to Phase 5 — declared |
| `decisions` ledger append-only | Deferred to Phase 2 — declared |
| External content is data, never instructions | **PARTIAL PASS** — hostile payload through `llm()` leaves caps, bindings and channels untouched. I swept the whole tree for instructions aimed at this review; the only matches are the project's own seeded fixture and my own agent definition. **No prompt injection found.** |
| `VERDICT.md` hash-locked | Deferred to Phase 6 — file does not exist yet |
| Tokens only in the vault | **PASS** — `leak-check ..` clean over the whole repository; the vault never echoes a value even on a miss |
| Queue past SLA waits; locked flags structurally inert | **PARTIAL PASS** — `requireActiveChannel("tiktok")` and `("google")` both throw `SwitchboardError`; `activeChannels() === ["meta"]`. Queue half deferred to Phase 6 — declared |
| **Any tool that can write to the source tree is import-safe and fails closed** | **FAIL** — the newest such tool is `npm test` itself (R10-05): it spawns the harness against the working tree, mutates `engine/src/spend-meter.ts`, orphans a CPU-bound process per run, and leaves a money-path file reverted when the drill fails. The enumeration that claims to cover new writing tools cannot see it (R10-08) |
| **Every harness result is void unless preceded by a passing meta-check** | **FAIL as an invariant, PASS as a behaviour** — the meta-check works and voids correctly; nothing whatsoever enforces its presence (R10-01) |
| **A guard is locked by executing it, never by asserting its shape** | **FAIL** — the four shape checks holding R9-03's fix all pass against a behavioural revert of it (R10-09) |
| **A guard and its checker never ship in one commit without a red-proof** | **FAIL** — unenforced anywhere; the meta-check is this commit's counterexample |

## Governance checks (Phase A step 7)

- **`VERDICT.md` hash intact** — n/a, Phase 6 deliverable.
- **Token scan** — clean, whole repository, structural rules armed.
- **Hostile instructions in fixtures** — swept the tree for injection patterns;
  the only matches are `invariants.test.ts`'s own inert hostile fixture and my own
  agent definition quoting the rule. **No prompt injection found, and none aimed
  at this review.**
- **Queue item past SLA** — no queue exists; correctly declared not-yet-applicable.
- **Locked market/channel flag activation** — structurally impossible: no runtime
  mutation API, `deepFreeze`d registries, accessor-only reads enforced by a
  structural scan rule.
- **Second client while one is unstable** — no onboarding path exists.
- **Class-2 self-approval** — `checkApprovalAuthorship` refuses
  `Claude <noreply@anthropic.com>`, `github-actions[bot]` and `Claude Opus 5`;
  the CLI supplies `%an <%ae>`. This works. R10-04 is about whether the job that
  runs it is triggered at all.
- **Adversary did not modify anything** — no source file, test, config, ledger,
  workflow or existing report was edited, and nothing was committed. Every
  experiment ran against throwaway clones under the session scratchpad. The only
  change to the working tree is this new report file, which is outside the
  verified scope by design; the verified-scope hash is
  `02f7d4aa88fc6358e8ee748fee31ff7cde5ee5cb`, identical before and after. I have
  not touched the Grade Registry, its thresholds, the Laws, the improvement loop,
  or my own definition.

## Additional observations (not verdict-determining)

- **Two meters, one client, two ceilings.** `new FrozenCapsSpendMeter()` twice for
  `pulsern` dispatched $20 against one $10/day ceiling. Known and disclosed
  (L14, L21) as the Durable-Object restart shape; recorded because it is now the
  cheapest breach in the tree that needs no patching at all.
- **The ad-spend trio still has no enforcement path.** $66 pacing, $75 hard,
  $2,000 total are configuration, not guards, before Phase 6. L20 says so; I
  confirmed no code reads them.
- **`spec/constitution divergence`, unchanged from r9.** CLAUDE.md now carries
  sixteen standing invariants; ENGINE_BUILD.md §10.2 has twelve bullets and
  `invariants.test.ts` asserts that count. The build protocol says ENGINE_BUILD.md
  wins. Three of the four newest rules are in CLAUDE.md only. Spec finding for
  the human.
- **`recoverInFlight` accepts a marker with no `workspace` field** (`record.workspace
  === undefined ||`). A marker from another checkout nested inside this workspace
  would pass both the identity and the containment test. Narrow, but the field is
  free to require now that the harness always writes it.
- **`index.ts` still exports `MemorySpendMeter`, which `llm()` refuses, and not
  `FrozenCapsSpendMeter`, which is the only meter it accepts.** r9 observation,
  unchanged.
- **`validateOutput` still uses `key in obj`**, so an inherited property satisfies
  a required field, and numeric fields still accept `NaN`. r7/r8/r9 observation,
  unchanged.
- **`new URL(model.gatewayRoute, deps.gatewayBaseUrl)`** still does not prove the
  result is an approved AI Gateway origin. Unchanged.
- **R9-10's fix is correct, and one file was missed.** `hardening.test.ts` is now
  text and the lock's 8000-byte window is exactly git's own `buffer_is_binary`
  rule, so the check is right. But `engine/test/locks-r5.test.ts` still carries
  three raw NUL bytes, at offsets 19528/19556/19587 — past the window, so git
  renders it as text and the lock correctly passes. `grep` calls it binary, and
  other review surfaces use other heuristics. Converting those three to
  `\u0000` escapes, as `hardening.test.ts` now does, costs nothing and closes the
  class rather than the instance.
- **R7-01's invisible-character rule works, and it caught me.** The first draft of
  this report contained one raw NUL — I wrote the words the two words "NUL escape" and
  emitted the byte rather than the text. `parseVerdict` returned `null` for the
  whole document and `checkAdversaryReport` said the report "has no readable
  'verified-tree:' binding … so it blocks (fail closed)". Correct behaviour, from
  a rule three rounds fought over, on an adversary's own file. Recorded because it
  is the only unprompted evidence in this report that one of these mechanisms
  works on an input nobody designed for it.
- **The orphan leak reproduces on every run, not occasionally.** Third
  measurement, on the clone used for the final gate numbers: one `npx vitest run`,
  two new processes at 99%/100% CPU parented to init. Over a 115-entry harness run
  the harness itself does not leak (the drill declines while the marker is held),
  but each of a developer's or CI's `npm test` and `npm run integration`
  invocations does.
- **`diff-lib.mjs` is classified as a writing tool** by the new `WRITE_API` regex
  because the words `rename (` appear in a doc comment. Harmless today — it is
  correctly proved runner-free by the library canary — but it is a reminder that
  the enumeration is reading prose.

## Verdict basis

**FAIL.**

R10-01 is the finding that subsumes the round, and it is the same shape as R8-09
and R9-01 one level up. Each round this project builds the mechanism that would
have caught the previous round's defect, and each round that mechanism ships
unguarded. R8-09 built the acceptance bar and did not make it a stage. R9-01's
fix built the meta-check and did not give it a checker. It is deletable in one
edit with 292 tests, typecheck, leak-check and the mutation harness all green,
and CLAUDE.md's own newest rule — "a guard and its checker never ship in the same
commit without a test proving the checker can still go red" — is written two
bullets above the rule it was violated by.

R10-02 and R10-03 are the money findings and they are the shape r8, r9 and now
r10 keep producing: **the fix closes the argument that was attacked and leaves
the argument beside it open.** R9-05 closed the clock parameter; the clock it
bound instead is a mutable global, and $30 landed against a frozen $200 month.
R8-01 pinned `reserve`; `settle` was left unpinned on a written argument that
enumerates "throws or does nothing" and omits "releases", and $50 landed against
a frozen $10 day with the meter reading $0.00.

R10-04 is the control-plane pair's fourth round. The CI-trigger lock has now been
walked around by an ordinary YAML edit in R8-04b, R9-06 and R10-04, and twice the
parser written to close the previous walk-around opened the next one. One line —
`paths-ignore` — and no gate runs on any pull request while the lock says green.

R10-05 is the round's most uncomfortable result, because the damage was done by
the fix. Making the interrupt property provable required a drill; the drill
spawns the real harness against the real tree from inside `npm test`; and the
consequence is that the ordinary test command now rewrites a money-path source
file, leaks a CPU core per invocation, and can leave a guard reverted on disk —
which is verbatim the state the standing invariant it serves was written to
forbid.

R10-07 answers the sweep the human asked for and its result is a pattern, not a
list: every structural check added at the top of `llm()` kills the value-shaped
checks below it, and three rounds running nobody has noticed until the sweep.
L28's call was right and its follow-through was not; L29's call was the best
judgment in the commit and its cost accounting is a single line for something
that costs a great deal.

## Minimum re-review gate

1. Give the meta-check a checker: extract it, drive it with failing canaries,
   assert the runner calls it before entry one, and add a mutation entry.
2. Pin `settle` and `release`, or take them off the instance. $50 against a $10
   day must not be reachable through a genuinely-constructed production meter.
3. Bind the clock at module load (`Date.now.bind(Date)`), with an entry and a
   test that patches `globalThis.Date.now` and asserts the `CapError` still lands.
4. Parse `paths-ignore` as an exclusion; assert every witness is admitted by
   every `paths` filter and excluded by every `paths-ignore` filter; add an entry.
5. Move the R9-03 drill onto a temp copy of the workspace, out of `npm test`'s
   include set, and make it kill the process it actually spawned. `npm test` must
   not write to `engine/src/`.
6. Make the drill's decline a SKIP, not a pass, and make the marker path per-run
   so a stray file cannot silence it.
7. Delete `llm()`'s `assertUsableAmount(card.costBudgetUsdPerCall, …)` and
   `mutate.mjs`'s `interrupted`/`break`; disclose the five clock-family entries
   and the five `assertSaneCap` call sites; annotate `R5-07` in the table.
8. Widen the writing-tool enumeration to the workspace and to a count, and correct
   the comment that claims it already is.
9. Restore the harness's evidence column: parse stdout, anchored, last match.
10. Re-attack. This report remains FAIL for
    `02f7d4aa88fc6358e8ee748fee31ff7cde5ee5cb`.
