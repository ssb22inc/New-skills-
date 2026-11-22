import { describe, expect, it } from "vitest";
import { hasDraftAnswer, leaveConfirm, planLeaveRequest } from "../src/home-nav.js";

describe("home navigation", () => {
  it("asks before leaving an open round, and stays quiet on a resting screen", () => {
    expect(leaveConfirm({ inSession: false })).toBe(null);
    expect(leaveConfirm(null)).toBe(null);
    const home = leaveConfirm({ inSession: true, hasDraft: false }, "home");
    expect(home.title).toBe("Go home?");
    expect(home.confirmLabel).toBe("Go home");
    expect(home.body).toMatch(/stay saved/);
    const drafted = leaveConfirm({ inSession: true, hasDraft: true }, "qbank");
    expect(drafted.title).toBe("Leave this round?");
    expect(drafted.body).toMatch(/open question clears/);
    const tour = leaveConfirm({ inSession: true }, "tour");
    expect(tour.confirmLabel).toBe("Start the tour");
  });

  it("explains that ending a live exam scores it, because that form is taken once", () => {
    const exam = leaveConfirm({ exam: true, inSession: true }, "home");
    expect(exam.title).toMatch(/End the exam/);
    expect(exam.body).toMatch(/taken once/);
    expect(exam.confirmLabel).toBe("End exam and go home");
  });

  it("asks before a live exam and leaves a quiet screen without a dialog", () => {
    const asked = planLeaveRequest({ session: { exam: true, inSession: true }, destination: "home", tab: "exams" });
    expect(asked.kind).toBe("ask");
    expect(asked.clearExamWait).toBe(false);
    expect(asked.guard.destination).toBe("home");
    expect(asked.guard.confirmLabel).toBe("End exam and go home");
    const recording = planLeaveRequest({ session: { exam: true, inSession: true }, destination: "qbank", tab: "exams" });
    expect(recording.kind).toBe("ask");
    const quiet = planLeaveRequest({ session: { exam: false, inSession: false }, destination: "home", tab: "qbank" });
    expect(quiet).toEqual({ clearExamWait: true, kind: "leave", destination: "home" });
    const sameTab = planLeaveRequest({ session: { exam: false, inSession: false }, destination: "qbank", tab: "qbank" });
    expect(sameTab.kind).toBe("stay");
    const fromTour = planLeaveRequest({ session: { exam: false, inSession: false }, destination: "home", tab: "cards", tourOpen: true });
    expect(fromTour).toEqual({ clearExamWait: true, kind: "leave", destination: "home" });
  });

  it("treats an untouched item as clean and a started answer as open work", () => {
    expect(hasDraftAnswer(null, [], [])).toBe(false);
    expect(hasDraftAnswer({ type: "mc" }, [], [])).toBe(false);
    expect(hasDraftAnswer({ type: "mc" }, [1], [])).toBe(true);
    expect(hasDraftAnswer({ type: "order" }, [], [0])).toBe(true);
    expect(hasDraftAnswer({ type: "calc" }, "  ", [])).toBe(false);
    expect(hasDraftAnswer({ type: "calc" }, "12", [])).toBe(true);
    expect(hasDraftAnswer({ type: "bowtie" }, { actions: [], condition: null, parameters: [] }, [])).toBe(false);
    expect(hasDraftAnswer({ type: "bowtie" }, { actions: [0], condition: null, parameters: [] }, [])).toBe(true);
    expect(hasDraftAnswer({ type: "matrix" }, [null, 1], [])).toBe(true);
    expect(hasDraftAnswer({ type: "cloze" }, ["", null], [])).toBe(false);
  });
});
