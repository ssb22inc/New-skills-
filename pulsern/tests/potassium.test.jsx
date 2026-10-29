/* Potassium: the number on screen must agree with the classification.
   Sol, PR #155 diagram review: 3.49 was drawn as "3.5" beside "below 3.5",
   and 5.01 as "5.0" beside "above 5.0". */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StepContext } from "../src/diagrams/kit.jsx";
import { potassium, classifyPotassium, displayK } from "../src/diagrams/potassium.jsx";

describe("potassium boundary values", () => {
  it.each([[3.49, "3.49", "hypokalemia"], [3.499, "3.499", "hypokalemia"], [5.001, "5.001", "hyperkalemia"], [3.5, "3.5", "normal"], [5.0, "5.0", "normal"], [5.01, "5.01", "hyperkalemia"], [6.2, "6.2", "hyperkalemia"], [2.95, "2.95", "hypokalemia"]])(
    "%s shows as %s and reads %s in the picture and caption", (k, shown, state) => {
      expect(displayK(k)).toBe(shown);
      expect(classifyPotassium(k)).toBe(state);
      const caption = potassium.dynamicCaption({ k });
      expect(caption).toContain(`${shown} mEq/L`);
      const html = renderToStaticMarkup(<StepContext.Provider value={{ stepKey: "worked" }}><potassium.Diagram params={{ k }} focus={null} /></StepContext.Provider>);
      expect(html).toContain(`>${shown}<`);
    });

  it("marks an off-scale value instead of pinning it silently to the end", () => {
    const html = renderToStaticMarkup(<potassium.Diagram params={{ k: 8.4 }} focus={null} />);
    expect(html).toContain("8.4 ▸");
  });

  it("never teaches the ECG as a reliable gate or a fixed treatment order", () => {
    const all = [...potassium.facts, ...potassium.steps.flatMap((s) => [s.caption ?? "", s.narration ?? ""]), potassium.dynamicCaption({ k: 8 })].join(" ");
    expect(all).not.toMatch(/the order matters|peaked T waves first|if the ECG changes, calcium/i);
    expect(all).toMatch(/normal ECG does not rule out/i);
    expect(all).toMatch(/can overlap/i);
  });
});

describe("potassium outside the usual range (Sol, rounds 4–5)", () => {
  it.each([0, -1])("k = %s is not a result, so it is not interpreted", (k) => {
    expect(classifyPotassium(k)).toBe("recheck");
    expect(potassium.dynamicCaption({ k })).toMatch(/recheck the value/);
    expect(potassium.dynamicCaption({ k })).not.toMatch(/hypokalemia|hyperkalemia|replacement/);
    const html = renderToStaticMarkup(<StepContext.Provider value={{ stepKey: "worked" }}><potassium.Diagram params={{ k }} focus={null} /></StepContext.Provider>);
    expect(html).not.toContain("stroke-dasharray=\"5 4\"");   // no matched strip
  });
  it.each([[1.4, "hypokalemia", true], [1.5, "hypokalemia", false], [9.5, "hyperkalemia", false], [9.6, "hyperkalemia", true], [10.0, "hyperkalemia", true]])(
    "k = %s reads %s, extreme warning %s", (k, state, extreme) => {
      expect(classifyPotassium(k)).toBe(state);
      const c = potassium.dynamicCaption({ k });
      expect(c).toContain(state);
      expect(/potentially life-threatening/.test(c)).toBe(extreme);
      if (extreme) expect(c).toMatch(/must not delay assessment and escalation/);
      const html = renderToStaticMarkup(<StepContext.Provider value={{ stepKey: "worked" }}><potassium.Diagram params={{ k }} focus={null} /></StepContext.Provider>);
      expect(html).toContain("stroke-dasharray=\"5 4\"");      // its strip is matched
    });
  it("does not rank urgency by the level alone", () => {
    const c = potassium.dynamicCaption({ k: 6.2 });
    expect(c).not.toMatch(/the higher the level/);
    expect(c).toMatch(/Urgency depends on the level, symptoms and ECG findings/);
  });
  it("lists cardiac monitoring in the IV replacement panel", () => {
    const html = renderToStaticMarkup(<potassium.Diagram params={{ k: 3.1 }} focus={null} />);
    expect(html).toContain("Cardiac monitoring");
  });
});

