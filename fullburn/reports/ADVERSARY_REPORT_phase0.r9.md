# ADVERSARY REPORT phase0.r9
Verdict: FAIL
verified-tree: c824ae67a8213794a8b314f8d56fe1577f596b6d

Round 9, same-family review of Phase 0 at commit `aaa6416` on branch
`claude/fullburn-engine-spec-r7v5lg`. Every number below was executed in this
sandbox against a disposable copy of the tree; the working tree at
`/home/user/New-skills-` was verified byte-identical to `HEAD` before and after
every experiment, and its hash is the one bound above.

## Gate state — independently re-run, not taken on trust

| Command | Claimed | Observed |
|---|---|---|
| `npx vitest run` | 287 passed | **287 passed, 19 files** ✓ |
| `npm run typecheck` | clean | **clean** ✓ |
| `npm run leak-check` | clean | **clean** ✓ |
| `npm run e2e` | passes | **1 passed** ✓ (with `PLAYWRIGHT_CHROMIUM_PATH`) |
| `npm run mutate` | 105 caught / 0 survived / 0 not found | **105 caught / 0 survived / 0 not found — and it could not have printed anything else** (R9-01) |
| tree hash | `c824ae67…` | **`c824ae67a8213794a8b314f8d56fe1577f596b6d`** ✓ |

The builder's numbers are all true as printed. The mutation number is also
**incapable of being false**, and that is this round's central result.

## Ranked findings

| ID | Severity | Domain | Gate consequence |
|---|---:|---|---|
| R9-01 | 1 — money loss (verification) | Mutation harness | The harness holds its own marker on disk while it runs the suite, and the suite fails on that marker. Every entry reports CAUGHT by construction; `npm run mutate` and the new CI job can never fail. |
| R9-02 | 1 — money loss (verification) | Mutation harness | Measured honestly, `R8-STANDING self-targeting entries cannot rewrite the table` **SURVIVES**. Third instance of the grep-matches-the-table trap, in the check written to prevent it. |
| R9-03 | 1 — money loss (verification) | Mutation harness | The SIGINT/SIGTERM handlers cannot run during a run. Executed: SIGINT to the harness pid, alive 40s later, three more entries processed, source still mutated. The new standing invariant's "fails closed" half is asserted by grepping for the strings. |
| R9-04 | 1 — control plane | Class-2 change control | Strip every `@ssb22inc` from CODEOWNERS — in GitHub, nobody owns anything — and the R8-04 lock reports 0 unowned of 98 Class-2 files. |
| R9-05 | 1 — money loss | Cap enforcement | The clock is still an injectable seam on `FrozenCapsSpendMeter`. Executed through the real `llm()`: 12,000 dispatches, **$120 committed against a frozen $20/month**, no `CapError`. |
| R9-06 | 1 — control plane | CI trigger | R8-04b's `paths:` lock is defeated by the ordinary block-sequence YAML spelling of the same filter: the regex captures empty, `globs` becomes `[]`, and every witness is admitted. |
| R9-07 | 3 — data lie | Standing invariant | "Enumerated from the filesystem" is one regex for one spelling over one directory. A second writing tool is invisible; only `mutate.mjs` fails closed. |
| R9-08 | 3 — data lie | Unreachable guards | The R8-01 fix created a second dead guard in the same function as L28 — `llm()`'s post-reserve reservation validation — with no test, no mutation entry and no disclosure. Plus a strawman mutation entry on `leak-check`. |
| R9-09 | 3 — money (latent) | Crash recovery | `recoverInFlight` writes any path a marker names: it creates files that never existed and overwrites newer content with stale pre-crash bytes. The marker path is fixed and unowned. |
| R9-10 | 3 — control plane | Review integrity | `engine/test/hardening.test.ts` carries NUL bytes and no `.gitattributes`, so git and GitHub render every change to it as "Binary files … differ". A Class-2 file the CODEOWNER cannot read. |
| R9-11 | 5 — dummy-proof | E2E expiry | Evasions five through eight: `test.describe.skip`, a bare `return;`, `test.fail()`, and a guarded return all report the variance as holding. |

---

## R9-01 — `npm run mutate` is structurally incapable of reporting a survivor (severity 1)

**Attacked:** the harness itself, as the human asked — as an adversarial target,
not a trusted tool.

The invariant added this round ends with a behavioural check on the recovery
path (`invariants.test.ts:344`):

```ts
expect(existsSync(MARKER), "a marker is left behind after a clean run").toBe(false);
```

The harness writes that marker **before every mutation** and removes it only
after the restore (`mutate.mjs:315`, `restoreInFlight`). The suite it runs to
decide CAUGHT/SURVIVED is launched *between* those two points
(`mutate.mjs:319-320`). So the marker is on disk for the entire duration of
every `npx vitest run --silent` the harness launches.

**Executed** — the marker alone, with the tree otherwise pristine:

```
$ echo '{"path":"/tmp/x","original":"y"}' > engine/scripts/.mutate-inflight.json
$ npx vitest run
 × §10.2 standing invariants … > every tool that can write to the source tree is import-safe and fails closed
   → a marker is left behind after a clean run: expected true to be false
   Tests  1 failed | 286 passed (287)
```

