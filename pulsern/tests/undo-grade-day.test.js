/* Undo grade on the day's first card leaves the state exactly as it was
   before the grade (Astra, PR #184 review at 751cc9e, major 1). */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { emptyRewards, advanceStreak, gradeSnapshot, undoGradeEffects } from "../src/rewards.js";

const TODAY = "2026-11-25";
const YESTERDAY = "2026-11-24";

function gradeOpensDay({ streak, rewards, daily }) {
  const snap = gradeSnapshot({ streak, rewards, touched: null, today: TODAY, id: "touch:a" });
  const adv = advanceStreak(streak, rewards, TODAY);
  const after = {
    streak: adv.streak,
    rewards: { ...rewards, covers: adv.rewards.covers, coverDays: adv.rewards.coverDays, milestones: adv.rewards.milestones, best: { ...rewards.best, streak: Math.max(rewards.best.streak, adv.streak.count) } },
    daily: daily.day === TODAY ? { ...daily, answered: daily.answered + 1 } : { day: TODAY, answered: 1 },
    moments: adv.milestone ? [{ kind: "milestone", source: snap.id }] : [],
  };
  return { snap, after, adv };
}

describe("Undo grade on the day's first card", () => {
  it("puts the streak, milestones, best streak and moments back", () => {
    const rewards = { ...emptyRewards(), rankHigh: 0, best: { ...emptyRewards().best, streak: 6 } };
    const streak = { count: 6, lastDay: YESTERDAY, shield: true };
    const { snap, after, adv } = gradeOpensDay({ streak, rewards, daily: { day: YESTERDAY, answered: 4 } });
    expect(adv.streak.count).toBe(7);
    expect(adv.milestone).toBeTruthy();
    const undone = undoGradeEffects({ ...after, earnedNow: 0 }, snap);
    expect(undone.reverted).toBe(true);
    expect(undone.streak).toEqual(streak);
    expect(undone.rewards.milestones).toEqual(rewards.milestones);
    expect(undone.rewards.best.streak).toBe(6);
    expect(undone.rewards.covers).toBe(rewards.covers);
    expect(undone.moments).toEqual([]);
    expect(undone.touched).toBeNull();
  });

  it("gives back a shift cover the grade spent to bridge a missed day", () => {
    const rewards = { ...emptyRewards(), rankHigh: 0, covers: 1 };
    const streak = { count: 10, lastDay: "2026-11-23", shield: false };
    const { snap, after, adv } = gradeOpensDay({ streak, rewards, daily: { day: "2026-11-23", answered: 3 } });
    expect(adv.event).toBe("cover");
    const undone = undoGradeEffects({ ...after, earnedNow: 0 }, snap);
    expect(undone.streak).toEqual(streak);
    expect(undone.rewards.covers).toBe(1);
    expect(undone.rewards.coverDays).toEqual(rewards.coverDays);
  });

  it("keeps the day when other study happened after the grade", () => {
    const rewards = { ...emptyRewards(), rankHigh: 0 };
    const streak = { count: 2, lastDay: YESTERDAY, shield: true };
    const { snap, after } = gradeOpensDay({ streak, rewards, daily: { day: YESTERDAY, answered: 1 } });
    const busier = { ...after, daily: { day: TODAY, answered: 3 } };
    const undone = undoGradeEffects({ ...busier, earnedNow: 0 }, snap);
    expect(undone.reverted).toBe(false);
    expect(undone.streak).toEqual(after.streak);
  });

  it("takes back a rank the grade's XP lifted, and its moment", () => {
    const rewards = { ...emptyRewards(), rankHigh: 1 };
    const snap = gradeSnapshot({ streak: { count: 3, lastDay: TODAY, shield: true }, rewards, today: TODAY, id: "touch:b" });
    const lifted = { ...rewards, rankHigh: 2 };
    const undone = undoGradeEffects({ streak: { count: 3, lastDay: TODAY, shield: true }, rewards: lifted, daily: { day: TODAY, answered: 5 }, moments: [{ kind: "rank", index: 2 }], earnedNow: 1 }, snap);
    expect(undone.rewards.rankHigh).toBe(1);
    expect(undone.moments).toEqual([]);
    const stillEarned = undoGradeEffects({ streak: { count: 3, lastDay: TODAY, shield: true }, rewards: lifted, daily: { day: TODAY, answered: 5 }, moments: [], earnedNow: 2 }, snap);
    expect(stillEarned.rewards.rankHigh).toBe(2);
  });

  it("is wired: the card grade keeps touchDay's snapshot and Undo passes it back", () => {
    const app = fs.readFileSync("src/App.jsx", "utf8");
    expect(app).toMatch(/const daySnap = touchDay\?\.\(\) \?\? null;/);
    expect(app).toContain("onUngrade?.(rec.xp, rec.day, rec.opId ? { id: rec.opId } : null, rec.daySnap ?? null);");
    expect(app).toMatch(/const unnoteCard = \(cardXpGain = 0, day, op, snap = null\)/);
    expect(app).toContain("undoGradeEffects(");
  });
});

describe("catalog banner", () => {
  it("raises the question-catalog alert only when the question bank failed", () => {
    const app = fs.readFileSync("src/App.jsx", "utf8");
    expect(app).toContain("const catalogError = bankFailed;");
    expect(app).toContain("const casesOnlyError = casesFailed && !bankFailed;");
    expect(app).not.toContain("bankFailed || casesFailed");
    expect(app).toContain("Some case studies didn't load. Practice questions still work.");
  });
});

describe("022 rollback", () => {
  it("drops every object 022 adds", () => {
    const sql = fs.readFileSync("supabase/rollback/rollback_progress_revision_guard_022.sql", "utf8");
    for (const part of [
      "drop trigger if exists progress_revision_guard on public.progress",
      "drop function if exists public.progress_revision_guard()",
      "drop table if exists public.progress_pending_merge",
      "drop column if exists legacy_hold",
      "pending_merge_select", "pending_merge_delete", "pending_merge_insert",
    ]) expect(sql).toContain(part);
  });
});
