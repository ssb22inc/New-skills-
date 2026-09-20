# DONE.md — Fullburn Completion Contract

**Authority: this file defines "complete."** ENGINE_BUILD.md defines *what* to build. CLAUDE.md defines *how*. DONE.md defines *when to stop*. Claude Code may not declare any phase or the build complete except by the mechanical procedure in §3. Human owner: Sheldon Bennett.

---

## 0. Why this file exists

Phase 0 has taken 13 adversary rounds and is not closed. Rounds 7–13 each found a severity-1 in the same place, and in six consecutive rounds a fix *created* the next round's finding. Every one of those rounds also produced a sincere, wrong statement that something was closed:

- r6 declared the report parser structurally fixed. r7 found an unclosed `<!--` manufacturing a `Verdict: PASS`.
- r9's crash-safety invariant made the mutation harness **incapable of failing**. The 105/105 was an artifact.
- r12's coverage claim said the sweep drove every guard. Twelve of 30+ were blind, including all six in `llm()`.
- r13 found a false ledger row **inside the commit that adopted the rule against false ledger rows**.

Conclusion, and the premise of this document: **self-assessment of completeness has a demonstrated failure rate near 100% on this codebase.** Therefore "done" is never a sentence Claude Code writes. It is an exit code produced by a command, plus a human signature, plus — for the build as a whole — an outcome measured in the world.

---

## 1. What 100% complete is NOT

None of these constitute completion, individually or in combination. Claude Code must not report completion on any of them:

- Tests passing. (r9: a suite can be green while the instrument judging it cannot fail.)
- The mutation harness reporting all-caught. Valid **only** when preceded by a passing meta-check in the same run.
- An adversary round returning PASS. Valid **only** with a cross-family read against the *same tree*.
- "All findings from round N are fixed." Fixes are unverified until re-attacked. Six rounds of precedent.
- A guard existing, appearing in a diff, or being named in a report. Shape is not behavior.
- A ledger row, CLAUDE.md line, or report sentence asserting something is closed. Prose is not evidence.
- "Bounded, not closed." A capability that is merely narrowed is **open**. Name the capability removed, or report it open.
- Any claim containing "should work," "appears," "structurally fixed," or "there is no longer any way to."

---

## 2. The three definitions of complete

There are three. They are not interchangeable. Claude Code must always name which one it means.

### 2.1 PHASE COMPLETE (per phase: 0–8, SI)

All ten conditions hold simultaneously against **one single tree hash**:

1. Every deliverable and acceptance criterion in that phase's ENGINE_BUILD.md section is implemented and **exercised by execution**, mapped `requirement → command run → observed output`.
2. A same-family `engine-adversary` round returns PASS against tree `T`.
3. A **cross-family** read (non-Claude model family, §10.1) returns PASS against **the same tree `T`** — not an earlier one. Artifact committed.
4. Zero open findings at any severity. Severity-3+ may be deferred only by a written human ruling in `APPROVALS/` naming the finding ID.
5. `npm run mutate` reports 0 survived, 0 stale, **preceded in the same run by a passing meta-check** (negative canary SURVIVED, positive canary CAUGHT).
6. The guard sweep's population is programmatically enumerated, entry count matches the enumerated count, and **each enumerated guard has been disabled individually and caught**.
7. Full suite green under **≥5 shuffled seeds**; typecheck, lint, leak-check clean; no source file mutated after a SIGINT drill.
8. Every Class-2 path in the phase's commit range is approved in `APPROVALS/`, **authored and pushed by Sheldon's authenticated GitHub identity**, through a PR gated by CODEOWNERS covering **100%** of tracked Class-2 files, with CI failing closed if CODEOWNERS itself is touched.
9. Every ledger / CLAUDE.md row asserting code behavior carries a test that fails when the assertion goes stale. Untestable rows state limitations, never conclusions.
10. Sheldon has given explicit written gate ack. **No ack, no completion — silence is not consent.**

### 2.2 ENGINE COMPLETE (v1 software)

All phases 0–7 PHASE COMPLETE, plus:

- **Every Law 1–19 has an executing test that fails when the law is violated.** A law without a failing-test proof is not enforced — it is aspirational. This is the single most important line in this file.
- Phase 2's Durable Object ledger has replaced the in-process implementation behind the same interface, and the R11/R13 capability family is **provably absent**: caller-supplied ceilings, caller-supplied sign, per-instance ledgers, and globally-writable slots all fail. An adversary attempt to spend past a cap via any constructed object, prototype, slot, or multi-call sequence must fail.
- A synthetic purchase lands in `revenue_ledger` correctly joined to a test ad, and survives a teardown/replay.
- Cross-tenant read attempt fails by construction, proven with two seeded clients.
- Big red button halts all spend in <60s, drilled from the UI.
- All 8 Grade Registry areas computing from live data and reporting A.
- Prompt-injection drill: hostile instructions seeded in crawled content, reviews, and research fixtures steer no agent.
- Backup restore, account-recovery, and model-failover drills **executed and recorded** — not described.

### 2.3 BUILD COMPLETE (the only definition that matters commercially)

ENGINE COMPLETE, plus the outcome. **Software completeness is not business completeness.**