`run()` returns non-`null` whenever any test fails. Therefore:

- `failure === null` can never be true;
- `survived` is always `0`;
- `harnessVerdict(0, 0).ok` is always `true`;
- the `mutation-harness` CI job added this round always exits 0.

This is not a probability argument. **The harness cannot print a survivor on
this tree.** I observed 80 consecutive entries in a real `npm run mutate` and
every one carried the extra failure:

```
CAUGHT             N-01 clock default  |  2 failed | 285 passed (287)
CAUGHT             N-01 clock type guard  |  2 failed | 285 passed (287)
…
CAUGHT             R8-STANDING self-targeting entries cannot rewrite the table  |  1 failed | 286 passed (287)
```

The `1 failed` lines are the tell: exactly one test failed, and that one test is
the marker assertion. Those entries are unprotected fixes wearing a CAUGHT
label — see R9-02.

**Why this matters more than the arithmetic.** `npm run mutate` is this
project's stated acceptance bar for a fix, the mechanism R8-09 was raised to put
into CI, and the thing five rounds of "the catch comes from somewhere other than
the thing that claims it" have been enforced with. On this tree it certifies
everything and tests nothing. Every "mutation-verified" claim in `mutate.mjs`,
`LIVE_VERIFICATION_LEDGER.md`, `CODEOWNERS` and the r9 commit messages is
unevidenced until it is re-measured.

**A second dishonesty in the same mechanism.** `run()` reports CAUGHT for *any*
non-zero suite, including a flake. `engine/test/integration/gate-cli.test.ts`
spawns real `git` processes and accounts for 5.3s of a 6.6s suite; under CPU
contention I observed it fail spuriously, and the harness recorded that entry as
CAUGHT. A flaky test is a free CAUGHT for whatever mutation happened to be
applied at the time.

**Required correction:** the harness must not run a suite that can observe the
harness's own state. Either exclude the marker assertion from the run the
harness launches (e.g. by driving it on a temporary fixture only, which the rest
of that test already does), or put the marker outside the scanned tree, or have
the harness assert a clean baseline first (`run()` on the unmutated tree must
return `null`) and refuse to report at all if it does not. The baseline
assertion is the one that fails closed against every future instance of this
class, including flakes: a harness that cannot reproduce a green baseline has
measured nothing.

---

## R9-02 — an R8 fix's own lock is defeated by the trap it was written to close (severity 1)

**Attacked:** whether a one-line revert leaves CI green, measured without the
marker artifact.

`R8-STANDING self-targeting entries cannot rewrite the table` reverts
`mutate.mjs:307`:

```js
-    const at = original.indexOf(from, searchFrom(path));
+    const at = original.indexOf(from);
```

**Executed twice, on an idle machine, against a git-clean copy:**

```
at=27893 tableEnd=24748          <- the real code line, not the table entry
$ npx vitest run
      Tests  287 passed (287)
*** SURVIVED ***
```

The lock that claims it (`locks-r7.test.ts:505`) is:

```ts
expect(harness, "a self-targeting entry can rewrite the table instead of the code")
  .toMatch(/searchFrom\(path\)/);
```

After the revert, `searchFrom(path)` is still in the file — **inside the
mutation table, as the string literal of this very entry** (`mutate.mjs:160`).
The grep matches the data, not the code.

This is the third occurrence of a failure mode this repo has already documented
twice. `mutate-lib.mjs:59-64` says it in the file's own words:

> a test that greps this file for the guard's source text matches the harness's
> OWN mutation entry as readily as the guard — it passed with the guard reverted.
> A behaviour is locked by calling it, not by reading the line that implements it.

And `invariants.test.ts:288-291` says it again:

> That trap has caught two checks in this repo already (R8-09, and the first
> version of this one).

Both files then reached for the right answer — drive the behaviour
(`harnessVerdict`), or anchor at column 0 — and the check for the self-reference
rule got neither. Two of the three assertions in that block have the same defect:
`toMatch(/tableEnd/)` and `toMatch(/searchFrom\(path\)/)` are both satisfied by
table text; only `.not.toMatch(/original\.replace\(from, to\)/)` is not.

**And the consequence is not cosmetic.** With `searchFrom` dropped, every entry
that targets `mutate.mjs` mutates its own table row instead of the code — which
is exactly the state that produced three false survivors in the previous session
and is indistinguishable, in the output, from a guard that was never reverted.
Combined with R9-01 the harness would then be lying in both directions at once.

**Required correction:** extract the entry-application step into a pure function
in `mutate-lib.mjs` (`applyEntry(source, selfPath, entry) -> {at, next}`) and
drive it: assert that an entry naming `mutate.mjs` whose `from` text also
appears in the table selects the occurrence **after** `tableEnd`. That is a
behaviour, and a table entry cannot satisfy it.

---

## R9-03 — the harness's signal handlers cannot run, and a killed run leaves the tree weakened (severity 1)

**Attacked:** "verify it cannot corrupt the tree it verifies under ANY ordering,
worker count, or crash mid-run, and that a crashed harness leaves NO reverted
guards on disk."

`mutate.mjs:275-280` installs handlers for SIGINT, SIGTERM, SIGHUP and SIGQUIT,
each calling `restoreInFlight()` then `process.exit(130)`, under the comment
"Every death a process can observe."

