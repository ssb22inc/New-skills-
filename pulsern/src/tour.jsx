import { TOUR_STEPS, isLastTourStep } from "./tour.js";

/* Bottom sheet so the step stays on screen on a phone and on a wide fold.
   The screen behind it is the real section for this step. */
export function Tour({ step, activating, onBack, onNext, onSkip, onHome, onAnswer }) {
  const current = TOUR_STEPS[step] ?? TOUR_STEPS[0];
  const last = isLastTourStep(step);

  const forward = () => {
    if (last) {
      if (activating) onAnswer();
      else onSkip();
      return;
    }
    onNext();
  };

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-title">
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
  if (!guard) return null;
  return (
    <div className="tour-overlay leave-overlay" role="dialog" aria-modal="true" aria-labelledby="leave-title">
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
