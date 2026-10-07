# ADVERSARY REPORT phase0.r5
Verdict: FAIL
verified-tree: 5f956c0e45e50aef8666d712019e00bb23ab6451

Target: `eb0775f481239f0c8558e8a963422be0e8d7ec8d` on `claude/fullburn-engine-spec-r7v5lg`.
Tree hash computed independently and confirmed.
Scope set by the human: (1) regression on my own r4 findings N-01..N-11, (2) hardest
possible attack on the H8 money change, (3) independent verification of the 36-mutation
claim plus my own mutations, (4) the two human decisions H20/H8, (5) the approval and
gate machinery, (6) ledger honesty. All work ran in isolated clones under the scratchpad
with a real `npm install`; isolation was verified before any result was trusted.

**Verdict basis.** FAIL on four independent grounds, each reproduced by execution:

1. **A 2× breach of the approved $200/month ceiling using nothing but the shipped
   meter's public API and a plain object literal.** $400 of real spend lands while the
   meter reports $200 and its own comment claims the guard exists. (R5-01)
2. **`fullburn/playwright.config.ts` is Class-1.** §10.3's fifth CI stage — the one the
   H20 variance is entirely about — is replaceable with a stub that never launches a
   browser, in a diff containing only Class-1 files, with all five stages and all three
   gates green. This is R3-CP-03/N-02's defect class for the fourth consecutive round,
   through a filename **this commit itself introduced**. (R5-02)
3. **A signed human approval can be silently rewritten after the fact** with every gate
   green and the verified-tree hash unchanged. `APPROVALS/README.md` claims entries are
   "append-only history, like reports/"; CI enforces that for `reports/` and not at all
   for `APPROVALS/`. (R5-05)
4. **A correctly bound, plainly rendered `Verdict: FAIL` is still silently discarded** —
   through ordinary Markdown formatting rather than fence length. Six executed variants;
   the gate's output never names the report. (R5-03)

**Credit, stated plainly and without hedging.** This is the strongest commit in the
series. Eleven of my eleven r4 findings are closed or closed-as-disclosed; not one is
untouched, which has not been true of any previous round. `npm run mutate` really does
report 36/36 and I confirmed every one of them by running the harness myself. The two
disclosures inside that harness are honest — I verified both by execution rather than
reading them. The monthly ceiling genuinely binds through the real `llm()` call path: I
drove 5,600 calls and it stopped at exactly $20.00 on the fixture's month and rolled
over correctly into the next. N-06's token-splitter is properly dead and the exemption
that replaced it does not travel. `npm run invariants` runs, integration and e2e stages
exist and execute, and the sibling trees are scanned. That is real work.

---

## 1. Baseline (isolated clone, `npm install` real, `node_modules/@fullburn/config` resolving inside the clone)

```
npm test          Test Files 18 passed (18)   Tests 232 passed (232)      exit 0
npm run typecheck                                                        exit 0
npm run integration            Test Files 1 passed    Tests 8 passed     exit 0
npm run invariants             Test Files 1 passed    Tests 13 passed    exit 0
node engine/scripts/leak-check.mjs ..     leak/structural scan: clean    exit 0
npm run e2e (PLAYWRIGHT_CHROMIUM_PATH set)   1 passed (1.5s)             exit 0
npm run mutate            36 mutations: 36 caught, 0 survived, 0 not found
```

Gates against the commit under review:

```
class2-gate.mjs . b1fc37d  -> class2 gate: Class-2 changes carry transition approvals   exit 0
adversary-gate.mjs . b1fc37d -> FAIL: ADVERSARY_REPORT_phase0.md ... re-run the adversary  exit 1
```

The class-2 gate accepting the H8 approval is correct and I verified it is not
self-approving: the adversary gate refuses on tree staleness until this report lands.

The e2e stage genuinely drives a browser. I confirmed the spec is not a stub: it calls
`page.evaluate(() => 6 * 7)` and gets 42 out of a real Chromium process. That half of
H20 is real — see R5-02 for what is not.

---

## 2. Regression on my own r4 findings

