/* Try before sign-up (src/guest.js): only free built-in content, a hard
   question limit, the same XP rules as an account, and a one-time,
   collision-free handoff into the account blob. */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  GUEST_KEY, GUEST_LIMIT, GUEST_HOLD_KEY, guestPool, emptyGuest, guestAnswer, guestRemaining, mergeGuestIntoBlob, loadGuest, saveGuest, clearGuest, guestClearOnSave, handoffAfterSave, createSaveQueue, persistDecision, linkBuiltInGuest, holdGuestTrial, clearHeldMemory, peekHeldGuest, releaseHeldGuest, readGuestForHandoff, guestFresh, guestSummary, guestImportIdentity, waitForFlush, applyProgressWrite,
} from "../src/guest.js";
import { QUESTIONS } from "../src/App.jsx";
import { migrateBlob } from "../src/state.js";
import { answerXp, REVIEW_FIX_BONUS } from "../src/rewards.js";
import { newAttemptId } from "../src/answer-apply.js";
import { emptyAbility, updateAbility } from "../src/ability-engine.js";
import { authModeFromUrl } from "../src/app-routing.js";

const CATS = ["Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance", "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology", "Reduction of Risk", "Physiological Adaptation"];
const mk = (id, extra = {}) => ({ id, cat: "Pharmacology", diff: 2, type: "mc", stem: "Which action should the nurse take first for this client?", options: ["a", "b", "c", "d"], answer: [0], rationale: "Because.", ...extra });
const trialCatalog = [mk(1), mk(2, { cat: "Reduction of Risk" }), mk(3, { diff: 3 }), mk(4), mk(7), mk(9)];
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const NOW = new Date(2026, 10, 23, 18, 0).getTime();
const TODAY = "2026-11-23";

describe("guest content boundary", () => {
  it("serves only built-in single-best-answer and select-all items, never AI, exam, or premium items", () => {
    const pool = guestPool([mk(1), mk(2, { type: "sata" }), mk(3, { ai: true }), mk(4, { exam_form: 2 }), mk(5, { type: "bowtie" }), mk(6, { premium: true })]);
    expect(pool.map((q) => q.id)).toEqual([1, 2]);
  });
  it("the real built-in set gives a guest enough questions for the trial", async () => {
    const { QUESTIONS } = await import("../src/App.jsx");
    const pool = guestPool(QUESTIONS);
    expect(pool.length).toBeGreaterThanOrEqual(GUEST_LIMIT * 2);
    expect(pool.every((q) => !q.ai && q.rationale)).toBe(true);
  });
  it("stops at the limit", () => {
    let g = emptyGuest(NOW, TODAY);
    for (let i = 0; i < GUEST_LIMIT + 2; i++) g = guestAnswer(g, mk(i), true, { ms: 9000, today: TODAY }).guest;
    expect(g.log.length).toBe(GUEST_LIMIT);
    expect(guestRemaining(g)).toBe(0);
    expect(guestAnswer(g, mk(99), true, { ms: 9000 }).accepted).toBe(false);
  });
});

