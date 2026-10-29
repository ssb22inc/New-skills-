/* ABG interpretation — every branch against a textbook case.
   ------------------------------------------------------------------
   The diagram renders whatever interpretAbg() returns, so this function is
   the clinical claim. Each case below is a standard teaching example; the
   expected reading is what an NCLEX answer key would say. */
import { describe, it, expect } from "vitest";
import { interpretAbg, ABG_RANGES, abgConsistency, verdictLabel, fmtNum, abg } from "../src/diagrams/abg.jsx";

const read = (ph, paco2, hco3) => interpretAbg({ ph, paco2, hco3 });

describe("uncompensated", () => {
  it("respiratory acidosis: high CO₂ drives the pH down, kidneys not yet involved", () => {
    expect(read(7.26, 55, 24)).toMatchObject({ disorder: "respiratory acidosis", primary: "respiratory", compensation: "none" });
  });
  it("respiratory alkalosis: low CO₂ (hyperventilation)", () => {
    // acute fall: 24 − 2 × 1.2 = 21.6 ± 2 (7.50/28/24 sits just above that range)
    expect(read(7.50, 28, 22)).toMatchObject({ disorder: "respiratory alkalosis", compensation: "none" });
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
    expect(read(7.32, 28, 14)).toMatchObject({ disorder: "metabolic acidosis", compensation: "partial" });
  });
  it("metabolic alkalosis with lungs retaining CO₂", () => {
    expect(read(7.51, 47, 36)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "partial", mixedPossible: false });   // 0.7×36+21 = 46.2 ± 2
  });
});

describe("fully compensated — pH normal, side of 7.40 tells the origin", () => {
  it("respiratory acidosis, fully compensated", () => {
    expect(read(7.39, 55, 32)).toMatchObject({ disorder: "respiratory acidosis", compensation: "full" });
  });
  it("metabolic acidosis, fully compensated", () => {
    expect(read(7.36, 34, 18)).toMatchObject({ disorder: "metabolic acidosis", compensation: "full", mixedPossible: false });   // Winter 35 ± 2
  });
  it("respiratory alkalosis, fully compensated", () => {
    expect(read(7.43, 30, 19)).toMatchObject({ disorder: "respiratory alkalosis", compensation: "full" });
  });
  /* 7.44/46/33 implies pH 7.48: metabolic alkalosis rarely reaches a normal
     pH; the consistent version of that gas is partially compensated. */
  it("metabolic alkalosis 7.47/46/33: partially compensated", () => {
    expect(read(7.47, 46, 33)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "partial", mixedPossible: false });   // 0.7×33+21 = 44.1 ± 2
  });
  /* Sol, PR #155 diagram review: the side of 7.40 is an exam heuristic, not
     how the primary is chosen. Each candidate is tested against its expected
     compensation; at exactly 7.40 the one that fits is reported. */
  it("does not decide by the side of 7.40, and says full compensation needs the history", () => {
    const r = read(7.40, 55, 32);
    expect(r).toMatchObject({ disorder: "respiratory acidosis", compensation: "full" });
    expect(r.reading).toMatch(/history decides/);
  });
  /* Sol, round 3: a pH in range does not prove the pH ever left it, so with
     the other value also in range the compensation is left open. */
  it("Sol's case: pH 7.36, PaCO2 36, HCO3 19.7 is a metabolic acidosis pattern, compensation unclear", () => {
    const r = read(7.36, 36, 19.7);   // Winter 37.6 ± 2
    expect(r).toMatchObject({ disorder: "metabolic acidosis", compensation: "unclear", mixedPossible: true });
    expect(r.reading).toMatch(/can't tell which/);
  });
  it("Sol's case: pH 7.39, PaCO2 32, HCO3 18.7 fits chronic respiratory alkalosis, not a forced metabolic primary", () => {
    const r = read(7.39, 32, 18.7);
    expect(r).toMatchObject({ disorder: "respiratory alkalosis", compensation: "full" });
    expect(r.reading).toMatch(/mixed disorder can look the same/);
  });
});

