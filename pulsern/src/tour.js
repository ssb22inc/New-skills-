/* Guided tour of the study tools that actually exist in the app.
   Each step names a real screen. Copy stays confident: built by a working
   hospital RN, readiness is an estimate, and nothing here promises an
   NCLEX result. */

export const TOUR_STEPS = [
  {
    id: "welcome",
    tab: "today",
    focus: "today-round",
    title: "Welcome to PulseRN",
    body: "Built by a working hospital RN, for the way you learn and remember under pressure. This tour walks every major study tool. Open it again anytime from the menu.",
  },
  {
    id: "today",
    tab: "today",
    focus: "today-round",
    title: "Your daily plan",
    body: "Today is home. One tap runs the round: due flashcards first, then 8 adaptive questions, about 10 minutes. Set your exam date in Stats and a weekly plan shows up on this screen.",
  },
  {
    id: "readiness",
    tab: "today",
    focus: "monitor",
    title: "Readiness you can steer by",
    body: "After 12 answers, the monitor shows a readiness range from your work in PulseRN. Use it to choose what to study next. The range is an estimate of your practice so far.",
  },
  {
    id: "practice",
    tab: "qbank",
    focus: "qbank",
    title: "Adaptive practice",
    body: "Practice covers all eight NCSBN client-needs categories. Weaker categories come up more often. Item types are multiple choice, select-all, ordering, matrix, bow-tie, cloze, dosage calculation, and highlight. Some items include a chart. You answer before the rationale: that retrieval is the study. NGN items earn partial credit, and dosage items include a calculator.",
  },
  {
    id: "spacing",
    tab: "qbank",
    focus: "qbank-review",
    title: "Misses come back on a calendar",
    body: "A miss returns tomorrow, then further out as you get it right: 3 days, then 7, 15, and onward. Due reviews lead Today's round. Review misses opens the full miss list whenever you want it. Checked answers are saved to your account.",
  },
  {
    id: "cases",
    tab: "case",
    focus: "cases",
    title: "Case studies",
    body: "Each case is a full clinical-judgment walk: the chart, then the six NCJMM steps from recognizing cues through evaluating outcomes. The library includes sepsis, DKA, and preeclampsia. The tutor is on every step, and steps earn partial credit.",
  },
  {
    id: "cards",
    tab: "cards",
    focus: "cards",
    title: "Flashcards and visuals",
    body: "Type your answer, flip, then grade it. Hard comes back tomorrow. Good and Easy land on later calendar dates. Dosage cards include a calculator, and a lab-value card shows the range on a scale. Some rationales add a short visual for acid–base, potassium, IV fluids, insulin timing, isolation, or pressure injury.",
  },
  {
    id: "stats",
    tab: "stats",
    focus: "stats",
    title: "Progress",
    body: "Stats shows your accuracy by client-needs category and by pediatric, geriatric, and maternal clients. Your streak, exam date, and profile live here. The readiness range stays on Today, labeled as an estimate.",
  },
  {
    id: "tools",
    tab: "today",
    focus: "today-round",
    title: "The tools around the questions",
    body: "The floating 🧪 button opens the lab reference ranges, a quick lookup, and Help over any screen, mid-question too, and you can drag it anywhere. Listen reads a question, case, or card aloud and highlights the words, then reads the rationale after you answer. Readiness exams are their own sitting: 85 questions, a clock, feedback after you finish, and each form once. Light and night mode live in the menu. The PulseRN logo brings you back here.",
  },
];

/* The short tour a new student sees after their first answer. Three steps,
   each on a real screen. The full walk-through stays in the menu. */
export const QUICK_TOUR_STEPS = [
  {
    id: "quick-round",
    tab: "today",
    focus: "today-round",
    title: "Your daily round",
    body: "Built by a working hospital RN, for the way you learn and remember under pressure. One tap runs today's round: due flashcards first, then 8 adaptive questions, about 10 minutes.",
  },
  {
    id: "quick-practice",
    tab: "qbank",
    focus: "qbank",
    title: "Practice, cases, and cards",
    body: "Practice adapts to you across all eight client-needs categories. Use Focus to drill one area. Cases walk the six NCJMM steps, and Cards bring facts back on real calendar dates.",
  },
  {
    id: "quick-tools",
    tab: "today",
    focus: "monitor",
    title: "Tools and progress",
    body: "The floating 🧪 button opens lab ranges, a quick lookup, and Help without leaving the question. Drag it anywhere. After 12 answers, the monitor shows a readiness range, labeled as an estimate. The full tour, night mode, and settings are in the menu.",
  },
];

export function tourStepsFor(mode) {
  return mode === "quick" ? QUICK_TOUR_STEPS : TOUR_STEPS;
}

export function tourStepAt(index, steps = TOUR_STEPS) {
  if (!Number.isInteger(index) || index < 0 || index >= steps.length) return null;
  return steps[index];
}

export function isLastTourStep(index, steps = TOUR_STEPS) {
  return index === steps.length - 1;
}

/* Tab wraps inside a dialog. A focus that is not on a control (index -1)
   lands on the first control, or the last when shifting backward. */
export function nextDialogFocus(count, index, shiftKey) {
  if (count <= 0) return 0;
  if (shiftKey) return index <= 0 ? count - 1 : index - 1;
  return index >= count - 1 ? 0 : index + 1;
}

export function tourMark(activeFocus, id) {
  return activeFocus === id ? " tour-target" : "";
}

export function blocksOverlap(a, b) {
  if (!a || !b || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/* Put the highlighted control under the header and above the tour sheet.
   A short control at the end of the page needs room below it before it can
   move up. A tall control stops once its top meets the header, so the
   heading is not scrolled off the screen to clear the sheet. */
export function scrollTourTarget(target, sheet, header) {
  if (!target?.scrollIntoView) return false;
  target.scrollIntoView({ block: "start", inline: "nearest" });
  const headerBottom = () => (header?.getBoundingClientRect?.().bottom ?? 0);
  if (sheet?.getBoundingClientRect) {
    const box = target.getBoundingClientRect();
    const sheetTop = sheet.getBoundingClientRect().top - 12;
    const overlap = box.bottom - sheetTop;
    const room = box.top - (headerBottom() + 8);
    if (overlap > 0 && room > 1) window.scrollBy({ top: Math.min(overlap, room), left: 0 });
  }
  const box = target.getBoundingClientRect();
  const sheetBox = sheet?.getBoundingClientRect?.();
  const belowHeader = box.top >= headerBottom() - 1;
  const aboveSheet = !sheetBox || !blocksOverlap(box, sheetBox);
  return belowHeader && aboveSheet && box.height > 0;
}
