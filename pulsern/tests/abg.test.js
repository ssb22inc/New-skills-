/* ABG interpretation — every branch against a textbook case.
   ------------------------------------------------------------------
   The diagram renders whatever interpretAbg() returns, so this function is
   the clinical claim. Each case below is a standard teaching example; the
   expected reading is what an NCLEX answer key would say. */
import { describe, it, expect } from "vitest";
import { interpretAbg, ABG_RANGES } from "../src/diagrams/abg.jsx";

const read = (ph, paco2, hco3) => interpretAbg({ ph, paco2, hco3 });

describe("uncompensated", () => {
  it("respiratory acidosis: high CO₂ drives the pH down, kidneys not yet involved", () => {
    expect(read(7.30, 55, 24)).toMatchObject({ disorder: "respiratory acidosis", primary: "respiratory", compensation: "none" });
  });
  it("respiratory alkalosis: low CO₂ (hyperventilation)", () => {
    expect(read(7.50, 28, 24)).toMatchObject({ disorder: "respiratory alkalosis", compensation: "none" });
  });
  it("metabolic acidosis: low bicarbonate (e.g. DKA)", () => {
    expect(read(7.28, 40, 16)).toMatchObject({ disorder: "metabolic acidosis", primary: "metabolic", compensation: "none" });
  });
  it("metabolic alkalosis: high bicarbonate (e.g. vomiting, NG suction)", () => {
    expect(read(7.52, 42, 34)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "none" });
  });
});

describe("partially compensated", () => {
  it("respiratory acidosis with kidneys retaining bicarbonate (COPD)", () => {
    expect(read(7.32, 60, 30)).toMatchObject({ disorder: "respiratory acidosis", compensation: "partial" });
  });
  it("metabolic acidosis with lungs blowing off CO₂ (Kussmaul)", () => {
    expect(read(7.25, 28, 14)).toMatchObject({ disorder: "metabolic acidosis", compensation: "partial" });
  });
  it("metabolic alkalosis with lungs retaining CO₂", () => {
    expect(read(7.48, 50, 35)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "partial" });
  });
});

describe("fully compensated — pH normal, side of 7.40 tells the origin", () => {
  it("respiratory acidosis, fully compensated", () => {
    expect(read(7.36, 55, 32)).toMatchObject({ disorder: "respiratory acidosis", compensation: "full" });
  });
  it("metabolic acidosis, fully compensated", () => {
    expect(read(7.37, 30, 17)).toMatchObject({ disorder: "metabolic acidosis", compensation: "full" });
  });
  it("respiratory alkalosis, fully compensated", () => {
    expect(read(7.43, 30, 19)).toMatchObject({ disorder: "respiratory alkalosis", compensation: "full" });
  });
  it("metabolic alkalosis, fully compensated", () => {
    expect(read(7.44, 48, 31)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "full" });
  });
  it("refuses to guess at exactly 7.40, and does not call it compensated", () => {
    expect(read(7.40, 55, 32)).toMatchObject({ disorder: "indeterminate", compensation: null, mixedPossible: true });
  });
});

describe("the edges", () => {
  it("normal ABG", () => {
    expect(read(7.40, 40, 24)).toMatchObject({ disorder: "normal", compensation: null });
  });
  it("combined acidosis: both systems push acid", () => {
    expect(read(7.15, 60, 16)).toMatchObject({ disorder: "combined respiratory and metabolic acidosis", primary: "both", compensation: null });
  });
  it("flags a pH no value explains instead of inventing a diagnosis", () => {
    expect(read(7.25, 30, 30).disorder).toBe("inconsistent");
  });
  it("flags a single abnormal value under a normal pH as not fitting", () => {
    expect(read(7.38, 50, 24).disorder).toBe("inconsistent");
  });

  /* The boundaries are inclusive normal values: 7.35 and 7.45 are normal. */
  it("treats the range limits as normal", () => {
    expect(read(7.35, 45, 22).disorder).toBe("normal");
    expect(read(7.45, 35, 26).disorder).toBe("normal");
  });

  it("uses the standard adult reference ranges", () => {
    expect(ABG_RANGES).toEqual({ ph: { lo: 7.35, hi: 7.45 }, paco2: { lo: 35, hi: 45 }, hco3: { lo: 22, hi: 26 } });
  });

  it("rejects a missing value rather than reading it as normal", () => {
    expect(() => interpretAbg({ ph: 7.3, paco2: undefined, hco3: 24 })).toThrow(/paco2/);
  });
});