| r4 | Status | Evidence (executed) |
|---|---|---|
| **N-01** frozen-epoch default clock | **CLOSED** | `new MemorySpendMeter()` is `error TS2554: Expected 1 arguments, but got 0`. A meter with no day boundary is a compile error. Both clock mutations caught. |
| **N-02** `vitest.workspace.mts` Class-1 | **CLOSED as filed** | Full 4×7 matrix (`vitest.workspace`/`vitest.projects`/`vitest.config`/`vite.config` × `.ts .mts .cts .js .mjs .cjs .json`) → **zero** Class-1 leftovers. The *class* is not closed: see R5-02. |
| **N-03** base-commit binding | **CLOSED (A, B); C is a disclosed trade-off** | Omitted / empty / null `baseCommit` all now return `refusing (fail closed)`. Leg B: the CLI is now covered by `engine/test/integration/gate-cli.test.ts` and the property-rename mutation turns **5** tests red. Leg C (tip vs merge-base) is recorded in L18 and `APPROVALS/README.md` now documents the tip. |
| **N-04** `readTreeBinding` fence length | **CLOSED as filed** | One parser now serves both readers; fence length is compared; the mutation is caught. The *defect class* is open — R5-03. |
| **N-05** `<details>` concealment | **CLOSED as filed** | `stripConcealed` kills paired and unterminated blocks. Class open — R5-04. The fix's own truncation half is unlocked — R5-07. |
| **N-06** fixture allowlist as token splitter | **CLOSED** | All three r4 evasions now FLAG in source files. Matching happens first, the excuse applies to the matched span, and any spliced key material leaves alphanumeric residue. The r4 evidence exemption is exact-path-scoped and does **not** travel: it fails under `reports/…`, `./fullburn/reports/…`, and `haven/fullburn/reports/…`. |
| **N-07** silent `release()` leak | **CLOSED as disclosed** | 700 pre-departure failures: `ok=0 refused=700 committed=$0 reserved=$5`, and **500 of the traces now carry** `[reservation leaked: meter.release threw Error; $0.01 of headroom remains consumed for a request that never departed]`. The leak itself is unchanged; it is now a documented `SpendMeter` contract requirement and the shipped meter cannot throw. I filed this at severity 1 in r4 and I stand by that ranking, but I accept this resolution — making an unfixable-here failure loud and contractual is the right answer, not a dodge. |
| **N-08** never-departed settled as billable | **CLOSED** | `post` absent → `ops=[reserve\|release] committed=$0.0000`. Synchronous throw → `ops=[reserve\|release] committed=$0.0000`. Rejection after handoff → `ops=[reserve\|settle] committed=$0.0100`. The flag now means what it says. |
| **N-09** in-flight reservation invisible across midnight | **CLOSED** | Reservation of $3 taken 2026-08-31T23:59:59 reads `reservedUsd=$3` before *and* after the roll; settles to `monthUsd(Aug)=$3, todayUsd(Aug31)=$3`. |
| **N-10** README's base-commit wrong | **CLOSED** | README now says the tip and explains why; `class2-gate` prints `(base <ref> = <sha>)`. |
| **N-11** `package-lock.json` Class-1 | **CLOSED** | Now Class-2. The exploit half of that hypothesis remains unexecuted and is now moot. |
| **r4 lock 8** WeakSet brand | **CLOSED** | `r4-lock8 WeakSet brand` mutation caught, 1 test red. |

**11 of 11 addressed. Nothing I filed in r4 was ignored.**

**Correcting myself.** My r4 §6 observation 1 asserted that inside `fullburn/` the entire
Class-1 surface was four paths. That enumeration was already incomplete for its own tree
and is plainly wrong for this one — `playwright.config.ts`, `fullburn/e2e/**` and
`.npmrc` are all Class-1 and executable. I should have derived that surface from
`isClass2()` over the full path space rather than eyeballing tracked files. The remedy I
recommended in that same paragraph — deny-by-default with a small explicit Class-1
allowlist — is exactly what R5-02 vindicates, and I now think it is the only fix that
ends this. Four rounds, four new filenames.

---

## 3. Findings

### R5-01 · severity 1 money loss · The reservation handle is unauthenticated: a plain object literal releases live reservations and breaches the approved $200/month ceiling by 2× while the meter reports $200

**Spec:** Law 2; `caps.ts:33-35` (`monthlyAiSpendUsd` — "the real exposure ceiling");
H8 as signed; `spend-meter.ts:259-261`, whose own comment states the guard's purpose:
*"A reservation handle from another meter, or a forged one, must not move another
client's ledger."*

