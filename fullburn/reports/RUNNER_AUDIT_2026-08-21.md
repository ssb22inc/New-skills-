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
derived its population from `git ls-files` instead of asserting a list. Eleven
tracked files had never been read by the leak scan:
`haven/terraform/aws/{main,outputs,variables}.tf`, `haven/Dockerfile.dev`,
`haven/prisma/schema.prisma`, `haven/src/app/globals.css`, `haven/.nvmrc`, and
four `.gitignore` files. Terraform variables and Dockerfile `ENV` lines are two
of the likeliest places a real credential sits in plain text.

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

**Numbers at this commit**, meta-check passed first: mutations **190/190
caught, 0 survived, 0 stale**; suite **386/386** across 29 files; three shuffled
seeds 386/386; `--no-isolate` and single-fork 383/383; drill green; typecheck
and leak-check clean.

**The first harness run of this work FAILED, and that is recorded rather than
tidied away.** Two of the audit's own entries survived: RA-12 — nothing drove
the NUL parser's delete branch, a genuine unprotected behaviour — and RA-16,
whose mutation was a semantic no-op (`.toBe(matches !== undefined)` is
`.toBe(true)`). A no-op entry is a broken entry: it was replaced with a real
revert, and the check it targeted was given the negative case it never had —
a drill path, which must answer NO. Neither was deleted to buy a clean score.

Ledger row **L34**.
