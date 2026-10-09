/* Motion in the concept diagrams.
   An animation is tied to a step by its key. A key that names no step is
   motion that can never play — the IV-fluid cells sat still for exactly
   that reason until this test existed. And every static render (a
   rationale, a screenshot, the reviewer's image) must be the finished
   picture, with no motion markup at all. */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DIAGRAMS } from "../src/diagrams/index.js";
import { StepContext, DIAGRAM_CSS } from "../src/diagrams/kit.jsx";

const render = (d, value) => renderToStaticMarkup(
  React.createElement(StepContext.Provider, { value },
    React.createElement(d.Diagram, { params: d.example ?? null, focus: null })));

describe("diagram motion", () => {
  for (const d of Object.values(DIAGRAMS)) {
    it(`${d.id}: every animated step key is a real step`, () => {
      const collect = new Set();
      render(d, { stepKey: null, collect });
      const real = new Set(d.steps.map((s) => s.key));
      expect([...collect].filter((k) => !real.has(k))).toEqual([]);
    });

    it(`${d.id}: static and server renders carry no motion`, () => {
      for (const s of [null, ...d.steps.map((x) => x.key)]) {
        const html = render(d, { stepKey: s });
        expect(html).not.toMatch(/dg-a |dg-press|<animate/);
      }
    });
  }

  it("turns every animation off under reduced motion", () => {
    const reduce = DIAGRAM_CSS.match(/@media \(prefers-reduced-motion: reduce\)\{(.*)\}/)?.[1] ?? "";
    expect(reduce).toMatch(/\.dg-a[^{]*\{animation:none!important\}|\.dg-a,\.dg-press\{animation:none!important\}/);
  });
});