**Root cause.** `#close()` accepts any object whose `id` matches an open reservation and
whose `clientId` matches that reservation's client. It checks nothing else. Ids are
`r1, r2, r3, …` from a per-instance counter, so they are guessable by construction and
they collide *deterministically* between two instances serving the same client. There is
no brand, no nonce, no instance identity — even though this project already uses exactly
that technique one directory away (`models.ts` brands `EvalAttestation` with a `GENUINE`
WeakSet, which is r4's lock 8).

**Reproduction — pure forgery, one meter, no second instance required.** Client
`pulsern` at its approved ceilings; the day widened so the *month* is what binds:

```
C1 reservedUsd=$200; 201st refused: yes            <- the month is correctly full, in flight
   for (let i = 1; i <= 200; i++)
     m.release({ id: `r${i}`, clientId: "pulsern", amountUsd: 0 });
C1 after 200 forged releases: reservedUsd=$0
C1 the 200 REAL settles recorded: monthUsd=$0      <- $200 of departed, billable spend vanishes
C1 further dollars accepted = $200; final monthUsd=$200; REAL spend = $400
```

Two distinct failures in one sequence. The forged releases delete the open records, so
the 200 genuine `settle()` calls for requests that **already left the building** find
nothing and commit nothing — $200 of real provider spend is recorded as $0. Then the
freed headroom admits another $200. Total real exposure **$400 against a $200 approved
ceiling**, with `monthUsd()` reporting exactly $200, the approved figure, the whole time.
That is a cap breach and a data lie in the same operation.

**Reproduction — the production shape, two instances, no forgery at all.** L14 states
plainly that a fresh meter starts fresh after a restart or DO eviction. A handle minted
by one instance is accepted by another:

```
B1 live: reservedUsd=$200 monthUsd=$0
B1 live correctly refuses the 201st dollar
   (a second instance mints r1..r200 for the same client; those handles are fed to live.release)
B1 after foreign releases: live.reservedUsd=$0
B1 extra dollars accepted AFTER the month was already full = $200
B1 FINAL monthUsd = $200   (approved ceiling: $200)
```

And a foreign **settle** charges the wrong amount:

```
B2 b.todayUsd after settling a 1-cent handle = $9 (handle said $0.01)
B2 b.reservedUsd = $0, but the real $9 request is still in flight
```

**Blast radius today.** Nothing in production constructs two meters for one client yet,
and no caller today forges a handle. This is the same standing the project accepted for
M-04 and N-07, and I rank it consistently: severity 1, below nothing, but with the
qualification stated. What separates it from those is that it is **fully executed
against the shipped class's public API**, that the guard the code says exists does not
exist, and that the exact conditions producing it — one client, two meter instances, ids
restarting at `r1` — are the ones L14 documents as expected behaviour after a restart.

**Not disclosed anywhere.** L14, L17 and L20 all discuss the meter; none mentions handle
authenticity or id reuse.

---

### R5-02 · severity 1 money loss (control plane) · `fullburn/playwright.config.ts` is Class-1, so §10.3's fifth CI stage can be replaced with a stub in a Class-1-only diff, with every stage and every gate green

**Spec:** `gate-lib.mjs:26` — *"The gates themselves and everything that decides whether
they run"*; §10.3's five stages; H20's terms.

```
isClass2("fullburn/playwright.config.ts") = false
isClass2("fullburn/e2e/fake.spec.ts")     = false
```

`playwright.config.ts` decides `testDir`, `forbidOnly` and how the browser launches. It
was **added by this commit** (`332861f`, "install the §10.3 Playwright stage") and it is
not in `CLASS2_WITNESS_PATHS`, so the bidirectional witness test raises nothing.
`fullburn/e2e/` sits outside `fullburn/(config|engine)/test/`, so a replacement spec is
Class-1 too.

**Reproduction, executed end to end.** Diff contains exactly two files, both Class-1:

```
$ git diff --name-status eb0775f...HEAD
A       fullburn/e2e/fake.spec.ts          (test("stub", async () => { expect(1).toBe(1); }))
M       fullburn/playwright.config.ts      (testDir: "engine/test/e2e" -> "e2e")

$ npm run e2e          ✓ 1 e2e/fake.spec.ts:2:1 › stub (12ms)   1 passed   EXIT=0
$ npm run invariants   Tests 13 passed          <- the H20 variance still "holds"
$ npm test             Tests 232 passed (232)
$ npm run typecheck    EXIT=0
$ node engine/scripts/leak-check.mjs ..   leak/structural scan: clean   EXIT=0
$ node fullburn/engine/scripts/class2-gate.mjs . eb0775f
  class2 gate: no Class-2 changes (base eb0775f = eb0775f)                EXIT=0
```

No browser is launched, `engine/test/e2e/smoke.spec.ts` is never executed, and the
invariant suite still asserts the variance holds — because it reads the *directory*
`engine/test/e2e/`, never the runner that would execute it. At Phase 0 this costs a
smoke. At Phase 1 it means the intake-confirm e2e coverage the variance exists to
guarantee can be present as a file and never run.

**Same family, also Class-1:** `fullburn/.npmrc` (`npm ci` reads it — the lockfile was
made Class-2 on precisely this reasoning in N-11), `fullburn/.nvmrc`,
`fullburn/vitest_workspace.ts` (underscore; not resolved by vitest, so inert today).

---

### R5-03 · severity 3 data lie (control plane) · A correctly bound, plainly rendered `Verdict: FAIL` is still silently discarded — now through ordinary Markdown formatting

**Spec:** §12 ("0 unreviewed FAILs"); `engine-adversary.md:41`.

The header window is a real improvement and I attacked it as instructed: within ten
lines at column 0 there is no *concealment* hiding place left except R5-04. But the
window did not close the defect class, because `judgeReport` still treats "I could not
parse this report" as **fresh: false**, and `checkAdversaryReport` filters fresh-FAILs
with `judged.find(j => j.fresh && !j.ok)`. A report that fails to yield a binding is
dropped from consideration entirely and a sibling PASS opens the gate — with the FAIL
report never named in the output.

**Executed.** Each report below has `Verdict: FAIL` on line 2, column 0, and the correct
tree hash on line 3. Second column is the gate's answer when a sibling PASS is present:

```
1  honest FAIL                                    -> BLOCKS  (correct)
2  verified-tree: `<hash>`   (hash in backticks)  -> OPENS   sibling-PASS.md: PASS and bound
3  verified-tree: <hash> (tree of eb0775f)        -> OPENS   "report has no 'verified-tree:' binding"
4  **verified-tree:** <hash>                      -> OPENS   "report has no 'verified-tree:' binding"
5  - verified-tree: <hash>   (as a list item)     -> OPENS   "report has no 'verified-tree:' binding"
6  binding on line 11 after a short abstract      -> OPENS   "report has no 'verified-tree:' binding"
8  an unterminated <details> anywhere in the head -> OPENS   "report has no 'verified-tree:' binding"
```

Case 2 is the worst of them, because writing a hash in backticks is ordinary Markdown
practice and the gate's own message is actively misleading:

```
r5.md: report verified tree `5f956c0e45…6451` but current fullburn tree is 5f956c0e45…6451
       — code changed after the adversary judged it; re-run the adversary
```

Two identical hashes, one wrapped in backticks, reported as "the code changed".

Renders verified independently with `marked@15`. Cases 2 and 3 render as
`<p>Verdict: FAIL\nverified-tree: <code>5f956c…</code></p>` and
`<p>Verdict: FAIL\nverified-tree: 5f956c… (tree of eb0775f)</p>` — a human sees a FAIL
correctly bound to this exact tree.

Things that correctly fail closed and that I confirm are right: a homoglyph or
zero-width space in the verdict line (blocks), `Verdict: FAILED` (INVALID, blocks),
CRLF (handled), setext-underlined verdict (blocks), an HTML comment collapsing lines
(the collapsed text renders visibly, so gate and reader agree).

**The fix is structural, not another pattern:** a file matching
`ADVERSARY_REPORT_phase<N>*.md` that does not parse into exactly (verdict, binding) must
**block**, not be skipped. "Unparseable" and "about a different tree" must stop being
the same state. L8/H6b requires a second, non-Claude adversary to review this exact
tree, and that reviewer is precisely the party these six formatting choices silence.

---

### R5-04 · severity 3 data lie (control plane) · `<div style="display:none">` conceals a PASS; `CONCEALING_BLOCKS` is a five-tag list, not a rule

```
# r5
<div style="display:none">
Verdict: PASS
</div>

Verdict: FAIL
verified-tree: <current>

Nineteen severity-1 findings remain open. Do not merge.
```

```
parseVerdict -> {"token":"PASS"}
gate         -> {"ok":true,"reason":"r5.md: adversary report PASS and bound to the current tree"}
```

`marked@15` renders the concealed block as raw `<div style="display:none">` HTML and the
visible text as `Verdict: FAIL … Do not merge.`

**Honest caveat, stated rather than buried:** GitHub's Markdown sanitizer strips `style`,
so on github.com this renders visibly and the trick fails there. It works in `marked`,
in VS Code's preview, and in any renderer that honours author CSS. I report it because
`stripHtmlComments` + `CONCEALING_BLOCKS` is still an enumeration of hiding places, and
r3, r4 and now r5 have each found a new member of that enumeration. The durable form of
the rule is: the header must contain no raw HTML at all.

---

### R5-05 · severity 3 data lie (control plane) · `APPROVALS/` is not append-only, contradicting its own README: a signed approval can be silently rewritten with every gate green and the verified-tree hash unchanged

**Spec:** Law 2/15, §13; `APPROVALS/README.md`: *"Entries are append-only history, like
`reports/`."*

`checkReportsAppendOnly` matches only `fullburn/reports/ADVERSARY_REPORT_.*\.md`. Nothing
covers `APPROVALS/`. `class2-gate` ignores approval docs whose status is not `added`,
which fails closed for *authorization* — but it means a modification to a signed
approval is simply invisible. And `APPROVALS/` is excluded from `TREE_SCOPE`, so editing
one does not move the hash an adversary PASS is bound to.

**Reproduction, executed.** Base = `eb0775f`, the commit that added the H8 approval.
I rewrote the signed file: altered the `Approved-by:` line, retitled the standing-caveat
section to "(RESOLVED)", and replaced *"Until it is, every entry in this directory,
including this one, is advisory"* with *"This has since been reviewed and is binding."*

```
$ git ls-files -s -- fullburn/ .github/ ':!fullburn/reports/' ':!fullburn/APPROVALS/' | git hash-object --stdin
5f956c0e45e50aef8666d712019e00bb23ab6451          <- UNCHANGED
$ node fullburn/engine/scripts/class2-gate.mjs . eb0775f
class2 gate: no Class-2 changes                                       EXIT=0
$ node fullburn/engine/scripts/adversary-gate.mjs . eb0775f
adversary gate: ADVERSARY_REPORT_phase0.probe.md: PASS and bound to the current tree
adversary gate: reports append-only holds                             EXIT=0
$ npx vitest run                 Tests 232 passed (232)
$ head -1 fullburn/APPROVALS/2026-08-16-h8-caps.md
Approved-by: ssb23inc@gmail.com (repository owner) — and the ad caps are hereby enforced
```

Three gates green, tree hash identical, and the only artifact recording what a human
signed now asserts the opposite of what they signed. L11/L13 disclose that an approval
cannot prove *who*; nothing discloses that it does not reliably prove *what*, after the
fact. Applying the same `checkReportsAppendOnly` rule to `fullburn/APPROVALS/**` is a
one-line change and closes it.

---

### R5-06 · severity 3 data lie · The H20 expiry fires at Phase 1 but is satisfied by a one-line string literal, and the guard that was supposed to prevent exactly that has no lock

The expiry **does** fire — I verified it first, because the claim is worth confirming:

```
$ echo 1 > PHASE && npm run invariants
× the H20 e2e variance expires at the Phase 1 gate, mechanically
  → PHASE is 1 or later and the e2e suite is still smoke-only — the H20 variance has
    expired. Real e2e coverage of the intake confirm flow is required …          EXIT=1
```

And the builder's specific claim — that a doc-comment no longer satisfies it — is true.
But comments are the only thing stripped. `e2eVarianceHolds(1, …)` against a non-smoke
spec:

```
A  comment-only ("// real e2e for the intake confirm flow")   -> false   (the claimed fix, real)
B  test("intake confirm flow", async () => {});  empty body   -> TRUE
C  const _note = 'intake confirm';   no test at all           -> TRUE
D  const intake = 0; const confirm = 0;                       -> TRUE
E  test.skip("intake confirm", … throw new Error("never runs")) -> TRUE
```

**End to end at PHASE 1**, with `engine/test/e2e/intake.spec.ts` containing exactly
`const _note = 'intake confirm';`:

```
$ npm run invariants   Test Files 1 passed   Tests 13 passed (13)
$ npm run e2e          ✓ 1 engine/test/e2e/smoke.spec.ts › the e2e stage really drives a browser
                       1 passed                                          EXIT=0
```

Zero tests, zero assertions, no browser, Phase 1 gate satisfied.

**Worse: the comment-stripping guard itself is unlocked.** Two mutations, each removing
one `.replace()` — the exact code the builder says fixed this bug — leave the suite
**232/232 green**. The invariant test that appears to cover it,
`expect(e2eVarianceHolds(1, [smoke])).toBe(false)`, returns false because the smoke spec
is *filtered out by name*, never reaching the comment-stripping at all. Its fixture was
written with an `// … intake confirm …` comment plainly intending to prove the point,
and the filter short-circuits it first. That is this project's own diagnosis of dead
coverage, quoted from `gate-lib.mjs:69`: *"A dead list that tests point at is worse than
no list at all, because it reads as coverage."*

Combined with R5-02, the H20 variance's two halves are both unenforced: the "installed
and running now" half is asserted from a file's existence in a directory the runner can
be pointed away from with a Class-1 edit, and the "expires at Phase 1" half is satisfied
by a substring search.

---

### R5-07 · severity 3 data lie · Four load-bearing guards have no mutation entry; two of them restore a previously-filed finding in one line with the suite green

`npm run mutate` reports 36/36 and that number is accurate for the mutations listed. I
then wrote 20 of my own. Thirteen were caught (including every Class-2 pattern the
harness does not list — `config/src/`, `.github/`, the test tree, `PHASE`, `tsconfig`,
all caught by the bidirectional witness test, which is a genuinely good design). Seven
survived. Four of the seven are load-bearing:

| Mutation | Suite | Consequence, verified by execution |
|---|---|---|
| `gate-lib.mjs`: `return open === null ? stripped : stripped.slice(0, open.index)` → `return stripped` | **GREEN 232/232** | **Reopens N-05 verbatim.** Shipped: `parseVerdict = null`, gate blocks. Mutated: `{"token":"PASS"}` and `{"ok":true,"reason":"z.md: adversary report PASS and bound to the current tree"}` on a report whose visible prose reads "The engine is NOT safe. Do not merge." |
| `adversary-gate.mjs`: delete `assertCleanTree(repoRoot)` | **GREEN 232/232** | **Reopens R2-19 verbatim.** With an untracked `fullburn/engine/src/backdoor.ts` present — shipped: `FAIL: working tree has unstaged or untracked changes in the verified scope … ?? fullburn/engine/src/backdoor.ts`, exit 1. Mutated: `adversary gate: PASS and bound to the current tree`, exit 0. A brand-new unstaged module in the engine source tree sails past a PASS bound to a hash that cannot see it. No test imports this function. |
| `e2e-variance.ts`: either comment-stripping `.replace()` | **GREEN** | R5-06 above. |
| `gateway.ts`: drop `typeof meter.reservedUsd !== "function"` from `requireReservingMeter` | **GREEN** | The test named *"a meter without reserve/settle/release/reservedUsd is refused outright"* uses a fixture missing **all four**, so it passes on any one of them. `spend-meter.ts:59-64` says `llm()` refuses a meter lacking `reservedUsd`; that promise is removable in one line. |

The three remaining survivors are **not** defects and I say so: `Object.hasOwn` on the
caller-supplied narrowing table (a polluted prototype can only *tighten*, since `narrow()`
is `Math.min`), the `DECLARED_FIXTURES` containment loop, and dropping the `/confirm/i`
half of the e2e check.

**The harness's two disclosures are honest — I verified both rather than reading them.**
Restoring the `baseCommit === undefined ||` disjunct is genuinely inert: with the
fail-closed guard returning first, an omitted `baseCommit` still yields *"refusing (fail
closed)"* and the suite stays green. And L19 is exactly right: removing
`assertCapsCoherent(snapshot, clientId)` from `getCaps` leaves **232/232 green**, because
every client in the frozen table is coherent. That is a real limit of mutation testing,
honestly recorded rather than faked. The one thing I would add is that L19 names one
member of that class when there are at least two more.