describe("round 6", () => {
  it("teaches severe hypokalemia as urgent", () => {
    expect(potassium.dynamicCaption({ k: 2.0 })).toMatch(/severe hypokalemia: dangerous dysrhythmias are possible/);
    expect(potassium.dynamicCaption({ k: 3.4 })).not.toMatch(/severe/);
  });
  it("pairs insulin with glucose monitoring everywhere it is taught", () => {
    const html = renderToStaticMarkup(<potassium.Diagram params={{ k: 6.2 }} focus={null} />);
    expect(html).toMatch(/monitor glucose/);
    expect(potassium.steps.find((s) => s.key === "hyper-shift").caption).toMatch(/blood glucose is monitored/);
    expect(potassium.facts.join(" ")).toMatch(/hypoglycemia can occur despite the dextrose/);
  });
});

describe("round 7", () => {
  it("teaches severe hyperkalemia as urgent even with a normal ECG", () => {
    expect(potassium.dynamicCaption({ k: 8.4 })).toMatch(/severe hyperkalemia.*urgent assessment, cardiac monitoring and escalation come first, even with a normal ECG/);
    expect(potassium.dynamicCaption({ k: 6.5 })).toMatch(/severe hyperkalemia/);
    expect(potassium.dynamicCaption({ k: 5.4 })).not.toMatch(/severe/);
  });
  it("rechecks potassium after shifting it into cells", () => {
    const html = renderToStaticMarkup(<potassium.Diagram params={{ k: 6.2 }} focus={null} />);
    expect(html).toMatch(/recheck/);
    expect(potassium.steps.find((s) => s.key === "hyper-shift").narration).toMatch(/potassium is rechecked as prescribed/);
  });
});

describe("round 8", () => {
  it("reviews kidney function and urine output before routine replacement, without making it absolute", () => {
    const html = renderToStaticMarkup(<potassium.Diagram params={{ k: 3.1 }} focus={null} />);
    expect(html).toContain("Check K⁺ level, kidney function, urine output");
    expect(potassium.dynamicCaption({ k: 3.1 })).toMatch(/kidney function and urine output are reviewed before routine replacement/);
    expect(potassium.steps.find((s) => s.key === "hypo-care").caption).toMatch(/not automatic withholding/);
  });
  it("splits hyperkalemia care into two shorter steps", () => {
    const keys = potassium.steps.map((s) => s.key);
    expect(keys.indexOf("hyper-shift")).toBe(keys.indexOf("hyper-care") + 1);
    for (const k of ["hyper-care", "hyper-shift"]) expect(potassium.steps.find((s) => s.key === k).caption.length).toBeLessThan(460);
  });
});

describe("round 10", () => {
  it.each([0, -1])("shows a visible recheck notice for k = %s", (k) => {
    const html = renderToStaticMarkup(<StepContext.Provider value={{ stepKey: "worked" }}><potassium.Diagram params={{ k }} focus={null} /></StepContext.Provider>);
    expect(html).toContain("is not a possible result: recheck it");
  });
  it("never shows the notice for a real value", () => {
    expect(renderToStaticMarkup(<potassium.Diagram params={{ k: 6.2 }} focus={null} />)).not.toContain("not a possible result: recheck it");
  });
});

describe("round 12", () => {
  it("describes each step with what it shows", () => {
    const d = (k, p = { k: 6.2 }) => potassium.steps.find((s) => s.key === k).desc(p);
    expect(d("range")).toMatch(/This client's potassium is 6\.2 mEq\/L: hyperkalemia/);
    expect(d("range", { k: 0 })).toMatch(/not a possible result: recheck it/);
    for (const cause of ["Kidney failure", "K⁺-sparing diuretics", "ACE inhibitors", "crush injury", "burns"]) {
      expect(d("hyper-care")).toContain(cause);
      expect(d("hyper-shift")).toContain(cause);
    }
    expect(d("hypo-care")).toMatch(/Check K⁺ level, kidney function, urine output/);
  });
});