- `VERDICT.md` written and hash-locked **before PulseRN's first dollar**, carrying absolute pre-registered thresholds (target CAC, payback period, D30 retention). PulseRN has no CAC history, so "beat baseline" is unavailable.
- PulseRN onboarded end-to-end from a pasted URL, through the four screens only.
- The $2,000 sprint run as ~30 days at ~$66/day — **not** 90 days at $22/day, which is below the $50–150/day test-fuel floor and would manufacture a false verdict.
- At least one full bracket cycle on real signal: publish → 2–3 day protection → proxy kill → revenue-verified promote.
- Nightly reconciliation to the cent for the whole sprint; zero cap breaches; zero unvetoed policy flags.
- One counterfactual report the report adversary signs.
- **The pre-registered verdict honored, whatever it says.** If VERDICT.md says the thesis failed, BUILD COMPLETE still holds — the build is finished and the answer is no. Moving the thresholds after launch is the one unrecoverable failure in this project.

---

## 3. How completion is declared (mechanical, not narrative)

Claude Code builds `npm run done -- <phase|engine>`: a single command that checks every applicable condition in §2 and exits non-zero on any failure.

- It **re-measures**. It never reads a cached result, a report file, or a ledger row as evidence.
- It refuses to run against a dirty tree or a mid-harness marker.
- It prints a per-condition PASS/FAIL table with the command and observed output for each.
- **It must itself be meta-checked**: a canary that deliberately breaks one condition must make it exit non-zero. A completion checker that cannot fail is the r9 defect at the top level.
- Its output is committed as `reports/DONE_<phase>_<tree>.md`.

**The only sentence Claude Code may use to report completion:**

> `npm run done -- <target>` exits 0 at tree `<hash>`. Cross-family read PASS at the same tree, artifact `<path>`. Class-2 sets approved under your identity. Requesting gate ack.

Anything less specific is a status update, not a completion claim. If a condition cannot be satisfied in this environment, say so plainly and leave the target incomplete.

---

## 4. Standing rulings (carry into every round; do not re-litigate)

1. **Remove capabilities, not spellings.** A fix is not complete until you can state which capability it removed. Six rounds closed spellings while the capability found new syntax. If a fix only narrows access, report it open.
2. **Structural closure beats checks on money paths.** No injectable seams on production types — resolver, clock, ceiling, meter, ledger slot. Fault injection lives in test-only types or the transport.
3. **Proxies kill, revenue promotes.** Never the reverse (Law 5).
4. **Behavior, not shape.** Every guard proven by executing the thing it blocks. No grep-for-a-string assertions. Seven shape-assertion traps so far.
5. **Finding IDs are immutable once issued.** R11-05 was silently reassigned and read as closed. Never reuse, never reassign.
6. **Ledger rows asserting behavior need tests.** Three consecutive rounds where a correction introduced a new false claim.
7. **A disclosed limitation on a money path is not a fix.** Four rounds running, a disclosure became the next round's severity-1.
8. **Never ship a guard and its checker in the same commit** without a test proving the checker can still go red.
9. **The upstream-masking sweep is mandatory and complete every round.** Wherever a new fail-closed check precedes an older one, prove the older one still fires. Three dead guards found this way.
10. **Tools that write to the source tree are adversarial targets.** Import-safe, crash-safe; a crashed run must leave no reverted guards on disk.
11. **Never buy a green number by deleting an entry.** Bring the honest FAIL.
12. **Nothing auto-resolves.** Builder/adversary disagreement goes to the human queue and the engine waits.

---

## 5. Session handoff protocol

Every session ends by committing and writing `HANDOFF.md` at repo root, containing:

- Current tree hash and branch.
- Open findings by immutable ID, severity, one-line status. **No finding marked closed without the test that proves it.**
- Standing rulings issued since the last handoff (append to §4).
- Which Class-2 sets are owed, against which base commits.
- The exact next command to run.
- An **UNVERIFIED CLAIMS** section listing anything the previous session asserted that is not backed by an executed check.

A new session starts by reading DONE.md, CLAUDE.md, HANDOFF.md, then re-running `npm run done -- <current phase>` to establish state from evidence rather than from the previous session's prose.

---

## 6. Queued spec edits (apply only when Phase 0 is PHASE COMPLETE)

Do not build these. Do not touch them before the gate is green. Then apply as spec text, each shown to Sheldon before it is written in.

- **SEO split.** Day-one read-only baseline and audit — GSC/Bing pull, technical crawl, baseline recorded, prioritized fix list — runs alongside Meta from client day one. Site-write access unlocks only after the site-mutation safety layer passes its adversary on live data. Starts the slow clock without risking a live site.
- **Channel roadmap placeholders.** Meta (live) → Google (staged, unlocks on first baseline beat) → TikTok → Reddit (the Research module already surfaces its subreddits and converting language) → open-web / Realize·Taboola (note its walled-network incentive conflict as exactly what the bracket checks).
- **B2B market bundle.** CRM-as-truth-source (HubSpot/Salesforce pipeline instead of Stripe revenue), pipeline baselines (cost-per-qualified-lead, lead-to-opportunity, cycle length, pipeline-to-close), a lead-quality adversary, and **LinkedIn as primary channel within this bundle** while remaining deprioritized on the B2C ladder. Post-proof expansion only — a B2B verdict takes quarters.
- **Build-protocol additions.** Finding-ID immutability and the capability-removal rule, as standing invariants.

---

## 7. The stop condition, in one paragraph

The build is 100% complete when `npm run done -- engine` exits 0 at a tree a non-Claude reviewer has passed, every one of the nineteen Laws has a test that fails when the Law is broken, all Class-2 approvals carry Sheldon's authenticated identity through a CODEOWNERS-gated PR, and PulseRN's sealed `VERDICT.md` has been answered by thirty days of real spend that reconciled to the cent — with the verdict honored whichever way it reads. Until every clause of that sentence is true and re-measured, the correct report is the honest FAIL and the list of what is still open.
