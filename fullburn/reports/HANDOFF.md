# HANDOFF.md — Fullburn Phase 0

**Status: Phase 0 OPEN. Gate RED. No PR. No dollar has ever been live.**

Rebuilt 2026-08-21 after R14-01 found that the previous version of this file
asserted a property that had never been tested. Updated the same day with the
R14-01 ruling implemented and its §4 proof executed.

---

## 0. The rule that governs this file

R14-01: `spend-ledger.ts`, ledger row L31, and this file all stated that the
Durable Object closes the in-process prototype residual. None of the three had
ever been tested. The claim was false.

Therefore, from this commit forward:

> **Every line in this file that asserts something about code behavior carries a
> `[VERIFIED <path>]` tag naming the test that proves it, or a `[LIMITATION]`
> tag stating the measured bound with no remedy implied. A line with neither tag
> is a defect in this file and a severity-2 finding.**

This is the r12 ledger rule applied to the handoff. Rows that cannot be tested
state limitations only, never conclusions.

`[UNKNOWN]` means the next session must re-derive it. Do not fill an `[UNKNOWN]`
from inference. Re-derive or ask.

---

## 1. Where the build is

| Item | Value | Provenance |
|---|---|---|
| Phase | 0 — Foundation | ENGINE_BUILD.md §11 |
| Adversary rounds spent | 14 | round reports |
| Gate | RED | r14 not clean; R14-01 ruling implemented but its primary control is unprovisioned (L4/H2) |
| PR | Not opened. **Do not open.** | standing instruction, every round since r5 |
| Latest commit | see `git log -1` | — |
| Base for current Class-2 accounting | `eb0775f` | re-derived 2026-08-21 |
| Class-2 approval entries owed | **47** | `node engine/scripts/owed-approvals.mjs . eb0775f` |
| Tracked files / Class-2 by `isClass2()` | **488 / 115** | re-derived 2026-08-21 |
| Live dollars exposed to date | 0 | no write path exists before Phase 6 |
| Clients exposed to date | 0 | — |

### Commit trail

`eb0775f` (Class-2 base) → `b9364e3` → `6f10a99d` → `e586f0e2` (retired
cross-family brief, superseded) → `0877861` (r8 clean, 100/100) → `7516cd4` →
`d73df4c` (binds `trustedClock()`, retires `Date.now`) → `cb48c05` (r13 fixes) →
`a236e8f` (r14 report) → `0466154` (r14 fixes) → `34437d6` (R14-01 ruling) →
this commit (runner audit, HANDOFF §7.2).

---

## 2. R14-01 — RULED, IMPLEMENTED, AND STILL BLOCKING

**The finding.** The in-process spend ledger cannot bound its own process. The
patch attacks *the call*, so a store that is never called cannot refuse. The
residual is prototype mutability, a property of JavaScript.

**Human ruling issued 2026-08-21. Implemented in this commit.**

| § | Ruling | State |
|---|---|---|
| 1 | Residual accepted as irreducible; stop hardening in-process | Done — no new in-process fence was added |
| 2 | L4's Gateway cap promoted to **PRIMARY**; ledger demoted to **advisory fast-refuse** | Done — L4 and L31 rewritten, `spend-ledger.ts` header rewritten |
| 3 | Phase 2's goal becomes "correct when the ledger is absent, patched, or never called" | Done — stated in L31 and in `spend-ledger.ts` |
| 4 | Conditional on a red-proof: spend with **no ledger call at all**, out-of-process cap refusing | **Done and executed** `[VERIFIED engine/test/gateway-cap-primary.test.ts]` |
| 5 | Layer split disclosed in `spend-ledger.ts`, L31 and this file, each carrying a test | Done |

### 2.1 What §4's proof does and does not establish

`[VERIFIED engine/test/gateway-cap-primary.test.ts]` — it runs the **disclosed
attack**, not a simulation of it: `reserve` and `settle` are neutered on the
prototype the live ledger actually resolves through, so the ledger records
nothing and refuses nothing. Then:

- the out-of-process cap still binds the spend to the frozen ceiling;
- the refusal reaches the caller — never swallowed, never returned as output;
- the ledger reads `$0.00` throughout, so it is provably not what stopped it;
- with both layers live, the Gateway is never asked past the ledger's ceiling,
  which is what earns the advisory layer its place rather than deletion.

Verified red by making `llm()` swallow a transport rejection: two of the four
tests go red.

