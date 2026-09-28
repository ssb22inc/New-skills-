/* Funnel arithmetic.
   ------------------------------------------------------------------
   These numbers decide whether real money goes into ads, so the two ways they
   can be quietly wrong are worth pinning:

     - counting rows instead of people, which inflates conversion the moment
       one student buys twice;
     - dividing by the wrong denominator, so a step reads as a healthy rate of
       signups when it is actually a poor rate of the step above it.

   The endpoint needs a service role and a live database, so the reducer logic
   is exercised here against fixed rows rather than by booting the handler. */
import { describe, it, expect } from "vitest";

const STEPS = ["signup", "trial_start", "first_answer", "activated", "purchase"];
const pct = (n, of) => (of > 0 ? Math.round((n / of) * 1000) / 10 : 0);

/* Mirrors api/funnel.js: distinct people per step, every purchase for revenue. */
function summarise(rows) {
  const people = Object.fromEntries(STEPS.map((s) => [s, new Set()]));
  let purchases = 0, cents = 0;
  for (const r of rows) {
    people[r.event]?.add(r.user_id);
    if (r.event === "purchase") { purchases += 1; cents += Number(r.props?.cents) || 0; }
  }
  const top = people.signup.size;
  return {
    steps: STEPS.map((key, i) => {
      const n = people[key].size;
      const prev = i === 0 ? n : people[STEPS[i - 1]].size;
      return { key, people: n, ofSignups: pct(n, top), ofPrevious: i === 0 ? 100 : pct(n, prev), lostHere: i === 0 ? 0 : Math.max(0, prev - n) };
    }),
    purchases, cents,
  };
}

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
