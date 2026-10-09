/* Which precautions a named condition needs — the mapping that outlines a
   row of the isolation diagram. */
import { describe, it, expect } from "vitest";
import { precautionFor } from "../src/diagrams/isolation.jsx";

describe("precautionFor", () => {
  it.each([
    ["A client with MRSA in a wound", "contact"],
    ["Clostridioides difficile diarrhea", "contact"],
    ["A child with pertussis", "droplet"],
    ["Neisseria meningitidis infection", "droplet"],
    ["Tuberculosis is suspected", "airborne"],
    ["active TB", "airborne"],
    ["measles (rubeola)", "airborne"],
  ])("%s → %s", (text, type) => {
    expect(precautionFor(text).types).toEqual([type]);
  });

  it("gives chickenpox both airborne and contact", () => {
    expect(precautionFor("A child with varicella").types).toEqual(["airborne", "contact"]);
  });

  /* "German measles" is rubella (droplet), not measles (airborne). */
  it("reads 'German measles' as rubella, not measles", () => {
    expect(precautionFor("A pregnant client exposed to German measles")).toEqual({ condition: "rubella", types: ["droplet"] });
  });

  /* Pneumococcal meningitis needs standard precautions only. */
  it("does not put bacterial meningitis in general on droplet", () => {
    expect(precautionFor("bacterial meningitis caused by Streptococcus pneumoniae")).toBeNull();
  });

  it("lights no row when a question compares two conditions", () => {
    expect(precautionFor("Which client can share a room: one with TB or one with MRSA?")).toBeNull();
  });

  it("does not read 'fluid' as flu", () => {
    expect(precautionFor("Encourage oral fluid intake")).toBeNull();
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
    expect(html).toContain("chickenpox (+ contact)");
    expect(html).toMatch(/<desc[^>]*>[^<]*Chickenpox needs airborne and contact precautions/);
    const step = isolation.steps.find((s) => s.key === "airborne");
    expect(step.caption).toMatch(/Chickenpox also needs contact precautions/);
    expect(step.narration).toMatch(/contact precautions/);
    expect(isolation.facts.join(" ")).toMatch(/airborne AND contact/);
  });
});
