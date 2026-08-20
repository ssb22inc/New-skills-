# HANDOFF — Fullburn Phase 0, as of 2026-08-20

Written so the next session resumes on **evidence, not reconstruction** (human
ruling, R11 round). Read this file, then `CLAUDE.md`, then
`reports/LIVE_VERIFICATION_LEDGER.md`. This file is a pointer, not a substitute:
where it summarises, the ledger and the reports are authoritative.

---

## 1. Where the build actually is

Phase 0 is **NOT passed**. Twelve adversary rounds have run (`reports/
ADVERSARY_REPORT_phase0.r2.md` … `.r12.md`); every one returned FAIL, and every
one found real money-path defects. r12's report is the newest and is the input
to the current work.

- The PR is **CLOSED**. Do not reopen it and do not open a new one without an
  explicit human instruction.
- **Five Class-2 approval sets are owed and are deliberately UNCOMMITTED**
  (ledger L27). They stay uncommitted until R7-07's identity lock exists —
  branch protection plus CODEOWNERS requiring an authenticated human approval.
  `npm run owed-approvals` prints exactly what is owed. A sixth set is now owed
  for the R11 work (`engine/src/spend-ledger.ts` is new engine source, and
  engine source is Class 2).
- **Never grade your own work** (§10.1, `CLAUDE.md`). A round is closed by the
  adversary, not by the builder.

## 2. The standing human rulings that bind every future round

These are decisions, not suggestions. They are also mirrored in `CLAUDE.md`'s
standing-invariants list; this section says who ruled and why.

1. **Guard + checker never ship in the same commit** without a test proving the
   checker can still go red. (After R9-01: a crash marker and an invariant
   asserting no marker exists landed together, so every mutation reported
   CAUGHT and the acceptance bar became incapable of failing while printing a
   true number. It was the most serious finding of the build.)
2. **Every harness result is void unless preceded by a passing meta-check.**
   `npm run mutate` injects a known-undetectable fault (a comment, must
   SURVIVE) and a known-detectable one (a real guard reverted, must be CAUGHT)
   before it reports any number. Enforced in code, in `mutate-lib.mjs`.
3. **The unreachable-guard sweep is a COMPLETED step in every round.** A fix
   that moves a check upstream can kill an older guard; it has happened three
   times in `llm()` alone (L28, R9-08a, R10-07a). `engine/test/invariants/`
   drives every money-path guard with an input written to make it fire. Since
   R11-05 it records **which guard refused**, not merely that something threw.
4. **A guard is locked by EXECUTING it, never by asserting its shape.** Six
   checks have now been defeated by this (R8-09, R9-02, R9-03, R9-04, R10-09,
   R11-04). The mutation table contains its own targets as string literals, so
   a grep over source passes with the guard reverted.
5. **Any tool that can write to the source tree is import-safe and fails
   closed.** (After the harness ran itself inside the test process and left 57
   of 100 guards reverted on disk.) Enumerated from the filesystem in
   `engine/test/invariants/`, so a new writing tool is covered the day it lands.
6. **No disclosure standing in for a fix.** "Four rounds running, a disclosed
   limitation became the next round's severity-1; I'm not accepting a fifth."
   An irreducible residual needs a test proving its bounds, not a note.
7. **Take the architectural fix, not another spelling.** The recurring root
   cause across R7–R11 is fixes that enumerate the attack's *spelling* rather
   than removing the *capability*: resolver seam → clock seam → instance
   patching → prototype patching → per-call construction. Explicitly ruled: do
   NOT freeze the prototype.

## 3. What R12's work changed (most recent session)

**R12-01 — the ledger now OWNS the arithmetic (severity 1, money loss).** R11
moved the ledger out of the meter and stopped there, so it arrived as a public
money-write primitive: `processLedger().setCommittedMicros(period, 0)` minted a
fresh ceiling on every call — $30 against a frozen $5/day, one meter, zero
`CapError`s, `todayUsd()` reading $0.00, no patch and no cast. Both R11-07
fences guarded the RESET and had nothing to say about writing the balance.

Human ruling: move the reserve/settle arithmetic inside the ledger; the meter is
a caller, not an arithmetic owner. Done —
- `SpendLedger` exposes `reserve(req, handle)` and `settle(handle)` and **no
  balance-write primitive at all**. Reserved headroom is DERIVED from the open
  handles rather than stored, so there is no second number to overwrite.
- `engine/test/locks-r12.test.ts` FUZZES every method the interface declares,
  read out of the source, and fails if any of them lowers a committed balance.
  A setter added tomorrow is fuzzed the day it lands.
- The prototype is still unfrozen by ruling, so R11-01's in-process patch
  remains — bounded by a test and disclosed in L31(b), not described away.

