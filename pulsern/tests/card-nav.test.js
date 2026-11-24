/* Cards: Back, Skip, and Next. A skip must not become a grade. The
   spaced-repetition schedule stays exactly as it was. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  AGAIN_GAP, REQUEUE_GAP, startSession, currentCard, atFrontier, canGoBack, canGoForward,
  canSkip, cardsLeft, skippedCount, sessionOutcome, saveCardView, goBack, goForward,
  skipCurrent, gradeCurrent, jumpToSkipped, cardNavAction, undoGrade, sessionProgress,
} from "../src/card-nav.js";
import { nextSchedule } from "../src/srs.js";
import { Flashcards, ThemeToggle } from "../src/App.jsx";

const deck = ["a", "b", "c", "d", "e", "f"];

/* What Flashcards is allowed to do: write nextSchedule only after a
   recorded grade. Skip, Back, and Next never take this branch. */
function apply(srs, nav, op, grade) {
  if (op === "grade") {
    const id = currentCard(nav)?.id;
    const result = gradeCurrent(nav, grade);
    if (!result.recorded) return { srs, nav: result.nav };
    return { srs: { ...srs, [id]: nextSchedule(srs[id], grade) }, nav: result.nav };
  }
  if (op === "back") return { srs, nav: goBack(nav) };
  if (op === "review") return { srs, nav: jumpToSkipped(nav) };
  const result = op === "skip" ? skipCurrent(nav) : goForward(nav);
  return { srs, nav: result.nav };
}

describe("card history", () => {
  it("starts on the first card with Back off and the whole queue still ahead", () => {
    const nav = startSession(deck);
    expect(canGoBack(nav)).toBe(false);
    expect(canGoForward(nav)).toBe(true);
    expect(canSkip(nav)).toBe(true);
    expect(atFrontier(nav)).toBe(true);
    expect(currentCard(nav)).toMatchObject({ id: "a", show: false, typed: "", grade: null });
    expect(cardsLeft(nav)).toBe(deck.length);
    expect(skippedCount(nav)).toBe(0);
    expect(sessionOutcome(nav)).toBe("studying");
    expect(goBack(nav)).toBe(nav);
  });

  it("Back is off at the start and on after a card is left behind", () => {
    let nav = startSession(["a", "b"]);
    expect(canGoBack(nav)).toBe(false);
    nav = goForward(nav).nav;
    expect(canGoBack(nav)).toBe(true);
    expect(currentCard(nav).id).toBe("b");
    nav = goBack(nav);
    expect(currentCard(nav).id).toBe("a");
    expect(canGoBack(nav)).toBe(false);
    expect(goBack(nav)).toBe(nav);
  });

  it("Next in history restores the next opened card and does not skip it", () => {
    let nav = startSession(["a", "b", "c"]);
    nav = saveCardView(nav, { show: true, typed: "60" });
    nav = skipCurrent(nav).nav;
    const passes = nav.skipPasses.a;
    expect(currentCard(nav).id).toBe("b");
    nav = goBack(nav);
    expect(currentCard(nav)).toMatchObject({ id: "a", show: true, typed: "60", skippedVisit: true });
    const fwd = goForward(nav);
    expect(fwd.effect).toBe("restore");
    expect(currentCard(fwd.nav).id).toBe("b");
    expect(fwd.nav.skipPasses.a).toBe(passes);
    expect(fwd.nav.queue).toContain("a");
    expect(atFrontier(fwd.nav)).toBe(true);
  });

  it("Next on the live ungraded card skips it, the same way Skip does", () => {
    const start = startSession(["a", "b", "c"]);
    expect(goForward(start).nav).toEqual(skipCurrent(start).nav);
    const moved = goForward(start);
    expect(moved.effect).toBe("advance");
    expect(currentCard(moved.nav).id).toBe("b");
    expect(moved.nav.skipPasses.a).toBe(1);
    expect(moved.nav.entries[0].grade).toBeNull();
  });

  it("does not move past the end, and Back from the end returns to the last card", () => {
    let nav = skipCurrent(startSession(["a"])).nav;
    expect(sessionOutcome(nav)).toBe("skipped");
    expect(currentCard(nav)).toBeNull();
    expect(canGoForward(nav)).toBe(false);
    expect(canSkip(nav)).toBe(false);
    expect(goForward(nav).nav).toBe(nav);
    nav = goBack(nav);
    expect(currentCard(nav).id).toBe("a");
    expect(canGoBack(nav)).toBe(false);
  });
});

