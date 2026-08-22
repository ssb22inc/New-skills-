# Runner audit — every drill, gate script and harness against the R14-06 rule

**This is a BUILDER'S record, not a verdict.** It is self-produced and grades
nothing. The adversary's r15 round is what judges the tree; §10.1 stands.

Task: HANDOFF §7.2 — *"Audit every drill, gate script and harness that runs
under its own runner against the R14-06 rule. Each one's decision must be a pure
function with red-proofs in the default suite, or it is unprovable."*

---

## 1. Why the audit was owed

R14-06 was found by accident. The SIGINT drill's three inline detection paths
were deleted and it still reported PASS, because the drill runs under
`vitest.drill.config.ts` and nothing in `npm test` could see what it decided.
The rule that came out of it was then applied **to that one file**.

A rule applied by hand to one file is not a rule. Every other runner in the tree
was unaudited: two drills, five `.mjs` CLIs, and the mutation harness itself.

## 2. Method — measurement, not reading

Each candidate decision was reverted one line at a time and the **whole default
suite** run against it. A revert that leaves `npm test` green is a decision no
red-proof covers. Suite baseline: 354/354 across 28 files, ~14s per run.

Population: `engine/scripts/*.mjs` invoked by an npm script or a CI step, plus
`engine/test/drill/**/*.drill.ts`. Seven runners.

## 3. Result — seven survivors

| # | Runner | Decision | Reverted to | Result |
|---|---|---|---|---|
| 1 | `leak-check.mjs` | CLI verdict wiring | `if (findings.length > 0)` → `if (false)` | **SURVIVED** 354/354 |
| 2 | `leak-check.mjs` | `SCANNED` extension allowlist | narrowed to `/\.(?:mjs)$/` | **SURVIVED** 354/354 |
| 3 | `leak-check.mjs` | `SKIP_DIRS` | `+ "src", "scripts"` | **SURVIVED** 354/354 |
| 4 | `adversary-gate.mjs` | phase-report selection | widened to `/^ADVERSARY_REPORT_phase/` | **SURVIVED** 354/354 |
| 5 | `adversary-gate.mjs` | `TREE_SCOPE` | `.github/` removed | **SURVIVED** 354/354 |
| 6 | `class2-gate.mjs` | approval-document selection | `status === "added"` dropped | **SURVIVED** 354/354 |
| 7 | `mutate.mjs` | CAUGHT/SURVIVED classification | comparison inverted | **SURVIVED** 354/354 |

What each one buys an attacker, stated plainly:

1. The leak scan reports clean with findings in hand. This is **N-03 leg B** —
   the CLI-wiring gap `gate-cli.test.ts` was built to close for the gates —
   still open on the leak scan, because no test had ever executed this CLI.
2. Every `.ts` file, every report, every workflow stops being scanned for tokens.
3. The engine's own source tree drops out of the walk.
4. A PASS written for **another phase** opens this phase's gate.
5. **R2-18 restored in one line**: the CI that enforces the gate leaves the
   adversary's verified scope, so the jobs can be deleted after sign-off and the
   binding still matches.
6. A PR **rewrites** an approval that existed at the base and has the rewrite
   authorize a fresh Class-2 transition. (The append-only check in the *other*
   gate refuses this too, so the tree was never actually open — but the gate that
   authorizes Class-2 changes was relying on a different gate to notice, and
   nothing tested that it did not.)
7. **The instrument.** Every surviving mutation prints `CAUGHT`, the harness
   exits 0, and the meta-check passes — because the meta-check validated its
   own copy of that comparison, not the entry loop's. This is adversary finding
   **R9-01's exact shape one layer down**: the acceptance bar printing a
   true-looking number it is structurally unable to check.

## 4. Two more found by driving the extracted decisions

**Leak-scan coverage.** Once the extension decision was a function, the test
derived its population from `git ls-files` instead of asserting a list.

> **CORRECTED 2026-08-22 (human ruling, haven investigation). This section said
> ELEVEN. The true widening is TWENTY-ONE**, and the eleven omitted the two
> files that matter most to the gate.

