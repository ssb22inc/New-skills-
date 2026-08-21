# HANDOFF — Fullburn Phase 0, as of 2026-08-20 (r13 fixes)

Written so the next session resumes on **evidence, not reconstruction** (human
ruling, R11 round). Read this file, then `CLAUDE.md`, then
`reports/LIVE_VERIFICATION_LEDGER.md`. This file is a pointer, not a substitute:
where it summarises, the ledger and the reports are authoritative.

---

## 1. Where the build actually is

Phase 0 is **NOT passed**. Thirteen adversary rounds have run (`reports/
ADVERSARY_REPORT_phase0.r2.md` … `.r13.md`); every one returned FAIL, and every
one found real money-path defects. r13's report is the newest and is the input
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

## 3. What R13's work changed (most recent session)

**R13-01 — the ledger owns the sign, the ceilings, the clock and the periods
(severity 1, money loss).** R12-01 removed the balance *setters*; the capability
survived in two contract calls. `reserve({… micros: -N …}, h)` made the
projection smaller, so `projected > cap` could not fail, and `settle(h)`
committed the negative — $30 through the real `llm()` against a frozen $5/day,
zero `CapError`s, `todayUsd()` at $0.00. `ReserveRequest` also carried the
ceilings (R7-06's seam, one layer down) and the period keys (a fresh ceiling for
the asking).

The signature is now `reserve(clientId, micros, handle, narrowing?)`. The ledger
validates a positive whole number of micro-dollars at the boundary, resolves
ceilings itself from the frozen table, computes period keys from its own clock
and the client's zone, and keeps the high-water ratchet internal.
`committedMicros(clientId, "day"|"month")` names a SPAN, not a key.
`MemorySpendMeter` is now a thin branded facade: unit conversion and a handle.

**Capabilities removed** (state them, per the standing rule): choosing the sign
of a balance change; choosing the ceiling; choosing the period; enumerating
another tenant's holdings; setting the high-water mark. The narrowing table is
the one caller input left, and `caps.ts` proves it can only lower.

**R13-02 — the slot brand.** `Symbol.for` made the ledger globally addressable,
so anything evaluated first owned it. The slot now refuses an unmarked occupant
and is defined non-writable/non-configurable (a removal); a registry-marked
impostor planted before first use is still indistinguishable (a narrowing, said
plainly in L31(b)). The singleton is frozen.

**The lock changed shape.** `locks-r12` runs a SEQUENCE fuzz — seeded random
walks over every contract method with adversarial arguments and harvested
handles — asserting the committed balance never falls, never beats the ceiling,
and is never corrupted. The old lock enumerated method NAMES, so a two-call
sequence was outside its alphabet by construction. Verified red against R13-01.

**Instruments.** The sweep's population is now DERIVED from the import graph
(11 modules, 75 guards) instead of a four-name literal list, and coverage is
one-to-one on (file, refusal message) instead of a substring match (R13-06). The
ledger-claims bindings that grepped for strings now execute (R13-07); L21, L23
and L31 were corrected — L23 was outright false. The blocking resolver refuses a
local module it was not given, and the invariant walks `scripts/` recursively
(R13-04, trap #8). The drill watches FILE CONTENT after the signal rather than
the marker's path (R13-05). Both enumeration walks are recursive and cover every
extension and every workspace test tree (R13-09, R13-10). `isolate: true` is
explicit in `vitest.config.ts` with `npm run test:noisolate` proving everything
outside two registry-dependent files is independent of it (R13-08).

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
- **(b) An in-process prototype patch still spends unmetered** — on
  `MemorySpendMeter.prototype` AND `InMemorySpendLedger.prototype`, which is
  where R13-01 put every enforcement decision. The prototypes stay unfrozen by
  ruling (freezing is another spelling). `locks-r12` carries a bounding test for
  each. **THE DURABLE OBJECT DOES NOT CLOSE THIS**, and this file said for one
  commit that it did: the patch attacks the CALL, not the state, so a store that
  is never called cannot refuse. Measured at $30 through a $5/day DO-enforced
  ceiling with the store's counters at zero (R14-01). An in-process patch can
  only be bounded from outside the process — L4's Gateway-side cap is the
  candidate. **That is an OPEN HUMAN DECISION in the queue**, and it changes
  what Phase 2 is for.
- **(c) `resetProcessLedgerForTests()` exists**, fenced by the runtime and by an
  invariant that no production module may name it. Typing is not a fence:
  `clear()` is off-interface and reachable by a cast, and a test asserts it is
  the ONLY thing on the implementation the contract does not declare.

### 4.2 Immediate next step

**Invoke r14** — a fresh same-family adversary round against the committed R13
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

**Only if r14 is clean** does the cross-family read get regenerated (ledger L8:
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
