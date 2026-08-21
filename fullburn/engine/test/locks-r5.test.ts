import { describe, expect, it } from "vitest";
import { CapError, assertCapsUsable, getCaps } from "@fullburn/config/caps";
import { GOLDEN_SET_CASE_IDS, attestEvalRun } from "@fullburn/config/models";
import { GOLDEN } from "../evals/genome-tagger/golden.ts";
import { RECORDED_LLAMA_70B, RECORDED_QWEN_72B } from "../evals/genome-tagger/recorded-outputs.ts";
import { RecordedTransport, runEval } from "../src/eval-harness.ts";
import { computeGrades, type MetricSnapshot } from "../src/grade-registry.ts";
import { llm } from "../src/gateway.ts";
import { MemorySpendMeter } from "../src/spend-meter.ts";
import { TraceContext } from "../src/tracing.ts";
import { redactValue } from "../src/redact.ts";
import { ROLE_BINDINGS } from "@fullburn/config/models";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { checkClass2Approvals, checkReportsAppendOnly, isClass2 } from "../scripts/gate-lib.mjs";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { parseNameStatus, parseNameStatusZ } from "../scripts/diff-lib.mjs";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { scanContent } from "../scripts/scan-lib.mjs";
import { CANARY_SECRET, TEST_CLIENT, capsOf, fixedCaps, makeDeps, memoryMeter, testClock } from "./helpers.ts";

/** LOCK TESTS — r5. Each was written against a specific one-line revert and
 * verified to fail with that revert applied. Covers the r3 findings this pass
 * fixed, plus the r2/r4 fixes the r3 review found shipping with no test at all
 * (H-05, H-07, H-09, H-10, H-11, H-12, R3-CP-07, DT-04). */

describe("eval harness — a golden set must actually assert something (DT-01, H-05)", () => {
  // MUTATION: drop the required-fields check from runEval.
  it("a case with empty expectations is refused, not scored 1.0", async () => {
    const { deps } = makeDeps();
    const hollow = GOLDEN.map((c) => ({ ...c, expected: {} }));
    await expect(
      runEval(deps, "genome-tagger", "llama-70b", hollow, new RecordedTransport(RECORDED_LLAMA_70B), TEST_CLIENT),
    ).rejects.toThrow(/must assert exactly the fields/);
  });

  // MUTATION: same. A narrowed set is the subtler half of DT-01.
  it("a case narrowed to the one field a weak model gets right is refused", async () => {
    const { deps } = makeDeps();
    const narrowed = GOLDEN.map((c) => ({ ...c, expected: { angle: c.expected["angle"] } }));
    await expect(
      runEval(deps, "genome-tagger", "llama-70b", narrowed, new RecordedTransport(RECORDED_LLAMA_70B), TEST_CLIENT),
    ).rejects.toThrow(/must assert exactly the fields/);
  });

  // MUTATION: remove the declared-case-id check in runEval or attestEvalRun.
  it("a substituted golden set with different ids is refused", async () => {
    const { deps } = makeDeps();
    const swapped = GOLDEN.slice(0, 2).map((c, i) => ({ ...c, id: `x${i}` }));
    await expect(
      runEval(deps, "genome-tagger", "llama-70b", swapped, new RecordedTransport(RECORDED_LLAMA_70B), TEST_CLIENT),
    ).rejects.toThrow(/declared on its role card/);
    expect(() => attestEvalRun("genome-tagger", "qwen-72b", [{ caseId: "g1", passed: true }])).toThrow(/declared golden set/);
  });

  // MUTATION: revert RecordedTransport to prototype-chain lookup (H-12).
  it("a polluted prototype cannot supply a recording the candidate never gave", async () => {
    // qwen answers g1–g4 correctly, so with g5's recording removed the honest
    // score is exactly 4/5. Prototype-chain lookup would hand it the missing
    // recording and score 5/5 — the assertion has to discriminate those two,
    // not merely observe that something failed.
    const g5 = GOLDEN.find((c) => c.id === "g5")!.expected;
    const proto = Object.prototype as unknown as Record<string, unknown>;
    proto["g5"] = { ...g5 };
    try {
      const { deps } = makeDeps();
      const partial = { ...RECORDED_QWEN_72B, g5: { ...g5 } };
      delete (partial as Record<string, unknown>)["g5"];
      const res = await runEval(deps, "genome-tagger", "qwen-72b", GOLDEN, new RecordedTransport(partial), TEST_CLIENT);
      expect(res.passed).toBe(4);
      expect(res.failures.join(" ")).toContain("g5");
    } finally {
      delete proto["g5"];
    }
  });

  it("every role that declares case ids has a golden set with those exact ids (DT-02)", async () => {
    const sets: Record<string, readonly { id: string }[]> = {
      "genome-tagger": (await import("../evals/genome-tagger/golden.ts")).GOLDEN,
      "hello-world": (await import("../evals/hello-world/golden.ts")).GOLDEN,
      "creative-decision-adversary": (await import("../evals/creative-decision-adversary/golden.ts")).GOLDEN,
    };
    for (const [role, ids] of Object.entries(GOLDEN_SET_CASE_IDS)) {
      expect(sets[role], `role "${role}" declares case ids but has no golden set`).toBeDefined();
      expect(sets[role]!.map((c) => c.id).sort()).toEqual([...ids].sort());
    }
  });
});