The paragraph that stood here named eleven files —
`haven/terraform/aws/{main,outputs,variables}.tf`, `haven/Dockerfile.dev`,
`haven/prisma/schema.prisma`, `haven/src/app/globals.css`, `haven/.nvmrc` and
four `.gitignore` files. Those eleven are real, and the point about terraform
variables and Dockerfile `ENV` lines being classic homes for a pasted credential
stands. But eleven was the number **the test could see**, not the number of
files the change newly covered: its first draft carried
`if (ext === "" || disclosed.has(ext)) continue`, which dropped every
extensionless file and its own `svg` entry before counting.

Measured against the tracked tree, the allowlist read 464 files and the denylist
reads 485 — **+21**. The ten never named were:

| Newly read, omitted from the original count | Why it matters |
|---|---|
| **`.github/CODEOWNERS`** | the file that makes Class-2 "human-only" real |
| **`fullburn/PHASE`** | what the adversary gate binds its report to |
| `LICENSE`, `haven/Dockerfile` | extensionless, dropped by the skip clause |
| 6 x `.svg` (`haven/public/*`, `pulsern/public/icon.svg`) | text, dropped by the `svg` entry |

The two in bold are the interesting ones and the report missed them: **the leak
scan had never read the Class-2 ownership file or the phase declaration.** A
count produced by a check with a skip clause is a count of what the check
looked at. That is a guard population enumerated by hand, one layer out, and it
is why the test was rebuilt — see §6a.

**`diff-lib.mjs` had no mutation entry at all.** The runner sweep found it on
its first run. It is the parser that turns a git diff into the protected-path
set — R3-CP-08's fix — and nothing had ever proved its locks bite.

## 5. Fixes — and the capability each one removed

Per the standing rule of 2026-08-20, each fix names what it removed.

| Fix | Capability removed |
|---|---|
| `scan-lib.mjs` gains `isScannedFile`, `isSkippedDir`, `looksBinary`, `leakVerdict` | the leak scan can no longer decide what to read or what to report from inside a process the default suite never starts |
| Extension **allowlist → denylist** of binary types, with a NUL-byte measurement behind it | a file type nobody thought of is now scanned rather than silently skipped — the polarity `SKIP_DIRS` already had, never applied to file types |
| `gate-lib.mjs` gains `selectPhaseReports` | the gate can no longer choose which reports answer for the current phase privately; a phase binding is a library decision |
| `gate-lib.mjs` gains `selectApprovalDocs` | approval-document selection is no longer a private CLI decision; an approval is credible only if this PR **added** it |
| `gate-lib.mjs` gains `VERIFIED_TREE_SCOPE`, `dirtyWorktreeLines` | one definition of what a PASS is a statement about, read by the CLI, the tree hash and the test |
| `mutate-lib.mjs` gains `classifyRun`, called by **both** harness loops | the harness can no longer classify an entry through an expression the meta-check does not exercise — **there is no second expression** |

`[LIMITATION]` Fix 6 removes the *divergence*, not the possibility of a wrong
classification. If `classifyRun` itself is inverted, the meta-check fails and
the run is void — that is the run-time lock — and its unit red-proofs are in
`npm test`. What is gone is the second, unvalidated copy.

## 6. New red-proofs

- `engine/test/integration/leak-cli.test.ts` (new, 7 tests) — executes the leak
  CLI as CI does: planted token → exit 1 naming the file; terraform and
  Dockerfile scanned; `engine/scripts/` walked; `node_modules`/`dist` not; a
  binary file skipped by its bytes; a bad root refused rather than reported clean.
- `engine/test/scan-lib.test.ts` — derived-population coverage (every tracked
  **text** file must be read; an exemption must actually be binary), skip-dir
  and verdict proofs.
- `engine/test/gates.test.ts` — the four extracted gate decisions driven directly.
- `engine/test/integration/gate-cli.test.ts` (+4 tests) — a committed workflow
  change makes a standing PASS stale; an unstaged workflow edit is refused; a
  phase-1 PASS does not open phase 0; a rewritten approval does not authorize.
