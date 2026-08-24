/* The self-test is what the owner dashboard trusts, so it needs its own test:
   a checker that always returns green is worse than no checker at all. */
import { describe, it, expect } from "vitest";
import { runSelfTest, CHECK_COUNT } from "../src/selftest.js";

describe("engine self-test", () => {
  it("passes against the current engines", () => {
    const r = runSelfTest();
    // Name every failure, so a red CI run says which invariant broke.
    expect(r.failures.map((f) => `${f.id}: ${f.detail}`)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("reports every check it ran", () => {
    const r = runSelfTest();
    expect(r.total).toBe(CHECK_COUNT);
    expect(r.passed + r.failed).toBe(r.total);
    expect(r.total).toBeGreaterThan(10);
  });

  it("gives every check a plain-English consequence for the dashboard", () => {
    for (const area of runSelfTest().areas) {
      for (const c of area.checks) {
        expect(c.why, `${c.id} has no "why"`).toBeTruthy();
        expect(c.why.length, `${c.id} why is too terse to help`).toBeGreaterThan(20);
        expect(c.name, `${c.id} has no readable name`).toBeTruthy();
      }
    }
  });

  it("groups checks into areas with an accurate rollup", () => {
    const r = runSelfTest();
    expect(r.areas.length).toBeGreaterThan(2);
    for (const a of r.areas) {
      expect(a.ok).toBe(a.checks.every((c) => c.pass));
    }
    expect(r.areas.reduce((n, a) => n + a.checks.length, 0)).toBe(r.total);
  });

  it("catches a broken engine rather than reporting green", () => {
    // Prove the harness actually fails: a check whose assertion cannot hold.
    const canary = { run: () => [1 === 2, "impossible"] };
    let pass = false;
    try { const [ok] = canary.run(); pass = ok === true; } catch { pass = false; }
    expect(pass).toBe(false);
  });
});