describe("grade registry — the finiteness and domain guards (H-07, DT-03)", () => {
  const A: MetricSnapshot = {
    "wordpress-seo": {
      organic_clicks_vs_baseline_pct: 18,
      cwv_pass_rate_pct: 86,
      indexation_health_pct: 98,
      mutations_reversible_pct: 100,
      verdicts_before_window_close: 0,
    },
    "marketing-engine": {
      cac_beats_baseline_by_day_90: true,
      blended_roas: 5.1,
      reconciliation_drift_pct: 1.3,
      cap_breaches: 0,
      policy_strikes: 0,
    },
  };

  // MUTATION: drop Number.isFinite from isUsableReading.
  it("+Infinity cannot satisfy a >= threshold in ANY area", () => {
    for (const [area, key] of [
      ["wordpress-seo", "cwv_pass_rate_pct"],
      ["wordpress-seo", "indexation_health_pct"],
      ["marketing-engine", "blended_roas"],
    ] as const) {
      const spoofed = { ...A, [area]: { ...A[area]!, [key]: Number.POSITIVE_INFINITY } };
      const g = computeGrades(spoofed).find((x) => x.area === area)!;
      expect(g.failing, `${area}.${key} accepted Infinity`).toContain(key);
    }
  });

  /** DT-04(a): the R2-20 lock only ever perturbed two `<` metrics whose
   * `domainMin` caught the value first, so `Number.isFinite` was never
   * consulted and the guard could be deleted with the suite green.
   *
   * Being honest about what still bites: now that every ordered metric declares
   * its fail-open-side bound, `inDomain` alone stops ±Infinity. What `inDomain`
   * does NOT stop is a non-number, and warehouse readings are not typed at the
   * boundary — `"1" < 2` is true, so a string drift of "1" grades A with the
   * `typeof` half removed. That is the branch this drives.
   *
   * MUTATION: drop `typeof actual === "number"` from isUsableReading. */
  it("a non-numeric reading never satisfies an ordered threshold", async () => {
    const { GRADE_AREAS } = await import("@fullburn/config/grade-thresholds");
    let checked = 0;
    for (const area of GRADE_AREAS) {
      for (const m of area.metrics) {
        if (m.op !== "<" && m.op !== "<=" && m.op !== ">=") continue;
        // A value that genuinely satisfies the threshold and sits inside the
        // declared domain — so only its TYPE can disqualify it.
        const legal = m.op === ">=" ? (m.value as number) : (m.value as number) - 1;
        for (const corrupt of [String(legal), null, [legal], {}, true] as unknown[]) {
          const g = computeGrades({ [area.area]: { [m.key]: corrupt } } as unknown as MetricSnapshot).find(
            (x) => x.area === area.area,
          )!;
          expect(
            g.failing,
            `${area.area}.${m.key} accepted ${JSON.stringify(corrupt)} (typeof ${typeof corrupt})`,
          ).toContain(m.key);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  /** The bound that matters is the one on the side the comparison lets through.
   * `Number.isFinite` already kills ±Infinity, so the surviving fail-open shape
   * is a FINITE absurdity pointing the way the operator does not look: a `<`
   * threshold is satisfied by -1e12 drift, a `>=` threshold by 1e12 ROAS. The
   * opposite bound is decoration — a `<` metric reading 1e12 already fails.
   * Asserting both would have passed for the wrong reason on half the registry,
   * so this walks the real registry and drives each metric through
   * `computeGrades` instead of inspecting the declaration.
   *
   * MUTATION: delete `inDomain` from any branch of `metricPasses`, or drop the
   * fail-open-side bound from any ordered metric in grade-thresholds.ts. */
  it("no ordered metric can be graded A by a finite absurdity", async () => {
    const { GRADE_AREAS } = await import("@fullburn/config/grade-thresholds");
    let checked = 0;
    for (const area of GRADE_AREAS) {
      for (const m of area.metrics) {
        // The value that satisfies the comparison while being impossible.
        const absurd = m.op === ">=" ? 1e12 : m.op === "<" || m.op === "<=" ? -1e12 : undefined;
        if (absurd === undefined) continue; // == / ==0 / ==true are immune by construction.
        const bound = m.op === ">=" ? m.domainMax : m.domainMin;
        expect(bound, `${area.area}.${m.key} declares no bound on its fail-open side`).toBeTypeOf("number");
        // Only the metric under test is supplied: the rest land in `missing`,
        // which never masks a `failing` entry.
        const g = computeGrades({ [area.area]: { [m.key]: absurd } }).find((x) => x.area === area.area)!;
        expect(g.failing, `${area.area}.${m.key} graded ${absurd} as passing`).toContain(m.key);
        checked += 1;
      }
    }
    // Guards the loop itself: a registry that stopped declaring ordered metrics
    // would otherwise make this test vacuously green.
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  // MUTATION: remove domainMax from blended_roas / bounds from organic clicks.
  it("an absurd but finite reading is out of domain, not an A", () => {
    const roas = { ...A, "marketing-engine": { ...A["marketing-engine"]!, blended_roas: Number.MAX_VALUE } };
    expect(computeGrades(roas).find((x) => x.area === "marketing-engine")!.failing).toContain("blended_roas");
    const clicks = { ...A, "wordpress-seo": { ...A["wordpress-seo"]!, organic_clicks_vs_baseline_pct: 1e12 } };
    expect(computeGrades(clicks).find((x) => x.area === "wordpress-seo")!.failing).toContain(
      "organic_clicks_vs_baseline_pct",
    );
  });
});

describe("class-2 protection — every pattern is load-bearing under test (H-03)", () => {
  /** H-03: eight of thirteen CLASS2_PATTERNS could be replaced with
   * `/^__never__$/` and the whole suite stayed green — the money-path sources,
   * the gate scripts, `.github/`, the Laws and the adversary's own mandate
   * among them. The tests pointed at `CLASS2_FILES`, a list demoted to
   * decoration when `isClass2` became the authority. That list is now gone;
   * these two assertions close the loop in both directions.
   *
   * MUTATION: neuter ANY entry of CLASS2_PATTERNS, or add a pattern with no
   * witness path. */
  it("every witness path is Class 2, and every pattern claims a witness", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { CLASS2_PATTERNS, CLASS2_WITNESS_PATHS, isClass2 } = await import("../scripts/gate-lib.mjs");
    for (const p of CLASS2_WITNESS_PATHS as string[]) {
      expect(isClass2(p), `${p} is declared Class 2 but no pattern matches it`).toBe(true);
    }
    for (const re of CLASS2_PATTERNS as RegExp[]) {
      const claimed = (CLASS2_WITNESS_PATHS as string[]).filter((p) => re.test(p));
      expect(claimed.length, `pattern ${re} protects no witness path — it is untested or dead`).toBeGreaterThan(0);
    }
  });

  /** The constitution is the set an attacker most wants Class 1: the Laws, the
   * spec, the adversary's own mandate, the money paths, the grader, and the
   * gates that judge all of it. Named explicitly so removing a broad pattern
   * cannot be papered over by a narrower one. */
  it("the constitution, the money paths, the grader and the gates are all Class 2", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { isClass2 } = await import("../scripts/gate-lib.mjs");
    for (const p of [
      "fullburn/CLAUDE.md",
      "fullburn/ENGINE_BUILD.md",
      "fullburn/.claude/agents/engine-adversary.md",
      "fullburn/.claude/settings.json",
      "fullburn/engine/src/gateway.ts",
      "fullburn/engine/src/spend-meter.ts",
      "fullburn/engine/src/index.ts",
      "fullburn/engine/src/grade-registry.ts",
      "fullburn/config/src/caps.ts",
      "fullburn/config/src/grade-thresholds.ts",
      ".github/workflows/fullburn-ci.yml",
      "fullburn/engine/scripts/gate-lib.mjs",
      "fullburn/engine/scripts/class2-gate.mjs",
      "fullburn/engine/evals/hello-world/golden.ts",
      "fullburn/.gitignore",
    ]) {
      expect(isClass2(p), `${p} is NOT Class 2`).toBe(true);
    }
    // And the negative half: a genuinely Class-1 path must not need approval,
    // or the gate becomes noise a human learns to click through.
    for (const p of ["fullburn/HUMAN_TASKS.md", "fullburn/reports/ADVERSARY_REPORT_phase0.md", "README.md"]) {
      expect(isClass2(p), `${p} was classified Class 2`).toBe(false);
    }
  });
});

describe("owed approvals — the list a human signs is the list the gate demands (H-17)", () => {
  /** H-17: HUMAN_TASKS.md carried the owed set by hand and drifted in both
   * directions inside one commit — two paths that were never touched, eleven
   * touched paths deferred to "future PRs". The human would sha256sum a set
   * that was not the set they changed. The list is now printed by
   * `owed-approvals.mjs` from `class2TouchedPaths` + `approvalTransition`, the
   * same two functions `checkClass2Approvals` enforces with.
   *
   * This asserts the property that makes that safe: approvals built from what
   * the tool prints, and ONLY those, open the gate.
   *
   * MUTATION: make owed-approvals compute its own touched list or its own
   * transition (e.g. hash a renamed-away path instead of marking it deleted). */
  it("approvals built from the printed transitions open the gate — and dropping any one closes it", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const lib = await import("../scripts/gate-lib.mjs");
    const { class2TouchedPaths, approvalTransition, checkClass2Approvals } = lib;

    const changedFiles = [
      { status: "modified", path: "fullburn/config/src/caps.ts" },
      { status: "added", path: "fullburn/engine/src/new-module.ts" },
      { status: "deleted", path: "fullburn/engine/test/old.test.ts" },
      { status: "renamed", oldPath: "fullburn/engine/src/a.ts", path: "fullburn/engine/src/b.ts" },
      { status: "modified", path: "fullburn/HUMAN_TASKS.md" }, // Class 1 — owes nothing
    ];
    const BASE = "1111111111111111111111111111111111111111";
    const hashOf = (p: string) => `now-${p}`;
    const baseHashOf = (p: string) => `base-${p}`;

    const touched = class2TouchedPaths(changedFiles) as { path: string; status: string }[];
    // The Class-1 path must not appear, or the human signs work they did not do.
    expect(touched.map((t) => t.path)).not.toContain("fullburn/HUMAN_TASKS.md");
    // A rename owes on both sides: the path it left and the path it arrived at.
    expect(touched.map((t) => `${t.path}:${t.status}`)).toEqual(
      expect.arrayContaining(["fullburn/engine/src/a.ts:renamed-away", "fullburn/engine/src/b.ts:renamed-to"]),
    );

    // Exactly what owed-approvals.mjs prints, in the format the gate parses.
    const blocks = touched.map((t: { path: string; status: string }) => {
      const { from, to } = approvalTransition(t, { hashOf, baseHashOf });
      return `approves: ${t.path}\nbase-commit: ${BASE}\nfrom-content-hash: ${from}\ncontent-hash: ${to}`;
    });
    const gate = (docs: string[]) =>
      checkClass2Approvals({
        changedFiles,
        approvalDocs: [{ path: "fullburn/APPROVALS/p.md", status: "added", content: docs.join("\n\n") }],
        hashOf,
        baseHashOf,
        baseCommit: BASE,
      });

    expect(gate(blocks).ok, `printed approvals rejected: ${gate(blocks).reason}`).toBe(true);
    expect(blocks.length).toBe(5);
    // Every printed entry is load-bearing: none is decoration a human could skip.
    for (let i = 0; i < blocks.length; i++) {
      const short = blocks.filter((_, j) => j !== i);
      const res = gate(short);
      expect(res.ok, `dropping ${touched[i]!.path} still opened the gate`).toBe(false);
      expect(res.reason).toContain(touched[i]!.path);
    }
  });
});

describe("caps — a fixture signature does not sign a real client (M-06)", () => {
  // MUTATION: drop the FIXTURE_CLIENT_PREFIX check from assertCapsUsable.
  it("the fixture marker is refused for any non-fixture client id", () => {
    const fixtureCaps = getCaps(TEST_CLIENT);
    expect(() => assertCapsUsable(fixtureCaps, TEST_CLIENT)).not.toThrow();
    expect(() => assertCapsUsable(fixtureCaps, "pulsern")).toThrow(/does not sign a real client/);
    expect(() => assertCapsUsable(fixtureCaps, "acme-corp")).toThrow(CapError);
  });
});

describe("gates — the halves that shipped untested (H-09, H-10, H-11, R3-CP-08, R3-CP-09)", () => {
  // MUTATION: remove the rename clause from checkReportsAppendOnly.
  it("a standing report cannot be renamed out of existence (H-09)", () => {
    const res = checkReportsAppendOnly([
      { status: "renamed", oldPath: "fullburn/reports/ADVERSARY_REPORT_phase0.md", path: "fullburn/reports/archive-notes.md" },
    ]);
    expect(res.ok).toBe(false);
  });

  // MUTATION: remove the added-in-this-diff filter from checkClass2Approvals.
  it("an approval already in the tree is not harvested (H-10)", () => {
    const args = {
      changedFiles: [{ status: "modified", path: "fullburn/config/src/caps.ts" }],
      hashOf: () => "new",
      baseHashOf: () => "old",
      baseCommit: "b",
    };
    const body = "approves: fullburn/config/src/caps.ts\nbase-commit: b\nfrom-content-hash: old\ncontent-hash: new";
    expect(checkClass2Approvals({ ...args, approvalDocs: [{ path: "a.md", status: "added", content: body }] }).ok).toBe(true);
    expect(checkClass2Approvals({ ...args, approvalDocs: [{ path: "a.md", status: "modified", content: body }] }).ok).toBe(false);
  });

  // MUTATION: make safeHash return "deleted" for an unreadable base again.
  it("an unreadable base is not approvable as a deletion (H-11, R3-CP-09)", () => {
    const res = checkClass2Approvals({
      changedFiles: [{ status: "modified", path: "fullburn/config/src/caps.ts" }],
      approvalDocs: [
        {
          path: "a.md",
          status: "added",
          content: "approves: fullburn/config/src/caps.ts\nbase-commit: b\nfrom-content-hash: deleted\ncontent-hash: new",
        },
      ],
      hashOf: () => "new",
      baseHashOf: () => {
        throw new Error("ENOENT");
      },
      baseCommit: "b",
    });
    expect(res.ok).toBe(false);
  });

  // MUTATION: remove unquoteGitPath / switch back to the text parser.
  it("a path git had to quote still lands inside the protected set (R3-CP-08)", () => {
    const quoted = parseNameStatus('M\t"fullburn/config/src/a b.ts"');
    expect(quoted[0].path).toBe("fullburn/config/src/a b.ts");
    expect(isClass2(quoted[0].path)).toBe(true);
    const z = parseNameStatusZ("R097 fullburn/config/src/caps.ts fullburn/config/src/caps v2.ts ");
    expect(z).toEqual([
      { status: "renamed", oldPath: "fullburn/config/src/caps.ts", path: "fullburn/config/src/caps v2.ts" },
    ]);
  });

  /** EVERY STATUS THE NUL PARSER CAN EMIT, DRIVEN.
   *
   * Only the rename branch had a test. A mutation turning a NUL-separated
   * DELETE into a "modified" survived the whole default suite (runner audit
   * entry RA-12) — and a delete read as a modification sends the Class-2 gate
   * to hash a file that is no longer there, and tells the append-only check the
   * wrong thing about what a PR did to a standing report.
   *
   * MUTATION: change any status this maps to. */
  it("every status the NUL-separated parser emits is the status git reported", () => {
    const z = (...fields: string[]) => parseNameStatusZ(fields.join(" ") + " ");
    expect(z("A", "fullburn/config/src/new.ts")).toEqual([{ status: "added", path: "fullburn/config/src/new.ts" }]);
    expect(z("D", "fullburn/reports/ADVERSARY_REPORT_phase0.md")).toEqual([
      { status: "deleted", path: "fullburn/reports/ADVERSARY_REPORT_phase0.md" },
    ]);
    expect(z("M", "fullburn/config/src/caps.ts")).toEqual([{ status: "modified", path: "fullburn/config/src/caps.ts" }]);
    // A COPY adds a new path and leaves the source untouched — so the source is
    // NOT reported as changed, and the copy is an addition.
    expect(z("C085", "fullburn/config/src/caps.ts", "fullburn/config/src/copy.ts")).toEqual([
      { status: "added", path: "fullburn/config/src/copy.ts" },
    ]);
    // Several entries in one stream, each keeping its own status and its own
    // field count — a rename consumes two paths, the others one.
    expect(z("D", "a.ts", "R100", "b.ts", "c.ts", "A", "d.ts")).toEqual([
      { status: "deleted", path: "a.ts" },
      { status: "renamed", oldPath: "b.ts", path: "c.ts" },
      { status: "added", path: "d.ts" },
    ]);
    // The consequence, driven: a deleted report is refused as a deletion.
    const deleted = checkReportsAppendOnly(z("D", "fullburn/reports/ADVERSARY_REPORT_phase0.md"));
    expect(deleted.ok, "a deleted adversary report was not refused").toBe(false);
  });
});

describe("scanner — the rules the r3 review found blind or noisy (H-02, B1, B2, B4, C3)", () => {
  const SRC = "fullburn/engine/src/thing.ts";

  // MUTATION: revert REGISTRY_INDEXING to the bracket-only regex.
  it("registry access by dot, destructuring or Object.values is caught (H-02)", () => {
    for (const code of [
      "const c = CHANNELS.google;",
      "const { tiktok } = CHANNELS;",
      "Object.values(CHANNELS).forEach(go);",
      "Object.entries(MARKETS).map(f);",
    ]) {
      expect(scanContent(SRC, code).length, code).toBeGreaterThan(0);
    }
  });

  // MUTATION: revert CODE_FILE to /\.(?:ts|tsx|mjs|js)$/.
  it("every extension that is READ is also structurally CHECKED (B1)", () => {
    for (const ext of ["cjs", "jsx", "mts", "cts"]) {
      expect(scanContent(`fullburn/engine/src/x.${ext}`, 'fetch("https://api.openai.com/v1")').length, ext).toBeGreaterThan(0);
    }
  });

  // MUTATION: revert the PEM rule to the 80-character window.
  it("armor lines and short wraps do not hide a real private key (B2)", () => {
    const armored = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "Proc-Type: 4,ENCRYPTED",
      "DEK-Info: AES-256-CBC,0123456789ABCDEF",
      'Comment: "deploy"',
      "",
      "MIIEowIBAAKCAQEAx7Vv",
      "QmFzZTY0Qm9keUhlcmU",
      "QmFzZTY0Qm9keUhlcmU",
    ].join("\n");
    expect(scanContent("fullburn/ops/key.txt", armored).length).toBeGreaterThan(0);
  });

  // MUTATION: re-add engine/evals to TEST_OR_FIXTURE.
  it("recorded fixtures are not a blanket exemption from the Laws (B4)", () => {
    expect(scanContent("fullburn/engine/evals/x/recorded.ts", 'fetch("https://api.openai.com/v1")').length).toBeGreaterThan(0);
  });

  // MUTATION: revert the prediction rule to the broad stem match.
  it("reconciliation and eval naming are not prediction gates (C3)", () => {
    for (const ok of [
      "const expectedRevenue = warehouse.actualRevenue;",
      "const estimatedRevenue = clickhouse.query('sum(revenue)');",
      "const projectedRevenue = counterfactualLedger.total();",
      "const estimatedScore = evalHarness.score();",
    ]) {
      expect(scanContent(SRC, ok), ok).toHaveLength(0);
    }
    // …while an actual gate still fires.
    expect(scanContent(SRC, "if (predictedRoas < target) return skip;").length).toBeGreaterThan(0);
    expect(scanContent(SRC, "const winProbability = m.score(ad);").length).toBeGreaterThan(0);
  });

  // MUTATION: restrict the walk back to fullburn/ + .github/.
  it("secrets are hunted repo-wide, Laws are enforced only on Fullburn (H-16)", () => {
    const token = "sk-ant-" + "a1b2c3d4e5".repeat(3);
    expect(scanContent("pulsern/api/config.ts", `const k = "${token}";`).length).toBeGreaterThan(0);
    // …but a sibling product's own provider call is not a Fullburn Law breach.
    expect(scanContent("pulsern/api/ai.js", 'fetch("https://api.openai.com/v1")')).toHaveLength(0);
  });
});

describe("redaction — the shapes that got through (A1, A2, C2)", () => {
  const secrets = [CANARY_SECRET];

  // MUTATION: drop the binary branch from redactValue.
  it("a binary payload cannot smuggle the secret out as a byte map (A2)", () => {
    const bytes = new TextEncoder().encode(`Bearer ${CANARY_SECRET}`);
    const out = JSON.stringify(redactValue({ body: bytes }, secrets));
    expect(out).not.toContain(CANARY_SECRET);
    // …and the reconstructed bytes are not present either.
    expect(out).not.toContain(String(bytes[0]));
    expect(out).toContain("redacted binary");
  });

  // MUTATION: revert to plain assignment in the object branch.
  it("an own __proto__ key is kept as data, not installed as a prototype (C2)", () => {
    const payload = JSON.parse(`{"__proto__":{"stolen":"${CANARY_SECRET}"},"normal":"keep"}`);
    const out = redactValue(payload, secrets) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["__proto__", "normal"]);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(JSON.stringify(out)).not.toContain(CANARY_SECRET);
  });

  // MUTATION: remove the Map/Set/Date/Error branches.
  it("structured payloads survive redaction instead of becoming {} (C2)", () => {
    const out = redactValue(
      { m: new Map([["k", "v"]]), s: new Set([1, 2]), d: new Date(0), e: new Error("boom") },
      secrets,
    ) as Record<string, Record<string, unknown>>;
    expect(out["m"]!["__type"]).toBe("Map");
    expect(out["s"]!["__type"]).toBe("Set");
    expect(out["d"]).toBe("1970-01-01T00:00:00.000Z");
    expect(out["e"]!["message"]).toBe("boom");
  });

  it("a cycle is marked, not thrown on", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic["self"] = cyclic;
    expect(JSON.stringify(redactValue(cyclic, secrets))).toContain("circular");
  });

  // MUTATION: stop redacting CapError / MeterUnavailableError messages.
  it("a collaborator's error message is redacted before it is thrown or traced (A1)", async () => {
    const { deps } = makeDeps();
    const leaky = memoryMeter(testClock, capsOf(25, 25));
    const meter = {
      todayUsd: (c: string) => leaky.todayUsd(c),
      reservedUsd: (c: string) => leaky.reservedUsd(c),
      release: (r: never) => leaky.release(r),
      settle: (r: never) => leaky.settle(r),
      reserve: () => {
        throw new (class extends Error {})(`meter blew up while holding Bearer ${CANARY_SECRET}`);
      },
    };
    const { deps: d2, sink } = makeDeps();
    const msg = await llm({ ...deps, ...d2, meter: meter as never, sink, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: TEST_CLIENT,
      input: {},
      trace: new TraceContext("a1", TEST_CLIENT),
    }).then(
      () => "",
      (e: Error) => `${e.name} ${e.message} ${e.stack ?? ""}`,
    );
    expect(msg).not.toContain(CANARY_SECRET);
    expect(JSON.stringify(sink.events)).not.toContain(CANARY_SECRET);
  });
});
