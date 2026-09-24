#!/usr/bin/env node
/** `npm run done -- <phase|engine>` — DONE.md §3, the mechanical declaration.
 *
 * This file is WIRING. Every decision lives in done-lib.mjs, where the default
 * suite drives it (R14-06). It re-measures every condition by running the
 * command that proves it; it reads no cached result, report or ledger row as
 * evidence; it refuses a dirty tree or a mid-harness marker; it prints a
 * per-condition table; it is meta-checked before it prints a verdict; and it
 * writes `reports/DONE_<phase>_<tree>.md`.
 *
 * WHAT IT WRITES, AND WHY THAT IS SAFE. Two things: the report under
 * `reports/` (outside the verified tree — a report cannot invalidate itself),
 * and, during its meta-check only, an UNTRACKED failing test file that is
 * removed on every exit path. It never rewrites a tracked file, so a crash
 * leaves at worst an untracked canary — visible in `git status`, refused by
 * the next run's pre-flight, and removed by `removeStaleCanary()` at start.
 *
 * ASYNC ONLY. No synchronous process API is referenced here, so a SIGINT is
 * serviced between steps, the running child is signalled by process group, and
 * the canary is removed (blocking-calls.ts; the R9-03 lesson). */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  ENGINE_REQUIREMENTS,
  PHASE0_REQUIREMENTS,
  gateAck,
  class2Condition,
  isNonClaudeFamily,
  lintCondition,
  metaVerdict,
  mutateCondition,
  parseArgs,
  parseMutate,
  parseOwed,
  parseVitest,
  preflightRefusals,
  renderReport,
  reportPath,
  reviewerFamily,
  splitReportsByFamily,
  verdict,
} from "./done-lib.mjs";
import { VERIFIED_TREE_SCOPE, checkAdversaryReport, checkClass2Approvals, codeownersCovers, isClass2, selectApprovalDocs, selectPhaseReports } from "./gate-lib.mjs";
import { parseNameStatusZ } from "./diff-lib.mjs";
import { createHash } from "node:crypto";
import { MARKER } from "./mutate-lib.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const REPO = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const VITEST = `${ROOT}/node_modules/vitest/vitest.mjs`;
const TSC = `${ROOT}/node_modules/typescript/bin/tsc`;
/** Untracked, planted only during the meta-check, removed on every exit. */
const CANARY = `${ROOT}/engine/test/zz-done-meta-canary.test.ts`;
const REFUSAL_CANARY = `${REPO}/.done-refusal-canary`;
const SEEDS = [7, 42, 1234, 2026, 9001];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  /** THE CHECKER NEVER NESTS. Measured 2026-09-20: with the pre-flight exit
   * mutated away (DN-14), the integration test that executes this file made
   * it proceed into its meta-check, which ran the suite, which ran that test,
   * which spawned this file again — five levels deep and growing, each
   * planting canaries in the tree. R10-05's hazard, on the completion checker.
   * So the first thing this file does, before parsing arguments, is refuse to
   * exist inside a vitest worker or inside another `done` run. Every child it
   * spawns inherits the marker. This is not a check on the recursion; it
   * removes the capability. */
  if (process.env.VITEST || process.env.FULLBURN_DONE_ACTIVE) {
    console.error("DONE: REFUSED — the completion checker does not run inside a test worker or inside another done run");
    process.exit(2);
  }
  const CHILD_ENV = { ...process.env, FULLBURN_DONE_ACTIVE: "1" };
  let current = null;

  /** Everything this checker may have planted. Called at start (recovery from
   * a crashed run) and on every exit path. Removes; never rewrites. */
  const removeStaleCanary = () => {
    let removed = [];
    for (const p of [CANARY, REFUSAL_CANARY]) {
      if (existsSync(p)) {
        rmSync(p, { force: true });
        removed.push(p);
      }
    }
    return removed;
  };
  process.on("exit", () => removeStaleCanary());
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      if (current?.pid) {
        try {
          process.kill(-current.pid, sig);
        } catch {}
      }
      removeStaleCanary();
      console.error(`\n${sig}: stopped; canaries removed. No verdict.`);
      process.exit(130);
    });
  }

  /** Run a command asynchronously in its own process group, capturing output. */
  const run = (cmd, args, { cwd = ROOT, input = null } = {}) =>
    new Promise((res) => {
      const child = spawn(cmd, args, { cwd, env: CHILD_ENV, stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"], detached: true });
      current = child;
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("close", (code) => {
        current = null;
        res({ code: code ?? 1, out, err });
      });
      child.on("error", (e) => {
        current = null;
        res({ code: 1, out, err: String(e) });
      });
      if (input !== null) {
        child.stdin.end(input);
      }
    });
  const git = (args, opts = {}) => run("git", ["-C", REPO, ...args], opts);
  const show = (cmd, args) => `${cmd} ${args.join(" ")}`;

  const main = async () => {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.error) {
      console.error(parsed.error);
      process.exit(2);
    }
    const { target, skipMutate } = parsed;
    const startedAt = new Date().toISOString();
    const phase = readFileSync(`${ROOT}/PHASE`, "utf8").trim();

    const recovered = removeStaleCanary();
    if (recovered.length > 0) console.log(`RECOVERED  a previous run left ${recovered.join(", ")}; removed before starting`);

    // ── PRE-FLIGHT ──────────────────────────────────────────────────────────
    const porcelain = (await git(["status", "--porcelain"])).out;
    const refusals = preflightRefusals({ porcelain, markerExists: existsSync(MARKER) });
    if (refusals.length > 0) {
      console.error("DONE: REFUSED\n  " + refusals.join("\n  "));
      process.exit(2);
    }
    const listing = (await git(["ls-files", "-s", "--", ...VERIFIED_TREE_SCOPE])).out;
    const tree = (await git(["hash-object", "--stdin"], { input: listing })).out.trim();
    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).out.trim();
    console.log(`DONE ${target} — tree ${tree} on ${branch}\n`);

    // ── META-CHECK ──────────────────────────────────────────────────────────
    console.log("META-CHECK — the checker must be able to refuse, and to see a failure\n");
    writeFileSync(REFUSAL_CANARY, "planted by done.mjs meta-check; safe to delete\n");
    const refusalTriggered = preflightRefusals({ porcelain: (await git(["status", "--porcelain"])).out, markerExists: false }).length > 0;
    rmSync(REFUSAL_CANARY, { force: true });
    console.log(`  ${refusalTriggered ? "ok  " : "FAIL"} an untracked file makes pre-flight refuse`);

    const suiteStatus = async () => {
      const r = await run("node", [VITEST, "run", "--reporter=dot"]);
      const p = parseVitest(r.out + r.err);
      return p && p.failed === 0 && r.code === 0 ? "PASS" : "FAIL";
    };
    const before = await suiteStatus();
    writeFileSync(CANARY, 'import { it, expect } from "vitest";\nit("done.mjs meta-check canary — must fail", () => { expect(1).toBe(2); });\n');
    const after = await suiteStatus();
    rmSync(CANARY, { force: true });
    console.log(`  ${before === "PASS" ? "ok  " : "FAIL"} suite condition before the canary: ${before}`);
    console.log(`  ${after === "FAIL" ? "ok  " : "FAIL"} suite condition with a planted failing test: ${after}`);
    const meta = metaVerdict({ refusalTriggered, before, after });
    console.log(`\n${meta.ok ? "ok  " : "FAIL"} ${meta.reason}\n`);

    // ── CONDITIONS ──────────────────────────────────────────────────────────
    const results = [];
    const vit = async (args) => {
      const r = await run("node", [VITEST, "run", "--reporter=dot", ...args]);
      const p = parseVitest(r.out + r.err);
      const ok = p !== null && p.failed === 0 && r.code === 0;
      return { status: ok ? "PASS" : "FAIL", observed: p ? `${p.passed} passed, ${p.failed} failed (${p.total})` : `unparseable output (exit ${r.code})` };
    };

    if (!meta.ok) {
      results.push({ id: "META", title: "the checker's own meta-check", status: "FAIL", command: "done.mjs meta-check", observed: meta.reason });
    } else {
      // 1 — requirements exercised by execution
      const sub = [];
      for (const req of PHASE0_REQUIREMENTS) {
        if (req.command === null) {
          sub.push({ id: req.id, title: req.what, status: "FAIL", command: null, observed: `NOT MEASURABLE IN THIS ENVIRONMENT: ${req.why}` });
          continue;
        }
        const r = await vit(req.command.slice(1));
        sub.push({ id: req.id, title: req.what, status: r.status, command: show("vitest", req.command.slice(1)), observed: r.observed });
      }
      results.push({ id: "C1", title: "§2.1.1 every deliverable and AC exercised by execution", status: sub.every((s) => s.status === "PASS") ? "PASS" : "FAIL", command: null, observed: `${sub.filter((s) => s.status === "PASS").length}/${sub.length} requirements exercised and passing`, sub });

      // 2 & 3 — adversary rounds bound to THIS tree
      const reportsDir = `${ROOT}/reports`;
      const names = existsSync(reportsDir) ? selectPhaseReports(phase, readdirSync(reportsDir)) : [];
      const reports = names.map((n) => ({ name: n, content: readFileSync(`${reportsDir}/${n}`, "utf8") }));
      const { same: sameFamily, cross } = splitReportsByFamily(reports);
      const same = sameFamily.length === 0 ? { ok: false, reason: "no same-family report under reports/" } : checkAdversaryReport({ phase, reports: sameFamily, currentTreeHash: tree });
      results.push({ id: "C2", title: "§2.1.2 same-family adversary round PASS against this tree", status: same.ok ? "PASS" : "FAIL", command: `checkAdversaryReport(phase ${phase}, ${reports.length} report(s), tree ${tree.slice(0, 12)})`, observed: same.reason });
      let crossRes;
      let artifact = null;
      if (cross.length === 0) {
        crossRes = { ok: false, reason: `no report under reports/ carries a \`Reviewer-family:\` line naming a non-Claude family (${reports.length} report(s) read)` };
      } else {
        crossRes = checkAdversaryReport({ phase, reports: cross, currentTreeHash: tree });
        if (crossRes.ok) artifact = `reports/${cross.find((r) => checkAdversaryReport({ phase, reports: [r], currentTreeHash: tree }).ok)?.name}`;
      }
      results.push({ id: "C3", title: "§2.1.3 cross-family read PASS against the SAME tree, artifact committed", status: crossRes.ok ? "PASS" : "FAIL", command: `checkAdversaryReport(non-Claude reports only, tree ${tree.slice(0, 12)})`, observed: crossRes.reason });

      // 4 — zero open findings
      const approvalsDir = `${ROOT}/APPROVALS`;
      const deferrals = existsSync(approvalsDir)
        ? readdirSync(approvalsDir).flatMap((n) => [...readFileSync(`${approvalsDir}/${n}`, "utf8").matchAll(/^defer-finding:\s*(\S+)/gm)].map((m) => `${m[1]} (${n})`))
        : [];
      const c4ok = same.ok && crossRes.ok;
      results.push({ id: "C4", title: "§2.1.4 zero open findings at any severity (deferrals only by a written ruling in APPROVALS/)", status: c4ok ? "PASS" : "FAIL", command: "derived from C2 ∧ C3; APPROVALS/*.md scanned for `defer-finding:` lines", observed: c4ok ? `no open findings; deferrals: ${deferrals.length ? deferrals.join(", ") : "none"}` : `a round against this tree is not PASS, so findings are open; deferrals on file: ${deferrals.length ? deferrals.join(", ") : "none"}` });

      // 5 — mutation harness, meta-checked in the same run
      if (skipMutate) {
        results.push({ id: "C5", title: "§2.1.5 mutation harness: 0 survived, 0 stale, meta-check passed in the same run", status: "FAIL", command: "npm run mutate", observed: "NOT MEASURED — skipped by --skip-mutate; this flag can never make C5 pass" });
      } else {
        console.log("running the mutation harness (this takes ~50 minutes)…");
        const r = await run("node", [`${ROOT}/engine/scripts/mutate.mjs`]);
        const mc = mutateCondition(parseMutate(r.out + r.err), r.code);
        results.push({ id: "C5", title: "§2.1.5 mutation harness: 0 survived, 0 stale, meta-check passed in the same run", status: mc.status, command: "node engine/scripts/mutate.mjs", observed: mc.observed });
      }

      // 6 — the guard sweep
      const c6 = await vit(["engine/test/invariants/invariants.test.ts", "-t", "every money-path guard is still reachable"]);
      results.push({ id: "C6", title: "§2.1.6 guard population enumerated from source, one-to-one coverage, every guard driven", status: c6.status, command: "vitest run engine/test/invariants -t 'every money-path guard is still reachable'", observed: `${c6.observed}; the 'disabled individually and caught' half is C5's per-guard entries` });

      // 7 — suite under ≥5 seeds, typecheck, lint, leak-check, drill
      const sub7 = [];
      for (const seed of SEEDS) {
        const r = await vit(["--sequence.shuffle", `--sequence.seed=${seed}`]);
        sub7.push({ id: `C7-seed-${seed}`, title: `full suite, shuffled seed ${seed}`, status: r.status, command: `vitest run --sequence.shuffle --sequence.seed=${seed}`, observed: r.observed });
      }
      const tsc = await run("node", [TSC, "-p", `${ROOT}/tsconfig.json`, "--noEmit"]);
      sub7.push({ id: "C7-typecheck", title: "typecheck", status: tsc.code === 0 ? "PASS" : "FAIL", command: "tsc -p tsconfig.json --noEmit", observed: tsc.code === 0 ? "clean" : (tsc.out + tsc.err).trim().split("\n").slice(0, 3).join(" | ") });
      const lintConfigured = existsSync(`${ROOT}/eslint.config.mjs`) && typeof JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")).scripts?.lint === "string";
      const lint = lintConfigured ? await run("node", [`${ROOT}/node_modules/eslint/bin/eslint.js`, "."]) : { code: null, out: "", err: "" };
      const lc = lintCondition({ configured: lintConfigured, code: lint.code, out: lint.out + lint.err });
      sub7.push({ id: "C7-lint", title: "lint (eslint, type-aware — human ruling 2026-09-22)", status: lc.status, command: lintConfigured ? "npm run lint" : null, observed: lc.observed });
      const leak = await run("node", [`${ROOT}/engine/scripts/leak-check.mjs`, REPO]);
      sub7.push({ id: "C7-leak", title: "leak + structural scan (advisory secrets, primary structure — L36)", status: leak.code === 0 ? "PASS" : "FAIL", command: "node engine/scripts/leak-check.mjs <repo>", observed: (leak.out + leak.err).trim().split("\n")[0] ?? "" });
      const drill = await run("node", [VITEST, "run", "--config", `${ROOT}/vitest.drill.config.ts`, "--reporter=dot"]);
      const dp = parseVitest(drill.out + drill.err);
      sub7.push({ id: "C7-drill", title: "SIGINT drill: no source file mutated after the signal", status: dp && dp.failed === 0 && drill.code === 0 ? "PASS" : "FAIL", command: "vitest run --config vitest.drill.config.ts", observed: dp ? `${dp.passed} passed, ${dp.failed} failed` : `unparseable (exit ${drill.code})` });
      results.push({ id: "C7", title: "§2.1.7 suite green under ≥5 seeds; typecheck, lint, leak-check clean; SIGINT drill", status: sub7.every((s) => s.status === "PASS") ? "PASS" : "FAIL", command: null, observed: `${sub7.filter((s) => s.status === "PASS").length}/${sub7.length} sub-conditions passing`, sub: sub7 });

      // 8 — Class-2 approvals, CODEOWNERS 100%, authenticated identity
      const sub8 = [];
      const base = (await git(["merge-base", "origin/main", "HEAD"])).out.trim();
      if (!base) {
        sub8.push({ id: "C8-owed", title: "Class-2 approvals owed in this phase's commit range", status: "FAIL", command: "git merge-base origin/main HEAD", observed: "no merge-base with origin/main — the commit range cannot be determined" });
      } else {
        /** X-12 (cross-family, 2026-09-24): this row passed only when the
         * number of Class-2 TRANSITIONS was zero — a fully approved phase with
         * any Class-2 change failed it. The decision is the class-2 gate's own
         * `checkClass2Approvals`, fed exactly as class2-gate.mjs feeds it; the
         * owed count is reported alongside as information. */
        const owed = await run("node", [`${ROOT}/engine/scripts/owed-approvals.mjs`, REPO, base]);
        const n = parseOwed(owed.out);
        const diffZ = (await git(["diff", "--name-status", "-z", "-M", `${base}...HEAD`])).out;
        const changedFiles = parseNameStatusZ(diffZ);
        const sha = (buf) => createHash("sha256").update(buf).digest("hex");
        const approvalDocs = [];
        for (const f of selectApprovalDocs(changedFiles)) {
          approvalDocs.push({ path: f.path, status: f.status, content: readFileSync(`${REPO}/${f.path}`, "utf8"), authoredBy: (await git(["log", "-1", "--format=%an <%ae>", "--", f.path])).out.trim() });
        }
        const baseBlobs = new Map();
        for (const f of changedFiles) {
          const r = await git(["show", `${base}:${f.path}`]);
          if (r.code === 0) baseBlobs.set(f.path, sha(Buffer.from(r.out, "utf8")));
        }
        const c2 = checkClass2Approvals({
          changedFiles,
          approvalDocs,
          hashOf: (p) => sha(readFileSync(`${REPO}/${p}`)),
          baseHashOf: (p) => baseBlobs.get(p) ?? sha(Buffer.alloc(0)),
          baseCommit: base,
        });
        const c8 = class2Condition(c2, n);
        sub8.push({ id: "C8-owed", title: `Class-2 approvals against base ${base.slice(0, 12)} — the class-2 gate's own decision`, status: c8.status, command: `checkClass2Approvals(diff ${base.slice(0, 12)}...HEAD, APPROVALS/)`, observed: c8.observed });
      }
      const tracked = (await git(["ls-files"])).out.split("\n").filter((p) => p.length > 0);
      const owners = readFileSync(`${REPO}/.github/CODEOWNERS`, "utf8");
      const class2 = tracked.filter((p) => isClass2(p));
      const unowned = class2.filter((p) => !codeownersCovers(p, owners));
      sub8.push({ id: "C8-codeowners", title: "CODEOWNERS covers 100% of tracked Class-2 files", status: unowned.length === 0 && class2.length > 0 ? "PASS" : "FAIL", command: "git ls-files | isClass2 | codeownersCovers", observed: `${class2.length - unowned.length}/${class2.length} covered${unowned.length ? `; unowned: ${unowned.slice(0, 5).join(", ")}` : ""}` });
      sub8.push({ id: "C8-identity", title: "approvals authored and pushed by Sheldon's authenticated identity through a CODEOWNERS-gated PR; CI fails closed on a CODEOWNERS touch", status: "FAIL", command: null, observed: "NOT MEASURABLE IN THIS ENVIRONMENT: requires branch protection (main is unprotected — L37) and a merged PR; no API surface here" });
      results.push({ id: "C8", title: "§2.1.8 every Class-2 path approved under the human's identity, CODEOWNERS 100%, CI fails closed", status: sub8.every((s) => s.status === "PASS") ? "PASS" : "FAIL", command: null, observed: `${sub8.filter((s) => s.status === "PASS").length}/${sub8.length} sub-conditions passing`, sub: sub8 });

      // 9 — ledger rows carry tests
      const c9 = await vit(["engine/test/invariants/invariants.test.ts", "-t", "every behavioural claim in the ledger still holds"]);
      results.push({ id: "C9", title: "§2.1.9 every ledger/CLAUDE.md behavioural row carries a test that fails when stale", status: c9.status, command: "vitest run engine/test/invariants -t 'every behavioural claim in the ledger still holds'", observed: c9.observed });

      // 10 — gate ack
      const ackPath = `${ROOT}/APPROVALS/GATE_ACK_phase${phase}.md`;
      const ack = existsSync(ackPath) ? gateAck(readFileSync(ackPath, "utf8"), tree) : { ok: false, reason: `${ackPath.replace(ROOT + "/", "")} does not exist — no ack, no completion; silence is not consent` };
      results.push({ id: "C10", title: "§2.1.10 explicit written gate ack from the human, naming this tree", status: ack.ok ? "PASS" : "FAIL", command: `APPROVALS/GATE_ACK_phase${phase}.md: tree: <hash>, ack: yes`, observed: ack.reason });

      if (target === "engine") {
        for (let p = 0; p <= 7; p++) {
          if (String(p) === phase) continue;
          results.push({ id: `E-phase${p}`, title: `§2.2 phase ${p} PHASE COMPLETE`, status: "FAIL", command: null, observed: `NOT STARTED — PHASE reads ${phase}` });
        }
        for (const e of ENGINE_REQUIREMENTS) {
          results.push({ id: e.id, title: `§2.2 ${e.what}`, status: "FAIL", command: null, observed: `NOT MEASURABLE / NOT BUILT: ${e.why}` });
        }
      }
    }

    // ── VERDICT, TABLE, REPORT ──────────────────────────────────────────────
    const v = verdict(results);
    const artifact = results.find((r) => r.id === "C3" && r.status === "PASS") ? results.find((r) => r.id === "C3").observed : null;
    console.log("| # | condition | status | observed |");
    console.log("|---|---|---|---|");
    for (const r of results) {
      console.log(`| ${r.id} | ${r.title} | ${r.status} | ${String(r.observed).split("\n")[0]} |`);
      for (const s of r.sub ?? []) console.log(`|   ↳ ${s.id} | ${s.title} | ${s.status} | ${String(s.observed).split("\n")[0]} |`);
    }
    const md = renderReport({ target, phase, tree, branch, startedAt, meta, results, verdictOut: v, artifact });
    const out = `${ROOT}/${reportPath(target, phase, tree)}`;
    mkdirSync(`${ROOT}/reports`, { recursive: true });
    writeFileSync(out, md);
    console.log(`\nreport: ${out.replace(ROOT + "/", "")}`);
    if (v.ok) {
      console.log(`\n${md.split("## Completion\n\n")[1]?.trim()}`);
      process.exit(0);
    }
    console.log(`\nINCOMPLETE — ${v.failing.length} failing: ${v.failing.join(", ")}\nThis is a status update, not a completion claim (DONE.md §3).`);
    process.exit(1);
  };

  main().catch((e) => {
    removeStaleCanary();
    console.error(`done.mjs crashed: ${e?.stack ?? e}`);
    process.exit(1);
  });
}
