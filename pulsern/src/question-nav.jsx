/* Back, Next, and Skip. Large targets for a phone held in one hand.
   The count is the way back to anything skipped this sitting.
   The row sticks above the tab bar on a long item, and stays in flow
   when sticking would cover Check answer. The lab reference is the
   draggable 🧪 study toolkit (src/lab-fab.jsx). nextPrimary=false
   keeps Next secondary while "Check answer" is the one primary action. */
import React, { useEffect, useRef } from "react";

export const OPEN_LABS_EVENT = "pulsern:open-labs";

/* True when Check answer would meet the sticky navigation row, including
   a button that starts just above the row and extends into it. */
export function navCoversCheck(box, stickTop, navHeight) {
  if (!box || navHeight <= 0) return false;
  const slotBottom = stickTop + navHeight;
  return box.bottom > stickTop + 1 && box.top < slotBottom - 1;
}
export function openLabs() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_LABS_EVENT));
}

export function QuestionNav({
  canBack,
  canSkip = true,
  canNext = true,
  skipped,
  onBack,
  onSkip,
  onNext,
  onReview,
  nextLabel = "Next",
  nextAria = "Next question",
  skipAria = "Skip this question without scoring it",
  backLabel = "Back",
  backAria = "Back to the previous question",
  reviewLabel = "Review skipped",
  emptyReviewAria = "No skipped questions",
  layout = "sticky",
  nextPrimary = true,
}) {
  const skippedLabel = skipped === 1 ? "1 skipped" : `${skipped} skipped`;
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || layout !== "sticky") return undefined;
    let frame = 0;
    const place = () => {
      frame = 0;
      el.classList.add("q-nav-flat");
      const natural = el.getBoundingClientRect();
      const stickTop = window.innerHeight - 62 - natural.height;
      const checks = [...(el.parentElement?.querySelectorAll("button") ?? [])].filter((node) => !el.contains(node) && /check answer/i.test(node.textContent || ""));
      const coversCheck = checks.some((node) => navCoversCheck(node.getBoundingClientRect(), stickTop, natural.height));
      el.classList.toggle("q-nav-flat", coversCheck);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    ro?.observe(el.parentElement || document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, [layout]);
  return (
    <div ref={ref} className={(layout === "inline" ? "q-nav-wrap card-nav" : "q-nav-wrap") + " q-nav-flat"}>
      <div className="q-skipped">
        <p className="small mono q-skipped-count">{skippedLabel}</p>
        <button
          type="button"
          className="btn ghost"
          disabled={skipped < 1}
          onClick={onReview}
          aria-label={skipped < 1 ? emptyReviewAria : `Review ${skippedLabel}`}
        >
          {reviewLabel}
        </button>
      </div>
      <div className="q-nav" role="group" aria-label="Question navigation">
        <button type="button" className="btn ghost" disabled={!canBack} onClick={onBack} aria-label={backAria}>
          {backLabel}
        </button>
        <button type="button" className="btn ghost" disabled={!canSkip} onClick={onSkip} aria-label={skipAria}>
          Skip
        </button>
        <button type="button" className={nextPrimary ? "btn" : "btn ghost"} disabled={!canNext} onClick={onNext} aria-label={nextAria}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