**They cannot execute during a run.** The entire runner body — the `for` loop
over 105 entries — is synchronous: `readFileSync`, `writeFileSync`, `rmSync` and
`execSync("npx vitest run --silent")`. Node delivers a signal to a JS handler on
an event-loop turn, and the event loop does not turn until the loop finishes. A
queued handler therefore runs only after the last entry, when `inFlight` is
already `null` and `restoreInFlight()` is a no-op.

**Executed against the real harness.** SIGINT delivered directly to the harness
process (not to `npm`, not to the shell):

```
$ ps -o pid,cmd -p 20123
  20123 node engine/scripts/mutate.mjs
tree before:  M fullburn/config/src/models.ts
              ?? fullburn/engine/scripts/.mutate-inflight.json
15:14:17  kill -INT 20123
15:14:57  STILL ALIVE
          …three further entries processed after the signal…
tree after:   M fullburn/engine/src/spend-meter.ts
              ?? fullburn/engine/scripts/.mutate-inflight.json
```

A Ctrl-C does not stop the harness, does not restore anything, and the harness
keeps rewriting source files behind the operator's back.

**SIGKILL, also executed** (the case the marker is for):

```
$ pkill -9 -f engine/scripts/mutate.mjs
tree:  M fullburn/engine/src/gateway.ts
       ?? fullburn/engine/scripts/.mutate-inflight.json
node processes still alive: 7
```

The tree is left in its weakened state, with orphaned vitest workers — the exact
symptom the round brief warns about. The marker means the *next* `npm run
mutate` will repair it, but nothing forces a next run: `npm test`,
`npm run typecheck`, `npm run invariants` and every CI job except
`mutation-harness` will happily execute against the weakened tree.

**Against the standing invariant as written.** CLAUDE.md says "a partial or
crashed run must never leave the tree in a weakened state." What this tree
delivers is *detectable and eventually repairable*, which is a different and
weaker property. And the invariant's own check does not test either one — it
greps the runner region for the strings `"SIGINT"` and `"SIGTERM"`
(`invariants.test.ts:307-309`). The strings are present. The behaviour is
absent. That is precisely the shape this round was asked to sweep for.

**Required correction:** either (a) make the loop asynchronous (`await`
`execFile` per entry) so a signal can be serviced, or (b) drop the signal
handlers as the dead code they are and say in the file that only the marker
covers interruption — and then make something other than the harness itself
perform the recovery, because a repair that only the damaged tool can apply is
not a fail-closed property. `npm test` running `recoverInFlight()` first, or a
`pretest` hook, would close it. Whichever is chosen, the invariant must drive it:
spawn the harness, signal it, and assert the tree.

---

## R9-04 — the CODEOWNERS lock validates patterns and never owners (severity 1)

**Attacked:** the artifact R8-04 created to make "human-only" real.

`codeownersCovers` (gate-lib.mjs:502) reduces every line to its first
whitespace-delimited token:

```js
.map((l) => l.split(/\s+/)[0]);
```

It never looks at what follows. In GitHub's CODEOWNERS, **a pattern with no
owner removes ownership** for the paths it matches, and the **last** matching
rule wins. Both semantics are invisible to this matcher.

**Executed against the real file and the real Class-2 set:**

```
C3  Class-2 files: 98 | unowned after removing EVERY @owner: 0
```

A diff that deletes `@ssb22inc` from all 24 rules — a diff whose entire meaning
is "no human owns any of this" — leaves the lock test
(`locks-r7.test.ts:452`, "every tracked Class-2 file has a CODEOWNER") green
with an empty `unowned` list. Two narrower variants, also executed:

```
C1  vitest.config.ts covered by an OWNER-LESS rule?                    true
C2  test file still 'covered' after a LATER un-owning rule?            true
```

The function's own docstring states the standard it fails:

> a matcher that quietly returns false for a rule GitHub honours would report
> missing coverage, and one that quietly returns true would report coverage that
> does not exist. **The second is the dangerous direction**, so unknown
> constructs are not silently accepted.

An owner-less rule is not an unknown construct; it is the documented way to
*remove* ownership, and the matcher reports it as coverage.

The three CODEOWNERS mutation entries all comment out a whole rule, which the
path enumeration does catch. None of them removes only the owner — the evasion
that needs no intent to deceive, since "tidying" a trailing handle is an
ordinary edit.

**Required correction:** parse owners. A rule with no owner must un-cover the
paths it matches, evaluated last-match-wins, and the lock must assert that
`codeownersCovers` returns false for the owner-stripped file. Add a mutation
entry that removes one owner rather than one rule.

---

## R9-05 — the clock is still an injectable seam on the production meter (severity 1)

**Attacked:** what the R8-01 fix broke — new code on the only money path that
exists.

The human's ruling was "remove the injection point entirely rather than adding a
mismatch-refusal check." `FrozenCapsSpendMeter` does that for the *ceilings*.
It leaves the *clock* — the argument that decides **which period the ceiling
applies to** — as a plain constructor parameter with no constraint at all:

```ts
constructor(now: () => number, narrowing?: CapsNarrowingTable) { … }
```

