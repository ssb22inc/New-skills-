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
    extra: { unit: "mL/hr", tolerance: 0 },
    answer: 125,
    rationale: "Volume ÷ time in hours: 1,000 mL ÷ 8 hr = 125 mL/hr. Pump rates are set in mL/hr, so no drop factor is involved — drop factors only apply to gravity tubing.",
  },
  {
    id: 905, cat: "Pharmacology", diff: 2, type: "calc",
    stem: "In this practice scenario, 600 mL of lactated Ringer's is prescribed to infuse over 5 hours by gravity. The tubing's drop factor is 15 gtt/mL. At how many gtt/min should the nurse regulate the infusion? (Record the whole number.)",
    extra: { unit: "gtt/min", tolerance: 0 },
    answer: 30,
    rationale: "Rate = (volume × drop factor) ÷ minutes: (600 mL × 15 gtt/mL) ÷ 300 min = 9,000 ÷ 300 = 30 gtt/min. Converting 5 hours to 300 minutes first is the step most students miss.",
  },
  {
    id: 906, cat: "Pharmacology", diff: 1, type: "calc",
    stem: "In this practice scenario, digoxin 0.25 mg by mouth daily is prescribed. The pharmacy supplies 0.125 mg tablets. How many tablets should the nurse administer per dose? (Record the whole number.)",
    extra: { unit: "tablet(s)", tolerance: 0 },
    answer: 2,
    rationale: "Desired ÷ have: 0.25 mg ÷ 0.125 mg = 2 tablets. A quick reasonableness check — the ordered dose is exactly double the tablet strength — confirms the math before giving more than one tablet.",
  },
  {
    id: 907, cat: "Pharmacology", diff: 2, type: "calc",
    stem: "In this practice scenario, a medication is prescribed at 8 mg/kg/day divided every 12 hours for a child weighing 30 kg. How many mg should the nurse administer per dose? (Record the whole number.)",
    extra: { unit: "mg", tolerance: 0 },
    answer: 120,
    rationale: "Daily dose = 8 mg/kg × 30 kg = 240 mg/day. Divided every 12 hours means two doses per day: 240 ÷ 2 = 120 mg per dose. Weight-based orders are calculated per day first, then split per dose.",
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
