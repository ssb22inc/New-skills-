/* Hand-written NGN sample items — one per NGN type (PULSERN_PROMPTS Prompt 6).
   Serve as offline fallback content so all six item types work without the
   bank, and as the payload for ops/insert-ngn-samples.mjs. Ids 901-903 are
   outside the bank range, so no telemetry fires for them.
   H7 applies: these need formal RN sign-off before public launch. */

/* Dosage-calculation starter items (ids 904+, hand-written; H7 review
   applies). All are classic dimensional-analysis practice scenarios in an
   exam-prep register. */
export const CALC_SAMPLES = [
  {
    id: 904, cat: "Pharmacology", diff: 1, type: "calc",
    stem: "In this practice scenario, a provider prescribes 1,000 mL of 0.9% sodium chloride to infuse over 8 hours by infusion pump. At how many mL/hr should the nurse set the pump? (Record the whole number.)",
    extra: {
      unit: "mL/hr", tolerance: 0,
      work: [
        "Formula: pump rate (mL/hr) = total volume (mL) ÷ time (hr)",
        "= 1,000 mL ÷ 8 hr",
        "= 125 mL/hr",
      ],
    },
    answer: 125,
    rationale: "Volume ÷ time in hours: 1,000 mL ÷ 8 hr = 125 mL/hr. Pump rates are set in mL/hr, so no drop factor is involved — drop factors only apply to gravity tubing.",
  },
  {
    id: 905, cat: "Pharmacology", diff: 2, type: "calc",
    stem: "In this practice scenario, 600 mL of lactated Ringer's is prescribed to infuse over 5 hours by gravity. The tubing's drop factor is 15 gtt/mL. At how many gtt/min should the nurse regulate the infusion? (Record the whole number.)",
    extra: {
      unit: "gtt/min", tolerance: 0,
      work: [
        "Formula: gtt/min = (volume (mL) × drop factor (gtt/mL)) ÷ time (min)",
        "Convert time: 5 hr × 60 = 300 min",
        "= (600 mL × 15 gtt/mL) ÷ 300 min",
        "= 9,000 ÷ 300 = 30 gtt/min",
      ],
    },
    answer: 30,
    rationale: "Rate = (volume × drop factor) ÷ minutes: (600 mL × 15 gtt/mL) ÷ 300 min = 9,000 ÷ 300 = 30 gtt/min. Converting 5 hours to 300 minutes first is the step most students miss.",
  },
  {
    id: 906, cat: "Pharmacology", diff: 1, type: "calc",
    stem: "In this practice scenario, digoxin 0.25 mg by mouth daily is prescribed. The pharmacy supplies 0.125 mg tablets. How many tablets should the nurse administer per dose? (Record the whole number.)",
    extra: {
      unit: "tablet(s)", tolerance: 0,
      work: [
        "Formula: tablets = desired dose ÷ dose on hand",
        "= 0.25 mg ÷ 0.125 mg per tablet",
        "= 2 tablets",
      ],
    },
    answer: 2,
    rationale: "Desired ÷ have: 0.25 mg ÷ 0.125 mg = 2 tablets. A quick reasonableness check — the ordered dose is exactly double the tablet strength — confirms the math before giving more than one tablet.",
  },
  {
    id: 907, cat: "Pharmacology", diff: 2, type: "calc",
    stem: "In this practice scenario, a medication is prescribed at 8 mg/kg/day divided every 12 hours for a child weighing 30 kg. How many mg should the nurse administer per dose? (Record the whole number.)",
    extra: {
      unit: "mg", tolerance: 0,
      work: [
        "Step 1 — total daily dose: 8 mg/kg/day × 30 kg = 240 mg/day",
        "Step 2 — every 12 hours = 2 doses per day",
        "= 240 mg ÷ 2 = 120 mg per dose",
      ],
    },
    answer: 120,
    rationale: "Daily dose = 8 mg/kg × 30 kg = 240 mg/day. Divided every 12 hours means two doses per day: 240 ÷ 2 = 120 mg per dose. Weight-based orders are calculated per day first, then split per dose.",
  },
];

/* Test-plan coverage starters (ids 908+, hand-written; H7 review applies):
   items for the two categories added in the NCSBN alignment (Basic Care &
   Comfort, Health Promotion & Maintenance), two NGN highlight items, and
   one chart/exhibit item. */
