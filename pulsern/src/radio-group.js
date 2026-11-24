/* WAI-ARIA radiogroup on buttons. Arrow keys move focus and selection
   and wrap. Home and End jump. Space selects the focused radio. Digit
   shortcuts are left for the study-key handler. */

const STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

export function onRadioKeyDown(event) {
  const key = event.key;
  const current = event.currentTarget;
  if (!current || typeof current.closest !== "function") return;
  const group = current.closest("[role='radiogroup']");
  if (!group) return;
  const radios = [...group.querySelectorAll("[role='radio']")].filter((el) => !el.disabled);
  const index = radios.indexOf(current);
  if (index < 0) return;
  if (key === " " || key === "Spacebar") {
    event.preventDefault();
    event.stopPropagation();
    current.click();
    return;
  }
  let next = null;
  if (key in STEP) next = (index + STEP[key] + radios.length) % radios.length;
  else if (key === "Home") next = 0;
  else if (key === "End") next = radios.length - 1;
  else return;
  event.preventDefault();
  event.stopPropagation();
  const target = radios[next];
  target.focus();
  target.click();
}

/* The selected radio is the only tab stop. With nothing selected yet, the
   first radio is. */
export function radioTabIndex(checked, index, anyChecked) {
  if (checked || (!anyChecked && index === 0)) return 0;
  return -1;
}