**R12-02 — the sweep's POPULATION, not just its predicate.** R11 sharpened the
predicate on sixteen hand-written entries while the money path carried
forty-seven guards; twelve were measured blind, including all six in `llm()`,
while `CLAUDE.md` and L30 claimed full coverage. `engine/test/money-path-guards.ts`
now reads every `throw new …` out of the four money-path modules and the sweep
FAILS naming any it did not drive. Undrivable guards must name a ledger row.

**The ledger-integrity standing rule.** Three consecutive rounds produced a
correction that introduced a fresh false claim. New rule (see `CLAUDE.md`): a
row asserting something about code behaviour carries a test that fails when the
assertion goes stale; rows that cannot be tested state limitations only. The
claims check lives in `engine/test/invariants/`. L14, L17, L29, L30 and L31 were
corrected or rewritten under it; L32 is new.

**Also fixed:** R12-03 (three guards that survived their own deletion — the
anchor median, the monotonic refusal and `settleOrFailClosed`'s rethrow, all now
driven and locked); trap #7 (the blocking resolver follows local re-exports
transitively and counts `.call`/`.apply`/`.bind`/`Reflect.apply` — and the
signal-string greps are DELETED, with the drill strengthened to assert no source
file is mutated after the signal); R12-06 (the ledger slot is keyed off
`Symbol.for` so it survives module resets, the module-reset test moved to its own
file, and a shuffled-suite CI stage now catches order-dependence); R12-07
(availability is per client and audited, `openEntries()` is gone); R12-08 (the
evidence column is anchored and unit-tested); R11-05 (restored as open, its
identifier un-reassigned, and money-path mocking bounded by an invariant).

## 4. OPEN — what the next session must pick up

### 4.1 The Phase 2 dependency that must not be forgotten (ledger L31)

The in-process ledger is a stand-in. **Phase 2 lands the client's Durable Object
behind the same `SpendLedger` interface** (§2.2). Three limitations are open and
stated as limitations, not conclusions:

- **(a) Per PROCESS.** Two Workers, or one after an eviction, hold two ledgers
  and therefore two ceilings; nothing survives a restart. It was worse until
  R12: the unit was the MODULE INSTANCE, so `vi.resetModules()` plus a
  re-import minted a full second ceiling inside one process. The slot is keyed
  off `Symbol.for` now and a test drives the re-import.
- **(b) An in-process patch of `MemorySpendMeter.prototype` still spends
  unmetered** — `reserve` AND `settle`, not just `reserve`. The prototype stays
  unfrozen by ruling (freezing is another spelling). `locks-r12` carries the
  bounding test that measures how far the patch gets. **R11-01 is bounded, not
  closed.** The DO closes it: with the arithmetic already inside the ledger,
  enforcement happens outside the process.
- **(c) `resetProcessLedgerForTests()` exists**, fenced by the runtime and by an
  invariant that no production module may name it. Typing is not a fence:
  `clear()` is off-interface and reachable by a cast, and a test asserts it is
  the ONLY thing on the implementation the contract does not declare.

### 4.2 Immediate next step

**Invoke r13** — a fresh same-family adversary round against the committed R12
tree. Its brief must carry forward, as explicit attack surface:

1. The `SpendLedger` contract now that it owns the arithmetic: can any caller
   move a balance without a cap check, by any route? L31(a)–(c) especially
   R11-01's prototype patch, which is bounded and disclosed, NOT closed.
2. The unreachable-guard sweep, **re-run to completion** (standing ruling 3) —
   including its new completeness check: is the enumeration itself complete?
   It reads `throw new …` only; control-flow guards are outside its count.
3. `mutate.mjs` as an adversarial target, not a trusted tool.
4. The shape-assertion class — this is the EIGHTH look for it. Three of the last
   four rounds found one on the same line of the same file.
5. The ledger-claims check: does every behavioural row have a binding, and does
   each binding actually go red when its row goes stale?

**Only if r13 is clean** does the cross-family read get regenerated (ledger L8:
every review so far has run on the builder's own model family, which violates
§2.4's family-diversity rule for the review itself).

### 4.3 Not started / carried

- Ledger rows L1–L31: all open. L8, L14, L27 and L31 are the ones that gate
  the most.
- The five (now six) owed Class-2 approval sets, held per L27.

## 5. How to verify the tree yourself, in order

```
npm run typecheck      # tsc, strict, noEmit
npm test               # the unit + invariant suite
npm run drill          # the SIGINT drill — its own runner, outside the suite
npm run mutate         # THE ACCEPTANCE BAR. Meta-check first, then the table.
```

`npm run mutate` is the bar this project accepts a fix against: it applies each
one-line revert on its own and requires the suite to go red. A SURVIVED line
means the fix is unprotected. A PATTERN-NOT-FOUND line means the entry is stale
because the code moved — that is a failure to investigate, not a pass. **Any
number the harness prints without a passing meta-check above it is void.**