---

### R5-08 · severity 3 data lie · Day and month keys are read from two separate clock calls, so the pair can disagree at a month boundary

`reserve()` calls `this.#key()` and `this.#monthKey()` separately, each invoking
`#now()`. With a monotonically advancing clock — i.e. `Date.now` — one tick between them
splits the pair:

```
B3 read as Aug 31 : todayUsd=$7  monthUsd(Aug)=$0
B3 read as Sep 1  : todayUsd=$0  monthUsd(Sep)=$7
```

$7 committed to the August 31 **day** and the September **month**. `record()` has the
same shape. The window is one tick per month, so this is not a practical breach route;
it is filed because the human asked whether the pair is coherent under every combination
and the answer is "under every narrowing combination, yes — but not across the boundary
the month accounting exists for". Reading `now()` once and deriving both keys from it
removes it.

**Everything else about the pair is coherent, and I attacked it hard.** Narrowing the
month tightens the day (`Math.min`); narrowing the day leaves the month; narrowing either
below the other holds `dailyUsd <= monthlyUsd`; a narrowing can never raise a ceiling,
invent a client, or supply a sign-off; `assertCapsCoherent` rejects a day above its own
month and a hard ceiling below its own pacing target; and a reservation opened at
23:59:59 on the last day of a month and settled after the roll commits to the month it
was taken in.

