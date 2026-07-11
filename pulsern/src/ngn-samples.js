/* Hand-written NGN sample items — one per NGN type (PULSERN_PROMPTS Prompt 6).
   Serve as offline fallback content so all six item types work without the
   bank, and as the payload for ops/insert-ngn-samples.mjs. Ids 901-903 are
   outside the bank range, so no telemetry fires for them.
   H7 applies: these need formal RN sign-off before public launch. */

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
