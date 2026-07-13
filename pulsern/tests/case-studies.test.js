/* Case-study library shape guard: every case must be servable by the
   CaseStudy component and the AI tutor without runtime surprises. */
import { describe, it, expect } from "vitest";
import { CASE_STUDIES } from "../src/case-studies.js";

const CATS = [
  "Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance",
  "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology",
  "Reduction of Risk", "Physiological Adaptation",
];

describe("case-study library", () => {
  it("has at least three cases", () => {
    expect(CASE_STUDIES.length).toBeGreaterThanOrEqual(3);
  });

  for (const c of CASE_STUDIES) {
    describe(c.title, () => {
      it("carries a valid chart and category", () => {
        expect(CATS).toContain(c.cat);
        expect(c.intro.length).toBeGreaterThan(30);
        expect(c.blurb.length).toBeGreaterThan(10);
        expect(c.vitals.length).toBeGreaterThanOrEqual(3);
        expect(c.note.length).toBeGreaterThan(20);
      });

      it("has 3-6 well-formed steps with valid keys and rationales", () => {
        expect(c.steps.length).toBeGreaterThanOrEqual(3);
        expect(c.steps.length).toBeLessThanOrEqual(6);
        for (const s of c.steps) {
          expect(["mc", "sata"]).toContain(s.type);
          expect(s.stem.length).toBeGreaterThan(20);
          expect(s.rationale.length).toBeGreaterThan(60);
          expect(s.options.length).toBeGreaterThanOrEqual(4);
          if (s.type === "mc") {
            expect(Number.isInteger(s.answer)).toBe(true);
            expect(s.answer).toBeGreaterThanOrEqual(0);
            expect(s.answer).toBeLessThan(s.options.length);
          } else {
            expect(Array.isArray(s.answer)).toBe(true);
            expect(s.answer.length).toBeGreaterThan(0);
            expect(s.answer.length).toBeLessThan(s.options.length);
            expect(new Set(s.answer).size).toBe(s.answer.length);
            for (const a of s.answer) {
              expect(Number.isInteger(a)).toBe(true);
              expect(a).toBeGreaterThanOrEqual(0);
              expect(a).toBeLessThan(s.options.length);
            }
          }
        }
      });

      it("keeps pseudo-ids clear of the shared bank id space", () => {
        const idx = CASE_STUDIES.indexOf(c);
        for (let step = 0; step < c.steps.length; step++) {
          const pseudo = 100 + idx * 10 + step;
          expect(pseudo).toBeGreaterThanOrEqual(100);
          expect(pseudo).toBeLessThan(900); // hand-written samples start at 901
        }
      });
    });
  }
});
