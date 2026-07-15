/* Owner-set pricing (2026-07-15) and the entitlement math that enforces it. */
import { describe, it, expect } from "vitest";
import { PLANS, planById, discountedCents, computeEntitlement, fmtUsd } from "../src/pricing.js";

const NOW = new Date("2026-07-15T12:00:00").getTime();
const days = (n) => new Date(NOW + n * 24 * 3600 * 1000).toISOString();

describe("pricing table", () => {
  it("matches the owner's package sheet exactly", () => {
    const expected = {
      pass1: [1, 0, 0], sub30: [30, 9900, 1], sub60: [60, 15900, 2],
      sub90: [90, 21900, 3], sub180: [180, 31900, 4], sub360: [360, 37900, 5],
      sub730: [730, 43900, 6], renew7: [7, 4500, 0], exam1: [0, 4500, 1],
    };
    for (const [id, [d, cents, exams]] of Object.entries(expected)) {
      const p = planById(id);
      expect(p, id).toBeTruthy();
      expect([p.days, p.cents, p.exams], id).toEqual([d, cents, exams]);
    }
    expect(PLANS.length).toBe(Object.keys(expected).length);
  });

  it("applies partner discounts: $30 off brings the 30-day to $69", () => {
    expect(discountedCents(9900, { amount_off_cents: 3000 })).toBe(6900);
    expect(discountedCents(9900, { percent_off: 10 })).toBe(8910);
    expect(discountedCents(9900, null)).toBe(9900);
    expect(discountedCents(1000, { amount_off_cents: 5000 })).toBe(0); // never negative
  });

  it("formats prices like the pricing sheet", () => {
    expect(fmtUsd(9900)).toBe("$99");
    expect(fmtUsd(6900)).toBe("$69");
    expect(fmtUsd(8910)).toBe("$89.10");
  });
});

describe("entitlement", () => {
  it("brand-new account: none → (after free pass) trial with no exams", () => {
    expect(computeEntitlement([], [], NOW).status).toBe("none");
    const e = computeEntitlement([{ plan: "pass1", starts_at: days(0), expires_at: days(1), exams_granted: 0 }], [], NOW);
    expect(e.status).toBe("trial");
    expect(e.examsLeft).toBe(0);
    expect(e.hadPaid).toBe(false);
  });

  it("active subscription grants its exams; attempts burn them permanently", () => {
    const subs = [{ plan: "sub90", starts_at: days(-10), expires_at: days(80), exams_granted: 3 }];
    expect(computeEntitlement(subs, [], NOW)).toMatchObject({ status: "active", examsLeft: 3 });
    const after = computeEntitlement(subs, [{ form: 1 }, { form: 4 }], NOW);
    expect(after.examsLeft).toBe(1);
    expect(after.attempted).toEqual([1, 4]); // picker uses this to lock forms forever
  });

  it("expiry ends access but never refunds attempts", () => {
    const subs = [{ plan: "sub30", starts_at: days(-40), expires_at: days(-10), exams_granted: 1 }];
    const e = computeEntitlement(subs, [{ form: 2 }], NOW);
    expect(e.status).toBe("expired");
    expect(e.hadPaid).toBe(true);
    expect(e.examsLeft).toBe(0);
  });

  it("stacked purchases pool exams and extend the window", () => {
    const subs = [
      { plan: "sub30", starts_at: days(-20), expires_at: days(10), exams_granted: 1 },
      { plan: "exam1", starts_at: days(-1), expires_at: days(10), exams_granted: 1 },
      { plan: "renew7", starts_at: days(-1), expires_at: days(17), exams_granted: 0 },
    ];
    const e = computeEntitlement(subs, [{ form: 1 }], NOW);
    expect(e.status).toBe("active");
    expect(e.examsLeft).toBe(1);
    expect(e.expiresAt.getTime()).toBe(new Date(days(17)).getTime());
  });

  it("a free pass alongside an expired paid plan does NOT reopen exams", () => {
    const subs = [
      { plan: "sub30", starts_at: days(-60), expires_at: days(-30), exams_granted: 1 },
      { plan: "pass1", starts_at: days(0), expires_at: days(1), exams_granted: 0 },
    ];
    expect(computeEntitlement(subs, [{ form: 1 }], NOW)).toMatchObject({ status: "trial", examsLeft: 0 });
  });
});
