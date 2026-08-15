# ADVERSARY_REPORT_phase0 — Re-review (r2) of commit df95668

Verdict: FAIL

verified-tree: 13ecf1641404307ac276bd5a2a06fc0b63083c0f

---

## 0. Scope and standing

This is the official Phase 0 **re-review** of commit `df95668` ("Phase 0: fix all
adversary FAIL findings (F1–F19) and re-arm the gates"). It is appended, not
substituted: `ADVERSARY_REPORT_phase0.md` stands as history and its FAIL verdict
on the pre-fix tree remains correct.

Five adversaries attacked five dimensions. Every claimed finding was then
independently re-attacked by a skeptic whose default was refutation. Only
findings reproduced by execution appear below. Six claims were refuted and are
recorded in §6 so the next adversary does not re-spend the effort.

**The F1–F19 fixes are, with two exceptions, real.** I want that stated plainly
before the findings, because it is the honest result: the concurrency fix, the
fail-closed meter guards, the billed-call metering, the redaction of thrown
errors, the prototype-pollution hardening, the Grade Registry's missing areas,
the eval-driven rebind, and the scanner's token patterns all hold up under
re-attack. What does not hold up is the *perimeter* around those fixes — the
change-control set that decides which files a human must approve, the gate that
reads the adversary's own verdict, and the arithmetic inside the money path
itself.

**34 findings survived verification. 7 are money loss. The phase gate does not
open.**

---

## 1. What I executed, and its real output

All commands from `/home/user/New-skills-/fullburn` at `df95668`, working tree
clean (`git status --porcelain` empty before and after; no builder code was
modified, and no probe file was left in the repo).

### 1.1 The three headline commands

```
$ npm test          # run 1
 ✓ engine/test/gates.test.ts (18 tests) 11ms
 ✓ engine/test/invariants/invariants.test.ts (9 tests) 12ms
 ✓ engine/test/adversary-phase0.test.ts (20 tests) 18ms
 ✓ engine/test/gateway.test.ts (11 tests) 21ms
 ✓ config/test/adversary-phase0.test.ts (6 tests) 6ms
 ✓ engine/test/scan-lib.test.ts (17 tests) 10ms
 ✓ engine/test/grade-registry.test.ts (6 tests) 7ms
 ✓ engine/test/spend-meter.test.ts (7 tests) 7ms
 ✓ engine/test/eval-rebind.test.ts (4 tests) 9ms
 ✓ config/test/models.test.ts (6 tests) 10ms
 ✓ config/test/switchboard.test.ts (6 tests) 7ms
 ✓ config/test/caps.test.ts (5 tests) 6ms
 ✓ engine/test/vault.test.ts (3 tests) 5ms
 Test Files  13 passed (13)
      Tests  118 passed (118)
   Duration  1.81s

$ npm test          # run 2 → Test Files 13 passed (13) / Tests 118 passed (118) / 1.82s
$ npm test          # run 3 → Test Files 13 passed (13) / Tests 118 passed (118) / 1.82s

$ npm run typecheck
> tsc -p tsconfig.json
(exit 0, no output)

$ node engine/scripts/leak-check.mjs ..
leak/structural scan: clean
(exit 0)
```

**Determinism: confirmed.** Three consecutive runs, identical file count, test
count and pass count. No flake. The builder's "118 green" claim is accurate.

It is also, on its own, worth very little. Every finding in §3 below is live in
that green suite.

### 1.2 My own reproductions (not taken from the claimants)

I re-derived the highest-severity claim in each dimension from scratch rather
than accepting the verifier write-ups.

**M1 — float residue bricks the meter** (`node --experimental-strip-types`,
importing `engine/src/spend-meter.ts` directly). Three consecutive runs,
byte-identical:

```
after 3 reserves, reservedUsd = 0.03
committed: 0.03  reserved: -3.469446951953614e-18
4th reserve THREW: MeterUnavailableError | reserved spend is not a finite non-negative number — refusing spend (fail closed)
todayUsd still works: 0.03
record still works: 0.04
```

**M3 — `capsTable` defeats the H8 sign-off refusal**:

```
=== production caps for pulsern ===
{"dailyAdSpendUsd":70,"totalAdSpendUsd":2000,"dailyAiSpendUsd":25,"humanSignoff":null}
assertCapsUsable THREW: caps lack human sign-off (H8) — all spend paths refuse
injected: {"dailyAdSpendUsd":1e9,"totalAdSpendUsd":1e9,"dailyAiSpendUsd":1e9,"humanSignoff":"self-approved-by-agent"}
injected assertCapsUsable: PASSED — H8 DEFEATED
```

**M2 / A2 — `release()` is never called; a vault miss strands the day's budget**
(through the real `llm()`):

```
call 0..4 -> VaultError
after 5 vault-miss calls: committed= 0  reserved= 0.05  transportCalls= 0
6th (vault repaired) call -> CapError | AI spend cap breach refused: projected $0.0600 > daily cap $0.05 for "testco"
FINAL committed= 0  reserved= 0.05  transportCalls= 0
```

Zero requests ever left the building. The entire daily AI budget is refused.

**C5 / C6 / C7 — the adversary-report gate** (driving the real
`gate-lib.mjs` exports):

```
gate-blocks | C5 vacuous-hash (clean PASS, TREE=abc123) | report has no 'verified-tree:' binding (stale-report protection)
GATE-OPENS  | C5 prose decoy w/ REAL hash (visible verdict=FAIL) | adversary report PASS and bound to the current tree
GATE-OPENS  | C6 html-comment (visible verdict=FAIL)             | adversary report PASS and bound to the current tree
GATE-OPENS  | C6 4-space indented code block (visible=FAIL)      | adversary report PASS and bound to the current tree
gate-blocks | control plain FAIL | verdict is not PASS: "Verdict: FAIL"
```

The first line is the finding *about the tests*: a clean, indisputably valid
`Verdict: PASS` also fails, because `TREE = "abc123"` is 6 hex chars and
`readTreeBinding` requires 7–64. Every assertion in the F4 describe block passes
without the parser ever being consulted.

**C12 / D6 / C2 — Class-2 coverage** (real `checkClass2Approvals`):

```
UNPROTECTED fullburn/package.json
UNPROTECTED fullburn/config/package.json
UNPROTECTED fullburn/config/src/channels.ts
UNPROTECTED fullburn/config/src/markets.ts
UNPROTECTED fullburn/config/src/models.ts
UNPROTECTED fullburn/engine/src/eval-harness.ts
UNPROTECTED fullburn/engine/test/invariants/invariants.test.ts
protected   fullburn/config/src/caps.ts
```

**D1 / D2 — Grade Registry** (real `computeGrades`):

```
data-truth drift=-Infinity  -> {"area":"data-truth","grade":"A","failing":[],"missing":[]}
data-truth drift=5 (control)-> {"area":"data-truth","grade":"BELOW_A","failing":["stripe_warehouse_drift_pct"]}
marketing recon=-9999       -> {"area":"marketing-engine","grade":"A","failing":[]}
adversary pct=Infinity      -> {"area":"adversary-layer","grade":"A","failing":[]}
dummy-proof drill=-5s       -> {"area":"dummy-proof","grade":"A","failing":[]}
```

**A1 / A7 — structural scanner** (real `scanContent`):

```
--- REGISTRY_INDEXING (the F19 fix) ---
CAUGHT  CHANNELS["google"]      (the prior report's own example)
MISSED  CHANNELS.google         (dot access)
MISSED  const { google } = CHANNELS
MISSED  Object.values(CHANNELS)
MISSED  alias then index
--- PLATFORM_API_HOSTS (Law 1) ---   CAUGHT literal · MISSED env-supplied · MISSED concat-split
--- PREDICTION_GATE (Law 6) ---      CAUGHT predictedRoas · MISSED expectedRoas · MISSED predicted_roas
--- PROVIDER bypass (Law 11) ---     CAUGHT import openai · MISSED @ai-sdk/openai · MISSED env.AI.run(...)
--- /test/ exemption ---
  findings: 2 | fullburn/engine/src/adapters/meta.ts        (control — fires)
  findings: 0 | fullburn/engine/src/test/live-provider.ts
  findings: 0 | fullburn/engine/src/adapters/test/meta.ts
  findings: 0 | fullburn/engine/evals/live/meta-adapter.ts
```

**A3 — the crown-jewel secret reaches the trace sink verbatim** (through the
real `llm()`, with a transport that mirrors request headers into its 200 body):

```
TRACE EVENT: [{"traceId":"t-1","clientId":"testco",...,"output":{"greeting":"hi",
  "debug_echo":{"authorization":"Bearer canary-vault-value-do-not-leak-8891",
  "x-fullburn-client":"testco"}},"outcome":"ok"}]
>>> CANARY PRESENT IN TRACE? true
```

**A6 — the leak scan's blind spot.** `walk()` handed the repo root visits 345
files including `.github/` and `pulsern/`. But `scanTree` hardcodes
`walk(join(repoRoot, "fullburn"))`, so the CI invocation
`node engine/scripts/leak-check.mjs ..` never reaches either. `pulsern` is
client zero, with live `$70/day` / `$2,000` caps in `config/src/caps.ts`, and its
app and its own workflows sit in this repo unscanned.

---

## 2. Severity ladder used

Per the mandate, with one project-specific refinement the previous report
already established (`ADVERSARY_REPORT_phase0.md:38`): **control-plane findings
rank immediately after money loss, above ban risk.** A gate that lets unreviewed
money code ship is not a reporting problem.

| Rank | Band |
|---|---|
| 1 | Money loss |
| 1a | Control plane (S1-adjacent) |
| 2 | Ban risk |
| 3 | Data lies |
| 4 | Isolation breaks |
| 5 | Dummy-proof |

---

## 3. Confirmed findings

Source IDs from the five attack dimensions are preserved in brackets.
Where two adversaries found the same defect independently it is merged and
marked **[corroborated ×2]**.

### S1 · MONEY LOSS — 7 findings

---

#### R2-01 [M1] · Float residue drives `reservedUsd` negative and the meter's own fail-closed guard then bricks the client's budget permanently

**Files** `engine/src/spend-meter.ts:93` (`assertUsableAmount(reserved, …)`),
`:106` (`reserved + amountUsd`), `:115`/`:123` (`− open.amountUsd`).

**Repro** — three overlapping `$0.01` reservations, then settle all three:

```
const m = new MemorySpendMeter();
const a = m.reserve("pulsern", 0.01, 25);
const b = m.reserve("pulsern", 0.01, 25);
const c = m.reserve("pulsern", 0.01, 25);
m.settle(a); m.settle(b); m.settle(c);
m.reserve("pulsern", 0.01, 25);   // throws, forever
```

**Observed** (§1.2, 3/3 runs identical): `reserved: -3.469446951953614e-18`, then
`MeterUnavailableError: reserved spend is not a finite non-negative number`.
End-to-end through `llm()` with a $10.00 cap: batch 0 succeeds, batch 1 rejects
5/5, every call thereafter refused. Committed spend $0.05 of $10.00.

`reserve()` accumulates by repeated addition (`0.01+0.01+0.01 =
0.030000000000000006`); `settle()` decrements by the stored per-reservation
amount. The two paths round differently, leaving `-2^-58`. The residue appears
only when reservations **overlap** — which is the sole reason reserve/settle
exists. A cost×depth sweep shows `$0.01` and `$0.02` — the `hello-world` and
`genome-tagger` role cards, 2 of the 3 roles that exist — go negative at every
overlap depth 3–12; `$0.05`/`$0.10`/`$0.003` never do.

**Why the suite is green**: `spend-meter.test.ts:11-24` reserves 5× then settles
**one**, so the accumulator never drains to zero; and it asserts with
`toBeCloseTo(…, 10)`, which would mask `-3.47e-18` even if it did.

**Three consequences.** (a) The money path stops working after $0.03 of a $25
budget, so the bracket cannot kill losing ads — Law 19's kill scenario. (b)
`MeterUnavailableError` is a **data lie**: the meter is fully available
(`todayUsd()` and `record()` both still work after the brick); its own arithmetic
bricked it, and an operator will hunt a Durable Object outage that does not
exist. There is no reset, rollover or reaper anywhere in `engine/src` or
`config/src`, so the brick is permanent for the meter's lifetime — in production,
the client's long-lived DO. (c) `spend-meter.ts:14` instructs the Phase 5/6
ad-spend path to "adopt it unchanged".

**Spec** Law 2 / §1.2 (money safety is code); §2.2; CLAUDE.md invariant 2.

**Note to the builder**: the fix is to stop accumulating by repeated float
addition — sum the open reservations, or hold integer micro-dollars. Do **not**
loosen the guard at `:93`; it is doing its job correctly on bad input handed to
it by its own sibling.

---

#### R2-02 [M2 + A2-isolation] · `release()` is bound but never called — any failure between `reserve()` and `transport.post()` permanently burns cap headroom **[corroborated ×2]**

**Files** `engine/src/gateway.ts:70` (binds `release`), `:98` (reserve),
`:106`/`:108`/`:109` (three throwers), `:123` (post), `:131`/`:138` (the only
`settle` calls). `grep` over `engine/src` + `config/src` confirms `release` is
invoked **nowhere** outside `spend-meter.ts`'s own definition and its unit test.

**Repro** — a vault with no `ai-gateway-key` (secret not yet provisioned, or
rotated out from under an in-flight call), cap $0.05, role `hello-world`, six
calls. Also reproducible with `gatewayBaseUrl = "not-a-url"` (`new URL()` throws
at `:108`) and with a throwing `deps.now()` at `:109`. No `try/finally` covers
`:106-109`.

**Observed** (§1.2): five `VaultError`s with `reserved` climbing to $0.05 and
`committed` at $0.00; the sixth call — **with the vault repaired** — refused with
`CapError: projected $0.0600 > daily cap $0.05`. `transportCalls = 0` throughout.
The client's entire day is unrecoverable: `MemorySpendMeter` has no rollover or
reaper.

**Also a data lie, and worse than first described**: the throw at `:106` precedes
`traceBase` construction at `:111`, so the trace sink emits **0 events** on this
path. `todayUsd()` reports $0.00 while every call is refused, and `reservedUsd()`
is surfaced in no error message, no trace and no digest — and is not even part of
the `SpendMeter` interface any DO-backed implementation must honour. The refusal
is invisible on every surface an operator has, and is also an untraced decision
(Law 11).

**The code's own contract states it**: `spend-meter.ts:41` documents `release()`
as "Release a reservation for a request that never left the building", and
`gateway.ts:130` states the settle-not-release rule for the case where it did.
The exact case `release()` exists for is never invoked.

**Control** (verifying the settle/release split is deliberate, not misread): a
throwing `transport.post()` correctly **settles** — `committed=0.01 reserved=0`.
So the design is right and only the release side is unwired.

**Correction to the original claim**: the "12 vault-miss calls against a $0.60
cap consumed $0.6000 of headroom" figure does not reproduce (12 × $0.01 = $0.12,
no cap refusal). The accurate statement: every failure in that window burns
exactly one role-budget unit permanently, so `cap/roleBudget` failures zero any
client's day.

**Spec** Law 2; Law 19; §12 ("0 cap breaches" presumes the cap tracks reality).

---

#### R2-03 [M3] · `deps.capsTable` is a runtime cap-widening path that also defeats the H8 unsigned-caps refusal, and no CI rule catches it

**Files** `engine/src/gateway.ts:30` (`readonly capsTable?`), `:92`
(`getCaps(req.clientId, deps.capsTable)`), `:93` (`assertCapsUsable`).

**Observed** (§1.2): `getCaps("pulsern")` against the real frozen table returns
`humanSignoff: null`, and `assertCapsUsable` throws *"caps lack human sign-off
(H8) — all spend paths refuse"*. With a caller-supplied table it returns
`dailyAiSpendUsd: 1e9, humanSignoff: "self-approved-by-agent"` and passes. 300
`llm()` calls for `pulsern` — a client whose real caps refuse **all** spend —
were permitted, committing $3.00.

