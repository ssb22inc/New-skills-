/* The visual exhibit library must actually render, carry accessible
   labels, and keep registry descriptions for the adversarial auditor. */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VISUALS, ExhibitVisual, MedLabel } from "../src/exhibits.jsx";
import React from "react";

describe("pedagogical exhibits", () => {
  it("every registered visual renders an accessible SVG with an audit description", () => {
    for (const [id, v] of Object.entries(VISUALS)) {
      expect(v.describe.length, id).toBeGreaterThan(30);
      const html = renderToStaticMarkup(v.render());
      expect(html, id).toContain("<svg");
      expect(html, id).toContain("aria-label");
    }
  });
  it("key clinical content appears in the drawings", () => {
    expect(renderToStaticMarkup(VISUALS["chest-tube"].render())).toContain("WATER SEAL");
    expect(renderToStaticMarkup(VISUALS["insulin-mix"].render())).toContain("CLEAR first");
    expect(renderToStaticMarkup(VISUALS["ppe-donning"].render())).toContain("GOWN");
    expect(renderToStaticMarkup(VISUALS["fetal-late"].render())).toContain("nadir AFTER peak");
  });
  it("med-label renders its drug, concentration, and volume", () => {
    const html = renderToStaticMarkup(<MedLabel drug="Heparin" conc="5,000 units / mL" volume="10 mL" />);
    expect(html).toContain("Heparin");
    expect(html).toContain("5,000 units / mL");
  });
  it("ExhibitVisual ignores unknown specs", () => {
    expect(renderToStaticMarkup(<ExhibitVisual spec="nope" />)).toBe("");
    expect(renderToStaticMarkup(<ExhibitVisual spec={null} />)).toBe("");
  });
});
