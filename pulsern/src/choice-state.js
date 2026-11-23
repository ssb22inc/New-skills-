/* How one answer option reads after it is checked. Three distinct states so
   a student can see what they picked right, what they missed, and what
   they picked wrong — not just two shades of green.
     "picked-correct"  chosen and correct  (teal ✓)
     "missed"          correct, not chosen (amber, dashed)
     "wrong"           chosen, not correct (coral ✗)
     "picked"          chosen, before checking
     ""                neither */
export function choiceState({ type, answer, sel = [], index, checked = false }) {
  const picked = Array.isArray(sel) && sel.includes(index);
  if (!checked) return picked ? "picked" : "";
  const correct = type === "mc" ? index === answer : Array.isArray(answer) && answer.includes(index);
  if (correct && picked) return "picked-correct";
  if (correct) return "missed";
  if (picked) return "wrong";
  return "";
}

export const CHOICE_BADGE = {
  "picked-correct": "✓ Your pick · correct",
  missed: "Missed · correct answer",
  wrong: "✗ Your pick · incorrect",
};

/* Legacy classes stay on the option so existing styles and tests keep
   working: right = correct option, wrong = incorrect pick. */
export function choiceClasses(state) {
  if (state === "picked-correct") return " picked right st-picked-correct";
  if (state === "missed") return " right st-missed";
  if (state === "wrong") return " picked wrong st-wrong";
  if (state === "picked") return " picked";
  return "";
}