`#assertForward` (R7-03) refuses backwards movement only, by design and by
disclosure. Forward movement is unlimited, and a forward jump past a month
boundary is a fresh $200 — or, for the fixture client, a fresh $20.

**Executed through the real `llm()`, with a genuine, branded
`FrozenCapsSpendMeter` that `isFrozenCapsMeter()` accepts:**

```
FROZEN fixture-testco  daily $5  monthly $20  zone UTC
A1 dispatched: 12000   total USD across periods: 120.00   frozen monthly ceiling: 20
```

Twelve thousand requests reached the transport and **$120 was committed against
a frozen $20/month**, inside a single instant of wall-clock execution, with no
`CapError` anywhere. This is R8-01's own result — "$50 committed against a $20
month, executed" — reproduced at 2.4× the magnitude *through the type that was
built to make it structurally impossible*.

The shape is the one the last three rounds keep producing: the fix closed the
argument that was attacked and left the argument beside it open. R8-01's own
sentence applies unchanged — "no caller does that today" is not a safety
property, and here `deps.meter`'s clock is supplied by the same caller that
`deps.meter` was.

**Required correction:** the same remedy the human already ruled for the
resolver. `FrozenCapsSpendMeter` should bind the clock by construction —
`Date.now`, or a monotonic source the class owns — with no parameter that
widens. `MemorySpendMeter` keeps its injectable clock for the tests that need
one, and `llm()` already refuses it. If an injected clock must remain, it needs
a bound (refuse a jump larger than some multiple of the elapsed real time since
the last call) and a mutation entry, and the residual belongs in the ledger
rather than in a source comment.

---

## R9-06 — R8-04b's CI-trigger lock is defeated by ordinary YAML (severity 1)

**Attacked:** the second half of R8-04, and whether its lock holds the shape it
claims.

`locks-r7.test.ts:543` finds the workflow's filters with:

```ts
const filters = [...wf.matchAll(/^\s*paths:\s*(\[.*\]|)\s*$/gm)];
```

The alternation's second branch is **empty**, so the pattern also matches a bare
`paths:` line — the block-sequence form, which is how most GitHub workflows are
written:

```yaml
  pull_request:
    paths:
      - "fullburn/**"
```

**Executed:**

```
B1 filters matched: 2  captures: ["",""]
B1 admits .github/CODEOWNERS ? true   globs: []
```

`rawList` is `""`, `globs` becomes `[]`, and `admits()` short-circuits to `true`
for every witness. The lock passes while the filter excludes `.github/**`
entirely — R8-04b's exact defect, restored by a whitespace-level rewrite that no
reviewer would flag.

The `R8-04b CI runs on .github changes` mutation entry only exercises the inline
form, so it is a strawman relative to the real evasion.

**Required correction:** parse the YAML rather than regexing it (or at minimum
handle the block-sequence form and **fail closed** on a `paths:` whose value the
check cannot read — the rule `runnerTargets` already applies to a `testDir` it
cannot evaluate). An unreadable filter is not "no filter."

---

## R9-07 — the new standing invariant's enumeration is a hard-coded list of one (severity 3)

**Attacked:** the invariant added this round, on the axis the human named.

```ts
const scripts = readdirSync(dir).filter((f) => f.endsWith(".mjs"));
const writers = scripts.filter((f) =>
  /writeFileSync\(\s*path\s*,\s*original\s*[.+]/.test(readFileSync(new URL(f, dir), "utf8")));
expect(writers, "no writing tool found — the enumeration is broken").toContain("mutate.mjs");
```

**Executed:**

```
B4 scripts: adversary-gate, class2-gate, diff-lib, gate-lib, leak-check, mutate-lib, mutate, owed-approvals, scan-lib
B4 detected writers: mutate.mjs
B4 does it see a tool that writes writeFileSync(target, text.replace(...))?  false
```

The definition of a weakening write is one exact spelling — the local variable
names `path` and `original`, in that order, with `writeFileSync` unaliased.
Every plausible second tool evades it: a different variable name, `fs.writeFileSync`,
`await writeFile`, `appendFileSync`, `renameSync` over a rewritten temp file, or
`execSync("sed -i …")`. So does any writing tool that does not live in
`engine/scripts/` or does not end in `.mjs` — a `.ts` codemod under `engine/`, a
root-level script, anything in `config/`.

The claim in the comment — "It is enumerated from the filesystem, not from a
list, so a NEW writing tool is covered the day it lands rather than the day
someone remembers" — is therefore not true. The enumeration is a list of one
with a regex in front of it.

**On the stale-regex question the human asked:** the check *does* fail closed if
the regex stops matching `mutate.mjs`, because of the `toContain` assertion, and
the brief records that it already did so once this round. That behaviour still
holds — I confirmed the same assertion is what catches the
`R8-STANDING crash marker written first` mutation. But it fails closed for
`mutate.mjs` **only**. A second tool's spelling drifting out of the regex is
silent, which is the direction that matters for an invariant whose stated
purpose is covering tools that do not exist yet.

