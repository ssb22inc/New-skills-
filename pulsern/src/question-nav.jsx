/* Back, Next, and Skip. Large targets for a phone held in one hand.
   The count is the way back to anything skipped this sitting. */

export function QuestionNav({
  canBack,
  skipped,
  onBack,
  onSkip,
  onNext,
  onReview,
  nextLabel = "Next",
  nextAria = "Next question",
  skipAria = "Skip this question without scoring it",
}) {
  const skippedLabel = skipped === 1 ? "1 skipped" : `${skipped} skipped`;
  return (
    <div className="q-nav-wrap">
      <div className="q-skipped">
        <p className="small mono q-skipped-count">{skippedLabel}</p>
        <button
          type="button"
          className="btn ghost"
          disabled={skipped < 1}
          onClick={onReview}
          aria-label={skipped < 1 ? "No skipped questions" : `Review ${skippedLabel}`}
        >
          Review skipped
        </button>
      </div>
      <div className="q-nav" role="group" aria-label="Question navigation">
        <button type="button" className="btn ghost" disabled={!canBack} onClick={onBack} aria-label="Back to the previous question">
          Back
        </button>
        <button type="button" className="btn ghost" onClick={onSkip} aria-label={skipAria}>
          Skip
        </button>
        <button type="button" className="btn" onClick={onNext} aria-label={nextAria}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