export const COVERAGE_SAMPLES = [
  {
    id: 908, cat: "Basic Care & Comfort", diff: 1, type: "mc",
    stem: "A nurse is caring for a client on the first day after a total hip arthroplasty performed through a posterior approach. Which position of the operative leg should the nurse maintain?",
    options: [
      "Abduction, maintained with an abduction pillow between the legs",
      "Adduction past the midline with the ankles crossed",
      "Hip flexion greater than 90 degrees while sitting up in a chair",
      "Internal rotation with the leg unsupported",
    ],
    answer: 0,
    rationale: "After a posterior-approach hip replacement the joint dislocates with adduction past midline, hip flexion beyond 90 degrees, and internal rotation — exactly the three distractors. An abduction pillow keeps the hip in safe alignment while soft tissue heals.",
  },
  {
    id: 909, cat: "Basic Care & Comfort", diff: 2, type: "sata",
    stem: "The nurse is teaching an adult client with chronic insomnia about sleep-promoting habits. Which recommendations should the nurse include? Select all that apply.",
    options: [
      "Wake up at the same time every day, including weekends",
      "Avoid caffeine in the afternoon and evening",
      "Exercise vigorously in the hour before bedtime",
      "Use the bed only for sleep and intimacy",
      "Take long daytime naps to make up lost sleep",
      "Keep the bedroom dark, quiet, and cool",
    ],
    answer: [0, 1, 3, 5],
    rationale: "Consistent wake times anchor the circadian rhythm; late caffeine and vigorous late-evening exercise are stimulating and delay sleep onset; restricting the bed to sleep strengthens the bed-sleep association; long daytime naps reduce nighttime sleep pressure; and a dark, quiet, cool room supports deeper sleep.",
  },
  {
    id: 910, cat: "Basic Care & Comfort", diff: 1, type: "mc",
    stem: "The nurse observes a client who has left-leg weakness ambulating with a cane. Which observation indicates correct technique?",
    options: [
      "The client holds the cane on the right side and moves it forward together with the left leg",
      "The client holds the cane on the left side and moves it forward together with the left leg",
      "The client holds the cane on the right side and moves it forward together with the right leg",
      "The client carries the cane and only touches it down when losing balance",
    ],
    answer: 0,
    rationale: "The cane is held on the STRONG side and advances together with the weak leg, widening the base of support when the weak leg bears weight. Holding it on the weak side or advancing it with the strong leg removes that support, and using it only for catching a fall defeats its purpose.",
  },
  {
    id: 911, cat: "Health Promotion & Maintenance", diff: 1, type: "mc",
    stem: "During an annual wellness visit, an adult client asks the nurse how often the influenza vaccine should be received. Which response is correct?",
    options: [
      "Every year, ideally before the start of influenza season",
      "Once every five years with other routine boosters",
      "Only after a known exposure to influenza",
      "A single dose in adulthood provides lifelong protection",
    ],
    answer: 0,
    rationale: "Influenza vaccination is recommended annually for adults because circulating strains change and immunity wanes; timing it before flu season gives the best protection. The distractors describe schedules that apply to other vaccines or to post-exposure prophylaxis, not routine influenza prevention.",
  },
  {
    id: 912, cat: "Health Promotion & Maintenance", diff: 2, type: "sata",
    stem: "A nurse is reviewing routine health screenings with a 50-year-old client at average risk. Which screenings should the nurse recommend? Select all that apply.",
    options: [
      "Colorectal cancer screening",
      "Blood pressure measurement at least annually",
      "Lipid panel at recommended intervals",
      "Annual screening chest x-ray",
      "Routine antibiotic prophylaxis before dental cleanings",
    ],
    answer: [0, 1, 2],
    rationale: "At 50, average-risk adults should be in colorectal screening, have blood pressure checked at least yearly, and have lipids assessed at recommended intervals. Screening chest x-rays are not recommended for average-risk adults, and antibiotic prophylaxis before dental care is reserved for specific cardiac conditions — not routine prevention.",
  },
  {
    id: 913, cat: "Physiological Adaptation", diff: 2, type: "highlight",
    stem: "A nurse reviews the 0700 hand-off report for a client who had abdominal surgery 12 hours ago. Highlight each finding that requires follow-up.",
    extra: {
      tokens: [
        "Temperature 38.9 °C (102 °F)",
        "heart rate 118/min",
        "respiratory rate 18/min",
        "blood pressure 118/74 mm Hg",
        "urine output 20 mL/hr over the past 2 hours",
        "incision edges approximated with scant serous drainage",
        "pain rated 3/10 after analgesia",
      ],
    },
    answer: [0, 1, 4],
    rationale: "A fever of 38.9 °C with tachycardia this early suggests infection, atelectasis, or hypovolemia and needs assessment; urine output below 30 mL/hr signals inadequate renal perfusion. The respiratory rate, blood pressure, incision appearance, and controlled pain are expected postoperative findings.",
  },
  {
    id: 914, cat: "Pharmacology", diff: 2, type: "highlight",
    stem: "A client who takes digoxin and furosemide is being assessed. Highlight each finding that increases concern for digoxin toxicity.",
    extra: {
      tokens: [
        "reports seeing yellow-green halos around lights",
        "nausea and loss of appetite since yesterday",
        "apical pulse 52/min and irregular",
        "blood pressure 128/78 mm Hg",
        "walked in the hallway twice today",
        "serum potassium 3.0 mEq/L",
      ],
    },
    answer: [0, 1, 2, 5],
    rationale: "Visual halos, gastrointestinal upset, and a slow irregular pulse are classic digoxin-toxicity findings, and hypokalemia — a common effect of furosemide — potentiates digoxin's action, raising toxicity risk. The blood pressure and activity tolerance are unremarkable.",
  },
  {
    id: 915, cat: "Reduction of Risk", diff: 2, type: "mc",
    stem: "The nurse reviews the client's chart before the 0900 medication pass. Which prescription should the nurse question?",
    extra: {
      exhibit: [
        { label: "Laboratory results — 0600", content: "Potassium 6.1 mEq/L (3.5–5.0)\nSodium 138 mEq/L (136–145)\nCreatinine 2.1 mg/dL (0.5–1.2)\nBUN 32 mg/dL (10–20)" },
        { label: "Vital signs — 0800", content: "BP 142/88 mm Hg · HR 76/min · RR 16/min · SpO₂ 97% on room air" },
      ],
    },
    options: [
      "Spironolactone 25 mg by mouth daily",
      "Insulin lispro subcutaneous per sliding scale",
      "Pantoprazole 40 mg by mouth daily",
      "Acetaminophen 650 mg by mouth as needed",
    ],
    answer: 0,
    rationale: "The chart shows hyperkalemia (6.1) with rising creatinine and BUN. Spironolactone is potassium-sparing — giving it would drive the potassium higher in a client with impaired renal clearance, so it is the prescription to question. Insulin lispro can actually shift potassium into cells, and the other medications don't affect potassium.",
  },
];