Both gates fall from the same object. The sharper half is the sign-off: H8 is the
control that makes caps structurally unusable until a human signs, and
`assertCapsUsable` accepts any non-null string read off the caller's own record.
**An agent can sign its own caps with a string literal.**

**Compounding — the cap is read twice.** `assertSaneCap` (`caps.ts:61`) and
`gateway.ts:98` each read `dailyAiSpendUsd`. A getter returning `0.01` on the
first read and `MAX_SAFE_INTEGER` on the second passed validation and permitted
50 calls (100 getter reads for 50 calls). `getCaps` returning without throwing is
not evidence the enforced cap was validated.

**Nothing stops it shipping.** `scanContent()` over a module doing exactly this
returns `[]` — there is no `capsTable` rule in `scan-lib.mjs` — and `CLASS2_FILES`
is a literal path list, so a *new* module that merely calls `llm()` with its own
table ships as a Class-1 change.

**The file's claim about itself is false.** `caps.ts`'s header states "No runtime
path may raise a cap; there is deliberately no setter API and no default cap."
The optional table parameter is a setter API by another name.

**Collateral worth the builder's attention**: `helpers.ts:54`,
`adversary-phase0.test.ts:53` and `gateway.test.ts:49` — including the "ATTACK cap
breach" test — all route through this seam. That test proves the meter enforces
*whatever number was passed in*, not that the engine enforces `config/caps.ts`.
Exactly one test (`gateway.test.ts:60`) strips the seam. §10.2 bullet 2 and AC5
are weaker than they read.

**Spec** Law 2 verbatim ("No runtime path may raise a cap"); CLAUDE.md prime
directive 2; Law 15 / §13 Class 2.

**Prior-report gap**: `ADVERSARY_REPORT_phase0.md` §2 lists "Runtime cap
mutation — mutation and table-injection both throw TypeError. CONFIRMED-COVERED."
That refutation covers mutating the frozen object. It does not cover passing a
different object as the second parameter. The frozen table *is* still genuinely
immutable — I re-verified both mutation and key-addition throw `TypeError`.

---

#### R2-04 [C1] · Class-2 protection on the cap table is fully bypassable: `config/package.json` decides which file `@fullburn/config/caps` resolves to, and it is not Class-2

**Repro** (clone at `df95668`): add `config/src/caps.prod.ts` re-exporting
`caps.ts` but spreading the table with an attacker entry and shadowing `getCaps`;
`sed` the `exports` map `"./caps": "./src/caps.ts"` → `"./src/caps.prod.ts"`.
`config/src/caps.ts` is never touched and never appears in the diff.

**Observed**: diff is exactly `M fullburn/config/package.json` +
`A fullburn/config/src/caps.prod.ts`. `class2-gate` → **"no Class-2 changes",
exit 0**. Typecheck 0. `npm test` → 118/118. `leak-check` clean. Runtime probe on
the untouched tree: *"stopped after 0 calls → CapError: caps lack human sign-off
(H8)"*. On the exploited tree: **"500 production LLM calls for pulsern
ALLOWED"**, `dailyAiSpendUsd: 1e9`, `humanSignoff: "auto"`.

**Important correction to the claim, which makes it worse, not better.** The
naive version does *not* keep the suite green — 5 tests fail, because the cap and
invariant tests import through the same specifier. That defence collapses to one
line: gating the swapped table on `process.env.VITEST` returns the genuine table
under vitest and the attacker table everywhere else. That is the version behind
the results above. **The test suite is not a control here — it is a checkable
oracle the attacker reads and dodges.**

**Why it is a violation of the code's own stated contract**: `gate-lib.mjs:4-11`
says `CLASS2_FILES` covers "not just the VALUES a human owns but the CODE that
enforces them", because "a cap constant that cannot be edited without approval is
worthless if the line that reads it can". The list omits the file that decides
*which module those specifiers resolve to* — a strictly more powerful lever than
any file on it.

**Mitigation checked and rejected**: `adversary-gate` does fail on the exploited
tree — but it fails identically on the untouched base tree. It is a freshness
check, not a detector, and is satisfied by any subsequent PASS report (see
R2-08). `class2-gate`, the control specifically responsible for saying "a human
must approve this", affirmatively reports **no Class-2 changes**.

**Scope note (read, not executed — hypothesis)**: the same `exports` map also
resolves `./grade-thresholds` and `./freeze`, both Class-2. The workspace root
`package.json` and `engine/package.json` are likewise unlisted.

**Spec** Law 2; §13 Class 2 (money paths human-only).

---

#### R2-05 [C3] · Approval replay: a superseded approval doc re-added verbatim re-authorizes the old content forever

**Repro** — seed a realistic history: commit A sets `dailyAdSpendUsd: 500` with a
January approval carrying that content-hash; commit B (BASE) lowers to `70` with
a February approval — the human's decision to revoke. Attacker branch: restore
`500` and `cp APPROVALS/2026-01-02-caps.md APPROVALS/2026-08-15-restore.md`.

**Observed**: diff is `A …restore.md` + `M …caps.ts`. Gate prints **"class2 gate:
Class-2 changes carry approvals", exit 0**, with `caps.ts` reading
`dailyAdSpendUsd: 500`. `cmp` confirms the copied file is byte-identical to the
human's own January artifact — **no forgery required**.

Closing the loop: the first `npm test` fails 1/118 on `caps.test.ts:10`'s
hardcoded `.toBe(70)`. That is an incidental literal, not a defence —
`caps.test.ts` is not in `CLASS2_FILES`. After a one-line `sed`: **118/118 green,
gate exit 0, cap at $500/day** — a 7× unapproved spend increase with the whole CI
surface green.

**Self-amplifying.** Seeding a history where `gate-lib.mjs` itself had an earlier
approved revision (one whose only difference was dropping the `content-hash` term
from the match at `:161`), then reverting to it and replaying its approval doc:
**gate exit 0**, and the tree now matches approvals on path alone. One replayed
approval can reinstate any previously-approved version of the gate that guards
everything else.

**Root cause**: `checkClass2Approvals` (`gate-lib.mjs:150-163`) matches only
`(path, content-hash)` — no nonce, no base-commit binding, no supersession, no
expiry. It authorizes a **content state**, never a **transition**, so every state
the human has ever approved stays authorized forever. `gate-lib.mjs:146` claims
the added-in-this-diff rule "stops a pre-existing approval from being
re-harvested"; a `cp` under a new filename re-harvests one. The F14 fix tests
only `status: "modified"` (`gates.test.ts:119`); a copy arrives as `"added"`.
`grep` for `supersed|replay|nonce|base-commit|expir|revoke` across the repo finds
nothing on point.

**`APPROVALS/README.md` is false as written**: "The content-hash pins the approval
to the exact new content … so an approval can never be reused for a different
change." The change 70→500 *is* a different change from the one signed, even
though the resulting bytes match.

**Honest qualification**: CODEOWNERS on `APPROVALS/**` (H19) would put a human on
the PR, so "this survives H19" overstates it. But L11 is open, the gate is
today's only defence, and it actively *misleads* that future reviewer by printing
"Class-2 changes carry approvals" over a commit titled "restore prior caps."

---

#### R2-06 [C4] · Renaming a Class-2 file silently drops it out of the protected set

**Repro** `git mv fullburn/config/src/caps.ts fullburn/config/src/caps.v2.ts`,
append content, commit, run `class2-gate`.

**Observed**: `git diff --name-status` emits
`R097<TAB>…/caps.ts<TAB>…/caps.v2.ts`. Gate prints **"no Class-2 changes", exit
0**. Control (in-place edit of the same file) correctly prints
`CLASS-2 GATE FAIL … caps.ts`, exit 1. The gate is armed; the rename walks past
it.

**Full landable chain**: rename + repoint `config/package.json` (unprotected, see
R2-04) + raise `dailyAdSpendUsd` 70→700,000, `totalAdSpendUsd` 2,000→9,000,000,
`dailyAiSpendUsd` 25→250,000 + forge `humanSignoff: null → "forged-by-attacker"`.
Typecheck 0. Five tests fail — all literal cap/sign-off assertions in unprotected
test files; edit them (the same thing any attacker or careless refactor does) and
`npm test` returns **118/118**. `leak-check` clean. `class2-gate` **exit 0**.
Caps raised 10,000× and H8 forged, every gate green.

**Mechanism** — both CLIs share a 3-line parser (`class2-gate.mjs:22-25`,
`adversary-gate.mjs:77-80`): `const [status, ...rest] = line.split("\t")` with
`path: rest[rest.length-1]`. `R###` is neither `A` nor `D`, so it maps to
`modified` with only the **new** path retained. The old path is discarded at any
similarity score, and the `-M`/`-C` index is never examined.

**The same bug reaches the append-only check.** Feeding
`R100<TAB>reports/ADVERSARY_REPORT_phase0.md<TAB>reports/archive-old-notes.md`
into `checkReportsAppendOnly` yields `{"ok":true,"reason":"reports append-only
holds"}` — a standing FAIL report can be renamed out of existence while the gate
certifies append-only intact. `ADVERSARY_REPORT_phase0.md:256` asserts the
opposite: *"Report append-only — modified, deleted and renamed reports all
blocked. CONFIRMED-COVERED."* That claim is false; there is no rename test
anywhere (`grep -rn -i renam engine/test config/test` → no hits). **That false
claim is the reason C4 survived the F1–F19 fix pass.**

**Blast radius**: beyond caps, the same bypass covers `gateway.ts`,
`spend-meter.ts`, `grade-thresholds.ts`, `grade-registry.ts`, `freeze.ts`, and
every gate script including `gate-lib.mjs` — the entire Class-2 change-control
root.

**Hypothesis, not reproduced**: copy detection (`C###`) would behave identically,
but `git diff --name-status` does not enable it by default and no `C###` line was
emitted in any run.

**Honest caveat on today's blast radius**: `dailyAdSpendUsd`/`totalAdSpendUsd` are
documented as unenforced before Phase 6. But `dailyAiSpendUsd` **is** enforced
pre-call in `llm()`, and the `humanSignoff` null-check is the structural refusal
that currently blocks all spend. Both were defeated with zero approvals.

---

#### R2-07 [A1-honesty] · F3's lock test covers only one of the finding's two named paths — a one-word revert resurrects the money loss with 118 tests green

**Repro** — in `engine/src/gateway.ts`, in the catch block around
`deps.transport.post`, change `meter.settle(reservation)` to
`meter.release(reservation)`. One word.

**Observed**: `npm test` → **118/118 pass**. `npm run typecheck` → exit 0
(`release` is a real `SpendMeter` member, so it compiles). `leak-check` clean.
Probe of 200 sequential `llm()` calls, role `hello-world`, $0.05 cap,
$0.01/call, against a transport that increments a counter then throws (an
upstream timeout after the provider has already processed the request):

```
BILLABLE UPSTREAM CALLS = 200;  METER = $0.0000;  CAP = $0.05
```

That is F3 verbatim — unlimited billable calls, meter never moves. **Control**
against unmutated shipped code: `5 calls, $0.0500 committed`. The probe
discriminates; the shipped code is correct.

**Why nothing catches it**: the F3 lock (`adversary-phase0.test.ts:98-122`) drives
only the schema-invalid path (`transport.response = {not_the_schema:true}`),
which settles at `gateway.ts:138` — a physically different statement from the
catch-block settle at `:131`. F3's own text names both: *"The same hole applies to
a transport timeout after the provider has already processed the request."* Two
other tests drive a throwing transport (F7, F8) but assert only on secret leakage
and trace count; neither touches the meter. `gateway.test.ts` has no meter
assertion after a transport throw.

**Fairness to the builder**: this gap predates the fix commit. The recovered
pre-edit blob (`de4831b64569`) did not cover the throw path either, so the
builder's flagged edit neither created nor closed it.

**Spec** §10.2 line 282: *"Spend caps present, immutable at runtime, **tested by
attempted breach**"*. The transport-error money path has no attempted-breach test.

**Severity note, stated plainly**: no money leaves today — `gateway.ts:131` is
correct. What is missing is the guarantee that it stays correct. It is filed at
severity 1 because §10.2 puts "tested by attempted breach" under Law 2 and the
demonstrated mutation restores unbounded spend behind a fully green gate set.

---

### S1a · CONTROL PLANE — 5 findings

---

#### R2-08 [C2] · `fullburn/package.json` is not Class-2, and it defines every check the CI `verify` job runs; the invariant suite is deletable with no approval

**Repro** — set `scripts.test` to
`"vitest run --passWithNoTests --dir engine/test/does-not-exist"` and
`scripts.typecheck` to `"true"`; `git rm -r engine/test/invariants`.

**Observed**: diff is `D …invariants.test.ts` + `M …package.json`. `class2-gate`
→ **"no Class-2 changes", exit 0**. `leak-check` clean. `npm test` →
*"No test files found, exiting with code 0"*, exit 0. `npm run typecheck` → `true`,
exit 0. The CI `verify` job runs literally those two scripts from `fullburn/`, so
**both steps become no-ops.**