**`[LIMITATION]` It proves the ENGINE is correct against a Gateway that refuses.
It cannot prove the real Gateway is CONFIGURED with these ceilings.** That is
ledger L4, blocked on H2. Per the ruling's own §4 logic the control must be
real, and it is — but it is **designed and unprovisioned**. No in-process test
can substitute for provisioning it.

### 2.2 Consequence — H2 is now a Phase 0 blocker

L4 was recorded as defence-in-depth behind a local check. The roles are
reversed, so the item that was "nice to have before Phase 2" is now the only
authoritative spend control in the design. **Phase 0 cannot close until the
Gateway caps are configured and verified against `caps.ts`.** This is a change
in what H2 gates, and it is the single most important line in this file.

**Money scope — resolved, do not re-litigate.** The ledger meters **AI/LLM
spend**, and L4's AI Gateway cap bounds the same money. Confirmed by the
denominations across the finding history: R9-05 $120 against a frozen $20/month,
R10-02 $50 against a frozen $10/day, R13-01 $30 through a frozen $5/day. All
`effectiveAiCapsUsd`. Ad spend is a separate surface with no write path until
Phase 6.

---

## 3. Approved caps — the only five human-set numbers

`fullburn/config/src/caps.ts` must read exactly these. All five were set by
Sheldon Bennett. None were derived by an agent.

| Constant | Value | Enforcement status |
|---|---|---|
| Daily ad spend (pacing target) | **$66** | `[LIMITATION]` recorded only; no write path before Phase 6 |
| Hard daily ad ceiling, per client | **$75** | `[LIMITATION]` same; Phase 6 adversary must attempt breach before that gate opens |
| Sprint total (PulseRN 30 days) | **$2,000** | `[LIMITATION]` same |
| AI spend, monthly | **$200** | `[LIMITATION]` primary bound is the L4 Gateway cap, which is unprovisioned; the in-process ledger is advisory only |
| AI spend, daily | **$10** | `[LIMITATION]` same |

**Any digit that differs from this table is unapproved and must revert.** A cap
change is a Class-2 act requiring a human-approved commit (Law 2).

`dailyAiSpendUsd: 25` was an unsigned scaffold value and was rejected. It is not
approved and must not reappear.

---

## 4. Standing rulings — immutable, carry into every future round

Issued across r7–r14. Not suggestions, and not re-openable by the builder or the
adversary. The full text lives in `CLAUDE.md`'s standing-invariant list; this is
the index with the reason each exists.

**On money paths**

- **Structure, never checks.** Remove the capability; do not fence the setter.
- **A fix is not complete until you can state which capability it removed.**
  "Removed a spelling" is not a fix. If a fix only narrows access, say so.
- **No disclosure stands in for a fix.** A residual may be documented only with
  a test proving its bounds.
- **Production types carry no seams.** No injectable resolver (R8-01), clock
  (R9-05), caller-supplied ceiling or raw signed amount (R13-01). Production
  meters are frozen; fault injection runs through storage availability.
- **Ceilings resolve from the frozen table**, by the ledger itself.
- **NEW (R14-01): the in-process layer is advisory.** Do not add in-process
  fences to bound spend. Enumeration loses — trap #9 was the fifth consecutive
  round on one file. Authority lives out of process.

**On instruments**

- **Meta-check before trust.** A harness result not preceded by a passing
  meta-check is void.
- **Never ship a guard and its checker in the same commit** without a red-proof.
- **Behavior, never shape.** Nine checks have been defeated by shape assertion.
- **Coverage is proven, not asserted** — the population is derived from the
  import graph and the sweep fails if any guard is undriven.
- **The unreachable-guard sweep is permanent and completed.**
- **Any tool that writes to the source tree is import-safe and fails closed.**
- **Sequence fuzz, not name enumeration.**
- **NEW (R14-07): an ambiguous mutation target fails closed.** Two entries were
  reverting the same line while a real fix had none.

**On the record**

- **A checker that runs under its own runner is unprovable by the default
  suite** (R14-06). Extract the decision as a pure function with red-proofs in
  `npm test`. **Audited across every runner 2026-08-21** — seven survivors, all
  extracted; the runner-decision sweep now derives the runner set from the
  filesystem so a new runner fails the day it lands.
- **NEW: the meta-check only validates the expression it runs.** The harness had
  two copies of its CAUGHT/SURVIVED comparison and the canaries exercised one.
  Any instrument with a self-check must run the self-check through the SAME
  code the reported result comes from.