describe("the edges", () => {
  it("normal ABG", () => {
    expect(read(7.40, 40, 24)).toMatchObject({ disorder: "normal", compensation: null });
  });
  it("combined acidosis: both systems push acid", () => {
    // 7.15/60/16 implies pH 7.05; 7.10/60/18 is the same picture, internally consistent
    expect(read(7.10, 60, 18)).toMatchObject({ disorder: "combined respiratory and metabolic acidosis", primary: "both", compensation: null });
  });
  it("flags a pH no value explains instead of inventing a diagnosis", () => {
    expect(read(7.25, 30, 30).disorder).toBe("inconsistent");
  });
  it("flags a single abnormal value under a normal pH as not fitting", () => {
    expect(read(7.38, 50, 24).disorder).toBe("inconsistent");
  });

  /* The boundaries are inclusive normal values: 7.35 and 7.45 are normal. */
  it("treats the range limits as normal", () => {
    expect(read(7.35, 45, 24).disorder).toBe("normal");
    expect(read(7.45, 35, 24).disorder).toBe("normal");
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
  /* 7.40/20/12 sits inside chronic respiratory alkalosis (24 − 5 × 2 = 14 ± 2):
     a single disorder fits, and the reading says a mixed one can look the same. */
  it("Astra's case 7.40/20/12: the one disorder that fits, with the mixed caveat", () => {
    const r = read(7.40, 20, 12);
    expect(r).toMatchObject({ disorder: "respiratory alkalosis", compensation: "full" });
    expect(r.reading).toMatch(/mixed disorder can look the same/);
  });
  /* Round 10: out of the expected range, no single compensated disorder
     is asserted — ROME is given only as a preliminary pattern. */
  it("does not call it fully compensated when PaCO2 overshoots Winter's formula", () => {
    // Winter 1.5×9+8 = 21.5 ± 2; chronic respiratory alkalosis would need HCO3 ≥ 24 − 12.5 − 2 = 9.5
    // Round 12: the closest reading leads (chronic respiratory alkalosis, 0.5
    // out), and the Winter's miss is still named.
    const r = read(7.40, 15, 9);
    expect(r).toMatchObject({ compensation: null, romePattern: "full", mixedPossible: true });
    expect(r.reading).toMatch(/^ROME pattern only:/);
    expect(r.reading).toMatch(/borderline/);
    expect(r.reading).toMatch(/Also considered: metabolic acidosis, whose expected PaCO₂ of 19\.5–23\.5/);
  });
  it("Astra's round-10 case: pH 7.38, PaCO2 20, HCO3 11.4 is not 'fully compensated'", () => {
    const r = read(7.38, 20, 11.4);   // Winter 1.5×11.4+8 = 25.1 ± 2
    expect(r).toMatchObject({ compensation: null, mixedPossible: true });
    expect(r.reading).not.toMatch(/fully compensated by the NCLEX convention/);
    expect(r.reading).toMatch(/Also considered: metabolic acidosis/);
  });
  /* Round 11: the decision and the display must use the same bounds. */
  it("decides on the same rounded bounds it shows, so the direction cannot flip", () => {
    // 0.7×34.3+21 = 45.01 and 40+0.7×10.3 = 47.21, ± 2 → shown 43.0–49.2; PaCO2 43 is on the boundary, so inside
    const r = read(7.52, 43, 34.3);
    expect(r).toMatchObject({ disorder: "metabolic alkalosis", compensation: "none", mixedPossible: false });
    // just below the shown bound: low, so an added respiratory ALKALOSIS
    expect(read(7.52, 42.9, 34.3)).toMatchObject({ mixedPossible: true, mixed: "respiratory alkalosis" });
    expect(read(7.52, 42.9, 34.3).reading).toMatch(/about 43–49\.2/);
    // every flagged case names the disorder on the side the value actually missed
    for (let paco2 = 20; paco2 <= 70; paco2 += 0.1) {
      for (const hco3 of [12.3, 18.7, 29.9, 34.3, 38.1]) {
        for (const ph of [7.2, 7.38, 7.42, 7.55]) {
          const x = read(ph, Math.round(paco2 * 10) / 10, hco3);
          if (!x.mixed) continue;
          const c = x.reading.match(/about ([\d.]+)–([\d.]+)/);
          const [lo] = [Number(c[1])];
          const value = Number(x.reading.match(/(PaCO₂|HCO₃⁻) ([\d.]+) is/)[2]);
          const isPaco2 = /PaCO₂ [\d.]+ is/.test(x.reading);
          const low = value < lo;
          expect(x.mixed).toBe(isPaco2 ? (low ? "respiratory alkalosis" : "respiratory acidosis") : (low ? "metabolic acidosis" : "metabolic alkalosis"));
        }
      }
    }
  });
  it("names the second disorder from the direction of the miss", () => {
    expect(read(7.48, 50, 35).mixed).toBe("respiratory acidosis");     // PaCO2 above 0.7×35+21+2
    expect(read(7.55, 40, 34).mixed).toBe("respiratory alkalosis");    // PaCO2 below 0.7×34+21−2
    expect(read(7.06, 80, 22).mixed).toBe("metabolic acidosis");       // HCO3 below the acute rise
    expect(read(7.38, 70, 40).mixed).toBe("metabolic alkalosis");     // Sol's case: chronic respiratory acidosis is closest (HCO3 36 ± 2), so an added metabolic alkalosis
    expect(read(7.38, 70, 40).reading).toMatch(/mixed/);
  });
  it("flags respiratory 'compensation' past the metabolic alkalosis limit", () => {
    expect(read(7.48, 50, 35).mixedPossible).toBe(true);   // limit 0.7×35+21+2 = 47.5
  });
  it("does not flag compensation within the expected range", () => {
    expect(read(7.32, 28, 14).mixedPossible).toBe(false);  // Winter 29 ± 2
    /* Respiratory: inside the acute-to-chronic envelope is never called mixed,
       but fitting one time course only is reported as history-dependent
       (Sol, round 4). */
    expect(read(7.32, 60, 30)).toMatchObject({ disorder: "respiratory acidosis", mixedPossible: true });   // chronic 32 ± 2
    expect(read(7.32, 60, 30).mixed).toBeUndefined();
    expect(read(7.31, 60, 29).reading).toMatch(/lies between them/);   // acute 26 ± 2, chronic 32 ± 2
    expect(read(7.39, 55, 32).reading).toMatch(/fits a chronic picture/);   // chronic 30 ± 2
    expect(read(7.43, 30, 19).reading).toMatch(/fits a chronic picture/);   // chronic 19 ± 2
  });
  /* PR #134 review, finding 5: too LITTLE compensation can also mean a
     second disorder; the diagram has no timeline to assume "early". */
  it("flags Astra's under-compensation case: pH 7.15, PaCO2 30, HCO3 10", () => {
    const r = read(7.15, 30, 10);   // Winter: 1.5×10+8 = 23 ± 2
    expect(r).toMatchObject({ disorder: "metabolic acidosis", compensation: null, romePattern: "partial", mixedPossible: true, mixed: "respiratory acidosis" });
    expect(r.reading).toMatch(/short of the compensation expected \(about 21–25 mmHg\)/);
  });
  it("flags a metabolic disorder whose lungs have not compensated at all", () => {
    expect(read(7.23, 40, 16)).toMatchObject({ compensation: null, romePattern: "none", mixedPossible: true, mixed: "respiratory acidosis" });   // Winter 32 ± 2
    expect(read(7.55, 40, 34)).toMatchObject({ compensation: null, romePattern: "none", mixedPossible: true, mixed: "respiratory alkalosis" });   // 0.7×34+21 = 44.8 ± 2
  });
  it("reports a respiratory disorder that fits only the acute estimate as history-dependent", () => {
    for (const [ph, paco2, hco3] of [[7.26, 55, 24], [7.50, 28, 22]]) {
      const r = read(ph, paco2, hco3);
      expect(r).toMatchObject({ compensation: "none", mixedPossible: true });
      expect(r.mixed).toBeUndefined();
      expect(r.reading).toMatch(/fits an acute picture; if the problem is chronic/);
    }
  });
  it("flags a respiratory acidosis whose bicarbonate has not risen even acutely", () => {
    // PaCO2 80: even acutely HCO3 should be at least 22 + 4 − 2 = 24
    expect(read(7.06, 80, 22)).toMatchObject({ disorder: "respiratory acidosis", mixedPossible: true });
  });
  it("still reports a combined disorder as combined, not as compensation", () => {
    expect(read(7.17, 60, 21)).toMatchObject({ primary: "both", compensation: null });
  });
  it("puts the possible mixed disorder on the verdict chip, not a compensation label", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AbgDiagram } = await import("../src/diagrams/abg.jsx");
    const html = renderToStaticMarkup(React.createElement(AbgDiagram, { params: { ph: 7.38, paco2: 20, hco3: 11.4 } }));
    const chip = html.replace(/<\/text><text[^>]*>/g, " ");   // the chip wraps onto lines
    expect(chip).toContain("Possible mixed: respiratory alkalosis + metabolic acidosis");
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
  /* Sol, PR #155 diagram review: shrinking long verdicts made them unreadable. */
  it("wraps an over-long label onto lines, at a readable size, inside the canvas", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { Chip, MIN_TEXT } = await import("../src/diagrams/kit.jsx");
    const html = renderToStaticMarkup(React.createElement("svg", null, React.createElement(Chip, { x: 180, y: 20, text: "word ".repeat(30).trim() })));
    const [, x, w] = /<rect x="([-\d.]+)" y="[-\d.]+" width="([\d.]+)"/.exec(html);
    expect(Number(x)).toBeGreaterThanOrEqual(0);
    expect(Number(x) + Number(w)).toBeLessThanOrEqual(360);
    expect((html.match(/<text/g) ?? []).length).toBeGreaterThan(1);
    for (const m of html.matchAll(/font-size="([\d.]+)"/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(MIN_TEXT);
  });
});

/* Sol, PR #155 diagram review: values that cannot belong together must not
   be interpreted, and the numbers shown must be the numbers classified. */
describe("internal consistency and precision", () => {
  it("withholds a verdict when pH and PaCO2/HCO3 disagree (7.20, 60, 36 implies about 7.40)", () => {
    const r = read(7.20, 60, 36);
    expect(r.disorder).toBe("inconsistent");
    expect(r.reading).toMatch(/near 7\.40/);
  });
  it("refuses impossible values", () => {
    expect(read(7.3, 0.5, 24).disorder).toBe("inconsistent");
    expect(read(7.3, 55, 80).disorder).toBe("inconsistent");
  });
  it("shows decimals as given, so a boundary never looks crossed", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AbgDiagram, abg } = await import("../src/diagrams/abg.jsx");
    const html = renderToStaticMarkup(React.createElement(AbgDiagram, { params: { ph: 7.34, paco2: 45.4, hco3: 23.7 } }));
    expect(html).toContain(">45.4<");
    expect(html).toContain(">23.7<");
    expect(abg.dynamicCaption({ ph: 7.34, paco2: 45.4, hco3: 23.7 })).toMatch(/PaCO₂ 45\.4, HCO₃⁻ 23\.7/);
  });
  it("teaches bicarbonate as a push, never as deciding the pH by itself", async () => {
    const { abg } = await import("../src/diagrams/abg.jsx");
    const all = [...abg.facts, ...abg.steps.flatMap((x) => [x.caption ?? "", x.narration ?? ""])].join(" ");
    expect(all).not.toMatch(/leaves the blood acidic|makes it alkaline/);
    expect(all).toMatch(/heuristic/);
  });
});

/* Sol, PR #155 diagram review, round 2. */
describe("round 2", () => {
  it("rejects 7.33/50/30, which implies about 7.40, even though 0.08 would have let it pass", () => {
    expect(read(7.33, 50, 30).disorder).toBe("inconsistent");
  });
  it("names acidemia with an unresolved primary instead of calling a consistent gas inconsistent", () => {
    const r = read(7.32, 44, 22);
    expect(r.disorder).toBe("acidemia, primary process unresolved");
    expect(r.reading).toMatch(/values agree/);
  });
  it("says values beyond its range are outside what it interprets, not outside what a client can show", () => {
    const r = read(7.42, 8, 5);
    expect(r.reading).toMatch(/outside the range this tool interprets automatically/);
    expect(r.reading).not.toMatch(/living/);
  });
  it("calls in-range values 'acid–base values in range' and points to oxygenation", () => {
    const r = read(7.40, 40, 24);
    expect(r.reading).toMatch(/does not assess oxygenation/);
  });
  it("states the reference range and the expected compensation separately, with units", () => {
    const r = read(7.30, 50, 24);
    expect(r.reading).toMatch(/HCO₃⁻ 24 mEq\/L is inside its reference range \(22–26\); the acute estimate is about 25 ± 2 and the chronic about 28 ± 2 mEq\/L/);
  });
  it("keeps the textbook example internally consistent", async () => {
    const { ABG_EXAMPLE, abgConsistency } = await import("../src/diagrams/abg.jsx");
    expect(abgConsistency(ABG_EXAMPLE).ok).toBe(true);
  });
  it("hands the pairing no values for an inconsistent question, so the concept view shows instead", async () => {
    const { extractAbg } = await import("../src/diagrams/match.js");
    expect(extractAbg("ABG: pH 7.20, PaCO2 60, HCO3 36")).toBeNull();
    expect(extractAbg("ABG: pH 7.30, PaCO2 50, HCO3 24")).toEqual({ ph: 7.3, paco2: 50, hco3: 24, precision: { ph: 2, paco2: 0, hco3: 0 } });
  });
});

describe("round 3", () => {
  /* A JavaScript number drops trailing zeros; the pH is still reported to
     the hundredth, so 7.0 and 7.4 get a ±0.005 allowance, not ±0.05. */
  it("treats a pH ending in zero as reported to two decimals", () => {
    expect(read(7.0, 40, 24).disorder).toBe("inconsistent");    // implies ≈ 7.40
    expect(read(7.4, 50, 26).disorder).toBe("inconsistent");    // implies ≈ 7.34
    expect(read(7.2, 60, 36).disorder).toBe("inconsistent");    // implies ≈ 7.40
    expect(read(7.3, 50, 24).disorder).toBe("respiratory acidosis");
    expect(read(7.4, 40, 24).disorder).toBe("normal");
  });
  it("uses precision the caller supplies", () => {
    expect(interpretAbg({ ph: 7.4, paco2: 40, hco3: 24, precision: { ph: 1 } }).disorder).toBe("normal");
    expect(abgConsistency({ ph: 7.3, paco2: 50, hco3: 24, precision: { ph: 1 } }).ok).toBe(true);
  });
  it("keeps a consistent normal-pH gas interpretable without assuming a 40/24 baseline", () => {
    const r = read(7.44, 40, 26.3);
    expect(r).toMatchObject({ disorder: "metabolic alkalosis", compensation: "unclear", mixedPossible: true });
    expect(verdictLabel(r)).toBe("Metabolic alkalosis pattern · pH in range");
  });
  it("never rounds a value onto a reference limit", () => {
    expect(fmtNum(7.3499, 2)).toBe("7.3499");
    expect(fmtNum(7.3, 2)).toBe("7.30");
    const r = read(7.3499, 50, 26.668);
    expect(r).toMatchObject({ disorder: "respiratory acidosis", compensation: "partial" });
    expect(abg.dynamicCaption({ ph: 7.3499, paco2: 50, hco3: 26.668 })).toMatch(/pH 7\.3499/);
  });
  it("labels consistent values outside the supported range as unsupported, not inconsistent", () => {
    const r = read(6.77, 40, 5.6);
    expect(r.disorder).toBe("unsupported");
    expect(verdictLabel(r)).toBe("Outside automatic interpretation range");
    expect(verdictLabel(read(7.0, 40, 24))).toBe("Values don't fit: recheck");
  });
  it("shows the pH with the decimals the question wrote", async () => {
    const { extractAbg } = await import("../src/diagrams/match.js");
    const gas = extractAbg("ABG: pH 7.30, PaCO2 50, HCO3 24");
    expect(abg.dynamicCaption(gas)).toMatch(/^Here: pH 7\.30, PaCO₂ 50, HCO₃⁻ 24\./);
  });
});

describe("round 4", () => {
  it("accepts either common metabolic-alkalosis rule (Sol: 7.48 / 50 / 36)", () => {
    const r = read(7.48, 50, 36);   // 0.7×36+21 = 46.2; 40+0.7×12 = 48.4; ± 2 → 44.2–50.4
    expect(r).toMatchObject({ disorder: "metabolic alkalosis", compensation: "partial", mixedPossible: false });
    expect(r.reading).toMatch(/two common bedside rules/);
  });
  /* Round 5: the ceiling is approximate, so it cautions; it does not cut
     an accepted rule's range. */
  it("treats the PaCO₂ ceiling as a caution, not a cut-off (Sol: 7.52 / 56.5 / 45)", () => {
    expect(read(7.59, 65, 60).disorder).toBe("unsupported");
    const r = read(7.52, 56.5, 45);   // 40 + 0.7 × 21 = 54.7 ± 2 fits
    expect(r).toMatchObject({ disorder: "metabolic alkalosis", mixedPossible: true });
    expect(r.mixed).toBeUndefined();
    expect(r.reading).toMatch(/above about 55 is more than compensation usually reaches, so an added respiratory acidosis is possible/);
    expect(read(7.48, 50, 36).reading).not.toMatch(/above about 55/);
  });
  it("offers developing compensation as well as a second disorder for under-compensated metabolic acidosis (Sol: 7.28 / 40 / 18)", () => {
    const r = read(7.28, 40, 18);
    expect(r.reading).toMatch(/respiratory compensation may still be developing/);
    expect(r.reading).toMatch(/a second disorder \(respiratory acidosis\)/);
  });
  it("allows for analyzer constants (Sol: 7.400 / 40.00 / 24.22)", () => {
    expect(interpretAbg({ ph: 7.4, paco2: 40, hco3: 24.22, precision: { ph: 3, paco2: 2, hco3: 2 } }).disorder).toBe("normal");
    expect(read(7.0, 40, 24).disorder).toBe("inconsistent");
    expect(read(7.4, 50, 26).disorder).toBe("inconsistent");
  });
  it("teaches pH as the net state", () => {
    expect(abg.steps.find((s) => s.key === "ph").caption).toMatch(/Below 7\.35 is acidemia, above 7\.45 is alkalemia/);
    expect(abg.facts[0]).toMatch(/acidemia/);
  });
  it("separates acute and chronic respiratory estimates (Sol: 7.28 / 60 / 27)", () => {
    const r = read(7.28, 60, 27);
    expect(r).toMatchObject({ disorder: "respiratory acidosis", compensation: "partial", mixedPossible: true });
    expect(r.reading).toMatch(/fits an acute picture; if the problem is chronic, this HCO₃⁻ would suggest an added metabolic acidosis/);
  });
  it("calls both values pushing the same way combined, not partial (Sol: 7.10 / 60 / 18)", () => {
    expect(read(7.1, 60, 18)).toMatchObject({ primary: "both", compensation: null });
    expect(abg.steps.find((s) => s.key === "compensation").caption).toMatch(/combined disorder, not compensation/);
    expect(abg.steps.find((s) => s.key === "rome").narration).toMatch(/combined disorder/);
  });
  it("marks a value just outside the expected range as borderline", () => {
    expect(read(7.48, 50, 35).reading).toMatch(/borderline/);   // hi 49.7
    expect(read(7.38, 70, 40).reading).toMatch(/rather than a single compensated one/);
  });
});

describe("round 8", () => {
  it("teaches the same metabolic-alkalosis rules the interpreter applies (Sol: 7.50 / 53 / 40)", () => {
    const r = read(7.5, 53, 40);   // 0.7 × 40 + 21 = 49; 40 + 0.7 × 16 = 51.2; ± 2 → 47–53.2
    expect(r).toMatchObject({ disorder: "metabolic alkalosis", compensation: "partial" });
    const limits = abg.steps.find((s) => s.key === "limits");
    expect(limits.caption).toMatch(/40 \+ 0\.7 × \(HCO₃⁻ − 24\)/);
    expect(limits.narration).toMatch(/a value fitting either one counts/);
  });
  it("writes the respiratory rules with an explicit coefficient", () => {
    const limits = abg.steps.find((s) => s.key === "limits").caption;
    expect(limits).toMatch(/24 \+ k × \(\(PaCO₂ − 40\) ÷ 10\), with k = 1 if acute or 4 if chronic/);
    expect(limits).toMatch(/24 − k × \(\(40 − PaCO₂\) ÷ 10\), with k = 2 if acute or 5 if chronic/);
  });
});

describe("round 9", () => {
  it("speaks the grouped formula unambiguously", () => {
    expect(abg.steps.find((s) => s.key === "limits").narration).toMatch(/forty plus zero point seven times the quantity, bicarbonate minus twenty-four/);
  });
});

describe("round 12", () => {
  it("leads with the closest reading and keeps a borderline alternative (Sol: 7.42 / 50 / 31)", () => {
    const r = read(7.42, 50, 31);
    expect(r.reading).toMatch(/^ROME pattern only: respiratory acidosis/);
    expect(r.reading).toMatch(/borderline/);
    expect(r.reading).toMatch(/Also considered: metabolic alkalosis/);
  });
  it("colours an uncertain verdict neutral, not coral", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AbgDiagram } = await import("../src/diagrams/abg.jsx");
    const html = renderToStaticMarkup(React.createElement(AbgDiagram, { params: { ph: 7.44, paco2: 40, hco3: 26.3 } }));
    const chip = html.slice(html.indexOf('data-g="result"'), html.indexOf('data-g="comp"'));
    expect(chip).not.toContain("var(--coral)");
  });
  it("describes each step with the client's values", () => {
    const p = { ph: 7.3, paco2: 50, hco3: 24 };
    const d = (k) => abg.steps.find((s) => s.key === k).desc(p);
    expect(d("ph")).toMatch(/This client's pH is 7\.30, below the reference range 7\.35–7\.45/);
    expect(d("lungs")).toMatch(/PaCO₂ is 50 mmHg, above/);
    expect(d("kidneys")).toMatch(/HCO₃⁻ is 24 mEq\/L, inside/);
    expect(d("worked")).toMatch(/Verdict: Respiratory acidosis/);
    expect(abg.steps.find((s) => s.key === "ph").desc(null)).not.toMatch(/This client/);
  });
});