export const NGN_SAMPLES = [
  {
    id: 901, cat: "Safety & Infection Control", diff: 2, type: "matrix",
    stem: "A client is admitted with active pulmonary tuberculosis. For each measure, indicate whether it is required or not required when caring for this client.",
    extra: {
      rows: [
        "Wear a fit-tested N95 respirator when entering the room",
        "Place the client in a negative-pressure single room",
        "Wear sterile gloves when taking routine vital signs",
      ],
      columns: ["Required", "Not required"],
    },
    answer: [0, 0, 1],
    rationale: "Active pulmonary TB requires airborne precautions: a fit-tested N95 (or higher) respirator for anyone entering, and a negative-pressure airborne-infection isolation room. Routine vital signs call for standard precautions only — clean hands, and gloves only if contact with body fluids is expected; sterile gloves are for sterile procedures, not routine care.",
  },
  {
    id: 902, cat: "Physiological Adaptation", diff: 3, type: "bowtie",
    stem: "Two days after abdominal surgery, a client suddenly reports pleuritic chest pain and shortness of breath. Respirations 32/min, heart rate 118/min, SpO2 88% on room air. Complete the diagram: choose the 2 actions to take, the 1 condition the client is most likely experiencing, and the 2 parameters to monitor.",
    extra: {
      actions: [
        "Apply supplemental oxygen",
        "Raise the head of the bed to high-Fowler's",
        "Vigorously massage the client's calves",
        "Assist the client to ambulate in the hallway",
        "Encourage use of the incentive spirometer and reassess in an hour",
      ],
      conditions: ["Pulmonary embolism", "Incisional pain", "Anxiety reaction", "Early pneumonia"],
      parameters: ["Oxygen saturation", "Respiratory rate and work of breathing", "Bowel sounds", "Pupillary response", "Urine color"],
    },
    answer: { actions: [0, 1], condition: 0, parameters: [0, 1] },
    rationale: "Sudden pleuritic chest pain, tachypnea, tachycardia, and hypoxemia in a postoperative client are classic for pulmonary embolism. The nurse applies oxygen and positions the client upright to maximize oxygenation, then monitors oxygen saturation and respiratory status closely. Massaging the calves could dislodge further clot, ambulating an unstable hypoxic client is unsafe, and waiting an hour delays urgent intervention.",
  },
  {
    id: 903, cat: "Pharmacology", diff: 2, type: "cloze",
    stem: "A client receiving a continuous IV heparin infusion has an aPTT of 110 seconds (therapeutic goal 46–70 seconds). The nurse should first {0}, and anticipate that the provider may order {1} if serious bleeding develops.",
    extra: {
      dropdowns: [
        ["pause the infusion and notify the provider", "increase the infusion rate", "document the value and continue the infusion"],
        ["protamine sulfate", "vitamin K", "naloxone"],
      ],
    },
    answer: [0, 0],
    rationale: "An aPTT well above the therapeutic range means the client is over-anticoagulated and at bleeding risk: the infusion is paused per protocol and the provider notified. Protamine sulfate is the reversal agent for heparin; vitamin K reverses warfarin, and naloxone reverses opioids, so neither addresses heparin excess.",
  },
];