describe("one grade per undone card", () => {
  it("grades the requeued visit once: walking back cannot advance the schedule or XP again", () => {
    let nav = startSession(["a", "b"]);
    let srs = {};
    let xp = 0;
    const grade = (g) => {
      const result = gradeCurrent(nav, g);
      if (!result.recorded) return false;
      const id = currentCard(nav).id;
      srs = { ...srs, [id]: nextSchedule(srs[id], g) };
      xp += g === "good" ? 5 : g === "easy" ? 8 : 0;
      nav = result.nav;
      return true;
    };
    expect(grade("good")).toBe(true);
    nav = goBack(nav);
    nav = undoGrade(nav);
    delete srs.a;
    xp -= 5;
    nav = goForward(nav).nav;
    expect(grade("good")).toBe(true);
    expect(currentCard(nav).id).toBe("a");
    expect(grade("good")).toBe(true);
    expect(srs.a.interval).toBe(3);
    const awarded = xp;
    nav = goBack(nav);
    nav = goBack(nav);
    nav = goBack(nav);
    expect(currentCard(nav)).toMatchObject({ id: "a", grade: "good" });
    expect(grade("good")).toBe(false);
    expect(srs.a.interval).toBe(3);
    expect(xp).toBe(awarded);
  });
});

describe("undo clears every copied grade", () => {
  it("does not count an undone card as reviewed", () => {
    let nav = startSession(["a", "b"]);
    nav = skipCurrent(nav).nav;
    nav = gradeCurrent(nav, "good").nav;
    expect(currentCard(nav).id).toBe("a");
    nav = gradeCurrent(nav, "good").nav;
    expect(sessionProgress(nav).done).toBe(2);
    nav = goBack(nav);
    nav = undoGrade(nav);
    expect(nav.entries.filter((e) => e.id === "a").every((e) => e.grade == null)).toBe(true);
    expect(sessionProgress(nav).done).toBe(1);
  });
});

describe("undo stays unfinished", () => {
  it("keeps an undone card in the queue when Next moves on", () => {
    let nav = startSession(["a", "b", "c"]);
    nav = gradeCurrent(nav, "good").nav;
    nav = goBack(nav);
    nav = undoGrade(nav);
    expect(currentCard(nav)).toMatchObject({ id: "a", grade: null });
    nav = goForward(nav).nav;
    expect(currentCard(nav).id).toBe("b");
    expect(nav.queue).toContain("a");
    nav = gradeCurrent(nav, "good").nav;
    nav = gradeCurrent(nav, "good").nav;
    expect(currentCard(nav)).toMatchObject({ id: "a", grade: null });
    expect(sessionOutcome(nav)).toBe("studying");
  });
});

