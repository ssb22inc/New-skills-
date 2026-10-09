/* Insulin peak windows — the clock arithmetic behind "when is this client
   most at risk of hypoglycemia?". */
import { describe, it, expect } from "vitest";
import { peakWindow, INSULINS } from "../src/diagrams/insulin.jsx";

describe("peakWindow", () => {
  it("NPH at 07:00 peaks about 11:00–19:00", () => {
    expect(peakWindow("nph", "07:00")).toEqual({ from: "11:00", to: "19:00", nextDay: false });
  });
  it("regular insulin at 07:30 peaks 09:30–11:30", () => {
    expect(peakWindow("short", "07:30")).toEqual({ from: "09:30", to: "11:30", nextDay: false });
  });
  it("rapid-acting at 12:00 peaks 13:00–14:00", () => {
    expect(peakWindow("rapid", "12:00")).toEqual({ from: "13:00", to: "14:00", nextDay: false });
  });
  /* An evening NPH dose peaks overnight — the classic nocturnal low. */
  it("wraps past midnight and says so", () => {
    expect(peakWindow("nph", "21:00")).toEqual({ from: "01:00", to: "09:00", nextDay: true });
  });
  it("has no peak for long-acting insulin", () => {
    expect(peakWindow("long", "21:00")).toBeNull();
  });
  it("refuses an unknown insulin or a non-clock time instead of guessing", () => {
    expect(() => peakWindow("ultra", "07:00")).toThrow(/unknown insulin/);
    expect(() => peakWindow("nph", "7am")).toThrow(/HH:MM/);
    expect(() => peakWindow("nph", "25:00")).toThrow(/not a clock time/);
  });
});

describe("the reference table", () => {
  it("states ranges that are internally consistent: onset ≤ peak ≤ duration", () => {
    for (const [k, i] of Object.entries(INSULINS)) {
      expect(i.onset[0], k).toBeLessThanOrEqual(i.onset[1]);
      if (i.peak) {
        expect(i.onset[1], k).toBeLessThanOrEqual(i.peak[0]);
        expect(i.peak[1], k).toBeLessThanOrEqual(i.duration[0]);
      }
      expect(i.duration[0], k).toBeLessThanOrEqual(i.duration[1]);
    }
  });
});

/* The worked step used to spotlight the NPH curve whatever insulin the
   question named. It must draw the client's own insulin. */
describe("worked step draws the question's insulin", () => {
  it("does not hard-code one insulin's curve into the worked step", async () => {
    const { insulin } = await import("../src/diagrams/insulin.jsx");
    const worked = insulin.steps.find((s) => s.key === "worked");
    expect(worked.focus).not.toContain("nph");
    expect(worked.focus).toContain("worked");
  });
  it("shows the given insulin's own peak window on that step", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { StepContext } = await import("../src/diagrams/kit.jsx");
    const { InsulinDiagram } = await import("../src/diagrams/insulin.jsx");
    const html = renderToStaticMarkup(React.createElement(StepContext.Provider, { value: { stepKey: "worked" } },
      React.createElement(InsulinDiagram, { params: { type: "rapid", givenAt: "08:00" } })));
    expect(html).toContain("09:00–10:00");
    expect(html).toContain(">08:00<");
  });
});

/* PR #134 review, round 6: the ~24 h profile is glargine U-100's, and the
   table and narration said only "glargine" — U-300 lasts longer. */
describe("the long-acting row names its product everywhere a student sees or hears it", () => {
  it("in the static table, the long step's caption and its narration", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { insulin } = await import("../src/diagrams/insulin.jsx");
    const html = renderToStaticMarkup(React.createElement(insulin.Diagram, { params: null }));
    expect(html).toContain("glargine U-100");
    expect(html).not.toMatch(/Long · glargine</);
    const step = insulin.steps.find((s) => s.key === "long");
    expect(step.caption).toMatch(/glargine U-100/);
    expect(step.caption).toMatch(/U-300/);
    expect(step.narration).toMatch(/glargine U-one-hundred/);
    expect(step.narration).toMatch(/U-three-hundred/);
  });
  it("its narration passes a real transcript and fails one that drops the formulation", async () => {
    const { audioCheck } = await import("../ops/narrate-lib.mjs");
    const { insulin } = await import("../src/diagrams/insulin.jsx");
    const script = insulin.steps.find((s) => s.key === "long").narration;
    const heard = "Long-acting glargine U-100 has no pronounced peak. It provides a steady background level for about 24 hours. Other basal insulins last differently, including glargine U-300, so always check the product.";
    expect(audioCheck(script, heard).pass).toBe(true);
    expect(audioCheck(script, heard.replace("glargine U-100 has", "glargine has")).pass).toBe(false);
    expect(audioCheck(script, heard.replace("U-300", "U-100")).pass).toBe(false);
  });
});
