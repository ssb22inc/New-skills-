/* The isolation diagram is a concept explainer: it never outlines a row
   as "needed for this client" (Sol, rounds 1–5). */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isolation } from "../src/diagrams/isolation.jsx";
import { MATCHERS, proposePairs } from "../src/diagrams/match.js";

describe("no client-specific precaution is read from question text", () => {
  it.each([
    "A client has measles and a negative rubella test.",
    "A newborn has congenital infection caused by rubella virus.",
    "The client has head lice. Effective treatment was completed 48 hours ago.",
    "A client is admitted with suspected pulmonary tuberculosis.",
  ])("%s", (stem) => {
    expect(MATCHERS.isolation.extract(stem)).toBeNull();
    expect(proposePairs({ stem: `${stem} Which precautions should the nurse implement?`, options: [], rationale: "" }))
      .toEqual([{ d: "isolation", p: null }]);
  });
  it("never draws a 'Needed for this client' outline", () => {
    const html = renderToStaticMarkup(React.createElement(isolation.Diagram, { params: { types: ["airborne"] } }));
    expect(html).not.toContain("Needed for this client");
  });
});

/* PR #133 review, finding 10: the overview listed chickenpox under airborne
   only; the contact requirement appeared only in the last step. */
describe("chickenpox is shown as airborne + contact wherever it appears", () => {
  it("in the static diagram, its description, the airborne step and the facts", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { isolation } = await import("../src/diagrams/isolation.jsx");
    const html = renderToStaticMarkup(React.createElement(isolation.Diagram, {}));
    expect(html).toMatch(/chickenpox[^<]*<\/text>(?:<text[^>]*>)?\(\+\u00a0contact\)|chickenpox \(\+\u00a0contact\)/);
    expect(html).toMatch(/<desc[^>]*>[^<]*Chickenpox and disseminated zoster need airborne and contact precautions/);
    const step = isolation.steps.find((s) => s.key === "airborne");
    expect(step.caption).toMatch(/Chickenpox also needs contact precautions/);
    expect(step.narration).toMatch(/contact precautions/);
    expect(isolation.facts.join(" ")).toMatch(/airborne AND contact/);
  });
});