---

### R5-09 · severity 5 dummy-proof · Three smaller items on the H8 surface

- **`LlmDeps.capsTable` types only `dailyAiSpendUsd`.** `effectiveAiCapsUsd` accepts and
  honours `monthlyAiSpendUsd`, but an inline literal narrowing the month through `llm()`
  is `error TS2353: … 'monthlyAiSpendUsd' does not exist in type '{ readonly
  dailyAiSpendUsd?: number; }'`. It works today only because the one test that does it
  passes a named `ClientCaps` const. The declared money interface says one cap where two
  are enforced. This is the *only* place I found that still reads a single cap.
- **`record()` writes both ledgers with no cap check.** No caller today and it is
  documented as legacy — but it is on the interface `spend-meter.ts:20-23` tells the
  Phase 5/6 ad-spend path to "adopt unchanged", and it moves money.
- **`caps.ts:149` still refers to `effectiveDailyAiCapUsd`**, a function that no longer
  exists. Stale doc on a money file.

---

### R5-10 · severity 5 dummy-proof · The verdict schema is still specified nowhere, and this report cannot quote its own token evidence

Two process items for the human.

`ENGINE_BUILD.md` §10.3 and `reports/README.md` still say nothing about the verdict line,
the tree binding, or the ten-line header window. This was my r4 spec observation #3 and
it is unmet. L8/H6b requires a second, non-Claude adversary to review this exact tree;
that reviewer has no format to conform to and R5-03 gives six ways its FAIL is discarded
in silence. Pin it in §10.3: verdict on line 2 at column 0, binding on line 3 at column
0, bare token, no markup, header must contain no raw HTML — and anything unparseable is
a hard gate failure.