**Required correction:** widen the writer test to "reads a file and writes back
something derived from it" — detect any `writeFileSync`/`writeFile`/`appendFileSync`
call whose second argument is not a bare identifier matching the variable the
file was read into — walk the whole workspace rather than one directory, and
assert a **count**, not a membership: if the enumeration finds fewer writers than
a committed expected set, fail. And state the residual honestly: a static scan
cannot enumerate writing tools, so the invariant is a tripwire, not a proof.

---

## R9-08 — the unreachable-guard sweep (severity 3)

The human's instruction was to treat L28 as a pattern and sweep everywhere a
newly-added fail-closed check now precedes an older one. Results, with a verdict
for each.

### (a) `llm()`'s post-reserve reservation validation — DEAD, undisclosed, untested

`gateway.ts:240-245`:

```ts
reservation = meter.reserve(req.clientId, card.costBudgetUsdPerCall);
if (
  reservation === null || typeof reservation !== "object" ||
  reservation.clientId !== req.clientId || !Number.isFinite(reservation.amountUsd)
) {
  throw new MeterUnavailableError("meter returned an invalid reservation — refusing spend (fail closed)");
}
```

Nothing reaching this line can fail it. Two lines earlier, `isFrozenCapsMeter`
has already established that (i) the meter carries the module-private brand and
(ii) **`meter.reserve === MemorySpendMeter.prototype.reserve`**. That method
either throws or returns `new SpendReservation(RESERVATION_BRAND, id, clientId,
fromMicros(amountMicros))` — a frozen class instance whose `clientId` *is* the
argument and whose `amountUsd` came through `toMicros`' `Number.isSafeInteger`
guard. **Executed:**

```
A2 reservation: SpendReservation  fixture-testco  0.001  frozen=true
```

This is the L28 class, in the same function, created by the same R8-01 fix — and
unlike L28 it is not disclosed anywhere, has no test, and has no mutation entry.
It reads as a money guard.

**Verdict: delete it.** `requireReservingMeter` earned its reprieve because
`SpendMeter` declares all four methods optional, so the contract is real for a
future implementation and can be unit-tested. This guard has no such future: it
validates the return value of a method the line above pinned to a specific
function object. Keeping it means keeping a line that can never be exercised in
the file whose comments the next reviewer will read as enforcement.

### (b) `requireReservingMeter` — DEAD, disclosed. The disclosure is right; the entry is not

L28 is honest and the unit test is the right call: `SpendMeter`'s four methods
are optional in the type, so the contract binds any future meter. But the
mutation entry `R5-07 reservedUsd required` still sits in a table whose only
published output is `105 caught`, and L28 is the only place that says the catch
comes from a hand-built object the money path refuses. **Verdict: keep the
guard and the test; annotate the entry in the table itself** (the table already
carries this discipline in prose for R6-05/M4, M6, M7 and M14), so the harness
line cannot be read as money-path protection without also reading L28.

### (c) `assertScannableRoot`'s new first guard — redundant, and its mutation entry is a strawman

R8-07 moved the `!existsSync(repoRoot)` check ahead of the early return. Correct
fix. But it now sits immediately above `!existsSync(join(repoRoot, "fullburn"))`,
which throws for the same input. Under its own mutation entry
(`R8-07 missing root is an error` → `if (false)`), `leak-check /nonexistent-root`
still throws and still exits non-zero: the R8-07 defect — a green scan over zero
files — **does not return**. The entry is caught only because
`scan-lib.test.ts:140` asserts the error *message* matches `/does not exist/`.

**Verdict: keep the guard, relabel the entry.** A message lock is fine; calling
it protection of a fail-closed behaviour is not. The behavioural mutation that
would restore R8-07 is re-inserting the early `return findings;`, and that is
what belongs in the table.

### (d) Checks I confirmed are still reachable

`isFrozenCapsMeter`'s `null`/type test, the `new.target` finality check, the
`SpendReservation` brand (disclosed as defence-in-depth), the resolver
requirement, `caps === null` in `reserve()`, `typeof deps.transport?.post`, and
`RUN_FILTER_KEYS` in `runnerTargets` are all reachable from a test that exists.
No further dead guards found in this round's diff.

### (e) The asymmetry `isFrozenCapsMeter` chooses is defensible for caps, and is a Law-10 hole

Pinning `reserve` and not `settle`/`release`/`todayUsd`/`monthUsd` is argued at
length in the source, and for **cap enforcement** the argument holds: a settle
that does nothing leaves the reservation open and `reserve` counts it. But
`todayUsd` and `monthUsd` are the readings an operator and, later, a client
report will consult. **Executed:**

```
A3 still a frozen-caps meter after patching settle/monthUsd/todayUsd: true
```

`llm()` does not read them today, so this is an observation rather than a
finding — but the comment claims the asymmetry "is exactly Law 2's requirement,"
and Law 10 is the one it leaves open. Worth a sentence in the source or a ledger
row before any reporting path reads a meter.

---

## R9-09 — `recoverInFlight` writes whatever a marker names (severity 3)

**Attacked:** the marker protocol, on every axis the human listed.

```js
fs.writeFileSync(record.path, record.original);
```

There is no check that the path exists, that it is inside the repository, that
the current content is the mutated content, or that the marker was written by
this checkout. **Executed:**

```
B5 recovery of a path that does not exist: {"path":"…/never-existed.ts","repaired":true}  created: true
B5 after recovery, live.ts = "// stale pre-crash content\n"
```

