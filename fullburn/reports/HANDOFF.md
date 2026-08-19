# HANDOFF — Fullburn Phase 0, as of 2026-08-19

Written so the next session resumes on **evidence, not reconstruction** (human
ruling, R11 round). Read this file, then `CLAUDE.md`, then
`reports/LIVE_VERIFICATION_LEDGER.md`. This file is a pointer, not a substitute:
where it summarises, the ledger and the reports are authoritative.

---

## 1. Where the build actually is

Phase 0 is **NOT passed**. Eleven adversary rounds have run (`reports/
ADVERSARY_REPORT_phase0.r2.md` … `.r11.md`); every one returned FAIL, and every
one found real money-path defects. r11's report is the newest and is the input
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

## 3. What R11's work changed (this session)

**R11-01 / R11-07 — the ledger left the meter.** The root cause behind four
rounds of fixes was that the ledger lived in the meter's own fields, so
`new FrozenCapsSpendMeter()` per call minted a fresh ceiling — no mock, no
forgery, just constructing the object the API asks you to construct. Measured
at 3,000 dispatches, $30 against a frozen $5/day.

- `engine/src/spend-ledger.ts` (**new**): the `SpendLedger` storage interface,
  `InMemorySpendLedger`, and one module-scoped `PROCESS_LEDGER` returned by
  `processLedger()`. The meter is now a **handle** onto shared state.
- `engine/src/spend-meter.ts`: holds `#ledger: SpendLedger` instead of owning
  the maps. `FrozenCapsSpendMeter` passes `processLedger()` and takes no ledger
  argument, so production cannot inject one.
- **R11-06**: `setAvailable` is gone from the meter entirely. A public, untraced
  method that permanently halts a client's spend does not belong on the money
  path's public face; it lives on the ledger, where storage lives.
- Test isolation: `resetProcessLedgerForTests()`, fenced by the **runtime** (it
  refuses without a vitest worker marker, and the deployed Worker surface has
  neither `process` nor that marker) and by an invariant that no module under
  `engine/src` or `config/src` may name it. Both fences locked behaviourally.
- **R11-04** (the sixth shape-assertion trap): the runner's blocking-call check
  matched call sites by NAME, so `import { spawnSync as runSuiteBlocking }`
  restored R9-03 with every check green. `engine/test/blocking-calls.ts`
  resolves the **binding** instead and refuses what it cannot resolve
  statically. Its red-proof is `engine/test/blocking-calls.test.ts`.
- **R11-05**: the unreachable-guard sweep recorded `e instanceof Error`, so
  eleven of sixteen entries would have passed with their own guard deleted. It
  now matches the guard's own refusal message and error class, and carries its
  own red-proof for all three ways a guard can be dead.
- Ledger: **L29 and L30 corrected** (both carried false claims — see the
  rows), **L31 added** for the process-ledger residuals.

## 4. OPEN — what the next session must pick up

### 4.1 The Phase 2 dependency that must not be forgotten (ledger L31)

The in-process ledger is a stand-in. **Phase 2 lands the client's Durable Object
behind the same `SpendLedger` interface** (§2.2). Three residuals are open and
disclosed, not closed:

- **(a) Per-process, not per-client.** Two Workers hold two ledgers and
  therefore two ceilings — the same defect at a coarser grain. Only the DO
  closes it.
- **(b) The ceiling is enforced by the METER, not the ledger.** The interface
  stores; `reserve()` does the cap arithmetic. So an in-process patch of
  `MemorySpendMeter.prototype.reserve` still spends past the ceiling
  (**R11-01 is NOT structurally closed**). The architectural close is to move
  the reserve arithmetic INSIDE the ledger when the DO lands, so the cap is
  enforced at the storage boundary. **`SpendLedger` is therefore not final** —
  it will need a reserve-shaped method.
- **(c) The test-reset seam exists** and is fenced twice; typing is not one of
  the fences and is not claimed as one.

### 4.2 Immediate next step

**Invoke r12** — a fresh same-family adversary round against the committed R11
tree. Its brief must carry forward, as explicit attack surface:

1. The new `SpendLedger` seam and everything in L31(a)–(c), R11-01 especially.
2. The unreachable-guard sweep, **re-run to completion** (standing ruling 3).
3. `mutate.mjs` as an adversarial target, not a trusted tool.
4. The shape-assertion class — this is the seventh look for it.

**Only if r12 is clean** does the cross-family read get regenerated (ledger L8:
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
