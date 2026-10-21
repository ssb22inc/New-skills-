/* The free pass is 7 days for a new account and for an unpaid account that
   already has one. Paid plans, comps, and readiness exams stay put.
   Migration 017 is the production copy of adjustUnpaidFreePass. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { planById } from "../src/pricing.js";
import {
  FREE_PASS_ID, LEGACY_FREE_PASS_MAX_MS, adjustUnpaidFreePass, freePassExpiresAt, freePassPlan,
} from "../src/free-pass.js";
import { buildMarketingPayload } from "../api/marketing.js";

const NOW = Date.parse("2026-10-10T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days) => new Date(NOW + days * DAY).toISOString();

function pass(overrides = {}) {
  return {
    plan: "pass1", starts_at: at(0), expires_at: at(1),
    exams_granted: 0, price_cents: 0, ...overrides,
  };
}

describe("new free pass", () => {
  it("grants seven days, no exams, and no charge", () => {
    const plan = freePassPlan();
    expect(plan.id).toBe(FREE_PASS_ID);
    expect(plan.days).toBe(7);
    expect(plan.cents).toBe(0);
    expect(plan.exams).toBe(0);
    expect(freePassExpiresAt(NOW)).toBe(at(7));
  });

  it("is the pass the marketing API serves", () => {
    const payload = buildMarketingPayload({
      funnel: { steps: [], trialsEnded: 0 },
      counts: { questions: 1, cases: 1, flashcards: 1 },
      byCategory: {},
      windowDays: 30,
    });
    const free = payload.pricing.find((p) => p.id === "pass1");
    expect(free).toMatchObject({
      id: "pass1", name: "7-Day Free Pass", days: 7, cents: 0, exams: 0,
    });
    expect(free.blurb).toMatch(/7 days/);
    expect(free.blurb).toMatch(/not included/i);
    const paid = payload.pricing.filter((p) => p.cents > 0);
    expect(paid.map((p) => [p.id, p.days, p.cents, p.exams])).toEqual([
      ["sub30", 30, 9900, 1],
      ["sub60", 60, 15900, 2],
      ["sub90", 90, 21900, 3],
      ["sub180", 180, 31900, 4],
      ["sub360", 360, 37900, 5],
      ["sub730", 730, 43900, 6],
      ["renew7", 7, 4500, 0],
      ["exam1", 0, 4500, 1],
    ]);
  });
});

describe("existing unpaid free passes", () => {
  it("lengthens an active pass to 7 days from when it started", () => {
    const row = pass({ starts_at: at(-0.5), expires_at: at(0.5) });
    const out = adjustUnpaidFreePass(row, { now: NOW });
    expect(out.action).toBe("extend-from-start");
    expect(out.expiresAt).toBe(new Date(Date.parse(row.starts_at) + 7 * DAY).toISOString());
  });

  it("does not lengthen a pass that is already 7 days from its start", () => {
    const row = pass({ starts_at: at(-1), expires_at: at(6) });
    expect(adjustUnpaidFreePass(row, { now: NOW }).action).toBe("leave");
  });

  it("does not shorten a pass that already runs longer than 7 days", () => {
    const row = pass({ starts_at: at(-1), expires_at: at(20) });
    expect(adjustUnpaidFreePass(row, { now: NOW }).action).toBe("leave");
  });

  it("gives an expired legacy pass a fresh 7 days from now", () => {
    const row = pass({ starts_at: at(-3), expires_at: at(-2) });
    const out = adjustUnpaidFreePass(row, { now: NOW });
    expect(out.action).toBe("refresh-from-now");
    expect(out.expiresAt).toBe(at(7));
  });

  it("is idempotent after that refresh, including once the new week ends", () => {
    const original = pass({ starts_at: at(-10), expires_at: at(-9) });
    const refreshed = adjustUnpaidFreePass(original, { now: NOW });
    const again = adjustUnpaidFreePass({ ...original, expires_at: refreshed.expiresAt }, { now: NOW });
    expect(again.action).toBe("leave");
    const after = adjustUnpaidFreePass(
      { ...original, expires_at: refreshed.expiresAt },
      { now: NOW + 8 * DAY },
    );
    expect(after.action).toBe("leave");
  });

  it("leaves paid and comped accounts alone", () => {
    const row = pass({ starts_at: at(-3), expires_at: at(-2) });
    expect(adjustUnpaidFreePass(row, { hasOtherPlan: true, now: NOW })).toMatchObject({
      action: "leave", reason: "paid-or-other-plan",
    });
  });

  it("leaves a free-pass row that already granted exams or charged money", () => {
    expect(adjustUnpaidFreePass(pass({ exams_granted: 1 }), { now: NOW }).reason).toBe("not-a-free-row");
    expect(adjustUnpaidFreePass(pass({ price_cents: 9900 }), { now: NOW }).reason).toBe("not-a-free-row");
  });

  it("ignores paid plan rows", () => {
    expect(adjustUnpaidFreePass({ plan: "sub30", starts_at: at(-1), expires_at: at(29), exams_granted: 1, price_cents: 9900 }, { now: NOW }).reason)
      .toBe("not-free-pass");
  });
});

describe("migration 017", () => {
  it("matches the client rule: 7 days, 26-hour legacy ceiling, paid rows untouched", () => {
    const sql = readFileSync(new URL("../supabase/migrations/017_free_pass_seven_days.sql", import.meta.url), "utf8");
    expect(sql).toContain("interval '7 days 1 hour'");
    expect(sql).toContain("interval '7 days'");
    expect(sql).toContain("interval '26 hours'");
    expect(LEGACY_FREE_PASS_MAX_MS).toBe(26 * 60 * 60 * 1000);
    expect(sql).toContain("other.plan <> 'pass1'");
    expect(sql).toContain("event = 'trial_end'");
    expect(sql).not.toMatch(/set\s+(?:plan|exams_granted|price_cents)\b/i);
    expect(planById("sub30").cents).toBe(9900);
    expect(planById("renew7")).toMatchObject({ days: 7, cents: 4500, exams: 0 });
  });
});
