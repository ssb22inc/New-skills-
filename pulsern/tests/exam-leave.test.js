import { describe, expect, it } from "vitest";
import { stepExamLeave } from "../src/exam-leave.js";

describe("exam leave", () => {
  it("submits a live exam and does not navigate until the score arrives", () => {
    const waiting = stepExamLeave({ destination: null }, {
      type: "confirm", exam: true, destination: "home", exitBound: true,
    });
    expect(waiting).toEqual({ destination: "home", callExit: true, navigate: null });
    const scored = stepExamLeave(waiting, { type: "scored" });
    expect(scored).toEqual({ destination: null, callExit: false, navigate: "home" });
    expect(stepExamLeave(scored, { type: "scored" }).navigate).toBe(null);
  });

  it("waits when scoring is already running, and a failed submit does not become a later trip home", () => {
    const waiting = stepExamLeave({ destination: null }, {
      type: "confirm", exam: true, destination: "home", exitBound: false,
    });
    expect(waiting.callExit).toBe(false);
    expect(waiting.navigate).toBe(null);
    const abandoned = stepExamLeave(waiting, { type: "abandon" });
    expect(abandoned.destination).toBe(null);
    expect(stepExamLeave(abandoned, { type: "scored" }).navigate).toBe(null);
  });

  it("leaves immediately when no exam is running", () => {
    const left = stepExamLeave({ destination: "home" }, {
      type: "confirm", exam: false, destination: "qbank", exitBound: false,
    });
    expect(left).toEqual({ destination: null, callExit: false, navigate: "qbank" });
    expect(stepExamLeave({ destination: "home" }, { type: "clear" }).destination).toBe(null);
  });
});