Second: `QUOTED_EVIDENCE` is scoped to `ADVERSARY_REPORT_phase0.r4.md` by exact path.
That is the correct design — I verified it does not travel — but it means **this** report
turns `leak-check` red if it quotes token-shaped evidence, and reports are append-only so
it cannot be edited afterwards. I confirmed the r4 evasions flag when placed in an `r5.md`
path and therefore describe them in prose above rather than quoting them. Every future
adversary hits the same wall, and unwedging it requires a Class-2 edit to the scanner.
Worth a documented procedure before the cross-family reviewer arrives.

---

## 4. The two human decisions

**H8 — values match the approval exactly.** `pulsern` in the frozen table:
`dailyAdSpendUsd: 66`, `hardDailyAdSpendUsd: 75`, `totalAdSpendUsd: 2000`,
`dailyAiSpendUsd: 10`, `monthlyAiSpendUsd: 200`. That is $66 / $75 / $2,000 /
$200-per-month / $10-per-day, exactly as signed.

The monthly ceiling **binds through the real `llm()` path** — this is the single most
important thing in the commit and I drove it rather than reading it. 5,600 calls against
the fixture client ($5/day, $20/month, $0.01/call) with the clock advancing one day per
burst:

```
A1 perDay=[500,500,500,500,0,0,0,0] ok=2000 capRefused=3600 other=0
A1 total committed across the month = $20.00
A2 ok over 20 days spanning Aug->Sep = 4000  (= $40.00)   <- $20 August + $20 September
```