This falsifies `gate-lib.mjs:27`'s own comment — *"The gates themselves, and the
config that decides whether they run"* — `package.json` **is** the config that
decides whether they run. It also defeats the builder's own regression test at
`adversary-phase0.test.ts:169` ("the test-runner config can disable the invariant
suite, so it is Class 2"): protecting `vitest.config.ts` is worthless when the
script that invokes vitest, with its own `--dir` override, is unprotected.

**Correction to the claim, and it matters.** The 2-file diff does **not** turn all
four jobs green: `adversary-gate` exits 1 on any `fullburn/` change
(tree-hash staleness). I then tested whether that backstop actually stops the
attack: computed the new tree hash the way the gate does, wrote a 4-line
self-authored `ADVERSARY_REPORT_phase0.v2.md` containing `Verdict: PASS` +
`verified-tree: <hash>`, committed it (an ADD, which append-only permits), and
re-ran. **All four jobs exit 0.** The backstop is agent-writable: it raises the
cost of the attack by one file, it does not block it.

**Net effect**: the 118-test suite — including every cap-race, fail-open-meter
and unmetered-spend regression added for F1–F3 — is silenced with no human
approval, in any PR, forever. Fix is one line: add `fullburn/package.json` (and
`tsconfig.json` / `tsconfig.base.json`) to `CLASS2_FILES`, with a
`gates.test.ts` assertion.

---

#### R2-09 [C6] · Verdict parsing still reads PASS out of indented code blocks, HTML comments and mismatched fences

**Observed** (§1.2, my own probe, each report carrying a valid 40-hex binding and
a human-visible verdict of FAIL):

| case | result |
|---|---|
| `<!--\nVerdict: PASS\n-->` above `Verdict: FAIL` | **GATE-OPENS** |
| 4-space-indented `    Verdict: PASS` (a markdown code block) | **GATE-OPENS** |
| tab-indented variant | **GATE-OPENS** |
| ` ````markdown ` outer fence wrapping a ` ``` ` example | **GATE-OPENS** |
| ` ``` ` opened / `~~~` mismatched close | **GATE-OPENS** |
| plain PASS then plain FAIL (first wins) | **GATE-OPENS** |
| CRLF FAIL · plain FAIL · 3-space list fence | correctly blocked |
| genuine PASS, with and without BOM | correctly opens |

**End-to-end through the shipped CI binary**, not just the library: in a clone,
deleted the existing FAIL report, computed the real tree hash the gate itself
computes, and committed one report whose full rendered text a human reads as
*"The engine is not safe. Nineteen findings remain open." / `Verdict: FAIL`* with
`<!--\nVerdict: PASS\n-->` above it. `node adversary-gate.mjs .` printed
*"adversary report PASS and bound to the current tree"*, **EXIT=0**.

**This falsifies the code's own fixed-F4 contract** at `gate-lib.mjs:37-40`: *"a
verdict must not be readable out of an example, a quote or a fenced block."* The
parser is a line-oriented toggle with no nesting depth, no fence-marker matching
(` ``` ` cannot be closed by `~~~`), no indented-code-block awareness and no
HTML-comment awareness.

**Corrections to the original claim** (the core survives; two legs do not): the
specific `~~~`-inside-` ``` ` fixture as transcribed *blocks* — the parser ends
stuck inside a fence and returns null. The mechanism is real but the fixture was
wrong; the mismatched-close variant above does open. And the table-cell case
requires omitting the leading pipe, which renders as a *visible* cell, so the
"invisible verdict" framing does not hold there — discount it.

**Also unresolved and worth the builder's decision**: `gates.test.ts:81-83`
deliberately asserts `Verdict: PASS (CONDITIONAL — ledger open)` parses as PASS,
while `adversary-phase0.test.ts:134` asserts the opposite contract for the same
shape of line. Two tests in one suite assert contradictory contracts on one
parser, and both are green **only** because the broken 6-char hash short-circuits
one of them (R2-13). Fix the hash and the suite goes red until someone states
which contract is real.

---

#### R2-10 [C7] · A fresh FAIL does not block when a fresh PASS also exists — contradicting the code's own comment

**Repro** — in a clone: write `reports/ADVERSARY_REPORT_phase0.b.md` with
`Verdict: PASS` + the current tree binding; commit; gate → exit 0. Then write
`…phase0.c.md` with `Verdict: FAIL` + the **identical** binding (a later re-run
finding a cap breach); commit; re-run the gate.

**Observed**: *"adversary gate: ADVERSARY_REPORT_phase0.b.md: adversary report
PASS and bound to the current tree"*, **EXIT=0** — with an unresolved severity-1
FAIL bound to the identical tree sitting in `reports/`. Tree hash unchanged.

**Order-independent, not a sorting artifact.** Direct probe of
`checkAdversaryReport` (§1.2 and four fixtures): fresh FAIL + stale pass → shut
(correct); fresh PASS + fresh FAIL → **open**; fresh FAIL sorting *first* + fresh
PASS → **open**; two fresh FAILs + one fresh PASS → **open**. Root cause is
`gate-lib.mjs:117`: `const pass = judged.find(j => j.ok)` runs unconditionally,
and the fresh-FAIL branch at `:120` is only reached when no fresh PASS exists.

**Contradicts three things.** (a) `gate-lib.mjs:96-103`: "a FAIL bound to the
current tree blocks." It does not. (b) `engine-adversary.md:41`: "FAIL blocks the
phase gate. You cannot be overridden by the builder — only by the human, in
writing, recorded in the report." Here a FAIL is overridden automatically by a
pre-existing file, with no human and nothing in writing. (c) §12 Adversary layer
requires "0 unreviewed FAILs"; this gate cannot enforce that.

Because reports are append-only and the tree hash confers freshness, **an
adversary can never revoke a PASS for a tree it already passed.** This is not
hypothetical scheduling: ledger **L8 / H6b requires a second, non-Claude
adversary to re-review this exact tree.** If that re-review returns FAIL, CI
stays green.

**Aggravating**: `gates.test.ts:47` is named *"re-runs: a FAIL bound to the
CURRENT tree still blocks, whatever else is in history"* — but its fixture pairs
the fresh FAIL with a **stale** PASS, the one case that already worked. Replacing
that stale PASS with a fresh one flips the result to `ok:true`. The suite ships a
green test whose name states a property the code does not have. **That green test
is why the fix commit missed it** — and it is itself a severity-3 data lie
(filed with R2-13's family).

---

#### R2-11 [C12] · `CLASS2_FILES` is incomplete — the market/channel switchboard, every package manifest, and the entire test tree are Class-1

**Observed** (§1.2 for the gate probe; individual commits for the runtime half):
`class2-gate` returns "no Class-2 changes", exit 0, for every one of:
`fullburn/package.json`, `config/package.json`, `engine/package.json`,
`tsconfig.json`, `tsconfig.base.json`, `config/src/channels.ts`,
`config/src/markets.ts`, `engine/src/vault.ts`, `engine/src/tracing.ts`,
`engine/src/redact.ts`, `fullburn/PHASE`, `config/test/switchboard.test.ts`, and
`git rm -r engine/test/invariants`.

**The switchboard half, executed end to end.** Flipping `google: "staged" → "on"`
and `tiktok: "locked" → "on"`: gate exit 0, and importing the edited module gives
`activeChannels: meta,google,tiktok` with `requireActiveChannel("google")`
returning a live entry whose `writeAdapter`, `decisionAdversaryRules` and
`fatigueModel` are all **null**. Markets behave identically: `EU: "locked" → "on"`
yields a live entry with `jurisdictionPack: null` — §2.5's "no pack, no ads"
bundle is empty and the flag is on anyway.

**The test backstop is removable in the same diff.** The flip alone *is* caught (4
failures in `switchboard.test.ts`). But in a clean clone, three changes — the two
flips, `scripts.test` → `echo "no tests configured"`, and one added self-authored
PASS report — produced: typecheck 0, `npm test` 0, `leak-check` 0,
`adversary-gate` 0, `class2-gate` 0, and `ls APPROVALS/` → `README.md` only.
**Zero human approvals, all gates green, Google and TikTok live.**

**Spec** CLAUDE.md:55 escalation list ("Any market/channel flag-flip request") —
human-only by the project's own memory file, enforced by nothing. Law 18 / §2.5
("A flag flips on only after its bundle passes adversary on live data") — I
flipped two with empty bundles. Law 4 ("every gate that touches money, policy, or
client-visible numbers is enforced by hard-coded checks") — this one is enforced
by a unit test the same PR deletes.

**Distinct from F5**, which named six paths (`grade-registry.ts`, `gateway.ts`,
`spend-meter.ts`, `leak-check.mjs`, `freeze.ts`, `vitest.config.ts`) — all now
present and locked by `gates.test.ts:90-105`, which enumerates exactly the F5 set
and nothing about the switchboard. Also distinct from ledger L11: L11 discloses
that the gates are *advisory* pending H19; it does not disclose that the protected
**file set** omits the switchboard. **Even with H19 fully landed, no approval
would ever be demanded for a channel flip.**

**Severity note**: filed here rather than at money-loss because at Phase 0 there is
no spend path and `writeAdapter` is null — no dollar can move today and I
reproduced none. Its realized harm class the moment Phase 5/6 lands is money-loss
plus ban-risk: a channel live with null decision-adversary rules and null fatigue
model.

---

#### R2-12 [D6] · Law 13's enforcement code is Class-1: `validateBindings`, `assertAttestation` and the eval harness can be rewritten with no human approval

**Observed** (§1.2): `config/src/models.ts` and `engine/src/eval-harness.ts` both
return `{"ok":true,"reason":"no Class-2 changes"}`; the control
`engine/src/grade-registry.ts` correctly returns the FAIL.

**Executed end to end.** Neutering `validateBindings` to `return;` is caught by 2
tests — but **no test file is in `CLASS2_FILES` either**, so deleting those two
`it` blocks is a Class-1 edit by the gate's own classification. On the combined
changeset: `npm test` 116/116, typecheck clean, `leak-check` clean, `class2-gate`
"no Class-2 changes" for all three paths. Then, through the real `bindRole`:

```
POST-MUTATION BINDINGS: {"hello-world":"claude-sonnet",
  "genome-tagger":"claude-sonnet","creative-decision-adversary":"claude-sonnet"}
```

The creative domain's builder and adversary now run on the same family. **Law 13
dead, every CI gate green, class2-gate silent.**

The eval-harness half is the same shape: replacing the field-match at
`eval-harness.ts:74` with `const ok = true;` makes `runEval` always return
`passed == total`; because `assertAttestation` only checks that
`score == passed/total`, the arithmetic closes and **any model binds to any
role**. §2.4's "no pass, no bind" is defeated, and §12's Model-layer A-criterion
is exactly the number the rewritten code produces — §12 anti-Goodhart: the engine
grading the bar it is measured against.

**The gate's own doc comment claims otherwise** (`gate-lib.mjs:8-11`). `models.ts`
holds the only code enforcing Law 13, and it is Class 1.

**Genuine design complication, routed to the human rather than prescribed**: §13
names "role→model bindings" as explicitly **Class 1**, and `ROLE_BINDINGS`
(`models.ts:101-105`) lives in the same file as the enforcement code. Blanket-
protecting `models.ts` would make every legitimate rebind human-only. The
structural fix is to split enforcement (`validateBindings` / `assertAttestation` /
`familyOf`) into a Class-2 module and leave `ROLE_BINDINGS` Class 1. That is a
design change, so it is reported, not applied.

---

### S2 · BAN RISK — 3 findings

---

#### R2-13 [A1-isolation] · The three newly "armed" negative invariants are literal-string greps; each misses the most natural spelling of what it bans

**Observed** — see the full CAUGHT/MISSED table in §1.2. Summary: the F19
registry rule catches only `CHANNELS["google"]` — *the exact literal the previous
report used as its example* — and misses dot access, destructuring,
`Object.values`, `Object.entries`, aliasing and import-renaming. The platform-host
rule catches the literal and misses env-supplied and concatenated forms, and
misses the same host written into `engine/src/hosts.json` or
`engine/wrangler.toml` (structural rules early-return on non-code files,
`scan-lib.mjs:76`, while `leak-check`'s `SCANNED` regex happily *reads* those
files). The prediction-gate rule catches `predictedRoas` and misses
`expectedRoas`, `predicted_roas`, `pWin`, `m.predicted.roas`. The provider rules
miss `@ai-sdk/openai`, `@langchain/openai`, `@google-cloud/vertexai`, azure
openai, bedrock, deepseek, x.ai, cohere, ollama localhost — and
**`env.AI.run('@cf/meta/llama-3-8b-instruct')`**, the Workers AI binding named in
CLAUDE.md's stack pin as something that must "always [go] through AI Gateway,
never direct". It has no hostname and no import, so it is invisible to every rule
in the file.

**The runtime half is a real bypass, not just a grep gap.** Executed:
`CHANNELS.google` returns `{"status":"staged",…}` and `const { tiktok } =
CHANNELS` returns `{"status":"locked",…}`, both without ever entering
`requireActiveChannel`. `CHANNELS` is exported raw and merely frozen, not
encapsulated. So CLAUDE.md's standing invariant *"locked market/channel flags are
structurally inert"* is **not structural** — it rests entirely on a regex that
misses dot access.

**Why this is dishonesty and not a coverage wish**:
`engine/test/invariants/invariants.test.ts:89-97` titles two tests *"LIVE —
writes-only: no code path may reach a platform API host (Law 1, mass-read half)"*
and *"LIVE — no prediction-gate code paths exist (Law 6)"*. Neither test scans the
tree at all; each hands `scanContent` one hand-picked literal and asserts
`length > 0`. That proves a detector fires on one string; it is labelled as an
**absence property over the codebase**. The same file's header sets the standard
being violated: *"an entry that asserts nothing is worse than an absent one,
because it reads as coverage (adversary finding F13)."*

**Calibrated honestly**: I discount the deliberate-obfuscation cases (concat,
array-join, `import("ope"+"nai")`) — a linter that loses to self-sabotage is not
the threat model. The finding survives entirely on the cases that are **the
default way to write the thing**: dot access and destructuring on a frozen
exported record, `expectedRoas`/`predicted_roas` as ordinary naming, mainstream
provider hosts, the `@ai-sdk/*` wrappers, and `env.AI.run(...)`.

No violating code exists in the tree today. The realized harm now is a guardrail
that certifies more than it checks — but Phase 5 builds the Google adapter
against a staged channel flag, and a dot-access read of `CHANNELS.google` would
ship clean into a channel whose `decisionAdversaryRules` and `fatigueModel` are
null.

---

#### R2-14 [A3] · Trace payloads are never redacted — the vault secret reaches the trace sink verbatim on the success path and the schema-fail path

**Observed** (§1.2): the emitted event carries
`"authorization":"Bearer canary-vault-value-do-not-leak-8891"` inside `output`.
The schema-fail path emits the same secret **alongside a correctly-redacted
`errorMessage` in the same event**. A secret in `req.input` is emitted
identically.

**Mechanism**: `grep -rn "redactText|redactError"` over `engine/` and `config/`
returns exactly four call sites — `gateway.ts:132, 143, 152` (all three *error*
paths) and the definition. `secrets = [key.value]` is built at `gateway.ts:107`
and is in scope at `:133/:144/:150`, yet `traceBase.input` (`:117`) and `output`
are handed to the sink raw. **The redaction boundary stops one field short of the
sink**, on the two fields that carry boundary-controlled data — the exact
untrusted surface the F7 fix was written for (`redact.ts:4-7`: "HTTP clients
routinely attach request context — including headers").

**Contradicts the code's own claim**: `tracing.ts:44-45` states *"callers pass
already-redacted detail, and the sink never sees secrets in the first place."*
Falsified above. And `invariants.test.ts:105` is titled *"LIVE — tokens exist only
in the vault; code, logs and traces are scanned (§10.2, §15)"* while its body
asserts only that the vault does not echo on a miss and that `scanContent` fires
on an `EAA…` literal — **nothing about trace contents**. `gateway.test.ts:135`
checks `JSON.stringify(sink.events)` only after failure paths where `output` is
null.

**Severity reasoning**: the exposed material is the AI-Gateway credential — the
§15 crown-jewel class, and the key guarding the only spend path (an attacker
holding it bypasses the local meter entirely). §10.2 calls a token appearing in
traces "a critical defect" outright. Ranked at ban-risk rather than isolation,
with money-loss exposure once this same code path carries Meta OAuth tokens in
Phase 3.

**Honest limits for the builder**: the success/schema-fail leak needs the response
body to contain the credential — a hostile-but-plausible transport (an echo/debug
route, a mirroring proxy, a provider error envelope). §10.2's standard is that
nothing in code prevents it. Note also that scrubbing `input`/`output` against
`secrets` closes the *echo* case but not the general "caller pastes a credential
into a prompt" case; that needs a shape-based scan on the payload — the one
`scan-lib` already has.

---

#### R2-15 [A7-isolation] · The test/fixture structural exemption matches any path containing a `/test/` segment, including production source directories

**Observed** (§1.2): content violating two structural rules yields 2 findings at
`engine/src/adapters/meta.ts` and **0 findings** at
`engine/src/test/live-provider.ts`, `engine/src/adapters/test/meta.ts`, and
`engine/evals/live/meta-adapter.ts`. With content violating **all five** rules at
once (`@anthropic-ai/sdk` import + `api.anthropic.com` + a raw model id +
`CHANNELS["google"]` + `predictedRoas`), `engine/evals/live/runner.ts` and
`engine/src/test/harness.ts` return 0 findings while `engine/src/gateway.ts`
returns 5. The exemption is a **blanket early-return over every structural rule**
(`scan-lib.mjs:76`) — Law 1, Law 6, Law 11, Law 18 and §2.4 together.

**Checks that could have refuted it, and did not**: it is segment-matched, not
substring — `src/testimonials/meta.ts` and `src/latest/meta.ts` still yield 2
findings, so the title is accurate rather than exaggerated. Secrets are genuinely
unaffected (`sk-ant-…` still flags in both). And absolute-checkout-path
contamination does **not** exist (`leak-check.mjs:26` passes
`relative(repoRoot, file)`), which would have been the severe version.

**The decisive test.** I tightened `TEST_OR_FIXTURE` from
`[/\/test\//, /\.test\.ts$/, /engine\/evals\//]` to `[/\.test\.ts$/]` and
re-walked the entire real repo: **clean, zero new findings.** The `/\/test\//`
and `engine\/evals\//` clauses currently protect **zero files**. Every file that
genuinely needs a banned string is already covered by `/\.test\.ts$/`
(`invariants.test.ts:90` holds `graph.facebook.com`; `switchboard.test.ts` holds
`CHANNELS["google"]`; `scan-lib.test.ts` holds all of them). `engine/test/helpers.ts`
and both `engine/evals/genome-tagger` fixtures contain no banned pattern. The two
broad clauses are pure exemption surface with no beneficiary.

**Against the code's own claim**: `scan-lib.mjs:57-59` says the exemption exists so
"tests and recorded fixtures" can contain the banned strings. It grants that to any
directory named `test` at any depth inside production source, and to
`engine/evals/` — which §11 Phase 0 says will hold the live eval harness, the single
most plausible place for real provider-SDK code bypassing the AI Gateway.

**Ranked at the low end of band 2** in fairness: no offending code exists today,
there is no external attacker in the threat model, and landing this requires a
builder to put production code under a `test` directory. The realistic threat is
builder error — which is precisely what this scanner exists to catch.

**Prior-report gap**: `ADVERSARY_REPORT_phase0.md:219` affirmatively states the
allowlist *"correctly exempts config/src/models.ts, engine/evals/, /test/"*. This
was blessed, never disclosed.

---

### S3 · DATA LIES — 11 findings

---

#### R2-16 [M4] · A `settle()` that fails after a successful transport call loses the charge, leaks the reservation, and escapes unredacted

`gateway.ts:138` (and `:131`) is the only unguarded statement after the transport
call. With a meter delegating everything to `MemorySpendMeter` except a throwing
`settle()`, and a normally-resolving transport returning valid output:
`transport invoked: 1` (the provider billed us), `llm()` rejected with a raw
`Error`, `committed $0.0000`, `reserved $0.0100`, **traces emitted: 0**. Over a
200-call loop: 99 billable provider calls, `committed $0.0000`, `reserved
$0.9900`, **0 traces**, all rejected. Healthy control: 99 calls, `$0.9900`
committed, 99 traces, 99 resolved.

Four confirmed harms: (a) **Law 11 violation** — this is the *only* exit from
`llm()` that emits nothing; the transport-error and schema-error paths both call
`traceFailure`. (b) **Data lie** — `todayUsd()` reports $0.0000 for $0.99 of real
provider spend. (c) **A false code comment** — `gateway.ts:14` asserts "Every
error leaving this function is redacted (F7)"; I watched a raw `Error`, message
and stack, leave untouched, and a planted canary came out intact in both. (d)
**Error masking at `:131`** — a throwing settle replaces the transport error, so
the root cause and its failure trace are both lost.

**Severity corrected down from the claimed 1 to 3, on a control run.** `reserve()`
computes `projected = committed + reserved + amount`, so a leaked reservation
occupies exactly the headroom a settled charge would have; lockout happens at
call #100 in **both** the defective and healthy runs. There is no cap breach, no
runaway spend and no wrong kill/promote. Cap enforcement stays conservative. The
"under-metered" claim is true only of the `todayUsd()` figure, i.e. a ledger
falsehood.

**Honest caveats.** No shipped meter throws from `settle` (notably
`MemorySpendMeter.settle` does *not* call `#assertAvailable()`, unlike
`todayUsd`/`reserve`/`record`). The defect is latent in `llm()`'s error handling,
reachable by any conforming-but-fallible meter — e.g. one applying this same
class's own availability-assert convention one method over. The `SpendMeter`
interface documents no no-throw contract for `settle`, and `llm()` distrusts the
meter everywhere else while trusting `settle` absolutely; that inconsistency is
the defect. The claimant's "shape of a DO `state.storage.put()` failure" framing is
loose — `settle` returns `void`, so a DO-backed settle cannot surface an async
storage rejection synchronously. The finding stands on the general
fallible-collaborator case. The unredacted-escape leg is structurally true but
weakly exploitable: the meter never receives `key.value`, so report it as a broken
redaction invariant and a false comment, not a demonstrated token leak.

**Hypothesis, NOT reproduced (no DO available)**: under the documented Durable
Object backing, leaked reservations live in memory while committed spend is the
durable half. If the DO is evicted after repeated settle failures, the leaked
reservations evaporate and the client gets a fresh cap despite already-burned
provider spend — an actual cap breach, which would justify severity 1. Not used
to set severity.

---

#### R2-17 [C5 + A2-honesty] · The three F4 regression tests are vacuous — they use a 6-character tree hash that can never bind **[corroborated ×2]**

`adversary-phase0.test.ts:126` declares `const TREE = "abc123"` — 6 chars, while
`readTreeBinding` (`gate-lib.mjs:70`) requires `[0-9a-f]{7,64}`. **Observed**
(§1.2): a clean, indisputably valid `Verdict: PASS` control returns
`ok:false, "report has no 'verified-tree:' binding"`. All three F4 fixtures return
the identical reason. **Every assertion in that block passes regardless of what
`parseVerdict` does.**

**Mutation test confirms vacuity**: replacing `parseVerdict`'s body with an
unconditional `return {token:"PASS"}` leaves all three `expect(res.ok).toBe(false)`
assertions **passing**. A parser that greenlights everything satisfies the tests
named for catching exactly that.

**And the defect they are named after is live.** Re-run with a real 40-hex hash,
the exact report from test line 134 — `  Verdict: PASS (this line is an example,
not the verdict)` above `Verdict: FAIL` — returns
`{"ok":true,"reason":"adversary report PASS and bound to the current tree"}`
(§1.2). The assertion at line 141 is **false against real input**.
`adversary-gate.mjs:65` calls this same function, so the CI gate carries it.

**Correction to one claimant's reasoning**: "these tests would pass against the
pre-fix code" is wrong. The pre-fix tree read (`39324eb`) was a bare
`split(":")[1]?.trim()` with no format constraint, so `"abc123"` *did* bind there
and all three assertions genuinely failed pre-fix. The letter of Phase B step 1
is therefore satisfied — **accidentally**, by the tightening of an unrelated
regex. Its intent is violated: post-fix they pass for a reason unrelated to what
they test.

**Also in this family**: `gates.test.ts:47`, titled *"re-runs: a FAIL bound to the
CURRENT tree still blocks, whatever else is in history"*, is mis-fixtured (see
R2-10) and certifies a property the code does not have.

---

#### R2-18 [C8] · The verified-tree freshness binding does not cover `.github/`, so the adversary's PASS asserts nothing about the CI definition it is judging

`git ls-files -s -- fullburn/ ':!fullburn/reports/' ':!fullburn/APPROVALS/'`
returns 52 index entries, **zero** containing `.github`. Cross-checking every
`CLASS2_FILES` entry against that set: 16 of 17 are inside the hash input;
exactly one is outside — `.github/workflows/fullburn-ci.yml`, the file that
defines whether the gates run at all.

**Observed**: with a PASS report bound to the tree, `sed -i '/^  adversary-gate:/,$d'`
on the workflow (deleting both gate jobs) leaves `adversary-gate` printing
*"adversary report PASS and bound to the current tree"*, exit 0. `assertCleanTree`
(`adversary-gate.mjs:24-39`) is pathspec-scoped to `fullburn/` too, so an
**unstaged** workflow edit is equally invisible.

**The substantive form, which the original claim missed.** Rebuilt as a legitimate
Class-2 PR: PASS report committed first, then the workflow gutting **plus a
matching approval entry**. `class2-gate` → "Class-2 changes carry approvals",
exit 0. `adversary-gate` → "PASS and bound to the current tree" + "reports
append-only holds", exit 0. Both gates green, zero gate jobs left in the workflow,
and the PASS being relied on was written before the workflow was touched and
**cannot go stale on it**. CLAUDE.md's build protocol and Law 9 require adversary
PASS *and* green CI as independent checks; for this one file the adversary half is
structurally absent.

**The dishonesty**: the gate emits *"bound to the current tree"* while a declared
Class-2 file — and a named Phase 0 deliverable, "CI pipeline" — sits outside that
binding. And `ADVERSARY_REPORT_phase0.md:353` asserts *"when the fixes land, the
tree hash changes and this report becomes stale by construction"*. Falsified: a
change landing only in the workflow leaves the hash unchanged.

**Fairly noted**: `class2-gate` **does** catch a direct workflow edit (verified,
exit 1), so this is not a rogue-merge bypass on its own. `grep -rn
"fullburn-ci|adversary-gate:|class2-gate:" engine/test/` returns nothing — no test
asserts the workflow still contains its gate jobs.

---

#### R2-19 [C9] · The dirty-tree guard explicitly exempts untracked files — precisely the category the index-based hash cannot see

Hash before planting an untracked `engine/src/shadow.ts`:
`13ecf1641404307ac276bd5a2a06fc0b63083c0f`. After: **identical**. Raw porcelain
shows `?? fullburn/engine/src/shadow.ts`, but the guard's filter
(`adversary-gate.mjs:33`, `!l.startsWith("??")`) returns `[]` → clean. Running the
**real binary** with the untracked file present fails on the *report* check, not
the clean-tree check — positive proof `assertCleanTree` passed. Control: a
tracked-unstaged edit correctly blocks with `" M fullburn/config/src/caps.ts"`.

**Impact demonstrated, not merely asserted.** All three gates walk the
**filesystem**, not the index — vitest globs, `tsc`, and `leak-check.mjs:14-21`
(`readdirSync`/`statSync`). So an untracked file is fully live to everything the
report attests to. Baseline `npm test` = 118. Adding **one** untracked file,
`fullburn/vitest.workspace.ts`, containing
`export default [{ test: { include: ["engine/test/vault.test.ts"] } }]`:
`npm test` → **1 file, 3 tests passed. Green.** The suite silently lost 115 tests,
including every caps-immutability, spend-meter, grade-registry and gate test — and
in that exact state the tree hash was unchanged, `assertCleanTree` reported clean,
and `leak-check` reported clean.

**Falsifies the code's own rationale.** `adversary-gate.mjs:18-23` says the guard
exists because the index-based hash "would leave the hash — and therefore a
report's freshness binding — looking valid while the code has already moved," and
`:31-32` asserts *"only an unstaged edit makes the hash lie about the code."*
False: an untracked file makes it lie in exactly the same way, for the category the
index cannot represent.

Ledger L5 discloses only that CI has never run on GitHub Actions — which is what
makes every gate run today **local**, where untracked files exist and are
importable. It does not disclose this exemption.

---

#### R2-20 [D1] · The Grade Registry does no domain validation on metric values: negative and non-finite drift grade A, and `+Infinity` satisfies every `>=` threshold

**Observed** (§1.2, my own probe with an all-A baseline **derived from
`GRADE_AREAS` itself** rather than hand-copied): `-Infinity` Stripe/warehouse
drift → **A**, `failing: []`, `enforcement() → []`; `reconciliation_drift_pct:
-9999` → **A**; `decisions_with_verdicts_pct: Infinity` → **A**;
`red_button_drill_seconds: -5` → **A**. Control (`drift = 5`) correctly →
`BELOW_A` with all three enforcement actions, so the harness is wired right.

`metricPasses` (`grade-registry.ts:26-35`) guards only `typeof actual ===
"number"`; `<`, `<=`, `>=` are unbounded signed comparisons. `NaN` is the only
garbage caught, and only because it fails every comparison by accident.

**Contradicts the file's own docstring** (`:14-16`): *"Missing data is BELOW_A,
never assumed-fine (fail closed)."* Present-but-impossible data is assumed fine —
the grade fails **open**, the opposite direction from the stated contract.

**And it breaks a standard this repo set for itself in the same commit**:
`caps.ts:41`, `spend-meter.ts:49`, `models.ts:144` and `gateway.ts:101` all reject
non-finite/out-of-domain readings before comparing. The prior report states the
rule in its own words at `:67-68`: *"Fail-closed requires rejecting any non-finite
or negative reading before the comparison."* The Grade Registry — the enforcement
point for Law 14 — is the one place that skipped it. `computeGrades` is a public
export with no upstream sanitizer; a ClickHouse/Stripe ratio over an empty
denominator reaching it is the ordinary nightly-reconciliation path.

**Two calibrations that keep the severity honest.** The title "does no domain
validation" is overbroad: the `==0`, `==true` and `==` ops use strict equality and
are immune (verified: `cross_tenant_events: -0` with `token_leaks: -5` correctly
grades BELOW_A). That is precisely why this is severity 3 and not 1 — every money-
and ban-critical metric (`cap_breaches`, `policy_strikes`, `cross_tenant_events`,
`token_leaks`, `guarantee_exposure_within_cap`, `family_diversity_holds`) uses
`==0`/`==true` and cannot be spoofed. What *can* be spoofed is the truth/quality
set: both drift metrics, CWV, indexation, organic clicks, queue latency, verdict
coverage, red-button drill seconds.

**Downstream consequence for the builder**: a spoofed A suppresses
`enforcement()` entirely, so "every area holding A" — the gate for Class-1
auto-ship (Law 13) and for onboarding the next client (Law 15) — is satisfiable by
an out-of-domain reading. That is how a severity-3 data lie becomes an autonomy
grant. Fix direction: reject non-finite values in `metricPasses` before any
ordered comparison and treat out-of-domain readings as BELOW_A rather than
throwing, so garbage fails closed into the enforcement path. Per-metric domain
bounds belong in `grade-thresholds.ts`, which is Class 2 — flag to the human
rather than editing.

---

#### R2-21 [D2] · Seven of eight §12 areas silently omit A-criteria the spec defines — 9 criteria have no threshold and can never drop an area below A

**Implemented keys, dumped from the real module** (§1.2) versus the §12 "A means"
column (ENGINE_BUILD.md:364-383):

| Area | Missing A-criteria |
|---|---|
| marketing-engine | "CAC beats client baseline within 90 days"; "blended ROAS ≥ target" |
| model-layer | "monthly failover drill passed" |
| adversary-layer | "injection drills passed" |
| data-truth | "incrementality-vs-last-click gap stated in every report" (Law 10's honest-reporting guard) |
| dummy-proof | "≥90% unassisted onboarding completion" |
| security-isolation | "bot filtration ≥ threshold"; "WP credentials scoped, never admin-wide" |
| business-health | "our own CAC & churn within targets" |
| wordpress-seo | — (the only complete row) |

**Executed**: feeding a snapshot where every *implemented* criterion passes and
every *omitted* one is catastrophic — `cac_vs_client_baseline_pct: 400`,
`blended_roas: 0.11`, `days_live: 365`, `monthly_failover_drill_passed: false`,
`injection_drills_passed: false`, `incrementality_gap_stated: false`,
`unassisted_onboarding_completion_pct: 3`, `bot_filtration_pct: 0`,
`wp_credentials_admin_wide: true`, `our_cac_within_target: false`,
`our_churn_within_target: false` — yields **all eight areas grade "A", failing
[], missing [], enforcement []**, and `publishGradeReport` emits `"grade":"A"`
for all eight. Unknown keys are simply not read; `computeGrades` iterates
`areaDef.metrics` only, so no amount of correct data about those criteria can
ever move a grade. The fail-closed `missing` logic fires only for keys that
already exist in `GRADE_AREAS`.

**This is F12's defect class one level down**, and the F12 regression tests cannot
see it: `grade-registry.test.ts:31-42` and `config/test/adversary-phase0.test.ts:58-68`
assert area **names** only (a sorted list of 8 strings, `toContain` ×2,
`toHaveLength(8)`). A half-implemented area is indistinguishable from a complete
one.

**Both obvious defences fail.** "Phase 0 is only a scaffold" — the builder itself
rejected that for F12, adding `wordpress-seo` and `business-health` with keys that
have no Phase 0 data source either. No principle distinguishes the implemented set
from the omitted set, and the code states none. "Already disclosed" — it is not:
`grep -rniE "roas|\bcac\b|failover|injection drill|onboarding|bot filtration|
incrementality|churn|admin-wide"` over `config engine reports HUMAN_TASKS.md
APPROVALS` returns only the unrelated `predictedRoas` scanner regex, H11 and H18.
Nothing in the ledger, the prior report, or a source comment.

**The governance consequence is the sharpest part.** `HUMAN_TASKS.md:24` tells the
human the change "adds the two §12 areas that were missing … so they can actually
drop below A", and **H9 asks the human to Class-2 sign off on these as "initial
Grade Registry A-thresholds (§12)"** — a 15-of-24 implementation described as *the*
§12 thresholds. That is the dishonesty. `ENGINE_BUILD.md` is itself a `CLASS2_FILES`
entry, so §12's bullets are a stable, human-change-only source a parser could
cross-check against.

---

#### R2-22 [D3 + A4-honesty] · `assertAttestation` verifies arithmetic, not provenance — a hand-written literal binds a model that scores 0.2 **[corroborated ×2]**

**Ground truth by execution first**: `runEval(…, "genome-tagger", "llama-70b",
GOLDEN, RecordedTransport(RECORDED_LLAMA_70B), …)` returns
`{"score":0.2,"total":5,"passed":1,"failures":["g1: field mismatch","g2: …","g4:
…","g5: …"]}` against an `evalThreshold` of **0.8**. The model genuinely fails
this role by 4×.

**Three constructions, none of which executes an eval, all of which bind**:

```
bindRole(ROLE_BINDINGS,"genome-tagger","llama-70b",{role:"genome-tagger",modelId:"llama-70b",score:1,total:5,passed:5})
bindRole(ROLE_BINDINGS,"genome-tagger","llama-70b",{role:"genome-tagger",modelId:"llama-70b",score:1,total:1,passed:1})
bindRole(ROLE_BINDINGS,"genome-tagger","llama-70b",Object.create({…same fields…}))
```

All return `{"hello-world":"claude-sonnet","genome-tagger":"llama-70b",…}`. The
threshold-1.0 role is equally forgeable. Adding `failures:["all of them"],
forged:true` is ignored and still binds — there is no nonce, no signature, no
branded symbol, no registry of completed runs. The prototype-only object has
`Object.keys() === []`; `assertAttestation` reads all five fields through the
prototype chain, breaking the discipline `eval-harness.ts:57-58` states
explicitly: *"no guard is defeated by a polluted prototype"* — a rule followed at
`caps.ts:55`, `markets.ts:45`, `channels.ts:35`, `models.ts:110-111`,
`gateway.ts:74-78`, `grade-registry.ts:43,50` and `eval-harness.ts:59`.

**Controls, so the finding is not overstated**: role mismatch, modelId mismatch,
non-closing arithmetic and `total = 0` are all correctly refused. The check is
real *internal-consistency validation*. It is not provenance.

**The dishonesty is explicit.** `config/src/models.ts:127-128`: *"Validates that
an attestation **could only have come from** a real harness run for exactly this
(role, model): the arithmetic must close."* False as executed. And
`config/test/adversary-phase0.test.ts:35-37` states F9's own success criterion —
*"so a fabricated pass is not constructible without executing the golden set"* —
which is not met. `config/test/models.test.ts:4-6` concedes half of it in passing
("Only the harness can produce one honestly — these tests hand-build it"); the
clause that is actually false is the next one, *"and adversary-phase0.test.ts
proves malformed ones are refused"*.

**Mutation coverage is worse than claimed.** Gutting `assertAttestation` entirely
kills only 4 tests (114 pass), all of which pass bare numbers and hit only the
`typeof att !== "object"` branch. Targeted mutants: `if (a.role !== role)` →
`false` → **118 pass**; `if (a.modelId !== modelId)` → `false` → **118 pass**;
`if (Math.abs(a.score - a.passed/a.total) > 1e-9)` → `false` → **118 pass**. All
three substantive provenance branches are entirely uncovered; only "is it an
object" is tested.

**In the builder's defence**: it implemented F9's literally prescribed fix ("take
the EvalResult and verify its role/modelId/total > 0"). This is a shortfall, not
an evasion. Fix shape: mint attestations only inside `runEval` — a module-private
`WeakSet` brand, not a compile-time-only branded type, since a cast defeats the
latter across the config/engine package boundary.

**No compensating control**: `models.ts` is not in `CLASS2_FILES` (R2-12), so a
rebind ships Class-1. `bindRole` has no production caller today, which is why this
is not severity 1 — exploitation requires a repo code change, not untrusted input.
It does not drop below 3 because the affected roles include
`creative-decision-adversary`, which §5.2 puts in the pre-write kill/promote path.

*Record correction*: the prior report's F9 text says llama-70b scores 0.4; against
the committed recordings it scores **0.2**.

---

#### R2-23 [D4] · `runEval` never reads `card.goldenSet`, so a caller-chosen set or a constant-output transport produces a **genuine** `EvalResult` of 1.0 for a model that scores 0.2

Two independent constructions, both using the real `runEval` and real `bindRole`:
(a) `rigged = [{id:"g1", input:{}, expected:{}}]` → `{"score":1,"total":1,
"passed":1,"failures":[]}` → **bound**; (b) 20 synthetic cases against a transport
returning one constant object → `{"score":1,"total":20,"passed":20}` → **bound**.

**These are not forgeries** — they are authentic harness outputs whose arithmetic
closes, so R2-22's provenance fix would not catch them.

**Two distinct causes.** (1) `goldenSet` is a function **argument**
(`eval-harness.ts:53`). `RoleCard.goldenSet` (`"evals/genome-tagger"`,
`models.ts:37-41`) is declared, typed, documented as the set a candidate must pass
— and read by nothing (`grep`: the declaration, three card literals, and the
parameter; there is not even an `evals/` directory at that path). Nothing ties the
set that ran to the set the card names, nor `total` to its size. (2)
`eval-harness.ts:74`, `Object.entries(gcase.expected).every(...)`, is vacuously
true on an empty map, so a case asserting nothing scores **PASS** rather than
being rejected as malformed. Line 60 guards a set of zero *cases* ("an eval over
nothing proves nothing") but not a case with zero *assertions* — the author's own
discipline applied to one and not the other.

**Cause 2 isolated so it cannot be dismissed as an artifact of the tiny set**:
taking the **real** GOLDEN set — same 5 ids, same inputs, same recordings,
`total = 5` identical to the declared set — and only emptying the `expected` maps
gives `{"score":1,"total":5,"passed":5}` → **bound**. So a hypothetical "total must
equal the declared golden-set size" check would not save it.

**False claims in the code**: `models.ts:114-118` calls the attestation "Evidence
that the eval harness actually executed **a role's golden set**"; `eval-harness.ts:6-7`
says scores are computed "by executing **the role's** golden set".

**Not deferred.** Ledger L2 covers placeholder *outputs*; L3 covers pushing
*results* to Langfuse. Neither discloses a caller-supplied golden set or a
zero-assertion pass. The most generous deferral reading (sets come from Langfuse
later) does not rescue cause 2 at all — it makes it worse, since a malformed case
fetched from an external store would silently score 1.0.

---

#### R2-24 [D5] · `RecordedTransport` resolves recorded outputs through the prototype chain — with `Object.prototype` polluted, a candidate with **zero** recordings scores 1.0 and binds

Identical `runEval` calls differing only in the prototype, both with
`new RecordedTransport({})` — an outputs table containing nothing:

- **Control (clean)**: `{"score":0,"total":5,"passed":0,"failures":["g1: Error: no
  recorded output for case \"g1\"", …×5]}`; `bindRole` refused.
- **Polluted** (`for (const g of GOLDEN) Object.prototype[g.id] = {...g.expected}`):
  `{"score":1,"total":5,"passed":5,"failures":[]}`; `bindRole` **succeeded**.

Root cause `eval-harness.ts:34`, `const out = this.#outputs[this.#currentCase]` —
a raw index, so the `out === undefined` guard on `:35` never fires. The polluted
value's own properties are exactly the expected fields, so both the field-match at
`:74` and `card.outputSchema` validation in `gateway.ts:44` pass.

**F17's sibling defect, 25 lines above the comment the builder added to close
F17** (`:57-59`: *"Own-property lookup (adversary finding F17) — keeps the
codebase-wide discipline: no guard is defeated by a polluted prototype"*). The fix
hardened the `ROLE_CARDS` lookup and left the one lookup that decides whether a
model passes its evals. Also falsifies the file header's *"Scores are COMPUTED
here, deterministically … never pre-computed scores"*.

**Reachability, stated honestly**: Phase 0 supplies no pollution primitive today.
It is filed because the codebase has adopted "no guard is defeated by a polluted
prototype" as a *stated invariant* and this breaks it at the eval gate, and
because the H6 regeneration path will feed this harness JSON from outside the repo
before Phase 1 ships.

---

#### R2-25 [A3-honesty] · The §10.2 checklist does not check itself: a bullet can be deleted, a phase falsified, and the deferral count drifted, all with 118 tests green

Three independent mutations of `engine/test/invariants/invariants.test.ts`, each
followed by the full gate set:

(a) Replace the `NOT_YET_APPLICABLE` entry `{invariant: "VERDICT.md hash-locked at
client-zero launch", …}` with `{invariant: "an invariant nobody ever wrote down",
…}` → **118 passed**, typecheck clean, scan clean, and `grep -c VERDICT
invariants.test.ts` → **0**. A real §10.2 bullet — also a CLAUDE.md standing
invariant and a §11 Phase 6 AC — vanished from the file whose job is to enumerate
all twelve, and nothing objected.

(b) `applicableFromPhase: 5 → 99` on the trust-ladder entry, leaving its reason
string reading "Phase 5 deliverable" → **118 passed**. §11 has no Phase 99.

(c) Append an 8th fabricated deferral and change only `toHaveLength(7)` → `8`,
leaving the file comment reading "7 carry explicit deferral markers" → **118
passed** with the comment now stating a false count.

**Control proving this is not a generic "tests are editable" complaint**: the
builder *did* build the guard, but only for the LIVE half. Renaming one entry from
`it("LIVE — no prediction-gate code paths exist (Law 6)"` to drop the `LIVE — `
prefix **FAILS** (`adversary-phase0.test.ts` F13, "the checklist's own arithmetic
matches the file"). The mechanism — regex the comment's claimed count, compare to
the actual entry count — exists, works, and was applied to `it("LIVE — ` and never
to `NOT_YET_APPLICABLE`. **The asymmetry is the finding.**

The test at `invariants.test.ts:48` is named *"checklist is complete: every §10.2
bullet is either asserted here or explicitly deferred"*. Its entire body is
`toHaveLength(7)`, `applicableFromPhase > 0`, `reason.length > 10` — it never
reads `ENGINE_BUILD.md`, never names a §10.2 bullet, never validates a phase
number. `grep -rn ENGINE_BUILD --include=*.ts --include=*.mjs` finds only
doc-comments plus the `CLASS2_FILES` list (which guards *edits to the spec*, not
the checklist's fidelity to it). **This is F13's failure mode one level up: the
entry that asserts nothing is now the completeness check itself.**

*Minor, corroborating only*: the comment's arithmetic ("7 live + 7 deferred …
exceed 12 because three bullets split") over-attributes by one — the third split's
live half is the `PARTIAL` entry, counted in neither (verified: 7 `it("LIVE — `,
1 `it("PARTIAL`). The F13 lock regexes only "N are live below" and cannot catch it.

---

#### R2-26 [A5-honesty] · F11's actual fix — the builder/adversary pairing check — is removable with 118 tests green; its lock test passes for a different reason

Two independent mutations of `config/src/models.ts`, each → **118 passed**: (a)
`if (builders.length > 0 && adversaries.length === 0)` at `:190` → `if (false)`;
(b) delete the completeness loop at `:169-174`. Deleting the whole pairing block
(comment + loop + throw, `:186-194`) → **118 passed, typecheck clean, leak-check
clean** — F11's actual fix deleted outright with every gate green.

**Why**: the F11 lock (`config/test/adversary-phase0.test.ts:43-49`) uses
`builderOnly = {"genome-tagger":"claude-sonnet"}`, which is missing `hello-world`
and `creative-decision-adversary`, so it trips the **completeness** check and
never reaches the pairing check F11 was about. Confirmed by control: that fixture
returns `BindingError: role "hello-world" is declared but unbound`, not the
pairing message. Each guard masks the other; neither is independently locked. The
pre-fix version (`39324eb`) had **neither** guard, so the test does genuinely fail
pre-fix and pass after — satisfying the letter of Phase B while discriminating
nothing.

**The runtime behaviour is correct** — with a complete single-role card set (one
builder-side card, domain `seo`, no adversary), `validateBindings` correctly
throws `BindingError: domain "seo" binds a builder with no adversary — family
diversity would be vacuous (Law 13, §2.4)`. This is a coverage defect, not a
behaviour defect, and there is no money or ban exposure today. It is filed because
`ADVERSARY_REPORT_phase0.md:325` books this file as locking "F11 (×2)". It does
not.

Fix scoping: `validateBindings` already takes a `cards` argument — pass a
purpose-built single-card set so the pairing check is reached, and assert on
`/no adversary/` rather than on `BindingError` alone. Asserting the *message*
rather than the class is what stops a future pass-for-the-wrong-reason.

---

### S4 · ISOLATION — 4 findings

---

#### R2-27 [A4-isolation] · `redactError` is bypassable by a thrown value with a throwing `message` getter or `toString` — the raw error and full stack escape, and no failure trace is emitted

Through the real `llm()` with a transport throwing an object whose `message`
accessor (E1) or `toString` (E2) itself throws
`new Error("req headers: Bearer <canary>")`:

```
E1  thrown ctor: Error (NOT GatewayError) · leaked canary: true · trace events: []
    "Error: req headers: Bearer canary-vault-value-do-not-leak-8891
       at Error.get (…) → at redactError (redact.ts:22:58) → at llm (gateway.ts:132:18)"
E2  same, via "at Object.toString → at String(<anonymous>) → at redactError (redact.ts:22:70)"
CONTROL (Symbol.toPrimitive returning the secret)
    thrown ctor: GatewayError · leaked canary: false · text "Error: Bearer [redacted]" · trace: ["error"]
```

`redact.ts:22` is `const raw = err instanceof Error ? \`${err.name}: ${err.message}\`
: String(err);` with no try/catch — both branches invoke attacker-supplied code on
a value the file's own header treats as untrusted. When that read throws,
`redactError` throws out of `llm()`'s catch, so the safe error is never constructed
**and `gateway.ts:133`'s `traceFailure` never runs**. The call leaks the secret
*and* is untraced.

Falsifies two unconditional claims: `redact.ts:19-20` ("Returns an Error whose
message and stack cannot contain any known secret" — it returns nothing at all)
and `gateway.ts:14` ("Every error leaving this function is redacted (F7)").

**Not money loss**: `meter.settle(reservation)` at `:131` executes *before*
`redactError` at `:132`, so spend accounting is unaffected.

**Realism, stated honestly**: this needs a transport throwing an object with a
hostile or lazily-materialising accessor (Proxy-wrapped clients, or errors that
lazily parse a response body inside a getter). Low probability, and Phase 0 ships
no real transport. But this is the last line of defence for the crown-jewel
secret, its stated contract is unconditional, and the fix is a two-line try/catch
fallback. A security boundary that executes untrusted code unguarded is a defect
regardless of how exotic the trigger is.

---

#### R2-28 [A5-isolation] · 13 of 16 failure paths emit no trace, including both cross-tenant refusals and the cap-breach refusal

Eighteen outcomes of `llm()`, each with a fresh `makeDeps()`. **Traced: 3**
(success, transport-throws, schema-mismatch). **Untraced: 15** — unknown role; no
binding; model not in registry; no/duck-typed `TraceContext`; **cross-client trace
context (Law 3)**; **cross-client vault handle (Law 3)**; unsigned caps; meter
unavailable; non-reserving meter; invalid reservation; **CAP BREACH refused**
(`$0.0600 > $0.05`); vault missing key; malformed `gatewayBaseUrl`; and sink
outage on success.

`gateway.ts` emits to `deps.sink` in exactly two failure places (`:133`, `:144`),
both **after** `transport.post` is attempted. Every guardrail refusal before that
emits nothing, and at each of those points `deps.sink` is already in hand. Three
of them are genuine engine **decisions**, not malformed-input typos: the
cap-breach refusal, and both cross-client scope refusals. `grep` over `engine/src`
and `config/src` finds no alternative emitter — no audit log, no decisions ledger,
no counter. A client repeatedly hitting its AI cap, or a caller presenting another
tenant's vault handle, leaves **zero artifact anywhere**.

**Spec** Law 11 (ENGINE_BUILD.md:38): *"Every agent decision is traced in
Langfuse. Untraced decisions are treated as bugs."*

**Two corrections to the original claim, both against it.** (1) "F8 is only half
closed" overstates: F8's text was "a failed LLM call emits no trace", and paths
02–14 above are not LLM calls at all — nothing left the building. The builder's
comment (`tracing.ts:4-6`) is honestly scoped and the regression test is titled to
that scope. **F8 as written was closed**; this is a new, narrower gap. (2) The §12
argument is materially wrong: `grade-registry.ts:37-58` puts any absent metric into
`missing` and forces BELOW_A, so `cross_tenant_events` / `cap_breaches` cannot
silently read a false "A" from an unfed pipeline. Phase 0's AC is explicitly "a
grade from **seeded** data", and no metric collector exists for any area yet. **The
finding stands on Law 11 alone.**

Filed at isolation because both Law 3 refusals *work* — the harm is that an
isolation or cap attack is undetectable, and isolation is the closest slot in the
mandated ladder.

---

#### R2-29 [A6] · The leak scan walks only `fullburn/` — `.github/workflows` and the sibling client trees are never scanned — and skips 12 evidence/dump extensions inside `fullburn`

**Scope** (§1.2 plus a synthetic-root probe): planting the same `sk-ant-…` token in
`fullburn/`, `pulsern/`, `haven/` and `.github/workflows/` and calling `scanTree`
returns **exactly 1 finding** — `fullburn/engine/src/a.ts`. `leak-check.mjs:25`
hardcodes `walk(join(repoRoot, "fullburn"))` while CI passes the repo root (`..`),
and `CLASS2_FILES` itself lists `.github/workflows/fullburn-ci.yml` as
repo-root-relative and Class-2 governed. **The workflow that legitimately handles
secrets is the one file the token scanner structurally cannot see.**

**Extensions inside `fullburn/`**: WALKED = `.yaml`, `.txt`, `.env.production`.
SKIPPED (12) = `crawl.har`, `key.pem`, `seed.sql`, `export.csv`, `run.log`,
`dump.jsonl`, `notes.text`, `creds.ini`, `script.sh`, `app.py`, `page.html`,
`backup.bak`. Additional check of my own: a `.pem` holding
`-----BEGIN RSA PRIVATE KEY-----` yields `[]` — `SECRET_PATTERNS` has a
private-key-block rule that **can never fire on the file extension that format
actually uses**. `.har`/`.log` are the shapes Phase 1's "crawl session recording
stored as evidence" will land in.

**`pulsern` is client zero**, verified in-repo: `caps.ts:28` binds it to a live
$70/day, $2,000 cap and `ENGINE_BUILD.md:407` names it client zero. Its app, ops
scripts and its own workflows sit in this repo, entirely unscanned. The CI trigger
compounds it: `on.pull_request.paths` is limited to `fullburn/**` plus the
workflow file, so a token committed to `pulsern/` does not even start the job.

**Correction that cuts against the builder, not for it**: this is **not new**.
Prior finding F16 (`ADVERSARY_REPORT_phase0.md:225-226`) already stated *"It also
only walks `fullburn/` and only .ts/.tsx/.mjs/.js/.json/.md/.toml/.yaml"*. Commit
`df95668` is titled "fix all adversary FAIL findings (F1-F19)". The builder fixed
F16's token-type half (all the new patterns are tagged "adversary finding F16" in
`scan-lib.mjs`) and added `.txt`/`.env` — then left the `fullburn`-only walk and
the 12 extensions untouched while asserting F16 closed. **A partially-fixed
finding reported as fully fixed is itself a reporting defect against the fix
commit.**

Not escalated to ban-risk: I grepped the whole repo for all nine secret shapes and
nothing outside `fullburn/` matches today. This raises the probability of a sev-2
event without being one. Fix shape: walk the repo root with `SKIP_DIRS`, or take an
explicit scope list including `.github/`; and invert `SCANNED` to a binary/skip
denylist so unknown extensions fail **closed**.

---

#### R2-30 [A8-isolation] · The NUL delimiter moves the vault-key collision rather than removing it: a NUL-bearing `clientId` reads another tenant's secret

*Note on reading the source*: `Read` renders the delimiter at `vault.ts:53` as a
space. `sed -n '52,54p' engine/src/vault.ts | od -c` shows the bytes
`c l i e n t I d } \0 $ { n a m e }` — a **literal NUL byte**. The rendering hides
it; the claim is byte-accurate.

**Repro** (standalone, importing `engine/src/vault.ts`):

```
backend.set("a", "b\0meta-oauth", "SECRET-OF-A");
vaultForClient(backend, "a\0b").get("meta-oauth")
  → {"value":"SECRET-OF-A","version":1}
```

Reverse direction also works. **A `ClientVault` handle bound to tenant `a\0b`
returned a secret stored for tenant `a`.** Constructor validation, executed:
`vaultForClient` accepted `"a\0b"`, `"   "`, `"\0"`, `"../../etc"`, and a
100,000-char id. `vault.ts:25` checks only `!clientId` — no charset, trim or
length validation. No test covers a non-trivial `clientId`
(`engine/test/vault.test.ts` uses `"a"`/`"b"`/`""`; `invariants.test.ts:65-71`
uses `"client-a"`/`"client-b"`).

**`ENGINE_BUILD.md:283` is a Phase 0 acceptance criterion in plain words**:
*"Per-client isolation: a seeded cross-tenant read attempt must fail (Law 3)."* My
seeded cross-tenant read attempt **succeeded**. `vault.ts:1-6` claims *"a
cross-client read is a different object, not a different argument"* — here it IS a
different object and the read still crosses. And `invariants.test.ts:65`, the LIVE
Law 3 proof, passes only because it never uses a `clientId` containing the
delimiter: **the Law 3 proof is unsound, not merely incomplete.**

**Collateral assertions independently re-checked and both CORRECT** (not taken on
trust): the space-style collision genuinely does **not** exist
(`set("acme corp","meta-oauth")` then `vaultForClient(b,"acme").get("corp
meta-oauth")` throws `VaultError`, both directions) — the previous report's
refutation stands. And `MemorySpendMeter` is keyed by plain `clientId` with no
composition (`spend-meter.ts:55-57`), and caps lookup is `Object.hasOwn` on the
exact string, so **no money path is affected** — an `"a\0b"` client gets no caps
and may spend nothing. Severity does **not** escalate to 1.

**Reachability, stated honestly**: the only callers of `vaultForClient` are tests
plus `gateway.ts:24` (which takes a vault it does not construct), and `clientId`s
today are keys of the human-committed `CAPS_TABLE`. The defect is unreachable in
Phase 0's live surface and becomes reachable when a `clientId` is derived from
onboarding input (Phase 2/7). That bounds urgency; it does not make the finding
unreal, because the Phase 0 AC and the LIVE invariant are making a structural
claim that is false right now.

§15 defers encryption/auto-rotation/breach-runbook to H7; it defers nothing about
tenant key separation. L10 discloses that the vault is unencrypted and manually
rotated — and the one property it *does* claim, least-scope, is the property this
breaks.

**Unverified hypothesis, flagged for a separate look**: the NUL byte makes
`vault.ts` a *binary* file to ripgrep (every grep in this session reported "binary
file matches" with no lines for it). If the leak scanner uses a line-oriented text
path, the one file guaranteed to handle secrets may be silently skipped by the CI
leak gate. `leak-check` reports "clean", which is consistent with both "no leak"
and "file skipped". I did not isolate which.

---

### S5 · DUMMY-PROOF — 4 findings

---

#### R2-31 [C10] · Deleting a Class-2 file crashes `class2-gate` with an uncaught ENOENT, and no approval can ever authorize a deletion

`git rm fullburn/config/src/grade-thresholds.ts`, commit, run the gate:

```
Error: ENOENT: no such file or directory, open 'fullburn/config/src/grade-thresholds.ts'
    at hashOf (class2-gate.mjs:37:46)
    at checkClass2Approvals (gate-lib.mjs:158:22)
EXIT=1
```

Node stack trace, no `CLASS-2 GATE FAIL` verdict line. **The second half is an
ordering problem, not just a hashing one**: adding an `APPROVALS/` entry for the
deletion *in the same diff* — the exact shape `gate-lib.mjs:139-149` documents —
produces the identical crash, because `:158` calls `hashOf(f.path)` at the top of
the per-file loop, before `:159`'s approval match. **No string a human could write
can reach the matching code**; there is no representable approval for a Class-2
deletion, and the only escape is editing the gate — itself Class-2.

`class2-gate.mjs:24` computes `"deleted"` and nothing ever reads it — a dead branch
is evidence the case was intended to be handled, not deliberately excluded.
`adversary-gate.mjs:79` does the same mapping but feeds `checkReportsAppendOnly`,
which reads no files, so `class2-gate` is the only crash site.

Zero test coverage, and the suite cannot catch it by construction: every class2
case in `gates.test.ts:107-146` uses `status: "modified"` with `hashOf` stubbed to
`() => "deadbeef"` (`:87`), which never touches the filesystem.

**Correctly rank 5**: it fails **closed**. Exit 1 fails the CI step, so a Class-2
deletion is blocked, not admitted. No money path, no bypass, no data lie. What is
broken is that the operator sees a Node stack trace instead of the gate's verdict,
and a legitimate human-approved removal is structurally inexpressible.

---

#### R2-32 [C11] · Approval path/hash pairs are not actually paired — in a multi-file entry, any approved path validates against any approved hash

Changing `caps.ts` (`dailyAdSpendUsd 70 → 4242`) and `grade-thresholds.ts`, then
writing **one** approval doc with the two pairs deliberately **swapped** (caps'
path followed by grade-thresholds' hash, and vice versa) → gate prints
**"class2 gate: Class-2 changes carry approvals", exit 0**. A correct pairing
implementation rejects that document.

**Controls bounding the defect precisely**: (A) caps changed, approval doc
containing only grade-thresholds' path+hash → correctly FAILs, exit 1 — so the gate
does require a hash to be physically present; this is not a total bypass. (B) the
same swapped pairs split across **two** approval files → correctly FAILs. The
cross-product is scoped within a single document.

Root cause in `checkClass2Approvals`:

```
return lines.includes(`approves: ${f.path}`) && lines.includes(`content-hash: ${wantHash}`);
```

Two independent membership tests over the whole document. An N-file entry is an
N×N cross-product, not N pairs. `APPROVALS/README.md` documents the feature being
violated — *"Multiple `approves:`/`content-hash:` **pairs** may appear in one
entry"* — and states the premise this breaks: the hash "pins the approval to the
exact new content … so an approval can never be reused for a different change."
`gates.test.ts` has three single-pair cases (`:114`, `:123`, `:133`) and **zero**
multi-pair cases: the documented multi-file form is entirely untested.

**Not escalated, and here is why I tried and failed**: every hash the gate accepts
must already appear in the human's own document, so an attacker cannot invent one.
Smuggling an unapproved cap would require `sha256(caps.ts)` to equal a hash the
human approved for a *different* Class-2 file in the same entry — i.e. `caps.ts`
byte-identical to a workflow YAML or `CLAUDE.md`, which is neither valid TypeScript
nor survivable through typecheck. The real harm is the dummy-proof one, and it is
exactly the premise of the content-hash design: when the human writes a multi-file
entry and **transposes two hashes** — an ordinary clerical slip in a hand-written
document — the gate silently passes instead of catching it. This becomes materially
more load-bearing once H19 makes the hand-written entry the authority.

*Ledger note*: L11 discloses that an approval proves *what* was approved and never
*who*, explicitly claiming the "what" half holds. This is a defect in the "what"
half, so L11 does not cover it — if anything L11 is slightly overstated.

---

#### R2-33 [A7-honesty] · Three pieces of hardening this commit advertises have zero test coverage

Three independent mutations, each → **118 passed, typecheck clean, scan clean**:

(a) `adversary-gate.mjs:34`, `if (dirty.length > 0)` → `if (false)`. The guard is
behaviorally load-bearing — with the original restored, an unstaged edit produces
`ADVERSARY GATE FAIL: working tree has unstaged changes under fullburn/` — and no
test would notice if it stopped working. No `.ts`/`.mjs`/`.yml` file imports
`adversary-gate.mjs`; the only references are `CLASS2_FILES` path-string membership
assertions that execute nothing. CI runs the gate only after `actions/checkout@v4`,
i.e. always on a clean tree, so it can never fire there either. The commit message
specifically advertises this guard.

(b) `leak-check.mjs:12`, `SCANNED` narrowed from
`/\.(?:ts|tsx|mjs|js|json|md|toml|ya?ml|txt|env)$/` to `/\.(?:ts|tsx|mjs|js)$/`.
Load-bearing proof: a planted `sk-ant-` token in a `.md` file → mutated scanner
"clean, exit 0"; original scanner `LEAK/STRUCTURAL SCAN FAIL … possible anthropic
key`, exit 1. So `scan-lib.mjs`'s header claim — *"SECRET rules run against every
scanned file, including docs. A token in a report or a fixture is still a token"* —
is true today and enforced solely by an untested regex. CI runs the walk, but a
narrowed walk still exits 0 on a clean repo; **no canary token is ever planted, so
the walk's reach is unverified even though the walk runs.**

(c) `eval-harness.ts:59`, the F17 `ownEntry` guard. Two variants, both green:
deleting the line outright (typecheck did not even flag the now-unused imports),
and — the sharpest result here — **restoring the literal pre-F17 code**
`if ((ROLE_CARDS as Record<string, unknown>)[role] === undefined)`. The exact code
the previous adversary filed as F17 passes the suite unchanged, so **CI cannot
distinguish fixed from unfixed**. That directly violates Phase B step 1 ("must fail
against the pre-fix code and pass after") and §10.1 step 4. Prototype-pollution
coverage does exist elsewhere (`switchboard.test.ts:26`,
`adversary-phase0.test.ts:175` for F6), which makes `eval-harness` the one guard
left unlocked.

**Severity corrected from the claimed 3 down to 5.** All three pieces of hardening
genuinely **work** — I verified each. No false number is produced, so this is not a
data lie; the commit message is accurate about behaviour and overstates only the
phrase "re-arm the gates" as applied to guards the gates cannot see. It is a
build-protocol/Phase-B LOCK gap, and rung 5 is the honest floor. Two caveats raise
its practical priority above its rung: (b) guards a §15 crown-jewel asset and
should be locked first; and per §10.1 writing these locking tests is **the
adversary's** Phase B duty as much as the builder's — it is outstanding on both
sides, and it blocks the gate either way.

---

#### R2-34 [A8-honesty] · A test named for "staged" behaviour asserts a **locked** entry: the market half of `requireActiveMarket`'s staged refusal is untested and silently relaxable

Mutating `config/src/markets.ts:47` from `if (m.status !== "on")` to
`if (m.status === "locked")` → **118 passed, typecheck clean**. The symmetric
mutation on `channels.ts:38` → **3 failed / 115 passed**
(`switchboard.test.ts:37`, `:23`, `invariants.test.ts:102`). Channel half pinned by
three assertions; market half by **zero**.

Semantic probe proving the branch is live code, not dead code: adding
`ZZ: {status:"staged", …}` to `MARKETS` — unmutated tree throws *"market \"ZZ\" is
staged — activation requires its bundle to pass adversary on live data (Law 18)"*;
mutated tree **returns `status=staged` as live**.

`switchboard.test.ts:36` is named *"staged (built, not live) refuses exactly like
locked"* but its market assertion is `requireActiveMarket("EU")`, and EU's status
is **`locked`** (`markets.ts:32`). No market in the registry is staged, so the
accessor's staged branch is unreachable by the suite. Same over-naming at
`invariants.test.ts:99`. `markets.ts:42` claims "Staged and locked both refuse" —
true of the code, unpinned by any test. And
`ADVERSARY_REPORT_phase0.md:249` asserts *"Staged / locked flag activation …
CONFIRMED-COVERED"*, which mutation testing shows is half-true.

`requireActiveMarket` is the sole market gate (`grep`), and no consumer
independently enforces `jurisdictionPack !== null`. Correctly severity 5: no market
is staged today and the shipped code refuses staged markets, so there is no live
money or ban exposure — but the latent escalation is real, since a staged market
shipping later with `jurisdictionPack: null` against a drifted guard is advertising
into a market with no jurisdiction pack.

---

## 4. Refuted claims — do not re-spend effort here

Six claims were attacked and did **not** survive. Recorded so the next adversary
skips them.

| ID | Claim | Why it fails |
|---|---|---|
| **M5** | `MemorySpendMeter.record()` is an uncapped spend write | Mechanism **inverts**. `record()` writes to `committed`, which is the *numerator* of the cap check (`spend-meter.ts:95`), so it monotonically **consumes** headroom — it can only ever close the gate. Verified: `record($1,000,000)` then `reserve($1,…)` throws `projected $1000001.0000 > daily cap $25`. Negative amounts are refused by `assertUsableAmount`. The "desynchronises committed from the reserve/settle ledger" evidence is **false as written** — reservations are keyed by id in a separate map; `reserve→record→settle` gives committed 5/reserved 10 then 15/0, exactly correct. `requireReservingMeter` refuses any meter lacking reserve/settle, and `record()` was called **zero** times through `llm()`. `grep` shows **no callers anywhere**, including tests. Residual worth passing to the builder as a note, not a finding: delete the dead method, or the interface invites the misuse described. |
| **M6** | Reservation ids are meter-local counters, so a reservation can settle the wrong record | Self-labelled a hypothesis; all three supporting legs fail. `settle()` never reads the caller's `clientId` or `amountUsd` — it resolves `reservation.id` against its own `#open` map, so a forged `{id: alice's r1, clientId:"bob", amountUsd:999}` charged **alice $0.10** and bob nothing. `#seq` is strictly monotonic and never reuses an id even after a slot frees (`r1,r2,r3` across settle/release/reserve), so a shared meter cannot collide. The DO-eviction leg cannot occur: `#committed`, `#reservedTotal` and `#open` live in one instance, `grep` finds zero serialization of `SpendReservation`, and eviction destroys reservations and meter together. The prescribed fix ("reject unknown ids loudly") would **break** the documented idempotency `llm()` relies on. |
| **D7** | `bindRole`'s optional `cards` argument lets a `side:"neutral"` card defeat family diversity | Mechanics reproduce; the **cause is misattributed** and the parameter grants no capability an attacker lacks. The identical violating bindings object is producible with one object spread and no `bindRole` at all — and `llm()` honours it identically, because `gateway.ts:76` reads `deps.bindings` and never calls `validateBindings`. The scanner does not save it either: the shortest control route (`{...ROLE_BINDINGS, "genome-tagger": ROLE_BINDINGS["creative-decision-adversary"]}`) is **scan-clean**. Delete the parameter and nothing changes. The load-bearing gate is untouched: `models.ts:235` runs `validateBindings(ROLE_BINDINGS)` at import against the real cards, and `gateway.ts` imports `models.ts`, so it is transitively unavoidable. **Genuine observation extracted, filed separately in §7**: `llm()` never validates `deps.bindings`. |
| **A9** | `llm()` brand-checks the `TraceContext` but not the `ClientVault` | **Correct behaviour, misread.** `ClientVault` declares `#backend`/`#clientId` private fields, giving it **nominal** typing — no object literal is assignable. Compile probe: the fake vault without a cast is `TS2739: missing #backend, #clientId`; the fake `TraceContext` (only public readonly fields) compiles **clean**. The asymmetry is exactly right: the runtime brand check exists where the type system cannot enforce nominality and is omitted where it already does. The repro had to write `as never` to defeat the very mechanism it then reported as missing. `npm run typecheck` is a named CI gate and enforces it for every in-repo call site. No test claims a vault brand check, so nothing is passing vacuously. |
| **A6-grade** | The Grade Registry can publish an "A" against thresholds no human has approved | The spec **mandates** the behaviour: `ENGINE_BUILD.md:308` makes "the Grade Registry computes and publishes a grade from seeded data" a Phase 0 AC, so a sign-off refusal modeled on `assertCapsUsable` would make a required AC unsatisfiable. The caps analogy is not symmetric — Phase 0's cap AC is only that constants exist and mutation fails. §12's own header reads "initial thresholds, **tuned in Phase 0**, human-owned thereafter". It **is** disclosed, three times, including at `grade-thresholds.ts:3-5` ("Initial values pending H9 sign-off") and `ADVERSARY_REPORT_phase0.md:295`. And the substantive Law 14 protection is live — I relaxed a threshold and `class2-gate` correctly refused, exit 1. No consumer exists (`index.ts` serves a 404), so nothing carries the grade to a human. |
| **A2-honesty (partial)** | *"The F4 lock tests would pass against the pre-fix code"* | Wrong as stated: the pre-fix tree read had no hex-format constraint, so `"abc123"` **did** bind and all three assertions genuinely failed pre-fix. The *finding* survives on different reasoning and is filed as **R2-17**; only this sub-claim is refuted. |

---

## 5. Confirmed genuinely fixed from F1–F19

Each re-attacked, not accepted. This is the honest good news.

| # | Status | Evidence from re-attack |
|---|---|---|
| **F1** concurrent cap breach | **CLOSED** | `reserve()` completes read+validate+cap-check+write with no `await`, and `llm()` calls it before any I/O. 40–60 parallel `llm()` calls at a $0.05 cap across **9 interleavings** (uniform yields; per-call varying `(i*3)%11`, `(i*5)%9`, `(i*7)%13`; mixed sizes $0.01/$0.02/$0.05; a transport throwing every even call; throws mixed with schema-invalid; big-reservation-first), with an instrumented meter sampling `committed+reserved` after **every** meter operation. `maxTotal = 0.050000` in all nine, never once above cap, repeated 3× identically. The pre-fix symptom (20/20 permitted, meter at 4× cap) does not reproduce. |
| **F2** non-finite reading fails open | **CLOSED**, on both sides | `assertUsableAmount` rejects NaN/undefined/null/Infinity/negative/string before any `>` runs — for the amount, the cap, committed, reserved **and** the projected sum. Re-attacked from the caps side too: `"1000000"` (string), NaN, Infinity, −1 and 0 each refused with `CapError`. |
| **F3** billable call never metered | **CLOSED** for the shipped code | Settlement is tied to "the request left the building" on both the success path (`:138`) and the transport-throw path (`:131`). Billing-truth matrix — 12 parallel calls × 5 transport behaviours (all resolve; all throw ECONNRESET; all schema-invalid; alternating; resolve after yields) — `transport-reached × $0.05` **exactly** equalled committed in every case. Never under- or over-charged. *(The lock test covering only one of the two paths is R2-07.)* |
| **F4** report gate opens on a FAIL | **CLOSED at the code level, incompletely** | Fenced PASS above a real FAIL, `>`-quoted PASS, `PASS-PENDING-FIXES`, `PASSABLE`, CRLF and a leading BOM are all handled correctly, and reverting either the exact-token check or the fence/quote skip is caught by `gates.test.ts`. *(Indented blocks, HTML comments and mismatched fences remain open — R2-09; the lock tests are vacuous — R2-17.)* |
| **F5** `CLASS2_FILES` omissions | **CLOSED for what F5 named** | All six named paths present and locked by `gates.test.ts:90-105`. Verified end to end: `class2-gate . 39324eb` fails naming exactly the ten Class-2 files this commit touched, matching `HUMAN_TASKS.md`'s declared list of owed approvals. *(The set is still incomplete on paths F5 did not name — R2-11, R2-12.)* |
| **F6** grades resolve through the prototype | **CLOSED** | Re-attacked **four** ways, not one: `Object.prototype['data-truth']` with `computeGrades({})`; `Object.prototype['stripe_warehouse_drift_pct']` with a present-but-empty area; a `JSON.parse('{"__proto__":{…}}')` snapshot carrying `__proto__` as an **own** key; and an array snapshot. All eight areas returned BELOW_A every time. The `Object.hasOwn` guards at `:43`/`:50` hold. |
| **F7** vault secret escapes via transport error | **CLOSED AND COMPLETE for the error path** | Nine hostile shapes all came out redacted: JSON-stringified headers in the message; a raw `Bearer` in the message; `err.cause` holding an Error with the headers; a custom `requestHeaders` property; a thrown string; a thrown plain object; a secret-bearing `toString`; an `AggregateError` whose `.errors` carry the headers; and a secret smuggled into `err.name`. The original stack is dropped and `err.cause` is not carried. A sink whose `emit()` throws with a secret produces name-only interpolation with no secret. *(The trace **payload** was never in scope of F7 — R2-14; the throwing-accessor bypass — R2-27.)* |
| **F8** failed calls emit no trace | **CLOSED as written** | Transport-throw and schema-mismatch now emit an error trace with a redacted `errorMessage`, and the charge is settled **before** the trace, so a sink outage cannot lose it. `traceFailure` correctly swallows sink errors so the root cause is not masked, while a sink outage on a **successful** call still fails the call (`TraceEmitError`) — fail-closed both ways. *(The residual refusal paths are a new, narrower gap — R2-28.)* |
| **F9** hand-written eval score | **Bare-number half CLOSED** | `bindRole` now refuses a bare number, `42`, `-1`, NaN, wrong role, wrong modelId, `total = 0`, and non-closing arithmetic. *(The provenance half is not closed — R2-22.)* |
| **F10** ledger omits unmet deliverables | **CLOSED for what F10 named** | L9 (ClickHouse + Airbyte), L10 (vault not encrypted/auto-rotated) and L11 (repo protection) are present and accurate. I re-verified every entry L1–L11 against the code: L2's placeholder disclosure matches `recorded-outputs.ts`'s own header; L7 matches `vitest.config.ts` environment `node`; L10 matches `MemoryVaultBackend` (in-memory `Map`, plaintext, manual `rotate()`); L11 matches the absence of any CODEOWNERS file. |
| **F11** family diversity vacuous | **Behaviour CLOSED** | Against the real card table: `validateBindings({"genome-tagger":"claude-sonnet"})` throws "unbound"; every declared card carries a launch binding; rebinding to `claude-sonnet` throws "family-diversity violation in domain \"creative\"". The **new** pairing check was itself attacked: renaming the builder's domain is refused; deleting the adversary card from an injected table is refused; a domain with two builders and two adversaries is cross-checked pairwise. *(Coverage — R2-26.)* |
| **F12** two §12 areas missing | **CLOSED at the area level** | `GRADE_AREAS` enumerates all eight §12 rows; renaming `business-health` is caught; `grade-registry.test.ts:67-75` proves `guarantee_exposure_within_cap: false` drops the area below A, so the §14/Law-17 sales auto-pause is now graded. *(Metric-level omissions inside those areas — R2-21.)* |
| **F13** LIVE entries that assert nothing | **CLOSED at the LIVE level** | No `expect(true).toBe(true)` remains, and **each of the 7 LIVE entries dies under a matching source mutation**: caps (sign-off gate removed), isolation (vault key drops clientId), gateway/trace (failure trace removed), mass-read scan (platform-host pattern removed), prediction-gate scan (identifier pattern removed), flags (`requireActiveChannel` relaxed), tokens (Meta EAA pattern removed). The LIVE-count arithmetic is guarded by a real regex test. *(The deferral half is not — R2-25.)* |
| **F14** approvals harvested from the worktree | **CLOSED as far as it can be in-repo** | A pre-existing approval file already in the tree, not added in this diff, no longer counts: `class2-gate` exits 1 with "…without a matching human approval entry added in this diff". The `status === "added"` filter does what it claims. The residual identity problem is honestly disclosed at `gate-lib.mjs:145-149`, H19 and L11. *(Replay via `cp` under a new filename — R2-05.)* |
| **F15 / AC 2** rebind was a no-op | **CLOSED and genuinely demonstrated** | `eval-rebind.test.ts:20-47` serves `genome-tagger` through a `gpt-5` binding (asserted URL contains `openai/gpt-5`), computes score 0.8 from `RECORDED_QWEN_72B` via `runEval`, rebinds **on that EvalResult**, and serves the same call site through `workers-ai/qwen-72b`. Re-run independently: `{"from":"gpt-5","to":"qwen-72b","score":0.8}`. Note the score lands **exactly** on the 0.8 threshold and the recordings are the L2 placeholders — the mechanism is real, the data is not yet. |
| **F16** scanner blind to real token types | **Token-pattern half CLOSED** | I authored a sample for every one of the twelve declared `SECRET_PATTERNS` and **each fired**, including the four `scan-lib.test.ts` does not cover (`sk-live-`, the 32-char project key, the PEM block, the bearer literal). Dynamic and CJS SDK import forms both caught. Secret rules correctly still apply inside test files. *(The walk scope and extension policy were **not** fixed despite being named in F16 — R2-29.)* |
| **F17** raw index on `ROLE_CARDS` | **Behaviour CLOSED** | `eval-harness.ts:59` now uses `ownEntry(ROLE_CARDS, role)`. *(The sibling raw index inside `RecordedTransport` is still open — R2-24; and the guard is unlocked — R2-33.)* |
| **F18** leak-check not import-safe | **CLOSED** | Rules split into `scan-lib.mjs`; `leak-check.mjs` runs the walk only when it is the process entry point; `engine/test/scan-lib.test.ts` imports the rules with 17 tests and no side effects. My own probes import `scanTree`/`walk` directly with no filesystem walk and no `process.exit` — confirmed. |
| **F19** direct switchboard indexing | **Partially closed** | The `REGISTRY_INDEXING` rule exists with a correct allowlist, catches `CHANNELS["google"]`, and neutering the pattern is caught. The scanner also cannot be blanket-disabled — exempting `engine/src/` wholesale is caught. *(It catches one spelling — R2-13.)* |
| — | **Forged reservations contained** | `settle()`/`release()` resolve the amount from the meter's own `#open` record, so `settle({id:"r1", clientId:"attacker", amountUsd:999})` charged the victim's real $0.05 and credited the attacker nothing; a second settle and a release after it were no-ops. |
| — | **Meter-contract fail-closed** | Three degraded meter shapes (`{todayUsd, record}` only; reserve-only; reserve+settle without release) were **all** refused before anything left the building. |
| — | **Ad-spend caps honestly disclosed** | `dailyAdSpendUsd`/`totalAdSpendUsd` are genuinely unenforced, and `caps.ts:9-16` says so prominently and accurately, in the exact place a Phase 6 builder would look: *"NOT YET ENFORCED ANYWHERE… A later phase must not assume a guard already exists here."* `getCaps` still fail-closed-validates them. |
| — | **Op type-confusion in `metricPasses`** | No defect: `==0` rejects `false`; `==true` rejects `1`; `==` rejects `"4"`; `<`/`>=` reject booleans via the typeof guard; NaN fails every op. All produced BELOW_A naming the right key. |
| — | **Enforcement routing** | No defect: dropping two areas produced exactly six actions, three per failing area, each tagged with its own area, no cross-contamination; an all-A snapshot produced `[]`. |
| — | **`runEval` really executes the golden set** | Verified, not assumed: a five-case run produced **5 trace events** and **$0.10 of metered spend** against the client's cap — every case traversed the real gateway path (schema validation, reserve/settle, trace-or-fail). Scores are computed, not asserted. |
| — | **H19 honesty** | The reason the gates are advisory is recorded accurately in three places and not glossed: `HUMAN_TASKS.md:17`, ledger L11, and in-code at `gate-lib.mjs:148` ("this gate proves what was approved, not who approved it"). No overstatement found on this point. |
| — | **Frozen caps table** | Mutating `CAPS_TABLE.pulsern.dailyAiSpendUsd` and adding a new key both throw `TypeError`; `getCaps("pulsern").dailyAiSpendUsd` stays 25. |
| — | **Space-delimiter vault collision** | The previous report's refutation stands — `od -c` confirms a real NUL byte, and the space-style collision genuinely does not exist. |
| — | **Cross-tenant refusals themselves** | A vault handle scoped to another client, a `TraceContext` scoped to another client, and per-client meter keying all refuse correctly. |

---

## 6. Adjudication of the two BUILDER MODIFICATIONs

The builder edited two of the previous adversary's lock tests and flagged both
in-line for re-review. That is the correct behaviour and I want it recorded as
such. I did not accept either at face value: I recovered the pre-edit blobs from
the git object store and diffed them.

### 6.1 F3 — `engine/test/adversary-phase0.test.ts` — **ACCEPTED. Contract preserved and strengthened.**

Pre-edit blob `de4831b645691227394308064d3e4cd42592e4bf`. The edit is confined to
one hunk; nothing else in the file changed. The original was:

```
expect(transport.calls).toBe(20);
expect(meter.todayUsd(TEST_CLIENT)).toBeGreaterThan(0);
```

— exactly what the builder's comment says. Its reasoning checks out: **pre-fix,
`toBe(20)` PASSED** (the meter assertion was the failing half), and post-fix the
cap correctly refuses calls 6–20, so `toBe(20)` did encode the *defect's symptom*
rather than the finding's contract. The replacement keeps the meter assertion and
adds `meter ≈ transport.calls * 0.01`, which is **strictly stronger** than
`> 0` — it asserts every call that left the building was charged, which is what F3
was actually about. Nothing weakened, nothing evaded, nothing hidden.

### 6.2 F9 — `config/test/adversary-phase0.test.ts` — **ACCEPTED. Casts only; one over-claim noted.**

Pre-edit blob `130ef83d4bcc73702cfef07e4bf99b5f91e808a0`. Full diff against HEAD:
an added `type EvalAttestation` import, a `forced()` helper, and three call sites
wrapped in it. **No assertion, expectation, `describe` or `it` text changed.** The
compile-time justification verifies by execution:
`bindRole(ROLE_BINDINGS,"genome-tagger","llama-70b",1.0)` is `TS2345` under
`npm run typecheck`, and `tsconfig.json`'s `include` does cover
`config/test/**/*.ts`, so without the cast the file genuinely would not compile.
All three cases still exercise a real runtime refusal.

**One over-claim, recorded not as misconduct but for accuracy**: "stronger than
the finding asked for" is true of the three test cases and of F9's *prescribed
fix*, but **not** of the goal sentence printed in those very tests — *"a fabricated
pass is not constructible without executing the golden set"* — which remains false
(R2-22, R2-23). **Minor side effect worth the builder's attention**: all three F9
cases now take the identical `typeof att !== "object"` branch, so the file has
three tests where one behaviour is tested — which is precisely why the role,
modelId and arithmetic branches turned out to be entirely uncovered.

### 6.3 Process observation — for the human queue

The previous adversary's two test files were **never committed by the adversary**.
They entered the repo only inside the builder's own fix commit `df95668`, as new
files. There is therefore **no independent baseline in the history** against which
"the builder edited the adversary's evidence" can be checked. I only had one
because `git add` had left the original blobs in the object store — that is luck,
not process.

**Recommendation**: the build protocol should require the adversary's Phase B tests
to land in their own commit **before** the fix commit touches anything.

---

## 7. §10.2 standing-invariant checklist

Checked every run, per mandate. "Armed" means a real assertion exists that dies
under a matching source mutation.

| # | §10.2 invariant | Result |
|---|---|---|
| 1 | Writes-only: no code path mass-reads platform APIs (Law 1) | **WEAK — R2-13.** The write-verb half is honestly deferred to Phase 6. The mass-read half is a literal-host grep that misses env-supplied and non-code-file carriers, asserted in a test that scans one hand-picked string and is titled as an absence property. |
| 2 | Spend caps present, immutable at runtime, tested by attempted breach (Law 2) | **FAIL — R2-01, R2-02, R2-03, R2-04, R2-05, R2-06, R2-07.** Constants are genuinely immutable (verified). But the enforced cap is caller-supplied, the sign-off marker is forgeable, the meter bricks itself, and the transport-error breach path has no test. |
| 3 | Per-client isolation: a seeded cross-tenant read must fail (Law 3) | **FAIL — R2-30.** My seeded cross-tenant read **succeeded** via a NUL-bearing `clientId`. The LIVE proof passes only because it never uses one. |
| 4 | Every LLM call routes through AI Gateway; every decision emits a Langfuse trace (Law 11) | **FAIL — R2-28, R2-02, R2-16.** 13 of 16 failure paths emit nothing, including both cross-tenant refusals and the cap-breach refusal. Gateway routing is armed but the scanner misses `env.AI.run(...)` (R2-13). |
| 5 | Proxies-kill-only enforced in code (Law 5) | **DEFERRED**, honestly — Phase 5. |
| 6 | No prediction-gate code paths exist (Law 6) | **WEAK — R2-13.** One identifier spelling is banned; `expectedRoas`, `predicted_roas`, `pWin` are not. |
| 7 | Trust-ladder cannot skip rungs (Law 8) | **DEFERRED**, honestly — Phase 5. |
| 8 | `decisions` ledger append-only, captures every write | **DEFERRED**, honestly — Phase 2. |
| 9 | External content is data, never instructions | **PARTIAL**, honestly declared — inert-fixture half live, crawler drill Phase 1. |
| 10 | `VERDICT.md` hash-locked at launch | **DEFERRED**, honestly — Phase 6. But R2-25 shows this very bullet can be **deleted from the checklist** with 118 tests green. |
| 11 | OAuth tokens exist only in the vault; a token in code, logs or traces is a critical defect | **FAIL — R2-14, R2-27, R2-29.** The vault secret reaches the trace sink verbatim; `redactError` is bypassable; and the scanner cannot see `.github/` or the sibling client trees. |
| 12 | Queue past SLA waits; locked flags structurally unable to activate | **FAIL — R2-13, R2-11.** `CHANNELS.google` and `const { tiktok } = CHANNELS` both return live registry entries without entering `requireActiveChannel`, and a flag flip requires no approval. "Structurally inert" is a regex, not a structure. Queue half honestly deferred to Phase 6. |

**Meta-result — R2-25**: the checklist does not check itself. Its own "checklist is
complete" test asserts a list length and two field shapes; a §10.2 bullet can be
deleted, a phase falsified, and the count drifted, all with 118 tests green.

---

## 8. Phase 0 deliverables and acceptance criteria

| Deliverable (§11 Phase 0) | Status |
|---|---|
| Monorepo scaffold (Workers/TypeScript) | **MET** — `wrangler.toml` committed; runtime parity deferred (L7). |
| `config/caps.ts` | **MET as a constant table**, immutable and frozen — **but see R2-03/R2-04/R2-06**: the enforced value is caller-supplied and the file is reachable outside Class-2 control. |
| Model abstraction layer (`models.ts`, role cards, eval harness, family-diversity enforcement) | **PARTIAL** — the layer exists and the rebind works. Family-diversity enforcement is Class-1 editable (R2-12) and the eval gate is forgeable three ways (R2-22, R2-23, R2-24). |
| Grade Registry scaffold with initial A-thresholds | **PARTIAL** — 8 areas present, but 9 of 24 §12 A-criteria unimplemented (R2-21) and out-of-domain metrics grade A (R2-20). H9 sign-off is being solicited on a 15/24 artifact. |
| CI pipeline | **PARTIAL** — three gates exist and mostly work; the parser reads PASS from invisible content (R2-09), a fresh FAIL does not block (R2-10), and the whole `verify` job is disableable without approval (R2-08). |
| AI Gateway wiring with per-client keys | **MET in code**; live round-trip is **L1**. |
| Langfuse project + tracing helper | **PARTIAL in code** (R2-28); live project is **L1/L3**. |
| `CLAUDE.md` + adversary agent installed | **MET.** |
| ClickHouse Cloud + Airbyte provisioned | **NOT MET** — honestly disclosed as **L9** (H3, H4). |
| OAuth secrets vault (encrypted, auto-rotated, least-scope) + CI leak check | **NOT MET** — encryption/rotation disclosed as **L10**; least-scope is **broken** (R2-30, not disclosed); the leak check has a blind spot (R2-29). |
| Switchboard skeleton (US + Meta on, all else locked and structurally inert) | **PARTIAL** — the registry is correct; "structurally inert" is **false** (R2-13) and flag flips need no approval (R2-11). |
| fullburn.ai registered; trademark check | **NOT MET** — honestly disclosed as **L6** (H1). |

| Acceptance criterion | Status |
|---|---|
| AC1 — hello-world round-trips through AI Gateway and appears in Langfuse | **CONDITIONAL** — contract-level met; live half is **L1**. |
| AC2 — rebinding frontier → open-source passes evals and serves with zero code change | **MET at the contract level** and genuinely demonstrated (`gpt-5` → `qwen-72b` at one call site). Recordings are L2 placeholders; the score lands exactly on the threshold; and the eval gate it depends on is forgeable (R2-22/23/24). |
| AC3 — Grade Registry computes and publishes a grade from seeded data | **MET literally**, but the published grade is not trustworthy (R2-20, R2-21). |
| AC4 — CI blocks a PR missing an adversary report | **NOT MET.** It blocks a *missing* report but opens on a report whose visible verdict is FAIL (R2-09), and does not block on a fresh FAIL when a fresh PASS coexists (R2-10). |
| AC5 — cap constants exist and a test proves runtime mutation fails | **PARTIALLY MET.** Mutation and table-**injection into the frozen object** both throw `TypeError` (verified). But `getCaps`'s second parameter is an unguarded widening path (R2-03) and the test proving AC5 largely runs *through* that seam. |

---

## 9. Spec-level observations for the human

Findings go to the builder; these go to you. None is silently patched.

1. **§13's Class-1/Class-2 split has a structural collision.** §13 names
   "role→model bindings" as Class 1, but `ROLE_BINDINGS` shares a file with the
   only code enforcing Law 13. Protecting the file makes every legitimate rebind
   human-only; not protecting it leaves Law 13 auto-editable (R2-12). The spec
   needs to say that *enforcement code* and *bindings data* are different
   artifacts. This is a design decision, not a builder fix.

2. **`CLASS2_FILES` is an exact-path allowlist, which is the wrong shape.** Three
   independent bypasses fall out of that one choice: rename (R2-06), module
   resolution (R2-04), and simple omission (R2-08, R2-11, R2-12). Consider
   inverting it — a *deny*-by-default rule over `config/src/**`, `engine/src/**`,
   `engine/scripts/**`, every `package.json` and every `tsconfig*.json`, with a
   small explicit Class-1 allowlist. An allowlist of protected things fails open;
   a denylist of unprotected things fails closed.

3. **Approvals authorize a content *state*, never a *transition*.** No nonce, no
   base-commit binding, no supersession, no expiry (R2-05). The human's most
   recent decision has no more authority than their oldest. Recommend binding each
   approval to the base commit it was written against.

4. **The adversary cannot revoke its own PASS** (R2-10). This is not theoretical:
   **L8/H6b requires a second, non-Claude adversary to re-review this exact tree.**
   If that reviewer returns FAIL, CI stays green as long as any fresh PASS exists.
   Precedence should be: any FAIL bound to the current tree dominates every PASS
   bound to the same tree.

5. **The test suite is being used as a control, and it is not one** (R2-04). It is
   a checkable oracle an attacker reads and dodges — `process.env.VITEST` was
   enough. Tests should be treated as evidence about behaviour, never as a
   substitute for a structural gate.

6. **Consider whether §12's "A means" column is normative.** If it is, 9 criteria
   are unimplemented and H9 is being asked to sign a partial artifact under a
   complete-sounding name (R2-21). If it is aspirational, the spec should say so
   and the registry should carry a coverage marker. Either answer is fine; the
   current silence is not.

7. **`llm()` never validates `deps.bindings`** (extracted from the refuted D7).
   Family diversity is enforced at import for `ROLE_BINDINGS` and inside
   `bindRole`, but is purely advisory at the call site — any future module handing
   `llm()` a hand-built bindings object gets whatever it asked for, and the
   shortest such route is scan-clean. Unreachable today (nothing constructs
   bindings outside `models.ts` and its tests). Worth closing before Phase 5 with
   a branded `RoleBindings` type only `validateBindings` can mint.

8. **Two tests in one suite assert contradictory contracts on `parseVerdict`**
   (R2-09): `gates.test.ts:81-83` says a trailing parenthetical after PASS is
   valid (needed for exactly the conditional verdict this project uses);
   `adversary-phase0.test.ts:134` says a parenthetical-bearing prose line must not
   read as PASS. Both are green only because a broken hash short-circuits one. The
   human should decide which contract is real before the parser is fixed.

9. **Phase 0's honest position.** Four named deliverables are genuinely not built
   (ClickHouse, Airbyte, vault encryption, domain/trademark) and are correctly
   disclosed in the ledger. That is fine. What is not fine is that the
   *change-control layer* meant to protect the phases that spend real money is the
   least complete part of the tree, and its own tests certify it as complete.

10. **On my own standing**: I am Claude, the same model family as the builder.
    **L8 remains open and this review does not clear it.** Per §2.4 and Law 13, a
    review by a same-family model is not the family-diversity guarantee the spec
    requires. H6b must still be executed, and per R2-10 that reviewer's FAIL would
    not currently block CI — which should be fixed *before* H6b runs, not after.

---

## 10. Verdict basis

The rule the human set: FAIL if **any** confirmed finding is money-loss,
ban-risk, data-lie or isolation severity.

| Band | Count |
|---|---|
| S1 · Money loss | **7** |
| S1a · Control plane | **5** |
| S2 · Ban risk | **3** |
| S3 · Data lies | **11** |
| S4 · Isolation | **4** |
| S5 · Dummy-proof | **4** |
| **Total** | **34** |

Seven money-loss findings alone decide it. No conditional pass is available and
none is offered.

The builder's F1–F19 work was real and I have said so at length in §5 — the
concurrency fix in particular is genuinely good and I could not break it across
nine interleavings. But the perimeter around it is not: the arithmetic inside the
meter bricks the money path after $0.03, the cap the engine enforces is whatever
the caller hands it, the human sign-off that blocks all spend today is a
forgeable string, and the gate that decides whether any of this ships opens on a
report that says FAIL.

Nothing here can be overridden by the builder. Only the human, in writing,
recorded in this report.

---

*No builder code was modified. All probes ran in
`/tmp/claude-0/-home-user-New-skills-/64269547-e557-5483-8b4d-c2147d059962/scratchpad/`
or in throwaway git clones outside the repo. `git status --porcelain` was empty
before and after. Nothing was committed or pushed.*
