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
    ["a stage I area", 1],
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