Four days of daily sub-limit, then the month refuses everything for the rest of the
month, then a clean rollover. The daily sub-limit and the monthly ceiling both bind and
the tighter wins.

**The ad trio is recorded and nothing implies otherwise.** `dailyAdSpendUsd`,
`hardDailyAdSpendUsd` and `totalAdSpendUsd` appear in `config/src/caps.ts`, tests,
approvals, reports and `HUMAN_TASKS.md` — and in **no** reader, no comparison, no guard,
anywhere in `engine/src/` or `engine/scripts/`. Three separate comments in `caps.ts` say
so explicitly, L20 says so, and `HUMAN_TASKS.md` H8 says so. Clean, and honestly
labelled.

**Is `APPROVALS/2026-08-16-h8-caps.md` honest about what it can and cannot prove?**
Substantially yes, with one gap. It has a "Standing caveat this entry does not resolve"
section stating in plain words that it proves *what* by content hash and never *who*, and
that until CODEOWNERS lands every entry in the directory including itself is advisory.
I verified that claim by execution: a PR author can raise `monthlyAiSpendUsd` to 2000 and
rewrite the approval's `content-hash` to match, and the gate passes (exit 0). That is
exactly L11/L13, honestly stated. I also verified the path list is what it says it is —
the 38 transition blocks are **byte-identical** to `npm run owed-approvals -- .. b1fc37d`,
which I ran and diffed. The gap: the file quotes the approver's request verbatim but
*paraphrases* their answers to the two clarifications, and the $10/day sub-limit — a
money value — appears nowhere in the quoted words. The human's brief to me independently
confirms $10/day was approved, so the value is right; the record of it is weaker than the
record of everything else in the file.

**Would `class2-gate` accept a tampered variant?** Raising the cap without touching the
approval: `CLASS-2 GATE FAIL: … fullburn/config/src/caps.ts (modified)`, exit 1 — correct.
Raising it *and* rewriting the approval hash: accepted, exit 0 — the disclosed H19 gap,
not a new finding.

**H20 — the stage is real; both halves of its enforcement are not.** The Playwright stage
genuinely launches Chromium (`page.evaluate(() => 6 * 7)` returns 42 from a real engine),
runs in CI as its own step after `playwright install`, and the expiry genuinely fires at
`PHASE=1`. The builder's specific claimed fix — that the smoke's own doc-comment no
longer satisfies the check — is real. What is not real: R5-06 (a string literal satisfies
it, and the comment-stripping guard has no lock) and R5-02 (the runner can be pointed
away from the suite in a Class-1 diff while the check still passes).

---

## 5. The approval and gate machinery

Attacked as instructed; results by area.

- **Header-window verdict schema** — one concealment hiding place left (R5-04), and the
  window did not close the discard class (R5-03).
- **File-scoped `QUOTED_EVIDENCE` exemption** — cannot travel and cannot be widened.
  Verified across four path prefixes; the fixture-containment check at import blocks the
  obvious widening; the residue rule means any spliced key material still matches. The
  substitution-vs-exception inversion is the right fix and it holds. Clean, with the
  process caveat in R5-10.
- **Depth-agnostic Class-2 patterns** — 4×7 vitest/vite matrix fully covered; deep paths
  under `engine/src/` covered; `wrangler.*`, `.gitignore`, `package.json`,
  `package-lock.json`, `tsconfig*.json`, `PHASE`, `.claude/`, both test trees and
  `engine/evals/` all covered, and each pattern is pinned by a witness path with a
  bidirectional test that catches neutering. They do not over-match into noise: I found
  no false positive. They still under-match — R5-02.
- **`owed-approvals` CLI vs `class2-gate`** — I could not make them disagree. Both read
  the same diff through the same `class2TouchedPaths`, `approvalTransition` and hash
  functions, and the shipped approval is byte-identical to the CLI's output. The one
  divergence worth noting is that both hash the **working tree** while the diff is
  commit-based, so a dirty tree would make `class2-gate` demand approvals for content
  that is not committed. `adversary-gate` guards against this for its own scope;
  `class2-gate` does not. CI checks out clean, so it is theoretical.
- **`class2-gate` fail-closed behaviour** — `baseCommit` omitted, empty or null all
  refuse. Approvals that are modified rather than added are ignored. Renames need both
  paths. A path containing a space stays inside the protected set (`-z` diff). All
  verified.

---

## 6. Ledger honesty, L1–L20

I attacked the ledger for overstatement rather than reading it.

- **L16 — overstated, and it is the entry that matters most.** Its claims that the stage
  is installed, executing, and genuinely launching a browser are all TRUE and I verified
  each. Its claim that the expiry is *"MECHANICAL, not remembered"* is half true: it
  fires, but "still smoke-only" is decided by a substring search that
  `const _note = 'intake confirm';` satisfies, and by a directory listing the runner can
  be pointed away from with a Class-1 edit. Its own verification column asks the
  adversary to confirm *"that the smoke's own doc-comment is not what satisfies the
  check"* — I confirm the doc-comment does not, and that the guard which achieves that is
  removable in one line with the suite green. L16 should say what the expiry actually
  checks.
