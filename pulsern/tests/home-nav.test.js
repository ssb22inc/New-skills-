import { describe, expect, it } from "vitest";
import { hasDraftAnswer, leaveConfirm } from "../src/home-nav.js";

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

  it("scores a live exam before going home, because that form is taken once", () => {
    const exam = leaveConfirm({ exam: true, inSession: true }, "home");
    expect(exam.title).toMatch(/End the exam/);
    expect(exam.body).toMatch(/taken once/);
    expect(exam.confirmLabel).toBe("End exam and go home");
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