- `engine/test/locks-r7.test.ts` — `classifyRun`, and that both canary
  directions exist so neither an always-CAUGHT nor an always-SURVIVED
  classification can pass the meta-check.

## 6a. Follow-up 2026-08-22 — the derived test had skip clauses of its own

Human ruling after the haven investigation: *"Fix the derived test. No skip
clause except measured-binary. It must FAIL if any tracked file goes unread."*

Two skips were removed, and each hid a class of unread file:

**(a) It asked the FILENAME, not the WALK.** `isScannedFile` answers about a
name. A tracked file inside a skipped *directory* answers "scanned" and is never
opened. Zero files sit in that position today — which is precisely why the test
could not see the hole: a check with no reachable negative case is this
project's recurring defect, and it had reproduced it. The test now derives the
set the walk actually visits and requires every tracked file to be in it.

**(b) `if (!existsSync(abs) || !statSync(abs).isFile()) continue`.** A symlink,
a gitlink, or a tracked path missing from the checkout vanished silently. Those
are now REPORTED — a path the scan cannot open is an unknown, and an unknown is
not an exemption.

Measured binary content is the only remaining exemption, and the exemption list
may name only formats whose stated reason says "binary".

Red-proofs, all three verified CAUGHT against the full suite:

| Revert | Caught by |
|---|---|
| add a source directory to `SKIP_DIRS` (the directory hole) | the walk-based check — **it could not see this before** |
| restore `isScannedFile` in place of `visited.has(f)` | the fixture-driven coverage audit |
| drop the `unreadable.push(...)` so an unopenable path is skipped | the fixture-driven coverage audit |

The decision is a pure function (`auditReadCoverage`) driven by fixtures the
real tree does not contain — an unwalked text file, an `ENOENT` path, an
`EISDIR` path — because on the real tree all three lists are empty and a check
that is only ever exercised with passing inputs proves nothing.

## 6b. Follow-up — dotfiles proven by execution, and a rule-coverage gap found

Human ruling: *"PROVE BY EXECUTION, do not read the code: does the SCANNER read
extensionless dotfiles?"* Canary planted in a temp `.npmrc`, `.netrc` and
`.pgpass`; the real CLI run as CI runs it:

```
LEAK/STRUCTURAL SCAN FAIL:
  - .netrc:  possible anthropic key
  - .npmrc:  possible anthropic key
  - .pgpass: possible anthropic key
exit=1
```

**All three read. No severity-1.**

**But the same rig surfaced a separate gap, and it is a real one.** Re-run with
*realistic* credentials instead of a canary the rules are written to match —
an `npm_…` automation token in `.npmrc`, a plaintext `password` in `.netrc`, a
password field in `.pgpass`, and `PGPASSWORD=` in an env file:

```
leak/structural scan: clean
exit=0
```

The files are **read**; the credentials are **not matched**. `SECRET_PATTERNS`
has no rule for npm tokens, `.netrc`/`.pgpass` password fields, or
`PGPASSWORD`/`PGPASS` assignments. This is a rule-coverage gap, not a
readability gap — a different defect from the one the ruling asked about, and
it is open. `scan-lib.mjs` is Class-2; **no rule was added.** Escalated for a
ruling rather than fixed.

## 6c. Root `.github/workflows/` audit — triggers, permissions, live state

Human ruling: *"Audit root `.github/workflows/` — triggers and permissions:
blocks on every exercise-template workflow. Report before deleting."*

Five exercise-template workflows sit at the repository root, inside the
branch-protection trust boundary. Their **declared** triggers and permissions:

