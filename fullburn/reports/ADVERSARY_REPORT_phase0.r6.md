# ADVERSARY REPORT phase0.r6
Verdict: FAIL
verified-tree: 469db675da7005ded355b3e3699a90b3bbbf17fe

Round: phase0.r6 (sixth adversarial round)
Target commit: b9364e37a83cfb58a881dde52cb4e6e1e94471ae
Branch: claude/fullburn-engine-spec-r7v5lg
Date: 2026-08-16

> The verdict above is FINAL and matches the Verdict section at the end of this
> report. It was written as FAIL at the moment the file was created, before any
> finding was confirmed, so that an interrupted review would fail closed rather
> than leave a stale PASS on disk; the evidence gathered since confirms it.

## Scope and method

Reviewed in an isolated clone with a real `npm install`, never in the main tree:

```
git clone --no-hardlinks /home/user/New-skills- $SCR/r6work
cd $SCR/r6work && git checkout b9364e37a83cfb58a881dde52cb4e6e1e94471ae
cd fullburn && npm install     # added 53 packages, audited 56
```

Isolation proof (the mandate's specific warning — a symlinked `node_modules`
resolving `@fullburn/config` back to the main tree would make every mutation a
no-op):

```
$ readlink -f node_modules/@fullburn/config
/tmp/.../scratchpad/r6work/fullburn/config
```

The workspace symlink resolves inside the clone. A second, empirical proof is
recorded under "Isolation" below: a caps mutation applied in the clone changes
the clone's test result and leaves the main tree's result unchanged.

Verified tree hash, computed independently:

```
$ git ls-files -s -- 'fullburn/' '.github/' ':!fullburn/reports/' ':!fullburn/APPROVALS/' | git hash-object --stdin
469db675da7005ded355b3e3699a90b3bbbf17fe
```

Matches the hash in the tasking. This report binds to that tree.

## Baseline (recorded before any mutation)

| command | result | exit |
|---|---|---|
| `npm test` | 18 files, 243 tests passed | 0 |
| `npm run typecheck` | clean | 0 |
| `npm run integration` | 1 file, 10 tests passed | 0 |
| `npm run invariants` | 1 file, 13 tests passed | 0 |
| `npm run e2e` (PLAYWRIGHT_CHROMIUM_PATH set) | 1 passed (smoke.spec.ts) | 0 |
| `node engine/scripts/leak-check.mjs ..` | `leak/structural scan: clean` | 0 |
| `npm run mutate` | `52 mutations: 52 caught, 0 survived, 0 not found` | 0 |

The builder's mutation claim (52/52) reproduces exactly.

<!-- FINDINGS APPENDED BELOW AS CONFIRMED -->

---

# FINDINGS

## R6-01 — SEVERITY 3 — A FAIL bound to this tree is silently discarded when the binding line also names the commit. The R5-03 defect class, reintroduced by the R5-03 fix.

`readTreeBinding` (engine/scripts/gate-lib.mjs:207-215) strips Markdown
decoration and then takes **the first hash-shaped substring anywhere on the
line**:

```js
const token = /[0-9a-f]{7,64}/i.exec(m[1].replace(/[`*_]/g, ""));
```

`[0-9a-f]{7,64}` is unanchored. Any hex-shaped run of 7+ characters that
precedes the tree hash is taken as the binding. A commit SHA is hex-shaped. So
is `b9364e3`. So is `deadbeef`.

The consequence is not a parse error. It is a *wrong* binding, which lands in
the one branch of `judgeReport` that does **not** block:

```js
if (!fresh) return { ok: false, fresh: false, blocking: false, reason: "...code changed after the adversary judged it..." };
```

`blocking: false` means the report is filed as history and skipped, and a
sibling PASS opens the gate.

### Reproduction

`node r6parse.mjs` in the clone, driving `checkAdversaryReport` from
`engine/scripts/gate-lib.mjs` directly, with a genuine sibling PASS present:

```
A1 commit hash printed before the tree hash
   +PASS sibling: GATE OPENS  <<<<<<<<<<
A2 prose 'see commit b9364e3' then the tree
   +PASS sibling: GATE OPENS  <<<<<<<<<<
A3 leading decoy word that is hex-shaped
   +PASS sibling: GATE OPENS  <<<<<<<<<<
