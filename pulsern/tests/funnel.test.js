/* Funnel arithmetic.
   ------------------------------------------------------------------
   These numbers decide whether real money goes into ads, so the two ways they
   can be quietly wrong are worth pinning:

     - counting rows instead of people, which inflates conversion the moment
       one student buys twice;
     - dividing by the wrong denominator, so a step reads as a healthy rate of
       signups when it is actually a poor rate of the step above it.

   This exercises the SHIPPED reducer, not a copy of it. It used to hold its
   own reimplementation with a comment saying it mirrored the endpoint, which
   is a test that stays green while the thing it describes drifts away from it.
   The reducer was pulled out to src/funnel-report.js precisely so the real one
   could be tested, and so /api/funnel and /api/marketing cannot answer the
   same question differently. */
import { describe, it, expect } from "vitest";
import { buildFunnelReport } from "../src/funnel-report.js";

const summarise = (rows) => {
  const out = buildFunnelReport({ rows, attrRows: [], windowDays: 30 });
  return { ...out, purchases: out.revenue.purchases, cents: out.revenue.cents };
};

const at = (user_id, event, cents) => ({ user_id, event, props: cents ? { cents } : {} });

describe("funnel arithmetic", () => {
  it("counts people once per step, however many rows they have", () => {
    // One student who bought twice is one converted student, two purchases.
    const out = summarise([
      at("a", "signup"), at("b", "signup"),
      at("a", "purchase", 9900), at("a", "purchase", 4500),
    ]);
    const purchase = out.steps.find((s) => s.key === "purchase");
    expect(purchase.people).toBe(1);
    expect(out.purchases).toBe(2);
    expect(purchase.ofSignups).toBe(50);
  });

  it("sums revenue across every purchase, not every payer", () => {
    const out = summarise([
      at("a", "signup"), at("a", "purchase", 9900), at("a", "purchase", 4500),
    ]);
    expect(out.cents).toBe(14400);
  });

  it("rates each step against the step above it, not only against signups", () => {
    // 10 signed up, 5 started a trial, 4 of those 5 answered something.
    const rows = [];
    for (let i = 0; i < 10; i++) rows.push(at(`u${i}`, "signup"));
    for (let i = 0; i < 5; i++) rows.push(at(`u${i}`, "trial_start"));
    for (let i = 0; i < 4; i++) rows.push(at(`u${i}`, "first_answer"));
    const answered = summarise(rows).steps.find((s) => s.key === "first_answer");
    expect(answered.ofSignups).toBe(40);   // 4 of 10
    expect(answered.ofPrevious).toBe(80);  // 4 of the 5 who started a trial
  });

  it("reports where students are lost, which is the number worth acting on", () => {
    const rows = [];
    for (let i = 0; i < 10; i++) rows.push(at(`u${i}`, "signup"));
    for (let i = 0; i < 3; i++) rows.push(at(`u${i}`, "trial_start"));
    const trial = summarise(rows).steps.find((s) => s.key === "trial_start");
    expect(trial.lostHere).toBe(7);
  });

  it("does not divide by zero on an empty window", () => {
    const out = summarise([]);
    expect(out.steps.every((s) => s.people === 0 && s.ofSignups === 0)).toBe(true);
    expect(out.cents).toBe(0);
  });

  it("never reports a step as more than 100% of the one above it", () => {
    // A guard against a future change that counts rows somewhere: a subset can
    // never exceed its superset, so this is a real invariant, not a tautology.
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push(at(`u${i}`, "signup"));
    for (let i = 0; i < 6; i++) rows.push(at(`u${i}`, "trial_start"), at(`u${i}`, "trial_start"));
    for (const s of summarise(rows).steps) expect(s.ofPrevious).toBeLessThanOrEqual(100);
  });
});

describe("what must never be counted as demand", () => {
  /* The first live test purchase was reported as "$0.50 from 1 customer
     purchase". Comps and launch checks are real Stripe rows and not customers,
     and treating them as demand is the most expensive mistake available when
     the next step is buying ads. */
  it("excludes internal purchases from people, revenue and conversion", () => {
    const out = buildFunnelReport({
      rows: [
        { user_id: "a", event: "signup" },
        { user_id: "a", event: "purchase", props: { cents: 50, internal: true } },
      ],
      attrRows: [],
      windowDays: 30,
    });
    expect(out.steps.find((s) => s.key === "purchase").people).toBe(0);
    expect(out.revenue.cents).toBe(0);
    expect(out.revenue.excludedInternal).toBe(1);
    expect(out.unitEconomics.note).toMatch(/internal transaction/i);
  });

  /* Returning from Stripe checkout once made "checkout.stripe.com" look like a
     traffic source, and it did it worst on the people who converted. */
  it("calls an untagged student direct rather than dropping them", () => {
    const out = buildFunnelReport({
      rows: [{ user_id: "a", event: "signup" }],
      attrRows: [],
      windowDays: 30,
    });
    expect(out.bySource).toEqual([{ source: "direct", signup: 1, activated: 0, purchase: 0 }]);
  });

  /* Every trial ends. Putting it in the chain would make every "lost here"
     figure below it meaningless. */
  it("keeps trial ends beside the funnel, not inside it", () => {
    const out = buildFunnelReport({
      rows: [{ user_id: "a", event: "signup" }, { user_id: "a", event: "trial_end" }],
      attrRows: [],
      windowDays: 30,
    });
    expect(out.trialsEnded).toBe(1);
    expect(out.steps.map((s) => s.key)).not.toContain("trial_end");
  });
});
