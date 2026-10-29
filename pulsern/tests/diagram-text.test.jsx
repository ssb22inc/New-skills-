/* Every word in a concept diagram must be readable on a phone. The player
   runs edge to edge on phones, so at 360px one canvas unit is one CSS
   pixel; no text may be smaller than MIN_TEXT units (Sol, PR #155 diagram
   review: 9.5-12-unit labels rendered at 8-10px). Checked for every
   diagram, with and without a patient's values, at every step. */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DIAGRAMS } from "../src/diagrams/index.js";
import { StepContext, MIN_TEXT } from "../src/diagrams/kit.jsx";

const sizes = (html) => [...html.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));

describe("diagram text size", () => {
  for (const d of Object.values(DIAGRAMS)) {
    it(`${d.id}: no text below ${MIN_TEXT} units, at any step`, () => {
      const cases = [d.example ?? null, null, ...(d.textCases ?? [])];
      for (const params of cases) {
        for (const step of [null, ...d.steps]) {
          const html = renderToStaticMarkup(
            <StepContext.Provider value={{ stepKey: step?.key ?? null }}>
              <d.Diagram params={params} focus={step?.focus ?? null} />
            </StepContext.Provider>);
          const small = sizes(html).filter((n) => n < MIN_TEXT);
          expect(small, `${d.id} ${JSON.stringify(params)} step ${step?.key ?? "overview"}`).toEqual([]);
          expect(html).not.toMatch(/fontSize|font-size:/);   // sizes only as attributes, so this test sees them all
        }
      }
    });
  }
});
