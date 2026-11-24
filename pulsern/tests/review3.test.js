/* REVIEW-3 findings that are plain logic or source rules. Browser coverage:
   progress-load-browser (N1, N2), review3-browser (N4), capture-fonts (B1). */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseProgress, clearLegacyProgressBackup, LEGACY_PROGRESS_BACKUP_KEY } from "../src/progress-load.js";
import { signOutAndForgetTrial } from "../src/sign-out.js";
import { enforceOneTimeAppRelogin, GUEST_TRIAL_KEY } from "../src/app-routing.js";
import { GUEST_KEY } from "../src/guest.js";
import { answerXp, caseStepIds, legacyCaseAllowlist } from "../src/rewards.js";
import { classifyLog } from "../src/question-key.js";
import { CASE_STUDIES } from "../src/case-studies.js";

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};
const app = fs.readFileSync("src/App.jsx", "utf8");

describe("Codex P2 wiring", () => {
  it("reset clears the same-day streak mark, and guest cleanup is tied to the save that started with it", () => {
    const reset = app.slice(app.indexOf("const resetAll"), app.indexOf("const resetAll") + 700);
    expect(reset).toContain("touchedDay.current = null");
    const save = app.slice(app.indexOf("autosave on change"), app.indexOf("autosave on change") + 1600);
    expect(save.indexOf("const pendingAtStart = pendingGuestClear.current === true")).toBeGreaterThan(-1);
    expect(save.indexOf("const pendingAtStart")).toBeLessThan(save.indexOf("saveQueue.current.enqueue"));
    expect(save).toContain("store.set(STORE_KEY, payload, userId)");
    expect(save).toContain("guestClearOnSave(pendingAtStart)");
    expect(save).toContain("handoffAfterSave");
    expect(save).toContain('res.error?.code === "signed-out"');
    expect(app).toContain("persistDecision(session, expectedUserId)");
    expect(app).toContain("undoLog.current[id] = { prev: srsMap[id], xp: xpGain, day: todayStr() }");
    expect(app).toContain("onUngrade?.(rec.xp, rec.day)");
    expect(app).toContain("reverseCardDay(r, credited, cardXpGain)");
    const signOut = app.slice(app.indexOf("const signOutAndForgetTrial"), app.indexOf("const signOutAndForgetTrial") + 1800);
    expect(signOut.indexOf("waitForFlush(() => saveQueue.current.flush())")).toBeGreaterThan(-1);
    expect(signOut.indexOf("saved.timedOut")).toBeGreaterThan(-1);
    expect(signOut.indexOf("stashPendingProgress")).toBeGreaterThan(-1);
    expect(signOut.indexOf("saved.timedOut")).toBeLessThan(signOut.indexOf("saveQueue.current.invalidate()"));
    expect(app).toContain("setRewards((r) => maybeGrantCover(r, today).rewards)");
    expect(app).not.toContain("setRewards(g.rewards)");
    expect(app).toContain("stampedQuestion(");
    expect(app).toContain("run: runRef.current");
    expect(app).toContain("runRef.current = next.run");
    expect(app).toContain("unseenQuestions(catalog, log)");
    expect(app).toContain("questionByIdentity(reviewQuestions, view.id)");
    expect(app).toContain("stampCatalogQuestion(");
    expect(app).toContain("createSaveQueue");
    expect(save).toContain("saveQueue.current.enqueue");
    expect(app).toMatch(/useState\(\(\) => \(\{ \.\.\.emptyRewards\(\), rankHigh: 0 \}\)\)/);
    expect(app).not.toMatch(/setGuestNote\(merged\.summary\)/);
    expect(app).toContain("signOutAndForgetTrial={signOutAndForgetTrial}");
    expect(app).not.toMatch(/\+30 XP/);
  });
  it("the guest trial shows the educational and NCSBN footer on every stage", () => {
    const guest = fs.readFileSync("src/guest.jsx", "utf8");
    const footer = guest.slice(guest.indexOf("<footer"));
    expect(footer).toContain("Educational exam preparation only");
    expect(footer).toContain("National Council of State Boards of Nursing, Inc. (NCSBN)");
    expect(footer).toContain("Terms, Privacy, and Disclaimer");
    expect(guest.indexOf("<footer")).toBeGreaterThan(guest.indexOf("stage === \"quiz\""));
    expect(guest.indexOf("<footer")).toBeLessThan(guest.indexOf("<LabFab"));
  });
});

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
  it("R4-2: no device backup is written; an old one is removed, even with blocked storage", () => {
    expect(LEGACY_PROGRESS_BACKUP_KEY).toBe("pulsern-progress-backup-v1");
    const st = mem({ [LEGACY_PROGRESS_BACKUP_KEY]: "[{\"raw\":\"x\"}]", other: "keep" });
    clearLegacyProgressBackup(st);
    expect(st.getItem(LEGACY_PROGRESS_BACKUP_KEY)).toBeNull();
    expect(st.getItem("other")).toBe("keep");
    expect(() => clearLegacyProgressBackup({ removeItem() { throw new Error("blocked"); } })).not.toThrow();
    const src = fs.readdirSync("src").filter((f) => /\.(jsx?|mjs)$/.test(f)).map((f) => fs.readFileSync(path.join("src", f), "utf8")).join("\n");
    expect(src).not.toMatch(/setItem\([^)]*(PROGRESS_BACKUP|progress-backup)/);
    expect(app).not.toContain("a copy is kept");
  });
  it("R4-1: reset never runs while not saving", () => {
    expect(app).toMatch(/const resetAll = async \(\) => \{[^]*?if \(saveBlocked\) return;[^]*?store\.delete/);
  });
  it("autosave is blocked while the saved row cannot be opened", () => {
    expect(app).toContain("if (!loaded || saveBlocked) return;");
  });
});