/* PR #133 review, finding 7: opposing abnormal values were labelled as
   compensation whatever their size. Compensation has limits and does not
   overshoot; beyond them, a mixed disorder is possible. */
describe("compensation that goes too far", () => {
  it("flags Astra's case: pH 7.40, PaCO2 20, HCO3 12 is not simply 'fully compensated'", () => {
    const r = read(7.40, 20, 12);
    expect(r.compensation).toBeNull();
    expect(r.mixedPossible).toBe(true);
    expect(r.reading).not.toMatch(/^Fully compensated/);
  });
  it("keeps the ROME label but adds the caution when PaCO2 overshoots Winter's formula", () => {
    const r = read(7.37, 30, 17);   // expected PaCO2 1.5×17+8 = 33.5 ± 2
    expect(r).toMatchObject({ disorder: "metabolic acidosis", compensation: "full", mixedPossible: true });
    expect(r.reading).toMatch(/mixed disorder is possible/);
    expect(r.reading).toMatch(/31\.5–35\.5/);
  });
  it("flags respiratory 'compensation' past the metabolic alkalosis limit", () => {
    expect(read(7.48, 50, 35).mixedPossible).toBe(true);   // limit 0.7×35+21+2 = 47.5
  });
  it("does not flag compensation within the expected range", () => {
    expect(read(7.25, 28, 14).mixedPossible).toBe(false);  // Winter 29 ± 2
    expect(read(7.32, 60, 30).mixedPossible).toBe(false);  // HCO3 up to 24 + 4×2 + 2 = 34
    expect(read(7.36, 55, 32).mixedPossible).toBe(false);  // chronic limit 32
    expect(read(7.43, 30, 19).mixedPossible).toBe(false);  // down to 24 − 5 − 2 = 17
  });
  it("never flags under-compensation: that is uncompensated or partial, as taught", () => {
    expect(read(7.28, 40, 16)).toMatchObject({ compensation: "none", mixedPossible: false });
    expect(read(7.30, 55, 24)).toMatchObject({ compensation: "none", mixedPossible: false });
  });
  it("shows the caution on the diagram's verdict chip", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AbgDiagram } = await import("../src/diagrams/abg.jsx");
    expect(renderToStaticMarkup(React.createElement(AbgDiagram, { params: { ph: 7.37, paco2: 30, hco3: 17 } }))).toContain("mixed?");
  });
});

/* Every verdict the interpreter can produce must fit the canvas, not just
   the textbook example the screenshots use. */
describe("every verdict label fits", () => {
  it.each([[7.15, 60, 16], [7.55, 25, 34], [7.48, 50, 35], [7.43, 22, 13], [7.40, 20, 12], [7.25, 30, 30]])(
    "pH %s, PaCO2 %s, HCO3 %s", async (ph, paco2, hco3) => {
      const React = (await import("react")).default;
      const { renderToStaticMarkup } = await import("react-dom/server");
      const { AbgDiagram } = await import("../src/diagrams/abg.jsx");
      const html = renderToStaticMarkup(React.createElement(AbgDiagram, { params: { ph, paco2, hco3 } }));
      const chip = [...html.matchAll(/<rect x="([-\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" rx="[\d.]+" fill="var\(--surface\)" stroke="var\(--(?:coral|teal)\)"/g)].at(-1);
      expect(chip, "verdict chip").toBeTruthy();
      expect(Number(chip[1])).toBeGreaterThanOrEqual(0);
      expect(Number(chip[1]) + Number(chip[2])).toBeLessThanOrEqual(360);
    });
});

describe("the chip's safety net", () => {
  it("shrinks an over-long label to stay on the canvas", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { Chip } = await import("../src/diagrams/kit.jsx");
    const html = renderToStaticMarkup(React.createElement("svg", null, React.createElement(Chip, { x: 180, y: 20, text: "x".repeat(90), size: 12 })));
    const [, x, w] = /<rect x="([-\d.]+)" y="[-\d.]+" width="([\d.]+)"/.exec(html);
    expect(Number(x)).toBeGreaterThanOrEqual(0);
    expect(Number(x) + Number(w)).toBeLessThanOrEqual(360);
  });
});
