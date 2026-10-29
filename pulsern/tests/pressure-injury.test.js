/* When the staging diagram is proposed. It is a concept explainer: no
   stage is read from question text, so no column is ever outlined as the
   client's (Sol, rounds 1–5). */
import { describe, it, expect } from "vitest";
import { MATCHERS, proposePairs } from "../src/diagrams/match.js";

describe("pressure injury matching", () => {
  it("is proposed for pressure injury questions", () => {
    expect(proposePairs({ stem: "A client has a stage 3 pressure injury on the sacrum. Which finding is expected?", options: [], rationale: "" }))
      .toEqual([{ d: "pressure-injury", p: null }]);
    expect(proposePairs({ stem: "The client's Braden scale score is 11. Which intervention is a priority?", options: [], rationale: "" }))
      .toEqual([{ d: "pressure-injury", p: null }]);
  });

  /* Eschar and slough belong to burn and surgical-wound items too. */
  it("is not proposed for a burn item that mentions eschar", () => {
    expect(MATCHERS["pressure-injury"].candidate.test("Circumferential eschar on a full-thickness burn of the arm")).toBe(false);
    expect(MATCHERS["pressure-injury"].candidate.test("Yellow slough in a surgical wound")).toBe(false);
  });

  it.each([
    "The client is at risk for a stage 4 pressure injury.",
    "The client has stage 3 sacral sarcoma and a Braden score of 12.",
    "The client has a stage 4 pressure injury. That diagnosis was ruled out on reassessment.",
  ])("reads no stage from: %s", (stem) => {
    expect(MATCHERS["pressure-injury"].extract(stem)).toBeNull();
  });

  it("does not read a cancer or kidney-disease stage as a pressure injury", () => {
    expect(MATCHERS["pressure-injury"].candidate.test("A client with stage 4 chronic kidney disease")).toBe(false);
  });
});

describe("the wound drawing", () => {
  it("reaches its own floor, so slough and depth markers sit in the wound", async () => {
    const { craterPath } = await import("../src/diagrams/pressure-injury.jsx");
    const d = craterPath(0, 80, 100, 160, 0.2);
    // M a,b Q c,d e,mid Q fx,c …: the floor curve's control y is the 8th number;
    // a quadratic from (·, mid) to (·, mid) bottoms out at (mid + c) / 2
    const nums = d.split(/[ ,QMZ]+/).filter(Boolean).map(Number);
    const mid = (100 + 160) / 2;
    expect((mid + Number(nums[7])) / 2).toBeCloseTo(160);
  });
  it("teaches the full Stage 4 definition and keeps the HOB qualification on the tile", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { pressureInjury } = await import("../src/diagrams/pressure-injury.jsx");
    const html = renderToStaticMarkup(React.createElement(pressureInjury.Diagram, {}));
    expect(html).toContain("if clinically appropriate");
    expect(html).toMatch(/exposed or directly palpable fascia/);
    const s4 = pressureInjury.steps.find((s) => s.key === "stage4");
    expect(s4.caption).toMatch(/exposed or directly palpable fascia, muscle, tendon, ligament, cartilage or bone/);
    expect(pressureInjury.steps.filter((s) => /^stage\d$/.test(s.key)).every((s) => s.focus.includes("legend"))).toBe(true);
  });
});
