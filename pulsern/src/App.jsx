import { useState, useMemo, useEffect, useRef, useCallback } from "react";

/* ================= DATA ================= */

/* The eight client-needs categories of the official NCSBN NCLEX-RN test
   plan ("Pharmacology" = Pharmacological & Parenteral Therapies). */
export const CATS = [
  "Management of Care",
  "Safety & Infection Control",
  "Health Promotion & Maintenance",
  "Psychosocial Integrity",
  "Basic Care & Comfort",
  "Pharmacology",
  "Reduction of Risk",
  "Physiological Adaptation",
];

export const QUESTIONS = [
  {
    id: 1, cat: "Pharmacology", diff: 1, type: "mc",
    stem: "The nurse is preparing to administer digoxin to an adult client with heart failure. Which assessment is the priority before giving the dose?",
    options: ["Measure the apical pulse for one full minute", "Check the most recent potassium level", "Ask the client about nausea", "Review the morning weight"],
    answer: 0,
    rationale: "Digoxin slows conduction through the AV node, so the apical pulse must be counted for a full minute before every dose; hold the dose and notify the provider if the rate is below 60/min in an adult. Potassium, GI symptoms, and daily weights are all important digoxin-related assessments, but the apical rate directly determines whether this dose can be safely given right now.",
  },
  {
    id: 2, cat: "Pharmacology", diff: 2, type: "mc",
    stem: "A client taking digoxin has a serum level of 2.4 ng/mL. Which finding is most consistent with this result?",
    options: ["Dry, hacking cough", "Nausea and yellow-green halos around lights", "Fine hand tremors and diarrhea", "Ringing in the ears"],
    answer: 1,
    rationale: "The therapeutic digoxin range is 0.5–2.0 ng/mL, so 2.4 is toxic. Early toxicity classically shows GI symptoms (anorexia, nausea, vomiting) and visual changes such as yellow-green halos. A dry cough suggests an ACE inhibitor effect, tremor and diarrhea point toward lithium or hyperthyroid pictures, and tinnitus is associated with aspirin toxicity.",
  },
  {
    id: 3, cat: "Pharmacology", diff: 2, type: "mc",
    stem: "A client on warfarin has an INR of 4.8 and no active bleeding. Which prescription should the nurse anticipate?",
    options: ["Protamine sulfate IV", "An increased warfarin dose", "Hold the next warfarin dose and recheck the INR", "A unit of packed red blood cells"],
    answer: 2,
    rationale: "The usual therapeutic INR on warfarin is 2–3. An INR of 4.8 without bleeding is managed by holding warfarin and rechecking the INR; routine vitamin K is not indicated at this level. Protamine sulfate reverses heparin, not warfarin. Increasing the dose would worsen bleeding risk, and packed red blood cells are not indicated without hemorrhage or anemia.",
  },
  {
    id: 4, cat: "Pharmacology", diff: 1, type: "mc",
    stem: "A postoperative client who received IV morphine has a respiratory rate of 6/min and is difficult to arouse. Which medication should the nurse prepare?",
    options: ["Flumazenil", "Naloxone", "Acetylcysteine", "Atropine"],
    answer: 1,
    rationale: "Naloxone is the opioid antagonist and reverses opioid-induced respiratory depression. Flumazenil reverses benzodiazepines, acetylcysteine treats acetaminophen overdose, and atropine treats symptomatic bradycardia — none address opioid toxicity.",
  },
  {
    id: 5, cat: "Pharmacology", diff: 2, type: "mc",
    stem: "A client taking metformin is scheduled for a CT scan with IV contrast. Which action by the nurse is correct?",
    options: ["Give the metformin with a full glass of water before the scan", "Confirm the metformin has been held as prescribed around the contrast study", "Double the metformin dose after the scan", "Administer the metformin only if blood glucose is above 200 mg/dL"],
    answer: 1,
    rationale: "Iodinated contrast can impair renal function; if metformin accumulates, the client is at risk for lactic acidosis. Metformin is typically held at the time of contrast administration and restarted about 48 hours later once renal function is confirmed. The other options either continue or increase exposure and are unsafe.",
  },
  {
    id: 6, cat: "Management of Care", diff: 2, type: "mc",
    stem: "After receiving report, which client should the nurse assess first?",
    options: [
      "A client 1 day post-op reporting incisional pain rated 8/10",
      "A client with new restlessness and an oxygen saturation of 88% on room air",
      "A client awaiting discharge teaching about a new inhaler",
      "A client with a preprandial blood glucose of 180 mg/dL",
    ],
    answer: 1,
    rationale: "Restlessness is an early sign of hypoxia, and a saturation of 88% signals a breathing problem — airway and breathing come before pain, teaching, or a modestly elevated glucose. Pain 8/10 is urgent but not immediately life-threatening; teaching and a glucose of 180 are stable needs.",

  },
  {
    id: 7, cat: "Management of Care", diff: 3, type: "mc",
    stem: "The charge nurse is making assignments. Which task is appropriate to delegate to assistive personnel (AP)?",
    options: [
      "Obtaining vital signs on a stable client 2 days after surgery",
      "Performing the initial assessment on a new admission",
      "Teaching a client how to use an incentive spirometer",
      "Evaluating a client's response to a new antihypertensive",
    ],
    answer: 0,
    rationale: "APs may perform routine, standardized tasks on stable, predictable clients — such as vital signs, ADLs, and I&O. Assessment, teaching, and evaluation are steps of the nursing process that cannot be delegated to unlicensed personnel.",
  },
  {
    id: 8, cat: "Safety & Infection Control", diff: 2, type: "sata",
    stem: "The nurse is admitting a client with active pulmonary tuberculosis. Which interventions should the nurse include? Select all that apply.",
    options: [
      "Place the client in a private, negative-pressure room",
      "Wear a fitted N95 respirator when entering the room",
      "Keep the room door closed",
      "Have the client wear a surgical mask during transport",
      "Wear a gown for all routine care regardless of contact",
    ],
    answer: [0, 1, 2, 3],
    rationale: "Active TB requires airborne precautions: a negative-pressure isolation room with the door closed, an N95 (or higher) respirator for staff, and a surgical mask on the client whenever they leave the room. A gown is worn per standard precautions only when soiling or contact with body fluids is anticipated — it is not automatic for airborne precautions.",
  },
  {
    id: 9, cat: "Safety & Infection Control", diff: 1, type: "order",
    stem: "The nurse discovers a small fire in a client's room. Place the actions in the correct order (RACE).",
    options: ["Rescue the client from immediate danger", "Activate the fire alarm", "Confine the fire by closing doors", "Extinguish the fire if safe to do so"],
    answer: [0, 1, 2, 3],
    rationale: "RACE: Rescue anyone in immediate danger first, then Activate the alarm to summon help, Confine the fire by closing doors and windows, and finally Extinguish only if it is small and safe to attempt.",
  },
  {
    id: 10, cat: "Safety & Infection Control", diff: 2, type: "order",
    stem: "Place the steps for donning personal protective equipment in the correct order.",
    options: ["Perform hand hygiene", "Put on the gown", "Put on the mask or respirator", "Put on goggles or face shield", "Put on gloves"],
    answer: [0, 1, 2, 3, 4],
    rationale: "Donning sequence: hand hygiene → gown → mask/respirator → eye protection → gloves last so the cuffs can cover the gown sleeves. (Doffing is nearly reversed: gloves first because they are the most contaminated.)",
  },
  {
    id: 11, cat: "Reduction of Risk", diff: 2, type: "mc",
    stem: "The nurse notes continuous bubbling in the water-seal chamber of a client's chest tube drainage system. What does this finding indicate?",
    options: ["Normal, expected function", "An air leak in the system", "The suction is set too low", "The lung has fully re-expanded"],
    answer: 1,
    rationale: "Intermittent bubbling with respiration in the water-seal chamber is expected; continuous bubbling means air is entering the system — an air leak. The nurse should check all connections from the dressing to the drainage unit. Gentle continuous bubbling is normal only in the suction-control chamber.",
  },
  {
    id: 12, cat: "Physiological Adaptation", diff: 3, type: "mc",
    stem: "A client's potassium is 6.8 mEq/L and the ECG shows tall, peaked T waves. Which prescribed intervention should the nurse implement first?",
    options: ["Administer IV calcium gluconate", "Give oral sodium polystyrene sulfonate", "Restrict dietary potassium", "Obtain a repeat potassium level"],
    answer: 0,
    rationale: "With ECG changes from severe hyperkalemia, the priority is protecting the myocardium: IV calcium gluconate stabilizes the cardiac membrane within minutes. Exchange resins and dietary restriction lower potassium too slowly to prevent a lethal dysrhythmia, and re-checking the level delays treatment of an emergency already confirmed on ECG.",
  },
  {
    id: 13, cat: "Physiological Adaptation", diff: 2, type: "mc",
    stem: "The nurse is monitoring a client with a head injury. Which finding is the earliest indicator of increased intracranial pressure?",
    options: ["Widened pulse pressure", "A change in level of consciousness", "Fixed, dilated pupils", "Irregular respirations"],
    answer: 1,
    rationale: "The level of consciousness is the most sensitive and earliest indicator of rising ICP — subtle restlessness, confusion, or increased drowsiness appears first. Widened pulse pressure and irregular respirations (Cushing triad) and fixed pupils are late, ominous signs.",

  },
  {
    id: 14, cat: "Physiological Adaptation", diff: 2, type: "mc",
    stem: "A laboring client receiving an oxytocin infusion has late decelerations on the fetal monitor. Which action should the nurse take first?",
    options: ["Turn the client onto her side", "Increase the oxytocin rate", "Document the pattern and continue monitoring", "Prepare for immediate cesarean birth"],
    answer: 0,
    rationale: "Late decelerations reflect uteroplacental insufficiency. The first intrauterine resuscitation step is repositioning to the side to improve placental perfusion, followed by stopping the oxytocin, giving oxygen, an IV bolus, and notifying the provider. Increasing oxytocin worsens the problem; documentation alone ignores fetal compromise.",
  },
  {
    id: 15, cat: "Physiological Adaptation", diff: 1, type: "sata",
    stem: "A client with type 1 diabetes received insulin and then skipped lunch. Which manifestations of hypoglycemia should the nurse anticipate? Select all that apply.",
    options: ["Diaphoresis", "Tremors", "Tachycardia", "Fruity breath odor", "Confusion"],
    answer: [0, 1, 2, 4],
    rationale: "Hypoglycemia triggers a sympathetic response — sweating, tremors, tachycardia, hunger — and neuroglycopenia causes confusion. A fruity breath odor indicates ketosis from hyperglycemia (DKA), not low blood glucose.",
  },
  {
    id: 16, cat: "Reduction of Risk", diff: 2, type: "mc",
    stem: "Fifteen minutes into a transfusion of packed red blood cells, the client develops chills, flank pain, and a temperature increase of 1.2°C. What should the nurse do first?",
    options: ["Slow the transfusion rate", "Stop the transfusion", "Administer prescribed acetaminophen", "Notify the health care provider"],
    answer: 1,
    rationale: "These findings suggest an acute hemolytic or febrile reaction. The very first action is always to stop the transfusion to limit exposure, then keep the IV open with normal saline using new tubing, monitor the client, and notify the provider and blood bank. Slowing the rate continues the exposure.",
  },
  {
    id: 17, cat: "Reduction of Risk", diff: 2, type: "order",
    stem: "The nurse is mixing regular and NPH insulin in one syringe. Place the steps in the correct order.",
    options: ["Inject air into the NPH (cloudy) vial", "Inject air into the regular (clear) vial", "Withdraw the regular insulin", "Withdraw the NPH insulin"],
    answer: [0, 1, 2, 3],
    rationale: "Air is injected into the NPH vial first (without touching the solution), then into the regular vial. Regular insulin is drawn up first — clear before cloudy — so the rapid-acting vial is never contaminated with intermediate-acting insulin.",
  },
  {
    id: 18, cat: "Safety & Infection Control", diff: 3, type: "sata",
    stem: "The nurse is caring for a client with neutropenia following chemotherapy. Which precautions should be implemented? Select all that apply.",
    options: [
      "Assign the client to a private room",
      "Remove fresh flowers and standing water from the room",
      "Serve only thoroughly cooked foods, avoiding raw fruits and vegetables",
      "Screen visitors and staff for signs of infection",
      "Initiate airborne precautions with a negative-pressure room",
    ],
    answer: [0, 1, 2, 3],
    rationale: "Neutropenic (protective) precautions shield the immunocompromised client from organisms: private room, strict hand hygiene, no fresh flowers or standing water, a low-microbial diet, and screening anyone entering for illness. Airborne precautions and negative pressure protect others from the client and are not indicated here — if anything, protective environments use positive pressure.",
  },
  {
    id: 19, cat: "Psychosocial Integrity", diff: 1, type: "mc",
    stem: "A client scheduled for surgery tomorrow says, \"I'm so scared something will go wrong.\" Which response by the nurse is most therapeutic?",
    options: [
      "\"Don't worry — your surgeon has done this hundreds of times.\"",
      "\"Tell me more about what's worrying you.\"",
      "\"Everything will be fine. Try to get some rest.\"",
      "\"Would you like me to call your family?\"",
    ],
    answer: 1,
    rationale: "An open-ended invitation to explore feelings is therapeutic — it keeps the focus on the client and encourages expression. False reassurance (\"don't worry,\" \"everything will be fine\") dismisses the client's fear, and offering to call family changes the subject before the concern is explored.",
  },
  {
    id: 20, cat: "Health Promotion & Maintenance", diff: 3, type: "mc",
    stem: "During a wellness visit, a 45-year-old client at average risk asks about colorectal cancer screening. Which response is accurate?",
    options: [
      "\"Screening is recommended to begin now, at age 45.\"",
      "\"Screening starts at age 60 unless you have symptoms.\"",

      "\"You only need screening if you have a family history.\"",
      "\"A yearly abdominal x-ray is the recommended screening test.\"",
    ],
    answer: 0,
    rationale: "Current guidelines recommend that average-risk adults begin colorectal cancer screening at age 45, using options such as colonoscopy or stool-based tests. Waiting for symptoms or restricting screening to those with family history misses most cases, and abdominal x-rays are not a screening tool.",
  },
  {
    id: 21, cat: "Physiological Adaptation", diff: 3, type: "mc",
    stem: "A client with COPD has these arterial blood gas results: pH 7.30, PaCO₂ 55 mm Hg, HCO₃⁻ 26 mEq/L. How should the nurse interpret them?",
    options: ["Metabolic acidosis, compensated", "Respiratory acidosis, uncompensated", "Respiratory alkalosis, uncompensated", "Metabolic alkalosis, partially compensated"],
    answer: 1,
    rationale: "The pH is acidotic (below 7.35) and the CO₂ is elevated (above 45), so the respiratory system is the culprit — respiratory acidosis. The bicarbonate is still within the normal 22–26 range, meaning the kidneys have not yet compensated, so it is uncompensated.",
  },
];

/* Case-study library lives in src/case-studies.js (three NCJMM cases). */

const CARDS = [
  { f: "Normal serum potassium", b: "3.5 – 5.0 mEq/L" },
  { f: "Normal serum sodium", b: "135 – 145 mEq/L" },
  { f: "Therapeutic digoxin level", b: "0.5 – 2.0 ng/mL · hold dose if apical pulse < 60/min (adult)" },
  { f: "Therapeutic INR on warfarin", b: "2.0 – 3.0" },
  { f: "Antidote: heparin", b: "Protamine sulfate" },

  { f: "Antidote: warfarin", b: "Vitamin K (phytonadione)" },
  { f: "Antidote: acetaminophen", b: "Acetylcysteine" },
  { f: "Antidote: opioids", b: "Naloxone" },
  { f: "Antidote: magnesium sulfate toxicity", b: "Calcium gluconate" },
  { f: "Normal ABG values", b: "pH 7.35–7.45 · PaCO₂ 35–45 · HCO₃⁻ 22–26" },
  { f: "Earliest sign of increased ICP", b: "Change in level of consciousness" },
  { f: "Airborne precautions diseases", b: "TB, measles, varicella — N95 + negative-pressure room" },
];

/* Built-ins carry stable ids (b0..b11) so per-card SRS survives the bank
   growing — plus category/topic tags for the Cards focus filter. */
const BUILTIN_CARD_META = [
  ["Reduction of Risk", "Electrolytes"], ["Reduction of Risk", "Electrolytes"],
  ["Pharmacology", "Therapeutic drug levels"], ["Pharmacology", "Anticoagulation"],
  ["Pharmacology", "Antidotes"], ["Pharmacology", "Antidotes"], ["Pharmacology", "Antidotes"],
  ["Pharmacology", "Antidotes"], ["Pharmacology", "Antidotes"],
  ["Reduction of Risk", "ABG"], ["Physiological Adaptation", "Neuro assessment"],
  ["Safety & Infection Control", "Transmission precautions"],
];
const BUILTIN_CARDS = CARDS.map((c, i) => ({
  id: `b${i}`, cat: BUILTIN_CARD_META[i][0], topic: BUILTIN_CARD_META[i][1], front: c.f, back: c.b,
}));

const LEVELS = [
  [0, "Student Nurse"], [80, "New Grad"], [200, "Staff Nurse"], [380, "Preceptor"], [600, "Charge Nurse"], [900, "Nurse Educator"],
];

/* ================= HELPERS ================= */

function levelFor(xp) {
  let cur = LEVELS[0], next = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i][0]) cur = LEVELS[i];
    else { next = LEVELS[i]; break; }
  }
  return { name: cur[1], next };
}

/* ================= APP ================= */

/* ---- date helpers for real multi-day spacing ----
   Extracted to src/dates.js so tests can exercise them (PULSERN_BUILD.md §10.4). */
import { fmtLocal, todayStr, addDays, weekStart } from "./dates.js";
import { supabase } from "./supabase.js";
import { emptyAbility, updateAbility, itemRating, readinessFrom, pickTargetRating } from "./ability-engine.js";
import { migrateBlob } from "./state.js";
import { ngnExt, fourFn, validQ, scoreItem, scoreCaseStep, isFullCredit, sumScores } from "./ngn.js";
import { NGN_SAMPLES, CALC_SAMPLES, COVERAGE_SAMPLES } from "./ngn-samples.js";

const BUNDLED_QUESTIONS = [...QUESTIONS, ...NGN_SAMPLES, ...CALC_SAMPLES, ...COVERAGE_SAMPLES];
import { CASE_STUDIES } from "./case-studies.js";
import { dueQueue, nextSchedule, migrateLegacySrs, NEW_PER_DAY, newCardAllowance, noteNewCard, refundNewCard } from "./srs.js";
import {
  startSession as startCardSession, currentCard, atFrontier, canGoBack as canGoBackCard,
  canGoForward as canGoForwardCard, canSkip as canSkipCard, cardsLeft, skippedCount as skippedCardCount,
  sessionOutcome, saveCardView, goBack as goBackCard, goForward as goForwardCard, skipCurrent as skipCard,
  gradeCurrent as gradeCard, jumpToSkipped as jumpToSkippedCard, cardNavAction,
  sessionProgress as cardProgress, canUndoGrade, undoGrade,
} from "./card-nav.js";
import { pickCategory, seededRandom, seedFrom, STARVE_WINDOW } from "./weak-spots.js";
import { updateMissSchedule, reviewPools, sessionPool, expandTrialQuestions, unseenQuestions, questionByIdentity, answerIdentity, legacyCandidates, refreshedUnresolved } from "./question-review.js";
import {
  emptyNav, appendQuestion, saveDraft, markAnswered, canGoBack, goBack, present,
  forward, fallbackSkip, jumpToSkipped, skippedCount, currentEntry, nextUnvisited,
  heldIds, checkpointAfter,
} from "./question-nav.js";
import { QuestionNav, OPEN_LABS_EVENT } from "./question-nav.jsx";
import { LabFab, resetLabFab, useLabSettleKey } from "./lab-fab.jsx";
import { onRadioKeyDown, radioTabIndex } from "./radio-group.js";
import { cycleTab, tabbables } from "./focus-trap.js";
import { LabPanel } from "./lab-panel.jsx";
import { FocusBar } from "./focus-sheet.jsx";
import { TabIcon } from "./tab-icons.jsx";
import { useStudyKeys, shortcutHint, digitPickEnabled, studySurfaceBlocked, CARD_SHORTCUT_HINT } from "./study-keys.js";
import { choiceState, choiceClasses, CHOICE_BADGE } from "./choice-state.js";
import Calculator from "./calculator.jsx";
import ExamCenter from "./exam.jsx";
import { useExamHomeExit } from "./exam-leave.js";
import { Paywall, PlanCard, fetchEntitlement, grantFreePass } from "./billing.jsx";
import InstallCard from "./install.jsx";
import { ExhibitVisual } from "./exhibits.jsx";
import { ConceptExplainers } from "./concept-explainers.jsx";
import { useReadAloud, ReadAloudBar, ra } from "./read-aloud.jsx";
import { ExhibitTabs } from "./exhibit-tabs.jsx";
import { questionSegments, questionFeedbackSegments, caseFeedbackSegments, caseIntroSegments, caseStepSegments, cardSegments } from "./read-aloud-script.js";
import { ProfileCard, useProfile } from "./profile.jsx";
import {
  isStudyLocked,
  shouldAutoOpenTour,
  needsFirstAnswer,
  shouldApplyQuizKick,
  tourSkipStartsQuestion,
  showProfilePrompt,
  trialBannerMessage,
} from "./first-answer.js";
import { hasDraftAnswer, planLeaveRequest } from "./home-nav.js";
import { useSessionReport } from "./session-report.js";
import { tourMark, tourStepAt, tourStepsFor } from "./tour.js";
import { LeaveDialog, Tour, useTourDismissScroll, useTourPlacement } from "./tour.jsx";
import {
  emptyRewards, answerXp, answerCountsForRun, sameAnswer, xpNote, comboFor, cardXp, questionsOn, todayQuestionCount, shiftCompleteNote, caseStepIds, bumpDay, reverseCardDay, recordCardGrade, undoCardGrade, advanceStreak, streakDayCounted, shiftStatus, weekRounds, maybeGrantCover,
  careerStatus, badgeBoard, detectMoments, markMomentsSeen, sessionRecap, MAX_COVERS,
} from "./rewards.js";
import { motionAllowed, rewardBeat } from "./effects.js";
import {
  RewardsStyle, StreakGlyph, EcgBeat, ComboChip, MomentSheet, streakMoment, ShiftCard, CareerCard,
  BadgeGrid, RoundsCard, BestsCard, SessionRecap, EffectsCard, comboSpeech, useAnnouncer,
} from "./rewards-ui.jsx";
import { mergeGuestIntoBlob, clearGuest, guestClearOnSave, handoffAfterSave, createSaveQueue, persistDecision, readGuestForHandoff, releaseHeldGuest, waitForFlush, accountHasAnswers, reconcileProgress, blobForSave, createProgressEpoch, storageOrNull, noteAccountRead, bindCommittedProgress, foldPendingProgress } from "./guest.js";
import { applyAnswer, commitLiveAnswer, stampedQuestion, newAttemptId } from "./answer-apply.js";
import { claimLegacyAt, claimLegacySchedule } from "./question-key.js";
import { stampCatalogQuestion, stampLoadedCatalog } from "./question-identity.js";
import { signOutAndForgetTrial as signOut } from "./sign-out.js";
import { readProgress, parseProgress, clearLegacyProgressBackup, guestHandoff, sessionReadDecision, sweepPendingProgress } from "./progress-load.js";

const STORE_KEY = "pulsern-v1";

/* Signing out also forgets any try-before-sign-up answers on this device
   (src/sign-out.js). Every sign-out button uses this. */
/* ---- STORAGE ADAPTER ---------------------------------------------------
   The app touches persistence ONLY through `store`. To migrate platforms,
   replace this one object — nothing else in the app changes:

   • Artifact/preview (default below): window.storage
   • Plain web:        localStorage.getItem/setItem/removeItem
   • React Native:     @react-native-async-storage/async-storage
   • Cloud sync:       Supabase/Firebase row keyed by user id
   Each method returns/accepts a JSON string and is async-safe.
------------------------------------------------------------------------ */
const progressGate = createProgressEpoch();
let acceptedBlob = null;
let loadedBaseline = null;
let accountEpoch = 0;
let accountRead = { user: null, blob: null, revision: 0, epoch: 0 };
let legacyHold = false;
const store = {
  async get(key) {
    const seenEpoch = accountEpoch;
    const result = await supabase.auth.getSession();
    if (seenEpoch !== accountEpoch) { const err = new Error("cancelled"); err.code = "cancelled"; throw err; }
    const decision = sessionReadDecision(result);
    if (decision !== "read") {
      const err = new Error(result?.error?.message || "Could not confirm the signed-in account");
      err.code = decision;
      throw err;
    }
    const session = result.data.session;
    const { data, error } = await supabase.from("progress")
      .select("blob, revision").eq("user_id", session.user.id).eq("key", key).maybeSingle();
    if (seenEpoch !== accountEpoch) { const err = new Error("cancelled"); err.code = "cancelled"; throw err; }
    /* A read error must never look like "no saved progress": the caller
       would treat the account as new and autosave defaults over it. */
    if (error) throw new Error(error.message || "Could not read saved progress");
    const epoch = accountEpoch;
    const next = noteAccountRead(accountRead, { user: session.user.id, blob: data?.blob ?? null, revision: data?.revision ?? 0, epoch });
    if (next === accountRead && accountRead.user && accountRead.user !== session.user.id) {
      return data ? JSON.stringify(data.blob) : null;
    }
    accountRead = next;
    acceptedBlob = next.blob;
    loadedBaseline = next.blob ?? {};
    if (!data) { progressGate.note(0, progressGate.epoch()); return null; }
    progressGate.note(next.revision, progressGate.epoch());
    return JSON.stringify(data.blob);
  },
  async set(key, value, expectedUserId, ctx = {}) {
    const signal = ctx?.signal;
    const epoch = progressGate.epoch();
    const current = () => !signal?.aborted && epoch === progressGate.epoch() && (ctx?.isCurrent ? ctx.isCurrent() : true);
    const aborted = () => {
      const err = new Error("aborted");
      err.code = "aborted";
      return err;
    };
    if (epoch !== progressGate.epoch()) throw aborted();
    const { data: { session } } = await supabase.auth.getSession();
    if (epoch !== progressGate.epoch()) throw aborted();
    const decision = persistDecision(session, expectedUserId);
    if (decision !== "write") {
      const err = new Error(decision);
      err.code = decision;
      throw err;
    }
    const raw = JSON.parse(value);
    const blob = blobForSave(acceptedBlob, raw, loadedBaseline);
    const writeAt = (expected, payload) => {
      const patch = { blob: payload, revision: expected + 1, updated_at: new Date().toISOString(), legacy_hold: false };
      return supabase.from("progress").update(patch)
        .eq("user_id", session.user.id).eq("key", key).eq("revision", expected)
        .select("revision");
    };
    const finish = async (request) => {
      if (signal && request && typeof request.abortSignal === "function") request = request.abortSignal(signal);
      const { data, error } = await request ?? {};
      const revision = Array.isArray(data) ? Number(data[0]?.revision) || null : null;
      if (error) throw new Error(error.message || "Could not save progress");
      if (epoch !== progressGate.epoch()) throw aborted();
      return revision;
    };
    const insertAt = (payload) => supabase.from("progress").insert({
      user_id: session.user.id, key, blob: payload, revision: 1, updated_at: new Date().toISOString(), legacy_hold: legacyHold,
    }).select("revision");
    let revision = await finish(writeAt(progressGate.revision(), blob));
    if (revision) legacyHold = false;
    if (!revision && progressGate.revision() === 0 && epoch === progressGate.epoch()) {
      try { revision = await finish(insertAt(blob)); } catch { revision = null; }
    }
    if (!revision && epoch === progressGate.epoch()) {
      const { data: fresh, error: readError } = await supabase.from("progress")
        .select("blob, revision").eq("user_id", session.user.id).eq("key", key).maybeSingle();
      if (readError) throw new Error(readError.message || "Could not read saved progress");
      if (epoch !== progressGate.epoch()) throw aborted();
      if (!fresh) {
        try { revision = await finish(insertAt(blob)); } catch { revision = null; }
      } else {
        const merged = reconcileProgress(fresh.blob, raw, loadedBaseline);
        const unchanged = JSON.stringify(merged) === JSON.stringify(fresh.blob);
        if (unchanged) {
          const bound = bindCommittedProgress(
            { accepted: acceptedBlob, baseline: loadedBaseline, revision: progressGate.revision() },
            { blob: fresh.blob, revision: Number(fresh.revision) || 0, current: current(), epoch, seenEpoch: epoch },
          );
          if (bound !== loadedBaseline && bound.baseline === fresh.blob) {
            acceptedBlob = bound.accepted;
            loadedBaseline = bound.baseline;
            progressGate.note(bound.revision, epoch);
          }
          return JSON.stringify(merged) === JSON.stringify(raw) ? undefined : { reconciled: true, blob: merged };
        }
        revision = await finish(writeAt(Number(fresh.revision) || 0, merged));
        if (revision) legacyHold = false;
        if (revision) {
          const bound = bindCommittedProgress(
            { accepted: acceptedBlob, baseline: loadedBaseline, revision: progressGate.revision() },
            { blob: merged, revision, current: current(), epoch, seenEpoch: epoch },
          );
          if (bound.baseline === merged) {
            acceptedBlob = bound.accepted;
            loadedBaseline = bound.baseline;
            progressGate.note(bound.revision, epoch);
          }
          return { reconciled: true, blob: merged };
        }
      }
    }
    if (!revision) {
      const err = new Error("conflict");
      err.code = "conflict";
      throw err;
    }
    /* A successful write (update or the first insert) is this account's row.
       Drop the module flag so it cannot leak into a later account. */
    legacyHold = false;
    const bound = bindCommittedProgress(
      { accepted: acceptedBlob, baseline: loadedBaseline, revision: progressGate.revision() },
      { blob, revision, current: current(), epoch, seenEpoch: epoch },
    );
    if (bound.baseline === blob) {
      acceptedBlob = bound.accepted;
      loadedBaseline = bound.baseline;
      progressGate.note(bound.revision, epoch);
    }
    return JSON.stringify(blob) === JSON.stringify(raw) ? undefined : { reconciled: true, blob };
  },
  /* An older open app parked a snapshot. Fold it with the same conflict
     merge as two devices, save that result, then drop the parked rows.
     A failed save leaves them in place so the next load can try again. */
  async absorbPending(key) {
    const seenEpoch = accountEpoch;
    const { data: { session } } = await supabase.auth.getSession();
    if (seenEpoch !== accountEpoch || !session?.user?.id) return null;
    if (!acceptedBlob || typeof acceptedBlob !== "object") return null;
    const { data, error } = await supabase.from("progress_pending_merge")
      .select("id, snapshot")
      .eq("user_id", session.user.id)
      .eq("key", key)
      .order("received_at", { ascending: true })
      .order("id", { ascending: true });
    if (seenEpoch !== accountEpoch) return null;
    if (error) throw new Error(error.message || "Could not read saved progress");
    if (!data?.length) return null;
    const merged = foldPendingProgress(acceptedBlob, data.map((row) => row.snapshot));
    const ids = data.map((row) => row.id);
    if (JSON.stringify(merged) !== JSON.stringify(acceptedBlob)) {
      const expected = progressGate.revision();
      const { data: written, error: writeError } = await supabase.from("progress").update({
        blob: merged,
        revision: expected + 1,
        updated_at: new Date().toISOString(),
        legacy_hold: false,
      }).eq("user_id", session.user.id).eq("key", key).eq("revision", expected).select("revision");
      if (seenEpoch !== accountEpoch) return null;
      if (writeError) throw new Error(writeError.message || "Could not save progress");
      const revision = Array.isArray(written) ? Number(written[0]?.revision) || null : null;
      if (!revision) return null;
      acceptedBlob = merged;
      loadedBaseline = merged;
      progressGate.note(revision, progressGate.epoch());
      legacyHold = false;
    }
    const { error: deleteError } = await supabase.from("progress_pending_merge").delete()
      .in("id", ids).eq("user_id", session.user.id).eq("key", key);
    if (deleteError) throw new Error(deleteError.message || "Could not read saved progress");
    return merged;
  },
  releaseAccount() {
    accountEpoch += 1;
    progressGate.abandon();
    acceptedBlob = null;
    loadedBaseline = null;
    accountRead = { user: null, blob: null, revision: 0, epoch: accountEpoch };
    /* A reset may have raised this flag for the account that just left.
       It must not travel with the module into the next account's first insert. */
    legacyHold = false;
  },
  /* A reset keeps the row and advances its revision; it never deletes it.
     A deleted row would be re-created at revision 1, the same number another
     device may still hold, so that device's next save would match and put the
     erased history back (Astra, PR #184 review, finding 1). The stored row
     becomes a tombstone that carries the new reset generation, so every
     older snapshot is also dropped by the merge, and legacy_hold stops an
     older open app from parking its history beside it. */
  async delete(key, nextGeneration = 0) {
    const seenEpoch = accountEpoch;
    const { data: { session } } = await supabase.auth.getSession();
    if (seenEpoch !== accountEpoch) return;
    if (!session) return;
    const { error: pendingError } = await supabase.from("progress_pending_merge").delete().eq("user_id", session.user.id).eq("key", key);
    if (seenEpoch !== accountEpoch) return;
    if (pendingError) throw new Error(pendingError.message || "Could not erase saved progress");
    const tombstone = { resetGeneration: Math.max(1, Number(nextGeneration) || 0) };
    let expected = progressGate.revision();
    let revision = null;
    for (let attempt = 0; attempt < 3 && !revision; attempt++) {
      const { data, error } = await supabase.from("progress")
        .update({ blob: tombstone, revision: expected + 1, updated_at: new Date().toISOString(), legacy_hold: true })
        .eq("user_id", session.user.id).eq("key", key).eq("revision", expected)
        .select("revision");
      if (seenEpoch !== accountEpoch) return;
      if (error) throw new Error(error.message || "Could not erase saved progress");
      revision = Array.isArray(data) ? Number(data[0]?.revision) || null : null;
      if (revision) break;
      /* Another device wrote since this one loaded. The reset is the
         student's decision, so it lands on top of whatever is stored now. */
      const { data: current, error: readError } = await supabase.from("progress")
        .select("revision").eq("user_id", session.user.id).eq("key", key).maybeSingle();
      if (seenEpoch !== accountEpoch) return;
      if (readError) throw new Error(readError.message || "Could not erase saved progress");
      if (!current) break;
      expected = Number(current.revision) || 0;
    }
    const rowExists = revision != null;
    if (!rowExists) {
      const { data: left, error: leftError } = await supabase.from("progress")
        .select("revision").eq("user_id", session.user.id).eq("key", key).maybeSingle();
      if (seenEpoch !== accountEpoch) return;
      if (leftError) throw new Error(leftError.message || "Could not erase saved progress");
      if (left) throw new Error("Could not erase saved progress");
    }
    /* Only a written tombstone needs the hold. A no-row reset must not
       raise it, or the first insert would create the row with legacy_hold=true
       and a later revision-less save would be dropped instead of parked. */
    legacyHold = rowExists;
    accountEpoch += 1;
    progressGate.abandon();
    /* The screen starts fresh and its first save is the whole new blob, so
       nothing is carried as accepted or baseline. But the row's new revision
       is kept, so that save lands on the row this reset advanced. */
    acceptedBlob = null;
    loadedBaseline = null;
    if (rowExists) progressGate.note(revision, progressGate.epoch());
    accountRead = { user: null, blob: null, revision: 0, epoch: accountEpoch };
  },
};

