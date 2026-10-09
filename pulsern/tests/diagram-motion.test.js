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

/* PR #133 review, finding 8: isotonic crystalloids were taught to "stay in
   the vessels". They expand the whole extracellular space. No text a student
   can see or hear may say otherwise. */
describe("isotonic fluid is not taught as staying in the vessels", () => {
  it("in any caption, narration, description or fact", async () => {
    const { tonicity } = await import("../src/diagrams/tonicity.jsx");
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(React.createElement(tonicity.Diagram, {}));
    const all = [html, ...tonicity.facts, ...tonicity.steps.flatMap((s) => [s.caption ?? "", s.narration ?? ""])].join("\n");
    expect(all).not.toMatch(/stays? in (the )?vessels|expands? (the )?(intravascular|circulating) volume/i);
    expect(all).toMatch(/extracellular/i);
  });
});

/* PR #133 review, finding 13: nested groups dimmed on their own even when
   the step focused their parent. Check the EFFECTIVE opacity: the product
   of a group's opacity and every ancestor's. */
describe("focus reaches nested groups", () => {
  const effective = (html) => {
    const out = {};
    const stack = [];
    for (const m of html.matchAll(/<g data-g="([^"]+)"[^>]*style="opacity:([\d.]+)"|<\/g>|<g\b[^>]*>/g)) {
      if (m[0] === "</g>") { stack.pop(); continue; }
      const own = m[1] ? Number(m[2]) : 1;
      const eff = (stack.at(-1) ?? 1) * own;
      stack.push(eff);
      if (m[1]) out[m[1]] = eff;
    }
    return out;
  };
  it("shows the fluid lists at full strength on the steps about them", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { tonicity } = await import("../src/diagrams/tonicity.jsx");
    for (const key of ["bags", "dextrose"]) {
      const step = tonicity.steps.find((s) => s.key === key);
      const eff = effective(renderToStaticMarkup(React.createElement(tonicity.Diagram, { focus: step.focus })));
      for (const g of ["fluids-iso", "fluids-hypo", "fluids-hyper"]) expect(eff[g], `${key}: ${g}`).toBe(1);
      expect(eff.safety, `${key}: unrelated group still dims`).toBeLessThan(0.5);
    }
  });
  it("every step of every diagram leaves its focused groups fully visible", () => {
    const React = require("react");
    const { renderToStaticMarkup } = require("react-dom/server");
    for (const d of Object.values(DIAGRAMS)) {
      for (const s of d.steps) {
        const eff = effective(renderToStaticMarkup(React.createElement(d.Diagram, { params: d.example ?? null, focus: s.focus })));
        for (const g of s.focus) if (g in eff) expect(eff[g], `${d.id}/${s.key}: ${g}`).toBe(1);
      }
    }
  });
});
