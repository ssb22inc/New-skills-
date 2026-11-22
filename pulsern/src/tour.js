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
    body: "The round button opens lab reference ranges and Help. Listen reads a question, case, or card aloud and highlights the words, then reads the rationale after you answer. Readiness exams are their own sitting: 85 questions, a clock, feedback after you finish, and each form once. Light and dim are in the header. Home, in that same header, brings you back here.",
  },
];

export function tourStepAt(index) {
  if (!Number.isInteger(index) || index < 0 || index >= TOUR_STEPS.length) return null;
  return TOUR_STEPS[index];
}

export function isLastTourStep(index) {
  return index === TOUR_STEPS.length - 1;
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