| Workflow | Trigger | Permissions | Live state |
|---|---|---|---|
| `0-start-exercise.yml` | `push` → `main` | **contents: write**, actions: write, issues: write | `disabled_manually` |
| `1-create-a-branch.yml` | `push` → `my-first-branch` | contents: read, **actions: write**, issues: write | **`active`** |
| `2-commit-a-file.yml` | `push` → `my-first-branch` | contents: read, **actions: write**, issues: write | `disabled_manually` |
| `3-open-a-pull-request.yml` | **`pull_request` → `main`** (opened/synchronize/reopened/edited) | contents: read, **actions: write**, issues: write | `disabled_manually` |
| `4-merge-your-pull-request.yml` | **`pull_request` → `main`** (closed) | **contents: write**, actions: write, issues: write | `disabled_manually` |

**Do they block the fullburn PR? No — measured, not inferred.** Live state read
from the Actions API: the two `pull_request` workflows are `disabled_manually`,
so they will not run on a PR to `main` even though their files are present on
`main` and their triggers match. Zero `pull_request` runs exist in this
repository's history; all 81 recorded runs are `push`, and every one of the most
recent 30 is `fullburn-ci`.

**What is worth reporting anyway, because "disabled" is a setting and not a
structure:**

1. **`actions: write` is the power to enable and disable workflows** — including
   `fullburn-ci`. The gate that enforces Phase 0 is disable-able by a workflow
   that holds it.
2. **`1-create-a-branch.yml` is `active` and holds `actions: write`.** Its
   trigger is a push to `my-first-branch`, which does not exist today. Anyone
   who can push a branch by that name starts a run holding that permission.
3. **Every one of them calls third-party reusable workflows and actions pinned
   to MUTABLE tags** — `skills/exercise-toolkit/.github/workflows/*@v0.1.0` and
   `skills/action-text-variables@v1`. A tag can be moved. That is third-party
   code executing inside this repository's trust boundary with `issues: write`,
   `actions: write`, and in two cases `contents: write`.
4. **In workflows 3 and 4 the `find_exercise` job carries no `if` guard.** The
   `github.head_ref == 'my-first-branch'` condition guards only `check_step_work`.
   If either workflow were re-enabled, the third-party reusable workflow would
   run on every PR to `main` — the fullburn PR included.

**Two further findings from the same audit, neither ruled on:**

- **`fullburn-ci.yml` declares no `permissions:` block at all**, so it inherits
  the repository default rather than least privilege. It is Class-2; not changed.
- **A workflow registered `active` on GitHub does not exist on `main` or on this
  branch.** `.github/workflows/ci.yml` (id 308264483, created 2026-07-06) lives
  only on `origin/claude/sycamore-prompts-build-chain-o5rqtu` — a different
  product's branch — and its trigger is `pull_request:` with **no branch
  filter**. For `pull_request` events GitHub evaluates the workflow files on the
  PR ref, so it cannot fire on a fullburn PR whose head lacks the file. It is
  reported because "the repository's active workflow list" and "the workflows on
  `main`" are not the same set, and only the second is what anyone reviews.

**Nothing was deleted.** Per the ruling, this is the report that precedes it.

## 6d. AGAINST HAVEN, NOT FULLBURN — six workflows that never execute

Human ruling: *"Record against HAVEN, not fullburn: security-scan.yml and five
sibling workflows never execute."* Recorded here under haven's name, and
deliberately **not** entered in fullburn's verification ledger — it is not a
fullburn defect and a fullburn row asserting it would be the scope confusion
L35 exists to prevent.

**Finding — owner: `haven/` (secondary: `pulsern/`).** GitHub Actions reads
workflows only from the repository root `.github/workflows/`. These eight files
sit in sibling trees and are therefore **inert — they have never run and cannot
run while they live where they are**:

| File | What it is believed to do |
|---|---|
| `haven/.github/workflows/security-scan.yml` | **security scanning** |
| `haven/.github/workflows/ci.yml` | build/test gate |
| `haven/.github/workflows/test.yml` | test gate |
| `haven/.github/workflows/aws-deploy.yml` | deploy |
| `haven/.github/workflows/vercel-preview.yml` | preview deploy |
| `haven/.github/workflows/vercel-production.yml` | production deploy |
| `pulsern/.github/workflows/content-factory.yml` | scheduled content job |
| `pulsern/.github/workflows/sms-reminders.yml` | scheduled SMS job |