A4 correct, decorated (control)          -> GATE blocks
A5 blockquoted FAIL (control)            -> GATE blocks
A6 tree named first, commit after        -> GATE blocks
A7 non-hex prose (control)               -> GATE blocks
```

The A1 report, in full, is three lines:

```
# ADVERSARY REPORT phase0.r7
Verdict: FAIL
verified-tree: b9364e37a83cfb58a881dde52cb4e6e1e94471ae (commit; tree 469db675da7005ded355b3e3699a90b3bbbf17fe)
```

Solo, the gate's own explanation is:

```
report verified tree b9364e37a83cfb58a881dde52cb4e6e1e94471ae but current
fullburn tree is 469db675da7005ded355b3e3699a90b3bbbf17fe — code changed after
the adversary judged it; re-run the adversary
```

That sentence is false. The code did not change. The report names this exact
tree, on the binding line, in plain text.

### Why this is a data lie and not a formatting quibble

The rendered artifact and the source agree completely here — the binding line
contains no Markdown construct at all, no HTML, no comment, no fence, so
GitHub renders it byte-for-byte as written. A human opening the file sees
`Verdict: FAIL` and sees `469db675da7005ded355b3e3699a90b3bbbf17fe` on the
`verified-tree:` line. There is no rendering under which that report is about a
different tree. The gate nonetheless reports that it is, and proceeds.

This is the identical failure mode as R5-03 — "a correctly bound FAIL read as
stale and silently discarded while a sibling PASS opened the gate" — one round
later, through the code written to fix it. r5's diagnosis was right about the
symptom and wrong about the cause: the cause was never backticks specifically,
it was that the parser guesses at a token rather than requiring one, and that a
wrong guess is routed to `blocking: false`.

### Who this bites

reports/README.md:44-47 states the case itself: the second, cross-family
adversary required by §10.1 and ledger L8/H6b "has no way to discover this
format from the code." That reviewer is handed a target commit — this tasking
names `b9364e37a83cfb58a881dde52cb4e6e1e94471ae` in its first paragraph and the
tree hash second — and recording both on the binding line is the natural thing
to write. It costs them their entire review, silently, and the gate tells the
human the reviewer was judging stale code.

### What would actually fix it (builder's call, not mine)

Two independent changes, either of which closes it:

1. Anchor the token: require the binding to be the whole remaining field after
   decoration-stripping (`^\s*([0-9a-f]{7,64})\s*(?:\(.*\))?\s*$`), so anything
   ambiguous yields `null` — which already blocks.
2. Treat "parsed a hash that is not the current tree" as blocking whenever the
   line ALSO contains the current tree hash. A binding line that names this
   tree anywhere is not a statement about a different tree.

The deeper point: `blocking: false` is reachable from a *parse ambiguity*, and
r5's whole fix was that ambiguity must block. It still does not, whenever the
ambiguity resolves to something hex-shaped.

---

## R6-02 — SEVERITY 3 — The H20 expiry is still satisfiable without driving a browser. The builder's "a named test driving a page is now required" is not what the code requires.

`e2eVarianceHolds` (engine/test/e2e-variance.ts:52-55) at PHASE ≥ 1 requires,
of the non-smoke spec files:

```js
const named = /\b(?:test|it)\s*\(\s*["'`][^"'`]*intake[^"'`]*confirm[^"'`]*["'`]/i;
return real.some((c) => (named.test(c) || alt.test(c)) && /\bpage\s*\./.test(c));
```

Two independent whole-file regexes, ANDed. The test's **body is never
examined**, and `\bpage\s*\.` need only occur *somewhere in the file* — inside
a string literal, in dead code, anywhere. The named test and the `page.` do not
have to be related to each other.

### Reproduction

Driving the real exported function (`/tmp/e2eprobe.mts` against
`engine/test/e2e-variance.ts`):

```
=== E1: cheap satisfaction of the PHASE-1 expiry ===
  SATISFIED <<<<  string literal 'page.' + named test
  SATISFIED <<<<  named test + unrelated page. elsewhere
  SATISFIED <<<<  named test, body empty, page. in a dead const
  refused         skipped test
  SATISFIED <<<<  it.todo style
  SATISFIED <<<<  commented-out real test + literal
```

The cheapest passing file is two lines, `engine/test/e2e/intake.spec.ts`:

```ts
test("intake confirm", () => {});
const _ = "page.";
```

Empty body. No `page` fixture. No assertion. No browser. The Phase 1 gate opens.

Worse, the last case: a real e2e test **commented out** — i.e. deliberately
disabled — plus the same two lines, also satisfies it. The comment stripper the
builder added to defeat "prose is not the thing" is what removes the evidence
that the work was disabled.

### The locked test proves less than its own label claims

`engine/test/invariants/invariants.test.ts:133` asserts:

```js
["a named test that drives nothing", "test('intake confirm flow', () => { expect(1).toBe(1); });"],
```

That case is refused — but **not because the body drives nothing**. It is
refused only because the file happens to contain no `page.` substring. Append
`const _ = "page.";` to that exact string and the assertion inverts. The test
is named for a property it does not test. That is the same "reads as coverage
without being it" defect the builder's own comment on `CLASS2_WITNESS_PATHS`
(gate-lib.mjs:76-87) describes as "worse than no list at all."

### Status and severity

Latent at PHASE 0 — the branch is inert until PHASE reads 1 — so this is not a
live breach today. It is severity 3 because L16's correction, written one
commit ago, now asserts the expiry "requires a named test that drives a page,"
and the ledger is the artifact a human trusts when deciding whether the Phase 1
gate is real. See R6-06.

---

## R6-03 — SEVERITY 3 — `runnerTargets` can be fooled by a decoy `testDir`, and is blind to per-project `testDir`. R5-02's defect class survives, live at PHASE 0.

`runnerTargets` (engine/test/e2e-variance.ts:29-34) takes the **first**
`testDir:` match in the comment-stripped config:

```js
const m = /testDir\s*:\s*["'`]([^"'`]+)["'`]/.exec(code(playwrightConfig));
```

Unlike R6-02 this is live at every phase: `e2eVarianceHolds` evaluates
`runnerPointsHere` before the phase check, so it is the half of the H20
variance that is supposed to be enforced *now*.

### Reproduction

```
=== E2: fooling runnerTargets with a decoy testDir ===
  runnerTargets=true   decoy const before the real config
  runnerTargets=true   decoy in a template string
  runnerTargets=true   projects[] overriding testDir
  runnerTargets=false  honest repoint (control)
  runnerTargets=true   honest (control)
```

Case 1, in full:

```ts
const DOC = { testDir: "engine/test/e2e" };
export default defineConfig({ testDir: "stub-e2e" });
```

Playwright runs `stub-e2e`. `runnerTargets` returns `true`. The invariant suite
reports the H20 variance holding. This is verbatim the R5-02 outcome — "a
Class-1 diff repointed it at a new directory holding a stub … the invariant
suite still asserting the H20 variance held, because it read the directory and
never the runner that executes it" — reached through the code written to fix
it, because that code reads the runner as *text* and not as *configuration*.

Case 3 needs no decoy and no dishonesty at all:

```ts
export default defineConfig({ testDir: "engine/test/e2e", projects: [{ name: "p", testDir: "stub" }] });
```

Playwright resolves `testDir` per project; the top-level value is only a
default. A perfectly ordinary multi-project config makes the check assert
something untrue about which suite runs.

### Mitigation that exists

`playwright.config.ts` is now Class-2 (pattern index 8), so reaching any of this
requires a human-approved diff — which is a real barrier and is why this is
severity 3 rather than higher. It is not a defence: a human reviewing a
Playwright config diff has no reason to know that the *first* `testDir` string
in the file is the one the invariant reads.

### Direct answer to the tasking

"Confirm the runner-targets check cannot be fooled." It can be fooled, three
ways, two of which require no intent to deceive.

---

## R6-04 — SEVERITY 1 — `Object.freeze(this)` is the load-bearing half of the new handle-identity model and NO test protects it. Removing that one line reopens R5-01 in full, with the entire 243-test suite green.

The r5 rewrite's stated guarantee is "identity, not resemblance": a handle must
be one the meter minted, proved by the private `#minted` WeakSet. Three
mutations lock the WeakSet and the brand (`R5-01 handle identity`, `R5-01 minted
WeakSet only`, `R5-01 reservation brand`).

But the WeakSet only proves **which object**. It does not prove the object's
`id` still points where it did. `#close` resolves the ledger entry by field:

```js
if (!(reservation instanceof SpendReservation) || !this.#minted.has(reservation)) return null;
const open = this.#open.get(reservation.id);      // <- by FIELD, on a minted object
```

The only thing stopping a caller from re-pointing `id` on a genuine handle is
`Object.freeze(this)` in the constructor (spend-meter.ts:72). That line has no
mutation entry, and nothing in the suite asserts a handle is frozen.

### Reproduction — the mutation survives

In my own harness (`r6mutate.mjs`, same method as `engine/scripts/mutate.mjs`):

```
*** SURVIVED ***   M5 handle not frozen   (engine/src/spend-meter.ts)
```

`Object.freeze(this);` → `void 0;` and the full suite passes: 243/243.

### Reproduction — what the surviving mutation buys an attacker

Probe: five genuine, in-flight $2 reservations for `pulsern` against the
approved $10/day AI ceiling; the attacker holds **one** of them, forges nothing.

```
--- CONTROL: shipped code (Object.freeze present) ---
frozen? true
reserved before: 10
6th reserve at the ceiling: CapError
reservations closed with one genuine handle: 0
reserved after: 10
EXTRA USD admitted past the $10 daily ceiling: 0 | todayUsd reads: 0
Tests  1 passed (1)

--- MUTANT: Object.freeze(this) removed ---
frozen? false
reserved before: 10
6th reserve at the ceiling: CapError
reservations closed with one genuine handle: 5
reserved after: 0
EXTRA USD admitted past the $10 daily ceiling: 10 | todayUsd reads: 10
Tests  1 passed (1)
```

The attack is three lines and uses only handles the meter itself minted:

```js
const mine = live[0];
for (const other of live) { mine.id = other.id; m.release(mine); }
```

Result: $20 of real spend against the approved $10/day ceiling, while
`todayUsd()` reads exactly $10 — **the identical cap-breach-plus-data-lie
signature R5-01 documented**, reached without forging anything, without a
second meter instance, and without touching the WeakSet or the brand.

### Why this is severity 1 and not a style note

The shipped code is correct today: the freeze is present and the control run
shows the attack fully blocked. What is defective is the **protection of the
fix**, judged by the project's own stated bar — `engine/scripts/mutate.mjs:5-8`:

> "A fix whose revert leaves the suite green is not protected by anything: three
> consecutive adversary reviews found fixes in that state, and every one of them
> was a defect that could be reopened with a single line while CI stayed green."

This is a fourth one, inside the money-path fix from one commit ago, and it is
the highest-value line in that fix. Every mutation entry the builder wrote for
R5-01 guards the half that was already obvious. The half that a routine
refactor would remove — `Object.freeze(this)` looks like defensive hygiene, not
like a cap enforcement mechanism — is the half with no entry.

`SpendReservation` also carries no comment marking the freeze as load-bearing;
lines 60-74 explain the brand and the WeakSet at length and say nothing about
why the instance is frozen.

### Required, minimally

1. A mutation entry for `Object.freeze(this)`.
2. A test that asserts a minted handle is frozen AND that mutating `id` on a
   genuine handle cannot close another reservation.
3. Better: stop resolving by field. `#close` could key `#open` by the handle
   object itself (a `WeakMap<SpendReservation, Entry>`), which makes the freeze
   unnecessary rather than load-bearing — identity all the way down, which is
   what the class comment already claims the design is.

---

## R6-05 — SEVERITY 5 — Eight further guards carry no mutation entry and no test. Two disclosed-unguardable cases verified HONEST.

I wrote 39 mutations of my own against guards with no entry in
`engine/scripts/mutate.mjs`. Result: **26 caught, 13 survived, 0 not found.**
Two of the 13 were bad mutations of mine (semantically inert — see below), one
is R6-04, and two are the builder's disclosed cases.

### The builder's two disclosures are honest — verified, not accepted

| disclosed case | claim | verified |
|---|---|---|
| `baseCommit === undefined \|\|` disjunct (mutate.mjs:39-42) | restoring it is a semantic no-op because the fail-closed guard returns first | **SURVIVED — claim TRUE.** The guard at gate-lib.mjs:445 returns before the loop, so `baseCommit` is always a non-empty string there and the disjunct can never be reached. The guard itself is mutated (`N-03 baseCommit fail-open`) and is caught. |
| `assertCapsCoherent` call site in `getCaps` (ledger L19) | no violating input exists in the frozen table, so the call site cannot be killed by mutation | **SURVIVED — claim TRUE.** All three table entries are coherent (pulsern 75≥66 and 10≤200; fixture-unsigned 1≥1, 1≤1; fixture-testco 1≥1, 5≤20). The check itself is driven directly and its own mutations (`H8 hard-ceiling sanity check`, `H8 day-above-month sanity check`) are caught. |

Both disclosures are accurate and neither is convenient cover for something
else. This is the one place in the round where the builder claimed a limit
rather than a result, and the claim survives inspection.

### The genuinely unguarded guards (beyond R6-04)

| id | guard | file:line | exploitable today? |
|---|---|---|---|
| M4 | corrupt-ledger read guard `!Number.isSafeInteger(v) \|\| v < 0` | spend-meter.ts:224 | reachable via `record()` with large values; fail-closed backstop only |
| M6 | `open.clientId !== reservation.clientId` | spend-meter.ts:314 | **inert** — cannot fire while handles are frozen and minted; reads as a guard, is dead code |
| M7 | `Math.max(0, reserved - open.micros)` clamp | spend-meter.ts:318 | inert today; becomes load-bearing the moment R6-04's freeze is lost |
| M8 | `toMicros` safe-integer guard | spend-meter.ts:31 | backstopped by the `projected` range check; defence-in-depth only |
| M12 | `assertSaneCap` body | caps.ts:94 | backstopped — a bad narrowing yields `NaN`/negative and `assertUsableAmount` refuses downstream |
| M14 | `Object.hasOwn(narrowing, clientId)` prototype-pollution guard | caps.ts:183 | **inert w.r.t. money** — a polluted entry can only narrow, never widen |
| P1 | pinned-hash exemption content-binding | gate-lib.mjs:308 | see below — this one matters |
| P3 | blockquote skip in `visibleHeaderLines` | gate-lib.mjs:175 | removing it loosens the parser; no test notices |

**P1 deserves naming separately.** The builder's own comment
(gate-lib.mjs:217-226) states the pin's entire purpose: *"this exemption cannot
be inherited by new content in the same filename, which is the only way an
exemption like this goes wrong."* That property — and only that property — is
what makes a hard-coded exemption acceptable. Mutating

```js
return pinned === undefined || shortSha256(d.content) !== pinned;   // to:
return pinned === undefined;
```

leaves the suite green. The safety property the comment advertises is asserted
by nothing. I could not turn it into a live exploit (reports are append-only, so
`ADVERSARY_REPORT_phase0.r3.md` cannot be rewritten in a PR, and the exemption
can only make a report *ignored*, never manufacture a PASS), which is why this
is severity 5 rather than 3 — but it is exactly the "reads as coverage without
being it" pattern.

I verified the pin itself is correct: `sha256(r3.md)[0:8] = 38ba0f39`, matching
`UNBOUND_HISTORICAL_REPORTS`, and r3 is duly excluded from judging.

### My own bad mutations, disclosed

Two of my 13 survivors were harness artifacts, not findings, and I say so
rather than counting them:

- **P5** — I appended `blockingX: true` to a return that already carried
  `blocking: true`. Purely additive; inert by construction.
- **C1** — I removed the `l.startsWith("??")` disjunct from `assertCleanTree`.
  Inert: an untracked line is `"?? path"`, so `l[1] !== " "` already catches it.
  This does show the `startsWith("??")` disjunct in the shipped code is
  redundant, which is harmless.

---

## R6-06 — SEVERITY 3 — Ledger L16's correction and HUMAN_TASKS H20 assert a stronger e2e expiry than the code implements. Written one commit ago, in the artifact the human trusts.

L16's correction, appended 2026-08-16, states:

> "Both are now fixed and mutation-locked — the runner's `testDir` is checked,
> the config and any `e2e/` directory are Class-2, and **the expiry requires a
> named test that drives a page**. The row's claim of a mechanical expiry is
> true as of this correction, and was not before it."

HUMAN_TASKS.md:19 makes the matching claim to the approver: "Enforced
mechanically by the invariant suite … so the deferral cannot outlive its terms
by being forgotten."

Both are overstated, on the evidence in R6-02 and R6-03:

| claim | actual |
|---|---|
| "requires a named test that drives a page" | requires a named test **and, separately, the literal substring `page.` anywhere in the file**. The test body is never inspected. A two-line file with an empty body satisfies it. |
| "the runner's `testDir` is checked" | the **first** `testDir:` string in the file is checked, including one inside a comment-stripped string literal, and per-project `testDir` is invisible. |
| "the claim of a mechanical expiry is true as of this correction" | the mechanism exists and is stronger than before; it is not sufficient to enforce the approver's terms. |

The three Class-2 claims in the correction ARE true — I verified `playwright.*`,
`e2e/` at any depth, `.npmrc`, `.nvmrc`, `package-lock.json` and the
`vite`/`vitest` shape all match, and mutating each pattern is caught (G-series,
plus the builder's own `R5-02` entries).

This matters because L16 is the row a human reads when deciding whether the
Phase 1 gate can be trusted to hold the deferral to its terms. The r5 round's
own lesson — recorded in this same row — was that the previous version of this
claim was untrue. The corrected version is closer, and still not true. A ledger
that has now overstated the same guarantee twice is the failure mode L15's
"a builder cannot clear a row that records its own unverified work" exists to
prevent.

**Correcting r5 where it was wrong:** r5 diagnosed R5-06 as "a bare keyword
match" and R5-03 as "backticks". Both diagnoses named the specific input that
happened to be tried rather than the property that was missing. The missing
property in both cases is the same one: *a check that scans for a token
anywhere in a blob cannot distinguish the thing from a mention of the thing.*
Every fix in this round's report parser and e2e expiry re-implements that same
scan with a longer pattern, which is why R6-01 and R6-02 exist.

---

## Ledger honesty — the rest

- **L19** (`assertCapsCoherent` unguardable) — **verified honest**, see R6-05.
- **L21** (handle identity, in-process only) — accurate as written. Cross-instance
  replay re-executed and blocked: two meters mint colliding ids (`ids equal: true`),
  and A's handle released and settled into B moves nothing (`B reserved 5`,
  `B committed 0`). **Incomplete**: it credits the WeakSet for the whole guarantee
  and does not record that `Object.freeze` carries the other half unprotected
  (R6-04).
- **L22** (report/approval integrity holds in CI and nowhere else) — accurate.
  "An unreadable report blocks" is true. It does not cover a *misreadable* one,
  which is R6-01.
- **L20** ("the H8 caps have never metered a real dollar") — accurate and
  appropriately cautious.
- **L14/L17** (UTC rollover, no restart persistence) — re-confirmed by execution;
  a fresh meter starts a fresh day.
- No unmet item appeared to be unrecorded, with the exception of R6-04's
  dependency, which belongs in L21.

---

# CLEAN AREAS — attacked and held

One line each, naming the attack.

- **Handle forgery.** `Object.create(SpendReservation.prototype)` + field copy,
  `Object.setPrototypeOf` on a matching literal, `structuredClone` (degrades to
  a plain `Object`), a `Proxy` wrapping a genuine handle, and a subclass calling
  `super()` with a guessed symbol — all refused; the subclass throws
  `MeterUnavailableError` at construction and the rest move nothing. Held.
- **The $200/month ceiling.** 31 simulated days × 20 × $1 reservations settled:
  exactly $200 admitted, `monthUsd()` reads $200. Held.
- **Settle/release ordering.** Double-settle, settle-then-release and
  release-then-settle are all idempotent; no double-commit, no freed headroom
  for departed spend. Held.
- **Ledger-key collision.** `clientId` values containing `|`, `d:`, `m:`, a
  leading `|` and a trailing space cannot reach another client's day or month
  key — the day/month prefixes are fixed-length and the `d:`/`m:` discriminator
  makes the two namespaces disjoint. Victim's ledger unmoved. Held.
- **`reservedUsd` double/under-counting.** Reservations taken in two different
  months sum once each ($3 + $4 = $7), not per-period. Held.
- **Cross-instance replay (L14/L21).** Re-executed; refused. Held.
- **Law 3 isolation in `llm()`.** Trace-context and vault client-scope checks
  both mutation-caught (I1, I2). Held.
- **Class-2 under-match.** All 87 tracked in-scope files classified: 77 Class-2,
  10 Class-1. The Class-1 set is `HUMAN_TASKS.md`, `APPROVALS/` (2) and
  `reports/` (7) — no executable file, no config, no test. Nothing load-bearing
  is unprotected. Every one of the 20 patterns is claimed by a witness and
  mutating any of 13 previously-unmutated patterns is caught. Held.
- **APPROVALS append-only (R5-05).** Re-attacked four ways on a real git repo:
  rename-away, delete, smuggling approval blocks into the exempt
  `APPROVALS/README.md` while raising `monthlyAiSpendUsd` to 99999, and
  replaying a copied approval into a new file. All four refused, exit 1.
  `class2-gate.mjs:31` correctly requires `status === "added"` and excludes
  `README.md`, so the README exemption in the append-only rule is not a hole.
- **`assertCleanTree` (R5-07).** Verified live, not just by unit test: my own
  untracked probe files made the real `adversary-gate.mjs` fail closed, naming
  them, exit 1.
- **H8 cap values.** Exactly $66 pacing / $75 hard daily ad / $2,000 total /
  $200 per month AI / $10 per day AI. Each of the five mutated independently;
  all five caught.
- **Leak/structural scan.** A planted `ghp_…` token is caught with exit 1; the
  clean tree scans clean. A hostile-instruction fixture planted in `engine/src`
  is not flagged, which is correct — that scanner's scope is secrets and
  structure, and no agent (including me) obeyed the seeded instruction.
- **Test-suite integrity (the r5 corruption incident).** No `.only`, no `.skip`,
  no `.todo`, no `xit`/`xdescribe` anywhere. No `describe` without an `it`. No
  `it` without an assertion — the five that my scanner flagged in
  `adversary-phase0.test.ts` assert through the `files.toContain` helper
  (line 153), which wraps `expect`. No duplicated test titles or bodies.
  `locks-r4.test.ts` is 618 lines, not 705,848 — the corruption is gone. Two
  files (`locks-r5.test.ts`, `hardening.test.ts`) are flagged binary by `grep`;
  this is **not** corruption — they contain three deliberate NUL bytes each, in
  `parseNameStatusZ("R097\0…")` fixtures and NUL-injection vault tests
  respectively. 238 test blocks parsed, 243 executed, all green.
- **Gate exit codes.** `class2-gate` and `adversary-gate` both exit 1 on
  failure; verified directly rather than through a pipe.
- **Verdict-token strictness.** `PASSED`, homoglyph `PASS`, and a
  parenthetical-only token are all rejected as `INVALID`, which blocks.

---

# ANSWER TO THE TASKING'S ITEM I — the approval set

The gate behaves correctly with the approval absent, which is the state I found.

`APPROVALS/2026-08-16-h8-caps.md` covers the transition from base
`b1fc37d` and is the only approval present. Commit `b9364e3` touches 11 further
Class-2 paths. Run against a real repository:

```
$ node engine/scripts/class2-gate.mjs <root> eb0775f
CLASS-2 GATE FAIL: Class-2 changes without a matching human approval for this
transition (Law 2/14/15): fullburn/config/src/caps.ts (modified),
fullburn/engine/scripts/gate-lib.mjs (modified),
fullburn/engine/scripts/mutate.mjs (modified),
fullburn/engine/src/gateway.ts (modified),
fullburn/engine/src/spend-meter.ts (modified),
fullburn/engine/test/e2e-variance.ts (modified),
fullburn/engine/test/gates.test.ts (modified),
fullburn/engine/test/integration/gate-cli.test.ts (modified),
fullburn/engine/test/invariants/invariants.test.ts (modified),
fullburn/engine/test/locks-r4.test.ts (modified),
fullburn/engine/test/locks.test.ts (modified)
exit=1
```

Exactly 11 paths, correctly refused. Against the full PR range
`b1fc37d...HEAD` it lists 12 (adding `fullburn/playwright.config.ts` as
`added`), also refused.

Nothing in the repository pretends the approval exists. `HUMAN_TASKS.md:21-31`
correctly records it as owed and points the human at `npm run owed-approvals`.
The `APPROVALS/` directory contains only the one signed entry plus its README.

---

# MY OWN LIMIT — this review does NOT satisfy §2.4 / L8 / H6b

I am the same model family as the builder. Law 11 and ENGINE_BUILD.md §2.4
require builder and adversary for the same domain to run on different model
families, and ledger L8 records that requirement as OPEN for Phase 0. **This
round does not close it.** Six same-family rounds are not one cross-family
round; a shared family shares blind spots, and the defects I did not find are
disproportionately likely to be the ones a different family would find first.

Do not read this verdict as evidence that L8 is satisfied, and do not let the
count of rounds substitute for the diversity requirement. L8 stays open.

R6-01 is directly relevant to that reviewer: the format that silences a bound
FAIL is undiscoverable from the code, and the cross-family reviewer is the
person most likely to hit it.

---

# VERDICT

Verdict: **FAIL**

## Blocking findings

| id | sev | summary |
|---|---|---|
| R6-04 | **1** | `Object.freeze(this)` — the load-bearing half of the R5-01 handle-identity fix — has no mutation entry and no test. Reverting one line reopens the cap breach in full ($20 against a $10 ceiling, `todayUsd()` reading $10) with 243/243 green. |
| R6-01 | 3 | A FAIL bound to this tree is silently discarded, and a sibling PASS opens the gate, whenever the binding line also names the commit. The R5-03 defect class, reintroduced by the R5-03 fix. |
| R6-02 | 3 | The H20 Phase-1 expiry is satisfied by a two-line file with an empty test body and the string `"page."`. Latent until PHASE reads 1. |
| R6-03 | 3 | `runnerTargets` is fooled by a decoy `testDir`, by one inside a string literal, and by per-project `testDir`. Live at PHASE 0. |
| R6-06 | 3 | Ledger L16's correction and HUMAN_TASKS H20 assert a stronger e2e expiry than the code implements — the second time this row has overstated the same guarantee. |
| R6-05 | 5 | Eight further guards carry no mutation entry and no test, including the pinned-hash exemption's content-binding, which is the only property that makes that exemption acceptable. |

## Why this is a FAIL and not a conditional PASS

R6-04 alone is disqualifying. The tasking asked me to assume the money path had
taken a new severity-1 finding in each of the last four rounds and to prove
otherwise by running things. I ran them, and it has taken a fifth. The
*behaviour* of the shipped money path is correct — I could not breach $200/month
or $10/day by any route I tried, and the handle model repelled every forgery,
replay and misroute I built. What failed is the same thing that failed in each
prior round: the fix is one routine line-removal away from reopening, and the
harness whose entire purpose is to detect that state does not detect it.

R6-01 compounds it. The gate that is supposed to stop exactly this kind of
finding from being waved through can be made to discard a bound FAIL by an
authoring choice no document warns against, and it announces a false reason
when it does.

Independently of severity, the standing ledger position forbids an unconditional
PASS in any case: L1–L22 are open, and the ledger's own preamble states that
"while any entry is open, every phase verdict is CONDITIONAL."

## What I am NOT claiming

- Not claiming the current tree overspends. It does not, on any route I executed.
- Not claiming R6-02/R6-03 are live breaches today; R6-02 is latent until PHASE 1
  and R6-03 sits behind a Class-2 human approval.
- Not claiming completeness. See "My own limit."

## Human decision required

Per my mandate, a FAIL blocks the phase gate and can be overridden only by the
human, in writing, recorded in the report. I have not fixed any builder code;
all probe files were written in an isolated clone and removed, and the only file
I created in the main tree is this report.

---

# APPENDIX — reproduction environment

```
clone:   $SCRATCH/r6work            (git clone --no-hardlinks, checkout b9364e3)
install: npm install                 -> 53 packages (real, not symlinked)
proof:   readlink -f node_modules/@fullburn/config
         -> $SCRATCH/r6work/fullburn/config
browser: PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

Probe scripts written and run inside the clone only:

| file | purpose |
|---|---|
| `engine/test/r6money.probe.test.ts` | 10 money-path attacks (P1–P10) |
| `r6parse.mjs` | report-parser attacks A1–A7 against the real `checkAdversaryReport` |
| `/tmp/e2eprobe.mts` | E1/E2 attacks on `e2eVarianceHolds` and `runnerTargets` |
| `r6mutate.mjs` | 39 adversary-authored mutations |
| `engine/test/zz-m5.probe.test.ts` | the R6-04 exploit, control vs mutant |
| `engine/test/zz-xi.probe.test.ts` | cross-instance replay |

Main tree left clean; `git status --porcelain` in `/home/user/New-skills-`
reports only this untracked report file.