Recovery **creates** a file that never existed, and **overwrites newer content
with stale pre-crash bytes**. The realistic sequence: a run dies, an engineer
repairs the file by hand and commits the fix, the next `npm run mutate` silently
reverts the commit. It prints `RECOVERED`, which is the only warning.

**Two harnesses at once.** `MARKER` is a fixed path with no lock, no PID and no
checkout identity. `restoreInFlight()` ends with `rmSync(MARKER, {force: true})`,
so harness A deletes harness B's marker — B's crash protection, gone — while B's
startup `recoverInFlight()` un-applies A's live mutation in the middle of A's
measurement, turning a genuine catch into a reported survivor. I reproduced the
tree-corruption half of this by accident, running my own probe against the same
copy a harness was working on: four mutations were left permanently applied
across two files, each one looking like ordinary source. That is the same
afternoon the brief describes, caused by the same absent lock.

**A marker naming a path that has since moved** resurrects it, per B5 above.

**The marker is not gitignored.** `fullburn/.gitignore` lists `node_modules/`,
`dist/`, `test-results/` and `playwright-report/`. A crashed run therefore
leaves an untracked file under `fullburn/engine/scripts/` — a Class-2 directory —
containing a full copy of a source file. `adversary-gate.mjs`'s `assertCleanTree`
correctly refuses it, which is fail-closed; but `git add -A` commits it, and once
committed the invariant suite is red until someone deletes it.

**Required correction:** take an exclusive lock (`open` with `wx`) on the marker
and refuse to start if one is held; record the harness PID and the repo root in
the marker and refuse a marker from another; validate that `record.path` resolves
inside the workspace and that the file currently on disk is *not* already the
original before writing; and add `.mutate-inflight.json` to `.gitignore`.

---

## R9-10 — a Class-2 test file cannot be reviewed in a diff (severity 3)

`engine/test/hardening.test.ts` contains three NUL bytes (offsets 7588, 7836,
8031) in a deliberate vault key-injection fixture. There is no `.gitattributes`
in the repository. Git therefore classifies the file as binary:

```
$ git diff 4c885f1..aaa6416 -- fullburn/engine/test/hardening.test.ts
Binary files a/fullburn/engine/test/hardening.test.ts and b/fullburn/engine/test/hardening.test.ts differ
```

The whole point of this round's CODEOWNERS work is that a human reviews Class-2
diffs before they merge. `fullburn/engine/test/` is Class-2, this file changed by
232 bytes in `aaa6416`, and neither `git diff` nor GitHub's PR view renders one
line of it. `--text` is required to see the change — which a reviewer will not
think to pass on a file the UI has labelled binary.

The file's history is exactly the reason this matters: `gate-lib.mjs` says of the
test directories, "tests are the only thing standing between a defect and a green
gate, so silencing one is a human decision." A human cannot make that decision
about a diff they cannot see.

**Required correction:** either build the NUL bytes at runtime
(`"acme corp"` written as `"acme" + String.fromCharCode(0) + "corp"`, which
keeps the test identical and the file text), or add
`*.test.ts diff` / `*.ts text` to a `.gitattributes` and make `.gitattributes`
Class-2. A test that asserts no tracked file under a Class-2 path is
git-binary would close the class.

---

## R9-11 — H20 e2e expiry, evasions five through eight (severity 5)

Four more, all executed against `e2eVarianceHolds` as committed, all reporting
the variance as **holding** while Playwright executes nothing of substance:

```
B2 HOLDS (evasion)  <- test.describe.skip('suite', () => { test('intake confirm flow', …) })
B2 HOLDS (evasion)  <- test('intake confirm flow', async ({page}) => { return; await page.click(…); expect(…) })
B2 HOLDS (evasion)  <- test('intake confirm flow', async ({page}) => { test.fail(); await page.click(…); expect(…) })
B2 HOLDS (evasion)  <- test('intake confirm flow', async ({page}) => { if (!process.env.RUN_E2E) return; … })
```

The first needs no intent to deceive — `test.describe.skip` around a suite is
ordinary Playwright, and the skip lives *outside* the body `namedTestBody`
extracts, so the runtime-skip check added by R8-06 cannot see it. `test.fail()`
inverts the assertion: the test now passes only if the flow is broken. The bare
`return;` is the R8-06 defect with two fewer characters.

This is the fifth consecutive round in which a body-shape regex has been walked
around, and R7-08's own prescribed remedy has now been declined four times:

> query the *resolved* runner configuration (`playwright test --list --reporter=json`)
> and require execution evidence from a tagged test, rather than regexing the
> config source.

`L24` already concedes the static check cannot judge whether the test is a good
one. It should also concede — in the ledger, not only in a source comment — that
it cannot tell whether the test runs at all. **Required correction:** the
Phase 1 gate should require a JSON listing from the real runner plus a passing
tagged run, and until then L24 should say plainly that the expiry is defeatable
by four one-line edits.

## Mutation-harness audit

The claim `105 mutations: 105 caught, 0 survived, 0 not found` is **true as
printed, and could not have printed otherwise** (R9-01). The table has 105
entries; I read every one.

