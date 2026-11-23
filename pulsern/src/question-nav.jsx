/* Back, Next, and Skip. Large targets for a phone held in one hand.
   The count is the way back to anything skipped this sitting. */

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
}) {
  const skippedLabel = skipped === 1 ? "1 skipped" : `${skipped} skipped`;
  return (
    <div className={layout === "inline" ? "q-nav-wrap card-nav" : "q-nav-wrap"}>
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
        <button type="button" className="btn" disabled={!canNext} onClick={onNext} aria-label={nextAria}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