- **A bounding test patches the prototype the live object resolves through**
  (R14-02), not the one the test file imported.
- **A blocking binding must not be referenceable**, not merely un-invocable in
  known forms (R14-04).
- **Every ledger row asserting code behavior carries a test.**
- **Finding-IDs are immutable once issued.**
- **`departed` is kept as defence-in-depth**, made provably live via a
  deliberately non-conforming meter.

---

## 5. Verified numbers as of this commit

Meta-check passed first, so the harness figures are trustworthy rather than
decorative.

- Mutations: **190 / 190 caught, 0 survived, 0 stale**
- Suite: **386 / 386** across 29 files
- Three shuffled seeds: **386 / 386**
- `--no-isolate`: **383 / 383** across 27 files
- Single fork: **383 / 383**
- Drill green. Typecheck clean. Leak-check clean.

The runner audit added 16 entries (RA-01…RA-16) and 32 tests. Two of its own
entries SURVIVED on the first run and were fixed before this commit: RA-12
(nothing drove the NUL parser's delete branch) and RA-16 (the entry was a
semantic no-op — replaced with a real revert, and the check it targets was
given the negative case it never had). Both are CAUGHT now. Recording that the
first run failed is the point: a harness that only ever prints a clean number
is the instrument this project distrusts.

Prior high-water marks, for trend: r14 174/174 · r8 100/100 at `0877861` · r10 119/119 ·
r11 124/125 (`departed`) · r13 151/151 across eleven shuffle seeds, with 47/47
guards individually disabled.

### 5.1 r14 finding dispositions — the count corrected

r14 raised **twelve** findings, R14-01 through R14-12. The previous handoff and
the `0466154` commit message both said "ten fixed", and asked what the twelfth
was. **There is no unaccounted finding: eleven were fixed and one is open.** The
"ten" was my own miscount, and it is exactly the kind of record error this
project treats as a defect.

| ID | Disposition |
|---|---|
| R14-01 | Ruled and implemented this commit; **still blocking on L4/H2**. See §2. |
| R14-02 | Fixed — both prototypes carry bounding tests; the ledger one patches the live resolution path |
| R14-03 | Fixed — population derived from imports, refuses what it cannot follow |
| R14-04 | Fixed — reference-level check, verified end-to-end against the real runner |
| R14-05 | Fixed — error identities registry-stable; both isolation conditions are CI stages |
| R14-06 | Fixed — drill decision extracted as a pure function with six red-proofs |
| R14-07 | Fixed — ambiguous mutation targets fail closed; three latent collisions surfaced |
| R14-08 | Fixed as a **narrowing, not a closure** — a resume must name the halt it lifts (L33) |
| R14-09 | Fixed — dead resolver deleted, truncated comment removed |
| R14-10 | Fixed — L29's stated reason corrected (third correction to that row) |
| R14-11 | Fixed — `CLAUDE.md` no longer claims its own count is checked |
| R14-12 | Fixed — a refusal traces what was committed, not what was reserved |

---

## 6. Class-2 approval state — ALL SETS UNCOMMITTED

No Class-2 approval is currently valid. This is deliberate.

R7-07 established that an approval file proves **what** by content hash and never
**who**. The honor system is closed and replaced by branch protection +
CODEOWNERS: a Class-2 approval must arrive via a PR approved by Sheldon's
authenticated GitHub identity, and the approval commit must be pushed under that
account, never agent-authored.

- **47 approval entries owed** against base `eb0775f`, re-derived 2026-08-21 via
  `node engine/scripts/owed-approvals.mjs . eb0775f`. Note the script takes
  `<repoRoot> <baseRef>` as positional arguments; `npm run owed-approvals` with
  no arguments refuses, which is correct fail-closed behaviour and not a bug.
- **488 tracked files, 115 Class-2** by `isClass2()`. CODEOWNERS is 66 lines.
  `[LIMITATION]` the invariant asserts every Class-2 file is covered and that CI
  fails closed if CODEOWNERS is deleted or altered; whether 115 is the *right*
  Class-2 set is the §8 tightening item, not a coverage question.
- **Never author the human's signature.** The agent may print a file body for
  copying; it may not create or commit an approval.

---

## 7. Open items for the next session

1. **L4/H2 — configure the Gateway caps.** This is now the Phase 0 blocker. Until
   it lands, the primary spend control is designed and unprovisioned.
