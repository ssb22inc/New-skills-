/** THE COMPLETION CHECKER'S DECISIONS — pure, so the default suite can drive
 * every one of them (R14-06). `done.mjs` is wiring: it runs commands and hands
 * their output here. Nothing in this file reads a file, runs a process, or
 * consults a clock.
 *
 * Authority: DONE.md §3. "Done" is an exit code produced by a command, never a
 * sentence the builder writes — self-assessment of completeness has a measured
 * failure rate near 100% on this codebase (DONE.md §0). */

export const TARGETS = Object.freeze(["phase", "engine"]);
const KNOWN_FLAGS = new Set(["--skip-mutate"]);

/** `npm run done -- <phase|engine> [--skip-mutate]`. `--skip-mutate` exists so
 * the checker can be developed without a 50-minute harness run; it can only
 * ever make condition 5 FAIL ("not measured"), never pass it. */
export function parseArgs(argv) {
  const args = argv.filter((a) => a !== "--");
  const positional = args.filter((a) => !a.startsWith("--"));
  const flags = args.filter((a) => a.startsWith("--"));
  const unknown = flags.filter((f) => !KNOWN_FLAGS.has(f));
  if (positional.length !== 1 || !TARGETS.includes(positional[0]) || unknown.length > 0) {
    return { error: `usage: npm run done -- <${TARGETS.join("|")}> [--skip-mutate]` };
  }
  return { target: positional[0], skipMutate: flags.includes("--skip-mutate") };
}

/** DONE.md §3: refuses a dirty tree or a mid-harness marker. A canary file left
 * by a crashed run of this checker is recovered BEFORE this is consulted, so it
 * is never a refusal reason of its own. */
export function preflightRefusals({ porcelain, markerExists }) {
  const out = [];
  const dirty = String(porcelain ?? "")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (dirty.length > 0) {
    out.push(`working tree is dirty (${dirty.length} path(s)) — a verdict about an unrecorded tree is a verdict about nothing:\n  ${dirty.slice(0, 10).join("\n  ")}`);
  }
  if (markerExists) out.push("a mutation-harness in-flight marker exists — a harness run is in progress or died mid-mutation; run `npm run mutate` to recover first");
  return out;
}

/** vitest's summary line. `null` when it cannot be read — which is a FAIL, not
 * a pass: an unreadable result is not a green result. */
export function parseVitest(out) {
  // `N failed | M passed | K skipped (T)` — every segment but `passed` is
  // optional. A `-t`-filtered run reports the skipped segment, and reading
  // only the unfiltered shape made every filtered condition "unparseable".
  const m = /Tests\s+(?:(\d+) failed \| )?(\d+) passed(?: \| (\d+) skipped)? \((\d+)\)/.exec(out ?? "");
  if (!m) return null;
  return { failed: Number(m[1] ?? 0), passed: Number(m[2]), skipped: Number(m[3] ?? 0), total: Number(m[4]) };
}

/** The mutation harness's own output: BOTH meta-check canaries must have
 * reported the expected answer in THIS run, and the summary must read 0
 * survived, 0 stale. Any missing line is a FAIL. */
export function parseMutate(out) {
  const s = out ?? "";
  const summary = /(\d+) mutations: (\d+) caught, (\d+) survived, (\d+) not found/.exec(s);
  // The NAMES, not only the counts. The first phase-0 run reported "3 stale"
  // and discarded which three; finding them again took a separate probe. A
  // number without its members is a status, not a finding.
  const STALE_LINE = /^PATTERN-NOT-FOUND\s+(.+?)\s+\([^)]*\)\s*$/gm;
  const SURVIVED_LINE = /^\*\*\* SURVIVED \*\*\*\s+(.+?)\s*$/gm;
  return {
    stale: [...s.matchAll(STALE_LINE)].map((m) => m[1]),
    survivors: [...s.matchAll(SURVIVED_LINE)].map((m) => m[1]),
    metaNegative: /\bok\s+negative canary\b/.test(s),
    metaPositive: /\bok\s+positive canary\b/.test(s),
    total: summary ? Number(summary[1]) : null,
    caught: summary ? Number(summary[2]) : null,
    survived: summary ? Number(summary[3]) : null,
    notFound: summary ? Number(summary[4]) : null,
  };
}

