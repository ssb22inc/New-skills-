/* Flagship UX layer: three-state answer feedback, shared study shortcuts,
   the Cards progress indicator and grade undo, the 3-step quick tour, and
   a first question that comes before any tour. Deterministic plain code. */
import { describe, it, expect } from "vitest";
import { choiceState, choiceClasses, CHOICE_BADGE } from "../src/choice-state.js";
import { studyKeyAction, SHORTCUT_HINT, MOVE_HINT, shortcutHint, digitPickEnabled, CARD_SHORTCUT_HINT } from "../src/study-keys.js";
import { startSession, gradeCurrent, goBack, currentCard, sessionProgress, canUndoGrade, undoGrade } from "../src/card-nav.js";
import { QUICK_TOUR_STEPS, TOUR_STEPS, tourStepsFor, tourStepAt, isLastTourStep } from "../src/tour.js";
import { shouldAutoOpenTour } from "../src/first-answer.js";
import { focusSummary, focusCount } from "../src/focus-sheet.jsx";

const BANNED = [/pass(?:ing)? the nclex/i, /guarantee/i, /might be wrong/i, /may be wrong/i, /as an ai/i,
  /could be incorrect/i, /we think/i, /not sure/i, /uworld/i, /archer/i, /kaplan/i, /hospital (?:name|unit)/i];

describe("three-state answer feedback", () => {
  const sata = { type: "sata", answer: [0, 2], sel: [0, 1], checked: true };
  it("separates picked-correct, missed, and wrong", () => {
    expect(choiceState({ ...sata, index: 0 })).toBe("picked-correct");
    expect(choiceState({ ...sata, index: 2 })).toBe("missed");
    expect(choiceState({ ...sata, index: 1 })).toBe("wrong");
    expect(choiceState({ ...sata, index: 3 })).toBe("");
  });
  it("only shows a pick before checking", () => {
    expect(choiceState({ ...sata, checked: false, index: 0 })).toBe("picked");
    expect(choiceState({ ...sata, checked: false, index: 2 })).toBe("");
  });
  it("handles single-answer questions", () => {
    expect(choiceState({ type: "mc", answer: 1, sel: [1], index: 1, checked: true })).toBe("picked-correct");
    expect(choiceState({ type: "mc", answer: 1, sel: [0], index: 1, checked: true })).toBe("missed");
    expect(choiceState({ type: "mc", answer: 1, sel: [0], index: 0, checked: true })).toBe("wrong");
  });
  it("keeps legacy classes and has a text badge per state", () => {
    expect(choiceClasses("picked-correct")).toMatch(/\bright\b.*st-picked-correct/);
    expect(choiceClasses("missed")).toMatch(/\bright\b.*st-missed/);
    expect(choiceClasses("wrong")).toMatch(/\bwrong\b.*st-wrong/);
    for (const k of ["picked-correct", "missed", "wrong"]) expect(CHOICE_BADGE[k]).toBeTruthy();
  });
});

