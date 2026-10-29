/* Which pressure injury stage a question names — the mapping that outlines
   a column of the staging diagram — and when the diagram is proposed. */
import { describe, it, expect } from "vitest";
import { stageFrom } from "../src/diagrams/pressure-injury.jsx";
import { MATCHERS, proposePairs } from "../src/diagrams/match.js";

describe("stageFrom", () => {
  it.each([
    ["A stage 3 pressure injury on the sacrum", 3],
    ["Stage 1: non-blanchable erythema over the heel", 1],
    ["The client has a stage IV pressure injury", 4],
    ["documented as a Stage II pressure ulcer", 2],
    ["stage iii wound", 3],
    ["a stage I pressure area", 1],
  ])("%s → %s", (text, stage) => {
    expect(stageFrom(text)).toEqual({ stage });
  });

  it("reads unstageable and deep tissue injury", () => {
    expect(stageFrom("The wound bed is covered with eschar and is unstageable")).toEqual({ stage: "unstageable" });
    expect(stageFrom("A suspected deep tissue pressure injury on the heel")).toEqual({ stage: "dtpi" });
    expect(stageFrom("purple area consistent with a deep tissue injury")).toEqual({ stage: "dtpi" });
  });

  /* Comparing stages is a common item; outlining one would steer the
     learner towards an answer. */
  it("lights no column when two stages are named", () => {
    expect(stageFrom("Which finding distinguishes a stage 2 from a stage 3 pressure injury?")).toBeNull();
    expect(stageFrom("Unstageable, later found to be stage 4 after debridement")).toBeNull();
  });

  /* Sol, round 3: another disease's stage before the mention, a stage only
     asked about, or a stage not tied to the wound must not light a column. */
  it("ignores other staging and unasserted stages", () => {
    expect(stageFrom("A client with CKD stage 4 has a sacral pressure injury with full-thickness skin loss.")).toBeNull();
    expect(stageFrom("A client with CKD stage 4 has a stage 3 pressure injury on the sacrum.")).toEqual({ stage: 3 });
    expect(stageFrom("Which finding would indicate a stage 3 pressure injury?")).toBeNull();
    expect(stageFrom("Client has a pressure injury. Stage 3 noted.")).toBeNull();
    expect(stageFrom("The sacral pressure injury is stage 4.")).toEqual({ stage: 4 });
    expect(stageFrom("The wound was previously documented as stage 2; it is now a stage 3 pressure injury.")).toEqual({ stage: 3 });
  });

  it("repeating the same stage is still one stage", () => {
    expect(stageFrom("Stage 2 pressure injury. A stage II injury involves the dermis.")).toEqual({ stage: 2 });
  });

  it("does not read ordinary words as a roman numeral", () => {
    expect(stageFrom("At this stage it is important to reposition")).toBeNull();
    expect(stageFrom("stage in the care plan")).toBeNull();
  });

  it("returns null with no stage", () => {
    expect(stageFrom("Braden score of 12")).toBeNull();
    expect(stageFrom(undefined)).toBeNull();
  });
});

describe("pressure injury matching", () => {
  it("is proposed for pressure injury questions", () => {
    expect(proposePairs({ stem: "A client has a stage 3 pressure injury on the sacrum. Which finding is expected?", options: [], rationale: "" }))
      .toEqual([{ d: "pressure-injury", p: { stage: 3 } }]);
    expect(proposePairs({ stem: "The client's Braden scale score is 11. Which intervention is a priority?", options: [], rationale: "" }))
      .toEqual([{ d: "pressure-injury", p: null }]);
  });

  /* Eschar and slough belong to burn and surgical-wound items too. */
  it("is not proposed for a burn item that mentions eschar", () => {
    expect(MATCHERS["pressure-injury"].candidate.test("Circumferential eschar on a full-thickness burn of the arm")).toBe(false);
    expect(MATCHERS["pressure-injury"].candidate.test("Yellow slough in a surgical wound")).toBe(false);
  });

  it("does not read a cancer or kidney-disease stage as a pressure injury", () => {
    expect(MATCHERS["pressure-injury"].candidate.test("A client with stage 4 chronic kidney disease")).toBe(false);
  });
});

/* Sol, PR #155 diagram review. */
describe("stage mentions that are not the client's stage", () => {
  it.each([
    ["This is not a stage 4 pressure injury.", null],
    ["The wound was incorrectly documented as stage 2; it is a stage 3 pressure injury.", { stage: 3 }],
    ["If this were stage 4, bone would be exposed.", null],
    /* round 2 */
    ["Stage 4 was ruled out. The heel pressure injury is stage 3.", { stage: 3 }],
    ["The client has stage 4 chronic kidney disease and a sacral pressure injury.", null],
    ["The client has stage 4 chronic kidney disease.", null],
  ])("%s", (text, want) => {
    expect(stageFrom(text)).toEqual(want);
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
