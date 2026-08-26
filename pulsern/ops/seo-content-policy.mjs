/* Versioned search, sourcing, and review policy for every public guide. This
   file describes what must be proven; it does not certify clinical accuracy. */

export const POLICY_VERSION = 1;
export const EVIDENCE_ACCESSED_AT = "2026-08-26";

export const SOURCES = {
  testPlan: { id: "ncsbn-2026-rn-test-plan", title: "NCSBN — 2026 RN Test Plan", publisher: "National Council of State Boards of Nursing", url: "https://www.nclex.com/test-plans.page", sourceUpdated: "2026-04-01", accessedAt: EVIDENCE_ACCESSED_AT, locator: "2026 RN Test Plan; effective April 1, 2026–March 31, 2029" },
  ngn: { id: "ncsbn-next-generation-nclex", title: "NCSBN — Next Generation NCLEX", publisher: "National Council of State Boards of Nursing", url: "https://www.nclex.com/next-generation-nclex.page", sourceUpdated: "2023-04-01", accessedAt: EVIDENCE_ACCESSED_AT, locator: "NGN Project and Clinical Judgment Measurement Model sections" },
  candidate: { id: "ncsbn-2026-candidate-bulletin", title: "NCSBN — 2026 Candidate Bulletin", publisher: "National Council of State Boards of Nursing", url: "https://www.nclex.com/prepare.page", sourceUpdated: null, accessedAt: EVIDENCE_ACCESSED_AT, locator: "2026 Candidate Bulletin section" },
  cdcIsolation: { id: "cdc-isolation-precautions", title: "CDC — Isolation Precautions Guideline", publisher: "Centers for Disease Control and Prevention", url: "https://www.cdc.gov/infection-control/hcp/isolation-precautions/index.html", sourceUpdated: "2023-11-27", accessedAt: EVIDENCE_ACCESSED_AT, locator: "Guideline and updates sections" },
  ismp: { id: "ismp-high-alert-acute-care-2024", title: "ISMP — High-Alert Medications in Acute Care Settings", publisher: "Institute for Safe Medication Practices", url: "https://home.ecri.org/blogs/ismp-resources/high-alert-medications-in-acute-care-settings", sourceUpdated: "2024-01-10", accessedAt: EVIDENCE_ACCESSED_AT, locator: "2024 high-alert list and safeguards" },
  bloodGas: { id: "medlineplus-abg", title: "MedlinePlus — Arterial Blood Gas (ABG) Test", publisher: "U.S. National Library of Medicine", url: "https://medlineplus.gov/lab-tests/arterial-blood-gas-abg-test/", sourceUpdated: null, accessedAt: EVIDENCE_ACCESSED_AT, locator: "Measurements, uses, and results sections" },
  electrolytes: { id: "medlineplus-electrolyte-panel", title: "MedlinePlus — Electrolyte Panel", publisher: "U.S. National Library of Medicine", url: "https://medlineplus.gov/lab-tests/electrolyte-panel/", sourceUpdated: null, accessedAt: EVIDENCE_ACCESSED_AT, locator: "Electrolytes, uses, symptoms, and results sections" },
  labTests: { id: "medlineplus-medical-tests", title: "MedlinePlus — Medical Tests", publisher: "U.S. National Library of Medicine", url: "https://medlineplus.gov/lab-tests/", sourceUpdated: null, accessedAt: EVIDENCE_ACCESSED_AT, locator: "Medical test index; claim-specific locators still require RN sign-off" },
  insulin: { id: "fda-insulin", title: "FDA — Insulin", publisher: "U.S. Food and Drug Administration", url: "https://www.fda.gov/consumers/free-publications-women/insulin", sourceUpdated: null, accessedAt: EVIDENCE_ACCESSED_AT, locator: "Types of Insulin section" },
  learning: { id: "khalafi-2024-spaced-learning-nursing", title: "Khalafi et al. — Effect of spaced learning on nurse anesthesia students", publisher: "BMC Medical Education", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10958887/", sourceUpdated: "2024-03-21", accessedAt: EVIDENCE_ACCESSED_AT, locator: "Randomized-controlled methods, results, and conclusion" },
};

export function sourcesFor(article) {
  if (article.slug === "nclex-test-day-what-to-expect") return [SOURCES.candidate, SOURCES.testPlan];
  if (article.topic === "How the exam works" || article.topic === "Question types") return [SOURCES.testPlan, SOURCES.ngn];
  if (article.slug === "infection-control-precautions") return [SOURCES.cdcIsolation, SOURCES.testPlan];
  if (article.slug === "high-alert-medications") return [SOURCES.ismp, SOURCES.testPlan];
  if (article.slug === "abg-interpretation") return [SOURCES.bloodGas, SOURCES.testPlan];
  if (article.slug === "electrolyte-imbalances") return [SOURCES.electrolytes, SOURCES.testPlan];
  if (article.slug === "insulin-types-and-timing") return [SOURCES.insulin, SOURCES.testPlan];
  if (article.slug === "lab-values-to-memorize") return [SOURCES.labTests, SOURCES.testPlan];
  if (article.topic === "Study strategy") return [SOURCES.learning, SOURCES.testPlan];
  return [SOURCES.testPlan];
}

export const SEARCH_INTENTS = {
  "how-is-the-nclex-scored": { primary: "how is the NCLEX scored", secondary: ["NCLEX CAT scoring", "NCLEX passing standard"], audience: "NCLEX-RN candidates", risk: "exam" },
  "how-many-questions-is-the-nclex": { primary: "how many questions are on the NCLEX", secondary: ["NCLEX minimum questions", "NCLEX maximum questions"], audience: "NCLEX-RN candidates", risk: "exam" },
  "next-generation-nclex-what-changed": { primary: "what changed on the Next Generation NCLEX", secondary: ["NGN changes", "NCLEX clinical judgment model"], audience: "NCLEX-RN candidates", risk: "exam" },
  "nclex-test-day-what-to-expect": { primary: "what to expect on NCLEX test day", secondary: ["NCLEX test day rules", "NCLEX exam day process"], audience: "NCLEX-RN candidates", risk: "exam" },
  "bow-tie-questions": { primary: "how to answer NCLEX bow-tie questions", secondary: ["NGN bow-tie strategy"], audience: "NCLEX-RN candidates", risk: "exam" },
  "matrix-grid-questions": { primary: "how to answer NCLEX matrix grid questions", secondary: ["NGN matrix question strategy"], audience: "NCLEX-RN candidates", risk: "exam" },
  "cloze-drop-down-questions": { primary: "how to answer NCLEX cloze drop-down questions", secondary: ["NGN cloze question strategy"], audience: "NCLEX-RN candidates", risk: "exam" },
  "highlight-questions": { primary: "how to answer NCLEX highlight questions", secondary: ["NGN highlight question strategy"], audience: "NCLEX-RN candidates", risk: "exam" },
  "select-all-that-apply-strategy": { primary: "NCLEX select all that apply strategy", secondary: ["SATA NCLEX strategy"], audience: "NCLEX-RN candidates", risk: "exam" },
  "drag-and-drop-ordering-questions": { primary: "how to answer NCLEX drag and drop ordering questions", secondary: ["NGN ordering question strategy"], audience: "NCLEX-RN candidates", risk: "exam" },
  "lab-values-to-memorize": { primary: "lab values to memorize for the NCLEX", secondary: ["NCLEX normal lab values"], audience: "NCLEX-RN candidates", risk: "clinical" },
  "abg-interpretation": { primary: "ABG interpretation for the NCLEX", secondary: ["NCLEX ABG practice", "acid base interpretation"], audience: "NCLEX-RN candidates", risk: "clinical" },
  "electrolyte-imbalances": { primary: "electrolyte imbalances for the NCLEX", secondary: ["NCLEX electrolyte signs"], audience: "NCLEX-RN candidates", risk: "clinical" },
  "infection-control-precautions": { primary: "infection control precautions for the NCLEX", secondary: ["NCLEX isolation precautions"], audience: "NCLEX-RN candidates", risk: "clinical" },
  "insulin-types-and-timing": { primary: "insulin types onset and peak for the NCLEX", secondary: ["NCLEX insulin timing"], audience: "NCLEX-RN candidates", risk: "clinical" },
  "high-alert-medications": { primary: "high alert medications and antidotes for the NCLEX", secondary: ["NCLEX medication antidotes"], audience: "NCLEX-RN candidates", risk: "clinical" },
  "prioritization-abc-maslow": { primary: "NCLEX prioritization ABC and Maslow", secondary: ["what patient comes first NCLEX"], audience: "NCLEX-RN candidates", risk: "clinical" },
  "delegation-and-assignment": { primary: "NCLEX delegation and assignment rules", secondary: ["RN LPN UAP delegation NCLEX"], audience: "NCLEX-RN candidates", risk: "clinical" },
  "therapeutic-communication": { primary: "therapeutic communication NCLEX questions", secondary: ["NCLEX best response strategy"], audience: "NCLEX-RN candidates", risk: "clinical" },
  "dosage-calculation-formulas": { primary: "dosage calculation formulas for the NCLEX", secondary: ["NCLEX medication math"], audience: "NCLEX-RN candidates", risk: "clinical" },
  "nclex-study-plan": { primary: "NCLEX study plan", secondary: ["daily NCLEX study schedule"], audience: "NCLEX-RN candidates", risk: "education" },
  "spaced-repetition-for-nursing-students": { primary: "spaced repetition for nursing students", secondary: ["NCLEX spaced repetition"], audience: "nursing students", risk: "education" },
  "failed-the-nclex-what-now": { primary: "failed the NCLEX what to do next", secondary: ["NCLEX retake study plan"], audience: "NCLEX-RN retake candidates", risk: "education" },
};

export function intentFor(article) { return SEARCH_INTENTS[article.slug]; }