/* ---- MODEL ADAPTER ----------------------------------------------------
   Every AI feature (tutor, question generator) goes through askModel().
   The app builds provider-neutral prompts and stores ALL study context
   locally, so swapping engines (US or Chinese) changes only this table —
   never your data, prompts, or features. In this preview, only the
   built-in Claude endpoint runs without an API key; a production build
   routes the others through a server-side proxy (e.g. LiteLLM/OpenRouter).
------------------------------------------------------------------------ */
const AI_PROVIDERS = [
  { id: "claude", name: "Claude Sonnet (Anthropic, US)", builtin: true, note: "Routed through the PulseRN server. No API key on your device." },
  { id: "gpt", name: "GPT series (OpenAI, US)", builtin: true, note: "Routed through the PulseRN server. No API key on your device." },
  { id: "deepseek", name: "DeepSeek V3/R1 (China)", builtin: true, note: "Lowest cost tier. Routed through the PulseRN server." },
  { id: "qwen", name: "Qwen (Alibaba, China)", builtin: true, note: "Routed through the PulseRN server. No API key on your device." },
  { id: "kimi", name: "Kimi (Moonshot, China)", builtin: true, note: "Routed through the PulseRN server. No API key on your device." },
];

async function currentAccessToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  } catch {
    return "";
  }
}

async function askModel(providerId, prompt, maxTokens = 1000) {
  const p = AI_PROVIDERS.find((x) => x.id === providerId) || AI_PROVIDERS[0];
  const token = await currentAccessToken();
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ provider: p.id, prompt, maxTokens, token }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "UPSTREAM");
  const t = (data.text ?? "").trim();
  if (!t) throw new Error("EMPTY");
  return t;
}

/* validQ (src/ngn.js) validates questions before they enter the bank —
   all six item types, mirroring the factory's validItem. */
const DAILY_GOAL = 8;

/* Progressive disclosure: one-line UI, science on demand (RN pack prompt 4).
   Collapsed by default everywhere; nothing is deleted, only tucked away. */
function Why({ label = "why this works", children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="why">
      <button type="button" className="why-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>ⓘ {label} {open ? "▴" : "▾"}</button>
      {open && <div className="why-body small">{children}</div>}
    </div>
  );
}

/* The legacy fixed-position schedule. It is persisted for the blob contract
   and read by nothing — srsMap replaced it. It starts EMPTY on purpose: it used
   to start as one {interval: 0, due: today} placeholder per built-in card, and
   those placeholders were later migrated into srsMap as genuine due-today
   reviews, pinning the built-in cards to the front of the queue forever. */
const freshCards = () => [];

