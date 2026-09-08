/* PulseRN library size — the single source of truth for how much study
   content a plan includes.
   ------------------------------------------------------------------
   These figures were previously retyped in five places: the plan blurbs, the
   pricing page's JSON-LD offers, three comparison tables, the comparison
   claims, and the SEO guardian's expected markers. They drifted. The bank
   reached 10,034 approved questions while every public page still advertised
   3,401+, which put us level with UWorld's 3,400+ on the one dimension where
   we are now roughly three times larger.

   Anything public that states a library size imports it from here. Verified
   against the database on the date below.

   Counting rules, so a re-count matches:
     questions — approved AND exam_form IS NULL. Readiness-exam items live in
                 the same table but are quarantined to a form and must never
                 be counted as practice questions.
     cases     — approved case_studies.
     cards     — approved flashcards.

   Advertise at or below the true count, never above. The published figures
   below are what the site says; the exact ones are what the database held
   when they were verified. */

export const LIBRARY_VERIFIED_AT = "2026-09-08";

export const LIBRARY = {
  /* Exact and stable enough to state precisely — the headline number. */
  questions: { exact: 10034, published: "10,034" },

  /* Stated below the true count so routine additions never make the site
     wrong, and a reader who counts is never short-changed. */
  cases: { exact: 506, published: "500+" },
  cards: { exact: 1145, published: "1,100+" },
};

/* One phrase, used wherever the whole library is described at once. Every
   plan carries all of it — there is no tiering by content volume. */
export const LIBRARY_SUMMARY =
  `${LIBRARY.questions.published} practice questions · ${LIBRARY.cases.published} case studies · ${LIBRARY.cards.published} study cards`;