Confirmed against the live Actions API: the repository registers seven
workflows, and not one of these eight is among them. The registered set is the
five exercise-template files, `fullburn-ci`, and the stray `ci.yml` described in
§6c.

**The part that matters:** haven believes it has CI, tests, deploys and a
security scan. It has none of them in this repository. `security-scan.yml` in
particular is the kind of file whose mere presence is taken as assurance — a
green-looking artifact asserting nothing, which is the same defect class this
project spent fourteen rounds removing from its own instruments.

**Not remediated.** Moving or deleting them is a haven decision and touches the
tracked file set. If the preferred home for this record is haven's own tree
rather than this report, that is a one-file follow-up — say so and it will move.

## 7. What keeps it true — the runner-decision sweep

`engine/test/invariants/invariants.test.ts`. Runners are **derived from the
filesystem** (npm scripts + the CI workflow + `engine/test/drill/`), so a new
runner fails the day it lands. Each must be bound to a decision module and a
prover, and the sweep fails if:

- a runner is unbound, or a binding names a runner nothing invokes;
- a declared prover is not matched by `vitest.config.ts`'s include globs — i.e.
  is not actually in `npm test`, which is the whole of R14-06;
- a decision module is not imported by both the runner and a prover;
- a decision module carries no mutation entry (this is what found `diff-lib.mjs`);
- a runner holds an undisclosed decision literal — a regex, a `Set`, an array.

**`[LIMITATION]` The sweep catches decision LITERALS, not every undelegated
decision.** Six of the seven survivors were module-level literals; the seventh,
the harness classification, was an inline comparison and is invisible to it.
Finding that class takes a mutate-and-run round. This is said plainly rather
than left to read as full coverage — a check that overstates its own reach is
the defect this project keeps re-finding.

## 8. Runners judged already compliant

- `engine/test/drill/harness-interrupt.drill.ts` — decision is
  `post-signal-writes.ts`, six red-proofs in the default suite (R14-06's fix).
- `engine/test/drill/clock-rebind.drill.ts` — decision is `assertMonotonic`,
  exported and driven by the unreachable-guard sweep. The drill proves the
  *wiring*, which is the correct division.
- `engine/scripts/owed-approvals.mjs` — both of its decisions were already
  caught: the empty-set exit and the printed field names are round-tripped
  through `class2-gate` by `gate-cli.test.ts` (H-17's fix, working as designed).

## 9. Status

Phase 0 gate remains **RED**. This audit closes HANDOFF §7.2 and changes nothing
about §7.1: **L4/H2 — the Gateway caps — is still the Phase 0 blocker**, and the
primary spend control is still designed and unprovisioned.

**Numbers after the 2026-08-22 rulings**, meta-check passed first: mutations
**194/194 caught, 0 survived, 0 stale**; suite **387/387** across 29 files;
three shuffled seeds 387/387; `--no-isolate` and single-fork 384/384; drill
green; typecheck and leak-check clean. (At `b42d6ba`, before §6a–§6d: 190/190
and 386/386.)

Full history re-scanned after `git gc --prune=now`: **1,818 blobs, 1,804 read
as text, 0 findings.** The one prior finding was unreachable blob `cbbb9f50`,
a draft of `ADVERSARY_REPORT_phase0.r4.md` carrying that report's synthetic
splice fixtures; it is now collected.

**The first harness run of this work FAILED, and that is recorded rather than
tidied away.** Two of the audit's own entries survived: RA-12 — nothing drove
the NUL parser's delete branch, a genuine unprotected behaviour — and RA-16,
whose mutation was a semantic no-op (`.toBe(matches !== undefined)` is
`.toBe(true)`). A no-op entry is a broken entry: it was replaced with a real
revert, and the check it targeted was given the negative case it never had —
a drill path, which must answer NO. Neither was deleted to buy a clean score.

Ledger row **L34**.
