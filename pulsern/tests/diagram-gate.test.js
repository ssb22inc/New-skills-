/* What may attach a diagram to a question — and the pairing run's honesty.
   From Astra's review of PR #133:
     6  a diagram that FAILED its visual review could still be published;
     11 the pairing CLI crashed under plain Node on a .jsx import;
     12 a run whose every batch failed still reported success. */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approval, sourceKey, readReviewIndex, mapIsCurrent, stepInventory, diagramSteps, expectedFrames, frameIds, signApproval, verifyApproval } from "../ops/diagram-attest.mjs";
import { publishable, sameProposal, pairAll, exitCodeFor, itemHash, diagramHash, decisionKey, signDecision, verifyDecision, signMap, verifyMap, buildItemMap } from "../ops/map-diagrams-lib.mjs";
import { verifierFrom, PUBLIC_ENV } from "../ops/attest.mjs";
import { testKeys } from "./helpers/attest-keys.js";

const KEYS = testKeys(), KEY = KEYS.verifier;
const signed = (id, e, signer = KEYS.signer) => ({ ...e, sig: signApproval(id, e, signer) });
const signedDecision = (key, d, signer = KEYS.signer) => ({ ...d, sig: signDecision(key, d, signer) });
const dg = { id: "abg", title: "ABG", facts: ["f"], steps: [{ key: "ph", caption: "c", narration: "n" }] };
const q = { id: 7, stem: "pH 7.30, PaCO2 55, HCO3 24", options: ["a", "b"], rationale: "r", answer: "a" };
const decision = { attach: true, itemHash: itemHash(q), diagramHash: diagramHash(dg), fp: "abc", extracted: null };