describe("study shortcuts", () => {
  const ev = (key, extra = {}) => ({ key, target: { tagName: "DIV", closest: () => null }, ...extra });
  it("maps arrows, Enter, and digits", () => {
    expect(studyKeyAction(ev("ArrowLeft"))).toEqual({ type: "back" });
    expect(studyKeyAction(ev("ArrowRight"))).toEqual({ type: "next" });
    expect(studyKeyAction(ev("Enter"))).toEqual({ type: "primary" });
    expect(studyKeyAction(ev("3"))).toEqual({ type: "pick", index: 2 });
    expect(studyKeyAction(ev("0"))).toBe(null);
    expect(studyKeyAction(ev("x"))).toBe(null);
  });
  it("stays out of fields, focused buttons, dialogs, and modifier chords", () => {
    expect(studyKeyAction({ key: "1", target: { tagName: "INPUT" } })).toBe(null);
    expect(studyKeyAction({ key: "1", target: { tagName: "TEXTAREA" } })).toBe(null);
    expect(studyKeyAction({ key: "Enter", target: { tagName: "BUTTON", closest: () => null } })).toBe(null);
    expect(studyKeyAction({ key: "1", target: { tagName: "DIV", closest: () => ({}) } })).toBe(null);
    expect(studyKeyAction(ev("ArrowRight", { metaKey: true }))).toBe(null);
  });
  it("leaves arrow, Enter, and Space keys to radios, checks, and fields", () => {
    const control = (tag, role, inside) => ({
      tagName: tag,
      isContentEditable: tag === "EDITABLE",
      getAttribute: (name) => (name === "role" ? role : null),
      closest: (sel) => (inside && sel.includes(inside) ? {} : null),
    });
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "];
    const targets = [
      control("BUTTON", "radio"),
      control("BUTTON", "checkbox"),
      control("INPUT", null),
      control("TEXTAREA", null),
      control("SELECT", null),
      control("EDITABLE", null),
      control("DIV", null, "radiogroup"),
      control("DIV", null, "listbox"),
    ];
    for (const target of targets) for (const key of keys) expect(studyKeyAction({ key, target })).toBe(null);
    expect(studyKeyAction({ key: "2", target: control("BUTTON", "radio") })).toEqual({ type: "pick", index: 1 });
    expect(studyKeyAction({ key: "3", target: control("BUTTON", "checkbox") })).toEqual({ type: "pick", index: 2 });
    expect(studyKeyAction({ key: "1", target: control("DIV", null, "radiogroup") })).toEqual({ type: "pick", index: 0 });
  });
  it("still moves back and next when focus is not in a form control", () => {
    expect(studyKeyAction(ev("ArrowLeft"))).toEqual({ type: "back" });
    expect(studyKeyAction(ev("ArrowRight"))).toEqual({ type: "next" });
    expect(studyKeyAction(ev("Enter"))).toEqual({ type: "primary" });
  });
  it("publishes short hints", () => {
    expect(SHORTCUT_HINT).toMatch(/Enter/);
    expect(CARD_SHORTCUT_HINT).toMatch(/1–4/);
    for (const type of ["mc", "sata", "highlight"]) {
      expect(digitPickEnabled(type)).toBe(true);
      expect(shortcutHint(type)).toBe(SHORTCUT_HINT);
      expect(shortcutHint(type)).toMatch(/1–9 pick/);
    }
    for (const type of ["order", "matrix", "bowtie", "cloze", "calc"]) {
      expect(digitPickEnabled(type)).toBe(false);
      expect(shortcutHint(type)).toBe(MOVE_HINT);
      expect(shortcutHint(type)).not.toMatch(/1–9/);
    }
  });
});

describe("Cards progress and undo", () => {
  it("counts position and total for the 'n / N' indicator", () => {
    let nav = startSession(["a", "b", "c"]);
    expect(sessionProgress(nav)).toMatchObject({ position: 1, total: 3, done: 0 });
    nav = gradeCurrent(nav, "good").nav;
    expect(sessionProgress(nav)).toMatchObject({ position: 2, total: 3, done: 1 });
  });
  it("undoes a grade after Back and keeps that card unfinished", () => {
    let nav = startSession(["a", "b", "c"]);
    expect(canUndoGrade(nav)).toBe(false);
    nav = gradeCurrent(nav, "again").nav;
    nav = goBack(nav);
    expect(currentCard(nav).id).toBe("a");
    expect(canUndoGrade(nav)).toBe(true);
    const undone = undoGrade(nav);
    expect(currentCard(undone).grade).toBe(null);
    expect(currentCard(undone).show).toBe(true);
    expect(undone.queue).toContain("a");
    expect(undoGrade(startSession(["a"]))).toEqual(startSession(["a"]));
  });
});

describe("quick tour", () => {
  it("has three brand-safe steps", () => {
    expect(QUICK_TOUR_STEPS).toHaveLength(3);
    expect(tourStepsFor("quick")).toBe(QUICK_TOUR_STEPS);
    expect(tourStepsFor("full")).toBe(TOUR_STEPS);
    expect(tourStepAt(2, QUICK_TOUR_STEPS).id).toBe("quick-tools");
    expect(isLastTourStep(2, QUICK_TOUR_STEPS)).toBe(true);
    for (const step of [...QUICK_TOUR_STEPS, ...TOUR_STEPS]) {
      for (const re of BANNED) expect(`${step.title} ${step.body}`).not.toMatch(re);
    }
  });
  it("waits until a new student has answered a first question", () => {
    const base = { loaded: true, tourSeen: false, ent: { status: "trial" }, locked: false, sessionLive: false };
    expect(shouldAutoOpenTour({ ...base, firstAnswerOwed: true })).toBe(false);
    expect(shouldAutoOpenTour({ ...base, firstAnswerOwed: false })).toBe(true);
  });
});

describe("Focus sheet summary", () => {
  it("summarises the active filters for the one-line trigger", () => {
    const groups = [{ label: "Category", options: [["a", "Pharmacology"], ["b", "Safety"]], selected: ["a"] }];
    expect(focusCount(groups)).toBe(1);
    expect(focusSummary(groups, "All")).toMatch(/Pharmacology/);
    expect(focusSummary([{ label: "x", options: [["a", "A"]], selected: [] }], "All")).toBe("All");
  });
});