describe("skip does not schedule", () => {
  const srs = {
    a: { interval: 15, due: "2026-08-01", seen: "2026-07-01" },
    b: { interval: 3, due: "2026-07-13", seen: "2026-07-10" },
  };

  it("leaves every schedule entry untouched across skip, back, forward, and review", () => {
    let nav = startSession(["a", "b", "c", "d", "e"]);
    let state = { srs, nav };
    state = apply(state.srs, state.nav, "skip");
    state = apply(state.srs, state.nav, "back");
    state = apply(state.srs, state.nav, "next");
    state = apply(state.srs, state.nav, "skip");
    state = apply(state.srs, state.nav, "review");
    state = apply(state.srs, state.nav, "forward");
    expect(state.srs).toEqual(srs);
    expect(state.srs).toBe(srs);
    expect(skipCurrent(startSession(["a"])).recorded).toBeUndefined();
    expect(goForward(startSession(["a"])).recorded).toBeUndefined();
  });

  it("brings a first skip back after other cards, and a second skip waits for later", () => {
    let nav = startSession(deck);
    nav = skipCurrent(nav).nav;
    expect(nav.queue.indexOf("a")).toBe(REQUEUE_GAP - 1);
    const seen = [];
    while (currentCard(nav) && seen.length < 8) {
      seen.push(currentCard(nav).id);
      if (currentCard(nav).id === "a") break;
      nav = gradeCurrent(nav, "good").nav;
    }
    expect(seen).toEqual(["b", "c", "d", "a"]);
    expect(currentCard(nav).grade).toBeNull();
    nav = skipCurrent(nav).nav;
    expect(nav.skipPasses.a).toBe(2);
    expect(nav.queue).not.toContain("a");
    const rest = [];
    while (currentCard(nav) && rest.length < 8) {
      rest.push(currentCard(nav).id);
      nav = gradeCurrent(nav, "good").nav;
    }
    expect(rest).not.toContain("a");
    expect(sessionOutcome(nav)).toBe("skipped");
  });

  it("jumps to skipped cards and wraps, without grading them", () => {
    let nav = startSession(["a", "b", "c", "d"]);
    nav = skipCurrent(nav).nav;
    nav = skipCurrent(nav).nav;
    expect(skippedCount(nav)).toBe(2);
    expect(currentCard(nav).id).toBe("c");
    nav = jumpToSkipped(nav);
    expect(currentCard(nav).id).toBe("a");
    nav = jumpToSkipped(nav);
    expect(currentCard(nav).id).toBe("b");
    nav = jumpToSkipped(nav);
    expect(currentCard(nav).id).toBe("a");
    expect(nav.entries.every((e) => e.grade == null)).toBe(true);
    expect(nav.skipPasses).toEqual({ a: 1, b: 1 });
  });

  it("a grade is recorded once per visit, and Back does not record it again", () => {
    let srsMap = { a: { interval: 15, due: "2026-07-13", seen: "2026-07-01" } };
    let nav = startSession(["a", "b"]);
    const before = structuredClone(srsMap);
    let state = apply(srsMap, nav, "grade", "good");
    srsMap = state.srs;
    nav = state.nav;
    expect(srsMap.a).toEqual(nextSchedule(before.a, "good"));
    expect(srsMap.b).toBeUndefined();
    expect(currentCard(nav).id).toBe("b");
    nav = goBack(nav);
    expect(currentCard(nav).grade).toBe("good");
    const again = apply(srsMap, nav, "grade", "again");
    expect(again.nav).toBe(nav);
    expect(again.srs).toBe(srsMap);
    const skipped = apply(srsMap, nav, "skip");
    expect(skipped.srs).toBe(srsMap);
    expect(currentCard(skipped.nav).id).toBe("b");
  });

  it("again still returns after two cards, and that later visit can be graded", () => {
    let nav = startSession(["a", "b", "c", "d"]);
    const first = gradeCurrent(nav, "again");
    expect(first.recorded).toBe(true);
    nav = first.nav;
    expect(nav.queue.indexOf("a")).toBe(AGAIN_GAP - 1);
    expect(currentCard(nav).id).toBe("b");
    nav = gradeCurrent(nav, "good").nav;
    nav = gradeCurrent(nav, "good").nav;
    expect(currentCard(nav).id).toBe("a");
    expect(currentCard(nav).grade).toBeNull();
    const second = gradeCurrent(nav, "good");
    expect(second.recorded).toBe(true);
  });
});