describe("approval of a diagram for publication", () => {
  it("fails closed when missing, failed or stale", () => {
    const steps = ["ph", "lungs"], frames = frameIds(expectedFrames(steps));
    const idx = (e) => ({ abg: signed("abg", e) });
    expect(approval({}, "abg", "k1", steps, KEY)).toEqual({ ok: false, why: "never reviewed" });
    expect(approval(idx({ verdict: "FAIL", sourceKey: "k1", frames }), "abg", "k1", steps, KEY).ok).toBe(false);
    expect(approval(idx({ verdict: "PASS", sourceKey: "old", frames }), "abg", "k1", steps, KEY)).toEqual({ ok: false, why: "changed since its review" });
    expect(approval(idx({ verdict: "PASS", sourceKey: "k1", frames }), "abg", "k1", steps, KEY)).toEqual({ ok: true, why: null });
    expect(() => approval(idx({ verdict: "PASS", sourceKey: "k1", frames }), "abg", "k1")).toThrow(/real steps are required/);
    expect(() => approval(idx({ verdict: "PASS", sourceKey: "k1", frames }), "abg", "k1", steps)).toThrow(/no public key/);
  });

  /* Astra, PR #134 review, round 25: every field of an index entry is
     public or computable, so an entry the branch wrote itself — correct
     key, sourceKey and frames, completed PASS — was taken as a review. */
  it("does not approve an entry the review job did not sign", () => {
    const steps = ["ph"], frames = frameIds(expectedFrames(steps));
    const forged = { key: "k", sourceKey: "k1", frames, verdict: "PASS", completed: true, reviewedAt: "2026-10-09T00:00:00.000Z", model: "m", report: "r.md" };
    expect(approval({ abg: forged }, "abg", "k1", steps, KEY)).toEqual({ ok: false, why: "not signed by the review job" });
    expect(approval({ abg: signed("abg", forged, KEYS.other) }, "abg", "k1", steps, KEY).ok, "signed with another key").toBe(false);
    expect(approval({ abg: { ...signed("abg", { ...forged, verdict: "FAIL" }), verdict: "PASS" } }, "abg", "k1", steps, KEY).ok, "a FAIL relabelled PASS").toBe(false);
    expect(approval({ abg: signed("tonicity", forged) }, "abg", "k1", steps, KEY).ok, "another diagram's signature").toBe(false);
    expect(approval({ abg: signed("abg", forged) }, "abg", "k1", steps, KEY)).toEqual({ ok: true, why: null });
  });

  /* Astra, PR #134 review, round 24: a PASS recorded from prepared data
     that left out a real step — and that step's frames — still approved
     the diagram. A PASS now counts only for the frames it was shown. */
  it("does not approve a PASS whose review left out a real step", () => {
    const real = ["ph", "lungs", "kidneys"];
    const without = frameIds(expectedFrames(["ph", "lungs"]));
    const idx = (e) => ({ abg: signed("abg", { verdict: "PASS", sourceKey: "k1", ...e }) });
    expect(approval(idx({ frames: without }), "abg", "k1", real, KEY)).toEqual({ ok: false, why: "its review did not cover every step" });
    expect(approval(idx({ frames: frameIds(expectedFrames([])) }), "abg", "k1", real, KEY).ok).toBe(false);
    expect(approval(idx({}), "abg", "k1", real, KEY).ok, "an entry with no frames on record").toBe(false);
    expect(approval(idx({ frames: frameIds(expectedFrames(real)) }), "abg", "k1", real, KEY).ok).toBe(true);
  });

  it("reads each diagram's steps from its source exactly as the app defines them", async () => {
    const { DIAGRAMS } = await import("../src/diagrams/index.js");
    const inv = stepInventory();
    expect(Object.keys(inv).sort()).toEqual(Object.keys(DIAGRAMS).sort());
    for (const [id, d] of Object.entries(DIAGRAMS)) expect(inv[id], id).toEqual(d.steps.map((s) => s.key));
  });

  it("refuses a step list it cannot read without running the code", () => {
    const ok = 'export const abg = { id: "abg", title: "t", steps: [{ key: "ph", caption: "c" }, { key: "lungs" }] };';
    expect(diagramSteps("abg.jsx", ok, "abg")).toEqual(["ph", "lungs"]);
    for (const [why, src] of [
      ["steps from a variable", 'const S = [{ key: "ph" }];\nexport const abg = { id: "abg", steps: S };'],
      ["a spread step", 'const extra = { key: "x" };\nexport const abg = { id: "abg", steps: [{ key: "ph" }, extra] };'],
      ["a spread object", 'const more = { steps: [] };\nexport const abg = { id: "abg", steps: [{ key: "ph" }], ...more };'],
      ["a computed key", 'const k = "ph";\nexport const abg = { id: "abg", steps: [{ key: k }] };'],
      ["a computed property", 'const p = "steps";\nexport const abg = { id: "abg", steps: [{ key: "ph" }], [p]: [] };'],
      ["duplicate keys", 'export const abg = { id: "abg", steps: [{ key: "ph" }, { key: "ph" }] };'],
      ["two definitions", 'export const abg = { id: "abg", steps: [] };\nexport const abg2 = { id: "abg", steps: [] };'],
      ["no definition", 'export const other = { id: "other", steps: [] };'],
    ]) expect(() => diagramSteps("abg.jsx", src, "abg"), why).toThrow(/stepInventory/);
  });

  it("publishes a confirmed pairing only for an approved diagram", () => {
    const decisions = { "7:abg": signedDecision("7:abg", decision) };
    const items = new Map([[7, q]]);
    expect(Object.keys(publishable(decisions, items, { abg: dg }, () => true, null, KEY))).toEqual(["7:abg"]);
    // the drawing failed its visual review: the pairing review's "attach" is not enough
    expect(publishable(decisions, items, { abg: dg }, () => false, null, KEY)).toEqual({});
    expect(() => publishable(decisions, items, { abg: dg }, () => true)).toThrow(/no public key/);
  });

  /* Astra, PR #134 review, round 26: the decision cache is in the branch,
     so an "attach" with altered values skipped the reviewer and shipped
     other numbers than the ones confirmed. */
  it("publishes only signed decisions, and only the values that were signed", () => {
    const items = new Map([[100, { ...q, id: 100, stem: "K 6.2" }]]);
    const real = { attach: true, values_confirmed: true, extracted: { k: 6.2 }, itemHash: itemHash(items.get(100)), diagramHash: diagramHash(dg), reviewedAt: "t", model: "m" };
    const ok = signedDecision("100:abg", real);
    expect(verifyDecision("100:abg", ok, KEY)).toBe(true);
    // the cached copy of what is shown is not trusted: values come from the signed fields
    const tamperedShown = { ...ok, shown: { k: 2.9 } };
    expect(buildItemMap(publishable({ "100:abg": tamperedShown }, items, { abg: dg }, () => true, null, KEY), { abg: dg }, null, items).pairs["100"][0].p).toEqual({ k: 6.2 });
    // altering a signed field voids the decision
    for (const forged of [{ ...ok, extracted: { k: 2.9 } }, { ...ok, values_confirmed: true, attach: true, sig: undefined }, { ...real, extracted: { k: 2.9 }, sig: signDecision("100:abg", { ...real, extracted: { k: 2.9 } }, KEYS.other) }, signedDecision("101:abg", real)]) {
      expect(publishable({ "100:abg": forged }, items, { abg: dg }, () => true, null, KEY)).toEqual({});
    }
  });

  /* PR #134 review, finding 6: this used to call sourceKey() twice on an
     unchanged tree — a constant would have passed. Now each input is
     changed in a scratch copy and the key must move (or must not). */
  it("changes the key for any drawing change, and not for generated data", () => {
    const root = mkdtempSync(join(tmpdir(), "attest-"));
    try {
      cpSync("src/diagrams", join(root, "src/diagrams"), { recursive: true });
      cpSync("src/explainer.jsx", join(root, "src/explainer.jsx"));
      cpSync("src/App.jsx", join(root, "src/App.jsx"));
      cpSync("package.json", join(root, "package.json"));
      const base = sourceKey(root);
      expect(base).toMatch(/^[0-9a-f]{24}$/);
      const touch = (rel, edit) => {
        const p = join(root, rel), before = readFileSync(p, "utf8");
        writeFileSync(p, edit(before));
        const k = sourceKey(root);
        writeFileSync(p, before);
        return k;
      };
      for (const rel of ["src/diagrams/abg.jsx", "src/diagrams/kit.jsx", "src/diagrams/match.js", "src/explainer.jsx"]) {
        expect(touch(rel, (t) => t + "\n// changed\n"), rel).not.toBe(base);
      }
      expect(touch("src/App.jsx", (t) => t.replace("--teal:#0E7C6B", "--teal:#0E7C6C")), "theme colour").not.toBe(base);
      // round 29: the monitor tokens sit in their own block, and the renderer draws with them
      expect(touch("src/App.jsx", (t) => t.replace("--ecg:#3BE08F", "--ecg:#3BE08E")), "monitor token").not.toBe(base);
      expect(touch("src/App.jsx", (t) => t + "\n// unrelated app code\n"), "app code outside the theme").toBe(base);
      for (const rel of ["src/diagrams/item-map.json", "src/diagrams/narration.json"]) {
        expect(touch(rel, (t) => t.replace(/\}\s*$/, ',"x":1}')), rel).toBe(base);
      }
      expect(sourceKey(root)).toBe(base);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /* The guard that holds at merge time: the shipped map may only name
     diagrams whose CURRENT code passed visual review. A drawing change after
     pairing fails this test until the review is run again. */
  /* PR #134 review: a fresh visual PASS must not revive a pairing made for
     different content or different extracted values. */
  it("retires a pairing whose extracted values today's matcher no longer reads", () => {
    const longDecision = { ...decision, extracted: { type: "long", givenAt: "21:00" } };
    const decisions = { "7:abg": signedDecision("7:abg", longDecision) };
    const items = new Map([[7, q]]);
    const nowProposes = new Map([[7, [{ d: "abg", p: null }]]]);   // e.g. detemir: no longer read as long-acting
    expect(publishable(decisions, items, { abg: dg }, () => true, nowProposes, KEY)).toEqual({});
    const stillProposes = new Map([[7, [{ d: "abg", p: { type: "long", givenAt: "21:00" } }]]]);
    expect(Object.keys(publishable(decisions, items, { abg: dg }, () => true, stillProposes, KEY))).toEqual(["7:abg"]);
    expect(sameProposal([], "abg", null)).toBe(false);   // not proposed at all any more
  });
  it("retires a pairing approved for different clinical content, even after a fresh visual pass", () => {
    const decisions = { "7:abg": signedDecision("7:abg", decision) };
    const changed = { ...dg, facts: ["a corrected fact"] };
    expect(publishable(decisions, new Map([[7, q]]), { abg: changed }, () => true, null, KEY)).toEqual({});
  });
  it("requires a map with pairings to be rebuilt after any drawing or matcher change", () => {
    const withPairs = { pairs: { "7": [{ d: "abg", f: "x", v: "y" }] }, sourceKey: "old" };
    expect(mapIsCurrent(withPairs, "new")).toBe(false);
    expect(mapIsCurrent({ ...withPairs, sourceKey: "new" }, "new")).toBe(true);
    expect(mapIsCurrent({ pairs: {} }, "new")).toBe(true);
  });

  it("ships no pairing for a diagram without a current passing review", () => {
    const map = JSON.parse(readFileSync("src/diagrams/item-map.json", "utf8"));
    expect(mapIsCurrent(map, sourceKey()), "item-map.json was built against older drawing code: rerun ops/map-diagrams.mjs").toBe(true);
    const used = new Set(Object.values(map.pairs).flat().map((p) => p.d));
    const index = readReviewIndex(), key = sourceKey();
    const steps = stepInventory();
    if (!used.size) return;   // an empty map ships nothing and needs no signature
    /* A map with pairings is checked against the public key pinned in a
       repository variable: the map must be the paid mapper's, and every
       diagram it uses must carry the review job's signed PASS (round 26:
       this test once checked only that a signature LOOKED right). */
    expect(process.env[PUBLIC_ENV], `${PUBLIC_ENV} must be set to check a map with pairings (HUMAN_TASKS H20)`).toBeTruthy();
    expect(publicationProblems(map, index, key, steps, verifierFrom()), "item-map.json").toEqual([]);
  });

  it("refuses a hand-written map, and an approval whose signature only looks right", () => {
    const steps = { abg: ["ph"] }, key = "k1", frames = frameIds(expectedFrames(steps.abg));
    const entry = { key: "rk", sourceKey: key, frames, verdict: "PASS", completed: true, reviewedAt: "t", model: "m", report: "r.md" };
    const map = { version: 2, sourceKey: key, pairs: { "7": [{ d: "abg", f: "x", v: "y" }] } };
    expect(publicationProblems(signMap(map, KEYS.signer), { abg: signed("abg", entry) }, key, steps, KEY)).toEqual([]);
    expect(publicationProblems(map, { abg: signed("abg", entry) }, key, steps, KEY)).toEqual(["the map is not signed by the mapper"]);
    expect(publicationProblems({ ...map, sig: "A".repeat(86) + "==" }, { abg: signed("abg", entry) }, key, steps, KEY)).toEqual(["the map is not signed by the mapper"]);
    expect(publicationProblems(signMap(map, KEYS.other), { abg: signed("abg", entry) }, key, steps, KEY)).toEqual(["the map is not signed by the mapper"]);
    expect(publicationProblems(signMap(map, KEYS.signer), { abg: { ...entry, sig: "A".repeat(86) + "==" } }, key, steps, KEY)).toEqual(["abg: not signed by the review job"]);
    expect(publicationProblems({ ...signMap(map, KEYS.signer), pairs: { "7": [{ d: "abg", p: { k: 2.9 }, f: "x", v: "y" }] } }, { abg: signed("abg", entry) }, key, steps, KEY)).toEqual(["the map is not signed by the mapper"]);
  });
});

/* What the merge gate checks for a map with pairings. */
function publicationProblems(map, index, key, steps, verifier) {
  const out = [];
  if (!verifyMap(map, verifier)) out.push("the map is not signed by the mapper");
  for (const id of new Set(Object.values(map.pairs).flat().map((p) => p.d))) {
    const a = steps[id] ? approval(index, id, key, steps[id], verifier) : { ok: false, why: "not a diagram in the source" };
    if (!a.ok) out.push(`${id}: ${a.why}`);
  }
  return out;
}

describe("a pairing run tells the truth about failures", () => {
  const blank = () => ({ asked: 0, attached: 0, attachedWithValues: 0, rejected: 0, failedBatches: [], stoppedFor: null });
  const base = { diagrams: { abg: dg }, maxUsd: 15, spent: () => 0, fingerprintOf: () => "fp", model: "m", signer: KEYS.signer };

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
    expect(verifyDecision("7:abg", decisions["7:abg"], KEY), "every decision is signed").toBe(true);
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
      encoding: "utf8", timeout: 90_000, env: { ...process.env, PULSERN_SUPABASE_URL: "http://127.0.0.1:9", ...KEYS.env },
    });
    const out = `${r.stdout}\n${r.stderr}`;
    expect(out).not.toMatch(/Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/);
    /* Got past module loading to the database read — whatever the review
       state of the diagrams (PR #134 review, finding 8: this once required
       a "held back" message that disappears once every diagram passes). */
    expect(out).toContain("Reading practice questions…");
  }, 120_000);
  /* Rounds 29–30: a dry run signs nothing, so it must not need the
     private key — and it must change no record. Run end to end on a
     populated checkout against a bank that answers, so the run really
     reaches the point where it would save. */
  it("dry-runs with only the public key, or none, to completion, and changes no record", async () => {
    const { createServer } = await import("node:http");
    const { execFileSync } = await import("node:child_process");
    const { mkdirSync } = await import("node:fs");
    const { DIAGRAMS } = await import("../src/diagrams/index.js");
    const { fingerprint } = await import("../src/diagrams/fingerprint.js");
    const bankQ = { id: 7, stem: "pH 7.30, PaCO2 55, HCO3 24. Interpret the ABG.", options: ["a", "b"], answer: "a", rationale: "r" };
    const server = createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      const offset = Number(u.searchParams.get("offset") ?? (req.headers.range ?? "0-").split("-")[0]);
      const rows = offset === 0 ? [bankQ] : [];
      res.writeHead(200, { "content-type": "application/json", "content-range": `${offset}-${offset + rows.length - 1}/1` });
      res.end(JSON.stringify(rows));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}`;
    const root = mkdtempSync(join(tmpdir(), "map-dry-"));
    const into = join(root, "branch");
    try {
      mkdirSync(into);
      for (const f of ["src", "package.json", "package-lock.json", "vite.config.js"]) cpSync(f, join(into, f), { recursive: true });
      const key = sourceKey(into), steps = stepInventory(into);
      const raw = Object.values(DIAGRAMS).map((d) => JSON.parse(JSON.stringify({ id: d.id, title: d.title, facts: d.facts, steps: d.steps.map((s) => ({ key: s.key, dynamic: s.dynamic === true ? true : undefined, caption: s.caption, narration: s.narration })) })));
      const abg = raw.find((d) => d.id === "abg");
      const index = { abg: signed("abg", { key: "rk", sourceKey: key, frames: frameIds(expectedFrames(steps.abg)), verdict: "PASS", completed: true, reviewedAt: "t", model: "m", report: "r.md" }) };
      const extracted = { ph: 7.3, paco2: 55, hco3: 24 };
      const dec = { attach: true, values_confirmed: true, extracted, itemHash: itemHash(bankQ), diagramHash: diagramHash(abg), reviewedAt: "t", model: "m", fp: fingerprint(bankQ) };
      const decisions = { "7:abg": signedDecision("7:abg", dec) };
      const map = signMap(buildItemMap(decisions, { abg }, key, new Map([[7, bankQ]])), KEYS.signer);
      expect(Object.keys(map.pairs)).toEqual(["7"]);
      mkdirSync(join(into, "reports/diagram-review"), { recursive: true });
      mkdirSync(join(into, "reports/diagram-map"), { recursive: true });
      writeFileSync(join(into, "reports/diagram-review/index.json"), JSON.stringify(index));
      writeFileSync(join(into, "reports/diagram-map/decisions.json"), JSON.stringify(decisions));
      writeFileSync(join(into, "src/diagrams/item-map.json"), JSON.stringify(map) + "\n");
      const git = (...x) => execFileSync("git", x, { cwd: into, encoding: "utf8" }).trim();
      git("init", "-q"); git("add", "-A"); git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
      const plan = join(root, "plan.json");
      writeFileSync(plan, JSON.stringify({ kind: "diagram-map", commit: git("rev-parse", "HEAD"), diagrams: raw, proposals: { "7": [{ d: "abg", p: extracted }] } }));
      const records = ["src/diagrams/item-map.json", "reports/diagram-map/decisions.json"].map((f) => join(into, f));
      const before = records.map((f) => readFileSync(f, "utf8"));
      for (const keys of [{ PULSERN_ATTEST_PUBLIC_KEY: KEYS.env.PULSERN_ATTEST_PUBLIC_KEY }, {}]) {
        const env = { ...process.env, PULSERN_SUPABASE_URL: url, ...keys };
        if (!keys.PULSERN_ATTEST_PUBLIC_KEY) delete env.PULSERN_ATTEST_PUBLIC_KEY;
        delete env.PULSERN_ATTEST_PRIVATE_KEY;
        const r = await new Promise((done) => {
          const c = require("node:child_process").spawn(process.execPath, [join(process.cwd(), "ops/map-diagrams.mjs"), "--prepared", plan, "--into", into, "--dry-run"], { env });
          let out = ""; c.stdout.on("data", (b) => (out += b)); c.stderr.on("data", (b) => (out += b));
          c.on("close", (code) => done({ code, out }));
        });
        expect(r.code, r.out).toBe(0);
        expect(r.out).toContain("Read 1 practice questions.");
        expect(r.out).toContain("Dry run: nothing sent.");
        if (!keys.PULSERN_ATTEST_PUBLIC_KEY) expect(r.out).toMatch(/cannot be checked/);
        expect(records.map((f) => readFileSync(f, "utf8")), "a dry run leaves the map and decisions byte-identical").toEqual(before);
      }
    } finally {
      server.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 240_000);
  it("refuses a real run without the private key, before reading anything", () => {
    const env = { ...process.env, PULSERN_SUPABASE_URL: "http://127.0.0.1:9", PULSERN_ATTEST_PUBLIC_KEY: KEYS.env.PULSERN_ATTEST_PUBLIC_KEY };
    delete env.PULSERN_ATTEST_PRIVATE_KEY;
    const r = spawnSync(process.execPath, ["ops/map-diagrams.mjs"], { encoding: "utf8", timeout: 90_000, env });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/PULSERN_ATTEST_PRIVATE_KEY is not set/);
    expect(`${r.stdout}\n${r.stderr}`).not.toContain("Reading practice questions…");
  }, 120_000);
});
