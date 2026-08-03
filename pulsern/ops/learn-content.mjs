/* The guide library, assembled from topic modules.

   Order here is the order they appear on /learn/. Exam mechanics come first:
   those are the highest-intent searches and the strongest entry points for a
   student who has not yet chosen a study product. */

import { EXAM_ARTICLES } from "./learn-exam.mjs";
import { TYPE_ARTICLES } from "./learn-types.mjs";
import { CLINICAL_ARTICLES } from "./learn-clinical.mjs";
import { SKILL_ARTICLES } from "./learn-skills.mjs";

export const ARTICLES = [
  ...EXAM_ARTICLES,
  ...TYPE_ARTICLES,
  ...CLINICAL_ARTICLES,
  ...SKILL_ARTICLES,
];