/* ================= APP ================= */

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState("light");
  const [tab, setTab] = useState("today");
  const [xp, setXp] = useState(0);
  const [run, setRun] = useState(0);        // consecutive correct answers (session)
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; }, [run]);
  const progressRef = useRef(null);
  const [bestRun, setBestRun] = useState(0);
  const [log, setLog] = useState([]);        // {id, cat, diff, correct}
  /* Flagging was removed from the UI in favour of Report a problem. These two
     are still loaded and saved so existing students' flags survive in their
     blob rather than being silently destroyed by the update. Nothing reads
     them any more; nothing should, unless flagging comes back. */
  const [flagged, setFlagged] = useState([]);
  const [flaggedCases, setFlaggedCases] = useState([]);
  const [streak, setStreak] = useState({ count: 0, lastDay: null, shield: true }); // real day streak + one-miss shield
  const [daily, setDaily] = useState({ day: todayStr(), answered: 0 });

  const [srs, setSrs] = useState(freshCards); // legacy fixed-position schedule (kept for the blob contract)
  const [srsMap, setSrsMap] = useState({});   // scalable per-card-id schedule {id: {interval, due}}
  const [fcNew, setFcNew] = useState({ day: null, count: 0 }); // blob (additive): new cards introduced per LOCAL day
  const [missSchedule, setMissSchedule] = useState({}); // blob (additive): spaced-review dates for missed questions {id: {interval, due}}
  const [examResults, setExamResults] = useState({}); // {form: {pct, verdict, ...}}
  const [bankCards, setBankCards] = useState(null); // AI card bank; null → built-ins only
  const [bankCases, setBankCases] = useState(null); // AI case bank; null → built-ins only
  const [customQs, setCustomQs] = useState([]); // AI-generated questions
  const [provider, setProvider] = useState("claude");
  const [ability, setAbility] = useState(() => emptyAbility(CATS)); // Elo θ per category
  const [plan, setPlan] = useState(null);           // weekly planner cache (§5.7)
  const [examDate, setExamDate] = useState(null);   // student's exam date (blob)
  const [calibration, setCalibration] = useState({}); // bank item ratings {id: {rating}}
  const [bankQs, setBankQs] = useState(null);       // shared bank; null → offline fallback
  const [menuOpen, setMenuOpen] = useState(false);  // header menu
  const [tourMode, setTourMode] = useState("quick"); // quick (auto, after the first answer) | full (from the menu)
  const menuBtnRef = useRef(null);
  const [labOpen, setLabOpen] = useState(false);    // lab-values drawer
  const [helpOpen, setHelpOpen] = useState(false);  // help & contact center
  const [tourStep, setTourStep] = useState(null);   // null = closed, otherwise an index into TOUR_STEPS
  const [tourSeen, setTourSeen] = useState(false);  // persisted in blob; blocks auto-open, not the menu
  const [quizKick, setQuizKick] = useState(0);      // bumps Today into the forced first question
  const appliedQuizKick = useRef(0);                // survives Today unmounting during the tour
  const [homeEpoch, setHomeEpoch] = useState(0);    // explicit Home resets Today out of a round
  const [sectionEpoch, setSectionEpoch] = useState(0); // remounts a section so a confirmed leave clears it even when it was already showing
  const [leaveGuard, setLeaveGuard] = useState(null);
  const [ent, setEnt] = useState(null);             // entitlement (server truth, not in blob)
  const [profile, setProfile] = useProfile();       // name/phone/SMS consent (server truth)
  const [examLock, setExamLock] = useState(false);  // exam running → tabs, menu, and references lock
  const sessionRef = useRef({ exam: false, inSession: false, hasDraft: false });
  const applyLeaveRef = useRef(() => {});
  const examLeave = useExamHomeExit((destination) => applyLeaveRef.current(destination));
  const [sessionLive, setSessionLive] = useState(false);
  const onSession = useCallback((snap) => {
    sessionRef.current = snap;
    const live = !!(snap?.inSession || snap?.exam);
    setSessionLive((current) => (current === live ? current : live));
  }, []);
  const [profileCardDismissed, setProfileCardDismissed] = useState(false); // blob (additive)
  const [fcFlips, setFcFlips] = useState(0);        // blob (additive): lifetime card flips, gates first-run coaching
  const [scrolling, setScrolling] = useState(false); // floating UI hides while scrolling
  const [isOwner, setIsOwner] = useState(false);    // reviewers-table member = owner tools
  const [shield, setShield] = useState(false);      // blur content when app loses focus
  const [rewards, setRewards] = useState(() => ({ ...emptyRewards(), rankHigh: 0 })); // new accounts start on the ladder, not the legacy XP map
  const rewardsRef = useRef(rewards);
  rewardsRef.current = rewards;
  const [moments, setMoments] = useState([]);       // celebrations waiting for a natural break
  const [liveRegion, announce] = useAnnouncer();    // persistent screen-reader live region (combos)
  const [guestNote, setGuestNote] = useState(null); // shown only after the merged save succeeds, or when a returning account skips a trial
  const [guestSaveError, setGuestSaveError] = useState(false);
  const [saveStall, setSaveStall] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const pendingGuestClear = useRef(false);
  const resetGeneration = useRef(0);
  const pendingHandoff = useRef(null);
  const saveQueue = useRef(null);
  const accountId = useRef(null);
  if (!saveQueue.current) saveQueue.current = createSaveQueue();
  useEffect(() => () => { saveQueue.current?.invalidate(); store.releaseAccount(); }, []);
  const openAbout = async () => {
    setMenuOpen(false);
    if (saveQueue.current.pending()) {
      const saved = await waitForFlush(() => saveQueue.current.flush());
      if (!saved.ok) { setSaveFailed(true); return; }
    }
    window.location.assign("/about/");
  };
  useEffect(() => {
    const warn = (event) => {
      if (!saveQueue.current?.pending()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const finishSignOut = async () => {
    saveQueue.current.invalidate();
    setMenuOpen(false);
    let result;
    try {
      result = await signOut({ auth: supabase.auth, storage: storageOrNull(() => window.localStorage), holdStorage: storageOrNull(() => window.sessionStorage) });
    } catch {
      setSaveFailed(true);
      return;
    }
    if (result?.error) { setSaveFailed(true); return; }
    store.releaseAccount();
    accountId.current = null;
    setSaveStall(false);
  };
  const signOutAndForgetTrial = async () => {
    const saved = await waitForFlush(() => saveQueue.current.flush());
    if (saved.timedOut) {
      setMenuOpen(false);
      setSaveStall(true);
      return;
    }
    if (!saved.ok || pendingHandoff.current) {
      const message = !saved.ok
        ? "The latest answers have not saved. Sign out anyway? They will be lost."
        : "Your trial answers are not in this account yet. Sign out anyway? They will be removed from this device.";
      if (typeof window.confirm === "function" && !window.confirm(message)) return;
    }
    await finishSignOut();
  };
  const retrySignOut = async () => {
    const saved = await waitForFlush(() => saveQueue.current.flush());
    if (saved.timedOut) return;
    if (!saved.ok && typeof window.confirm === "function" && !window.confirm("The latest answers have not saved. Sign out anyway? They will be lost.")) return;
    await finishSignOut();
  };

  /* ---- load saved progress (retryable; never treats a failed read as new) ---- */
  const [loadState, setLoadState] = useState("loading"); // loading | ok | error | corrupt
  const [saveBlocked, setSaveBlocked] = useState(false); // saved row could not be opened: study, but never write over it
  const [saveFailed, setSaveFailed] = useState(false);
  const unreadableRaw = useRef(null);
  const loadGeneration = useRef(0);
  const applyBlob = (s) => {
    setTheme(s.theme);
    setXp(s.xp);
    setBestRun(s.bestRun);
    setLog(s.log);
    setFlagged(s.flagged);
    setFlaggedCases(s.flaggedCases);
    setStreak(s.streak);
    const d = s.daily ?? { day: todayStr(), answered: 0 };
    setDaily(d.day === todayStr() ? d : { day: todayStr(), answered: 0 });
    // Kept verbatim. Re-stamping gaps with today's date on every load is
    // what made ungraded cards look permanently due.
    setSrs(s.srs);
    setSrsMap(migrateLegacySrs(s.srs, s.srsMap));
    setExamResults(s.examResults);
    setCustomQs(s.customQs);
    setProvider(s.provider);
    setAbility(s.ability);
    setPlan(s.plan);
    setExamDate(s.examDate);
    setTourSeen(s.tourSeen);
    setProfileCardDismissed(s.profileCardDismissed);
    setFcFlips(s.fcFlips);
    setMissSchedule(s.missSchedule);
    setFcNew(s.fcNew);
    setRewards(s.rewards);
    resetGeneration.current = Number(s.resetGeneration) || 0;
  };
  const loadProgress = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const stillCurrent = () => generation === loadGeneration.current;
    setLoadState("loading");
    try {
      const storage = storageOrNull(() => window.localStorage);
      clearLegacyProgressBackup(storage);
      sweepPendingProgress(storage);
    } catch { /* storage blocked */ }
    const read = await readProgress(() => store.get(STORE_KEY));
    if (!stillCurrent() || read.status === "cancelled") return;
    /* Failed read: stay unloaded. Autosave and the trial merge both wait
       for `loaded`, so nothing is written over the real row. */
    if (read.status === "error") { setLoaded(false); setSaveBlocked(true); setLoadState("error"); return; }
    const parsed = parseProgress(read.raw, (b) => migrateBlob(b, CATS)); // legacy saves get defaults (§4)
    if (parsed.status === "corrupt") {
      /* A row exists but cannot be opened. Keep the server copy untouched
         and never autosave, merge or delete over it. The raw row stays in
         memory only, for "Download a copy". */
      unreadableRaw.current = read.raw;
      setSaveBlocked(true);
      setLoadState("corrupt");
      return;
    }
    setSaveBlocked(false);
    let s = parsed.blob;
    if (s && read.status === "ok") {
      try {
        const absorbed = await store.absorbPending(STORE_KEY);
        if (!stillCurrent()) return;
        if (absorbed) s = migrateBlob(absorbed, CATS);
      } catch {
        setLoaded(false);
        setSaveBlocked(true);
        setLoadState("error");
        return;
      }
    }
    /* Try-before-sign-up handoff (src/progress-load.js guestHandoff). */
    let guest = null;
    guest = readGuestForHandoff(storageOrNull(() => window.localStorage), storageOrNull(() => window.sessionStorage));
    try { const { data } = await supabase.auth.getSession(); if (!stillCurrent()) return; accountId.current = data?.session?.user?.id ?? null; } catch { /* unknown account */ }
    if (!stillCurrent()) return;
    const handoff = guestHandoff({ guest, hasAnswers: accountHasAnswers(s?.log) });
    if (handoff === "merge") {
      const merged = mergeGuestIntoBlob(s ?? migrateBlob({}, CATS), guest, { today: todayStr(), calibration, catalog: QUESTIONS });
      if (merged.summary) { s = merged.blob; pendingHandoff.current = merged.summary; }
      pendingGuestClear.current = true;
    } else if (handoff === "keep") {
      setGuestNote({ skipped: true });
    } else if (handoff === "expired") {
      try {
        clearGuest(storageOrNull(() => window.localStorage));
        releaseHeldGuest(storageOrNull(() => window.sessionStorage));
      } catch { /* storage blocked */ }
    }
    if (s) applyBlob(s);
    setLoadState("ok");
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadProgress();
    return () => { loadGeneration.current += 1; };
  }, [loadProgress]);

  /* ---- autosave on change ---- */
  useEffect(() => {
    if (!loaded || saveBlocked) return;
    const seq = saveQueue.current.next();
    const payload = JSON.stringify({ theme, xp, bestRun, log, flagged, flaggedCases, streak, daily, srs, customQs, provider, ability, plan, examDate, tourSeen, srsMap, examResults, profileCardDismissed, fcFlips, missSchedule, fcNew, rewards, ...(resetGeneration.current > 0 ? { resetGeneration: resetGeneration.current } : {}) });
    const pendingAtStart = pendingGuestClear.current === true;
    const note = pendingHandoff.current;
    const userId = accountId.current;
    saveQueue.current.enqueue(seq, (ctx) => store.set(STORE_KEY, payload, userId, ctx)).then((res) => {
      if (!res || res.stale || res.error?.code === "account-changed" || res.error?.code === "aborted") return;
      if (res.reconciled && res.blob) applyBlob(res.blob);
      if (res.error?.code === "signed-out") {
        setSaveFailed(true);
        if (pendingAtStart) setGuestSaveError(true);
        return;
      }
      const outcome = handoffAfterSave({ ok: res.ok, pending: pendingAtStart });
      if (!res.ok) {
        console.error("Save failed", res.error);
        setSaveFailed(true);
        if (outcome === "error") setGuestSaveError(true);
        return;
      }
      setSaveFailed(false);
      if (guestClearOnSave(pendingAtStart)) {
        pendingGuestClear.current = false;
        clearGuest(storageOrNull(() => window.localStorage));
        releaseHeldGuest(storageOrNull(() => window.sessionStorage));
      }
      if (outcome === "saved" && note) {
        setGuestNote(note);
        setGuestSaveError(false);
        pendingHandoff.current = null;
      }
    });
  }, [loaded, saveBlocked, saveAttempt, theme, xp, bestRun, log, flagged, flaggedCases, streak, daily, srs, customQs, provider, ability, plan, examDate, tourSeen, srsMap, examResults, profileCardDismissed, fcFlips, missSchedule, fcNew, rewards]);

  const downloadUnreadable = () => {
    const raw = unreadableRaw.current;
    if (raw == null) return;
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "pulsern-saved-progress-backup.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const studyWithoutSaving = () => { setLoadState("ok"); setLoaded(true); };

  /* One screen, and only once study is actually reachable. Waiting for
     entitlement is what keeps the tour off the expired paywall. */
  const locked = isStudyLocked({ isOwner, ent });
  const activating = needsFirstAnswer({ locked, ent, logLength: log.length, isOwner });
  useEffect(() => {
    /* Auto-open only from the closed state. Rewinding an in-progress tour
       back to step 0 is what made Next look like a dead control for anyone
       who had not dismissed it yet. */
    if (locked && tourStep != null) setTourStep(null);
    else if (tourStep == null && !saveBlocked && shouldAutoOpenTour({ loaded, tourSeen, ent, locked, sessionLive, firstAnswerOwed: activating })) { setTourMode("quick"); setTourStep(0); }
  }, [loaded, saveBlocked, tourSeen, ent, locked, tourStep, sessionLive, activating]);

  /* The tour shows the real screen for the step. Positioning runs again
     when that screen replaces a placeholder, such as the flashcard queue. */
  const tourSteps = tourStepsFor(tourMode);
  /* The 🧪 Labs chip in every question's nav row opens the drawer. */
  useEffect(() => {
    const open = () => { setMenuOpen(false); setHelpOpen(false); setLabOpen(true); };
    window.addEventListener(OPEN_LABS_EVENT, open);
    return () => window.removeEventListener(OPEN_LABS_EVENT, open);
  }, []);
  /* Escape closes the header menu and hands focus back to ☰. */
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setMenuOpen(false);
      menuBtnRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  /* A short pulse on the header stat chip whenever XP goes up. */
  const [xpPulse, setXpPulse] = useState(0);
  const lastXp = useRef(xp);
  useEffect(() => {
    if (loaded && xp > lastXp.current) setXpPulse((n) => n + 1);
    lastXp.current = xp;
  }, [xp, loaded]);
  useTourPlacement(tourStep, tab, setTab, tourSteps);
  const [homeScroll, setHomeScroll] = useState(0);
  useTourDismissScroll(homeScroll, tourStep != null, tab);

  const wasActivating = useRef(false);
  useEffect(() => {
    if (activating && !wasActivating.current) setTab("today");
    wasActivating.current = activating;
  }, [activating]);

  /* ---- entitlement: who gets in, and how many exams they have left ----
     Brand-new accounts self-grant the 7-day free pass (capped at one per
     account for life by a DB unique index). If the reads fail we fail open
     on content — a network blip should never lock a paying student out. */
  const refreshEnt = async () => {
    try {
      let e = await fetchEntitlement();
      if (e.status === "none") {
        /* The grant is best-effort for the student — a failure here must not
           block the app — but it must not vanish either. It used to be
           swallowed by a bare catch, and one student ended up answering
           questions with no access row and no trace of why. Re-read the
           entitlement so a race (two tabs, a retry) still lands on the truth,
           and leave the reason in the console for the owner diagnostics. */
        try {
          e = await grantFreePass();
        } catch (err) {
          console.warn("free pass not granted:", err?.message ?? err);
          try { e = await fetchEntitlement(); } catch { /* keep the first read */ }
        }
      }
      setEnt(e);
    } catch {
      setEnt({ status: "offline", expiresAt: null, hadPaid: false, examsLeft: 0, attempted: [] });
    }
  };
  /* Stripe sends a completed checkout back to /app/?checkout=success. The webhook
     that writes the subscription row can land a beat after the redirect, so
     poll briefly rather than showing "no plan yet" to someone who just paid.
     The param is stripped immediately so a refresh or a copied link cannot
     replay the confirmation. */
  const [justPaid, setJustPaid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("checkout") !== "success") return;
    setJustPaid(true);
    setConfirming(true);
    url.searchParams.delete("checkout");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);

    let stopped = false;
    (async () => {
      for (let i = 0; i < 8 && !stopped; i++) {
        const e = await fetchEntitlement().catch(() => null);
        if (e) {
          setEnt(e);
          if (e.status === "active") { setConfirming(false); return; }
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      // Ran out of attempts. Stop hiding the paywall so they are not stranded
      // on a screen with no way forward if the webhook genuinely failed.
      if (!stopped) setConfirming(false);
    })();
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    refreshEnt();
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data } = await supabase.from("reviewers").select("user_id").eq("user_id", session.user.id).maybeSingle();
        setIsOwner(!!data);
      } catch { /* owner tools stay hidden */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* floating UI (LABS tab) hides while the page scrolls so it never sits
     on top of text or buttons, then fades back when scrolling stops */
  useEffect(() => {
    let t = null;
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(t);
      t = setTimeout(() => setScrolling(false), 650);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, []);

  /* ---- content protection: all materials are the owner's property ----
     Copy/context-menu are disabled on study content and the app blurs the
     moment it loses focus (which also blanks app-switcher previews and cuts
     casual capture). A browser can't fully block OS screenshots — the CSS
     and blur are deterrents, the legal notice is the enforcement.
     The owner (reviewers member) is exempt: development needs screenshots. */
  useEffect(() => {
    if (isOwner) { setShield(false); return; }
    const noCtx = (e) => { if (e.target.closest?.(".body")) e.preventDefault(); };
    const noCopy = (e) => { if (e.target.closest?.(".body") && !e.target.closest("input, textarea")) e.preventDefault(); };
    /* Bound on keydown as well as keyup: Windows grabs the frame as the key
       goes down, so a keyup-only handler blurs after the capture already
       happened. Even on keydown this is a race we do not reliably win — it
       raises the cost of a casual grab, nothing more. */
    const onKey = (e) => {
      if (e.key === "PrintScreen") {
        try { navigator.clipboard.writeText(""); } catch { /* clipboard may be unavailable */ }
        setShield(true); setTimeout(() => setShield(false), 1200);
      }
    };
    const onVis = () => setShield(document.visibilityState !== "visible");
    const onBlur = () => setShield(true);
    const onFocus = () => setShield(false);
    document.addEventListener("contextmenu", noCtx);
    document.addEventListener("copy", noCopy);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("contextmenu", noCtx);
      document.removeEventListener("copy", noCopy);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [isOwner]);

  /* ---- shared bank + item calibration (one query feeds both) ----
     RLS serves only approved, non-rejected rows, and since migration 018
     only to a signed-in account with unexpired access, so the load waits
     for the entitlement (a brand-new account's free pass is granted first)
     and re-runs when access opens. On any failure the built-in local array
     stays in place as the offline fallback. */
  const bankOpen = (isOwner || !!ent) && !locked;
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [bankFailed, setBankFailed] = useState(false);
  const [casesFailed, setCasesFailed] = useState(false);
  const catalogError = bankFailed || casesFailed;
  useEffect(() => {
    if (!bankOpen) return;
    (async () => {
      // paginate: the practice bank is way past Supabase's 1,000-row cap
      const data = [];
      let failed = false;
      let complete = false;
      for (let from = 0; ; from += 1000) {
        const { data: page, error } = await supabase.from("questions")
          .select("id, cat, diff, type, stem, options, extra, answer, rationale, ai, elo_rating, population")
          .eq("approved", true).is("exam_form", null) // exam items stay quarantined
          .order("id").range(from, from + 999);
        if (error || !Array.isArray(page)) { failed = true; break; }
        data.push(...page);
        if (page.length < 1000) { complete = true; break; }
      }
      const ready = complete && !failed;
      setBankFailed(!ready);
      if (!ready || !data.length) return;
      setCalibration(Object.fromEntries(data.map((r) => [r.id, { rating: r.elo_rating }])));
      const items = data
        .map(({ elo_rating, ...q }) => q)
        .filter(validQ);
      if (items.length) setBankQs(items);
    })();
    // flashcard + case banks load independently — a failure in one never blocks the others
    (async () => {
      // paginate: the bank is past Supabase's 1,000-row-per-request cap
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("flashcards")
          .select("id, cat, topic, front, back").eq("approved", true)
          .order("id").range(from, from + 999);
        if (error || !data?.length) break;
        all.push(...data);
        if (data.length < 1000) break;
      }
      if (all.length) {
        setBankCards(all.map((r) => ({ id: `c${r.id}`, cat: r.cat, topic: r.topic, front: r.front, back: r.back, ai: true })));
      }
    })();
    (async () => {
      const { data, error } = await supabase.from("case_studies")
        .select("id, cat, title, blurb, intro, vitals, labs, note, steps, population")
        .eq("approved", true).is("exam_form", null); // exam cases stay quarantined
      setCasesFailed(!!error);
      if (!error && data?.length) {
        setBankCases(data.map((r) => ({ ...r, dbId: r.id, ai: true })));
      }
    })();
  }, [bankOpen, catalogAttempt]);

  const acc = log.length ? log.filter((l) => l.correct).length / log.length : 0;

  // Elo/Rasch readiness: {pct, low, high, theta, weakest} or null under 12 answers
  const readiness = useMemo(() => readinessFrom(ability, log), [ability, log]);

  const readyLabel = readiness == null
    ? (log.length ? `Estimating: ${12 - log.length} more answer${12 - log.length === 1 ? "" : "s"} needed` : "No data yet")
    : readiness.pct >= 75 ? "High (estimate): trending above the passing standard"
    : readiness.pct >= 55 ? "Borderline (estimate): keep drilling weak areas"
    : "Below the passing standard (estimate): focus your review";

  /* Streak: the existing {count, lastDay, shield} rule, plus banked shift
     covers and once-only milestone moments (src/rewards.js advanceStreak). */
  const touchedDay = useRef(null);
  const touchDay = () => {
    setDaily((d) => d.day === todayStr() ? { ...d, answered: d.answered + 1 } : { day: todayStr(), answered: 1 });
    const today = todayStr();
    if (streakDayCounted(streak, touchedDay.current, today)) return;
    touchedDay.current = today;
    const adv = advanceStreak(streak, rewardsRef.current, today);
    setStreak(adv.streak);
    setRewards((r) => ({
      ...r, covers: adv.rewards.covers, coverDays: adv.rewards.coverDays, milestones: adv.rewards.milestones,
      best: { ...r.best, streak: Math.max(r.best.streak, adv.streak.count) },
    }));
    if (adv.milestone) setMoments((m) => [...m, streakMoment(adv.milestone)]);
    if (adv.event === "cover") setMoments((m) => [...m, { kind: "cover-used", title: "Your streak is protected", line: `A shift cover covered the day you missed. Day ${adv.streak.count} today.`, next: `${adv.rewards.covers} cover${adv.rewards.covers === 1 ? "" : "s"} left` }]);
  };

  /* `correct` is the FULL-CREDIT outcome (every NCSBN partial-credit point
     earned). The ability engine, readiness, XP and the review schedule all
     receive this same binary outcome, so Elo calibration is unchanged by
     partial-credit scoring. Case-study steps pass { schedule: false }: their
     pseudo-ids are not QBank questions and cannot be re-served.
     XP follows src/rewards.js answerXp: considered, correct, first-time
     retrievals earn it; repeats, skips, and too-fast taps earn none.
     Returns the XP result so the feedback line shows exactly what was earned. */
  progressRef.current = {
    log, xp, ability, streak, rewards: rewardsRef.current, daily, missSchedule, run: runRef.current, bestRun,
  };
  const record = (q, correct, opts = {}) => {
    const source = q.source === "case" || q.source === "bank" || q.source === "builtin"
      ? q.source
      : (String(q.id).startsWith("case-") ? "case" : (BUNDLED_QUESTIONS.some((item) => item.id === q.id && item.stem === q.stem) ? "builtin" : "bank"));
    const item = stampedQuestion({ ...q, source });
    const beforeAbility = progressRef.current.ability;
    const words = String(item.stem ?? "").trim().split(/\s+/).filter(Boolean).length;
    const applied = commitLiveAnswer(progressRef, {
      q: item, correct, ms: opts.ms ?? Infinity, today: todayStr(), schedule: opts.schedule !== false, calibration,
      attempt: opts.attempt ?? newAttemptId(),
      words, rating: itemRating(item, calibration),
    });
    const next = applied.state;
    const res = applied.result ?? { xp: 0, reason: "duplicate", base: 0, bonus: 0, fix: false, run: next.run };
    setLog(next.log);
    setMissSchedule(next.missSchedule);
    setDaily(next.daily);
    setStreak(next.streak);
    setRewards(next.rewards);
    rewardsRef.current = next.rewards;
    setAbility(next.ability);
    setXp(next.xp);
    runRef.current = next.run;
    setRun(next.run);
    setBestRun(next.bestRun);
    const note = applied.streakNote;
    if (note?.milestone) setMoments((m) => [...m, streakMoment(note.milestone)]);
    if (note?.event === "cover") setMoments((m) => [...m, { kind: "cover-used", title: "Your streak is protected", line: `A shift cover covered the day you missed. Day ${note.streak.count} today.`, next: `${note.rewards.covers} cover${note.rewards.covers === 1 ? "" : "s"} left` }]);
    const { itemDelta } = updateAbility(beforeAbility, item, correct, calibration);
    if (source === "bank" && calibration[q.id] !== undefined) {
      fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: q.id, correct, itemDelta }),
      }).catch(() => {});
    }
    const counts = answerCountsForRun({ correct, q: item, ms: opts.ms ?? Infinity });
    const newBest = next.run >= 3 && next.run > bestRun;
    const combo = counts ? comboFor(next.run) : null;
    announce(comboSpeech(combo, newBest));
    if (res.xp > 0) rewardBeat(combo || newBest ? "combo" : "correct", next.rewards.prefs);
    return { ...res, run: next.run, combo, newBest };
  };
  /* A graded card counts toward today's cards and its XP toward the day's
     XP (so the weekly view matches the header). Undo reverses all of it,
     including the day count touchDay added, so grade → undo → grade counts once. */
  const noteCard = (cardXpGain = 0, op) => setRewards((r) => (op?.id
    ? recordCardGrade(r, { id: op.id, day: op.day || todayStr(), xp: cardXpGain || 0 })
    : bumpDay(r, todayStr(), { cards: 1, xp: cardXpGain || 0 })));
  const unnoteCard = (cardXpGain = 0, day, op) => {
    const credited = day || todayStr();
    setRewards((r) => (op?.id
      ? undoCardGrade(r, { id: op.id, day: credited, xp: cardXpGain })
      : reverseCardDay(r, credited, cardXpGain)));
    setDaily((d) => (d.day === credited && d.answered > 0 ? { ...d, answered: d.answered - 1 } : d));
  };
  const resolveLegacy = (legacyId, chosen, logIndex = -1) => {
    if (!chosen?.key || !chosen?.source || !Number.isInteger(logIndex) || logIndex < 0) return;
    setLog((rows) => claimLegacyAt(rows, logIndex, chosen));
    setMissSchedule((schedule) => claimLegacySchedule(schedule, legacyId, chosen));
  };
  const setPref = (k, v) => setRewards((r) => ({ ...r, prefs: { ...r.prefs, [k]: v } }));
  const motion = motionAllowed(rewards.prefs);

  const catStats = CATS.map((c) => {
    const rows = log.filter((l) => l.cat === c);
    return { cat: c, n: rows.length, pct: rows.length ? Math.round((rows.filter(r => r.correct).length / rows.length) * 100) : null };
  });

  // Special-population performance (peds/geriatric/maternal), tracked via the
  // pop tag now stored on each answer. Separate from client-needs categories.
  const popStats = [
    { key: "peds", label: "🧒 Pediatrics" },
    { key: "geriatric", label: "👵 Geriatrics" },
    { key: "maternal", label: "🤰 Maternal & Newborn" },
  ].map(({ key, label }) => {
    const rows = log.filter((l) => l.pop === key);
    return { cat: label, n: rows.length, pct: rows.length ? Math.round((rows.filter((r) => r.correct).length / rows.length) * 100) : null };
  });

  const allCards = useMemo(() => [...BUILTIN_CARDS, ...(bankCards ?? [])], [bankCards]);
  const allCases = useMemo(() => [
    ...CASE_STUDIES.map((c) => ({ ...c, ai: false })),
    ...(bankCases ?? []),
  ], [bankCases]);
  const newAllowance = newCardAllowance(fcNew, todayStr());
  const dueCount = useMemo(() => dueQueue(allCards, srsMap, newAllowance).length, [allCards, srsMap, newAllowance]);
  const onNewCard = (id) => setFcNew((f) => noteNewCard(f, todayStr(), id));
  const onRefundNewCard = (id) => setFcNew((f) => refundNewCard(f, todayStr(), id));
  const allQuestions = useMemo(
    () => [
      ...stampLoadedCatalog(bankQs ?? BUNDLED_QUESTIONS, bankQs ? "bank" : "builtin"),
      ...stampLoadedCatalog(customQs, "bank"),
    ],
    [bankQs, customQs]
  );
  const addQuestions = (qs) => setCustomQs((c) => [...c, ...qs]);

  /* ---- rewards: all derived from the log + reward history ---- */
  const today = todayStr();
  const board = useMemo(() => badgeBoard(log, CATS, rewards.badgesSeen), [log, rewards.badgesSeen]);
  const career = useMemo(() => careerStatus({ xp, log, cats: CATS, rankHigh: rewards.rankHigh }), [xp, log, rewards.rankHigh]);
  const missesOpen = useMemo(() => reviewPools(expandTrialQuestions(legacyCandidates(allQuestions, log, BUNDLED_QUESTIONS, allCases), log, BUNDLED_QUESTIONS, missSchedule), log, missSchedule, today).review.length, [allQuestions, allCases, log, missSchedule, today]);
  const qToday = todayQuestionCount({ rewards, daily, today });
  const shift = shiftStatus({ day: rewards.days[today], answeredToday: qToday.known ? qToday.count : 0, questionsKnown: qToday.known, dueCount, missesOpen });
  const week = weekRounds(rewards, today);
  const nextDue = useMemo(() => {
    let m = null;
    for (const v of Object.values(srsMap)) if (v?.due && v.due > today && (!m || v.due < m)) m = v.due;
    return m;
  }, [srsMap, today]);

  /* Promotions and new badge levels are celebrated once. Whatever is
     already true when the app loads (an existing student's first visit
     after this update, or a guest handoff) is marked seen silently. */
  const momentsPrimed = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    const after = { career: careerStatus({ xp, log, cats: CATS, rankHigh: null }), board: badgeBoard(log, CATS, {}) };
    const found = detectMoments({ before: after, after, rewards: rewardsRef.current });
    if (found.length) {
      setRewards((r) => markMomentsSeen(r, found));
      if (momentsPrimed.current) setMoments((m) => [...m, ...found]);
    }
    momentsPrimed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, log.length, xp]);
  /* Five shifts in a week bank one shift cover (max MAX_COVERS).
     covers is a dependency so a cover spent later the same week can still
     bank the cover that was earned while the bank was full. */
  useEffect(() => {
    if (!loaded) return;
    const g = maybeGrantCover(rewardsRef.current, today);
    if (g.rewards === rewardsRef.current) return;
    setRewards((r) => maybeGrantCover(r, today).rewards);
    if (g.granted) setMoments((m) => [...m, { kind: "cover", title: "Shift cover earned", line: "Five shifts this week. A cover protects your streak on a day you can't study, like a clinical day.", next: `${g.rewards.covers} of ${MAX_COVERS} banked` }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, rewards.days, rewards.covers, today]);

  /* ---- session recap: snapshot at the start, summary at the end ---- */
  const sessionStart = useRef(null);
  const beginSession = () => {
    sessionStart.current = { logLen: log.length, xp, at: Date.now(), bestRun, cards: rewards.days[today]?.cards ?? 0 };
  };
  const makeRecap = () => {
    if (!sessionStart.current) beginSession();
    const start = sessionStart.current ?? { logLen: log.length, xp, at: Date.now(), bestRun, cards: 0 };
    return sessionRecap({ start, log, xp, rewards, cardsToday: rewards.days[today]?.cards ?? 0, dueCount, nextDue, bestRun });
  };
  const commitRecap = (recap) => {
    if (!recap) return;
    setRewards((r) => ({ ...r, best: { ...r.best, run: Math.max(r.best.run, recap.nextBest.run), sessionAcc: Math.max(r.best.sessionAcc, recap.nextBest.sessionAcc), sessionN: recap.nextBest.sessionAcc > r.best.sessionAcc ? recap.nextBest.sessionN : r.best.sessionN } }));
    rewardBeat("recap", rewardsRef.current.prefs);
  };
  const recapProps = { makeRecap, commitRecap, shift, today, motion };
  const momentKey = moments[0] ? `${moments[0].kind}:${moments[0].title}` : null;
  useEffect(() => {
    if (momentKey && !sessionLive) rewardBeat("milestone", rewardsRef.current.prefs);
  }, [momentKey, sessionLive]);

  const resetAll = async () => {
    /* Never while not saving: the only server copy is the row we couldn't open (REVIEW-4 R4-1). */
    if (saveBlocked) return;
    saveQueue.current?.invalidate();
    try { await store.delete(STORE_KEY, resetGeneration.current + 1); } catch (e) { setSaveFailed(true); return; }
    resetGeneration.current += 1;
    setXp(0); setRun(0); setBestRun(0); setLog([]); setFlagged([]); setCustomQs([]);
    touchedDay.current = null;
    setStreak({ count: 0, lastDay: null, shield: true }); setDaily({ day: todayStr(), answered: 0 });
    setSrs(freshCards()); setSrsMap({}); setFcNew({ day: null, count: 0 }); setMissSchedule({}); setExamResults({}); setAbility(emptyAbility(CATS)); setPlan(null); setExamDate(null); setTab("today");
    setRewards((r) => ({ ...emptyRewards(), rankHigh: 0, prefs: r.prefs })); setMoments([]);
  };

  /* ---- weekly planner (§5.7): one LLM call per ISO week, cached in the blob ---- */
  useEffect(() => {
    if (!loaded || !examDate) return;
    const wk = weekStart();
    if (plan?.week === wk && Array.isArray(plan?.days) && plan.days.length) return;
    (async () => {
      try {
        // honest inventory: the plan may never schedule questions that
        // don't exist (RN pack prompt 2)
        const answeredIds = new Set(log.map((l) => answerIdentity(l)).filter((id) => id != null));
        const lastById = {};
        for (const l of log) {
          const id = answerIdentity(l);
          if (id != null) lastById[id] = l.correct;
        }
        const perCat = Object.fromEntries(CATS.map((c) => [c, 0]));
        for (const q of allQuestions) {
          const id = answerIdentity(q);
          if (id != null && !answeredIds.has(id) && perCat[q.cat] !== undefined) perCat[q.cat]++;
        }
        const misses = Object.values(lastById).filter((ok) => !ok).length;
        const token = await currentAccessToken();
        const r = await fetch("/api/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ examDate, ability, dueCount, answeredTotal: log.length, today: todayStr(), inventory: { perCat, misses }, token }),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && Array.isArray(data.days) && data.days.length) setPlan({ week: wk, days: data.days });
      } catch (e) { /* offline — keep whatever plan we had */ }
    })();
    // Deliberately NOT keyed on ability/log/dueCount: the plan refreshes when
    // the ISO week rolls over or the exam date changes, not on every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, examDate, plan]);

  if (loadState === "error") return (
    <div className="app" data-theme={theme}>
      <Style />
      <RewardsStyle />
      <main className="body">
        <section className="card rw-load-error" role="alert" aria-labelledby="load-error-title">
          <p className="eyebrow">Saved progress</p>
          <h2 id="load-error-title" className="h2">We couldn't load your progress</h2>
          <p className="small">We couldn't reach the server, so your saved XP, streak and answers stay as they are. Nothing will be saved until your progress loads. Check your connection and try again.</p>
          <div className="row">
            <button type="button" className="btn" onClick={loadProgress}>Try again</button>
            <button type="button" className="btn ghost" onClick={signOutAndForgetTrial}>Sign out</button>
          </div>
        </section>
      </main>
    </div>
  );

  if (loadState === "corrupt") return (
    <div className="app" data-theme={theme}>
      <Style />
      <RewardsStyle />
      <main className="body">
        <section className="card rw-load-error rw-load-corrupt" role="alert" aria-labelledby="load-corrupt-title">
          <p className="eyebrow">Saved progress</p>
          <h2 id="load-corrupt-title" className="h2">Your saved progress couldn't be opened</h2>
          <p className="small">This isn't a connection problem. Your account has saved progress, but it's in a form the app can't read. We haven't changed it.</p>
          <p className="small">You can keep studying now, but nothing will be saved until this is fixed. Email <a href="mailto:sheldon@pulsern.app?subject=PulseRN%20saved%20progress%20won%27t%20open">sheldon@pulsern.app</a> and we'll restore it.</p>
          <div className="row">
            <button type="button" className="btn" onClick={studyWithoutSaving}>Study without saving</button>
            <button type="button" className="btn ghost" onClick={downloadUnreadable}>Download a copy</button>
            <button type="button" className="btn ghost" onClick={signOutAndForgetTrial}>Sign out</button>
          </div>
        </section>
      </main>
    </div>
  );

  if (!loaded) return (
    <div className="app" data-theme={theme}>
      <Style />
      <div className="body"><section className="card"><p className="eyebrow">PulseRN</p><p className="small">Loading your saved progress…</p></section></div>
    </div>
  );

  /* expired / never-entitled accounts see only the paywall (plus sign-out);
     the owner is never locked — full site access for development.
     locked / activating are computed above so the tour effect can use them. */
  const accessPending = ent === null && log.length === 0 && !isOwner;
  const profilePrompt = showProfilePrompt({
    logLength: log.length,
    hasProfile: !!profile,
    dismissed: profileCardDismissed,
    profileLoading: profile === undefined,
  });

  const openFirstQuestion = () => {
    setTourStep(null);
    setTourSeen(true);
    setLeaveGuard(null);
    setTab("today");
    setQuizKick((n) => n + 1);
    setHomeScroll((n) => n + 1);
  };
  const dismissTour = () => {
    setTourStep(null);
    setTourSeen(true);
    setLeaveGuard(null);
    setTab("today");
    if (tourSkipStartsQuestion(activating)) setQuizKick((n) => n + 1);
    else setHomeEpoch((n) => n + 1);
    setHomeScroll((n) => n + 1);
  };
  const applyLeave = (destination = "home") => {
    setLeaveGuard(null);
    setMenuOpen(false);
    setLabOpen(false);
    setHelpOpen(false);
    if (destination === "tour") {
      setTourMode("full");
      setTourStep(0);
      return;
    }
    if (destination === "home") {
      if (tourStep != null) setTourSeen(true);
      setTourStep(null);
      setTab("today");
      setHomeEpoch((n) => n + 1);
    } else {
      setTab(destination);
      setSectionEpoch((n) => n + 1);
    }
    window.scrollTo(0, 0);
  };
  applyLeaveRef.current = applyLeave;
  const requestLeave = (destination) => {
    setMenuOpen(false);
    const plan = planLeaveRequest({
      session: sessionRef.current,
      destination,
      tab,
      tourOpen: tourStep != null,
    });
    if (plan.clearExamWait) examLeave.clear();
    if (plan.kind === "stay") return;
    if (plan.kind === "ask") {
      setLeaveGuard(plan.guard);
      return;
    }
    applyLeave(plan.destination);
  };
  const confirmLeave = () => {
    const destination = leaveGuard?.destination ?? "home";
    setLeaveGuard(null);
    examLeave.confirm(sessionRef.current.exam, destination);
  };
  const openTour = () => requestLeave("tour");
  const goHome = () => requestLeave("home");
  const goSection = (next) => {
    if (next === "today") goHome();
    else requestLeave(next);
  };

  return (
    <div className={"app" + (shield ? " shield" : "") + (isOwner ? " owner" : "") + (scrolling ? " scrolling" : "") + (sessionLive ? " in-session" : "") + (motion ? "" : " fx-reduced") + " tab-" + tab} data-theme={theme}>
      <Style />
      <RewardsStyle />
      {liveRegion}
      <header className={"top" + (menuOpen ? " menu-open" : "")}>
        {/* Exam lockdown: while a readiness exam runs, all navigation and
            references disappear — only the exam (and its calculator) exists,
            just like the real testing center. */}
        {/* PR #177 added a separate Home pill. The logo is the Home action now
            (same goHome handler, 44 px target, labelled "PulseRN home"), and
            Today in the tab bar does the same, so the header keeps one row:
            logo · streak/XP chip · menu. Night mode moved into the menu. */}
        <button type="button" className="brand brand-btn" onClick={goHome} aria-label="PulseRN home">
          <span className="pulse-dot" aria-hidden="true" />
          <span className="brand-name">PULSE<em>RN</em></span>
        </button>
        <div className="top-stats mono">
          {examLock ? (
            <span className="exam-lock-chip" title="References stay closed until you submit or end the exam">🔒 EXAM</span>
          ) : (
            <span key={xpPulse} className={"stat-chip" + (xpPulse ? " pulse" : "")} role="img" aria-label={`${streak.count} day streak, ${xp} XP`}>
              <span aria-hidden="true"><StreakGlyph />{streak.count}</span><span className="stat-sep" aria-hidden="true" /><span aria-hidden="true">◆ {xp} XP</span>
            </span>
          )}
          {(examLock || locked) && (
            <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "light" ? "dim" : "light")} />
          )}
          {!examLock && (
            <button ref={menuBtnRef} type="button" className="theme-btn menu-btn" onClick={() => setMenuOpen((m) => !m)}
              aria-label={menuOpen ? "Close menu" : "Menu"} aria-expanded={menuOpen}>
              <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
            </button>
          )}
        </div>
        {menuOpen && !examLock && (
          <>
            <div className="menu-overlay" onClick={() => setMenuOpen(false)} />
            <nav className="menu-panel" aria-label="Main menu">
              {!locked && <>
                <button type="button" className="menu-item" onClick={goHome}>🏠 Home</button>
                <button type="button" className="menu-item" onClick={() => { setHelpOpen(false); setLabOpen(true); setMenuOpen(false); }}>🧪 Lab values reference</button>
                <button type="button" className="menu-item" onClick={() => goSection("exams")}>📝 Readiness exams</button>
                <button type="button" className="menu-item" onClick={() => goSection("plans")}>💳 Plans & upgrades</button>
                <button type="button" className="menu-item" onClick={() => { setLabOpen(false); setHelpOpen(true); setMenuOpen(false); }}>💬 Help & contact</button>
                <button type="button" className="menu-item" onClick={() => setTheme(theme === "light" ? "dim" : "light")}
                  title="Light mode reads best for long study sessions; night mode cuts glare for late review">
                  {theme === "light" ? "🌙 Night mode" : "☀ Light mode"}
                </button>
                <button type="button" className="menu-item" onClick={openAbout}>🩺 Meet the RN behind PulseRN</button>
                <button type="button" className="menu-item" onClick={openTour}>🎓 Tour</button>
                <button type="button" className="menu-item" onClick={() => goSection("stats")}>⚙ Settings & Stats</button>
              </>}
              {/* Owner only — students never see this entry, and the page and
                  its API refuse anyone who is not in the reviewers table. */}
              {isOwner && (
                <button className="menu-item" onClick={() => { window.location.assign("/owner/"); }}>🛠 Owner tools: system &amp; accounts</button>
              )}
              <button className="menu-item" onClick={signOutAndForgetTrial}>↪ Sign out</button>
            </nav>
          </>
        )}
      </header>

      <main className="body">
        {/* Straight after a purchase or upgrade: the strongest moment to ask
            for a home-screen icon, because they have just committed. Dismissal
            is scoped to "paid", so waving it away at signup does not suppress
            it here. */}
        {justPaid && (
          <section className="card" style={{ borderColor: "var(--ok-line)" }}>
            <p className="eyebrow">Payment received</p>
            <h2 className="h2">You're in. Full access is live.</h2>
            <p className="small">
              {ent?.status === "active"
                ? "Your plan is active. Everything is unlocked: the full QBank, case studies, flashcards, and readiness exams."
                : confirming
                ? "Confirming your plan. This usually takes a few seconds, and everything unlocks the moment it lands."
                : "Your payment went through, but the plan hasn't appeared yet. Tap \"Refresh my access\" below. If it still doesn't show, email sheldon@pulsern.app and we'll fix it right away."}
            </p>
            <InstallCard />
          </section>
        )}
        {saveBlocked && loaded && (
          <section className="card rw-saved rw-not-saving" role="status" aria-labelledby="not-saving-title">
            <p className="eyebrow">Not saving</p>
            <h2 id="not-saving-title" className="h2">This session isn't being saved</h2>
            <p className="small">Your saved progress couldn't be opened, so we're leaving it untouched. Email <a href="mailto:sheldon@pulsern.app?subject=PulseRN%20saved%20progress%20won%27t%20open">sheldon@pulsern.app</a> to restore it.</p>
            <button type="button" className="btn ghost" onClick={downloadUnreadable}>Download a copy</button>
          </section>
        )}
        {catalogError && loaded && !saveBlocked && (
          <section className="card rw-saved" role="alert">
            <h2 className="h2">The question catalog didn't load</h2>
            <p className="small">Saved misses stay in Review misses. Retry to open the rest of the bank.</p>
            <button type="button" className="btn" onClick={() => setCatalogAttempt((n) => n + 1)}>Retry</button>
          </section>
        )}
        {saveFailed && loaded && !saveBlocked && !guestSaveError && (
          <section className="card rw-saved" role="alert">
            <p className="eyebrow">Not saved yet</p>
            <h2 className="h2">Your latest answers aren't saved yet</h2>
            <p className="small">The last save didn't finish. Try again before you leave this page.</p>
            <button type="button" className="btn" onClick={() => setSaveAttempt((n) => n + 1)}>Try again</button>
          </section>
        )}
        {saveStall && (
          <section className="card rw-saved" role="dialog" aria-labelledby="save-stall-title">
            <h2 id="save-stall-title" className="h2">Still saving your progress.</h2>
            <p className="small">Unsaved changes from the last few seconds may be lost.</p>
            <div className="row">
              <button type="button" className="btn" onClick={retrySignOut}>Retry</button>
              <button type="button" className="btn ghost" onClick={finishSignOut}>Sign out anyway</button>
            </div>
          </section>
        )}
        {guestSaveError && !locked && (
          <section className="card rw-saved" role="alert">
            <p className="eyebrow">Not saved yet</p>
            <h2 className="h2">Your trial answers are still on this device</h2>
            <p className="small">The account copy didn't save. Nothing was discarded. Try again, and stay signed in until it does.</p>
            <button type="button" className="btn" onClick={() => setSaveAttempt((n) => n + 1)}>Try again</button>
          </section>
        )}
        {guestNote?.skipped && !guestSaveError && !locked && (
          <section className="card rw-saved" role="status">
            <p className="small">This account already has progress, so your practice answers weren't added.</p>
            <button type="button" className="btn ghost" onClick={() => {
              try {
                clearGuest(storageOrNull(() => window.localStorage));
                releaseHeldGuest(storageOrNull(() => window.sessionStorage));
              } catch { /* storage blocked */ }
              setGuestNote(null);
            }}>Discard practice answers</button>
          </section>
        )}
        {guestNote && !guestNote.skipped && !guestSaveError && !locked && (
          <section className="card rw-saved" role="status">
            <p className="eyebrow">Progress saved</p>
            <h2 className="h2">Your trial answers are in your account</h2>
            <p className="small">{guestNote.answers} answer{guestNote.answers === 1 ? "" : "s"}, {guestNote.correct} correct, +{guestNote.xp} XP{guestNote.streakStarted ? `, and day ${guestNote.streak} of your streak` : ""}. They count toward your stats, badges, and readiness estimate.</p>
            <button type="button" className="btn ghost" onClick={() => setGuestNote(null)}>Got it</button>
          </section>
        )}
        {locked && !confirming && <Paywall ent={ent} onRefresh={refreshEnt} />}
        {!locked && !isOwner && ent?.status === "trial" && tab !== "plans" && (
          <section className="card trial-banner">
            <p className="small"><strong>Free pass:</strong> {trialBannerMessage({ expiresAt: ent.expiresAt, answered: log.length >= 1 })} <button className="auth-switch" onClick={() => goSection("plans")}>See plans →</button></p>
          </section>
        )}
        {!locked && <>
          {tab === "today" && <Today xp={xp} streak={streak} bestRun={bestRun} log={log} readiness={readiness} readyLabel={readyLabel} catStats={catStats} daily={daily} dueCount={dueCount} go={goSection}
            record={record} questions={allQuestions} provider={provider} onResolveLegacy={resolveLegacy}
            ability={ability} calibration={calibration} plan={plan} missSchedule={missSchedule}
            newAllowance={newAllowance} onNewCard={onNewCard} onRefundNewCard={onRefundNewCard}
            profile={profile} setProfile={setProfile} showProfile={profilePrompt} dismissProfileCard={() => setProfileCardDismissed(true)}
            fcFlips={fcFlips} onFlip={() => setFcFlips((n) => n + 1)}
            cards={allCards} srsMap={srsMap} setSrsMap={setSrsMap} touchDay={touchDay} ready={loaded} addXp={(n) => setXp((x) => x + n)}
            needsFirstAnswer={activating} quizKick={quizKick} appliedQuizKick={appliedQuizKick} accessPending={accessPending}
            homeEpoch={homeEpoch} tourHold={tourStep != null} tourFocus={tourStep == null ? null : tourStepAt(tourStep, tourSteps)?.focus} onSession={onSession}
            rewards={rewards} shift={shift} career={career} missesOpen={missesOpen} beginSession={beginSession} recapProps={recapProps} onGrade={noteCard} onUngrade={unnoteCard} cases={allCases} onRetryCatalog={() => setCatalogAttempt((n) => n + 1)} />}
          {tab === "qbank" && <QBank key={sectionEpoch} record={record} log={log} questions={allQuestions} provider={provider} addQuestions={addQuestions} ability={ability} calibration={calibration} missSchedule={missSchedule} isOwner={isOwner} onSession={onSession} onResolveLegacy={resolveLegacy} cases={allCases} onRetryCatalog={() => setCatalogAttempt((n) => n + 1)} tourFocus={tourStep == null ? null : tourStepAt(tourStep, tourSteps)?.focus}
            onBegin={beginSession} renderBreak={({ onMore, onEnd }) => <RecapPanel {...recapProps} doneLabel="End session" onDone={onEnd} onMore={onMore} moreLabel="One more block →" />} />}
          {tab === "case" && <CaseStudy key={sectionEpoch} record={record} provider={provider} cases={allCases} onSession={onSession} tourFocus={tourStep == null ? null : tourStepAt(tourStep, tourSteps)?.focus} />}
          {tab === "cards" && <Flashcards key={sectionEpoch} onGrade={noteCard} onUngrade={unnoteCard} addXp={(n) => { setXp((x) => x + n); }} cards={allCards} srsMap={srsMap} setSrsMap={setSrsMap} touchDay={touchDay} ready={loaded} fcFlips={fcFlips} onFlip={() => setFcFlips((n) => n + 1)} newAllowance={newAllowance} onNewCard={onNewCard} onRefundNewCard={onRefundNewCard} onSession={onSession} tourFocus={tourStep == null ? null : tourStepAt(tourStep, tourSteps)?.focus} />}
          {tab === "exams" && <ExamCenter record={record} examResults={examResults} setExamResults={setExamResults} cats={CATS} ent={ent} isOwner={isOwner} onRunning={setExamLock} onAttempt={(f) => setEnt((e) => (e ? { ...e, examsLeft: Math.max(0, e.examsLeft - 1), attempted: [...e.attempted, f] } : e))} onUpgrade={() => goSection("plans")} onSession={onSession} bindExit={examLeave.bindExit} onScored={examLeave.onScored} onLeaveSubmit={examLeave.onLeaveSubmit} />}
          {tab === "plans" && <Paywall ent={ent} onRefresh={refreshEnt} trialBanner={ent?.status === "trial"} />}
          {tab === "stats" && <Stats setPref={setPref} rewards={rewards} career={career} board={board} week={week} xp={xp} streak={streak} bestRun={bestRun} readiness={readiness} readyLabel={readyLabel} log={log} catStats={catStats} popStats={popStats} acc={acc} resetAll={resetAll} saveBlocked={saveBlocked} provider={provider} setProvider={setProvider} customCount={customQs.length} examDate={examDate} setExamDate={setExamDate} isOwner={isOwner} ent={ent} onManagePlan={() => goSection("plans")} profile={profile} setProfile={setProfile} tourFocus={tourStep == null ? null : tourStepAt(tourStep, tourSteps)?.focus} signOutAndForgetTrial={signOutAndForgetTrial} />}
          {tourStep != null && <div className="tour-scroll-room" aria-hidden="true" />}
        </>}
      </main>

      {!locked && !examLock && !activating && !accessPending && (
        <nav className="tabs" aria-label="Sections">
          {[["today", "Today"], ["qbank", "Practice"], ["case", "Cases"], ["cards", "Cards"], ["stats", "Stats"]].map(([k, label]) => (
            <button key={k} type="button" className={tab === k ? "tab on" : "tab"} aria-current={tab === k ? "page" : undefined} onClick={() => goSection(k)}>
              <TabIcon name={k} /><span className="tab-label">{label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* The draggable 🧪 study toolkit floats on every study screen, in a
          question too, and settles clear of every button (src/float-pos.js).
          Readiness exams keep exam conditions, so it is not shown there. */}
      {!examLock && !locked && (
        <LabFab hidden={tourStep != null || menuOpen || labOpen || helpOpen} open={labOpen || helpOpen}
          settleKey={tab} onOpen={() => { setMenuOpen(false); setLabOpen(true); }} />
      )}
      <Toolkit open={!examLock && (labOpen || helpOpen)} section={helpOpen ? "help" : "labs"}
        onSection={(k) => { setLabOpen(k === "labs"); setHelpOpen(k === "help"); }}
        onClose={() => { setLabOpen(false); setHelpOpen(false); }} provider={provider} />
      {moments.length > 0 && !sessionLive && tourStep == null && !leaveGuard && !examLock && !locked && (
        <MomentSheet key={moments.length + ":" + moments[0].kind + ":" + (moments[0].title ?? "")} moment={moments[0]} motion={motion} onClose={() => setMoments((m) => m.slice(1))} />
      )}
      {tourStep != null && !locked && (
        <Tour
          step={tourStep}
          steps={tourSteps}
          activating={activating}
          onBack={() => setTourStep((n) => Math.max(0, (n ?? 0) - 1))}
          onNext={() => setTourStep((n) => (n ?? 0) + 1)}
          onSkip={dismissTour}
          onHome={goHome}
          onAnswer={openFirstQuestion}
        />
      )}
      <LeaveDialog guard={leaveGuard} onConfirm={confirmLeave} onCancel={() => setLeaveGuard(null)} />
    </div>
  );
}

/* Compact theme control for the two states where the menu cannot offer
   Night mode: a readiness exam (the menu is locked away) and a locked
   account (the menu is up, but study actions including the theme item
   are not). 44px, same colours as the menu item. */
export function ThemeToggle({ theme, onToggle }) {
  const night = theme === "light";
  return (
    <button type="button" className="theme-btn theme-compact" onClick={onToggle}
      aria-label={night ? "Night mode" : "Light mode"}
      title={night ? "Night mode cuts glare for late review" : "Light mode reads best for long study sessions"}>
      <span aria-hidden="true">{night ? "🌙" : "☀"}</span>
    </button>
  );
}

/* ================= HELP & CONTACT =================
   AI support chat for how-do-I and study questions, plus direct contact.
   The chat never gives medical advice and points account/billing issues
   to a human. */

const SUPPORT_CONTEXT = `You are PulseRN's friendly in-app helper. PulseRN is an adaptive NCLEX-RN study app.
How the app works: Today tab = one-tap daily round (due flashcards + 8 adaptive questions) and shows a readiness range after 12+ answers, plus a weekly plan once an exam date is set in Stats. Practice tab = adaptive QBank covering all eight NCSBN client-needs categories (weaker categories come up more often) and eight item types (multiple choice, select-all, ordering, matrix, bow-tie, cloze, dosage-calculation math, highlight), some with chart/exhibit data; Focus chips at the top filter by category and/or question type; missed questions are scheduled to come back on a review date (tomorrow, then further out each time they are answered correctly), show up first in the Today round when due, and can be reviewed anytime in "Review misses". NGN items and case-study steps earn NCSBN-style partial credit. Case Study tab = a library of full NCJMM case walkthroughs (for example sepsis, DKA, and preeclampsia) with the AI tutor available on every step. Cards tab = spaced-repetition flashcards (type your answer, flip with Enter, self-grade; Back, Skip, and Next move through this sitting, and Skip does not change the schedule; dosage-calculation cards include an on-screen calculator). Left and Right arrow keys move between cards when you are not typing. Read aloud: practice questions (including the Today round and Review misses), case studies and flashcards have a 🔊 Listen button that reads the item aloud in a natural voice while highlighting the part being read; after answering, a second Listen button reads the result and rationale. Students can change the speed (0.8×, 1×, 1.25×) and turn on "Read each new one" for hands-free study. The answer is never read before the student answers. Read aloud is not available in readiness exams, which keep exam conditions. Stats tab = your plan, performance by category, exam date, sign out. The floating 🧪 button is on every study screen, including during a question; students can drag it anywhere and it moves itself off buttons. Tapping it opens the Study toolkit over the current screen without losing their place: Labs & lookup (searchable normal ranges; its AI lookup also answers general NCLEX study questions) and the Help chat. The ☰ menu has Home, Readiness exams (ten standardized 85-question NCLEX-style exams with a 2h50m clock, no feedback until the end, and a readiness estimate; each exam can be taken only ONCE per account, never repeated), Plans & upgrades, Lab values, Help & contact, Tour (a guided walk through Today, adaptive practice, missed-question review, case studies, flashcards, and Stats; students can open it again anytime), Settings, Sign out. The PulseRN logo in the header is the Home button on every screen, and the ☰ menu also has night/light mode. During a question it confirms before clearing the open round; checked answers stay saved. During a readiness exam it ends and scores the exam, then goes home.
Profile & texts: Stats has a Profile card where students add their name and mobile number and can opt in to study-reminder texts and/or offer texts (each optional; reply STOP to any text to unsubscribe; msg & data rates may apply). Email is the account email.
Plans: every new account gets a free 7-day pass with full study access (no exams). Access passes are one-time payments that do not auto-renew: 30-day $99 (1 self-assessment), 60-day $159 (2), 90-day $219 (3), 180-day $319 (4), 360-day $379 (5), 730-day $439 (6). Add-ons, also one-time: 7-day renewal pass $45 (content only, never charged automatically) or an extra self-assessment $45. Refunds: if paid access has not been used, a full refund can be requested within 7 days of purchase; after 7 days, or once paid access has been used, payments are non-refundable, except where the law requires otherwise (see the Terms). Partner discount codes can be entered on the Plans page. All content is the property of the app's owner and may not be used outside PulseRN. Under any answered question: an AI tutor button and a ⚠ button for reporting a problem with the question.
Rules: help with app navigation and NCLEX study strategy; you may explain nursing concepts in an educational exam-prep register but NEVER give real-world medical or dosing advice. For account, billing, data-deletion, or anything you can't resolve, direct the user to email sheldon@pulsern.app or call 786-408-4357. Keep answers under 120 words, warm and plain. Plain text only — no markdown, no asterisks, no headers.`;

function HelpPanel({ provider, inputRef, guest = false, onGuestSignIn }) {
  const [msgs, setMsgs] = useState([]); // {role: "you"|"ai", text}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "you", text }]);
    setBusy(true);
    const transcript = [...msgs, { role: "you", text }].slice(-8)
      .map((m) => `${m.role === "you" ? "Student" : "Helper"}: ${m.text}`).join("\n");
    const prompt = `${SUPPORT_CONTEXT}\n\nConversation so far:\n${transcript}\n\nReply as Helper:`;
    // one quiet client-side retry before apologizing — the server already
    // retries + falls back models, so two layers cover transient blips
    let answered = false;
    for (let attempt = 0; attempt < 2 && !answered; attempt++) {
      try {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
        const t = await askModel(provider, prompt, 400);
        setMsgs((m) => [...m, { role: "ai", text: t }]);
        answered = true;
      } catch (e) { /* retry once */ }
    }
    if (!answered) setMsgs((m) => [...m, { role: "ai", text: "I couldn't reach the helper service just now. Try sending that again in a few seconds. For anything urgent, email sheldon@pulsern.app or call 786-408-4357." }]);
    setBusy(false);
  };

  if (guest) return (
    <div className="hp">
      <div className="help-contact">
        <p className="small"><strong>Reach a human:</strong> <a href="mailto:sheldon@pulsern.app">sheldon@pulsern.app</a> · <a href="tel:+17864084357">786-408-4357</a></p>
      </div>
      <div className="guest-ai">
        <p className="small"><strong>The study helper chat is part of your free account.</strong> It answers questions about the app and NCLEX concepts.</p>
        {onGuestSignIn && <button type="button" className="btn ghost" onClick={onGuestSignIn}>Create a free account</button>}
      </div>
    </div>
  );

  return (
    <div className="hp">
      <div className="help-contact">
        <p className="small"><strong>Reach a human:</strong> <a href="mailto:sheldon@pulsern.app">sheldon@pulsern.app</a> · <a href="tel:+17864084357">786-408-4357</a></p>
      </div>
      <div className="lab-body help-chat" aria-live="polite">
        {!msgs.length && <p className="small">Ask me anything. For example: How does readiness work? Where do I set my exam date? What's the difference between preload and afterload? Account or billing questions go to the email above.</p>}
        {msgs.map((m, i) => (
          <p key={i} className={m.role === "you" ? "chat-msg you" : "chat-msg ai"}>{m.text}</p>
        ))}
        {busy && <p className="chat-msg ai">…</p>}
      </div>
      <div className="help-input">
        <input ref={inputRef} className="select" style={{ marginTop: 0 }} placeholder="Type a question…" aria-label="Type a question for the PulseRN helper" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <button className="btn" onClick={send} disabled={busy || !input.trim()}>Send</button>
      </div>
    </div>
  );
}

/* ================= FLOATING STUDY TOOLKIT =================
   One draggable 🧪 button (src/lab-fab.jsx) on every study screen opens
   this toolkit over whatever the student is doing: lab ranges + the AI
   lookup, and the help chat. Nothing navigates and nothing unmounts, so the
   question, case step, or card underneath keeps its place and answers.
   A bottom sheet on phones, a side panel on wider screens. Escape or ✕
   closes and hands focus back to whatever opened it. */

export function Toolkit({ open, section = "labs", onSection, onClose, provider, ask = askModel, guest = false, onGuestSignIn }) {
  const asideRef = useRef(null);
  const titleRef = useRef(null);
  const returnTo = useRef(null);
  const wasOpen = useRef(false);
  const tabIds = { labs: "tk-tab-labs", help: "tk-tab-help" };
  useEffect(() => {
    if (open && !wasOpen.current) {
      returnTo.current = document.activeElement;
      requestAnimationFrame(() => titleRef.current?.focus());
    }
    if (!open && wasOpen.current) {
      const back = returnTo.current;
      const target = back && document.contains(back) && back !== document.body ? back : document.querySelector(".lab-fab");
      target?.focus?.();
    }
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    const el = asideRef.current;
    if (el) el.inert = !open;
  }, [open]);
  /* Escape closes from anywhere. Tab and Shift+Tab stay inside the
     dialog, including when focus is still on the heading. */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const next = cycleTab(tabbables(asideRef.current), document.activeElement, e.shiftKey);
      if (!next) return;
      e.preventDefault();
      next.focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  return (
    <>
      {open && <div className="lab-overlay tk-overlay" onClick={onClose} />}
      <aside ref={asideRef} className={open ? "lab-drawer toolkit open" : "lab-drawer toolkit"} role="dialog" aria-modal={open ? "true" : undefined}
        aria-hidden={!open} aria-labelledby="tk-title">
        <div className="tk-grab" aria-hidden="true" />
        <div className="tk-head">
          <div>
            <h2 id="tk-title" className="tk-title" ref={titleRef} tabIndex={-1}>Study toolkit</h2>
            <p className="tk-sub">Your place is saved. Close anytime.</p>
          </div>
          <button type="button" className="tk-close" onClick={onClose} aria-label="Close study toolkit">✕</button>
        </div>
        <div className="tk-tabs" role="tablist" aria-label="Toolkit sections" onKeyDown={(e) => {
          const tabs = [...e.currentTarget.querySelectorAll("[role='tab']")];
          const i = tabs.indexOf(e.target);
          if (i < 0) return;
          const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : null;
          const next = step == null ? (e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null) : (i + step + tabs.length) % tabs.length;
          if (next == null) return;
          e.preventDefault();
          e.stopPropagation();
          tabs[next].focus();
          tabs[next].click();
        }}>
          {[["labs", "🧪 Labs & lookup", "Normal lab and vital-sign reference ranges"], ["help", "💬 Help & contact", "Help and contact"]].map(([k, label, aria]) => (
            <button key={k} type="button" role="tab" id={tabIds[k]} aria-selected={section === k} aria-controls={`tk-panel-${k}`}
              tabIndex={section === k ? 0 : -1}
              className={section === k ? "tk-tab on" : "tk-tab"} onClick={() => onSection(k)} title={aria}>{label}</button>
          ))}
        </div>
        <div className="tk-body">
          <div id="tk-panel-labs" role="tabpanel" aria-labelledby={tabIds.labs} hidden={section !== "labs"} aria-label="Normal lab and vital-sign reference ranges">
            <LabPanel ask={ask} guest={guest} onGuestSignIn={onGuestSignIn} />
          </div>
          <div id="tk-panel-help" role="tabpanel" aria-labelledby={tabIds.help} hidden={section !== "help"} className="tk-help">
            <HelpPanel provider={provider} guest={guest} onGuestSignIn={onGuestSignIn} />
          </div>
        </div>
        <div className="tk-foot">
          <button type="button" className="tk-reset" onClick={resetLabFab}>↺ Reset 🧪 button position</button>
        </div>
      </aside>
    </>
  );
}

/* ================= TODAY (one-tap autopilot) ================= */

function Today(props) {
  const { dueCount, streak } = props;
  const [stage, setStage] = useState(() => {
    if (props.tourHold || (props.homeEpoch ?? 0) > 0) return "home";
    return props.needsFirstAnswer ? "first" : "home";
  }); // home | first | cards | quiz | done
  const homeSeen = useRef(props.homeEpoch ?? 0);
  const released = useRef(!!props.tourHold || (props.homeEpoch ?? 0) > 0);

  useEffect(() => {
    if (props.tourHold) {
      released.current = true;
      setStage("home");
      return;
    }
    if (released.current) return;
    if (props.needsFirstAnswer && stage === "home") setStage("first");
  }, [props.tourHold, props.needsFirstAnswer, stage]);

  useEffect(() => {
    if (!props.homeEpoch || props.homeEpoch === homeSeen.current) return;
    homeSeen.current = props.homeEpoch;
    released.current = true;
    setStage("home");
  }, [props.homeEpoch]);

  useEffect(() => {
    const applied = props.appliedQuizKick?.current ?? 0;
    if (!shouldApplyQuizKick({ quizKick: props.quizKick, appliedKick: applied, tourHold: props.tourHold })) return;
    props.appliedQuizKick.current = props.quizKick;
    released.current = false;
    setStage("first");
  }, [props.quizKick, props.tourHold, props.appliedQuizKick]);

  const finishFirst = () => {
    released.current = true;
    setStage("home");
  };
  const showingFirst = stage === "first" || (!!props.needsFirstAnswer && !released.current && stage === "home");

  if (props.accessPending) return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">PulseRN</p>
        <h2 className="h2">Checking your access…</h2>
        <p className="small">One moment.</p>
      </section>
    </div>
  );

  if (showingFirst) return (
    <div className="stack">
      <p className="eyebrow stage-label">Answer this to unlock Today</p>
      <p className="small">One question opens your daily plan. No need to look for a Start button.</p>
      <QBank record={props.record} log={props.log} questions={props.questions} provider={props.provider} ability={props.ability} calibration={props.calibration} missSchedule={props.missSchedule} auto autoLimit={1} preferMc onDone={finishFirst} onSession={props.onSession} onResolveLegacy={props.onResolveLegacy} cases={props.cases} onRetryCatalog={props.onRetryCatalog} />
    </div>
  );

  if (stage === "cards") return (
    <div className="stack">
      <p className="eyebrow stage-label">TODAY'S ROUND · STEP 1 OF 2 · CARDS</p>
      <Flashcards addXp={props.addXp} onGrade={props.onGrade} onUngrade={props.onUngrade} cards={props.cards} srsMap={props.srsMap} setSrsMap={props.setSrsMap} touchDay={props.touchDay} ready={props.ready} fcFlips={props.fcFlips} onFlip={props.onFlip} newAllowance={props.newAllowance} onNewCard={props.onNewCard} onRefundNewCard={props.onRefundNewCard} embedded onDone={() => setStage("quiz")} onSession={props.onSession} />
    </div>
  );

  if (stage === "quiz") return (
    <div className="stack">
      <p className="eyebrow stage-label">TODAY'S ROUND · STEP 2 OF 2 · QUESTIONS</p>
      <QBank record={props.record} log={props.log} questions={props.questions} provider={props.provider} ability={props.ability} calibration={props.calibration} missSchedule={props.missSchedule} auto onDone={() => setStage("done")} onSession={props.onSession} onResolveLegacy={props.onResolveLegacy} cases={props.cases} onRetryCatalog={props.onRetryCatalog} />
    </div>
  );

  if (stage === "done") return (
    <div className="stack">
      {props.recapProps ? (
        <RecapPanel {...props.recapProps} doneLabel="Back to Today" onDone={() => setStage("home")} />
      ) : (
        <section className="card">
          <p className="eyebrow">Round complete</p>
          <h2 className="h2">That's the whole job for today</h2>
          <button className="btn ghost" onClick={() => setStage("home")}>Back to Today</button>
        </section>
      )}
      <Why label="why stop here">Day {streak.count} locked in. The science says stop here: spacing does its work between sessions, not during them. Tomorrow, tap the same button.</Why>
      {props.showProfile && (
        <ProfileCard profile={null} setProfile={props.setProfile} prompt onDismiss={props.dismissProfileCard} />
      )}
    </div>
  );

  return (
    <div className="stack today-home">
      <section className={"card center" + tourMark(props.tourFocus, "today-round")} data-tour="today-round">
        <p className="eyebrow">One tap. The app picks what you study.</p>

        <button className="bigbtn" onClick={() => { props.beginSession?.(); setStage(dueCount ? "cards" : "quiz"); }}>▶ Start today's round</button>
        <p className="small">{dueCount ? `${dueCount} flashcard${dueCount === 1 ? "" : "s"} due` : "No cards due"} + 8 smart questions · about 10 minutes</p>
      </section>
      {props.showProfile && (
        <ProfileCard profile={null} setProfile={props.setProfile} prompt onDismiss={props.dismissProfileCard} />
      )}
      <Monitor {...props} tourFocus={props.tourFocus} />
      {Array.isArray(props.plan?.days) && props.plan.days.length > 0 && (
        <section className="card">
          <p className="eyebrow">This week's plan</p>
          {props.plan.days.map((d) => (
            <div key={d.day} className="cat-row">
              <div className="cat-top">
                <span className="small"><strong className="mono">{d.day.slice(5)}</strong> · {d.focusCat}</span>
                <span className="small mono">{d.items}q</span>
              </div>
              <p className="small note">{d.note}</p>
            </div>
          ))}
          <p className="small tip">Refreshes each week from your ability profile and exam date (set in Stats).</p>
        </section>
      )}
    </div>
  );
}

/* The recap is frozen when it opens, then its personal bests are saved once. */
function RecapPanel({ makeRecap, commitRecap, ...rest }) {
  const [recap] = useState(() => makeRecap());
  useEffect(() => { commitRecap(recap); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!recap) return null;
  return <SessionRecap recap={recap} {...rest} />;
}

/* Guests get the full rationale; the AI tutor needs an account (/api/ai
   requires a signed-in user), so it shows a gentle invitation instead. */
function GuestAiNote({ onSignIn }) {
  return (
    <div className="guest-ai">
      <p className="small"><strong>Want this explained another way?</strong> The AI tutor is part of your free account.</p>
      {onSignIn && <button type="button" className="btn ghost" onClick={onSignIn}>Create a free account to ask</button>}
    </div>
  );
}

/* ================= MONITOR (dashboard) ================= */

function Monitor({ xp, streak, bestRun, log, readiness, readyLabel, catStats, daily, dueCount, go, tourFocus, rewards, shift, career, missesOpen = 0 }) {
  const lvl = levelFor(xp);
  const weakest = catStats.filter((c) => c.pct != null).sort((a, b) => a.pct - b.pct)[0];
  const qToday = todayQuestionCount({ rewards, daily, today: todayStr() });
  const goalPct = Math.min(100, Math.round((daily.answered / DAILY_GOAL) * 100));
  return (
    <div className="stack">
      <section className={"monitor-card" + tourMark(tourFocus, "monitor")} data-tour="monitor">
        <div className="mono monitor-head">
          <span>CANDIDATE MONITOR</span>
          <span className="blink">● REC</span>
        </div>
        <Ecg />
        <div className="vitals">
          <div className="vital">
            <span className="vital-num">{readiness == null ? "--" : Math.round((readiness.low + readiness.high) / 2)}</span>
            <span className="vital-range mono">{readiness == null ? "12+ answers needed" : `range ${readiness.low}–${readiness.high}% (estimate)`}</span>
            <span className="vital-lab">READINESS (ESTIMATE)</span>
          </div>
          <div className="vital">
            <span className="vital-num">{streak.count}</span>
            <span className="vital-lab">DAY STREAK</span>
          </div>
          <div className="vital">
            {/* Questions only, the same count as the shift's Assessments (REVIEW-3 N8). */}
            <span className="vital-num">{qToday.known ? qToday.count : "—"}</span>
            <span className="vital-lab">Q TODAY</span>
          </div>
          <div className="vital">
            <span className="vital-num">{xp}</span>
            <span className="vital-lab">XP</span>
          </div>
        </div>
        <p className="monitor-note mono">{readyLabel.toUpperCase()}</p>
      </section>

      {shift && rewards ? (
        <ShiftCard shift={shift} streak={streak} rewards={rewards}>
          <Why>{shift.complete
            ? shiftCompleteNote({ missesOpen })
            : "Each task is a learning behavior: questions are retrieval practice, due cards are spacing, and fixing a miss is error correction. A streak counts days, not hours. A shield covers one missed day and refills every 7 days; a shift cover, earned by 5 shifts in a week, covers another."}</Why>
        </ShiftCard>
      ) : (
        <section className="card">
          <p className="eyebrow">Today's goal · little and often</p>
          <h2 className="h2">{daily.answered >= DAILY_GOAL ? "Goal met: spacing secured" : `${daily.answered} / ${DAILY_GOAL} questions today`}</h2>
          <div className="bar"><div className="bar-fill" style={{ width: `${goalPct}%` }} /></div>
          <p className="small tip">{streak.shield ? "Streak shield ready: one missed day won't break your streak." : "Shield used. A 7-day run restores it."}</p>
        </section>
      )}

      {career ? <CareerCard career={career} /> : (
        <section className="card">
          <p className="eyebrow">Rank</p>
          <h2 className="h2">{lvl.name}</h2>
          {lvl.next && (
            <>
              <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, (xp / lvl.next[0]) * 100)}%` }} /></div>
              <p className="small">{lvl.next[0] - xp} XP to {lvl.next[1]} · best answer run {bestRun}</p>
            </>
          )}
        </section>
      )}

      <section className="card">
        <p className="eyebrow">Today's plan</p>
        <div className="plan">
          <button className="btn ghost" onClick={() => go("qbank")}>Practice more →</button>
          <button className="btn ghost" onClick={() => go("case")}>NGN Case Study →</button>
          <button className="btn ghost" onClick={() => go("cards")}>Flashcards{dueCount ? ` (${dueCount} due)` : ""} →</button>
        </div>
        {weakest && weakest.pct < 100 && (
          <p className="small tip">Weakest area so far: <strong>{weakest.cat}</strong> ({weakest.pct}%). The QBank and Today round already serve your weaker categories more often.</p>
        )}
      </section>
    </div>
  );
}

function Ecg() {
  return (
    <svg className="ecg" viewBox="0 0 300 44" preserveAspectRatio="none" aria-hidden="true">
      <path className="ecg-line" fill="none" strokeWidth="2"
        d="M0,22 L30,22 L38,22 L42,14 L46,30 L50,22 L60,22 L66,20 L72,22 L96,22 L104,22 L108,6 L112,38 L116,22 L128,22 L134,19 L140,22 L170,22 L178,22 L182,14 L186,30 L190,22 L204,22 L210,20 L216,22 L240,22 L248,22 L252,6 L256,38 L260,22 L274,22 L280,19 L286,22 L300,22" />
    </svg>
  );
}

/* ================= QBANK ================= */

function blankAnswer(q) {
  if (q?.type === "bowtie") return { sel: { actions: [], condition: null, parameters: [] }, order: [] };
  if (q?.type === "calc") return { sel: "", order: [] };
  return { sel: [], order: [] };
}

export function QBank({ record, log, auto = false, autoLimit = null, preferMc = false, onDone, questions = QUESTIONS, provider = "claude", addQuestions, ability = {}, calibration = {}, missSchedule = {}, isOwner = false, onSession, tourFocus = null, guest = false, onGuestSignIn, onBegin, renderBreak, onResolveLegacy = null, cases = null, onRetryCatalog = null }) {
  const [diffTarget, setDiffTarget] = useState(1);
  const [calcOpen, setCalcOpen] = useState(false); // on-screen calculator
  const [q, setQ] = useState(null);
  const [sel, setSel] = useState([]);
  const [order, setOrder] = useState([]);
  const [phase, setPhase] = useState("pick"); // pick | answering | feedback | break | done
  const [nav, setNav] = useState(() => emptyNav()); // this sitting: back, next, and skips
  const justScored = useRef(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [credit, setCredit] = useState({ points: 0, max: 1 }); // NCSBN partial credit for the last answer
  const [nextReview, setNextReview] = useState(null); // review date the last answer scheduled, if any
  const [lastCat, setLastCat] = useState(null);
  const [lastRes, setLastRes] = useState(null); // XP result of the answer on screen (src/rewards.js)
  const resById = useRef({});
  const opened = useRef(new Map());
  const shownAt = useRef(0);
  const [sessionN, setSessionN] = useState(0);
  const [mode, setMode] = useState("new"); // new | review
  const [focusOpen, setFocusOpen] = useState(false); // Focus bottom sheet
  const qKeys = useRef({});
  qKeys.current = {}; // filled in below only while a question is on screen
  useStudyKeys(qKeys);

  const catalog = useMemo(
    () => (questions ?? []).map((item) => stampCatalogQuestion(item, BUNDLED_QUESTIONS)),
    [questions],
  );

  // focused practice: empty filter = everything (the adaptive default)
  const [catFilter, setCatFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState([]);
  const [popFilter, setPopFilter] = useState([]); // population focus: peds / geriatric / maternal
  const inFocus = (x) =>
    (!catFilter.length || catFilter.includes(x.cat)) &&
    (!typeFilter.length || typeFilter.includes(x.type)) &&
    (!popFilter.length || popFilter.includes(x.population));
  const toggleIn = (arr, set) => (v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const withLegacy = legacyCandidates(catalog, log, BUNDLED_QUESTIONS, cases);
  const freshPool = unseenQuestions(withLegacy, log).filter(inFocus);
  const reviewQuestions = expandTrialQuestions(withLegacy, log, BUNDLED_QUESTIONS, missSchedule);
  const resolvedLegacy = useRef(new Set());
  /* Missed questions run on a spaced-review schedule (question-review.js):
     duePool = scheduled reviews whose LOCAL date has arrived; reviewPool =
     those plus every current miss, so Review Misses still serves all misses
     on demand, due ones first. */
  const { due: dueAll, review: reviewAll } = reviewPools(reviewQuestions, log, missSchedule, todayStr());
  const duePool = dueAll.filter(inFocus);
  const reviewPool = reviewAll.filter(inFocus);
  const loadedKey = q?.catalogMiss && questionByIdentity(reviewQuestions, q.key)?.catalogMiss !== true
    && questionByIdentity(reviewQuestions, q.key)
    ? q.key
    : null;
  const unresolvedNext = q?.unresolved ? refreshedUnresolved(q, reviewAll) : null;
  const unresolvedSig = unresolvedNext && unresolvedNext !== q
    ? (unresolvedNext.candidates ?? []).map((item) => item.key ?? item.id).join("|")
    : "";
  useEffect(() => {
    if (!loadedKey) return;
    const real = questionByIdentity(reviewQuestions, loadedKey);
    if (!real || real.catalogMiss) return;
    shownAt.current = Date.now();
    setSel([]);
    setOrder([]);
    setPhase("answering");
    setQ(real);
    // The key appearing in the catalog is the change. The question object is read once then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);
  useEffect(() => {
    if (!unresolvedSig || !q?.unresolved) return;
    const next = refreshedUnresolved(q, reviewAll);
    if (next && next !== q) setQ(next);
    // The candidate list is the change. The pool is read once then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unresolvedSig]);

  const remember = (item) => {
    const id = item ? answerIdentity(item) : null;
    if (id != null) opened.current.set(String(id), item);
  };
  const reveal = (navState, knownQ) => {
    const view = present(navState);
    const question = knownQ
      ?? (view ? (questionByIdentity(reviewQuestions, view.id) ?? opened.current.get(String(view.id)) ?? null) : null);
    if (question) remember(question);
    justScored.current = false;
    if (!view || !question) { setNav(navState); setQ(null); setPhase("done"); return; }
    setNav(navState);
    setQ(question);
    if (view.mode === "review") {
      setLastRes(resById.current[answerIdentity(question)] ?? null);
      setSel(view.sel);
      setOrder(view.order ?? []);
      setWasCorrect(!!view.wasCorrect);
      setCredit(view.credit ?? { points: 0, max: 1 });
      setNextReview(view.nextReview ?? null);
      setPhase("feedback");
      return;
    }
    const blank = blankAnswer(question);
    setSel(view.sel === undefined || view.sel === null ? blank.sel : view.sel);
    setOrder(view.order ?? []);
    setWasCorrect(false);
    setCredit({ points: 0, max: 1 });
    setNextReview(null);
    setLastRes(null);
    shownAt.current = Date.now();
    setPhase("answering");
  };

  const pickFrom = (navState, poolMode) => {
    const trail = navState ?? emptyNav();
    const which = poolMode ?? (auto ? "today" : (mode === "review" ? "review" : "new"));
    /* Held questions are dropped inside sessionPool, before a due-only
       pool can hide everything else. */
    const deferred = [...resolvedLegacy.current].flatMap((id) => (
      String(id).includes(":") ? [String(id)] : [`unresolved:${id}`]
    ));
    let pool = sessionPool(reviewQuestions, {
      log, schedule: missSchedule, fresh: freshPool, mode: which, held: heldIds(trail), deferred, allow: inFocus,
    });
    if (!pool.length) {
      const fb = fallbackSkip(trail);
      const skippedId = fb ? String(currentEntry(fb)?.id ?? "") : "";
      if (fb && !deferred.includes(skippedId)) { reveal(fb); return; }
      if (auto) { onDone?.(); return; }
      setNav(trail);
      setPhase("done");
      return;
    }
    if (preferMc) {
      const mc = pool.filter((x) => x.type === "mc");
      if (mc.length) pool = mc;
    }
    /* Weak-spot targeting (weak-spots.js): choose the category first.
       Weaker categories by the ability engine's theta are chosen more often,
       never the previous category when another is available (interleaving),
       and no category is starved. Seeded, so the same state gives the same pick. */
    const rand = seededRandom(seedFrom(`${todayStr()}|${log.length}|${sessionN}|${pool.length}|${lastCat ?? ""}|${trail.entries.length}`));
    const cat = pickCategory({
      available: pool.map((x) => x.cat),
      ability,
      lastCat,
      recent: log.slice(-STARVE_WINDOW * 2).map((l) => l.cat),
      rand: rand(),
    });
    pool = pool.filter((x) => x.cat === cat);
    // Elo targeting within the category: prefer items rated nearest the
    // ~70%-success sweet spot (replaces the old diff-ladder sort).
    pool = [...pool].sort((a, b) =>
      Math.abs(itemRating(a, calibration) - pickTargetRating(ability, a.cat)) -
      Math.abs(itemRating(b, calibration) - pickTargetRating(ability, b.cat)));
    const pick = pool[Math.floor(rand() * Math.min(3, pool.length))];
    setLastCat(pick.cat);
    reveal(appendQuestion(trail, answerIdentity(pick)), pick);
  };

  /* Next on an unanswered question skips it: no log line, no schedule,
     no ability change. An answered question just moves. */
  const continueFrom = (fromNav, { fromBreak = false } = {}) => {
    const leaving = currentEntry(fromNav);
    const atEnd = fromNav.index >= fromNav.entries.length - 1;
    const gate = checkpointAfter(sessionN, {
      auto,
      fromBreak,
      atEnd,
      answered: leaving?.status === "answered",
      roundLimit: auto ? (autoLimit ?? 8) : null,
    });
    if (gate === "done") { onDone?.(); return; }
    if (gate === "break") { setPhase("break"); return; }
    const moved = forward(fromNav, { skipIfOpen: true });
    if (moved.effect.type !== "need-question") { reveal(moved.nav); return; }
    pickFrom(moved.nav);
  };

  const submit = () => {
    if (currentEntry(nav)?.status === "answered") return;
    // NCSBN-style partial credit (ngn.js); the engine gets full credit as "correct".
    const c = scoreItem(q, q.type === "order" ? order : sel);
    const ok = isFullCredit(c);
    const ident = answerIdentity(q);
    const review = updateMissSchedule(missSchedule, ident, ok)[ident]?.due ?? null;
    const marked = markAnswered(nav, { sel, order, wasCorrect: ok, credit: c, nextReview: review });
    setCredit(c);
    setWasCorrect(ok);
    setNextReview(review);
    /* recorded is the only door into stats. A skip never reaches it, and
       neither does a second look at an answer already saved. */
    if (marked.recorded) {
      const res = record(q, ok, { ms: Date.now() - shownAt.current }) ?? null;
      resById.current[ident] = res;
      setLastRes(res);
      setSessionN((n) => n + 1);
      setDiffTarget((d) => Math.max(1, Math.min(3, d + (ok ? 1 : -1))));
    }
    justScored.current = true;
    setNav(marked.nav);
    setPhase("feedback");
  };

  const endSession = () => {
    resolvedLegacy.current = new Set();
    setPhase("pick");
    setNav(emptyNav());
    setQ(null);
    setSel([]);
    setOrder([]);
  };
  const beginSitting = (poolMode) => {
    resolvedLegacy.current = new Set();
    onBegin?.();
    setMode(poolMode);
    pickFrom(emptyNav(), poolMode);
  };

  // autopilot: start immediately: due reviews first, then new questions
  useEffect(() => {
    if (auto && phase === "pick") {
      const pool = sessionPool(reviewQuestions, { log, schedule: missSchedule, fresh: freshPool, mode: "today", held: [] });
      if (pool.length) pickFrom(emptyNav(), "today"); else onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  useEffect(() => {
    if (auto && phase === "done") onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, phase]);

  /* Read aloud: the question while answering, then (separately) the result
     and rationale. The answer is never in the question's script. */
  const qSegs = useMemo(() => (q && phase === "answering" ? questionSegments(q, ngnExt(q)) : []), [q, phase]);
  const result = { correct: wasCorrect, points: credit.points, max: credit.max };
  const fbSegs = useMemo(() => (q && phase === "feedback" ? questionFeedbackSegments(q, result) : []), [q, phase, wasCorrect, credit]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Bank items (they carry a calibration) can use the AI voice; built-in
     ones use the device voice. */
  const inBank = !!(q && q.source === "bank" && calibration[q.id] !== undefined);
  const shownKey = q ? (answerIdentity(q) ?? q.id) : null;
  /* The key changes when the student moves, which stops whatever is
     playing and, with "Read each new one" on, reads the question now shown. */
  const qReader = useReadAloud(qSegs, phase === "answering" && q ? `q:${shownKey}:${nav.index}` : "off", inBank ? { kind: "question", id: q.id, part: "question" } : null);
  const fbReader = useReadAloud(fbSegs, phase === "feedback" && q ? `fb:${shownKey}:${nav.index}` : "off", inBank ? { kind: "question", id: q.id, part: "feedback", result } : null);
  useSessionReport(onSession, {
    inSession: phase === "answering" || phase === "feedback" || phase === "break",
    hasDraft: phase === "answering" && hasDraftAnswer(q, sel, order),
  });
  /* A long filter list leaves the window scrolled. A new question should
     start at the stem, below the sticky header, on a short phone. */
  useEffect(() => {
    if (phase === "answering" && q) window.scrollTo(0, 0);
  }, [shownKey, phase]);
  useLabSettleKey(q ? `${shownKey}:${phase}` : phase);

  const TYPE_CHIPS =[["mc", "Multiple choice"], ["sata", "Select all"], ["order", "Ordering"], ["matrix", "Matrix"], ["bowtie", "Bow-tie"], ["cloze", "Cloze"], ["calc", "Dosage calc"], ["highlight", "Highlight"]];

  if (auto && phase === "pick") return (
    <section className="card"><p className="eyebrow">Practice</p><p className="small">Loading a question…</p></section>
  );

  if (phase === "pick") return (
    <div className="stack">
      <section className="card">
        <div className={tourMark(tourFocus, "qbank")} data-tour="qbank">
          <p className="eyebrow">Adaptive QBank</p>
          <h2 className="h2">Computer-adaptive practice</h2>
          <p className="small">Adaptive practice: difficulty adjusts to you.</p>
        </div>
        <Why>Built on the three highest-evidence techniques: retrieval practice (every item tests recall), interleaving (categories are deliberately mixed so back-to-back questions never share a topic), and spacing (questions come in short blocks of 8 with checkpoints, and every miss comes back on a scheduled review date: tomorrow, then 3, 7, and 15 days out as you keep getting it right). Difficulty adapts like the real NCLEX-RN (a computer-adaptive test), steering toward your weakest categories: categories where your ability estimate is lower come up more often, while every category stays in the mix. NGN items earn NCSBN-style partial credit.</Why>

        <FocusBar
          open={focusOpen}
          setOpen={setFocusOpen}
          allLabel="Full adaptive mix"
          onClear={() => { setCatFilter([]); setTypeFilter([]); setPopFilter([]); }}
          groups={[
            { label: "Client-needs category", options: CATS.map((c) => [c, c]), selected: catFilter, onToggle: toggleIn(catFilter, setCatFilter) },
            { label: "Question type", options: TYPE_CHIPS, selected: typeFilter, onToggle: toggleIn(typeFilter, setTypeFilter) },
            { label: "Client population", options: [["peds", "🧒 Pediatrics"], ["geriatric", "👵 Geriatrics"], ["maternal", "🤰 Maternal"]], selected: popFilter, onToggle: toggleIn(popFilter, setPopFilter) },
          ]}
        />
        <p className="small mono">{freshPool.length} new · {reviewPool.length} to review ({duePool.length} due today) · difficulty target {diffTarget}/3</p>
        <div className={"row" + tourMark(tourFocus, "qbank-review")} data-tour="qbank-review">
          <button className="btn" onClick={() => beginSitting("new")} disabled={!freshPool.length}>{freshPool.length ? "New questions" : "All questions seen"}</button>
          <button className="btn ghost" onClick={() => beginSitting("review")} disabled={!reviewPool.length}>Review misses ({reviewPool.length})</button>
        </div>
        {addQuestions && isOwner && <Generator provider={provider} addQuestions={addQuestions} log={log} questions={catalog} lowOnNew={freshPool.length < 5} />}

        {!freshPool.length && !reviewPool.length && <p className="small tip">Bank cleared with every miss corrected. That's mastery. Check Stats, then keep the flashcard schedule alive.</p>}
      </section>
    </div>
  );

  if (phase === "break" && renderBreak) return (
    <div className="stack">
      {renderBreak({ onMore: () => continueFrom(nav, { fromBreak: true }), onEnd: endSession })}
      <Why label="why a checkpoint after 8">Distributed practice beats marathons: the same study minutes spread across days retain dramatically more than one long push. If you stop here, review again within 24 hours, then at 3 and 7 days. Your flashcard queue, your missed-question reviews, and your day streak track that schedule for real.</Why>
    </div>
  );

  if (phase === "break") return (
    <section className="card">
      <p className="eyebrow">Spacing checkpoint</p>
      <h2 className="h2">Block complete: 8 questions</h2>
      <p className="small">Distributed practice beats marathons: the same study minutes spread across days retain dramatically more than one long push. If you stop here, review again within 24 hours, then at 3 and 7 days. Your flashcard queue, your missed-question reviews, and your day streak track that schedule for real.</p>
      <div className="row">
        <button className="btn ghost" onClick={() => continueFrom(nav, { fromBreak: true })}>One more block →</button>
        <button className="btn" onClick={endSession}>End session</button>
      </div>
    </section>
  );

  if (phase === "done" || !q) return (
    <section className="card"><h2 className="h2">{mode === "review" ? "Review pool cleared" : "No new questions left"}</h2><p className="small">{mode === "review" ? "Every missed question has been re-answered correctly, and nothing else is due. Each one returns on its next review date. Corrected errors are some of the strongest memories you'll form." : "You've seen the whole bank. Switch to Review misses to close remaining gaps."}</p>
      <button className="btn" onClick={endSession}>Back to session menu</button></section>
  );

  const continuePastHeld = () => {
    if (!auto) { endSession(); return; }
    const moved = forward(nav, { skipIfOpen: true });
    if (moved.effect.type !== "need-question") { reveal(moved.nav); return; }
    pickFrom(moved.nav);
  };

  if (q.catalogMiss) {
    return (
      <section className="card">
        <p className="eyebrow">Saved miss</p>
        <h2 className="h2">This question didn't load</h2>
        <p className="small">{q.stem}</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => onRetryCatalog?.()}>Retry</button>
          <button type="button" className="btn ghost" onClick={() => { resolvedLegacy.current.add(String(q.key)); continuePastHeld(); }}>Leave for now</button>
        </div>
      </section>
    );
  }

  if (q.unresolved) {
    const resume = continuePastHeld;
    const choose = (candidate) => {
      resolvedLegacy.current.add(String(q.legacyId));
      onResolveLegacy?.(q.legacyId, candidate, q.logIndex);
      resume();
    };
    return (
      <section className="card">
        <p className="eyebrow">Unresolved review</p>
        <h2 className="h2">Which question was this?</h2>
        <p className="small">{q.stem}</p>
        <div className="stack">
          {(q.candidates ?? []).map((candidate) => (
            <button type="button" className="btn" key={answerIdentity(candidate) ?? candidate.id} onClick={() => choose(candidate)}>
              {candidate.source === "bank" ? "Bank question" : candidate.source === "builtin" ? "Built-in question" : candidate.source === "case" ? "Case step" : "Question"}: {candidate.stem}
            </button>
          ))}
          <button type="button" className="btn ghost" onClick={() => { resolvedLegacy.current.add(String(q.legacyId)); resume(); }}>Leave unresolved</button>
        </div>
      </section>
    );
  }

  const ext = ngnExt(q); // NGN payloads: rows/columns/actions/conditions/parameters/dropdowns
  const toggleSel = (i) => {
    if (phase !== "answering") return;
    if (q.type === "mc") setSel([i]);
    else if (q.type === "sata" || q.type === "highlight") setSel((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i]);
  };
  const toggleOrder = (i) => {
    if (phase !== "answering") return;
    setOrder((o) => o.includes(i) ? o.filter((x) => x !== i) : [...o, i]);
  };
  const setMatrixRow = (row, col) => {
    if (phase !== "answering") return;
    setSel((s) => { const n = [...s]; n[row] = col; return n; });
  };
  const setClozeGap = (gap, opt) => {
    if (phase !== "answering") return;
    setSel((s) => { const n = [...s]; n[gap] = opt; return n; });
  };
  const toggleBowtie = (slot, i, cap) => {
    if (phase !== "answering") return;
    setSel((s) => {
      if (slot === "condition") return { ...s, condition: s.condition === i ? null : i };
      const cur = s[slot] ?? [];
      if (cur.includes(i)) return { ...s, [slot]: cur.filter((x) => x !== i) };
      if (cur.length >= cap) return s; // per-column cap
      return { ...s, [slot]: [...cur, i] };
    });
  };

  const canSubmit =
    q.type === "order" ? order.length === q.options.length :
    q.type === "matrix" ? ext.rows.every((_, i) => Number.isInteger(sel[i])) :
    q.type === "bowtie" ? (sel.actions?.length === 2 && Number.isInteger(sel.condition) && sel.parameters?.length === 2) :
    q.type === "cloze" ? ext.dropdowns.every((_, i) => Number.isInteger(sel[i])) :
    q.type === "calc" ? Number.isFinite(parseFloat(String(sel).replace(/,/g, "").trim())) :
    sel.length > 0;

  const TYPE_LABEL = {
    mc: "MULTIPLE CHOICE", sata: "SELECT ALL", order: "ORDERED",
    matrix: "MATRIX", bowtie: "BOW-TIE", cloze: "CLOZE (DROPDOWNS)", calc: "DOSAGE CALC", highlight: "HIGHLIGHT",
  };

  const draftedNav = () => (phase === "answering" ? saveDraft(nav, { sel, order }) : nav);
  const onBack = () => {
    const from = draftedNav();
    if (!canGoBack(from)) return;
    reveal(goBack(from));
  };
  const onReviewSkipped = () => {
    const from = draftedNav();
    const jumped = jumpToSkipped(from);
    if (jumped.index === from.index) { setNav(from); return; }
    reveal(jumped);
  };
  const onMove = () => continueFrom(draftedNav());
  const atEnd = nav.index >= 0 && nav.index === nav.entries.length - 1;
  const finishing = autoLimit != null && currentEntry(nav)?.status === "answered" && atEnd && sessionN >= autoLimit;
  const locked = phase !== "answering";
  qKeys.current = {
    back: onBack,
    next: onMove,
    primary: () => { if (phase === "answering") { if (canSubmit) submit(); } else onMove(); },
    pick: (i) => { if (phase === "answering" && digitPickEnabled(q.type) && (q.type === "highlight" ? i < ext.tokens.length : i < q.options.length)) toggleSel(i); },
  };

  return (
    <div className="stack study-col">
      <section className="card">
        <div className="q-meta mono">
          <span>{q.cat.toUpperCase()}{mode === "review" ? " · RETRY" : ""}</span>
          <span className={ra(qReader, "instruction")}>{"▲".repeat(q.diff)}{"△".repeat(3 - q.diff)} · {TYPE_LABEL[q.type] ?? "MULTIPLE CHOICE"}</span>
        </div>
        {phase === "answering" && <ReadAloudBar reader={qReader} label="Listen to the question" />}
        {phase === "answering" && qReader.available && (
          <Why label="how listening helps">Follow the highlighted words while you listen: hearing and reading the same words together helps many learners stay focused on long stems. The answer is never read out. Choose yours first, then listen to the explanation, because the effort of answering is what builds the memory. Slow it to 0.8× for dense items, and turn on "Read each new one" for hands-free practice.</Why>
        )}
        <ExhibitVisual spec={ext.visual} />
        <ExhibitTabs tabs={ext.exhibit} reader={qReader} />

        {q.type === "cloze" ? (
          <p className={ra(qReader, "stem", "stem")}>
            {q.stem.split(/\{(\d+)\}/).map((part, idx) => {
              if (idx % 2 === 0) return <span key={idx}>{part}</span>;
              const gap = Number(part);
              return (
                <select key={idx} className={ra(qReader, `gap${gap}`, "cloze-dd")}
                  value={Number.isInteger(sel[gap]) ? sel[gap] : ""}
                  disabled={phase !== "answering"}
                  onChange={(e) => setClozeGap(gap, Number(e.target.value))}>
                  <option value="" disabled>Select…</option>
                  {ext.dropdowns[gap].map((o, oi) => <option key={oi} value={oi}>{o}</option>)}
                </select>
              );
            })}
          </p>
        ) : (
          <p className={ra(qReader, "stem", "stem")}>{q.stem}</p>
        )}

        {q.type === "highlight" && (
          <div className="hl-box" role="group" aria-label="Tap each finding to highlight it">
            {ext.tokens.map((t, i) => {
              let cls = ra(qReader, `tok${i}`, "hl-token");
              if (sel.includes(i)) cls += " picked";
              if (phase === "feedback") {
                if (q.answer.includes(i)) cls += " right";
                else if (sel.includes(i)) cls += " wrong";
              }
              return <button key={i} type="button" className={cls} disabled={locked} onClick={() => toggleSel(i)}>{t}</button>;
            })}
          </div>
        )}

        {q.type === "matrix" && (
          <div className="ngn-matrix" role="group" aria-label="Answer grid: one choice per row">
            <div className="mx-row mx-head" style={{ gridTemplateColumns: `2fr repeat(${ext.columns.length}, 1fr)` }}>
              <span />
              {ext.columns.map((c, ci) => <span key={ci} className="small mono mx-colhead">{c}</span>)}
            </div>
            {ext.rows.map((r, ri) => (
              <div key={ri} role="radiogroup" aria-label={r} className={ra(qReader, `row${ri}`, "mx-row")} style={{ gridTemplateColumns: `2fr repeat(${ext.columns.length}, 1fr)` }}>
                <span className="small">
                  {phase === "feedback" && <strong>{sel[ri] === q.answer[ri] ? "✓ " : "✗ "}</strong>}{r}
                </span>
                {ext.columns.map((c, ci) => {
                  let cls = "mx-cell";
                  if (sel[ri] === ci) cls += " picked";
                  if (phase === "feedback") {
                    if (q.answer[ri] === ci) cls += " right";
                    else if (sel[ri] === ci) cls += " wrong";
                  }
                  return (
                    <button key={ci} type="button" className={cls} disabled={locked} onClick={() => setMatrixRow(ri, ci)} aria-label={`${r}: ${c}`}
                      role="radio" aria-checked={sel[ri] === ci} onKeyDown={onRadioKeyDown}
                      tabIndex={radioTabIndex(sel[ri] === ci, ci, Number.isInteger(sel[ri]))}>
                      <span className="ck radio mx-ck" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {q.type === "bowtie" && (
          <div className="bt-cols">
            {[
              { slot: "actions", label: "Actions to take · pick 2", items: ext.actions, cap: 2, picked: sel.actions ?? [], keyed: q.answer.actions },
              { slot: "condition", label: "Condition · pick 1", items: ext.conditions, cap: 1, picked: Number.isInteger(sel.condition) ? [sel.condition] : [], keyed: [q.answer.condition] },
              { slot: "parameters", label: "Parameters to monitor · pick 2", items: ext.parameters, cap: 2, picked: sel.parameters ?? [], keyed: q.answer.parameters },
            ].map((col) => (
              <div key={col.slot} className={ra(qReader, `bt-${col.slot}`, "bt-col")}>
                <p className="small mono bt-label">{col.label.toUpperCase()}</p>
                {col.items.map((it, i) => {
                  let cls = "opt bt-opt";
                  if (col.picked.includes(i)) cls += " picked";
                  if (phase === "feedback") {
                    if (col.keyed.includes(i)) cls += " right";
                    else if (col.picked.includes(i)) cls += " wrong";
                  }
                  return <button key={i} type="button" className={cls} disabled={locked} onClick={() => toggleBowtie(col.slot, i, col.cap)}>{it}</button>;
                })}
              </div>
            ))}
          </div>
        )}

        {q.type === "calc" && (
          <>
            <div className="calc-box row" style={{ alignItems: "center" }}>
              <input className="select calc-input" type="text" inputMode="decimal" autoComplete="off"
                placeholder="Enter the number" aria-label="Numeric answer"
                value={typeof sel === "string" ? sel : ""} disabled={phase !== "answering"}
                onChange={(e) => setSel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSubmit && phase === "answering") submit(); }} />
              <span className="mono calc-unit">{ext.unit}</span>
            </div>
            {phase === "answering" && (
              <>
                <button className="btn ghost tutor-btn" onClick={() => setCalcOpen((o) => !o)}>
                  {calcOpen ? "Hide calculator" : "🧮 Open calculator"}
                </button>
                {calcOpen && <Calculator onUse={(v) => setSel(v)} />}
              </>
            )}
          </>
        )}

        {["mc", "sata", "order"].includes(q.type) && (
        <div className="opts" role={q.type === "mc" ? "radiogroup" : q.type === "sata" ? "group" : undefined} aria-label={q.type === "order" ? undefined : "Answer choices"}>
          {q.options.map((opt, i) => {
            let cls = ra(qReader, `opt${i}`, "opt");
            if (q.type !== "order") {
              const st = choiceState({ type: q.type, answer: q.answer, sel, index: i, checked: phase === "feedback" });
              cls += choiceClasses(st);
              const multi = q.type === "sata";
              return (
                <button key={i} type="button" className={cls} disabled={locked} onClick={() => toggleSel(i)}
                  role={multi ? "checkbox" : "radio"} aria-checked={sel.includes(i)}
                  onKeyDown={multi ? undefined : onRadioKeyDown}
                  tabIndex={multi ? undefined : radioTabIndex(sel.includes(i), i, sel.length > 0)}>
                  <span className={multi ? "ck" : "ck radio"} aria-hidden="true">{st === "wrong" ? "✗" : multi && sel.includes(i) ? "✓" : ""}</span>
                  <span className="opt-text">{opt}{CHOICE_BADGE[st] && <span className="st-badge">{CHOICE_BADGE[st]}</span>}</span>
                </button>
              );
            }
            const pos = order.indexOf(i);
            if (pos !== -1) cls += " picked";
            if (phase === "feedback") {
              if (q.answer[order.indexOf(i)] === i && order.indexOf(i) !== -1) cls += " right";

              else if (order.indexOf(i) !== -1) cls += " wrong";
            }
            return <button key={i} type="button" className={cls} disabled={locked} onClick={() => toggleOrder(i)}>{pos !== -1 ? <span className="ord mono">{pos + 1}</span> : <span className="ord mono dim">·</span>}{opt}</button>;
          })}
        </div>
        )}

        {phase === "answering" && currentEntry(nav)?.status === "skipped" && (
          <p className="small tip">Skipped. It stays out of your score until you answer it.</p>
        )}
        {phase === "answering" && (
          <div className="row">
            <button className="btn" disabled={!canSubmit} onClick={submit}>Check answer</button>
          </div>
        )}
        {phase === "answering" && <p className="small tip kbd-hint">{shortcutHint(q.type)}</p>}

        {phase === "feedback" && (
          <div className={wasCorrect ? "feedback ok" : "feedback no"}>
            <p className={ra(fbReader, "verdict", "fb-head mono")}>
              <span className="fb-badge" aria-hidden="true">{wasCorrect ? "✓" : credit.points > 0 ? "½" : "✗"}</span>
              {wasCorrect ? `CORRECT${credit.max > 1 ? ` · ${credit.points}/${credit.max} POINTS` : ""}${lastRes ? (xpNote(lastRes) ? ` · ${xpNote(lastRes).toUpperCase()}` : "") : ` · +${10 * q.diff} XP`}`
                : credit.points > 0 ? `PARTIAL CREDIT · ${credit.points}/${credit.max} POINTS · IT RETURNS IN REVIEW MISSES`
                : `INCORRECT${credit.max > 1 ? ` · 0/${credit.max} POINTS` : ""} · IT RETURNS IN REVIEW MISSES`}
            </p>
            {wasCorrect && justScored.current && <EcgBeat className="fb" />}
            {justScored.current && lastRes && <ComboChip combo={lastRes.combo} newBest={lastRes.newBest} />}
            {nextReview && (
              <p className="small mono">Next review: {nextReview === addDays(1) ? "tomorrow" : nextReview}</p>
            )}
            {q.type === "order" && !wasCorrect && (
              <p className={ra(fbReader, "correction", "small")}><strong>Correct order:</strong> {q.answer.map((i) => q.options[i]).join(" → ")}</p>
            )}
            {q.type === "cloze" && !wasCorrect && (
              <p className={ra(fbReader, "correction", "small")}><strong>Correct choices:</strong> {q.answer.map((a, i) => ext.dropdowns[i][a]).join(" · ")}</p>
            )}
            {q.type === "calc" && (
              <p className="small"><strong>{wasCorrect ? "Answer:" : "Correct answer:"}</strong> {q.answer} {ext.unit}{!wasCorrect && ` (you entered ${String(sel).trim() || "nothing"})`}</p>
            )}
            {q.type === "calc" && Array.isArray(ext.work) && ext.work.length > 0 && (
              <div className="calc-work">
                <p className="small" style={{ marginBottom: 4 }}><strong>Show the work:</strong></p>
                {ext.work.map((line, i) => <p key={i} className="mono calc-work-line">{line}</p>)}
              </div>
            )}
            {q.type === "highlight" && !wasCorrect && (
              <p className="small"><strong>Should be highlighted:</strong> {q.answer.map((i) => ext.tokens[i]).join(" · ")}</p>
            )}
            <ReadAloudBar reader={fbReader} label="Listen to the explanation" />
            <p className={ra(fbReader, "rationale", "rationale")}><strong>Rationale.</strong> {q.rationale}</p>
            {q.ai && q.source === "bank" && <p className="small">{calibration[q.id] !== undefined ? "✨ AI-assisted practice item that passed automated quality checks." : "✨ AI-assisted practice item."}</p>}
            {/* Astra-confirmed concept diagrams for this exact question (if any) */}
            <ConceptExplainers key={`dx${shownKey}`} q={q} />
            {guest
              ? <GuestAiNote onSignIn={onGuestSignIn} />
              : <TutorExplain key={shownKey} q={q} wasCorrect={wasCorrect} provider={provider} isBank={inBank} />}
            <ReportIssue key={`r${shownKey}`} itemId={inBank ? q.id : null} label="question" />
            {nav.index < nav.entries.length - 1 && !justScored.current && (
              <p className="small tip">Answered earlier. This result is not scored again.</p>
            )}
          </div>
        )}
        <QuestionNav
          canBack={canGoBack(nav)}
          skipped={skippedCount(nav)}
          onBack={onBack}
          onSkip={onMove}
          onNext={onMove}
          onReview={onReviewSkipped}
          nextLabel={finishing ? "Continue" : "Next"}
          nextAria={finishing ? "Continue to Today" : "Next question"}
          nextPrimary={phase === "feedback"}
          skipAria={currentEntry(nav)?.status === "answered" ? "Leave this answer and move on" : "Skip this question without scoring it"}
        />
      </section>
    </div>
  );
}
/* ================= CASE STUDY ================= */

export function CaseStudy({ record, provider = "claude", cases = CASE_STUDIES, onSession, tourFocus = null }) {
  const [caseIdx, setCaseIdx] = useState(null); // null = case picker
  const [catFilter, setCatFilter] = useState([]);
  const [step, setStep] = useState(-1);
  const [sel, setSel] = useState([]);
  const [phase, setPhase] = useState("read");
  const [stepScores, setStepScores] = useState({}); // step index -> { points, max }; skips are absent
  const [stepRes, setStepRes] = useState(null); // XP result of the step just answered
  const stepXp = useRef({}); // remembered per step so walking back shows the XP that was actually awarded
  const stepShownAt = useRef(Date.now()); // when the open step appeared (XP reading-time floor)
  const [credit, setCredit] = useState({ points: 0, max: 1 });
  const [ok, setOk] = useState(false);
  const [nav, setNav] = useState(() => emptyNav());
  const justScored = useRef(false);
  const [chartOpen, setChartOpen] = useState(false); // sticky patient chart (phone: collapsed bar)
  const cKeys = useRef({});
  cKeys.current = {};
  useStudyKeys(cKeys);
  const cs = caseIdx == null ? null : cases[caseIdx];
  /* Bank cases carry a dbId; locally-bundled ones don't, so fall back to the
     title, which carries a unique index in migration 005. */
  const caseKey = cs ? (cs.dbId ?? cs.title) : null;
  const scoreRows = cs ? cs.steps.map((_, i) => stepScores[i]).filter(Boolean) : [];
  const total = sumScores(scoreRows);

  const showCase = (navState) => {
    const view = present(navState);
    justScored.current = false;
    setNav(navState);
    if (!view) { setStep(-1); setPhase("read"); return; }
    setStep(view.id);
    if (view.mode === "review") {
      setSel(view.sel ?? []);
      setOk(!!view.wasCorrect);
      setCredit(view.credit ?? { points: 0, max: 1 });
      setPhase("feedback");
      return;
    }
    setSel(view.sel ?? []);
    stepShownAt.current = Date.now();
    setPhase("answering");
  };

  const openCase = (i) => {
    setCaseIdx(i); setStep(-1); setPhase("read"); setStepScores({}); setSel([]); setNav(emptyNav());
  };
  const start = () => showCase(appendQuestion(emptyNav(), 0));
  const s = cs?.steps[step];
  /* Case-step log ids are strings, so they can never collide with a
     numeric shared-bank question id (repeat detection and XP stay exact). */
  const stepIds = cs ? caseStepIds({ dbId: cs.dbId ?? null, key: cs.key ?? null, title: cs.title, index: caseIdx, step }) : { id: "case-none", aliases: [] };
  const stepId = stepIds.id;

  const submit = () => {
    if (currentEntry(nav)?.status === "answered") return;
    // NCSBN-style partial credit: mc 0/1, select-all +/- with a floor of 0.
    const c = scoreCaseStep(s, sel);
    const correct = isFullCredit(c); // engine/XP outcome = full credit, so calibration is unchanged
    const marked = markAnswered(nav, { sel, order: [], wasCorrect: correct, credit: c, nextReview: null });
    setOk(correct);
    setCredit(c);
    if (marked.recorded) {
      setStepScores((m) => ({ ...m, [step]: c }));
      const scored = record({ id: stepId, aliases: stepIds.aliases, legacyAliases: stepIds.legacyAliases, source: "case", cat: cs.cat, diff: 3, stem: s?.stem }, correct, { schedule: false, ms: Date.now() - stepShownAt.current }) ?? null;
      stepXp.current[stepId] = scored;
      setStepRes(scored);
    }
    justScored.current = true;
    setNav(marked.nav);
    setPhase("feedback");
  };

  const moveCase = (fromNav) => {
    const moved = forward(fromNav, { skipIfOpen: true });
    if (moved.effect.type === "restore" || moved.effect.type === "requeue") { showCase(moved.nav); return; }
    const id = nextUnvisited(moved.nav, cs.steps.map((_, i) => i));
    if (id != null) { showCase(appendQuestion(moved.nav, id)); return; }
    const fb = fallbackSkip(moved.nav);
    if (fb) { showCase(fb); return; }
    setNav(moved.nav);
    setPhase("done");
  };
  const draftedCase = () => (phase === "answering" ? saveDraft(nav, { sel, order: [] }) : nav);
  const onCaseBack = () => {
    const from = draftedCase();
    if (!canGoBack(from)) return;
    showCase(goBack(from));
  };
  const onCaseReview = () => {
    const from = draftedCase();
    const jumped = jumpToSkipped(from);
    if (jumped.index === from.index) { setNav(from); return; }
    showCase(jumped);
  };
  const onCaseMove = () => moveCase(draftedCase());
  const caseUnvisited = cs ? nextUnvisited(nav, cs.steps.map((_, i) => i)) : null;
  const caseFinishing = currentEntry(nav)?.status === "answered"
    && nav.index === nav.entries.length - 1
    && caseUnvisited == null
    && !fallbackSkip(nav);

  /* Read aloud: the chart once, each step's question, each step's result. */
  const introSegs = useMemo(() => (cs && step === -1 ? caseIntroSegments(cs) : []), [cs, step]);
  const stepSegs = useMemo(() => (s && phase === "answering" ? caseStepSegments(s) : []), [s, phase]);
  const stepResult = { correct: ok, points: credit.points, max: credit.max };
  const caseFbSegs = useMemo(() => (s && phase === "feedback" ? caseFeedbackSegments(s, stepResult) : []), [s, phase, ok, credit]); // eslint-disable-line react-hooks/exhaustive-deps
  const caseRef = (part, extra = {}) => (cs?.dbId ? { kind: "case", id: cs.dbId, part, ...extra } : null);
  const introReader = useReadAloud(introSegs, cs && step === -1 ? `case:${caseKey}` : "off", caseRef("intro"));
  const stepReader = useReadAloud(stepSegs, s && phase === "answering" ? `cstep:${caseKey}:${step}` : "off", caseRef("step", { step }));
  const caseFbReader = useReadAloud(caseFbSegs, s && phase === "feedback" ? `cfb:${caseKey}:${step}` : "off", caseRef("feedback", { step, result: stepResult }));
  useSessionReport(onSession, {
    inSession: caseIdx != null,
    hasDraft: phase === "answering" && Array.isArray(sel) && sel.length > 0,
  });
  useLabSettleKey(cs ? `${caseKey}:${step}:${phase}` : "cases");

  if (caseIdx == null) {
    // sub-category accordion: cases stay tucked away until a group is opened
    const groups = [
      { key: "🧒 Pediatrics", match: (c) => c.population === "peds" },
      { key: "🤰 Maternal & Newborn", match: (c) => c.population === "maternal" },
      { key: "👵 Geriatrics", match: (c) => c.population === "geriatric" },
      ...CATS.map((cat) => ({ key: cat, match: (c) => c.cat === cat })),
    ].map((g) => ({ ...g, items: cases.map((c, i) => ({ c, i })).filter(({ c }) => g.match(c)) }))
     .filter((g) => g.items.length > 0);
    const openGroup = groups.find((g) => g.key === catFilter[0]);
    const list = openGroup ? openGroup.items : cases.map((c, i) => ({ c, i }));
    return (
      <div className="stack">
        <section className={"card" + tourMark(tourFocus, "cases")} data-tour="cases">
          <p className="eyebrow">Next Generation NCLEX</p>
          <h2 className="h2">Case studies · {cases.length} in the library</h2>
          <p className="small">Full clinical-judgment cases: read the chart, then work the NCJMM steps (recognize cues, analyze cues, prioritize hypotheses, generate solutions, take action, evaluate outcomes). Each step is scored with NCSBN-style partial credit: select-all steps earn a point for each correct choice and lose one for each incorrect choice, never below zero.</p>
          <p className="small tip">Every case is listed below. Tap a sub-category to narrow the list.</p>
          <div className="fchips scroll" role="group" aria-label="Case sub-categories">
            {groups.map((g) => (
              <button key={g.key} className={catFilter[0] === g.key ? "fchip on" : "fchip"} aria-pressed={catFilter[0] === g.key}
                onClick={() => setCatFilter((f) => (f[0] === g.key ? [] : [g.key]))}>{g.key} · {g.items.length}</button>
            ))}
          </div>
        </section>
        {list.map(({ c, i }) => (
          <section key={c.title} className="card">
            <p className="eyebrow">{c.cat}</p>
            <h2 className="h2">{c.title}</h2>
            <p className="small">{c.blurb}</p>
            <p className="small mono">{c.steps.length} steps</p>
            <button className="btn" onClick={() => openCase(i)}>Open case →</button>
          </section>
        ))}
      </div>
    );
  }

  const pickCase = (i) => {
    if (phase !== "answering" || !s || !digitPickEnabled(s.type) || i >= (s.options?.length ?? 0)) return;
    if (s.type === "mc") setSel([i]);
    else setSel((x) => x.includes(i) ? x.filter((y) => y !== i) : [...x, i]);
  };
  if (step >= 0 && s) {
    cKeys.current = {
      back: onCaseBack,
      next: onCaseMove,
      primary: () => { if (phase === "answering") { if (sel.length) submit(); } else if (phase === "feedback") onCaseMove(); },
      pick: pickCase,
    };
  }
  const chartSummary = cs.vitals.slice(0, 3).map(([k, v]) => `${k} ${v}`).join(" · ");
  const aiCaseNote = cs.ai ? (
    <p className="small case-ai-note">✨ AI-assisted case that passed automated quality checks. Verify it against your course materials.</p>
  ) : null;
  const chartBody = (
    <>
      <div className="q-meta mono">
        <span>{cs.cat.toUpperCase()}</span>
        <button className="auth-switch mono" style={{ color: "var(--accent-ink)", fontSize: 12, minHeight: 44, padding: "0 6px" }} onClick={() => setCaseIdx(null)}>← ALL CASES</button>
      </div>
      <p className="h2" style={{ fontSize: 17 }}>{cs.title}</p>
      <p className="small">{cs.intro}</p>
      <div className="chart mono">
        {cs.vitals.map(([k, v]) => <span key={k} className="chip">{k} {v}</span>)}
        {cs.labs.map(([k, v]) => <span key={k} className="chip lab">{k} {v}</span>)}
      </div>
      <p className="small note">Nurse's note: {cs.note}</p>
    </>
  );

  return (
    <div className={step >= 0 ? "stack case-layout" : "stack study-col"}>
      {step >= 0 ? (
        <div className={chartOpen ? "case-chart-bar open" : "case-chart-bar"}>
          {aiCaseNote}
          <button type="button" className="case-chart-toggle" aria-expanded={chartOpen} onClick={() => setChartOpen((o) => !o)}>
            <span aria-hidden="true">📋</span> Chart <span className="case-chart-sum">{chartSummary}</span>
            <span aria-hidden="true">{chartOpen ? "▴" : "▾"}</span>
          </button>
          <ReportIssue key={`rc${caseKey}`} caseId={cs.dbId ?? null} label="case study" />
          <div className="case-chart-body">{chartBody}</div>
        </div>
      ) : (
      <section className="card">
        <div className="q-meta mono">
          <span>{cs.cat.toUpperCase()}</span>
          <button className="auth-switch mono" style={{ color: "var(--accent-ink)", fontSize: 12, minHeight: 44, padding: "0 6px" }} onClick={() => setCaseIdx(null)}>← ALL CASES</button>
        </div>
        <h2 className={ra(introReader, "case-title", "h2")}>{cs.title}</h2>
        {step === -1 && <ReadAloudBar reader={introReader} label="Listen to the case" />}

        <p className={ra(introReader, "case-intro", "small")}>{cs.intro}</p>
        <div className={ra(introReader, "case-chart", "chart mono")}>
          {cs.vitals.map(([k, v]) => <span key={k} className="chip">{k} {v}</span>)}
          {cs.labs.map(([k, v]) => <span key={k} className="chip lab">{k} {v}</span>)}
        </div>
        <p className={ra(introReader, "case-note", "small note")}>Nurse's note: {cs.note}</p>
        {aiCaseNote}
        <ReportIssue key={`rc${caseKey}`} caseId={cs.dbId ?? null} label="case study" />
        {step === -1 && <button className="btn" onClick={start}>Begin case →</button>}
      </section>
      )}

      <div className="stack case-main">
      {step >= 0 && phase !== "done" && (
        <section className="card case-step">
          <div className="step-progress" aria-hidden="true">
            {cs.steps.map((_, i) => <span key={i} className={i === step ? "now" : stepScores[i] ? "done" : ""} />)}
          </div>
          <p className={ra(stepReader, "instruction", "eyebrow case-step-head")}>Step {step + 1} of {cs.steps.length} · {s.phase}</p>
          {phase === "answering" && <ReadAloudBar reader={stepReader} label="Listen to this step" />}
          <p className={ra(stepReader, "stem", "stem")}>{s.stem}</p>
          <div className="opts" role={s.type === "sata" ? "group" : "radiogroup"} aria-label="Answer choices">
            {s.options.map((opt, i) => {
              const st = choiceState({ type: s.type, answer: s.answer, sel, index: i, checked: phase === "feedback" });
              const cls = ra(stepReader, `opt${i}`, "opt case-opt") + choiceClasses(st);
              const multi = s.type === "sata";
              return (
                <button key={i} type="button" className={cls} disabled={phase !== "answering"} onClick={() => pickCase(i)}
                  role={multi ? "checkbox" : "radio"} aria-checked={sel.includes(i)}
                  onKeyDown={multi ? undefined : onRadioKeyDown}
                  tabIndex={multi ? undefined : radioTabIndex(sel.includes(i), i, sel.length > 0)}>
                  <span className={multi ? "ck" : "ck radio"} aria-hidden="true">{st === "wrong" ? "✗" : multi && sel.includes(i) ? "✓" : ""}</span>
                  <span className="opt-text">{opt}{CHOICE_BADGE[st] && <span className="st-badge">{CHOICE_BADGE[st]}</span>}</span>
                </button>
              );
            })}
          </div>
          {phase === "feedback" && s.type === "sata" && (
            <p className="choice-legend" aria-hidden="true"><span className="lg-ok">✓ picked, correct</span><span className="lg-miss">▭ missed</span><span className="lg-wrong">✗ picked, incorrect</span></p>
          )}
          {phase === "answering" && currentEntry(nav)?.status === "skipped" && (
            <p className="small tip">Skipped. It stays out of your score until you answer it.</p>
          )}
          {phase === "answering" && <button className="btn" disabled={!sel.length} onClick={submit}>Check answer</button>}
          {phase === "answering" && <p className="small tip kbd-hint">{shortcutHint(s.type)}</p>}
          {phase === "feedback" && (
            <div className={ok ? "feedback ok" : "feedback no"}>
              <p className={ra(caseFbReader, "verdict", "fb-head mono")}>
                <span className="fb-badge" aria-hidden="true">{ok ? "✓" : credit.points > 0 ? "½" : "✗"}</span>
                {ok ? "CORRECT" : credit.points > 0 ? "PARTIAL CREDIT" : "INCORRECT"} · {credit.points}/{credit.max} POINT{credit.max === 1 ? "" : "S"}{ok && stepXp.current[stepId] && xpNote(stepXp.current[stepId]) ? ` · ${xpNote(stepXp.current[stepId]).toUpperCase()}` : ""}
              </p>
              <p className="small mono">Case score so far: {total.points}/{total.max} points</p>
              <ReadAloudBar reader={caseFbReader} label="Listen to the explanation" />
              <p className={ra(caseFbReader, "rationale", "rationale")}><strong>Rationale.</strong> {s.rationale}</p>
              <TutorExplain key={`${caseIdx}-${step}`} q={{ ...s, id: 100 + caseIdx * 10 + step }} wasCorrect={ok} provider={provider} isBank={false} />
              {nav.index < nav.entries.length - 1 && !justScored.current && (
                <p className="small tip">Answered earlier. This result is not scored again.</p>
              )}
            </div>
          )}
          <QuestionNav
            canBack={canGoBack(nav)}
            skipped={skippedCount(nav)}
            onBack={onCaseBack}
            onSkip={onCaseMove}
            onNext={onCaseMove}
            onReview={onCaseReview}
            nextLabel={caseFinishing ? "Finish" : "Next"}
            nextAria={caseFinishing ? "Finish case" : "Next step"}
            nextPrimary={phase === "feedback"}
            skipAria={currentEntry(nav)?.status === "answered" ? "Leave this answer and move on" : "Skip this question without scoring it"}
          />
        </section>
      )}

      {phase === "done" && (
        <section className="card">
          <h2 className="h2">Case complete: {total.points}/{total.max} points</h2>
          <p className="small mono">{cs.steps.map((_, i) => stepScores[i] ? `Step ${i + 1}: ${stepScores[i].points}/${stepScores[i].max}` : null).filter(Boolean).join(" · ") || "No steps scored"}</p>
          {skippedCount(nav) > 0 && <p className="small">{skippedCount(nav)} skipped. Skipped steps were not scored.</p>}
          <p className="small">{isFullCredit(total) ? "Flawless clinical judgment. You recognized cues, prioritized the hypothesis, and took the right actions." : "Review the rationales above. NGN cases reward recognizing the pattern across findings, not any single number."}</p>
          <button className="btn" onClick={() => setCaseIdx(null)}>Back to all cases</button>
        </section>
      )}
      </div>
    </div>
  );
}

/* ================= FLASHCARDS (real spaced repetition) ================= */

const CALC_CHIP = "Dosage calculations"; // topic-based focus: math cards live inside Pharmacology
/* Prompt 9: numeric ranges as scales. The numbers are parsed from the
   already-reviewed card text itself — the visual adds no new facts, so it
   inherits the card's adversarial review. */
function RangeScale({ lo, hi, unit }) {
  const pad = (hi - lo) * 0.35 || 1;
  const min = lo - pad, max = hi + pad;
  const x = (v) => 10 + ((v - min) / (max - min)) * 280;
  return (
    <svg viewBox="0 0 300 48" className="fc-scale" role="img" aria-label={`Normal range ${lo} to ${hi} ${unit ?? ""}`}>
      <line x1="10" y1="30" x2="290" y2="30" stroke="var(--line)" strokeWidth="3" />
      <rect x={x(lo)} y="22" width={Math.max(4, x(hi) - x(lo))} height="16" rx="4" fill="var(--teal)" opacity="0.28" />
      <line x1={x(lo)} y1="20" x2={x(lo)} y2="40" stroke="var(--teal)" strokeWidth="2.5" />
      <line x1={x(hi)} y1="20" x2={x(hi)} y2="40" stroke="var(--teal)" strokeWidth="2.5" />
      <text x={x(lo)} y="14" textAnchor="middle" fontSize="11" fill="var(--accent-ink)" fontFamily="'IBM Plex Mono',monospace">{lo}</text>
      <text x={x(hi)} y="14" textAnchor="middle" fontSize="11" fill="var(--accent-ink)" fontFamily="'IBM Plex Mono',monospace">{hi}</text>
      {unit ? <text x="290" y="46" textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="'IBM Plex Mono',monospace">{unit}</text> : null}
    </svg>
  );
}
const parseRangeBack = (back) => {
  const m = (back ?? "").match(/^\s*(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*([^\d]{0,24}?)\s*$/);
  if (!m) return null;
  const lo = parseFloat(m[1]), hi = parseFloat(m[2]);
  return hi > lo ? { lo, hi, unit: m[3] || "" } : null;
};
const parseAntidote = (c) => {
  if (!/antidote/i.test(c.topic ?? "")) return null;
  const m = (c.front ?? "").match(/antidote\s+(?:for|to)\s+(.+?)\s*(?:overdose|toxicity)?\s*\??$/i);
  return m ? m[1] : null;
};

const isCalcCard = (c) => /dosage|calculation|conversion|drip rate|drop factor/i.test(c.topic);

const GRADE_WORD = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

export function Flashcards({ addXp, onGrade, onUngrade, cards, srsMap, setSrsMap, touchDay, ready = true, embedded = false, onDone, fcFlips = 99, onFlip, newAllowance = NEW_PER_DAY, onNewCard, onRefundNewCard, onSession, tourFocus = null }) {
  const [catFilter, setCatFilter] = useState([]); // empty = all categories
  const [calcOpen, setCalcOpen] = useState(false); // on-screen calculator for dosage cards
  const [focusOpen, setFocusOpen] = useState(false); // Focus bottom sheet
  const undoLog = useRef({}); // card id -> { prev schedule, xp } for Undo grade (this sitting only)
  const countedNew = useRef(new Set()); // first grade already counted against today's new-card cap
  const fKeys = useRef({});
  fKeys.current = {};
  useStudyKeys(fKeys);
  const filtered = useMemo(
    () => (catFilter.length
      ? cards.filter((c) => catFilter.some((f) => (f === CALC_CHIP ? isCalcCard(c) : f === c.cat)))
      : cards),
    [cards, catFilter]
  );
  const filterKey = catFilter.join("|");
  /* Snapshot the queue when the deck is ready or the focus changes.
     A grade updates srsMap and must not rebuild this list under the student.
     newAllowance is read at those moments, so a remount cannot serve 20 more. */
  const seedIds = useMemo(
    () => (ready ? dueQueue(filtered, srsMap, newAllowance) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, filtered.length, filterKey]
  );
  const seedKey = `${ready ? 1 : 0}|${filterKey}|${filtered.length}`;
  const [builtKey, setBuiltKey] = useState(seedKey);
  const [session, setSession] = useState(() => startCardSession(seedIds ?? []));
  if (builtKey !== seedKey) {
    setBuiltKey(seedKey);
    setSession(startCardSession(seedIds ?? []));
    setCalcOpen(false);
  }
  const entry = currentCard(session);
  const curId = entry?.id ?? null;
  const cur = curId != null ? cards.find((c) => c.id === curId) ?? null : null;
  const show = !!entry?.show;
  const flipAt = useRef(0); // when this card's answer appeared (card XP time floor)
  useEffect(() => { if (show) flipAt.current = Date.now(); }, [show, curId]);
  const typed = entry?.typed ?? "";
  const place = `${session.index}:${curId ?? ""}`;
  const placeRef = useRef(place);
  if (placeRef.current !== place) {
    placeRef.current = place;
    if (calcOpen) setCalcOpen(false);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (studySurfaceBlocked()) return;
      const action = cardNavAction(e);
      if (!action) return;
      e.preventDefault();
      setSession((s) => (action === "back" ? goBackCard(s) : goForwardCard(s).nav));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useLabSettleKey(curId != null ? `${curId}:${show ? "back" : "front"}` : "cards");

  const onBack = () => setSession((s) => goBackCard(s));
  const onSkip = () => setSession((s) => skipCard(s).nav);
  const onNext = () => setSession((s) => goForwardCard(s).nav);
  const onReview = () => setSession((s) => jumpToSkippedCard(s));
  const grade = (g) => {
    const result = gradeCard(session, g);
    if (!result.recorded) return;
    const id = currentCard(session).id;
    touchDay();
    // first grade of a never-seen card counts against today's new-card cap.
    // Undo refunds that charge; grading the card again counts it once.
    if (!srsMap[id] && !countedNew.current.has(id)) { countedNew.current.add(id); onNewCard?.(id); }
    const xpGain = cardXp(g, Date.now() - flipAt.current);
    const opId = `card:${id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    undoLog.current[id] = { prev: srsMap[id], xp: xpGain, day: todayStr(), opId };
    setSrsMap((m) => ({ ...m, [id]: nextSchedule(m[id], g) }));
    if (xpGain) addXp(xpGain);
    onGrade?.(xpGain, { id: opId, day: todayStr() });
    setSession(result.nav);
  };
  /* Undo: back on a card graded this sitting, put its previous schedule
     back, take back the XP, and show the answer to grade again. */
  const undo = () => {
    if (!canUndoGrade(session)) return;
    const id = currentCard(session).id;
    const rec = undoLog.current[id];
    if (rec) {
      if (rec.prev === undefined) {
        countedNew.current.delete(id);
        onRefundNewCard?.(id);
      }
      setSrsMap((m) => {
        const n = { ...m };
        if (rec.prev === undefined) delete n[id]; else n[id] = rec.prev;
        return n;
      });
      if (rec.xp) addXp(-rec.xp);
      onUngrade?.(rec.xp, rec.day, rec.opId ? { id: rec.opId } : null);
      delete undoLog.current[id];
    }
    flipAt.current = Date.now(); // the answer is shown again: the 1.5 s floor restarts (REVIEW-3 N10)
    setSession((s) => undoGrade(s));
  };

  const interval = srsMap[curId]?.interval ?? 0;
  /* Unseen cards held back by today's new-card cap unlock tomorrow, which can
     be sooner than the next scheduled review. */
  const nextReview = filtered.map((c) => srsMap[c.id]?.due).filter((d) => d && d > todayStr()).sort()[0];
  const nextDue = filtered.some((c) => !srsMap[c.id]) ? addDays(1) : nextReview;

  /* Read aloud: the prompt, then (only after the flip) the answer. */
  const cardSegs = useMemo(() => cardSegments(cur, show), [cur, show]);
  const cardBankId = /^c\d+$/.test(String(cur?.id ?? "")) ? Number(String(cur.id).slice(1)) : null; // bank cards are "c<id>"
  const cardReader = useReadAloud(cardSegs, cur ? `card:${cur.id}:${show ? "back" : "front"}` : "off", cardBankId ? { kind: "card", id: cardBankId, part: show ? "back" : "front" } : null);
  useSessionReport(onSession, {
    inSession: !!cur,
    hasDraft: !!cur && !show && typed.trim().length > 0,
  });

  const chips = !embedded && (
    <FocusBar
      open={focusOpen}
      setOpen={setFocusOpen}
      allLabel="All categories"
      hint="Leave everything off to review every due card."
      onClear={() => setCatFilter([])}
      groups={[{
        label: "Category",
        options: [...CATS, CALC_CHIP].map((c) => [c, c === CALC_CHIP ? "🧮 " + c : c]),
        selected: catFilter,
        onToggle: (c) => setCatFilter((f) => f.includes(c) ? f.filter((x) => x !== c) : [...f, c]),
      }]}
    />
  );

  const frontier = atFrontier(session);
  const graded = !!entry?.grade;
  const nextAria = !entry
    ? "No further card"
    : frontier && !graded
      ? "Next card. This one stays ungraded and comes back later in this queue"
      : "Forward to the next card";
  const cardNav = (
    <QuestionNav
      layout="inline"
      canBack={canGoBackCard(session)}
      canSkip={canSkipCard(session)}
      canNext={canGoForwardCard(session)}
      skipped={skippedCardCount(session)}
      onBack={onBack}
      onSkip={onSkip}
      onNext={onNext}
      onReview={onReview}
      backLabel="← Back"
      backAria="Back to the previous card"
      nextLabel="Next →"
      nextAria={nextAria}
      skipAria={graded ? "Leave this card and move on" : "Skip this card without grading it"}
      emptyReviewAria="No skipped cards"
    />
  );
  if (!ready) return (
    <div className="stack">
      {chips}
      <section className="card">
        <p className="eyebrow">Spaced repetition</p>
        <p className="small">Loading today's cards…</p>
      </section>
    </div>
  );

  if (!cur) {
    const skippedOut = sessionOutcome(session) === "skipped";
    return (
      <div className="stack">
        {chips}
        <section className="card">
          <div className={tourMark(tourFocus, "cards")} data-tour="cards">
            <p className="eyebrow">Spaced repetition · deck of {filtered.length} cards</p>
            {skippedOut ? (
              <>
                <h2 className="h2">Skipped for now</h2>
                <p className="small">Those cards were not graded, so the schedule is unchanged. They stay in today's queue. Back opens one if you want to grade it.</p>
              </>
            ) : (
              <>
                <h2 className="h2">Nothing due {catFilter.length ? "in this focus" : "today"} 🎉</h2>
                <p className="small">Your queue is clear, and that's the point. {nextDue ? `Next cards unlock ${nextDue === addDays(1) ? "tomorrow" : `on ${nextDue}`}.` : ""}</p>
              </>
            )}
          </div>
          <Why>Reviews land right before you'd forget: graded "Hard" returns tomorrow; "Good" stretches to 3, 7, then 15 days; "Easy" pushes even further. New cards unlock at {NEW_PER_DAY} per day (a cap that holds for the whole day, even if you reopen the deck) so the deck never buries you. Your schedule syncs to your account. Come back on the due date, and the queue will be waiting. Early re-cramming actually weakens the spacing effect.</Why>
          {session.entries.length > 0 && cardNav}
          {embedded && <button className="btn" onClick={onDone}>Continue to questions →</button>}
        </section>
      </div>
    );
  }

  const prog = cardProgress(session);
  const flip = () => { if (!show) onFlip?.(); setSession((s) => saveCardView(s, { show: !show, typed })); };
  fKeys.current = {
    primary: () => { if (!graded) flip(); },
    pick: (i) => { if (show && !graded && i < 4) grade(["again", "hard", "good", "easy"][i]); },
  };
  return (
    <div className="stack study-col">
      {chips}
      <section className="card">
        <div className="card-progress" role="progressbar" aria-label="Cards in this sitting" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.done} aria-valuetext={`Card ${prog.position} of ${prog.total}, ${prog.done} reviewed`}>
          <span className="mono">{prog.position} / {prog.total}</span>
          <div className="bar"><div className="bar-fill" style={{ width: `${prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%` }} /></div>
        </div>
        <p className="eyebrow">Spaced repetition · {cardsLeft(session)} in today's queue · deck of {filtered.length}{frontier ? "" : " · looking back"}</p>
        <p className="small mono" style={{ marginBottom: 6 }}>{cur.cat.toUpperCase()} · {cur.topic.toUpperCase()}{cur.ai ? " · ✨ AI" : ""}</p>
        <ReadAloudBar reader={cardReader} label={show ? "Listen to the answer" : "Listen to the card"} />
        <button key={`${curId}:${show ? "b" : "f"}`} className={tourMark(tourFocus, "cards") + " " + ra(cardReader, show ? "card-back" : "card-front", "flashcard") + (show ? " flip-in" : "")} data-tour="cards" onClick={flip}
          aria-label={show ? `Answer: ${cur.back}. Tap to see the prompt again` : `Prompt: ${cur.front}. Tap to show the answer`}>
          <p className="fc-side mono">{show ? "ANSWER" : "PROMPT · TAP TO FLIP"}</p>
          <p className="fc-text">{show ? cur.back : cur.front}</p>
        </button>
        {!show && !graded && (
          <input
            className="select fc-input"
            placeholder="Type your answer first, then flip…"
            value={typed}
            autoComplete="off"
            onChange={(e) => { const value = e.target.value; setSession((s) => saveCardView(s, { show: false, typed: value })); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onFlip?.(); setSession((s) => saveCardView(s, { show: true, typed: currentCard(s)?.typed ?? "" })); } }}
            aria-label="Type your answer before flipping"
          />
        )}
        {show && typed.trim() && (
          <p className="small fc-compare">Grade yourself honestly against the answer above. <strong>You typed:</strong> {typed}</p>
        )}
        {show && parseRangeBack(cur.back) && (() => { const r = parseRangeBack(cur.back); return <RangeScale lo={r.lo} hi={r.hi} unit={r.unit} />; })()}
        {show && parseAntidote(cur) && (
          <div className="fc-pair mono" aria-label="drug and its antidote">
            <span className="chip">{parseAntidote(cur)}</span><span className="fc-arrow">→</span><span className="chip fc-anti">{cur.back}</span>
          </div>
        )}
        {isCalcCard(cur) && !graded && (
          <>
            <button className="btn ghost tutor-btn" onClick={() => setCalcOpen((o) => !o)}>{calcOpen ? "Hide calculator" : "🧮 Open calculator"}</button>
            {calcOpen && <Calculator onUse={(v) => setSession((s) => saveCardView(s, { show, typed: v }))} />}
          </>
        )}
        {show && !graded && (
          <div className="grades">
            <button className="btn grade again" onClick={() => grade("again")}>Again</button>
            <button className="btn grade hard" onClick={() => grade("hard")}>Hard<span className="grade-sub">1d</span></button>
            <button className="btn grade good" onClick={() => grade("good")}>Good<span className="grade-sub">{interval < 1 ? "3d" : `${Math.min(interval * 2 + 1, 60)}d`}</span></button>
            <button className="btn grade easy" onClick={() => grade("easy")}>Easy<span className="grade-sub">{interval < 1 ? "7d" : `${Math.min(interval * 3 + 1, 90)}d`}</span></button>
          </div>
        )}
        {!show && !graded && <button type="button" className="btn ghost show-answer" onClick={flip}>Show answer</button>}
        {graded && (
          <div className="undo-row">
            <p className="small" style={{ margin: 0, flex: 1 }}>Graded {GRADE_WORD[entry.grade] ?? entry.grade}.{canUndoGrade(session) ? " Undo puts the old schedule back." : " This visit is not graded again."}</p>
            {canUndoGrade(session) && <button type="button" className="btn ghost" onClick={undo}>↶ Undo grade</button>}
          </div>
        )}
        {!graded && (session.skipPasses[cur.id] ?? 0) > 0 && (
          <p className="small tip">Skipped earlier. It still has no grade, so the schedule has not changed.</p>
        )}
        {cardNav}
        {fcFlips < 3 && <p className="small tip">Typing (or saying) the answer before you flip is the retrieval attempt that builds the memory. The flip is just the check.</p>}
        <p className="small tip">Tap the card to flip · grades set real calendar dates.{cur.ai ? " ✨ AI-assisted card that passed automated quality checks." : ""}</p>
        <p className="small tip kbd-hint">{CARD_SHORTCUT_HINT}</p>
        <Why label="how grading works">Graded "Hard" returns tomorrow; "Good" stretches to 3, 7, then 15 days; "Easy" pushes even further; "Again" re-queues it in this session. Skip does not change the schedule. Reviews land right before you'd forget. That's the spacing effect doing the work.</Why>
      </section>
    </div>
  );
}

/* ================= STATS ================= */

function Stats({ setPref = null, rewards = null, career = null, board = null, week = null, xp = 0, streak = null, bestRun = 0, readiness = null, readyLabel = "", log, catStats, popStats = [], acc, resetAll, saveBlocked = false, provider, setProvider, customCount, examDate, setExamDate, isOwner = false, ent = null, onManagePlan, profile, setProfile, tourFocus = null, signOutAndForgetTrial = () => {} }) {

  const [confirm, setConfirm] = useState(false);
  const p = AI_PROVIDERS.find((x) => x.id === provider) || AI_PROVIDERS[0];
  const lvl = levelFor(xp);
  return (
    <div className="stack stats-grid">
      <section className="card wide">
        <p className="eyebrow">Readiness & progress</p>
        <div className="stat-hero">
          <div><span className="stat-big mono">{readiness == null ? "--" : `${Math.round((readiness.low + readiness.high) / 2)}`}</span><span className="stat-cap">Readiness (estimate){readiness == null ? " · 12+ answers needed" : ` · range ${readiness.low}–${readiness.high}%`}</span></div>
          <div><span className="stat-big mono">{log.length ? `${Math.round(acc * 100)}%` : "--"}</span><span className="stat-cap">Accuracy · {log.length} answered</span></div>
          <div><span className="stat-big mono"><StreakGlyph size={20} /> {streak?.count ?? 0}</span><span className="stat-cap">Day streak</span></div>
          <div><span className="stat-big mono">{xp}</span><span className="stat-cap">XP · {career ? career.rank.name : lvl.name}</span></div>
        </div>
        {readyLabel && <p className="small tip">{readyLabel}. Readiness is an estimate from your work in PulseRN.</p>}
      </section>
      {career && <CareerCard career={career} full />}
      {board && <BadgeGrid board={board} />}
      {week && rewards && <RoundsCard week={week} rewards={rewards} />}
      {rewards && <BestsCard best={rewards.best} bestRun={bestRun} />}
      <section className={"card wide" + tourMark(tourFocus, "stats")} data-tour="stats">
        <p className="eyebrow">Performance</p>
        <h2 className="h2">{log.length ? `${Math.round(acc * 100)}% overall accuracy` : "No questions answered yet"}</h2>
        <p className="small">{log.length} answered · {log.filter((l) => l.correct).length} correct</p>
      </section>
      <section className="card">
        <p className="eyebrow">By client-needs category</p>
        {catStats.map((c) => (
          <div key={c.cat} className="cat-row">
            {/* under n=5 a percentage is noise, not signal — no red, no green */}
            <div className="cat-top"><span className="small">{c.cat}</span><span className="small mono">{c.n < 5 ? `needs more data (${c.n}q so far)` : `${c.pct}% · ${c.n}q`}</span></div>
            <div className="bar"><div className={"bar-fill" + (c.n < 5 ? " na" : c.pct < 60 ? " low" : "")} style={{ width: c.n < 5 ? "100%" : `${c.pct}%` }} /></div>
          </div>
        ))}
        <p className="small tip">Aim for ≥ 75% in every category before test day. The QBank automatically feeds you more questions in your red-bar categories.</p>
      </section>
      <section className="card">
        <p className="eyebrow">By special population</p>
        {popStats.map((c) => (
          <div key={c.cat} className="cat-row">
            <div className="cat-top"><span className="small">{c.cat}</span><span className="small mono">{c.n < 5 ? `needs more data (${c.n}q so far)` : `${c.pct}% · ${c.n}q`}</span></div>
            <div className="bar"><div className={"bar-fill" + (c.n < 5 ? " na" : c.pct < 60 ? " low" : "")} style={{ width: c.n < 5 ? "100%" : `${c.pct}%` }} /></div>
          </div>
        ))}
        <p className="small tip">Pediatric, geriatric, and maternal/newborn clients appear across every category. Use the 🧒 👵 🤰 focus chips in Practice to drill them, and track your accuracy here.</p>
      </section>
      <PlanCard ent={ent} onManage={onManagePlan} isOwner={isOwner} />
      {profile !== undefined && log.length >= 1 && <ProfileCard key={profile?.updated_at ?? "new"} profile={profile} setProfile={setProfile} />}
      <section className="card">
        <p className="eyebrow">Exam date</p>
        <p className="small">Set your NCLEX date and the Today tab will build you a weekly plan from your ability profile.</p>
        <input type="date" className="select" aria-label="Exam date"
          value={examDate ?? ""} min={addDays(1)}
          onChange={(e) => setExamDate(e.target.value || null)} />
        <p className="small tip">Haven't registered yet? Apply through your state's Board of Nursing, then sign up for the NCLEX at <a href="https://www.nclex.com" target="_blank" rel="noopener" style={{ color: "inherit", fontWeight: 600 }}>nclex.com</a> (official NCSBN site) and schedule through <a href="https://www.pearsonvue.com/us/en/nclex.html" target="_blank" rel="noopener" style={{ color: "inherit", fontWeight: 600 }}>Pearson VUE</a>.</p>
      </section>
      {isOwner && (
        <section className="card">
          <p className="eyebrow">AI engine · owner tools</p>
          <Why label="how this works">Developer control: students never see this. The tutor and question generator run through a provider adapter: one neutral prompt format in, plain text out, so swapping engines loses nothing.</Why>
          <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="AI engine">
            {AI_PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <p className="small tip">{p.note}{customCount ? ` · ${customCount} AI-generated question${customCount === 1 ? "" : "s"} in your bank.` : ""}</p>
        </section>
      )}
      {rewards && setPref && <EffectsCard prefs={rewards.prefs} setPref={setPref} />}
      <section className="card">
        <p className="eyebrow">Saved progress</p>
        <p className="small">Your XP, streak, answer history, and flashcard schedule sync to your account and reload on any device.</p>
        {saveBlocked
          ? <p className="small rw-reset-off">Reset is off while this session isn't being saved, so the saved progress we couldn't open stays untouched.</p>
          : !confirm
          ? <button className="btn ghost" onClick={() => setConfirm(true)}>Reset all progress…</button>
          : <div className="row">
              <button className="btn danger" onClick={() => { setConfirm(false); resetAll(); }}>Yes, erase everything</button>
              <button className="btn ghost" onClick={() => setConfirm(false)}>Keep my progress</button>
            </div>}
      </section>
      <section className="card">
        <p className="eyebrow">Account</p>
        <p className="small">Signing out keeps your synced progress safe. Sign back in anywhere to continue.</p>
        <button className="btn ghost" onClick={signOutAndForgetTrial}>Sign out</button>
        <p className="small tip">All questions, case studies, flashcards, exams, and materials are the property of the owner of PulseRN and may not be copied, captured, or used outside this app without the owner's explicit consent.</p>
        <p className="small tip">NCLEX® is a registered trademark of the National Council of State Boards of Nursing, Inc. (NCSBN), which is not affiliated with and does not endorse this product. Educational exam preparation only.</p>
        <p className="small tip"><a href="/legal/" style={{ color: "inherit" }}>Terms, Privacy, and Disclaimer</a></p>
      </section>
    </div>
  );
}

/* ---- report a problem with a question or case → reviewers' Reports tab ----
   Exactly one of itemId / caseId is set; migration 012 enforces that in the
   database too. Either being null means the content is local rather than from
   the shared bank, so there is nothing a reviewer could open. */
function ReportIssue({ itemId = null, caseId = null, label = "question" }) {
  const [state, setState] = useState("idle"); // idle | open | busy | sent | error
  const [msg, setMsg] = useState("");

  if (itemId == null && caseId == null) return null;

  const send = async () => {
    const message = msg.trim();
    if (message.length < 3) return;
    setState("busy");
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("question_reports").insert({
      item_id: itemId, case_id: caseId, user_id: session?.user?.id ?? null, message: message.slice(0, 1000),
    });
    setState(error ? "error" : "sent");
  };

  if (state === "sent") return <p className="small tip">✅ Thanks. Your report goes straight to the RN behind PulseRN.</p>;
  if (state === "idle") return (
    <button className="btn ghost tutor-btn" onClick={() => setState("open")}>⚠ Report a problem with this {label}</button>
  );
  return (
    <div className="report-box">
      <textarea className="select" rows={3} placeholder="What's wrong? (e.g., “the keyed answer conflicts with current guidelines because…”)"
        value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1000} />
      <div className="row">
        <button className="btn" disabled={state === "busy" || msg.trim().length < 3} onClick={send}>{state === "busy" ? "Sending…" : "Send report"}</button>
        <button className="btn ghost" onClick={() => setState("idle")}>Cancel</button>
      </div>
      {state === "error" && <p className="small" style={{ color: "var(--coral)" }}>Couldn't send. Check your connection and try again.</p>}
    </div>
  );
}

/* ================= AI QUESTION GENERATOR ================= */

function Generator({ provider, addQuestions, log, questions, lowOnNew }) {
  const [state, setState] = useState("idle"); // idle | loading | done | key | error
  const [msg, setMsg] = useState("");

  const weakCats = (() => {
    const accs = CATS.map((c) => {
      const rows = log.filter((l) => l.cat === c);
      return [c, rows.length ? rows.filter((r) => r.correct).length / rows.length : 0.5];
    }).sort((a, b) => a[1] - b[1]);
    return accs.slice(0, 2).map((a) => a[0]);
  })();

  const go = async () => {
    setState("loading");
    try {
      const recentStems = questions.slice(-15).map((x) => x.stem.slice(0, 60));
      const raw = await askModel(provider, `You are an expert NCLEX-RN item writer following current NCSBN test-plan standards. Write exactly 5 new practice questions emphasizing these client-needs categories: ${weakCats.join(" and ")}. Use clinical-judgment style stems, plausible distractors, and current practice standards.


Do NOT duplicate these existing topics: ${recentStems.join(" ~ ")}

Respond ONLY with a raw JSON array (no markdown fences, no commentary) of 5 objects with this exact schema:
{"cat": one of ${JSON.stringify(CATS)}, "diff": 1|2|3, "type": "mc"|"sata", "stem": string, "options": array of 4-5 strings, "answer": option index number for mc OR array of index numbers for sata, "rationale": string explaining why the correct answer is correct AND why each distractor is wrong}`, 3500);
      const clean = raw.replace(/```json|```/g, "").trim();
      const arr = JSON.parse(clean);
      const maxId = Math.max(999, ...questions.map((x) => x.id));
      const valid = (Array.isArray(arr) ? arr : []).filter(validQ).map((x, i) => ({
        ...x, id: maxId + 1 + i, ai: true, cat: CATS.includes(x.cat) ? x.cat : weakCats[0],
      }));
      if (!valid.length) throw new Error("NONE_VALID");
      addQuestions(valid);
      setMsg(`${valid.length} new questions added, targeting ${weakCats.join(" & ")}. They're saved to your bank.`);
      setState("done");
    } catch (e) {
      setState(e.code === "KEY_REQUIRED" ? "key" : "error");
    }
  };

  return (
    <div>
      {lowOnNew && state === "idle" && <p className="small tip">Running low on fresh questions. Generate more below.</p>}
      <button className="btn ghost" onClick={go} disabled={state === "loading"}>
        {state === "loading" ? "Writing questions…" : "✨ Generate 5 new questions (AI)"}
      </button>
      {state === "done" && <p className="small">{msg}</p>}
      {state === "key" && <p className="small">This engine needs an API key. Switch engines in Stats → AI engine, or use Claude (included).</p>}
      {state === "error" && <p className="small">Generation hiccup. Tap to try again. Nothing invalid ever enters your bank: every item is schema-checked first.</p>}
    </div>
  );
}

/* ================= AI TUTOR (provider-agnostic) ================= */

function TutorExplain({ q, wasCorrect, provider = "claude", isBank = false }) {
  const [state, setState] = useState("idle"); // idle | loading | done | key | error
  const [text, setText] = useState("");

  const ask = async () => {
    setState("loading");
    // Cache first (§5.6): bank items pay for each explanation exactly once, ever.
    if (isBank) {
      try {
        const { data } = await supabase.from("tutor_cache")
          .select("text").eq("item_id", q.id).eq("was_correct", wasCorrect).maybeSingle();
        if (data?.text) { setText(data.text); setState("done"); return; }
      } catch (e) { /* cache miss path below */ }
    }
    try {
      const ext = ngnExt(q);
      const optionsLine =
        Array.isArray(q.options) ? q.options.join(" | ")
        : q.type === "matrix" ? `Rows: ${ext.rows.join(" | ")} — Columns: ${ext.columns.join(" | ")}`
        : q.type === "bowtie" ? `Actions: ${ext.actions.join(" | ")} — Conditions: ${ext.conditions.join(" | ")} — Parameters: ${ext.parameters.join(" | ")}`
        : q.type === "cloze" ? ext.dropdowns.map((d, i) => `Blank {${i}}: ${d.join(" / ")}`).join(" — ")
        : q.type === "calc" ? "(numeric entry — the student calculates the value)"
        : q.type === "highlight" ? `Findings to consider: ${ext.tokens.join(" | ")}`
        : "";
      const answerLine =
        q.type === "mc" ? q.options[q.answer]
        : q.type === "sata" ? q.answer.map((i) => q.options[i]).join("; ")
        : q.type === "order" ? q.answer.map((i) => q.options[i]).join(" → ")
        : q.type === "matrix" ? ext.rows.map((r, i) => `${r} → ${ext.columns[q.answer[i]]}`).join("; ")
        : q.type === "bowtie" ? `Actions: ${q.answer.actions.map((i) => ext.actions[i]).join("; ")} — Condition: ${ext.conditions[q.answer.condition]} — Parameters: ${q.answer.parameters.map((i) => ext.parameters[i]).join("; ")}`
        : q.type === "cloze" ? q.answer.map((a, i) => ext.dropdowns[i][a]).join("; ")
        : q.type === "calc" ? `${q.answer} ${ext.unit ?? ""}`
        : q.type === "highlight" ? q.answer.map((i) => ext.tokens[i]).join("; ")
        : "";
      const prompt = q.type === "calc"
        ? `You are a precise NCLEX dosage-calculation tutor. A student ${wasCorrect ? "answered this correctly and wants the method locked in" : "just missed this calculation"}.

Question: ${q.stem}
Correct answer: ${answerLine}
${Array.isArray(ext.work) && ext.work.length ? `Verified solution steps: ${ext.work.join(" | ")}` : `Textbook rationale: ${q.rationale}`}

Rewrite the verified steps in plain, calm language, one step per line: name the formula, plug in the exact numbers from the question, state the result with its unit. Use ONLY the numbers in this question. Absolute rules: no analogies of any kind (no money, food, sports, or anything outside the clinical scenario); verify silently first and give only the final, correct explanation — never think out loud, never backtrack or correct yourself mid-answer. Under 100 words, plain text only, no markdown. End by restating the answer with its unit. Educational exam prep only.`
        : `You are a warm, expert NCLEX tutor. A student ${wasCorrect ? "answered this question correctly and wants to understand it more deeply" : "just missed this question"}.

Question: ${q.stem}
Options: ${optionsLine}
Correct answer: ${answerLine}
Textbook rationale: ${q.rationale}

Explain it DIFFERENTLY from the textbook rationale: plain, everyday language a tired student at midnight would understand, under 120 words. Stay inside the clinical scenario — no analogies to money, food, sports, or other unrelated domains. Verify silently first and give only the final, correct explanation: never think out loud, never backtrack or correct yourself mid-answer. End with one short memory trick or mnemonic drawn from the clinical content itself. No preamble, no headers, plain text only — no markdown, no asterisks, no bullet lists. Educational exam prep only — do not give real-world dosing or treatment instructions.`;
      const t = await askModel(provider, prompt);
      setText(t);
      setState("done");
      // Write-through so the next student gets it free (service role, server-side).
      if (isBank && t.length <= 2000) {
        fetch("/api/tutor-cache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: q.id, wasCorrect, text: t }),
        }).catch(() => {});
      }
    } catch (e) {
      setState(e.code === "KEY_REQUIRED" ? "key" : "error");
    }
  };

  if (state === "done") return <p className="rationale tutor"><strong>Tutor.</strong> {text}</p>;
  return (
    <button className="btn ghost tutor-btn" onClick={ask} disabled={state === "loading"}>

      {state === "loading" ? "Tutor is thinking…"
        : state === "key" ? "This engine needs an API key. Switch engines in Stats → AI engine."
        : state === "error" ? "Tutor unavailable. Tap to retry."
        : "🧠 Explain it differently"}
    </button>
  );
}

/* ================= STYLES =================
   Evidence-applied design system:
   - Green/blue-cool dominant palette (sustained attention, low eye strain)
   - Light reading surfaces by default (comprehension advantage for dense text)
   - Optional dim theme: charcoal (never pure black) + off-white text,
     larger type, heavier weights, looser leading to counter halation
   - Warm color reserved strictly for meaning: coral = incorrect, amber = caution
   - Generous spacing & chunking to protect working memory
*/

export function Style() {
  return (
    <style>{`
      .app{
        /* LIGHT (default study theme) */
        --paper:#F3F6F4; --ink:#0F2E29; --card:#FFFFFF; --muted:#3B554F;
        --surface:#F7FAF8; --line:#D8E2DD; --bar-bg:#E7EFEA;
        --teal:#0E7C6B; --btn-ink:#FFFFFF; --accent-ink:#0A5A4E;
        --mon:#0C201D; --ecg:#3BE08F; --mon-track:#24433C;
        --amber:#E9A23B; --coral:#D9503F; --danger-ink:#B23A2B;
        --pick-bg:#E8F4F0; --right-bg:#DDF2E7; --wrong-bg:#FBE7E3;
        --ok-bg:#E9F6EF; --ok-line:#BCE4CE; --no-bg:#FBEFEC; --no-line:#F0C8C0;
        --chip-bg:#EDF4F0; --lab-bg:#FDF3E3; --lab-line:#EED9B4; --lab-ink:#8A6215;
        --tab-ink:#4A645C; --tab-on:#E6F1ED;
        --read-size:15.5px; --read-lh:1.55; --body-size:13.5px; --body-lh:1.55; --body-weight:400;
      }
      .app[data-theme="dim"]{
        /* DIM (night review) — charcoal, not #000, to avoid halation */
        --paper:#151A18; --ink:#EAF1ED; --card:#1D2523; --muted:#B4C7BF;
        --mon-track:#24433C;
        --surface:#242D2A; --line:#33403B; --bar-bg:#2A3430;
        --teal:#2FA78F; --btn-ink:#06231D; --accent-ink:#8CDCC8;
        --amber:#D9A24E; --coral:#E0705E; --danger-ink:#F2A296;
        --pick-bg:#1F3A33; --right-bg:#1D4433; --wrong-bg:#46251F;
        --ok-bg:#1A332A; --ok-line:#2E5A48; --no-bg:#3A2320; --no-line:#6A3B33;
        --chip-bg:#243029; --lab-bg:#3A2F17; --lab-line:#5C4A24; --lab-ink:#E7C57C;
        --tab-ink:#8FA79E; --tab-on:#243430;
        /* dim-mode reading: slightly larger, heavier, looser leading */
        --read-size:16.5px; --read-lh:1.65; --body-size:14px; --body-lh:1.7; --body-weight:500;
      }
      *{box-sizing:border-box;margin:0}
      .app{min-height:100vh;background:var(--paper);color:var(--ink);font-family:'Archivo',system-ui,sans-serif;display:flex;flex-direction:column;max-width:560px;margin:0 auto;transition:background .25s,color .25s}
      .mono{font-family:'IBM Plex Mono',monospace}
      .top{position:sticky;top:0;z-index:35;background:var(--paper);display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line)}
      .top.menu-open{z-index:55}
      .brand{display:flex;align-items:center;gap:8px;flex:0 0 auto}
      .brand-name{font-weight:800;letter-spacing:.06em;font-size:17px}
      .brand-name em{font-style:normal;color:var(--teal)}
      .pulse-dot{width:9px;height:9px;border-radius:50%;background:var(--ecg);box-shadow:0 0 0 0 rgba(59,224,143,.5);animation:pulse 1.6s infinite}
      @keyframes pulse{70%{box-shadow:0 0 0 9px rgba(59,224,143,0)}100%{box-shadow:0 0 0 0 rgba(59,224,143,0)}}
      .top-stats{margin-left:auto;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;font-size:12px;font-weight:600;color:var(--accent-ink)}
      .home-btn{flex:0 0 auto;min-height:44px;padding:8px 14px;border-radius:999px;border:1.5px solid var(--teal);background:var(--teal);color:var(--btn-ink);font-family:'Archivo',sans-serif;font-weight:800;font-size:14px;cursor:pointer}
      .home-btn:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      @media (max-width: 400px) {
        .top{flex-wrap:nowrap;padding:6px 8px;gap:6px}
        .brand-name{font-size:15px;letter-spacing:.04em}
        .home-btn{padding:8px 10px;font-size:13px}
        .top-stats{gap:4px;font-size:12px}
        .theme-btn{padding:4px 7px}
      }
      .theme-btn{font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600;color:var(--accent-ink);background:var(--card);border:1px solid var(--line);border-radius:99px;padding:5px 10px;cursor:pointer}
      .theme-btn:focus-visible{outline:3px solid var(--amber);outline-offset:2px}

      .body{flex:1;padding:16px 16px 96px}
      .stack{display:flex;flex-direction:column;gap:14px}
      .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
      .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);margin-bottom:6px;font-weight:600}
      .app[data-theme="dim"] .eyebrow{color:var(--accent-ink)}
      .h2{font-size:20px;font-weight:800;letter-spacing:-.01em;margin-bottom:6px}
      .small{font-size:var(--body-size);line-height:var(--body-lh);font-weight:var(--body-weight);color:var(--muted);margin-bottom:8px}
      .tip{border-top:1px dashed var(--line);padding-top:8px;margin-top:4px;margin-bottom:0}
      /* monitor (dark in both themes — instrument, not reading surface) */
      .monitor-card{background:var(--mon);border-radius:16px;padding:16px;color:#CFEADF}
      .monitor-head{display:flex;justify-content:space-between;font-size:12px;letter-spacing:.16em;color:#6FA394;margin-bottom:8px}
      .blink{color:var(--ecg);animation:blink 1.4s steps(1) infinite}
      @keyframes blink{50%{opacity:.25}}
      .ecg{width:100%;height:44px;display:block}
      .ecg-line{stroke:var(--ecg);stroke-dasharray:640;stroke-dashoffset:640;animation:sweep 3.4s linear infinite}
      @keyframes sweep{to{stroke-dashoffset:0}}
      @media (prefers-reduced-motion: reduce){.ecg-line{animation:none;stroke-dashoffset:0}.pulse-dot,.blink{animation:none}}
      .vitals{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
      .vital{text-align:center}
      .vital-num{display:block;font-family:'IBM Plex Mono',monospace;font-size:26px;font-weight:600;color:var(--ecg)}
      .vital-lab{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.14em;color:#6FA394}
      .monitor-note{margin-top:10px;font-size:12px;letter-spacing:.1em;color:#8FBCAD}
      /* buttons & bars */
      .btn{background:var(--teal);color:var(--btn-ink);border:none;border-radius:10px;padding:12px 16px;font-family:'Archivo',sans-serif;font-weight:700;font-size:14px;cursor:pointer;margin-top:6px;min-height:44px}
      .btn:disabled{opacity:.4;cursor:default}
      .btn.ghost{background:transparent;color:var(--accent-ink);border:1.5px solid var(--teal)}
      .btn:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      .plan{display:flex;flex-wrap:wrap;gap:8px}
      .row{display:flex;gap:8px;flex-wrap:wrap}
      /* Back / Next / Skip. Sticky so a long stem on a phone does not
         bury the controls under the tab bar. 48px targets, three across. */
      .q-nav-wrap{--q-nav-stick-bottom:calc(62px + env(safe-area-inset-bottom));position:sticky;bottom:var(--q-nav-stick-bottom);z-index:4;background:var(--card);padding:8px 0 2px;margin-top:12px;border-top:1px solid var(--line)}
      .q-nav-wrap.q-nav-flat{position:static}
      .q-skipped{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      .q-skipped-count{margin:0}
      .q-skipped .btn{margin-top:0;min-height:48px;padding:10px 12px;font-size:14px}
      .q-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .q-nav .btn{margin-top:0;min-height:48px;padding:12px 4px;font-size:16px}
      /* Cards use the same row, in the card itself. Sticky would pin it on
         the tab bar, under the labs button. On a phone the labs button
         covers the right edge, so the row stops short of it. */
      .q-nav-wrap.card-nav{position:static;bottom:auto;z-index:auto;background:transparent}
      @media (max-width:640px){.q-nav-wrap.card-nav{padding-right:96px}}
      .opt:disabled,.hl-token:disabled,.mx-cell:disabled{cursor:default}
      .bar{height:8px;background:var(--bar-bg);border-radius:99px;overflow:hidden;margin:8px 0 4px}
      .bar-fill{height:100%;background:var(--teal);border-radius:99px;transition:width .4s}
      .bar-fill.low{background:var(--coral)}
      /* questions — the primary reading surface */
      .q-meta{display:flex;justify-content:space-between;font-size:12px;letter-spacing:.1em;color:var(--muted);margin-bottom:10px;gap:8px;flex-wrap:wrap}
      .stem{font-size:var(--read-size);line-height:var(--read-lh);font-weight:500;margin-bottom:14px}
      .opts{display:flex;flex-direction:column;gap:9px;margin-bottom:8px}
      .opt{display:flex;align-items:flex-start;gap:8px;text-align:left;background:var(--surface);border:1.5px solid var(--line);border-radius:10px;padding:12px 14px;font-family:'Archivo',sans-serif;font-size:14px;line-height:1.5;font-weight:var(--body-weight);cursor:pointer;color:var(--ink)}
      .opt:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      .opt.picked{border-color:var(--teal);background:var(--pick-bg)}
      .opt.right{border-color:var(--teal);background:var(--right-bg);font-weight:600}
      .opt.wrong{border-color:var(--coral);background:var(--wrong-bg)}
      /* NGN: matrix */
      .ngn-matrix{margin-bottom:8px;border:1.5px solid var(--line);border-radius:10px;overflow:hidden}
      .mx-row{display:grid;gap:0;align-items:center;border-top:1px solid var(--line)}
      .mx-row:first-child{border-top:none}
      .mx-row>span{padding:10px 12px}
      .mx-head{background:var(--surface)}
      .mx-colhead{text-align:center;font-size:12px;letter-spacing:.08em}
      .mx-cell{background:var(--surface);border:none;border-left:1px solid var(--line);padding:12px 4px;font-size:16px;cursor:pointer;color:var(--ink)}
      .mx-cell.picked{background:var(--pick-bg);color:var(--accent-ink);font-weight:700}
      .mx-cell{min-height:48px;display:flex;align-items:center;justify-content:center}
      .mx-cell.picked .mx-ck{border-color:var(--teal);box-shadow:inset 0 0 0 5px var(--teal)}
      .mx-cell.right .mx-ck{border-color:var(--teal)}
      .mx-cell.wrong .mx-ck{border-color:var(--danger-ink);box-shadow:inset 0 0 0 5px var(--danger-ink)}
      .mx-cell.right{background:var(--right-bg);color:var(--accent-ink);font-weight:700}
      .mx-cell.wrong{background:var(--wrong-bg);color:var(--coral)}
      /* NGN: bow-tie */
      .bt-cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px}
      @media (max-width:520px){.bt-cols{grid-template-columns:1fr}}
      .bt-col{display:flex;flex-direction:column;gap:6px;background:var(--surface);border:1px dashed var(--line);border-radius:10px;padding:8px}
      .bt-label{margin-bottom:2px;font-size:12px;letter-spacing:.08em}
      .bt-opt{padding:9px 10px;font-size:13px;min-height:44px}
      /* NGN: cloze */
      .cloze-dd{display:inline-block;margin:0 4px;background:var(--surface);color:var(--ink);border:1.5px solid var(--teal);border-radius:8px;padding:6px 8px;font-family:'Archivo',sans-serif;font-size:14px;font-weight:600;max-width:100%}
      .cloze-dd:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      /* header: clickable brand + menu */
      .brand-btn{background:none;border:none;padding:0;min-height:44px;cursor:pointer;color:inherit}
      .brand-btn:focus-visible{outline:3px solid var(--amber);outline-offset:3px;border-radius:6px}
      .menu-btn{font-size:15px;line-height:1;padding:5px 11px}
      .menu-overlay{position:fixed;inset:0;z-index:40}
      .menu-panel{position:absolute;top:100%;right:8px;z-index:42;display:flex;flex-direction:column;min-width:min(280px, calc(100vw - 24px));max-height:min(70vh, 520px);overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 30px rgba(10,25,20,.18)}
      .menu-item{background:none;border:none;border-bottom:1px solid var(--line);text-align:left;padding:13px 16px;font-family:'Archivo',sans-serif;font-size:15px;font-weight:600;color:var(--ink);cursor:pointer}
      .menu-item:last-child{border-bottom:none}
      .menu-item:hover{background:var(--surface)}
      /* lab values drawer */
      .fab{position:fixed;right:14px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:47;width:54px;height:54px;border-radius:50%;background:var(--teal);color:var(--btn-ink);border:none;font-size:22px;cursor:pointer;box-shadow:0 6px 18px rgba(8,20,16,.35);display:flex;align-items:center;justify-content:center;transition:opacity .2s,transform .15s}
      .fab.open{transform:rotate(90deg)}
      .fab-overlay{position:fixed;inset:0;z-index:46}
      .fab-menu{position:fixed;right:14px;bottom:calc(140px + env(safe-area-inset-bottom));z-index:47;display:flex;flex-direction:column;gap:10px;align-items:flex-end}
      .fab-mini{display:flex;align-items:center;gap:8px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:24px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(8,20,16,.25)}
      .lab-overlay{position:fixed;inset:0;background:rgba(8,20,16,.45);z-index:48}
      .lab-drawer{position:fixed;top:0;right:0;bottom:0;width:min(360px,92vw);z-index:49;background:var(--card);border-left:1px solid var(--line);transform:translateX(102%);transition:transform .22s ease;display:flex;flex-direction:column;padding:14px 14px calc(14px + env(safe-area-inset-bottom))}
      .lab-drawer:not(.open){visibility:hidden;transition:transform .22s ease,visibility 0s linear .22s}
      .lab-drawer.open{transform:translateX(0)}
      .lab-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
      .lab-head .eyebrow{margin:0}
      .lab-search{margin:0 0 10px}
      .lab-body{overflow-y:auto;flex:1}
      .lab-group{margin-bottom:14px}
      .lab-group-name{font-size:12px;letter-spacing:.12em;color:var(--accent-ink);margin-bottom:6px}
      .lab-row{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed var(--line);font-size:14px}
      .lab-val{color:var(--accent-ink);font-size:12.5px;text-align:right;white-space:nowrap}
      /* flashcard typed recall */
      .fc-input{margin-top:10px}
      .fc-compare{background:var(--surface);border-left:3px solid var(--amber);padding:8px 10px;border-radius:0 8px 8px 0;margin-top:10px}
      /* highlight + exhibit */
      .hl-box{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px}
      .hl-token{background:var(--surface);border:1.5px solid var(--line);border-radius:8px;padding:8px 11px;font-family:'Archivo',sans-serif;font-size:13.5px;line-height:1.45;color:var(--ink);cursor:pointer;text-align:left}
      .hl-token.picked{border-color:var(--amber);background:var(--pick-bg);box-shadow:inset 0 -3px 0 var(--amber)}
      .hl-token.right{border-color:var(--teal);background:var(--right-bg);font-weight:600}
      .hl-token.wrong{border-color:var(--coral);background:var(--wrong-bg)}
      .exhibit{margin-bottom:12px}
      .exhibit-tab{border:1px solid var(--line);border-radius:10px;margin-bottom:6px;background:var(--surface);overflow:hidden}
      .exhibit-tab summary{padding:10px 12px;font-size:12px;letter-spacing:.06em;font-weight:700;color:var(--accent-ink);cursor:pointer}
      .exhibit-body{white-space:pre-wrap;padding:0 12px 10px;margin:0;font-family:'IBM Plex Mono',monospace;font-size:13px}
      /* focus filter chips + dosage calc */
      .fchips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
      .fchip{background:var(--surface);border:1.5px solid var(--line);border-radius:99px;padding:7px 12px;font-family:'Archivo',sans-serif;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer}
      .fchip.on{border-color:var(--teal);background:var(--pick-bg);color:var(--accent-ink)}
      .calc-box{margin-bottom:8px}
      .calc-input{margin-top:0;max-width:220px;font-size:18px;font-family:'IBM Plex Mono',monospace}
      .calc-unit{font-size:14px;color:var(--accent-ink);font-weight:700}
      /* readiness exams */
      .exam-clock{font-weight:700;color:var(--accent-ink)}
      .exam-clock.low{color:var(--coral)}
      /* content protection: owner's property — deter copy/capture.
         .owner (developer account) is exempt from all of it. */
      .body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
      .body input,.body textarea{-webkit-user-select:text;user-select:text}
      .app.shield .body{filter:blur(16px);transition:filter .15s}
      .app.owner .body{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}
      @media print{.body,.tabs,.lab-drawer,.menu-panel{display:none !important}}
      .trial-banner{border-color:var(--teal);padding:10px 14px}
      .consent-row{display:flex;gap:8px;align-items:flex-start;margin:0 0 6px;cursor:pointer}
      .consent-row input{margin-top:2px;accent-color:var(--teal)}
      .checklist{padding-left:20px;margin:6px 0}
      .checklist li{margin-bottom:7px;line-height:1.5}
      .exam-lock-chip{font-weight:700;font-size:12px;color:var(--coral);letter-spacing:.04em}
      .brand-btn:disabled{cursor:default;opacity:.85}
      .bar-fill.na{background:var(--line)}
      .why-toggle{background:none;border:none;padding:0;margin:4px 0 0;color:var(--accent-ink);font-size:12px;cursor:pointer;text-decoration:underline dotted}
      .why-body{margin-top:6px;padding:8px 10px;background:var(--surface);border-radius:8px}\n      .fc-scale{width:100%;max-width:340px;display:block;margin:8px auto}\n      .fc-pair{display:flex;gap:10px;align-items:center;justify-content:center;margin:8px 0}\n      .fc-arrow{color:var(--accent-ink);font-weight:700}\n      .fc-anti{background:var(--right-bg)}
      .exh-wrap{margin:4px 0 10px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px}
      .exh-svg{width:100%;display:block}
      .vital-range{display:block;font-size:12px;color:var(--ecg);opacity:.75;margin-top:1px}
      /* floating UI never fights the content: fade out while scrolling */
      .app.scrolling .fab{opacity:0;pointer-events:none}
      .exam-head-card{padding:10px 18px}
      /* on-screen calculator */
      .calc-pad{max-width:260px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px;margin-bottom:10px}
      .calc-screen{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px;margin-bottom:8px;text-align:right}
      .calc-pending{display:block;font-size:12px;color:var(--muted);min-height:14px}
      .calc-display{display:block;font-size:22px;font-weight:700;color:var(--ink);overflow:hidden}
      .calc-row{display:flex;gap:6px;margin-bottom:6px}
      .calc-key{flex:1;padding:11px 0;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:600;cursor:pointer}
      .calc-key.op{background:var(--bar-bg);color:var(--accent-ink)}
      .calc-key.eq{flex:3;background:var(--teal);color:var(--btn-ink);border-color:var(--teal)}
      .calc-use{width:100%;margin-top:2px}
      /* worked solution */
      .calc-work{background:var(--surface);border-left:3px solid var(--teal);border-radius:0 8px 8px 0;padding:10px 12px;margin:10px 0}
      .calc-work-line{font-size:13px;line-height:1.7;color:var(--ink);margin:0}
      /* AI lab lookup + report box */
      .lab-ai{background:var(--surface);border:1px dashed var(--line);border-radius:10px;padding:12px;margin:8px 0}
      .report-box{margin-bottom:8px}
      .report-box textarea{margin-top:0;margin-bottom:8px;resize:vertical}
      /* help & contact */
      .help-contact{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:10px;background:var(--surface)}
      .help-contact .small{margin:0}
      .help-contact a{color:var(--accent-ink);font-weight:600}
      .help-chat{display:flex;flex-direction:column;gap:8px;padding-bottom:8px}
      .chat-msg{max-width:88%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.5}
      .chat-msg.you{align-self:flex-end;background:var(--teal);color:var(--btn-ink);border-bottom-right-radius:4px}
      .chat-msg.ai{align-self:flex-start;background:var(--surface);border:1px solid var(--line);color:var(--ink);border-bottom-left-radius:4px;white-space:pre-wrap}
      .help-input{display:flex;gap:8px;padding-top:10px;border-top:1px solid var(--line)}
      .help-input .btn{margin:0}
      /* tour */
      .tour-overlay{position:fixed;inset:0;z-index:60;background:rgba(8,20,16,.45);display:flex;align-items:flex-end;justify-content:center;padding:12px 12px calc(12px + env(safe-area-inset-bottom))}
      .leave-overlay{z-index:80;align-items:center;background:rgba(8,20,16,.62)}
      .tour-card{position:relative;z-index:1;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 16px 14px;max-width:560px;width:100%;max-height:min(58vh, 460px);overflow:auto;text-align:left;box-shadow:0 16px 40px rgba(8,20,16,.28)}
      .tour-card .h2{font-size:18px}
      .tour-card .small{margin-bottom:0}
      .tour-actions{margin-top:12px}
      .tour-actions .btn{min-height:44px;flex:1 1 120px}
      .tour-target{scroll-margin-top:92px;scroll-margin-bottom:72vh;outline:3px solid var(--teal);outline-offset:3px}
      .tour-scroll-room{height:72vh}
      .tour-dots{display:flex;gap:6px;justify-content:flex-start;margin-top:12px;flex-wrap:wrap}
      .tour-dots .dot{width:8px;height:8px;border-radius:99px;background:var(--bar-bg)}
      .tour-dots .dot.on{background:var(--teal)}
      .ord{min-width:20px;height:20px;border-radius:6px;background:var(--teal);color:var(--btn-ink);display:inline-flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
      .ord.dim{background:var(--bar-bg);color:var(--muted)}
      /* feedback: tinted frame carries the verdict; the rationale itself sits on a
         clean card surface so dense reading stays on optimal contrast */
      .feedback{border-radius:12px;padding:14px;margin-top:8px}
      .feedback.ok{background:var(--ok-bg);border:1px solid var(--ok-line)}
      .feedback.no{background:var(--no-bg);border:1px solid var(--no-line)}
      .fb-head{font-size:12px;letter-spacing:.12em;font-weight:600;margin-bottom:8px}
      .feedback.ok .fb-head{color:var(--accent-ink)} .feedback.no .fb-head{color:var(--danger-ink)}
      .rationale{font-size:var(--body-size);line-height:1.7;font-weight:var(--body-weight);color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px}
      /* case study */
      .chart{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
      .chip{background:var(--chip-bg);border:1px solid var(--line);border-radius:8px;padding:5px 8px;font-size:12px;font-weight:600;color:var(--accent-ink)}
      .chip.lab{background:var(--lab-bg);border-color:var(--lab-line);color:var(--lab-ink)}
      .note{font-style:italic}
      /* flashcards */
      .flashcard{width:100%;min-height:170px;background:linear-gradient(160deg,#0C201D,#123A32);color:#EAF6F0;border:none;border-radius:14px;padding:20px;display:flex;flex-direction:column;justify-content:center;gap:12px;cursor:pointer;text-align:center}
      .flashcard:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      .fc-side{font-size:12px;letter-spacing:.18em;color:#6FA394}

      .fc-text{font-size:18px;font-weight:700;line-height:1.5}
      .grades{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
      .grade{margin-top:0;padding:11px 4px;font-size:13px;color:#fff}
      .grade.again{background:var(--danger-ink);color:#fff} .grade.hard{background:var(--amber);color:#3A2A08} .grade.good{background:var(--teal);color:var(--btn-ink)} .grade.easy{background:#0A5A4E;color:#fff}
      .app[data-theme="dim"] .grade.again{color:#1C0E0C}
      .grade{display:flex;flex-direction:column;align-items:center;gap:2px}
      .grade-sub{font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600}
      .btn.danger{background:var(--coral);color:#fff}
      .select{width:100%;margin-top:4px;background:var(--surface);color:var(--ink);border:1.5px solid var(--line);border-radius:10px;padding:12px;font-family:'Archivo',sans-serif;font-size:14px;font-weight:600}
      .select:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      /* today / autopilot */
      .center{text-align:center}
      .bigbtn{width:100%;background:var(--teal);color:var(--btn-ink);border:none;border-radius:16px;padding:22px 16px;font-family:'Archivo',sans-serif;font-size:19px;font-weight:800;letter-spacing:.01em;cursor:pointer;margin:8px 0 10px;box-shadow:0 4px 0 rgba(0,0,0,.12)}
      .bigbtn:active{transform:translateY(2px);box-shadow:0 2px 0 rgba(0,0,0,.12)}
      .bigbtn:focus-visible{outline:3px solid var(--amber);outline-offset:3px}
      .stage-label{text-align:center;margin-bottom:0}
      .rationale.tutor{border-left:4px solid var(--teal)}
      .tutor-btn{margin-bottom:8px;display:block}
      .case-chart-bar > .tutor-btn{margin:0 14px 12px}
      /* Read aloud: a big, obvious Listen button, then small chips for stop,
         speed and auto-read. The part being read gets a soft teal wash
         (follow-along), never a new color. */
      .ra-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:4px 0 12px}
      .ra-main{margin-top:0;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:10px 18px;border-radius:99px;font-size:15px}
      .ra-main:focus-visible,.ra-chip:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      .ra-chip{min-height:36px;background:var(--surface);border:1.5px solid var(--line);border-radius:99px;padding:6px 12px;font-size:12px;font-weight:600;color:var(--accent-ink);cursor:pointer}
      .ra-chip.on{border-color:var(--teal);background:var(--pick-bg)}
      .ra-src{color:var(--muted)}
      .ra-note{flex-basis:100%;color:var(--muted);margin-top:2px}
      .ra-now:not(.flashcard){background:var(--pick-bg);box-shadow:0 0 0 6px var(--pick-bg),0 0 0 8px var(--teal);border-radius:6px;transition:background .2s,box-shadow .2s}
      .opt.ra-now,.hl-token.ra-now{border-color:var(--teal)}
      /* The flashcard keeps its own dark face (its text is light): an outline
         marks it instead of a new background. */
      .flashcard.ra-now{outline:3px solid var(--teal);outline-offset:3px}
      @media (prefers-reduced-motion: reduce){.ra-now{transition:none}}
      /* stats */
      .cat-row{margin-bottom:10px}
      .cat-top{display:flex;justify-content:space-between;gap:8px}
      .cat-top .small{margin-bottom:0}
      /* tabs */
      .tabs{position:fixed;bottom:0;left:0;right:0;max-width:560px;margin:0 auto;display:flex;background:var(--card);border-top:1px solid var(--line);padding:6px 6px calc(6px + env(safe-area-inset-bottom))}
      .tab{flex:1;background:none;border:none;padding:10px 2px;font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.02em;color:var(--tab-ink);cursor:pointer;border-radius:8px;font-weight:600}
      .tab.on{color:var(--accent-ink);background:var(--tab-on)}
      .tab:focus-visible{outline:3px solid var(--amber);outline-offset:-3px}

      /* ===== Flagship UX layer (local prototype) ===== */
      .top{flex-wrap:nowrap;min-height:56px}
      .top-stats{gap:8px}
      .stat-chip{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:6px 12px;border-radius:999px;background:var(--chip-bg);border:1px solid var(--line);color:var(--accent-ink);font-size:13px;font-weight:600;white-space:nowrap}
      .stat-sep{width:1px;height:14px;background:var(--line)}
      .stat-chip.pulse{animation:statPulse .6s ease-out}
      @keyframes statPulse{0%{transform:scale(1)}35%{transform:scale(1.12);box-shadow:0 0 0 4px var(--pick-bg)}100%{transform:scale(1)}}
      .menu-btn{position:relative;z-index:43;min-width:44px;min-height:44px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:18px;border-radius:12px}
      .theme-compact{min-width:44px;min-height:44px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:18px;border-radius:12px}
      .menu-btn:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      .menu-item{min-height:48px}
      /* tab bar: icon + label */
      .tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:54px;padding:6px 2px;font-family:'Archivo',sans-serif;font-size:12px;letter-spacing:0;font-weight:700}
      .tab-ico{display:block}
      .tab-label{display:block;white-space:nowrap;font-size:12px;line-height:1.2}
      .tab.on .tab-ico{transform:translateY(-1px)}
      /* Focus trigger + bottom sheet */
      .focus-bar{display:flex;align-items:center;gap:8px;margin:2px 0 10px}
      .focus-trigger{flex:1;min-width:0;min-height:44px;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);font-family:'Archivo',sans-serif;font-size:14px;font-weight:600;cursor:pointer;text-align:left}
      .focus-trigger.on{border-color:var(--teal);background:var(--pick-bg)}
      .focus-trigger:focus-visible,.focus-clear:focus-visible,.fchip:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      .focus-k{color:var(--accent-ink);font-weight:700}
      .focus-v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .focus-n{min-width:22px;height:22px;border-radius:11px;background:var(--teal);color:var(--btn-ink);font-size:12px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px}
      .focus-caret{color:var(--accent-ink)}
      .focus-clear{min-width:44px;min-height:44px;border-radius:50%;border:1.5px solid var(--line);background:var(--card);color:var(--ink);font-size:15px;cursor:pointer}
      .sheet-overlay{position:fixed;inset:0;z-index:60;background:rgba(8,20,16,.45);display:flex;align-items:flex-end;justify-content:center}
      .sheet{width:100%;max-width:560px;max-height:82vh;overflow:auto;background:var(--card);color:var(--ink);border-radius:20px 20px 0 0;padding:10px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -12px 40px rgba(8,20,16,.3);animation:sheetUp .22s ease-out}
      @keyframes sheetUp{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}
      .sheet-grip{width:44px;height:5px;border-radius:3px;background:var(--line);margin:0 auto 8px}
      .sheet-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .sheet-title{margin:0}
      .sheet-x{margin:0;min-width:44px;min-height:44px;padding:0}
      .sheet-group{margin-top:12px}
      .sheet .fchip{min-height:44px;padding:10px 14px;font-size:14px}
      .sheet .fchip.on::before{content:"✓ "}
      .sheet-actions{position:sticky;bottom:-16px;background:var(--card);padding:12px 0 4px;margin-top:12px}
      .sheet-actions .btn{flex:1;min-height:48px;margin:0}
      .fchips.scroll{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:2px}
      .fchips.scroll::-webkit-scrollbar{display:none}
      .fchips.scroll .fchip{flex:0 0 auto;min-height:44px}
      /* Labs chip in the nav row; the floating button stays off study screens */
      .q-skipped{gap:8px}
      .q-skipped-count{flex:1}
      /* ---- Floating 🧪 study toolkit (draggable, settles clear of every target) ---- */
      .fab.lab-fab{left:0;top:0;right:auto;bottom:auto;touch-action:none;user-select:none;-webkit-user-select:none;
        transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .2s,box-shadow .2s;box-shadow:0 6px 18px rgba(8,20,16,.32),0 0 0 3px var(--card);font-size:24px;cursor:grab}
      .fab.lab-fab.dragging{transition:none;cursor:grabbing;box-shadow:0 12px 28px rgba(8,20,16,.42),0 0 0 3px var(--card)}
      .fab.lab-fab:focus-visible{outline:3px solid var(--accent-ink);outline-offset:3px}
      .app.scrolling .fab.lab-fab{opacity:.25}
      .lab-overlay.tk-overlay{background:rgba(8,20,16,.32)}
      .lab-drawer.toolkit{width:min(420px,94vw);padding:0;gap:0;box-shadow:-12px 0 32px rgba(8,20,16,.18)}
      .tk-grab{display:none}
      .tk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 10px}
      .tk-title{font-size:20px;font-weight:800;letter-spacing:-.01em;color:var(--ink);outline:none}
      .tk-sub{font-size:13px;color:var(--muted);margin-top:2px}
      .tk-close{width:44px;height:44px;flex:none;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:18px;font-weight:700;cursor:pointer}
      .tk-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 16px 10px;padding:4px;border-radius:14px;background:var(--bar-bg)}
      .tk-tab{min-height:44px;border:none;border-radius:10px;background:transparent;color:var(--muted);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
      .tk-tab.on{background:var(--card);color:var(--ink);box-shadow:0 1px 4px rgba(8,20,16,.14)}
      .tk-body{flex:1;overflow-y:auto;padding:0 16px 8px;overscroll-behavior:contain}
      .tk-body [role=tabpanel][hidden]{display:none}
      .tk-help .hp{display:flex;flex-direction:column;min-height:100%}
      .tk-foot{padding:8px 16px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--line);display:flex;justify-content:center}
      .tk-reset{min-height:44px;padding:0 14px;border:none;background:transparent;color:var(--accent-ink);font:inherit;font-size:13px;font-weight:700;cursor:pointer;border-radius:10px}
      .tk-reset:hover{background:var(--surface)}
      .lp-search{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;background:var(--card);border:2px solid var(--teal);border-radius:14px;padding:0 4px 0 12px;margin-bottom:10px;box-shadow:0 4px 12px rgba(8,20,16,.06)}
      .lp-search:focus-within{border-color:var(--accent-ink);box-shadow:0 0 0 3px var(--accent-ink)}
      .lp-search-icon{font-size:20px;color:var(--accent-ink);font-weight:700}
      .lp-input{flex:1;min-width:0;min-height:50px;border:none;background:transparent;color:var(--ink);font:inherit;font-size:16px;outline:none}
      .lp-input::placeholder{color:var(--muted);opacity:1}
      .lp-input::-webkit-search-cancel-button{display:none}
      .lp-clear{width:44px;height:44px;border:none;border-radius:10px;background:var(--surface);color:var(--ink);font-size:15px;font-weight:700;cursor:pointer}
      .lp-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px}
      .lp-count{font-size:13px;color:var(--muted)}
      .lp-all{min-height:44px;padding:0 10px;border:none;background:transparent;color:var(--accent-ink);font:inherit;font-size:13px;font-weight:700;cursor:pointer;border-radius:10px}
      .lp-groups{display:flex;flex-direction:column;gap:8px}
      .lp-group{border:1px solid var(--line);border-radius:14px;background:var(--card);overflow:hidden}
      .lp-group.open{border-color:var(--teal)}
      .lp-group-h{margin:0;font-size:inherit}
      .lp-group-btn{width:100%;min-height:52px;display:flex;align-items:center;gap:10px;padding:0 14px;border:none;background:var(--surface);color:var(--ink);font:inherit;font-size:15px;font-weight:700;text-align:left;cursor:pointer}
      .lp-group-btn:disabled{cursor:default;opacity:1}
      .lp-group-name{flex:1}
      .lp-group-n{min-width:28px;padding:2px 8px;border-radius:999px;background:var(--chip-bg);color:var(--accent-ink);font-size:12px;font-weight:700;text-align:center}
      .lp-chev{color:var(--muted);font-size:14px;width:14px;text-align:center}
      .lp-rows{margin:0;padding:2px 14px 6px}
      .lp-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-height:44px;padding:11px 0;border-top:1px solid var(--line)}
      .lp-row:first-child{border-top:none}
      .lp-row dt{font-size:14px;color:var(--ink);font-weight:500}
      .lp-row dd{margin:0;font-size:13px;font-weight:700;color:var(--accent-ink);text-align:right}
      .lp mark{background:var(--lab-bg);color:var(--ink);border-radius:3px;padding:0 1px}
      .lp-ask{margin-top:4px;padding:16px;border:1px dashed var(--teal);border-radius:14px;background:var(--surface)}
      .lp-ask-title{font-size:15px;font-weight:700;color:var(--ink)}
      .lp-ask-body{font-size:14px;color:var(--muted);margin:4px 0 12px;line-height:1.5}
      .lp-ask-btn{width:100%;min-height:48px;margin:0}
      .lp-ai{margin-top:10px;padding:16px;border-radius:14px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--teal);box-shadow:0 4px 14px rgba(8,20,16,.08)}
      .lp-ai:focus{outline:2px solid var(--accent-ink);outline-offset:2px}
      .lp-ai-eyebrow{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--accent-ink);margin-bottom:8px;overflow-wrap:anywhere}
      .lp-ai-text{font-size:15px;line-height:1.6;color:var(--ink);white-space:pre-wrap}
      .lp-ai-note{font-size:12.5px;color:var(--muted);margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
      .lp-disclaimer{font-size:12.5px;color:var(--muted);margin:14px 2px 6px;line-height:1.5}
      @media (max-width:760px){
        .lab-drawer.toolkit{top:auto;left:0;right:0;bottom:0;width:auto;height:min(80vh,680px);border-left:none;border-top:1px solid var(--line);border-radius:20px 20px 0 0;transform:translateY(104%);box-shadow:0 -12px 32px rgba(8,20,16,.22)}
        .lab-drawer.toolkit.open{transform:translateY(0)}
        .tk-grab{display:block;width:44px;height:5px;border-radius:3px;background:var(--line);margin:8px auto 0}
        .tk-head{padding-top:8px}
      }
      @media (prefers-reduced-motion:reduce){.fab.lab-fab,.lab-drawer.toolkit{transition:none}}
      .app.in-session .q-nav-wrap.card-nav{padding-right:0}
      /* Cards: session progress + flip */
      .card-progress{display:flex;align-items:center;gap:10px;margin-bottom:10px}
      .card-progress .mono{font-size:13px;font-weight:600;color:var(--accent-ink);white-space:nowrap}
      .card-progress .bar{flex:1;margin:0}
      .flashcard.flip-in{animation:cardFlip .32s ease-out}
      @keyframes cardFlip{0%{transform:perspective(900px) rotateY(-80deg);opacity:.4}100%{transform:perspective(900px) rotateY(0);opacity:1}}
      .fc-side{color:#9CC7B9}
      .show-answer{width:100%;min-height:48px;margin-top:10px}
      .undo-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}
      .undo-row .btn{margin:0;min-height:44px}
      /* Correct-answer confirmation */
      .feedback.ok{animation:okIn .45s ease-out}
      @keyframes okIn{0%{transform:scale(.98);box-shadow:0 0 0 0 rgba(14,124,107,.35)}60%{box-shadow:0 0 0 8px rgba(14,124,107,0)}100%{transform:none}}
      .fb-badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--teal);color:var(--btn-ink);font-size:13px;margin-right:8px;vertical-align:-5px}
      .feedback.no .fb-badge{background:var(--danger-ink);color:#fff}
      .app[data-theme="dim"] .feedback.no .fb-badge{color:#2A0E0A}
      .opt.st-picked-correct{animation:pickOk .4s ease-out}
      @keyframes pickOk{0%{transform:scale(1)}40%{transform:scale(1.015)}100%{transform:scale(1)}}
      /* Real check boxes / radios on choice rows */
      .ck{flex:0 0 22px;width:22px;height:22px;margin-top:1px;border:2px solid var(--muted);border-radius:6px;background:var(--card);display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;line-height:1;color:var(--btn-ink)}
      .ck.radio{border-radius:50%}
      .opt.picked .ck{border-color:var(--teal);background:var(--teal)}
      .opt.picked .ck.radio{background:var(--card);box-shadow:inset 0 0 0 4px var(--teal)}
      .opt-text{flex:1}
      .st-badge{display:block;margin-top:4px;font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600;letter-spacing:.02em}
      .opt.st-picked-correct{border-color:var(--teal);background:var(--right-bg)}
      .opt.st-picked-correct .st-badge{color:var(--accent-ink)}
      .opt.st-missed{border:2px dashed var(--amber);background:var(--lab-bg);font-weight:600}
      .opt.st-missed .st-badge{color:var(--lab-ink)}
      .opt.st-missed .ck{border-color:var(--lab-ink);border-style:dashed;background:var(--card)}
      .opt.st-wrong{border-color:var(--coral);background:var(--wrong-bg)}
      .opt.st-wrong .st-badge{color:var(--danger-ink)}
      .opt.st-wrong .ck{border-color:var(--danger-ink);background:var(--danger-ink);color:#fff}
      .app[data-theme="dim"] .opt.st-wrong .ck{color:#2A0E0A}
      .choice-legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin:8px 0 0}
      .choice-legend span{font-size:12px;font-weight:600}
      .lg-ok{color:var(--accent-ink)} .lg-miss{color:var(--lab-ink)} .lg-wrong{color:var(--danger-ink)}
      /* Case study: sticky patient chart */
      .case-chart-bar{position:sticky;top:60px;z-index:20;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 6px 16px rgba(8,20,16,.10)}
      .case-chart-toggle{width:100%;min-height:48px;display:flex;align-items:center;gap:8px;padding:10px 14px;background:none;border:none;color:var(--ink);font-family:'Archivo',sans-serif;font-size:14px;font-weight:700;cursor:pointer;text-align:left}
      .case-chart-toggle:focus-visible{outline:3px solid var(--amber);outline-offset:-3px;border-radius:14px}
      .case-chart-sum{flex:1;min-width:0;font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .case-chart-body{padding:0 14px 12px;max-height:46vh;overflow:auto}
      .case-chart-bar:not(.open) .case-chart-body{display:none}
      .stat-hero{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:4px}
      .stat-hero > div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px}
      .stat-big{display:block;font-size:24px;font-weight:600;color:var(--accent-ink);line-height:1.2}
      .stat-cap{display:block;font-size:12px;color:var(--muted);margin-top:2px}
      @media (min-width:1024px){.stat-hero{grid-template-columns:repeat(4,minmax(0,1fr))}}
      .case-main{min-width:0}
      .step-progress{display:flex;gap:4px;margin:0 0 10px}
      .step-progress span{flex:1;height:5px;border-radius:3px;background:var(--bar-bg)}
      .step-progress span.done{background:var(--teal)}
      .step-progress span.now{background:var(--amber)}
      .kbd-hint{display:none}
      @media (hover:hover) and (pointer:fine){.kbd-hint{display:block}}
      /* Desktop: a wider canvas and two columns where it helps */
      @media (min-width:1024px){
        .app{max-width:1120px}
        .tabs{max-width:1120px}
        .body{padding:24px 32px 110px}
        .study-col{max-width:780px;margin:0 auto;width:100%}
        .today-home{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}
        .today-home > *{grid-column:1}
        .today-home > .stack{grid-column:2;grid-row:1 / span 4}
        .stats-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
        .stats-grid > .wide{grid-column:1 / -1}
        .case-layout{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:18px;align-items:start}
        .case-layout .case-chart-bar{top:76px}
        .case-layout .case-chart-body{max-height:calc(100vh - 220px)}
        .case-layout .case-chart-bar .case-chart-body{display:block}
        .case-layout .case-chart-toggle{pointer-events:none}
        .case-layout .case-chart-toggle span[aria-hidden="true"]:last-child{display:none}
        .sheet-overlay{align-items:center}
        .sheet{border-radius:20px;max-width:620px}
      }
      @media (prefers-reduced-motion: reduce){
        .stat-chip.pulse,.flashcard.flip-in,.feedback.ok,.opt.st-picked-correct,.sheet{animation:none}
      }
    `}</style>
  );
}