I re-ran the whole table myself with the marker artifact removed and no other
process competing for the machine. Results in
`ADVERSARY_REPORT` terms:

- **`R8-STANDING self-targeting entries cannot rewrite the table` SURVIVES**
  (R9-02), verified twice in isolation on a git-clean tree.
- One entry is a **strawman**: `R8-07 missing root is an error` does not restore
  the defect it names; it changes an error message (R9-08c).
- Three entries are **caught by a unit test rather than by the path they name**,
  and only one of the three says so: `R5-07 reservedUsd required` (disclosed in
  L28), plus the two `R7-10` grade entries, which are caught by the identity
  check they mutate rather than by any consumer of a grade.
- The **CODEOWNERS entries are strawmen relative to the real evasion** (R9-04):
  all three comment out a whole rule; none removes only an owner.
- The **`R8-04b` entry is a strawman relative to the real evasion** (R9-06): it
  tests the inline-array spelling only.
- **Three checks in `locks-r7.test.ts:505-507` are grep-over-source assertions
  that the mutation table can satisfy by containing the text.** Two of the three
  can (R9-02).

Entries I attacked and found genuinely protected, for the record: the five
`R8-01` entries other than the prototype-pinning strawman risk (the wide-meter
attack really is refused through `llm()` — I re-ran it and got `dispatched: 0`),
`R8-02` (`settle.length === 1` and the two overreach assertions bite),
`R8-03` (the month-key lock now drives a real client-local rollover from both
sides, plus DST and UTC+14, and the revert dies), `R8-05` (the deep freeze
holds — I could not launder a genuine array by element write, by
`defineProperty`, or through a `Proxy`), and `R8-08`.

## §10.2 standing-invariant checklist

| Invariant | Result |
|---|---|
| Writes-only; no mass-read of platform APIs (Law 1) | **PASS** — structural rule fires on a seeded `graph.facebook.com` fetch; write-verb half correctly deferred to Phase 6 |
| Spend caps present, immutable at runtime, tested by attempted breach (Law 2) | **FAIL** — the ceilings are structural now, but the period they bind to is caller-supplied: $120 committed against a frozen $20 month through the production meter (R9-05) |
| Per-client isolation; seeded cross-tenant read fails (Law 3) | **PASS** — `vaultForClient("client-b").get("token")` throws `VaultError`; scope cannot be re-pointed; `llm()` refuses a cross-scoped trace context and a mismatched vault |
| Every LLM call through AI Gateway; every decision traced (Law 11) | **PASS** — transport URL asserted against `gatewayBaseUrl`; refusals traced; trace loss surfaced on the thrown error |
| Proxies-kill-only in code (Law 5) | Deferred to Phase 5 — declared, phase matches §11 |
| No prediction-gate code paths (Law 6) | **PASS** — structural rule fires on a seeded `predictedRoas < target` gate |
| Trust ladder cannot skip rungs (Law 8) | Deferred to Phase 5 — declared |
| `decisions` ledger append-only | Deferred to Phase 2 — declared |
| External content is data, never instructions | **PARTIAL PASS** — hostile payload through `llm()` leaves caps, bindings and channels untouched. I swept the whole tree for instructions aimed at this review; the only matches are the project's own seeded fixture and quoted history. **No prompt injection found.** |
| `VERDICT.md` hash-locked | Deferred to Phase 6 — file does not exist yet; the append-only machinery that will guard it is live and exercised against a real git repo |
| Tokens only in the vault | **PASS** — `leak-check ..` clean over the whole repository; the vault never echoes a value even on a miss; the R8-07 root guard now fires |
| Queue past SLA waits; locked flags structurally inert | **PARTIAL PASS** — `requireActiveChannel("tiktok")` and `("google")` both throw `SwitchboardError`; `activeChannels() === ["meta"]`. Queue half deferred to Phase 6 — declared |
| **NEW: any tool that can write to the source tree is import-safe and fails closed** | **FAIL** — import-safe: yes, verified (nothing imports `mutate.mjs`; `mutate-lib.mjs` is genuinely runner-free). Fails closed: no — SIGINT/SIGTERM cannot restore (R9-03), SIGKILL leaves the tree mutated, recovery is unvalidated (R9-09), and the enumeration sees one spelling in one directory (R9-07) |

## Governance checks (Phase A step 7)

- **`VERDICT.md` hash intact** — n/a, Phase 6 deliverable.
- **Token scan** — clean, whole repository, structural rules armed.
- **Hostile instructions in fixtures** — swept the whole tree; the only matches
  are the project's own inert fixture and quoted adversary history. **No prompt
  injection found, and none aimed at this review.**
- **Queue item past SLA** — no queue exists; correctly declared not-yet-applicable.
- **Locked market/channel flag activation** — structurally impossible: no runtime
  mutation API, `deepFreeze`d registries, accessor-only reads enforced by a
  structural scan rule.
- **Second client while one is unstable** — no onboarding path exists.
- **Class-2 self-approval** — `checkApprovalAuthorship` refuses
  `Claude <noreply@anthropic.com>`, `github-actions[bot]` and `Claude Opus 5`;
  the CLI supplies `%an <%ae>` from git. This works. R9-04 is about the artifact
  beside it.