describe("N2: sign-out forgets the trial", () => {
  it("signOutAndForgetTrial clears the trial key and any old progress backup, then signs out", async () => {
    const st = mem({ [GUEST_KEY]: "{}", [LEGACY_PROGRESS_BACKUP_KEY]: "[]" });
    let calls = 0;
    await signOutAndForgetTrial({ auth: { signOut: async () => { calls++; return { error: null }; } }, storage: st });
    expect(st.getItem(GUEST_KEY)).toBeNull();
    expect(st.getItem(LEGACY_PROGRESS_BACKUP_KEY)).toBeNull();
    expect(calls).toBe(1);
  });
  it("the one-time forced re-login clears it too, with the same key", async () => {
    expect(GUEST_TRIAL_KEY).toBe(GUEST_KEY);
    const st = mem({ [GUEST_KEY]: "{}", [LEGACY_PROGRESS_BACKUP_KEY]: "[]" });
    const auth = { getSession: async () => ({ data: { session: { user: { id: "u" } } }, error: null }), signOut: async () => ({ error: null }) };
    await enforceOneTimeAppRelogin({ auth, storage: st, href: "https://pulsern.app/app" });
    expect(st.getItem(GUEST_KEY)).toBeNull();
    expect(st.getItem(LEGACY_PROGRESS_BACKUP_KEY)).toBeNull();
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
    expect(caseStepIds({ dbId: 7, step: 2 })).toEqual({ id: "case-db7-2", aliases: ["case:db7:2"], legacyAliases: [50072] });
  });
  it("bundled cases use a fixed key, not the editable title, and alias 100 + index*10 + step", () => {
    expect(CASE_STUDIES.map((c) => c.key)).toEqual(["sepsis", "dka", "preeclampsia-magnesium"]);
    expect(caseStepIds({ key: "dka", title: "Hyperglycemic Crisis · DKA", index: 1, step: 3 })).toEqual({ id: "case-dka-3", aliases: ["case:dka:3"], legacyAliases: [113] });
  });
  it("a step answered under the old id pays no first-try XP again", () => {
    const step = caseStepIds({ key: "sepsis", index: 0, step: 1 });
    const catalogs = { bankKnown: true, builtinIds: [], bankIds: [], dbCases: [{ id: 12, cat: "Pharmacology", steps: [{}] }] };
    const log = classifyLog([{ id: 101, cat: "Physiological Adaptation", diff: 3, correct: true }], catalogs);
    const q = { ...step, source: "case", key: "case:case-sepsis-1", cat: "Physiological Adaptation", diff: 3 };
    expect(answerXp({ q, correct: true, ms: 9000, log }).reason).toBe("repeat");
    const db = caseStepIds({ dbId: 12, step: 0 });
    const dbLog = classifyLog([{ id: 50120, cat: "Pharmacology", diff: 3, correct: true }], catalogs);
    expect(answerXp({ q: { ...db, source: "case", key: "case:case-db12-0", cat: "Pharmacology", diff: 3 }, correct: true, ms: 9000, log: dbLog }).xp).toBe(0);
  });
  it("tags only an id that one catalog owns", () => {
    expect(legacyCaseAllowlist().size).toBe(15);
    const catalogs = { bankKnown: true, builtinIds: [], bankIds: [], dbCases: [] };
    const step = caseStepIds({ key: "sepsis", index: 0, step: 1 });
    const stem = "Which findings require immediate follow-up? Select all that apply.";
    const tagged = classifyLog([{ id: 101, cat: "Physiological Adaptation", diff: 3, correct: true }], catalogs)[0];
    expect(tagged.key).toBe("case:case-sepsis-1");
    expect(answerXp({ q: { ...step, source: "case", key: tagged.key, cat: "Physiological Adaptation", diff: 3, stem }, correct: true, ms: 9000, log: [tagged] }).xp).toBe(0);
    const unknown = classifyLog([{ id: 80, cat: "Physiological Adaptation", diff: 3, correct: true }], catalogs)[0];
    expect(unknown.unclassified).toBe(true);
    expect(answerXp({ q: { ...step, source: "case", key: "case:case-sepsis-1", cat: "Physiological Adaptation", diff: 3, stem }, correct: true, ms: 9000, log: [unknown] }).xp).toBe(30);
    const shared = classifyLog([{ id: 101, cat: "Physiological Adaptation", diff: 3, correct: true }], { ...catalogs, bankIds: [101] })[0];
    expect(shared.unclassified).toBe(true);
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
    expect(app).toContain("missesOpen={missesOpen}");
    expect(app).toMatch(/function Monitor\(\{[^}]*missesOpen/);
    expect(app).toContain("todayQuestionCount({ rewards, daily, today: todayStr() })");
    expect(app).toContain('qToday.known ? qToday.count : "—"');
    expect(app).toMatch(/vital-lab">Q TODAY/);
  });
  it("N9: the consent card does not call the student 'someone'", () => {
    expect(app).not.toContain("Someone answered");
    expect(app).toContain("If they were yours, add them. If someone else used this device, discard them.");
  });
  it("N10: undo restarts the card-XP time floor", () => {
    expect(app).toMatch(/flipAt\.current = Date\.now\(\);[^\n]*\n\s*setSession\(\(s\) => undoGrade\(s\)\);/);
  });
});