describe("guest XP uses the same rules as an account", () => {
  it("does not teach routine vitamin K for an INR under 10 without bleeding", () => {
    const item = QUESTIONS.find((q) => q.id === 3);
    expect(guestPool(QUESTIONS).some((q) => q.id === 3)).toBe(true);
    expect(item.options[item.answer]).toBe("Hold the next warfarin dose and recheck the INR");
    expect(item.rationale).toMatch(/routine vitamin K is not indicated/);
  });
  it("a too-fast tap earns no XP and does not build a run", () => {
    const r = guestAnswer(emptyGuest(NOW, TODAY), mk(1), true, { ms: 300, today: TODAY });
    expect(r.res).toMatchObject({ xp: 0, reason: "too-fast", run: 0 });
  });
  it("keeps a too-fast trial answer at 0 XP when it is added to an account", () => {
    const answered = guestAnswer(emptyGuest(NOW, TODAY), mk(1), true, { ms: 100, today: TODAY });
    expect(answered.guest.xp).toBe(0);
    expect(answered.guest.log[0].ms).toBe(100);
    const merged = mergeGuestIntoBlob(migrateBlob({}, CATS), answered.guest, { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(merged.summary.xp).toBe(0);
    expect(merged.blob.xp).toBe(0);
    expect(merged.blob.log[0]).toMatchObject({ id: 1, key: "builtin:1", cat: "Pharmacology", diff: 2, correct: true });
  });
  it("a save that started before Add does not clear the guest copy", () => {
    let pending = false;
    const earlierSave = pending;
    pending = true;
    expect(guestClearOnSave(earlierSave)).toBe(false);
    expect(guestClearOnSave(pending)).toBe(true);
  });
  it("a rapid repeat of a known answer does not build a run", () => {
    const first = guestAnswer(emptyGuest(NOW, TODAY), mk(1), true, { ms: 9000, today: TODAY });
    const again = guestAnswer(first.guest, mk(1), true, { ms: 100, today: TODAY });
    expect(again.res).toMatchObject({ xp: 0, reason: "repeat", run: 0 });
    expect(again.guest.bestRun).toBe(1);
    expect(again.guest.run).toBe(0);
  });
  it("a stalled save reports a timeout and sign-out then drops leftover recovery keys", async () => {
    const queue = createSaveQueue();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    queue.enqueue(queue.next(), () => gate);
    const result = await waitForFlush(() => queue.flush(), 30);
    expect(result.timedOut).toBe(true);
    const storage = memStore();
    const session = memStore();
    saveGuest(storage, guestAnswer(emptyGuest(NOW, TODAY), mk(1), true, { ms: 9000, today: TODAY }).guest);
    holdGuestTrial(loadGuest(storage), session);
    storage.setItem("pulsern-pending-progress-v1", "{\"log\":[]}");
    storage.setItem("pulsern-pending-progress-v1:abc", "{\"examDate\":\"2026-12-01\"}");
    storage.setItem("pulsern-theme", "dim");
    const { signOutAndForgetTrial } = await import("../src/sign-out.js");
    const { sweepPendingProgress } = await import("../src/progress-load.js");
    await signOutAndForgetTrial({ auth: { signOut: async () => {} }, storage, holdStorage: session });
    expect(loadGuest(storage)).toBeNull();
    expect(peekHeldGuest(session)).toBeNull();
    expect([...storage.m.keys()].some((key) => String(key).startsWith("pulsern-pending-progress-v1"))).toBe(false);
    expect(storage.getItem("pulsern-theme")).toBe("dim");
    storage.setItem("pulsern-pending-progress-v1:later", "{}");
    sweepPendingProgress(storage);
    expect(storage.getItem("pulsern-pending-progress-v1:later")).toBeNull();
    const firstId = newAttemptId();
    expect(firstId).not.toBe(newAttemptId());
    expect(firstId.startsWith("live:")).toBe(true);
    release();
  });
  it("flush finishes the newest queued save before sign-out can drop it", async () => {
    const queue = createSaveQueue();
    let release;
    let started;
    const gate = new Promise((resolve) => { release = resolve; });
    const startedGate = new Promise((resolve) => { started = resolve; });
    const writes = [];
    queue.enqueue(queue.next(), async () => { started(); await gate; writes.push("first"); });
    await startedGate;
    queue.enqueue(queue.next(), async () => { writes.push("second"); });
    const pending = queue.flush();
    release();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(writes).toEqual(["first", "second"]);
    const dropped = queue.enqueue(queue.next(), async () => { writes.push("third"); });
    queue.invalidate();
    await expect(dropped).resolves.toMatchObject({ stale: true });
    expect(writes).toEqual(["first", "second"]);
  });
  it("a merged built-in is not a new question, and a different bank item with the same number still is", () => {
    const bundled = { id: 7, source: "builtin", key: "builtin:7", cat: "Pharmacology", diff: 2, stem: "Which action should the nurse take first for this client?" };
    const bank = { id: 7, source: "bank", key: "bank:7", cat: "Pharmacology", diff: 2, stem: "A different shared-bank stem." };
    const log = [{ id: 7, source: "builtin", key: "builtin:7", cat: "Pharmacology", diff: 2, correct: true }];
    expect(answerXp({ q: bundled, correct: true, ms: 9000, log }).reason).toBe("repeat");
    expect(answerXp({ q: bank, correct: true, ms: 9000, log }).reason).toBe("correct");
  });
  it("a missing session is not a successful save", () => {
    expect(persistDecision(null, "user-1")).toBe("signed-out");
    expect(persistDecision({ user: {} }, "user-1")).toBe("signed-out");
    expect(persistDecision({ user: { id: "user-2" } }, "user-1")).toBe("account-changed");
    expect(persistDecision({ user: { id: "user-1" } }, "user-1")).toBe("write");
  });
  it("a considered correct answer earns 10 × difficulty", () => {
    const r = guestAnswer(emptyGuest(NOW, TODAY), mk(1), true, { ms: 9000, today: TODAY });
    expect(r.guest.xp).toBe(20);
    expect(r.res.run).toBe(1);
  });
});

describe("storage", () => {
  it("reports a failed device write instead of pretending the trial was stored", () => {
    const s = { getItem: () => null, setItem() { throw new Error("quota"); }, removeItem() {} };
    expect(saveGuest(s, emptyGuest(NOW, TODAY))).toBe(false);
    expect(readFileSync("src/guest.jsx", "utf8")).toContain("setDeviceSaved(saveGuest");
  });
  it("round-trips through localStorage and clears", () => {
    const s = memStore();
    const g = guestAnswer(emptyGuest(NOW, TODAY), mk(1), true, { ms: 9000, today: TODAY }).guest;
    saveGuest(s, g);
    expect(loadGuest(s)).toEqual(g);
    clearGuest(s);
    expect(s.m.has(GUEST_KEY)).toBe(false);
  });
  it("ignores corrupt or stale data", () => {
    const s = memStore();
    s.setItem(GUEST_KEY, "{not json");
    expect(loadGuest(s)).toBeNull();
    const old = { ...emptyGuest(NOW - 8 * 86400000, "2026-11-15"), log: [{ id: 1, cat: "Pharmacology", diff: 2, correct: true }] };
    expect(guestFresh(old, NOW)).toBe(false);
  });
});

describe("progress handoff into a new account", () => {
  const played = () => {
    let g = emptyGuest(NOW, TODAY);
    g = guestAnswer(g, mk(1), true, { ms: 9000, today: TODAY }).guest;
    g = guestAnswer(g, mk(2, { cat: "Reduction of Risk" }), false, { ms: 9000, today: TODAY }).guest;
    g = guestAnswer(g, mk(3, { diff: 3 }), true, { ms: 9000, today: TODAY }).guest;
    return g;
  };

  it("carries answers, XP, ability, today's count and day 1 of the streak", () => {
    const blob = migrateBlob({}, CATS);
    const { blob: out, summary } = mergeGuestIntoBlob(blob, played(), { today: TODAY, now: NOW, updateAbility, catalog: trialCatalog });
    expect(summary).toMatchObject({ answers: 3, correct: 2, xp: 50, streak: 1, streakStarted: true });
    expect(out.log.map((l) => l.key)).toEqual(["builtin:1", "builtin:2", "builtin:3"]);
    expect(out.xp).toBe(50);
    expect(out.daily).toEqual({ day: TODAY, answered: 3 });
    expect(out.streak).toMatchObject({ count: 1, lastDay: TODAY });
    expect(out.ability.Pharmacology.n).toBe(2);
    expect(out.ability).not.toEqual(emptyAbility(CATS));
    expect(out.rewards.days[TODAY]).toMatchObject({ q: 3, ok: 2, xp: 50 });
    // the merged blob is still a valid, frozen-contract blob
    expect(migrateBlob(JSON.parse(JSON.stringify(out)), CATS).log).toEqual(out.log);
  });

  it("a built-in answer does not collide with a shared-bank answer of the same number", () => {
    const blob = { ...migrateBlob({}, CATS), log: [{ id: 1, source: "bank", key: "bank:1", cat: "Pharmacology", diff: 2, correct: false }] };
    const { blob: out } = mergeGuestIntoBlob(blob, played(), { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(out).toBe(blob);
    expect(out.log.map((l) => l.key)).toEqual(["bank:1"]);
    expect(out.missSchedule["builtin:2"]).toBeUndefined();
    expect(out.xp).toBe(blob.xp);
  });

  it("is idempotent: merging twice adds nothing the second time", () => {
    const g = played();
    const once = mergeGuestIntoBlob(migrateBlob({}, CATS), g, { today: TODAY, now: NOW, catalog: trialCatalog }).blob;
    const twice = mergeGuestIntoBlob(once, g, { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(twice.summary).toBeNull();
    expect(twice.blob).toBe(once);
  });

  it("adds to an existing account without breaking its streak", () => {
    const blob = { ...migrateBlob({}, CATS), xp: 400, streak: { count: 12, lastDay: TODAY, shield: true } };
    const { blob: out, summary } = mergeGuestIntoBlob(blob, played(), { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(out.xp).toBe(450);
    expect(out.streak.count).toBe(12);
    expect(summary.streakStarted).toBe(false);
  });

  it("ignores stale guest data", () => {
    const g = { ...played(), startedAt: NOW - 9 * 86400000, lastAt: NOW - 8 * 86400000 };
    expect(mergeGuestIntoBlob(migrateBlob({}, CATS), g, { today: TODAY, now: NOW, catalog: trialCatalog }).summary).toBeNull();
  });

  it("credits each answer to the local day it was taken, including across midnight", () => {
    let g = emptyGuest(NOW, "2026-11-23");
    g = guestAnswer(g, mk(1), true, { ms: 9000, today: "2026-11-23" }).guest;
    g = guestAnswer(g, mk(2), false, { ms: 9000, today: "2026-11-24" }).guest;
    const { blob, summary } = mergeGuestIntoBlob(migrateBlob({}, CATS), g, { today: "2026-11-24", now: new Date(2026, 10, 24, 18).getTime(), catalog: trialCatalog });
    expect(blob.rewards.days["2026-11-23"]).toMatchObject({ q: 1, ok: 1 });
    expect(blob.rewards.days["2026-11-24"]).toMatchObject({ q: 1, ok: 0 });
    expect(blob.streak).toMatchObject({ count: 2, lastDay: "2026-11-24" });
    expect(blob.daily).toEqual({ day: "2026-11-24", answered: 1 });
    expect(blob.missSchedule["builtin:2"].interval).toBe(1);
    expect(summary.streak).toBe(2);
    expect(blob.log.map((row) => row.day)).toEqual(["2026-11-23", "2026-11-24"]);
  });
  it("a stale autosave does not finish after the merged save", async () => {
    const queue = createSaveQueue();
    const order = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const older = queue.enqueue(queue.next(), async () => { order.push("a-start"); await gate; order.push("a-end"); });
    const newer = queue.enqueue(queue.next(), async () => { order.push("b"); });
    release();
    expect(await older).toMatchObject({ stale: true });
    expect(await newer).toEqual({ ok: true });
    expect(order).toEqual(["b"]);
  });
  it("a stalled write unblocks the next save and does not land afterward", async () => {
    vi.useFakeTimers();
    try {
    const queue = createSaveQueue({ attemptMs: 1000 });
    const writes = [];
    let release;
    let started;
    let seenSignal;
    const gate = new Promise((resolve) => { release = resolve; });
    const startedGate = new Promise((resolve) => { started = resolve; });
    const first = queue.enqueue(queue.next(), async ({ signal }) => {
      seenSignal = signal;
      started();
      await new Promise((resolvePromise, reject) => {
        const fail = () => reject(Object.assign(new Error("aborted"), { code: "aborted" }));
        if (signal.aborted) fail();
        else signal.addEventListener("abort", fail, { once: true });
        gate.then(resolvePromise);
      });
      writes.push("first");
    });
    await startedGate;
    expect(seenSignal.aborted).toBe(false);
    const second = queue.enqueue(queue.next(), async () => { writes.push("second"); });
    await vi.advanceTimersByTimeAsync(1000);
    expect(seenSignal.aborted).toBe(true);
    await expect(first).resolves.toMatchObject({ stale: true });
    await expect(second).resolves.toEqual({ ok: true });
    expect(writes).toEqual(["second"]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toEqual(["second"]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("a late older snapshot cannot replace the newer one", () => {
    const rows = [{ userId: "u", key: "pulsern-v1", blob: { log: [] }, revision: 0 }];
    const newer = applyProgressWrite(rows, { userId: "u", key: "pulsern-v1", blob: { log: [1, 2] }, expectedRevision: 0 });
    const older = applyProgressWrite(rows, { userId: "u", key: "pulsern-v1", blob: { log: [1] }, expectedRevision: 0 });
    expect(newer.revision).toBe(1);
    expect(older.conflict).toBe(true);
    expect(rows[0].blob.log).toEqual([1, 2]);
  });
  it("says saved only after the merged write succeeds", () => {
    expect(handoffAfterSave({ ok: true, pending: true })).toBe("saved");
    expect(handoffAfterSave({ ok: false, pending: true })).toBe("error");
    expect(handoffAfterSave({ ok: true, pending: false })).toBe("none");
  });
  it("keeps the account's other review dates when a trial miss is added", () => {
    let g = emptyGuest(NOW, TODAY);
    g = guestAnswer(g, mk(2), false, { ms: 9000, today: TODAY }).guest;
    const blob = { ...migrateBlob({}, CATS), missSchedule: { 9: { interval: 7, due: "2026-12-01" } } };
    const { blob: out } = mergeGuestIntoBlob(blob, g, { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(out.missSchedule[9]).toEqual({ interval: 7, due: "2026-12-01" });
    expect(out.missSchedule["builtin:2"].interval).toBe(1);
  });
  it("a two-day trial reports a two-day streak", () => {
    let g = emptyGuest(NOW, "2026-11-23");
    g = guestAnswer(g, mk(1), true, { ms: 9000, today: "2026-11-23" }).guest;
    g = guestAnswer(g, mk(2), true, { ms: 9000, today: "2026-11-24" }).guest;
    expect(guestSummary(g).streak).toBe(2);
  });
  it("an imported answer uses the catalog stem, so a fast tap stays at 0 XP", () => {
    const long = mk(1, { stem: "word ".repeat(40) });
    const answered = guestAnswer(emptyGuest(NOW, TODAY), long, true, { ms: 2500, today: TODAY });
    const merged = mergeGuestIntoBlob(migrateBlob({}, CATS), answered.guest, { today: TODAY, now: NOW, catalog: [long] });
    expect(answered.res.xp).toBe(0);
    expect(merged.summary?.xp ?? merged.blob.xp).toBe(0);
  });
  it("summarises the trial for the save screen", () => {
    expect(guestSummary(played())).toMatchObject({ n: 3, ok: 2, acc: 67, xp: 50 });
  });
});

describe("a trial cannot be lost, duplicated, or over-paid", () => {
  const trial = (startedAt, correct) => {
    const g = guestAnswer({ ...emptyGuest(startedAt, TODAY), startedAt }, mk(1), correct, { ms: 9000, today: TODAY }).guest;
    return { ...g, lastAt: startedAt };
  };

  it("keeps an unstored trial when the sign-up screen replaces it", () => {
    releaseHeldGuest();
    const g = trial(NOW, true);
    const local = { getItem: () => null, setItem() { throw new Error("quota"); }, removeItem() {} };
    const session = memStore();
    expect(saveGuest(local, g)).toBe(false);
    expect(holdGuestTrial(g, session)).toBe(true);
    clearHeldMemory();
    expect(loadGuest(local)).toBeNull();
    expect(readGuestForHandoff(local, session)).toEqual(g);
    const merged = mergeGuestIntoBlob(migrateBlob({}, CATS), readGuestForHandoff(local, session), { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(merged.summary.answers).toBe(1);
    expect(peekHeldGuest(session)).toEqual(g);
    releaseHeldGuest(session);
    expect(readGuestForHandoff(local, session)).toBeNull();
  });

  it("does not release the hold until the account write is confirmed", () => {
    expect(guestClearOnSave(false)).toBe(false);
    expect(guestClearOnSave(true)).toBe(true);
    const app = readFileSync("src/App.jsx", "utf8");
    const save = app.slice(app.indexOf("autosave on change"), app.indexOf("autosave on change") + 2200);
    expect(save.indexOf("releaseHeldGuest(storageOrNull(() => window.sessionStorage))")).toBeGreaterThan(save.indexOf("guestClearOnSave(pendingAtStart)"));
    expect(readFileSync("src/guest.jsx", "utf8")).toContain("holdGuestTrial(guest, sessionBox())");
  });

  it("prefers the longer held copy over a short device copy and never adds both", () => {
    releaseHeldGuest();
    const early = trial(NOW, false);
    const later = trial(NOW + 1000, true);
    const local = memStore();
    const session = memStore();
    saveGuest(local, early);
    holdGuestTrial(later, session);
    clearHeldMemory();
    const chosen = readGuestForHandoff(local, session);
    expect(chosen).toEqual(later);
    const merged = mergeGuestIntoBlob(migrateBlob({}, CATS), chosen, { today: TODAY, now: NOW + 1000, catalog: trialCatalog });
    expect(merged.blob.log).toHaveLength(1);
    releaseHeldGuest(session);
  });

  it("imports a later attempt of the same question and does not pay it twice", () => {
    const first = trial(NOW, false);
    const second = trial(NOW + 5000, true);
    second.missSchedule = { 1: { interval: 3, due: "2026-11-27" } };
    const once = mergeGuestIntoBlob(migrateBlob({}, CATS), first, { today: TODAY, now: NOW, catalog: trialCatalog });
    const twice = mergeGuestIntoBlob(once.blob, second, { today: TODAY, now: NOW + 5000, catalog: trialCatalog });
    expect(twice.summary).toBeNull();
    expect(twice.blob.log.map((l) => l.key)).toEqual(["builtin:1"]);
    expect(twice.blob.xp).toBe(once.blob.xp);
    expect(twice.blob.ability).toEqual(once.blob.ability);
    expect(twice.blob.missSchedule["builtin:1"].interval).toBe(1);
  });

  it("scores two attempts of one question inside a single trial only once", () => {
    let g = emptyGuest(NOW, TODAY);
    g = guestAnswer(g, mk(1), false, { ms: 9000, today: TODAY }).guest;
    g = guestAnswer(g, mk(1), true, { ms: 9000, today: TODAY }).guest;
    const merged = mergeGuestIntoBlob(migrateBlob({}, CATS), g, { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(merged.blob.log).toHaveLength(2);
    expect(merged.blob.xp).toBe(REVIEW_FIX_BONUS);
    expect(merged.blob.ability.Pharmacology.n).toBe(2);
    expect(merged.blob.missSchedule["builtin:1"].interval).toBe(3);
  });

  it("gives an old row without an attempt a stable id, so a retry does not duplicate it", () => {
    const g = { ...emptyGuest(NOW, TODAY), lastAt: NOW, log: [{ id: 4, cat: "Pharmacology", diff: 2, correct: true }] };
    const once = mergeGuestIntoBlob(migrateBlob({}, CATS), g, { today: TODAY, now: NOW, catalog: trialCatalog });
    const twice = mergeGuestIntoBlob(once.blob, g, { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(once.blob.log).toHaveLength(1);
    expect(once.blob.log[0].attempt).toBe(`${NOW}:0`);
    expect(twice.summary).toBeNull();
    expect(twice.blob.xp).toBe(once.blob.xp);
  });

  it("pays a second correct attempt of the same question nothing", () => {
    const first = trial(NOW, true);
    const second = trial(NOW + 5000, true);
    const once = mergeGuestIntoBlob(migrateBlob({}, CATS), first, { today: TODAY, now: NOW, catalog: trialCatalog });
    const twice = mergeGuestIntoBlob(once.blob, second, { today: TODAY, now: NOW + 5000, catalog: trialCatalog });
    expect(twice.summary).toBeNull();
    expect(twice.blob.log).toHaveLength(1);
    expect(twice.blob.xp).toBe(once.blob.xp);
  });

  it("a retried merge of one trial does not double the streak or the XP", () => {
    let g = emptyGuest(NOW, TODAY);
    g = guestAnswer(g, mk(1), true, { ms: 9000, today: TODAY }).guest;
    g = guestAnswer(g, mk(2), false, { ms: 9000, today: TODAY }).guest;
    const once = mergeGuestIntoBlob(migrateBlob({}, CATS), g, { today: TODAY, now: NOW, catalog: trialCatalog });
    const twice = mergeGuestIntoBlob(once.blob, g, { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(twice.summary).toBeNull();
    expect(twice.blob.xp).toBe(once.blob.xp);
    expect(twice.blob.streak.count).toBe(once.blob.streak.count);
  });

  it("does not pay a new first try for a built-in the account already answered, and a bank 7 does not count", () => {
    let correct = emptyGuest(NOW, TODAY);
    correct = guestAnswer(correct, mk(7), true, { ms: 9000, today: TODAY }).guest;
    const account = { ...migrateBlob({}, CATS), log: [{ id: 7, source: "builtin", key: "builtin:7", cat: "Pharmacology", diff: 2, correct: true, origin: "recorded" }], xp: 20, streak: { count: 4, lastDay: "2026-11-22", shield: true } };
    const paid = mergeGuestIntoBlob(account, correct, { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(paid.summary).toBeNull();
    expect(paid.blob.xp).toBe(20);
    expect(paid.blob.ability.Pharmacology.n).toBe(0);
    expect(paid.blob.streak.count).toBe(4);
    expect(paid.blob.log.map((row) => row.key)).toEqual(["builtin:7"]);
    const bankAccount = { ...account, log: [{ id: 7, source: "bank", key: "bank:7", cat: "Pharmacology", diff: 2, correct: true, origin: "recorded" }], xp: 20 };
    const unrelated = mergeGuestIntoBlob(bankAccount, correct, { today: TODAY, now: NOW, catalog: trialCatalog });
    expect(unrelated.summary).toBeNull();
    expect(unrelated.blob).toBe(bankAccount);
    expect(unrelated.blob.xp).toBe(20);
    expect(guestImportIdentity({ id: 7 }).key).toBe("builtin:7");
    expect(guestImportIdentity({ id: 7, source: "bank" }).key).toBe("bank:7");
  });
  it("sign-out forgets a held trial in session storage, not only the device copy", async () => {
    releaseHeldGuest();
    const local = memStore();
    const session = memStore();
    holdGuestTrial(trial(NOW, true), session);
    clearHeldMemory();
    const { signOutAndForgetTrial } = await import("../src/sign-out.js");
    await signOutAndForgetTrial({ auth: { signOut: async () => {} }, storage: local, holdStorage: session });
    expect(session.getItem(GUEST_HOLD_KEY)).toBeNull();
    expect(readGuestForHandoff(local, session)).toBeNull();
    const guestSrc = readFileSync("src/guest.jsx", "utf8");
    expect(guestSrc).toContain("const leaveForAuth");
    expect(guestSrc).toContain("onClick={() => leaveForAuth(onSignIn)}");
    expect(guestSrc).toContain("onGuestSignIn={() => leaveForAuth(onSignUp)}");
  });
  it("a sign-out in another tab clears this tab's memory and sessionStorage hold", async () => {
    releaseHeldGuest();
    const local = memStore();
    const session = memStore();
    const g = trial(NOW, true);
    saveGuest(local, g);
    holdGuestTrial(g, session);
    const { forgetTrialOnRemoteSignOut, remoteSignOutStorageEvent } = await import("../src/sign-out.js");
    expect(forgetTrialOnRemoteSignOut("SIGNED_IN", { storage: local, holdStorage: session })).toBe(false);
    expect(peekHeldGuest(session)?.log.length).toBe(1);
    expect(remoteSignOutStorageEvent({ key: "theme", newValue: null })).toBe(false);
    expect(remoteSignOutStorageEvent({ key: GUEST_KEY, newValue: null })).toBe(true);
    expect(remoteSignOutStorageEvent({ key: "sb-example-auth-token", newValue: null })).toBe(true);
    expect(forgetTrialOnRemoteSignOut("SIGNED_OUT", { storage: local, holdStorage: session })).toBe(true);
    expect(local.getItem(GUEST_KEY)).toBeNull();
    expect(session.getItem(GUEST_HOLD_KEY)).toBeNull();
    expect(peekHeldGuest(session)).toBeNull();
    const auth = readFileSync("src/auth.jsx", "utf8");
    expect(auth).toContain('if (event === "SIGNED_OUT") forgetTrial()');
    expect(auth).toContain('addEventListener("storage", onStorage)');
  });
});

describe("routing", () => {
  it("/app/try opens the guest trial; the other app paths are unchanged", () => {
    expect(authModeFromUrl("https://www.pulsern.app/app/try")).toBe("try");
    expect(authModeFromUrl("https://www.pulsern.app/app/try?utm_source=x")).toBe("try");
    expect(authModeFromUrl("https://www.pulsern.app/app/try?start=1")).toBe("try");
    expect(authModeFromUrl("https://www.pulsern.app/app/?start=1")).toBe("signup");
    expect(authModeFromUrl("https://www.pulsern.app/app/sign-up?cohort=clinicals")).toBe("signup");
    expect(authModeFromUrl("https://www.pulsern.app/app/")).toBe("signin");
  });
});