2. ~~**Audit every drill, gate script and harness that runs under its own
   runner** against the R14-06 rule.~~ **DONE 2026-08-21.** Seven decisions were
   living inside a runner, each measured surviving a one-line revert with the
   default suite green at 354/354, plus two more found by driving the
   extractions. Full record: `reports/RUNNER_AUDIT_2026-08-21.md`; ledger L34.
   `[VERIFIED engine/test/invariants/invariants.test.ts — runner-decision sweep]`
   `[LIMITATION]` the sweep catches decision LITERALS in a runner, not every
   undelegated decision; the seventh survivor was an inline comparison and was
   found by measurement, not by the sweep.
3. **The `--no-isolate` / single-fork exclusions are spend-relevant, and that is
   not comfortable.** The two excluded files hold three tests:
   `departed-contract.test.ts` (2 — the `departed` double-refund contract) and
   `ledger-slot.test.ts` (1 — the process-slot brand). **Both are money-path.**
   They need a private module registry by nature, so the exclusion is honest,
   but "347/347 under a shared registry" does not cover them. `[LIMITATION]`
4. **Re-run the harness** after this commit's entries and confirm the population
   count. The four r13-removed entries were re-examined per R14-06: the two that
   targeted the drill are restored in substance as entries on
   `post-signal-writes.ts`; the two that deleted a lone assertion inside a test
   stay out, and that half of the original rationale was correct.
5. **Then r15.** Only if r15 is clean does a fresh cross-family read get
   regenerated — never spend a cross-family round on a tree with known findings.
6. **Then** CODEOWNERS-locked approvals → gate ack → and only then the PR.

**Sequence that counts:** fix → fresh same-family adversary → fresh cross-family
read **on the same tree** → CODEOWNERS approvals → human gate ack. "Fixes are in"
never means "Phase 0 is done."

---

## 8. Inherited by Phase 2 — do not lose

- **The shared ledger interface**, now explicitly ADVISORY. The Durable Object
  swaps in behind it and closes the per-process bound — two Workers holding two
  advisory ledgers. It does **not** close the prototype patch; that is what the
  Gateway cap is for. Hard Phase 2 dependency, with its goal restated per §2.
- **The globally-addressable slot.**
  `globalThis[Symbol.for("fullburn.spend-ledger.process")]` is brand-checked,
  refuses an occupant it did not create, and the singleton is frozen. L31
  discloses it as a capability the process boundary exposes.
  `[VERIFIED engine/test/ledger-slot.test.ts]`
- **The real e2e requirement.** R6-06 showed the e2e expiry was weaker than the
  ledger claimed, three corrections running. Phase 1's gate must enforce
  real-e2e-on-the-intake-confirm-flow **in code**. The H20 variance expires there.
- **Tighten `isClass2()`** to genuinely law-bearing surfaces so approvals stay
  meaningful acts rather than fatigue. Its own reviewed Class-2 change, after
  Phase 0 closes.

---

## 9. Scope lock — the build stays untouched

Nothing new until the Phase 0 gate is green. Recorded, not built:

- **SEO split** — day-one read-only baseline + audit running alongside Meta;
  write access unlocks only after the site-mutation safety layer passes its
  adversary on live data.
- **Channel roadmap placeholders** — Meta (live) → Google (staged) → TikTok →
  Reddit → open-web / Realize·Taboola, each subject to the same
  warehouse-verified kill bracket.
- **B2B market bundle** — CRM-as-truth-source, pipeline baselines, a
  lead-quality adversary, LinkedIn as primary *within that bundle only*.
- **Build-protocol additions** — finding-ID immutability, and the
  ledger-row-carries-a-test rule.
- **Preserve the artifacts.** Every adversary report, cross-family finding and
  human ruling is the sales asset for the verification-layer business.

---

## 10. What must not happen

- Do not open or merge the PR.
- Do not accept "bounded, not closed" as a fix on a money path.
- Do not describe the in-process ledger as bounding spend. It is advisory.
- Do not approve a Class-2 set outside the CODEOWNERS flow.
- Do not delete a mutation entry to buy a clean score.
- Do not run a cross-family read against a tree with known findings.
- Do not let the agent author a signature.

The schedule risk at this point is fatigue, not engineering.

---

*Fourteen rounds. Zero dollars live. Zero clients exposed. Every defect caught in
a Phase 0 sandbox.*
