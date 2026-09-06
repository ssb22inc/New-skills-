/* The guide library, assembled from topic modules.

   Order here is the order they appear on /learn/. Current-plan authority hubs
   and exam mechanics come first: those are the highest-intent searches and
   the strongest entry points for a student choosing a study product. */

import { HUB_ARTICLES } from "./learn-hubs.mjs";
import { EXAM_ARTICLES } from "./learn-exam.mjs";
import { LOGISTICS_ARTICLES } from "./learn-logistics.mjs";
import { TYPE_ARTICLES } from "./learn-types.mjs";
import { CLINICAL_ARTICLES } from "./learn-clinical.mjs";
import { SKILL_ARTICLES } from "./learn-skills.mjs";
import { SAMPLE_ARTICLES } from "./learn-samples.mjs";

export const ARTICLES = [
  ...HUB_ARTICLES,
  ...EXAM_ARTICLES,
  ...LOGISTICS_ARTICLES,
  ...TYPE_ARTICLES,
  ...CLINICAL_ARTICLES,
  ...SKILL_ARTICLES,
  ...SAMPLE_ARTICLES,
];