- **L19 — honest, and I want that on record.** Verified by execution: removing the
  `assertCapsCoherent` call site leaves 232/232 green because no incoherent input exists.
  Declining to plant a bad cap table as test scaffolding is the right call and disclosing
  it beats faking it. Incomplete only in extent: the `DECLARED_FIXTURES` containment loop
  is a second member of the same class and is not named.
- **L20 — honest.** Every clause verified. The ad trio has no reader anywhere; the AI pair
  binds on every `llm()` call and is mutation-verified; every dollar to date is
  `MemorySpendMeter` in a sandbox.
- **L17, L18 — honest.** L17 correctly supersedes N-01 and records what is left. L18
  records the tip-vs-merge-base trade-off and its cost, including the friction, which was
  previously undisclosed.
- **L11 / L13 — honest**, and I confirmed them by executing the self-authored approval.
- **L15 and its r5 progress line — the right posture.** It records the queued fixes as
  done-but-unverified and explicitly refuses to clear the row on the builder's own word.
  I did not re-litigate the ~30 as scoped, but spot-checked three by execution: `npm run
  invariants` now runs 13 tests (H-18 closed), a planted token in `haven/` is now caught
  (`haven/__probe.ts: possible stripe/openai key`, exit 1 — H-16/R2-29 closed), and
  `CapError`/`MeterUnavailableError` now go through `redactInPlace` (A1 closed).
- **L1–L10, L12, L14 — unchanged and still accurate.**

**Unmet and unrecorded:** R5-01 (handle authenticity and id reuse across meter
instances — L14 documents the restart that produces it and no entry mentions the
consequence), R5-02 (a Class-1 path that decides whether a §10.3 stage runs), and R5-05
(approvals are silently mutable after signature — L11/L13 cover *who*, nothing covers
*what, afterwards*).

---

## 7. Standing invariants (CLAUDE.md), checked this run

| Invariant | Result |
|---|---|
| No write outside publish/pause/promote | No write path exists yet; scanner blocks platform API hosts in `fullburn/` code — verified by driving `scanContent` |
| Cross-tenant read fails by construction | Vault scope mismatch refused; cross-client reservation refused (`X12` mutation caught) |
| Caps immutable at runtime | `getCaps` returns frozen; assignment throws `TypeError`; no setter; unknown client throws |
| `decisions` ledger append-only | Phase 2, deferred and named in the invariant suite |
| Red button < 60s | Phase 6, deferred and named |
| Bracket protection window | Phase 5, deferred and named |
| External content is data | Hostile payload through `llm()` left caps, bindings and channels untouched — verified |
| `VERDICT.md` hash-locked | Phase 6, deferred and named |
| Tokens only in the vault | Whole repo walked including sibling trees; planted token caught; canary never echoed |
| Locked/staged flags structurally inert | `activeChannels() = ['meta']`; `tiktok` and `google` both refused with `SwitchboardError` |
| Human-queue SLA | Phase 6, deferred and named |
| Untraced decisions are bugs | Every exit traced including refusals; 500 leak traces confirmed on the N-07 path |

---

## 8. Repo hygiene

Every experiment ran in throwaway clones under
`/tmp/claude-0/…/scratchpad/{r5clone,tamper,t2,pw,pw2,lb,render}`, each with a real
`npm install` — isolation verified (`node_modules/@fullburn/config` resolves inside the
clone, not into the main tree). Markdown rendering claims were verified with `marked@15`,
not asserted. No builder code was fixed. The main tree is untouched apart from this
report: `git status --porcelain` empty, `HEAD = eb0775f`, tree hash
`5f956c0e45e50aef8666d712019e00bb23ab6451`, suite 232/232, typecheck exit 0, leak scan
clean.

Every finding above is reproduced by execution. Nothing here is a hypothesis.

---

## 9. What I would need to see to pass this tree

1. The reservation handle authenticated — a brand or a per-instance nonce, so a literal
   and a foreign handle both fail, and a settle for a reservation this instance does not
   own is an error rather than a silent no-op. (R5-01)
2. `playwright.config.ts` and `fullburn/e2e/**` inside the Class-2 set — or, better and
   what I actually recommend after four rounds of the same defect, deny-by-default with a
   small explicit Class-1 allowlist. (R5-02)
3. An unparseable report blocks instead of being skipped. (R5-03)
4. `checkReportsAppendOnly` extended to `fullburn/APPROVALS/**`. (R5-05)
5. The H20 expiry checking something a string literal cannot satisfy, with a mutation
   entry on the guard that gets it there. (R5-06)
6. Mutation entries for the four unlocked load-bearing guards in R5-07, two of which
   reopen previously-filed findings in one line.

None of these is large. The commit is close.
