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

describe("potassium outside the interpreted range (Sol, round 4)", () => {
  it.each([0, -1, 0.4, 12])("k = %s is not interpreted", (k) => {
    expect(classifyPotassium(k)).toBe("recheck");
    expect(potassium.dynamicCaption({ k })).toMatch(/recheck the value/);
    expect(potassium.dynamicCaption({ k })).not.toMatch(/hypokalemia|hyperkalemia|replacement/);
    const html = renderToStaticMarkup(<StepContext.Provider value={{ stepKey: "worked" }}><potassium.Diagram params={{ k }} focus={null} /></StepContext.Provider>);
    expect(html).not.toContain("stroke-dasharray=\"5 4\"");   // no matched strip
    expect(html).not.toContain(`>${k}<`);
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