export function mutateCondition(parsed) {
  const p = parsed ?? {};
  if (!p.metaNegative || !p.metaPositive) {
    return { status: "FAIL", observed: "meta-check did not report both answers in this run — harness result is VOID (DONE.md §1)" };
  }
  if (p.total === null || p.survived === null || p.notFound === null) {
    return { status: "FAIL", observed: "no summary line — the harness did not finish" };
  }
  if (p.survived > 0 || p.notFound > 0) {
    const names = [
      ...(p.survivors?.length ? [`survived: ${p.survivors.join("; ")}`] : []),
      ...(p.stale?.length ? [`stale: ${p.stale.join("; ")}`] : []),
    ];
    return {
      status: "FAIL",
      observed: `${p.total} mutations: ${p.caught} caught, ${p.survived} survived, ${p.notFound} stale${names.length ? ` — ${names.join(" — ")}` : ""}`,
    };
  }
  return { status: "PASS", observed: `meta-check ok; ${p.total} mutations: ${p.caught} caught, 0 survived, 0 stale` };
}

/** `owed-approvals.mjs` output → the number owed, or null if unreadable. */
/** §2.1.7 "lint clean". Human ruling 2026-09-22: ESLint with typescript-eslint,
 * type-aware, `no-floating-promises` and `no-misused-promises` at error — the
 * defect class this project keeps meeting is an unawaited settle/reserve. The
 * decision: not configured is FAIL and says so; a non-zero exit is FAIL and
 * quotes the first findings; zero problems is PASS. The linter's own verdict is
 * never trusted from its exit code alone — the output must also carry no
 * "error" line, so a crash that exits 0 (or a wrapper that swallows) cannot
 * read as clean. */
export function lintCondition({ configured, code, out }) {
  if (!configured) {
    return { status: "FAIL", observed: "NOT CONFIGURED — no lint script or eslint.config.mjs in this workspace; §2.1.7 requires one" };
  }
  const text = out ?? "";
  const errorLines = text.split("\n").filter((l) => /\berror\b/.test(l));
  if (code !== 0 || errorLines.length > 0) {
    const shown = errorLines.slice(0, 3).map((l) => l.trim()).join(" | ") || text.trim().split("\n").slice(0, 3).join(" | ") || "no output";
    return { status: "FAIL", observed: `exit ${code}: ${shown}` };
  }
  return { status: "PASS", observed: "clean (eslint, type-aware: no-floating-promises, no-misused-promises)" };
}

/** §2.1.8's approval half: the class-2 gate's own verdict, never a count of
 * transitions (cross-family finding X-12, 2026-09-24 — a fully approved phase
 * with any Class-2 change failed C8). `gate` is `checkClass2Approvals`'s
 * result; `owed` is the transition count, reported as information only. The
 * probe of 2026-09-24 showed the choice of predicate living in the runner,
 * where no default-suite test could see it — so it lives here. */
export function class2Condition(gate, owed) {
  const ok = gate !== null && typeof gate === "object" && gate.ok === true;
  const reason = gate && typeof gate.reason === "string" ? gate.reason : "no gate verdict";
  return { status: ok ? "PASS" : "FAIL", observed: `${reason}${Number.isInteger(owed) ? ` — ${owed} transition(s) in range` : ""}` };
}

export function parseOwed(out) {
  const s = out ?? "";
  if (/No Class-2 paths changed/.test(s)) return 0;
  const m = /owed — (\d+) entr/.exec(s);
  return m ? Number(m[1]) : null;
}

/** A cross-family read declares its reviewer's family on its own line. The
 * builder cannot infer a family from prose, so a report without the line is
 * not a cross-family read, whatever it says about itself. */
export function reviewerFamily(reportContent) {
  const m = /^Reviewer-family:\s*(.+?)\s*$/m.exec(reportContent ?? "");
  return m ? m[1] : null;
}

export function isNonClaudeFamily(family) {
  if (typeof family !== "string" || family.trim() === "") return false;
  return !/claude|anthropic/i.test(family);
}

/** DONE.md §2.1.10 — the ack is a file naming THIS tree. Authorship is
 * CODEOWNERS' job (condition 8), not this parser's. */
export function gateAck(content, tree) {
  const s = content ?? "";
  const t = /^tree:\s*([0-9a-f]{7,64})\s*$/m.exec(s);
  const a = /^ack:\s*(yes)\s*$/mi.exec(s);
  if (!t) return { ok: false, reason: "no `tree:` line" };
  if (!tree.startsWith(t[1]) && !t[1].startsWith(tree)) return { ok: false, reason: `ack names tree ${t[1].slice(0, 12)}, current tree is ${tree.slice(0, 12)}` };
  if (!a) return { ok: false, reason: "no `ack: yes` line — silence is not consent" };
  return { ok: true, reason: `ack for tree ${t[1].slice(0, 12)}` };
}

