/* Tab and Shift+Tab stay inside an open Focus sheet or study toolkit.
   A focused heading is not one of the controls, so the first Shift+Tab
   from it used to leave the dialog. */
import { describe, it, expect } from "vitest";
import { cycleTab } from "../src/focus-trap.js";

const controls = ["close", "pharm", "done"];

describe("dialog focus trap", () => {
  it("cycles off either end, and pulls a heading back inside", () => {
    expect(cycleTab(controls, "done", false)).toBe("close");
    expect(cycleTab(controls, "close", true)).toBe("done");
    expect(cycleTab(controls, "pharm", false)).toBe(null);
    expect(cycleTab(controls, "pharm", true)).toBe(null);
    expect(cycleTab(controls, "heading", true)).toBe("done");
    expect(cycleTab(controls, "heading", false)).toBe("close");
    expect(cycleTab([], "close", false)).toBe(null);
  });
});
