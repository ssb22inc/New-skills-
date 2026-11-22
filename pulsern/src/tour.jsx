import { useEffect, useRef } from "react";
import { TOUR_STEPS, isLastTourStep, nextDialogFocus, scrollTourTarget, tourStepAt } from "./tour.js";

/* Follow the step's real screen. The tab change paints first. Positioning
   runs again when that screen replaces a placeholder, which is how the
   flashcard queue arrives after the empty heading. */
export function useTourPlacement(tourStep, tab, setTab) {
  useEffect(() => {
    if (tourStep == null) return undefined;
    const step = tourStepAt(tourStep);
    if (!step) return undefined;
    if (step.tab && step.tab !== tab) {
      setTab(step.tab);
      return undefined;
    }
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        scrollTourTarget(
          document.querySelector(`[data-tour="${step.focus}"]`),
          document.querySelector(".tour-overlay:not(.leave-overlay) .tour-card"),
          document.querySelector(".top"),
        );
      });
    };
    place();
    const root = document.querySelector("main.body");
    const observer = root ? new MutationObserver(place) : null;
    observer?.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [tourStep, tab, setTab]);
}

/* The dialog sits over the app. Focus starts on its primary action, Tab
   stays inside it, and the rest of the app is inert until it closes. */
function useModal(token, onEscape) {
  const ref = useRef(null);
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    const previouslyFocused = document.activeElement;
    const background = [...document.querySelectorAll(".app > *")].filter((node) => node !== dialog);
    background.forEach((node) => { node.inert = true; });
    const focusable = () => [...dialog.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])")];
    (dialog.querySelector(".btn:not(.ghost):not([disabled])") || focusable()[0])?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const index = items.indexOf(document.activeElement);
      if (!items.length) return;
      event.preventDefault();
      items[nextDialogFocus(items.length, index, event.shiftKey)]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      background.forEach((node) => { node.inert = false; });
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [token]);
  return ref;
}

/* Bottom sheet so the step stays on screen on a phone and on a wide fold.
   The screen behind it is the real section for this step. */
export function Tour({ step, activating, onBack, onNext, onSkip, onHome, onAnswer }) {
  const current = TOUR_STEPS[step] ?? TOUR_STEPS[0];
  const last = isLastTourStep(step);
  const ref = useModal(step, onSkip);

  const forward = () => {
    if (last) {
      if (activating) onAnswer();
      else onSkip();
      return;
    }
    onNext();
  };

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-title" ref={ref}>
      <div className="tour-card">
        <p className="eyebrow">Tour · {step + 1} of {TOUR_STEPS.length}</p>
        <h2 className="h2" id="tour-title">{current.title}</h2>
        <p className="small">{current.body}</p>
        {activating && step === 0 && (
          <p className="small">Your free pass is on. When you finish or skip, your first question is waiting on Today.</p>
        )}
        <div className="tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((item, index) => (
            <span key={item.id} className={index === step ? "dot on" : "dot"} />
          ))}
        </div>
        <div className="row tour-actions">
          <button type="button" className="btn ghost" onClick={onBack} disabled={step === 0}>Back</button>
          <button type="button" className="btn" onClick={forward}>
            {last ? (activating ? "Answer your first question" : "Back to Today") : "Next"}
          </button>
          <button type="button" className="btn ghost" onClick={onHome}>Home</button>
          <button type="button" className="btn ghost" onClick={onSkip}>Skip</button>
        </div>
      </div>
    </div>
  );
}

export function LeaveDialog({ guard, onConfirm, onCancel }) {
  const ref = useModal(guard?.title ?? "", onCancel);
  if (!guard) return null;
  return (
    <div className="tour-overlay leave-overlay" role="dialog" aria-modal="true" aria-labelledby="leave-title" ref={ref}>
      <div className="tour-card">
        <h2 className="h2" id="leave-title">{guard.title}</h2>
        <p className="small">{guard.body}</p>
        <div className="row tour-actions">
          <button type="button" className="btn" onClick={onConfirm}>{guard.confirmLabel}</button>
          <button type="button" className="btn ghost" onClick={onCancel}>{guard.cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}