/** A condition PASSES only when every sub-result passes. Anything else — FAIL,
 * unmeasurable, unparsed — is FAIL. */
export function verdict(results) {
  const flat = [];
  for (const r of results ?? []) {
    flat.push(r);
    for (const s of r.sub ?? []) flat.push(s);
  }
  const failing = flat.filter((r) => r.status !== "PASS").map((r) => r.id);
  return { ok: flat.length > 0 && failing.length === 0, failing };
}

/** THE CHECKER'S OWN META-CHECK (DONE.md §3): a canary that breaks one
 * condition must flip that condition to FAIL. Two canaries, both real:
 *   - the refusal canary: an untracked file must make pre-flight refuse;
 *   - the condition canary: a planted failing test must flip the suite
 *     condition from PASS to FAIL — and it must have been PASS before, or
 *     the flip is not demonstrated and the run is void. A checker that would
 *     print FAIL for everything regardless shows no flip. */
export function metaVerdict({ refusalTriggered, before, after }) {
  const problems = [];
  if (!refusalTriggered) problems.push("an untracked file did NOT make pre-flight refuse");
  if (before !== "PASS") problems.push(`the canary condition was already ${before} before the canary — the flip cannot be demonstrated`);
  if (after !== "FAIL") problems.push(`the planted failing test left the condition ${after} — the checker cannot see a failure`);
  return problems.length === 0
    ? { ok: true, reason: "the checker refuses a dirty tree and flips a condition PASS→FAIL on a planted failure" }
    : { ok: false, reason: `META-CHECK FAILED: ${problems.join("; ")}. RESULT IS VOID.` };
}

/** The one sentence DONE.md §3 permits, and only `done.mjs` may print it. */
export function completionSentence(target, tree, artifact) {
  return `\`npm run done -- ${target}\` exits 0 at tree \`${tree}\`. Cross-family read PASS at the same tree, artifact \`${artifact}\`. Class-2 sets approved under your identity. Requesting gate ack.`;
}

export function reportPath(target, phase, tree) {
  const label = target === "phase" ? `phase${phase}` : "engine";
  return `reports/DONE_${label}_${String(tree).slice(0, 12)}.md`;
}

/** Phase 0's deliverables and acceptance criteria (ENGINE_BUILD.md §11), each
 * mapped to the command that EXERCISES it here — or to the reason none can.
 * `command: null` is an honest FAIL: DONE.md §3, "if a condition cannot be
 * satisfied in this environment, say so plainly and leave the target
 * incomplete". */
export const PHASE0_REQUIREMENTS = Object.freeze([
  { id: "AC1-contract", what: "AC1 hello-world call goes through llm(), the only call path (contract half)", command: ["vitest", "run", "engine/test/gateway.test.ts"] },
  { id: "AC1-live", what: "AC1 the call round-trips through the REAL AI Gateway and appears in the REAL Langfuse project", command: null, why: "needs H2 (Gateway) and H5 (Langfuse) provisioned — ledger L1" },
  { id: "AC2", what: "AC2 rebinding a role frontier → open-source passes its evals and serves with zero code change", command: ["vitest", "run", "engine/test/eval-rebind.test.ts", "config/test/models.test.ts"] },
  { id: "AC3", what: "AC3 the Grade Registry computes and publishes a grade from seeded data", command: ["vitest", "run", "engine/test/grade-registry.test.ts"] },
  { id: "AC4-gate", what: "AC4 the adversary-report gate refuses a missing, stale or FAIL report (CLI executed against a real repo)", command: ["vitest", "run", "engine/test/integration/gate-cli.test.ts"] },
  { id: "AC4-enforced", what: "AC4 CI actually BLOCKS a PR missing an adversary report", command: null, why: "main has no branch protection — measured 2026-08-22, ledger L37; a required check cannot be observed from the sandbox" },
  { id: "AC5", what: "AC5 cap constants exist and runtime mutation fails", command: ["vitest", "run", "config/test/caps.test.ts"] },
  { id: "D-switchboard", what: "deliverable: switchboard skeleton — US + Meta on, everything else locked and structurally inert", command: ["vitest", "run", "config/test/switchboard.test.ts"] },
  { id: "D-vault", what: "deliverable: OAuth secrets vault with a leak check executed as a CI stage", command: ["vitest", "run", "engine/test/vault.test.ts", "engine/test/integration/leak-cli.test.ts"] },
  { id: "D-vault-rotation", what: "deliverable: vault is encrypted and auto-rotated", command: null, why: "unmet half, tracked since F10 — no rotation exists to exercise" },
  { id: "D-adversary", what: "deliverable: CLAUDE.md + adversary agent installed and discoverable", command: ["vitest", "run", "engine/test/invariants/invariants.test.ts", "-t", "discovery mirror"] },
  { id: "D-ci", what: "deliverable: CI pipeline — every workflow SHA-pinned, permission-declared, scope-filtered inside the job", command: ["vitest", "run", "engine/test/invariants/invariants.test.ts", "-t", "workflow hygiene"] },
  { id: "D-warehouse", what: "deliverable: ClickHouse Cloud + Airbyte provisioned", command: null, why: "H3/H4 — infrastructure, not observable from the sandbox" },
  { id: "D-name", what: "deliverable: fullburn.ai registered; trademark check completed", command: null, why: "human/legal action outside the repository" },
]);

