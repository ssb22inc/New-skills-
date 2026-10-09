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
  /* Textbook values chosen to sit inside the expected-compensation ranges:
     a PaCO2 of 40 with HCO3 16 is NOT simply uncompensated (Winter 32 ± 2),
     and is tested as a possible mixed disorder below. */
  it("metabolic acidosis: low bicarbonate, PaCO2 still normal", () => {
    expect(read(7.33, 38, 20)).toMatchObject({ disorder: "metabolic acidosis", primary: "metabolic", compensation: "none", mixedPossible: false });   // Winter 38 ± 2
  });
  it("metabolic alkalosis: high bicarbonate (e.g. vomiting, NG suction)", () => {
    expect(read(7.49, 42, 30)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "none", mixedPossible: false });   // 0.7×30+21 = 42 ± 2
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
    expect(read(7.49, 47, 36)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "partial", mixedPossible: false });   // 0.7×36+21 = 46.2 ± 2
  });
});

describe("fully compensated — pH normal, side of 7.40 tells the origin", () => {
  it("respiratory acidosis, fully compensated", () => {
    expect(read(7.36, 55, 32)).toMatchObject({ disorder: "respiratory acidosis", compensation: "full" });
  });
  it("metabolic acidosis, fully compensated", () => {
    expect(read(7.36, 34, 18)).toMatchObject({ disorder: "metabolic acidosis", compensation: "full", mixedPossible: false });   // Winter 35 ± 2
  });
  it("respiratory alkalosis, fully compensated", () => {
    expect(read(7.43, 30, 19)).toMatchObject({ disorder: "respiratory alkalosis", compensation: "full" });
  });
  it("metabolic alkalosis, fully compensated", () => {
    expect(read(7.44, 46, 33)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "full", mixedPossible: false });   // 0.7×33+21 = 44.1 ± 2
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
  /* Round 10: out of the expected range, no single compensated disorder
     is asserted — ROME is given only as a preliminary pattern. */
  it("does not call it fully compensated when PaCO2 overshoots Winter's formula", () => {
    const r = read(7.37, 30, 17);   // expected PaCO2 1.5×17+8 = 33.5 ± 2
    expect(r).toMatchObject({ disorder: "metabolic acidosis", compensation: null, romePattern: "full", mixedPossible: true, mixed: "respiratory alkalosis" });
    expect(r.reading).toMatch(/^ROME pattern only:/);
    expect(r.reading).toMatch(/31\.5–35\.5/);
    expect(r.reading).toMatch(/metabolic acidosis with respiratory alkalosis/);
  });
  it("Astra's round-10 case: pH 7.38, PaCO2 20, HCO3 11.4 is not 'fully compensated'", () => {
    const r = read(7.38, 20, 11.4);   // Winter 1.5×11.4+8 = 25.1 ± 2
    expect(r).toMatchObject({ compensation: null, mixedPossible: true, mixed: "respiratory alkalosis" });
    expect(r.reading).not.toMatch(/^Metabolic acidosis, fully compensated/);
  });
  it("names the second disorder from the direction of the miss", () => {
    expect(read(7.48, 50, 35).mixed).toBe("respiratory acidosis");     // PaCO2 above 0.7×35+21+2
    expect(read(7.52, 40, 34).mixed).toBe("respiratory alkalosis");    // PaCO2 below 0.7×34+21−2
    expect(read(7.10, 80, 22).mixed).toBe("metabolic acidosis");       // HCO3 below the acute rise
    expect(read(7.36, 60, 40).mixed).toBe("metabolic alkalosis");      // HCO3 above the chronic rise
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
  /* PR #134 review, finding 5: too LITTLE compensation can also mean a
     second disorder; the diagram has no timeline to assume "early". */
  it("flags Astra's under-compensation case: pH 7.15, PaCO2 30, HCO3 10", () => {
    const r = read(7.15, 30, 10);   // Winter: 1.5×10+8 = 23 ± 2
    expect(r).toMatchObject({ disorder: "metabolic acidosis", compensation: null, romePattern: "partial", mixedPossible: true, mixed: "respiratory acidosis" });
    expect(r.reading).toMatch(/short of the compensation expected \(about 21–25\)/);
  });
  it("flags a metabolic disorder whose lungs have not compensated at all", () => {
    expect(read(7.28, 40, 16)).toMatchObject({ compensation: null, romePattern: "none", mixedPossible: true, mixed: "respiratory acidosis" });   // Winter 32 ± 2
    expect(read(7.52, 40, 34)).toMatchObject({ compensation: null, romePattern: "none", mixedPossible: true, mixed: "respiratory alkalosis" });   // 0.7×34+21 = 44.8 ± 2
  });
  it("does not flag a respiratory disorder still within the acute range", () => {
    expect(read(7.30, 55, 24)).toMatchObject({ compensation: "none", mixedPossible: false });  // HCO3 ≥ 22 + 1.5 − 2
    expect(read(7.50, 28, 24)).toMatchObject({ compensation: "none", mixedPossible: false });  // HCO3 ≤ 26 − 2.4 + 2
  });
  it("flags a respiratory acidosis whose bicarbonate has not risen even acutely", () => {
    // PaCO2 80: even acutely HCO3 should be at least 22 + 4 − 2 = 24
    expect(read(7.10, 80, 22)).toMatchObject({ disorder: "respiratory acidosis", mixedPossible: true });
  });
  it("still reports a combined disorder as combined, not as compensation", () => {
    expect(read(7.22, 60, 21)).toMatchObject({ primary: "both", compensation: null });
  });
  it("puts the possible mixed disorder on the verdict chip, not a compensation label", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AbgDiagram } = await import("../src/diagrams/abg.jsx");
    const html = renderToStaticMarkup(React.createElement(AbgDiagram, { params: { ph: 7.38, paco2: 20, hco3: 11.4 } }));
    expect(html).toContain("Possible mixed: metabolic acidosis + respiratory alkalosis");
    expect(html).not.toMatch(/fully compensated<\/text>|· fully compensated/);
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