- **Adversary did not modify anything** — no source file, test, config, ledger,
  workflow or existing report was edited. Every experiment ran against
  throwaway copies of the repository under the session scratchpad; `git status`
  in the working tree is empty and the verified-scope hash is
  `c824ae67a8213794a8b314f8d56fe1577f596b6d`, unchanged before and after. Nothing
  was committed. I have not touched the Grade Registry, its thresholds, the Laws,
  the improvement loop, or my own definition.

## Additional observations (not verdict-determining)

- **The suite is not deterministic under load.** `integration/gate-cli.test.ts`
  spawns real `git` processes and is 80% of the suite's wall time; under CPU
  contention I saw it fail spuriously. Inside the mutation harness a flake is a
  free CAUGHT. Phase B calls flaky tests findings against the adversary; they are
  findings against the harness too.
- **A spec/constitution divergence.** CLAUDE.md now carries a 13th standing
  invariant that ENGINE_BUILD.md §10.2 does not, and `invariants.test.ts:375`
  asserts §10.2 has exactly 12 bullets. The build protocol says ENGINE_BUILD.md
  wins on any ambiguity. This is a spec finding for the human: either §10.2 gains
  the bullet (and the count moves to 13), or CLAUDE.md records why the two lists
  differ.
- **`index.ts` — the deployed Worker entrypoint — exports `MemorySpendMeter`,
  which `llm()` refuses, and does not export `FrozenCapsSpendMeter`, which is the
  only meter it accepts.** Fail-closed, but a consumer of the entrypoint has no
  way to construct a usable meter.
- **`tableEnd` is the FIRST `"\n];"` in `mutate.mjs`.** A future entry whose
  `from` or `to` text contains that sequence moves the boundary into the table
  and re-opens the self-reference bug R9-02 already found unlocked.
- **`CLASS2_PATTERNS` still reaches outside Fullburn** — 18 of 98 Class-2 files
  are in the sibling `haven/` and `pulsern/` trees, and CODEOWNERS now demands
  human review for them. r8's observation, unchanged.
- **`validateOutput` still uses `key in obj`**, so an inherited property
  satisfies a required field, and numeric fields still accept `NaN` and
  infinities. r7 and r8 observation, unchanged.
- **`new URL(model.gatewayRoute, deps.gatewayBaseUrl)`** still does not prove the
  result is an approved AI Gateway origin. r7 and r8 observation, unchanged.
- **Committed and zero-valued period entries are never pruned.** r7 and r8
  observation, unchanged; it interacts with R9-05 once the meter is DO-backed.

## Verdict basis

**FAIL.**

R9-01 is sufficient on its own and is the finding that subsumes the round.
`npm run mutate` is the gate this project uses to decide whether a money-path fix
is protected, it was made a CI stage this round precisely so it could fail, and
on this tree it is arithmetically incapable of failing. Every protection claim
the r9 commits make rests on a measurement that certifies everything.

R9-02 is what that concealment was hiding: measured honestly, one of the five
fixes added this round is unprotected — and it is the fix for the self-reference
bug that produced three false survivors in the previous session, defeated by the
exact trap two files in this repo describe in their own comments.

R9-05 is the round's money finding, and it is the same shape r8 named: **each fix
closes the argument that was attacked and leaves the argument beside it open.**
R8-01 removed the resolver; the clock stayed, and the clock decides which ceiling
a charge lands under. $120 against a frozen $20 month, through the type built to
make that impossible.

R9-04 and R9-06 are the control-plane pair, and they rhyme with R9-01: three
artifacts created this round to make "human-only" and "no ungated Class-2 diff"
real, each locked by a check that passes on a file that has stopped doing its
job. A CODEOWNERS with no owners, a `paths:` filter written as a YAML list, and a
mutation harness that always says CAUGHT.

R9-03 and R9-07 are the standing invariant added this round failing on both of
its halves — asserted by grepping for the strings "SIGINT" and "SIGTERM" in a
runner where they cannot execute, and enumerated by a regex that matches one
spelling of one tool.

## Minimum re-review gate

1. Make the harness prove a green baseline before it measures anything, and stop
   it running a suite that can observe its own state. Re-run the full table and
   publish the real numbers.
2. Lock the self-reference rule by driving `applyEntry`, not by grepping for
   `searchFrom(path)` — a table entry must not be able to satisfy it.
3. Either make the harness loop asynchronous so its signal handlers can run, or
   delete them and move recovery to something that runs on every suite.
4. Parse owners in `codeownersCovers`, last-match-wins; fail the lock on an
   owner-stripped CODEOWNERS; add a mutation entry that removes an owner.
5. Bind the clock by construction on `FrozenCapsSpendMeter`, or bound the forward
   jump and lock it. $120 against $20 must not be reachable through the
   production type.
6. Make the `paths:` check parse YAML and fail closed on a filter it cannot read.
7. Delete `llm()`'s post-reserve reservation validation; relabel the `R8-07` and
   `R5-07` entries in the table so no line reads as protection it does not give.
8. Validate, lock and gitignore the crash marker.
9. Make `hardening.test.ts` text, and assert no tracked Class-2 path is
   git-binary.
10. Re-attack. This report remains FAIL for
    `c824ae67a8213794a8b314f8d56fe1577f596b6d`.
