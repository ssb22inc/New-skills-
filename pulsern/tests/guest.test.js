/* Try before sign-up (src/guest.js): only free built-in content, a hard
   question limit, the same XP rules as an account, and a one-time,
   collision-free handoff into the account blob. */
import { describe, it, expect } from "vitest";
import {
  GUEST_KEY, GUEST_LIMIT, guestPool, emptyGuest, guestAnswer, guestRemaining, mergeGuestIntoBlob, loadGuest, saveGuest, clearGuest, guestFresh, guestSummary,
} from "../src/guest.js";
import { migrateBlob } from "../src/state.js";
import { emptyAbility, updateAbility } from "../src/ability-engine.js";
import { authModeFromUrl } from "../src/app-routing.js";

const CATS = ["Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance", "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology", "Reduction of Risk", "Physiological Adaptation"];
const mk = (id, extra = {}) => ({ id, cat: "Pharmacology", diff: 2, type: "mc", stem: "Which action should the nurse take first for this client?", options: ["a", "b", "c", "d"], answer: [0], rationale: "Because.", ...extra });
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
  it("a too-fast tap earns no XP and does not build a run", () => {
    const r = guestAnswer(emptyGuest(NOW, TODAY), mk(1), true, { ms: 300, today: TODAY });
    expect(r.res).toMatchObject({ xp: 0, reason: "too-fast", run: 0 });
  });
  it("a considered correct answer earns 10 × difficulty", () => {
    const r = guestAnswer(emptyGuest(NOW, TODAY), mk(1), true, { ms: 9000, today: TODAY });
    expect(r.guest.xp).toBe(20);
    expect(r.res.run).toBe(1);
  });
});

describe("storage", () => {
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
    const { blob: out, summary } = mergeGuestIntoBlob(blob, played(), { today: TODAY, now: NOW, updateAbility });
    expect(summary).toMatchObject({ answers: 3, correct: 2, xp: 50, streak: 1, streakStarted: true });
    expect(out.log.map((l) => l.id)).toEqual(["guest-1", "guest-2", "guest-3"]);
    expect(out.xp).toBe(50);
    expect(out.daily).toEqual({ day: TODAY, answered: 3 });
    expect(out.streak).toMatchObject({ count: 1, lastDay: TODAY });
    expect(out.ability.Pharmacology.n).toBe(2);
    expect(out.ability).not.toEqual(emptyAbility(CATS));
    expect(out.rewards.days[TODAY]).toMatchObject({ q: 3, ok: 2, xp: 50 });
    // the merged blob is still a valid, frozen-contract blob
    expect(migrateBlob(JSON.parse(JSON.stringify(out)), CATS).log).toEqual(out.log);
  });

  it("prefixes ids so a built-in id never collides with a shared-bank id", () => {
    const blob = { ...migrateBlob({}, CATS), log: [{ id: 1, cat: "Pharmacology", diff: 2, correct: false }] };
    const { blob: out } = mergeGuestIntoBlob(blob, played(), { today: TODAY, now: NOW });
    expect(out.log.filter((l) => l.id === 1)).toHaveLength(1);
    expect(out.log.some((l) => l.id === "guest-1")).toBe(true);
  });

  it("is idempotent: merging twice adds nothing the second time", () => {
    const g = played();
    const once = mergeGuestIntoBlob(migrateBlob({}, CATS), g, { today: TODAY, now: NOW }).blob;
    const twice = mergeGuestIntoBlob(once, g, { today: TODAY, now: NOW });
    expect(twice.summary).toBeNull();
    expect(twice.blob).toBe(once);
  });

  it("adds to an existing account without breaking its streak", () => {
    const blob = { ...migrateBlob({}, CATS), xp: 400, streak: { count: 12, lastDay: TODAY, shield: true } };
    const { blob: out, summary } = mergeGuestIntoBlob(blob, played(), { today: TODAY, now: NOW });
    expect(out.xp).toBe(450);
    expect(out.streak.count).toBe(12);
    expect(summary.streakStarted).toBe(false);
  });

  it("ignores stale guest data", () => {
    const g = { ...played(), startedAt: NOW - 9 * 86400000, lastAt: NOW - 8 * 86400000 };
    expect(mergeGuestIntoBlob(migrateBlob({}, CATS), g, { today: TODAY, now: NOW }).summary).toBeNull();
  });

  it("summarises the trial for the save screen", () => {
    expect(guestSummary(played())).toMatchObject({ n: 3, ok: 2, acc: 67, xp: 50 });
  });
});

describe("routing", () => {
  it("/app/try opens the guest trial; the other app paths are unchanged", () => {
    expect(authModeFromUrl("https://www.pulsern.app/app/try")).toBe("try");
    expect(authModeFromUrl("https://www.pulsern.app/app/try?utm_source=x")).toBe("try");
    expect(authModeFromUrl("https://www.pulsern.app/app/sign-up?cohort=clinicals")).toBe("signup");
    expect(authModeFromUrl("https://www.pulsern.app/app/")).toBe("signin");
  });
});
