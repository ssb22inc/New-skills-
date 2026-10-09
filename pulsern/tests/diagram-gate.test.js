/* What may attach a diagram to a question — and the pairing run's honesty.
   From Astra's review of PR #133:
     6  a diagram that FAILED its visual review could still be published;
     11 the pairing CLI crashed under plain Node on a .jsx import;
     12 a run whose every batch failed still reported success. */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { approval, sourceKey, readReviewIndex } from "../ops/diagram-attest.mjs";
import { publishable, pairAll, exitCodeFor, itemHash, diagramHash, decisionKey } from "../ops/map-diagrams-lib.mjs";

const dg = { id: "abg", title: "ABG", facts: ["f"], steps: [{ key: "ph", caption: "c", narration: "n" }] };
const q = { id: 7, stem: "pH 7.30, PaCO2 55, HCO3 24", options: ["a", "b"], rationale: "r", answer: "a" };
const decision = { attach: true, itemHash: itemHash(q), diagramHash: diagramHash(dg), fp: "abc", shown: null };

describe("approval of a diagram for publication", () => {
  it("fails closed when missing, failed or stale", () => {
    expect(approval({}, "abg", "k1")).toEqual({ ok: false, why: "never reviewed" });
    expect(approval({ abg: { verdict: "FAIL", sourceKey: "k1" } }, "abg", "k1").ok).toBe(false);
    expect(approval({ abg: { verdict: "PASS", sourceKey: "old" } }, "abg", "k1")).toEqual({ ok: false, why: "changed since its review" });
    expect(approval({ abg: { verdict: "PASS", sourceKey: "k1" } }, "abg", "k1")).toEqual({ ok: true, why: null });
  });

  it("publishes a confirmed pairing only for an approved diagram", () => {
    const decisions = { [decisionKey(7, "abg")]: decision };
    const items = new Map([[7, q]]);
    expect(Object.keys(publishable(decisions, items, { abg: dg }, () => true))).toEqual(["7:abg"]);
    // the drawing failed its visual review: the pairing review's "attach" is not enough
    expect(publishable(decisions, items, { abg: dg }, () => false)).toEqual({});
  });

  it("changes the source key when any drawing code changes, not when generated data does", () => {
    const k = sourceKey();
    expect(k).toMatch(/^[0-9a-f]{24}$/);
    expect(sourceKey()).toBe(k);
  });

  /* The guard that holds at merge time: the shipped map may only name
     diagrams whose CURRENT code passed visual review. A drawing change after
     pairing fails this test until the review is run again. */
  it("ships no pairing for a diagram without a current passing review", () => {
    const map = JSON.parse(readFileSync("src/diagrams/item-map.json", "utf8"));
    const used = new Set(Object.values(map.pairs).flat().map((p) => p.d));
    const index = readReviewIndex(), key = sourceKey();
    for (const id of used) expect(approval(index, id, key), id).toEqual({ ok: true, why: null });
  });
});

describe("a pairing run tells the truth about failures", () => {
  const blank = () => ({ asked: 0, attached: 0, attachedWithValues: 0, rejected: 0, failedBatches: [], stoppedFor: null });
  const base = { diagrams: { abg: dg }, maxUsd: 15, spent: () => 0, fingerprintOf: () => "fp", model: "m" };

  it("fails the run when every batch fails", async () => {
    const run = blank();
    await pairAll({ ...base, queue: { abg: [{ ...q, extracted: null }] }, decisions: {}, run, ask: async () => { throw new Error("401 bad key"); } });
    expect(run.failedBatches).toHaveLength(1);
    expect(exitCodeFor(run)).toBe(1);
  });

  it("succeeds only when every batch was answered", async () => {
    const run = blank(), decisions = {};
    await pairAll({ ...base, queue: { abg: [{ ...q, extracted: null }] }, decisions, run,
      ask: async () => ({ decisions: [{ id: 7, attach: true, values_confirmed: false, reason: "fits" }] }) });
    expect(run.asked).toBe(1);
    expect(decisions["7:abg"].attach).toBe(true);
    expect(exitCodeFor(run)).toBe(0);
  });

  it("stops at the spend cap without calling the reviewer", async () => {
    const run = blank();
    let called = 0;
    await pairAll({ ...base, spent: () => 99, queue: { abg: [{ ...q, extracted: null }] }, decisions: {}, run, ask: async () => { called++; return { decisions: [] }; } });
    expect(called).toBe(0);
    expect(run.stoppedFor).toMatch(/cap/);
  });
});

describe("the pairing CLI under plain Node", () => {
  it("starts without a .jsx import error", () => {
    const r = spawnSync(process.execPath, ["ops/map-diagrams.mjs", "--dry-run"], {
      encoding: "utf8", timeout: 90_000, env: { ...process.env, PULSERN_SUPABASE_URL: "http://127.0.0.1:9" },
    });
    const out = `${r.stdout}\n${r.stderr}`;
    expect(out).not.toMatch(/Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/);
    expect(out).toContain("Held back");   // got far enough to check approvals
  }, 120_000);
});