/** ENGINE (DONE.md §2.2): every bullet beyond the phases, each with the reason
 * it is not yet measurable here. None of these has a command today. */
export const ENGINE_REQUIREMENTS = Object.freeze([
  { id: "E-laws", what: "every Law 1–19 has an executing test that fails when the law is violated", why: "no Law→test map exists yet; without it this cannot be enumerated, let alone executed" },
  { id: "E-do-ledger", what: "Phase 2 Durable Object ledger replaces the in-process one; R11/R13 capability family provably absent", why: "Phase 2 not started (PHASE=0)" },
  { id: "E-revenue", what: "a synthetic purchase lands in revenue_ledger joined to a test ad and survives teardown/replay", why: "no warehouse (H3/H4)" },
  { id: "E-tenant", what: "cross-tenant read fails by construction with two seeded clients", why: "no tenant-scoped read path exists before Phase 1; today the only isolation guard is the vault key composition (H-13), which is not a read path" },
  { id: "E-red-button", what: "big red button halts all spend in <60s, drilled from the UI", why: "no UI, no spend path before Phase 6" },
  { id: "E-grades", what: "all 8 Grade Registry areas computing from live data and reporting A", why: "no live data" },
  { id: "E-injection", what: "prompt-injection drill across crawled content, reviews and research fixtures", why: "Phase 1 crawler not built" },
  { id: "E-drills", what: "backup restore, account-recovery and model-failover drills executed and recorded", why: "not executed" },
]);

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");

export function renderReport({ target, phase, tree, branch, startedAt, meta, results, verdictOut, artifact }) {
  const lines = [];
  lines.push(`# DONE — ${target === "phase" ? `Phase ${phase}` : "ENGINE"} — ${verdictOut.ok ? "COMPLETE" : "INCOMPLETE"}`);
  lines.push("");
  lines.push(`- target: \`${target}\``);
  lines.push(`- tree: \`${tree}\``);
  lines.push(`- branch: \`${branch}\``);
  lines.push(`- started: ${startedAt}`);
  lines.push(`- authority: DONE.md §3 — this file is the checker's output, re-measured; it reads no report or ledger row as evidence`);
  lines.push("");
  lines.push("## Meta-check");
  lines.push("");
  lines.push(`${meta.ok ? "ok  " : "FAIL"} ${meta.reason}`);
  lines.push("");
  lines.push("## Conditions");
  lines.push("");
  lines.push("| # | condition | status | command | observed |");
  lines.push("|---|---|---|---|---|");
  for (const r of results) {
    lines.push(`| ${cell(r.id)} | ${cell(r.title)} | **${r.status}** | ${r.command ? `\`${cell(r.command)}\`` : "—"} | ${cell(r.observed)} |`);
    for (const s of r.sub ?? []) {
      lines.push(`| ↳ ${cell(s.id)} | ${cell(s.title)} | **${s.status}** | ${s.command ? `\`${cell(s.command)}\`` : "—"} | ${cell(s.observed)} |`);
    }
  }
  lines.push("");
  if (verdictOut.ok) {
    lines.push("## Completion");
    lines.push("");
    lines.push(completionSentence(target, tree, artifact ?? "(no cross-family artifact)"));
  } else {
    lines.push("## Status");
    lines.push("");
    lines.push(`**INCOMPLETE — ${verdictOut.failing.length} failing:** ${verdictOut.failing.join(", ")}`);
    lines.push("");
    lines.push("This is a status update, not a completion claim (DONE.md §3).");
  }
  lines.push("");
  return lines.join("\n");
}
