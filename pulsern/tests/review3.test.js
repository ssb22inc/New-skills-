/* REVIEW-3 findings that are plain logic or source rules. Browser coverage:
   progress-load-browser (N1, N2), review3-browser (N4), capture-fonts (B1). */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseProgress, backupUnreadableProgress, PROGRESS_BACKUP_KEY } from "../src/progress-load.js";
import { signOutAndForgetTrial } from "../src/sign-out.js";
import { enforceOneTimeAppRelogin, GUEST_TRIAL_KEY } from "../src/app-routing.js";
import { GUEST_KEY } from "../src/guest.js";
import { answerXp, caseStepIds } from "../src/rewards.js";
import { CASE_STUDIES } from "../src/case-studies.js";

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};
const app = fs.readFileSync("src/App.jsx", "utf8");

describe("N1: unreadable saved progress", () => {
  const migrate = (b) => ({ ...b, migrated: true });
  it("separates no row, a good row and a row the app cannot open", () => {
    expect(parseProgress(null, migrate)).toEqual({ status: "new", blob: null });
    expect(parseProgress('{"xp":5}', migrate)).toEqual({ status: "ok", blob: { xp: 5, migrated: true } });
    expect(parseProgress("null", migrate)).toMatchObject({ status: "corrupt", reason: "empty" });
    expect(parseProgress("[1,2]", migrate)).toMatchObject({ status: "corrupt", reason: "wrong-shape" });
    expect(parseProgress('"text"', migrate)).toMatchObject({ status: "corrupt", reason: "wrong-shape" });
    expect(parseProgress("{bad", migrate)).toMatchObject({ status: "corrupt", reason: "unreadable" });
    expect(parseProgress('{"xp":5}', () => { throw new Error("boom"); })).toMatchObject({ status: "corrupt", reason: "migrate-failed" });
  });
  it("keeps up to 3 device backups, newest first, without duplicates", () => {
    const st = mem();
    for (const raw of ["a", "b", "b", "c", "d"]) backupUnreadableProgress(st, { userId: "u", raw, at: 1 });
    expect(JSON.parse(st.getItem(PROGRESS_BACKUP_KEY)).map((b) => b.raw)).toEqual(["d", "c", "b"]);
    expect(backupUnreadableProgress({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }, { raw: "x" })).toBe(false);
  });
  it("autosave is blocked while the saved row cannot be opened", () => {
    expect(app).toContain("if (!loaded || saveBlocked) return;");
  });
});

describe("N2: sign-out forgets the trial", () => {
  it("signOutAndForgetTrial clears the trial key, then signs out", async () => {
    const st = mem({ [GUEST_KEY]: "{}" });
    let calls = 0;
    await signOutAndForgetTrial({ auth: { signOut: async () => { calls++; return { error: null }; } }, storage: st });
    expect(st.getItem(GUEST_KEY)).toBeNull();
    expect(calls).toBe(1);
  });
  it("the one-time forced re-login clears it too, with the same key", async () => {
    expect(GUEST_TRIAL_KEY).toBe(GUEST_KEY);
    const st = mem({ [GUEST_KEY]: "{}" });
    const auth = { getSession: async () => ({ data: { session: { user: { id: "u" } } }, error: null }), signOut: async () => ({ error: null }) };
    await enforceOneTimeAppRelogin({ auth, storage: st, href: "https://pulsern.app/app" });
    expect(st.getItem(GUEST_KEY)).toBeNull();
  });
  it("no sign-out call in src bypasses the trial-clearing paths", () => {
    const hits = [];
    for (const f of fs.readdirSync("src")) {
      if (!/\.(jsx?|mjs)$/.test(f)) continue;
      const text = fs.readFileSync(path.join("src", f), "utf8");
      if (/\.signOut\(/.test(text)) hits.push(f);
    }
    expect(hits.sort()).toEqual(["app-routing.js", "sign-out.js"]);
    // every Sign out button in the app uses the clearing handler
    const buttons = app.match(/<button[^>]*>[^<]*Sign out<\/button>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const b of buttons) expect(b).toContain("onClick={signOutAndForgetTrial}");
  });
});

describe("N7: case steps already answered stay answered", () => {
  it("bank cases use the db id and alias the old 50000 + id*10 + step number", () => {
    expect(caseStepIds({ dbId: 7, step: 2 })).toEqual({ id: "case-db7-2", aliases: [50072] });
  });
  it("bundled cases use a fixed key, not the editable title, and alias 100 + index*10 + step", () => {
    expect(CASE_STUDIES.map((c) => c.key)).toEqual(["sepsis", "dka", "preeclampsia-magnesium"]);
    expect(caseStepIds({ key: "dka", title: "Hyperglycemic Crisis · DKA", index: 1, step: 3 })).toEqual({ id: "case-dka-3", aliases: [113] });
  });
  it("a step answered under the old id pays no first-try XP again", () => {
    const { id, aliases } = caseStepIds({ key: "sepsis", index: 0, step: 1 });
    const log = [{ id: 101, cat: "Physiological Adaptation", diff: 3, correct: true }];
    expect(answerXp({ q: { id, aliases, cat: "Physiological Adaptation", diff: 3 }, correct: true, log }).reason).toBe("repeat");
    const db = caseStepIds({ dbId: 12, step: 0 });
    expect(answerXp({ q: { ...db, cat: "Pharmacology", diff: 3 }, correct: true, log: [{ id: 50120, cat: "Pharmacology", diff: 3, correct: true }] }).xp).toBe(0);
  });
  it("an unrelated bank question with the same number but another category does not block the step", () => {
    const { id, aliases } = caseStepIds({ key: "sepsis", index: 0, step: 1 });
    const log = [{ id: 101, cat: "Pharmacology", diff: 2, correct: true }];
    expect(answerXp({ q: { id, aliases, cat: "Physiological Adaptation", diff: 3 }, correct: true, log }).xp).toBe(30);
  });
});

describe("N5: toolkit button avoid list", () => {
  it("only the rewards selectors were added to #183's list", () => {
    const fab = fs.readFileSync("src/lab-fab.jsx", "utf8");
    const list = fab.slice(fab.indexOf("const TARGETS = ["), fab.indexOf('].join(",")'));
    const added = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((sel) => /rw-/.test(sel));
    expect(added).toEqual([":is([class^='rw-'],[class*=' rw-']) :is(dt,dd,span.mono)", ".rw-next-head > span", ".rw-best"]);
    for (const bare of ['"dt"', '"dd"', '"span.mono"']) expect(list).not.toContain(bare);
  });
});

describe("N8-N10 quick fixes", () => {
  it("N8: the monitor's Q TODAY counts questions only, like the shift", () => {
    expect(app).toMatch(/questionsOn\(rewards, todayStr\(\)\)\}<\/span>\s*<span className="vital-lab">Q TODAY/);
  });
  it("N9: the consent card does not call the student 'someone'", () => {
    expect(app).not.toContain("Someone answered");
    expect(app).toContain("If they were yours, add them. If someone else used this device, discard them.");
  });
  it("N10: undo restarts the card-XP time floor", () => {
    expect(app).toMatch(/flipAt\.current = Date\.now\(\);[^\n]*\n\s*setSession\(\(s\) => undoGrade\(s\)\);/);
  });
});