describe("keyboard", () => {
  const div = { tagName: "DIV", closest: () => null };
  const input = { tagName: "INPUT", closest: () => null };
  const dialogBtn = { tagName: "BUTTON", closest: (sel) => (sel.includes("dialog") ? {} : null) };

  it("uses Left and Right only when the student is not typing", () => {
    expect(cardNavAction({ key: "ArrowLeft", target: div })).toBe("back");
    expect(cardNavAction({ key: "ArrowRight", target: div })).toBe("next");
    expect(cardNavAction({ key: "ArrowLeft", target: input })).toBeNull();
    expect(cardNavAction({ key: "ArrowRight", target: { tagName: "TEXTAREA", closest: () => null } })).toBeNull();
    expect(cardNavAction({ key: "ArrowRight", target: { tagName: "SELECT", closest: () => null } })).toBeNull();
    expect(cardNavAction({ key: "ArrowLeft", target: { tagName: "DIV", isContentEditable: true, closest: () => null } })).toBeNull();
    expect(cardNavAction({ key: "ArrowLeft", target: dialogBtn })).toBeNull();
    expect(cardNavAction({ key: "ArrowRight", ctrlKey: true, target: div })).toBeNull();
    expect(cardNavAction({ key: "ArrowLeft", metaKey: true, target: div })).toBeNull();
    expect(cardNavAction({ key: "ArrowRight", altKey: true, target: div })).toBeNull();
  });

  it("does not take Enter or the grade keys", () => {
    for (const key of ["Enter", "1", "2", "3", "4", "a", "h", "g", "e", " ", "Escape"]) {
      expect(cardNavAction({ key, target: div })).toBeNull();
    }
  });
});

describe("theme toggle while locked", () => {
  it("is a 44px header control for exams and locked access", () => {
    const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    expect(src).toMatch(/\(examLock \|\| locked\) && \(\s*<ThemeToggle/);
    expect(src).toMatch(/\.theme-compact\{[^}]*min-width:44px;min-height:44px/);
    const html = renderToStaticMarkup(React.createElement(ThemeToggle, { theme: "light", onToggle() {} }));
    expect(html).toContain('aria-label="Night mode"');
    expect(html).toContain("theme-compact");
    expect(renderToStaticMarkup(React.createElement(ThemeToggle, { theme: "dim", onToggle() {} }))).toContain('aria-label="Light mode"');
  });
});

describe("cards screen", () => {
  const card = (id, front) => ({ id, cat: "Pharmacology", topic: "Digoxin", front, back: "60 per minute" });

  it("shows Back, Skip, and Next under the card, with Back off at the start", () => {
    const html = renderToStaticMarkup(
      React.createElement(Flashcards, {
        addXp: () => {},
        cards: [card("c1", "Hold digoxin below this rate."), card("c2", "Second card prompt")],
        srsMap: {},
        setSrsMap: () => {},
        touchDay: () => {},
        ready: true,
      })
    );
    expect(html).toContain("Hold digoxin below this rate.");
    expect(html).toContain("Back to the previous card");
    expect(html).toContain("Skip this card without grading it");
    expect(html).toContain("← Back");
    expect(html).toContain(">Skip<");
    expect(html).toContain("Next →");
    expect(html).toContain("card-nav");
    expect(html).toContain("disabled");
    const backAt = html.indexOf("Back to the previous card");
    const cardAt = html.indexOf("Hold digoxin below this rate.");
    expect(backAt).toBeGreaterThan(cardAt);
  });

  it("wires the schedule write only through a recorded grade", () => {
    const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    const body = app.slice(app.indexOf("export function Flashcards"), app.indexOf("/* ================= STATS"));
    expect(body).toContain("gradeCard");
    expect(body).toContain("nextSchedule");
    expect(body).toContain("cardNavAction");
    const gradeAt = body.indexOf("const grade =");
    const afterGrade = body.indexOf("const interval", gradeAt);
    const gradeFn = body.slice(gradeAt, afterGrade);
    expect(gradeFn).toContain("nextSchedule");
    expect(gradeFn).toContain("recorded");
    const navFns = body.slice(body.indexOf("const onBack"), body.indexOf("const grade ="));
    expect(navFns).not.toContain("nextSchedule");
    expect(navFns).not.toContain("setSrsMap");
    const css = app.slice(app.indexOf(".q-nav-wrap.card-nav"), app.indexOf(".q-nav-wrap.card-nav") + 500);
    expect(css).toContain("position:static");
    expect(app).toContain(".q-nav .btn{margin-top:0;min-height:48px");
  });
});
