import { useState, useMemo, useEffect } from "react";

/* ================= DATA ================= */

const CATS = [
  "Management of Care",
  "Safety & Infection Control",
  "Pharmacology",
  "Physiological Adaptation",
  "Reduction of Risk",
  "Psychosocial & Health Promotion",
];

const QUESTIONS = [
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
    options: ["Protamine sulfate IV", "An increased warfarin dose", "Vitamin K and holding the next warfarin dose", "A unit of packed red blood cells"],
    answer: 2,
    rationale: "The usual therapeutic INR on warfarin is 2–3. At 4.8 the client is over-anticoagulated, so the antidote vitamin K is anticipated along with holding warfarin. Protamine sulfate reverses heparin, not warfarin. Increasing the dose would worsen bleeding risk, and PRBCs are not indicated without hemorrhage or anemia.",
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
    id: 19, cat: "Psychosocial & Health Promotion", diff: 1, type: "mc",
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
    id: 20, cat: "Psychosocial & Health Promotion", diff: 3, type: "mc",
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

const CASE_STUDY = {
  title: "NGN Case Study · Deteriorating Client",
  intro: "0730 · Medical unit. Mr. Alvarez, 68, admitted yesterday with community-acquired pneumonia. Night shift reports he 'seemed more tired than usual.'",
  vitals: [
    ["Temp", "38.9 °C"], ["HR", "118/min"], ["BP", "92/58"], ["RR", "28/min"], ["SpO₂", "89% RA"],
  ],
  labs: [["WBC", "16,400/µL"], ["Lactate", "3.1 mmol/L"]],
  note: "Client is drowsy but arousable, oriented to name only. Skin warm and flushed. Crackles in the right lower lobe. Urine output 90 mL over the past 6 hours.",
  steps: [
    {
      phase: "Recognize Cues", type: "sata",
      stem: "Which findings require immediate follow-up? Select all that apply.",
      options: ["Temperature 38.9 °C", "Blood pressure 92/58", "New disorientation and drowsiness", "SpO₂ 89% with RR 28", "Crackles in the right lower lobe", "Lactate 3.1 mmol/L"],
      answer: [1, 2, 3, 5],
      rationale: "Fever and localized crackles are expected with pneumonia. The alarming pattern is what's new and systemic: hypotension, altered mentation, hypoxia with tachypnea, and an elevated lactate — together these signal poor perfusion, not just infection.",
    },
    {
      phase: "Analyze & Prioritize", type: "mc",
      stem: "Based on the assessment, which complication is the client most likely developing?",
      options: ["Fluid volume overload", "Sepsis progressing toward septic shock", "Pulmonary embolism", "Hypoglycemia"],
      answer: 1,
      rationale: "A known infection plus fever, tachycardia, tachypnea, elevated WBC, hypotension, rising lactate, falling urine output, and new confusion is the classic trajectory of sepsis moving toward septic shock. Overload would show edema and hypertension; PE typically presents with sudden pleuritic pain; nothing supports hypoglycemia.",
    },
    {
      phase: "Take Action", type: "sata",
      stem: "Which actions should the nurse take? Select all that apply.",
      options: [
        "Apply supplemental oxygen and titrate to prescribed saturation",
        "Notify the rapid response team / provider immediately",
        "Anticipate blood cultures before broad-spectrum antibiotics",
        "Anticipate an IV fluid bolus as prescribed",
        "Delay antibiotics until the chest x-ray is repeated",
      ],
      answer: [0, 1, 2, 3],
      rationale: "Sepsis care is time-critical: support oxygenation, escalate immediately, obtain cultures before antibiotics (without delaying them), and restore perfusion with fluids. Holding antibiotics for repeat imaging violates the hour-one bundle and worsens mortality.",
    },
  ],
};

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

const LEVELS = [
  [0, "Student Nurse"], [80, "New Grad"], [200, "Staff Nurse"], [380, "Preceptor"], [600, "Charge Nurse"], [900, "Nurse Educator"],
];

/* ================= HELPERS ================= */

const same = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
const sameOrder = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

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
import { fmtLocal, todayStr, yesterdayStr, twoDaysAgoStr, addDays } from "./dates.js";
import { supabase } from "./supabase.js";
import { emptyAbility, updateAbility, itemRating, readinessFrom, pickTargetRating } from "./ability-engine.js";
import { migrateBlob } from "./state.js";
import { ngnExt, scoreMatrix, scoreBowtie, scoreCloze, validQ } from "./ngn.js";
import { NGN_SAMPLES } from "./ngn-samples.js";

const STORE_KEY = "pulsern-v1";

/* ---- STORAGE ADAPTER ---------------------------------------------------
   The app touches persistence ONLY through `store`. To migrate platforms,
   replace this one object — nothing else in the app changes:

   • Artifact/preview (default below): window.storage
   • Plain web:        localStorage.getItem/setItem/removeItem
   • React Native:     @react-native-async-storage/async-storage
   • Cloud sync:       Supabase/Firebase row keyed by user id
   Each method returns/accepts a JSON string and is async-safe.
------------------------------------------------------------------------ */
const store = {
  async get(key) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase.from("progress")
      .select("blob").eq("user_id", session.user.id).eq("key", key).maybeSingle();
    if (error || !data) return null;
    return JSON.stringify(data.blob);
  },
  async set(key, value) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("progress").upsert({
      user_id: session.user.id, key, blob: JSON.parse(value),
      updated_at: new Date().toISOString(),
    });
  },
  async delete(key) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("progress").delete().eq("user_id", session.user.id).eq("key", key);
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
  { id: "claude", name: "Claude Sonnet — Anthropic (US)", builtin: true, note: "Routed through the PulseRN server — no key on your device." },
  { id: "gpt", name: "GPT series — OpenAI (US)", builtin: true, note: "Routed through the PulseRN server — no key on your device." },
  { id: "deepseek", name: "DeepSeek V3/R1 (China)", builtin: true, note: "Lowest cost tier. Routed through the PulseRN server." },
  { id: "qwen", name: "Qwen — Alibaba (China)", builtin: true, note: "Routed through the PulseRN server — no key on your device." },
  { id: "kimi", name: "Kimi — Moonshot (China)", builtin: true, note: "Routed through the PulseRN server — no key on your device." },
];

async function askModel(providerId, prompt, maxTokens = 1000) {
  const p = AI_PROVIDERS.find((x) => x.id === providerId) || AI_PROVIDERS[0];
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: p.id, prompt, maxTokens }),
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

const freshCards = () => CARDS.map(() => ({ interval: 0, due: todayStr() }));

/* ================= APP ================= */

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState("light");
  const [tab, setTab] = useState("today");
  const [xp, setXp] = useState(0);
  const [run, setRun] = useState(0);        // consecutive correct answers (session)
  const [bestRun, setBestRun] = useState(0);
  const [log, setLog] = useState([]);        // {id, cat, diff, correct}
  const [flagged, setFlagged] = useState([]);
  const [streak, setStreak] = useState({ count: 0, lastDay: null, shield: true }); // real day streak + one-miss shield
  const [daily, setDaily] = useState({ day: todayStr(), answered: 0 });

  const [srs, setSrs] = useState(freshCards); // per-card {interval, due}
  const [customQs, setCustomQs] = useState([]); // AI-generated questions
  const [provider, setProvider] = useState("claude");
  const [ability, setAbility] = useState(() => emptyAbility(CATS)); // Elo θ per category
  const [plan, setPlan] = useState(null);           // weekly planner cache (§5.7)
  const [calibration, setCalibration] = useState({}); // bank item ratings {id: {rating}}
  const [bankQs, setBankQs] = useState(null);       // shared bank; null → offline fallback

  /* ---- load saved progress once ---- */
  useEffect(() => {
    (async () => {
      try {
        const raw = await store.get(STORE_KEY);
        if (raw) {
          const s = migrateBlob(JSON.parse(raw), CATS); // legacy saves get defaults (§4)
          setTheme(s.theme);
          setXp(s.xp);
          setBestRun(s.bestRun);
          setLog(s.log);
          setFlagged(s.flagged);
          setStreak(s.streak);
          const d = s.daily ?? { day: todayStr(), answered: 0 };
          setDaily(d.day === todayStr() ? d : { day: todayStr(), answered: 0 });
          if (s.srs.length) {
            // Merge saved schedule with current card list: keep existing
            // intervals, seed fresh entries for any cards added in an update.
            setSrs(CARDS.map((_, i) => s.srs[i] ?? { interval: 0, due: todayStr() }));
          }
          setCustomQs(s.customQs);
          setProvider(s.provider);
          setAbility(s.ability);
          setPlan(s.plan);
        }
      } catch (e) {
        /* first visit — nothing saved yet */
      }
      setLoaded(true);
    })();
  }, []);

  /* ---- autosave on change ---- */
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await store.set(STORE_KEY, JSON.stringify({ theme, xp, bestRun, log, flagged, streak, daily, srs, customQs, provider, ability, plan }));
      } catch (e) {
        console.error("Save failed", e);
      }
    })();
  }, [loaded, theme, xp, bestRun, log, flagged, streak, daily, srs, customQs, provider, ability, plan]);

  /* ---- shared bank + item calibration (one query feeds both) ----
     RLS serves only approved, non-rejected rows. On any failure the
     built-in local array stays in place as the offline fallback. */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("questions")
        .select("id, cat, diff, type, stem, options, extra, answer, rationale, ai, elo_rating")
        .eq("approved", true);
      if (error || !Array.isArray(data) || !data.length) return;
      setCalibration(Object.fromEntries(data.map((r) => [r.id, { rating: r.elo_rating }])));
      const items = data
        .map(({ elo_rating, ...q }) => q)
        .filter(validQ);
      if (items.length) setBankQs(items);
    })();
  }, []);

  const answeredIds = log.map((l) => l.id);
  const acc = log.length ? log.filter((l) => l.correct).length / log.length : 0;

  // Elo/Rasch readiness: {pct, low, high, theta, weakest} or null under 12 answers
  const readiness = useMemo(() => readinessFrom(ability, log), [ability, log]);

  const readyLabel = readiness == null
    ? (log.length ? `Estimating — ${12 - log.length} more answers needed` : "No data yet")
    : readiness.pct >= 75 ? "High (estimate) — trending above passing standard"
    : readiness.pct >= 55 ? "Borderline (estimate) — keep drilling weak areas"
    : "Below passing standard (estimate) — focus review";

  const touchDay = () => {
    setDaily((d) => d.day === todayStr() ? { ...d, answered: d.answered + 1 } : { day: todayStr(), answered: 1 });
    setStreak((s) => {

      if (s.lastDay === todayStr()) return s;
      if (s.lastDay === yesterdayStr()) {
        const n = s.count + 1;
        return { count: n, lastDay: todayStr(), shield: s.shield || n % 7 === 0 };
      }
      if (s.lastDay === twoDaysAgoStr() && s.shield) {
        // missed exactly one day — the shield absorbs it
        return { count: s.count + 1, lastDay: todayStr(), shield: false };
      }
      return { count: 1, lastDay: todayStr(), shield: s.shield ?? true };
    });
  };

  const record = (q, correct) => {
    setLog((l) => [...l, { id: q.id, cat: q.cat, diff: q.diff, correct }]);
    touchDay();
    const { ability: nextAbility, itemDelta } = updateAbility(ability, q, correct, calibration);
    setAbility(nextAbility);
    // Fire-and-forget item telemetry — bank items only (case-study pseudo-ids
    // and locally-generated questions aren't in the shared bank).
    if (calibration[q.id] !== undefined) {
      fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: q.id, correct, itemDelta }),
      }).catch(() => {});
    }
    if (correct) {
      setXp((x) => x + 10 * q.diff);
      setRun((r) => { const n = r + 1; setBestRun((b) => Math.max(b, n)); return n; });
    } else setRun(0);
  };

  const catStats = CATS.map((c) => {
    const rows = log.filter((l) => l.cat === c);
    return { cat: c, n: rows.length, pct: rows.length ? Math.round((rows.filter(r => r.correct).length / rows.length) * 100) : null };
  });

  const dueCount = srs.filter((c) => c.due <= todayStr()).length;
  const allQuestions = useMemo(
    () => [...(bankQs ?? [...QUESTIONS, ...NGN_SAMPLES]), ...customQs],
    [bankQs, customQs]
  );
  const addQuestions = (qs) => setCustomQs((c) => [...c, ...qs]);

  const resetAll = async () => {
    try { await store.delete(STORE_KEY); } catch (e) { /* nothing saved */ }
    setXp(0); setRun(0); setBestRun(0); setLog([]); setFlagged([]); setCustomQs([]);
    setStreak({ count: 0, lastDay: null, shield: true }); setDaily({ day: todayStr(), answered: 0 });
    setSrs(freshCards()); setTab("today");
  };

  if (!loaded) return (
    <div className="app" data-theme={theme}>
      <Style />
      <div className="body"><section className="card"><p className="eyebrow">PulseRN</p><p className="small">Loading your saved progress…</p></section></div>
    </div>
  );

  return (
    <div className="app" data-theme={theme}>
      <Style />
      <header className="top">
        <div className="brand">
          <span className="pulse-dot" aria-hidden="true" />
          <span className="brand-name">PULSE<em>RN</em></span>
        </div>
        <div className="top-stats mono">
          <span title="Experience points">◆ {xp} XP</span>
          <span title="Day streak">🔥 {streak.count}</span>
          <button
            className="theme-btn"
            onClick={() => setTheme(theme === "light" ? "dim" : "light")}
            title="Light mode reads best for long study sessions; dim mode cuts glare for night review"

          >
            {theme === "light" ? "☾ Dim" : "☀ Light"}
          </button>
        </div>
      </header>

      <main className="body">
        {tab === "today" && <Today xp={xp} streak={streak} bestRun={bestRun} log={log} readiness={readiness} readyLabel={readyLabel} catStats={catStats} daily={daily} dueCount={dueCount} go={setTab}
          record={record} flagged={flagged} setFlagged={setFlagged} questions={allQuestions} provider={provider}
          ability={ability} calibration={calibration}
          srs={srs} setSrs={setSrs} touchDay={touchDay} addXp={(n) => setXp((x) => x + n)} />}
        {tab === "qbank" && <QBank record={record} log={log} flagged={flagged} setFlagged={setFlagged} questions={allQuestions} provider={provider} addQuestions={addQuestions} ability={ability} calibration={calibration} />}
        {tab === "case" && <CaseStudy record={record} />}
        {tab === "cards" && <Flashcards addXp={(n) => { setXp((x) => x + n); }} srs={srs} setSrs={setSrs} touchDay={touchDay} />}
        {tab === "stats" && <Stats log={log} catStats={catStats} acc={acc} flagged={flagged} resetAll={resetAll} provider={provider} setProvider={setProvider} customCount={customQs.length} />}
      </main>

      <nav className="tabs" aria-label="Sections">
        {[["today", "Today"], ["qbank", "Practice"], ["case", "Case Study"], ["cards", "Cards"], ["stats", "Stats"]].map(([k, label]) => (
          <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}

/* ================= TODAY (one-tap autopilot) ================= */

function Today(props) {
  const { dueCount, streak } = props;
  const [stage, setStage] = useState("home"); // home | cards | quiz | done

  if (stage === "cards") return (
    <div className="stack">
      <p className="eyebrow stage-label">TODAY'S ROUND · STEP 1 OF 2 · CARDS</p>
      <Flashcards addXp={props.addXp} srs={props.srs} setSrs={props.setSrs} touchDay={props.touchDay} embedded onDone={() => setStage("quiz")} />
    </div>
  );

  if (stage === "quiz") return (
    <div className="stack">
      <p className="eyebrow stage-label">TODAY'S ROUND · STEP 2 OF 2 · QUESTIONS</p>
      <QBank record={props.record} log={props.log} flagged={props.flagged} setFlagged={props.setFlagged} questions={props.questions} provider={props.provider} ability={props.ability} calibration={props.calibration} auto onDone={() => setStage("done")} />
    </div>
  );

  if (stage === "done") return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Round complete</p>
        <h2 className="h2">That's the whole job for today 🎉</h2>
        <p className="small">Day {streak.count} locked in. The science says stop here — spacing does its work between sessions, not during them. Tomorrow, tap the same button.</p>
        <button className="btn ghost" onClick={() => setStage("home")}>Back to Today</button>
      </section>
    </div>
  );

  return (
    <div className="stack">
      <section className="card center">
        <p className="eyebrow">One tap. The app picks what you study.</p>

        <button className="bigbtn" onClick={() => setStage(dueCount ? "cards" : "quiz")}>▶ Start today's round</button>
        <p className="small">{dueCount ? `${dueCount} flashcard${dueCount === 1 ? "" : "s"} due` : "No cards due"} + 8 smart questions · about 10 minutes</p>
      </section>
      <Monitor {...props} />
    </div>
  );
}

/* ================= MONITOR (dashboard) ================= */

function Monitor({ xp, streak, bestRun, log, readiness, readyLabel, catStats, daily, dueCount, go }) {
  const lvl = levelFor(xp);
  const weakest = catStats.filter((c) => c.pct != null).sort((a, b) => a.pct - b.pct)[0];
  const goalPct = Math.min(100, Math.round((daily.answered / DAILY_GOAL) * 100));
  return (
    <div className="stack">
      <section className="monitor-card">
        <div className="mono monitor-head">
          <span>CANDIDATE MONITOR</span>
          <span className="blink">● REC</span>
        </div>
        <Ecg />
        <div className="vitals">
          <div className="vital">
            <span className="vital-num">{readiness == null ? "--" : `${readiness.low}–${readiness.high}%`}</span>
            <span className="vital-lab">READINESS (ESTIMATE)</span>
          </div>
          <div className="vital">
            <span className="vital-num">{streak.count}</span>
            <span className="vital-lab">DAY STREAK</span>
          </div>
          <div className="vital">
            <span className="vital-num">{daily.answered}</span>
            <span className="vital-lab">Q TODAY</span>
          </div>
          <div className="vital">
            <span className="vital-num">{xp}</span>
            <span className="vital-lab">XP</span>
          </div>
        </div>
        <p className="monitor-note mono">{readyLabel.toUpperCase()}</p>
      </section>

      <section className="card">
        <p className="eyebrow">Today's goal · little and often</p>
        <h2 className="h2">{daily.answered >= DAILY_GOAL ? "Goal met — spacing secured" : `${daily.answered} / ${DAILY_GOAL} questions today`}</h2>
        <div className="bar"><div className="bar-fill" style={{ width: `${goalPct}%` }} /></div>
        <p className="small">{daily.answered >= DAILY_GOAL
          ? "One block a day beats a weekend marathon. Clear your flashcard queue, then rest — the forgetting curve is doing the work now."
          : "Distributed practice: a short block today is worth more than a long one someday. Your streak counts days, not hours."}</p>
        {dueCount > 0 && <p className="small tip"><strong>{dueCount} flashcard{dueCount === 1 ? "" : "s"} due today</strong> — spaced reviews only count if they happen on schedule.</p>}
        <p className="small tip">{streak.shield ? "🛡 Streak shield ready — one missed day won't break your streak." : "🛡 Shield used. A 7-day run restores it."}</p>
      </section>

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

      <section className="card">
        <p className="eyebrow">Today's plan</p>
        <div className="plan">
          <button className="btn ghost" onClick={() => go("qbank")}>Practice more →</button>
          <button className="btn ghost" onClick={() => go("case")}>NGN Case Study →</button>
          <button className="btn ghost" onClick={() => go("cards")}>Flashcards{dueCount ? ` (${dueCount} due)` : ""} →</button>
        </div>
        {weakest && weakest.pct < 100 && (
          <p className="small tip">Weakest area so far: <strong>{weakest.cat}</strong> ({weakest.pct}%). The QBank is already steering questions there.</p>
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

function QBank({ record, log, flagged, setFlagged, auto = false, onDone, questions = QUESTIONS, provider = "claude", addQuestions, ability = {}, calibration = {} }) {
  const [diffTarget, setDiffTarget] = useState(1);
  const [q, setQ] = useState(null);
  const [sel, setSel] = useState([]);
  const [order, setOrder] = useState([]);
  const [phase, setPhase] = useState("pick"); // pick | answering | feedback | break | done
  const [wasCorrect, setWasCorrect] = useState(false);
  const [lastCat, setLastCat] = useState(null);
  const [sessionN, setSessionN] = useState(0);
  const [mode, setMode] = useState("new"); // new | review

  const answeredIds = [...new Set(log.map((l) => l.id))];
  // latest result per question — misses stay in the review pool until re-answered correctly
  const latest = {};
  log.forEach((l) => { latest[l.id] = l.correct; });
  const missedIds = Object.keys(latest).filter((id) => !latest[id]).map(Number);

  const freshPool = questions.filter((x) => !answeredIds.includes(x.id));
  const reviewPool = questions.filter((x) => missedIds.includes(x.id));

  const catAccuracy = (cat) => {
    const rows = log.filter((l) => l.cat === cat);
    return rows.length ? rows.filter((r) => r.correct).length / rows.length : 0.5;
  };

  const pickFrom = (basePool) => {
    if (!basePool.length) { setPhase("done"); return; }
    let pool = basePool;
    // interleave: avoid repeating the last category so related concepts stay mixed
    const interleaved = pool.filter((x) => x.cat !== lastCat);
    if (interleaved.length) pool = interleaved;
    // Elo targeting: prefer items rated nearest the ~70%-success sweet spot
    // for their category (replaces the old diff-ladder sort).
    pool = [...pool].sort((a, b) =>
      Math.abs(itemRating(a, calibration) - pickTargetRating(ability, a.cat)) -
      Math.abs(itemRating(b, calibration) - pickTargetRating(ability, b.cat)));
    const pick = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
    setLastCat(pick.cat);
    setQ(pick);
    setSel(pick.type === "bowtie" ? { actions: [], condition: null, parameters: [] } : []);
    setOrder([]); setPhase("answering");
  };

  const nextQuestion = () => {
    if (auto) return pickFrom([...reviewPool, ...freshPool].filter((x) => x.id !== q?.id));
    return pickFrom(mode === "review" ? reviewPool.filter((x) => x.id !== q?.id) : freshPool);
  };

  const submit = () => {
    let ok = false;
    if (q.type === "mc") ok = sel[0] === q.answer;
    if (q.type === "sata") ok = same(sel, q.answer);
    if (q.type === "order") ok = sameOrder(order, q.answer);
    if (q.type === "matrix") ok = scoreMatrix(sel, q.answer);
    if (q.type === "bowtie") ok = scoreBowtie(sel, q.answer);
    if (q.type === "cloze") ok = scoreCloze(sel, q.answer);
    setWasCorrect(ok);
    record(q, ok);
    setSessionN((n) => n + 1);
    setDiffTarget((d) => Math.max(1, Math.min(3, d + (ok ? 1 : -1))));
    setPhase("feedback");
  };

  const advance = () => {
    if (auto && sessionN >= 8) { onDone?.(); return; }
    if (sessionN > 0 && sessionN % 8 === 0) setPhase("break");
    else nextQuestion();
  };

  // autopilot: start immediately, mixing missed questions first, then new ones
  useEffect(() => {
    if (auto && phase === "pick") {
      const pool = [...reviewPool, ...freshPool];
      if (pool.length) pickFrom(pool); else onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  useEffect(() => {
    if (auto && phase === "done") onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, phase]);

  if (phase === "pick") return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Adaptive QBank</p>
        <h2 className="h2">Computer-adaptive practice</h2>
        <p className="small">Built on the three highest-evidence techniques: retrieval practice (every item tests recall), interleaving (categories are deliberately mixed so back-to-back questions never share a topic), and spacing (questions come in short blocks of 8 with checkpoints). Difficulty adapts like the real CAT exam, steering toward your weakest categories.</p>
        <p className="small mono">{freshPool.length} new · {reviewPool.length} missed · difficulty target {diffTarget}/3</p>
        <div className="row">
          <button className="btn" onClick={() => { setMode("new"); pickFrom(freshPool); }} disabled={!freshPool.length}>{freshPool.length ? "New questions" : "All questions seen"}</button>
          <button className="btn ghost" onClick={() => { setMode("review"); pickFrom(reviewPool); }} disabled={!reviewPool.length}>Review misses ({reviewPool.length})</button>
        </div>
        {addQuestions && <Generator provider={provider} addQuestions={addQuestions} log={log} questions={questions} lowOnNew={freshPool.length < 5} />}

        {!freshPool.length && !reviewPool.length && <p className="small tip">Bank cleared with every miss corrected — that's mastery. Check Stats, then keep the flashcard schedule alive.</p>}
      </section>
    </div>
  );

  if (phase === "break") return (
    <section className="card">
      <p className="eyebrow">Spacing checkpoint</p>
      <h2 className="h2">Block complete — 8 questions</h2>
      <p className="small">Distributed practice beats marathons: the same study minutes spread across days retain dramatically more than one long push. If you stop here, review again within 24 hours, then at 3 and 7 days — your flashcard queue and day streak now track that schedule for real.</p>
      <div className="row">
        <button className="btn ghost" onClick={nextQuestion}>One more block →</button>
        <button className="btn" onClick={() => setPhase("pick")}>End session</button>
      </div>
    </section>
  );

  if (phase === "done" || !q) return (
    <section className="card"><h2 className="h2">{mode === "review" ? "Review pool cleared" : "No new questions left"}</h2><p className="small">{mode === "review" ? "Every previously missed question has been re-answered correctly. Corrected errors are some of the strongest memories you'll form." : "You've seen the whole bank. Switch to Review misses to close remaining gaps."}</p>
      <button className="btn" onClick={() => setPhase("pick")}>Back to session menu</button></section>
  );

  const isFlagged = flagged.includes(q.id);
  const ext = ngnExt(q); // NGN payloads: rows/columns/actions/conditions/parameters/dropdowns
  const toggleSel = (i) => {
    if (phase !== "answering") return;
    if (q.type === "mc") setSel([i]);
    else if (q.type === "sata") setSel((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i]);
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
    sel.length > 0;

  const TYPE_LABEL = {
    mc: "MULTIPLE CHOICE", sata: "SELECT ALL", order: "ORDERED",
    matrix: "MATRIX", bowtie: "BOW-TIE", cloze: "CLOZE (DROPDOWNS)",
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="q-meta mono">
          <span>{q.cat.toUpperCase()}{q.ai ? " · ✨ AI" : ""}{mode === "review" ? " · RETRY" : ""}</span>
          <span>{"▲".repeat(q.diff)}{"△".repeat(3 - q.diff)} · {TYPE_LABEL[q.type] ?? "MULTIPLE CHOICE"}</span>
        </div>
        {q.type === "cloze" ? (
          <p className="stem">
            {q.stem.split(/\{(\d+)\}/).map((part, idx) => {
              if (idx % 2 === 0) return <span key={idx}>{part}</span>;
              const gap = Number(part);
              return (
                <select key={idx} className="cloze-dd"
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
          <p className="stem">{q.stem}</p>
        )}

        {q.type === "matrix" && (
          <div className="ngn-matrix" role="table">
            <div className="mx-row mx-head" style={{ gridTemplateColumns: `2fr repeat(${ext.columns.length}, 1fr)` }}>
              <span />
              {ext.columns.map((c, ci) => <span key={ci} className="small mono mx-colhead">{c}</span>)}
            </div>
            {ext.rows.map((r, ri) => (
              <div key={ri} className="mx-row" style={{ gridTemplateColumns: `2fr repeat(${ext.columns.length}, 1fr)` }}>
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
                    <button key={ci} className={cls} onClick={() => setMatrixRow(ri, ci)} aria-label={`${r}: ${c}`}>
                      {sel[ri] === ci ? "●" : "○"}
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
              <div key={col.slot} className="bt-col">
                <p className="small mono bt-label">{col.label.toUpperCase()}</p>
                {col.items.map((it, i) => {
                  let cls = "opt bt-opt";
                  if (col.picked.includes(i)) cls += " picked";
                  if (phase === "feedback") {
                    if (col.keyed.includes(i)) cls += " right";
                    else if (col.picked.includes(i)) cls += " wrong";
                  }
                  return <button key={i} className={cls} onClick={() => toggleBowtie(col.slot, i, col.cap)}>{it}</button>;
                })}
              </div>
            ))}
          </div>
        )}

        {["mc", "sata", "order"].includes(q.type) && (
        <div className="opts">
          {q.options.map((opt, i) => {
            let cls = "opt";
            if (q.type !== "order") {
              if (sel.includes(i)) cls += " picked";
              if (phase === "feedback") {
                const correct = q.type === "mc" ? i === q.answer : q.answer.includes(i);
                if (correct) cls += " right";
                else if (sel.includes(i)) cls += " wrong";
              }
              return <button key={i} className={cls} onClick={() => toggleSel(i)}>{q.type === "sata" ? (sel.includes(i) ? "☑ " : "☐ ") : ""}{opt}</button>;
            }
            const pos = order.indexOf(i);
            if (pos !== -1) cls += " picked";
            if (phase === "feedback") {
              if (q.answer[order.indexOf(i)] === i && order.indexOf(i) !== -1) cls += " right";

              else if (order.indexOf(i) !== -1) cls += " wrong";
            }
            return <button key={i} className={cls} onClick={() => toggleOrder(i)}>{pos !== -1 ? <span className="ord mono">{pos + 1}</span> : <span className="ord mono dim">·</span>}{opt}</button>;
          })}
        </div>
        )}

        {phase === "answering" && (
          <div className="row">
            <button className="btn" disabled={!canSubmit} onClick={submit}>Check answer</button>
            <button className="btn ghost" onClick={() => setFlagged((f) => isFlagged ? f.filter((x) => x !== q.id) : [...f, q.id])}>{isFlagged ? "⚑ Flagged" : "⚐ Flag"}</button>
          </div>
        )}

        {phase === "feedback" && (
          <div className={wasCorrect ? "feedback ok" : "feedback no"}>
            <p className="fb-head mono">{wasCorrect ? `CORRECT · +${10 * q.diff} XP` : "INCORRECT — IT RETURNS IN REVIEW MISSES"}</p>
            {q.type === "order" && !wasCorrect && (
              <p className="small"><strong>Correct order:</strong> {q.answer.map((i) => q.options[i]).join(" → ")}</p>
            )}
            {q.type === "cloze" && !wasCorrect && (
              <p className="small"><strong>Correct choices:</strong> {q.answer.map((a, i) => ext.dropdowns[i][a]).join(" · ")}</p>
            )}
            <p className="rationale"><strong>Rationale.</strong> {q.rationale}</p>
            {q.ai && <p className="small">✨ AI-generated item — solid for practice, but verify anything surprising against your course materials.</p>}
            <TutorExplain key={q.id} q={q} wasCorrect={wasCorrect} provider={provider} />
            <button className="btn" onClick={advance}>Next question →</button>
          </div>
        )}
      </section>
    </div>
  );
}
/* ================= CASE STUDY ================= */

function CaseStudy({ record }) {
  const [step, setStep] = useState(-1);
  const [sel, setSel] = useState([]);
  const [phase, setPhase] = useState("read");
  const [score, setScore] = useState(0);
  const [ok, setOk] = useState(false);
  const cs = CASE_STUDY;

  const start = () => { setStep(0); setPhase("answering"); setSel([]); };
  const s = cs.steps[step];

  const submit = () => {
    const correct = s.type === "mc" ? sel[0] === s.answer : same(sel, s.answer);
    setOk(correct);
    if (correct) setScore((x) => x + 1);
    record({ id: 100 + step, cat: "Physiological Adaptation", diff: 3 }, correct);
    setPhase("feedback");
  };

  const next = () => {
    if (step + 1 < cs.steps.length) { setStep(step + 1); setSel([]); setPhase("answering"); }
    else setPhase("done");
  };

  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Next Generation NCLEX</p>
        <h2 className="h2">{cs.title}</h2>

        <p className="small">{cs.intro}</p>
        <div className="chart mono">
          {cs.vitals.map(([k, v]) => <span key={k} className="chip">{k} {v}</span>)}
          {cs.labs.map(([k, v]) => <span key={k} className="chip lab">{k} {v}</span>)}
        </div>
        <p className="small note">Nurse's note: {cs.note}</p>
        {step === -1 && <button className="btn" onClick={start}>Begin case →</button>}
      </section>

      {step >= 0 && phase !== "done" && (
        <section className="card">
          <p className="eyebrow">Step {step + 1} of {cs.steps.length} · {s.phase}</p>
          <p className="stem">{s.stem}</p>
          <div className="opts">
            {s.options.map((opt, i) => {
              let cls = "opt";
              if (sel.includes(i)) cls += " picked";
              if (phase === "feedback") {
                const corr = s.type === "mc" ? i === s.answer : s.answer.includes(i);
                if (corr) cls += " right"; else if (sel.includes(i)) cls += " wrong";
              }
              return (
                <button key={i} className={cls} onClick={() => {
                  if (phase !== "answering") return;
                  if (s.type === "mc") setSel([i]);
                  else setSel((x) => x.includes(i) ? x.filter((y) => y !== i) : [...x, i]);
                }}>{s.type === "sata" ? (sel.includes(i) ? "☑ " : "☐ ") : ""}{opt}</button>
              );
            })}
          </div>
          {phase === "answering" && <button className="btn" disabled={!sel.length} onClick={submit}>Check answer</button>}
          {phase === "feedback" && (
            <div className={ok ? "feedback ok" : "feedback no"}>
              <p className="fb-head mono">{ok ? "CORRECT · +30 XP" : "INCORRECT"}</p>
              <p className="rationale"><strong>Rationale.</strong> {s.rationale}</p>
              <button className="btn" onClick={next}>{step + 1 < cs.steps.length ? "Next step →" : "Finish case"}</button>
            </div>
          )}
        </section>
      )}

      {phase === "done" && (
        <section className="card">
          <h2 className="h2">Case complete — {score}/{cs.steps.length}</h2>
          <p className="small">{score === cs.steps.length ? "Flawless clinical judgment. You recognized cues, prioritized the hypothesis, and took the right actions." : "Review the rationales above — NGN cases reward recognizing the pattern across findings, not any single number."}</p>
        </section>
      )}
    </div>
  );
}

/* ================= FLASHCARDS (real spaced repetition) ================= */

function Flashcards({ addXp, srs, setSrs, touchDay, embedded = false, onDone }) {
  const [sessionQueue, setSessionQueue] = useState(null); // indices due today
  const [show, setShow] = useState(false);

  const due = srs.map((c, i) => ({ ...c, i })).filter((c) => c.due <= todayStr());
  useEffect(() => {
    if (sessionQueue == null && due.length) setSessionQueue(due.map((c) => c.i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionQueue, srs]);


  const cur = sessionQueue?.[0];

  const schedule = (interval) => addDays(Math.max(0, interval));

  const grade = (g) => {
    setShow(false);
    touchDay();
    const card = srs[cur];
    let interval = card.interval;
    if (g === "again") interval = 0;                       // relearn: back later today
    else if (g === "hard") interval = 1;                   // tomorrow
    else if (g === "good") { interval = interval < 1 ? 3 : Math.min(interval * 2 + 1, 60); addXp(5); } // 3 → 7 → 15 → 31d
    else { interval = interval < 1 ? 7 : Math.min(interval * 3 + 1, 90); addXp(8); }                   // easy: 7 → 22d…

    setSrs((all) => all.map((c, i) => i === cur ? { interval, due: schedule(interval) } : c));
    setSessionQueue((q) => {
      const rest = q.slice(1);
      if (g === "again") { const at = Math.min(2, rest.length); return [...rest.slice(0, at), cur, ...rest.slice(at)]; }
      return rest; // scheduled to a future date — leaves today's queue
    });
  };

  const nextDue = srs.filter((c) => c.due > todayStr()).map((c) => c.due).sort()[0];

  if (cur == null) return (
    <section className="card">
      <p className="eyebrow">Spaced repetition</p>
      <h2 className="h2">Nothing due today 🎉</h2>
      <p className="small">Your queue is clear — and that's the point. Reviews land right before you'd forget: graded "Hard" returns tomorrow, "Good" stretches to 3, 7, then 15 days, "Easy" pushes even further. {nextDue ? `Next cards unlock ${nextDue === addDays(1) ? "tomorrow" : `on ${nextDue}`}.` : ""}</p>
      <p className="small tip">Your schedule is saved on this device — come back on the due date and the queue will be waiting. Early re-cramming actually weakens the spacing effect.</p>
      {embedded && <button className="btn" onClick={onDone}>Continue to questions →</button>}
    </section>
  );

  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Spaced repetition · {sessionQueue.length} due today</p>
        <button className="flashcard" onClick={() => setShow((s) => !s)}>
          <p className="fc-side mono">{show ? "ANSWER" : "PROMPT — TAP TO FLIP"}</p>
          <p className="fc-text">{show ? CARDS[cur].b : CARDS[cur].f}</p>
        </button>
        {show && (
          <div className="grades">
            <button className="btn grade again" onClick={() => grade("again")}>Again</button>
            <button className="btn grade hard" onClick={() => grade("hard")}>Hard<span className="grade-sub">1d</span></button>
            <button className="btn grade good" onClick={() => grade("good")}>Good<span className="grade-sub">{srs[cur].interval < 1 ? "3d" : `${Math.min(srs[cur].interval * 2 + 1, 60)}d`}</span></button>
            <button className="btn grade easy" onClick={() => grade("easy")}>Easy<span className="grade-sub">{srs[cur].interval < 1 ? "7d" : `${Math.min(srs[cur].interval * 3 + 1, 90)}d`}</span></button>
          </div>
        )}
        <p className="small tip">Recall the answer out loud before flipping — the retrieval attempt is what builds the memory, not seeing the answer. Grades now set real calendar dates.</p>
      </section>
    </div>
  );
}

/* ================= STATS ================= */

function Stats({ log, catStats, acc, flagged, resetAll, provider, setProvider, customCount }) {

  const [confirm, setConfirm] = useState(false);
  const p = AI_PROVIDERS.find((x) => x.id === provider) || AI_PROVIDERS[0];
  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Performance</p>
        <h2 className="h2">{log.length ? `${Math.round(acc * 100)}% overall accuracy` : "No questions answered yet"}</h2>
        <p className="small">{log.length} answered · {log.filter((l) => l.correct).length} correct · {flagged.length} flagged for review</p>
      </section>
      <section className="card">
        <p className="eyebrow">By client-needs category</p>
        {catStats.map((c) => (
          <div key={c.cat} className="cat-row">
            <div className="cat-top"><span className="small">{c.cat}</span><span className="small mono">{c.pct == null ? "—" : `${c.pct}% · ${c.n}q`}</span></div>
            <div className="bar"><div className={"bar-fill" + (c.pct != null && c.pct < 60 ? " low" : "")} style={{ width: `${c.pct ?? 0}%` }} /></div>
          </div>
        ))}
        <p className="small tip">Aim for ≥ 75% in every category before test day. The QBank automatically feeds you more questions from red bars.</p>
      </section>
      <section className="card">
        <p className="eyebrow">AI engine</p>
        <p className="small">The tutor and question generator run through a provider adapter: one neutral prompt format in, plain text out. Your study context (history, schedule, weak areas) lives on your device — never with the model — so swapping engines loses nothing.</p>
        <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="AI engine">
          {AI_PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <p className="small tip">{p.note}{customCount ? ` · ${customCount} AI-generated questions in your bank.` : ""}</p>
      </section>
      <section className="card">
        <p className="eyebrow">Saved progress</p>
        <p className="small">Your XP, streak, answer history, and flashcard schedule sync to your account and reload on any device.</p>
        {!confirm
          ? <button className="btn ghost" onClick={() => setConfirm(true)}>Reset all progress…</button>
          : <div className="row">
              <button className="btn danger" onClick={() => { setConfirm(false); resetAll(); }}>Yes, erase everything</button>
              <button className="btn ghost" onClick={() => setConfirm(false)}>Keep my progress</button>
            </div>}
      </section>
      <section className="card">
        <p className="eyebrow">Account</p>
        <p className="small">Signing out keeps your synced progress safe — sign back in anywhere to continue.</p>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>
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
      {lowOnNew && state === "idle" && <p className="small tip">Running low on fresh questions — generate more below.</p>}
      <button className="btn ghost" onClick={go} disabled={state === "loading"}>
        {state === "loading" ? "Writing questions…" : "✨ Generate 5 new questions (AI)"}
      </button>
      {state === "done" && <p className="small">{msg}</p>}
      {state === "key" && <p className="small">This engine needs an API key. Switch engines in Stats → AI engine, or use Claude (included).</p>}
      {state === "error" && <p className="small">Generation hiccup — tap to try again. Nothing invalid ever enters your bank: every item is schema-checked first.</p>}
    </div>
  );
}

/* ================= AI TUTOR (provider-agnostic) ================= */

function TutorExplain({ q, wasCorrect, provider = "claude" }) {
  const [state, setState] = useState("idle"); // idle | loading | done | key | error
  const [text, setText] = useState("");

  const ask = async () => {
    setState("loading");
    try {
      const t = await askModel(provider, `You are a warm, expert NCLEX tutor. A student ${wasCorrect ? "answered this question correctly and wants to understand it more deeply" : "just missed this question"}.

Question: ${q.stem}
Options: ${q.options.join(" | ")}
Correct answer: ${Array.isArray(q.answer) ? q.answer.map((i) => q.options[i]).join("; ") : q.options[q.answer]}
Textbook rationale: ${q.rationale}

Explain it DIFFERENTLY from the textbook rationale: plain, everyday language a tired student at midnight would understand, under 120 words. End with one short memory trick or mnemonic. No preamble, no headers.`);
      setText(t);
      setState("done");
    } catch (e) {
      setState(e.code === "KEY_REQUIRED" ? "key" : "error");
    }
  };

  if (state === "done") return <p className="rationale tutor"><strong>Tutor.</strong> {text}</p>;
  return (
    <button className="btn ghost tutor-btn" onClick={ask} disabled={state === "loading"}>

      {state === "loading" ? "Tutor is thinking…"
        : state === "key" ? "This engine needs a key — switch in Stats → AI engine"
        : state === "error" ? "Tutor unavailable — tap to retry"
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

function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap');
      .app{
        /* LIGHT (default study theme) */
        --paper:#F3F6F4; --ink:#0F2E29; --card:#FFFFFF; --muted:#3B554F;
        --surface:#F7FAF8; --line:#D8E2DD; --bar-bg:#E7EFEA;
        --teal:#0E7C6B; --btn-ink:#FFFFFF; --accent-ink:#0A5A4E;
        --mon:#0C201D; --ecg:#3BE08F;
        --amber:#E9A23B; --coral:#D9503F; --danger-ink:#B23A2B;
        --pick-bg:#E8F4F0; --right-bg:#DDF2E7; --wrong-bg:#FBE7E3;
        --ok-bg:#E9F6EF; --ok-line:#BCE4CE; --no-bg:#FBEFEC; --no-line:#F0C8C0;
        --chip-bg:#EDF4F0; --lab-bg:#FDF3E3; --lab-line:#EED9B4; --lab-ink:#8A6215;
        --tab-ink:#6B837C; --tab-on:#E6F1ED;
        --read-size:15.5px; --read-lh:1.55; --body-size:13.5px; --body-lh:1.55; --body-weight:400;
      }
      .app[data-theme="dim"]{
        /* DIM (night review) — charcoal, not #000, to avoid halation */
        --paper:#151A18; --ink:#EAF1ED; --card:#1D2523; --muted:#B4C7BF;
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
      .top{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)}
      .brand{display:flex;align-items:center;gap:8px}
      .brand-name{font-weight:800;letter-spacing:.06em;font-size:17px}
      .brand-name em{font-style:normal;color:var(--teal)}
      .pulse-dot{width:9px;height:9px;border-radius:50%;background:var(--ecg);box-shadow:0 0 0 0 rgba(59,224,143,.5);animation:pulse 1.6s infinite}
      @keyframes pulse{70%{box-shadow:0 0 0 9px rgba(59,224,143,0)}100%{box-shadow:0 0 0 0 rgba(59,224,143,0)}}
      .top-stats{display:flex;align-items:center;gap:12px;font-size:12px;font-weight:600;color:var(--accent-ink)}
      .theme-btn{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;color:var(--accent-ink);background:var(--card);border:1px solid var(--line);border-radius:99px;padding:5px 10px;cursor:pointer}
      .theme-btn:focus-visible{outline:3px solid var(--amber);outline-offset:2px}

      .body{flex:1;padding:16px 16px 96px}
      .stack{display:flex;flex-direction:column;gap:14px}
      .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
      .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);margin-bottom:6px;font-weight:600}
      .app[data-theme="dim"] .eyebrow{color:var(--accent-ink)}
      .h2{font-size:20px;font-weight:800;letter-spacing:-.01em;margin-bottom:6px}
      .small{font-size:var(--body-size);line-height:var(--body-lh);font-weight:var(--body-weight);color:var(--muted);margin-bottom:8px}
      .tip{border-top:1px dashed var(--line);padding-top:8px;margin-top:4px;margin-bottom:0}
      /* monitor (dark in both themes — instrument, not reading surface) */
      .monitor-card{background:var(--mon);border-radius:16px;padding:16px;color:#CFEADF}
      .monitor-head{display:flex;justify-content:space-between;font-size:10.5px;letter-spacing:.16em;color:#6FA394;margin-bottom:8px}
      .blink{color:var(--ecg);animation:blink 1.4s steps(1) infinite}
      @keyframes blink{50%{opacity:.25}}
      .ecg{width:100%;height:44px;display:block}
      .ecg-line{stroke:var(--ecg);stroke-dasharray:640;stroke-dashoffset:640;animation:sweep 3.4s linear infinite}
      @keyframes sweep{to{stroke-dashoffset:0}}
      @media (prefers-reduced-motion: reduce){.ecg-line{animation:none;stroke-dashoffset:0}.pulse-dot,.blink{animation:none}}
      .vitals{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
      .vital{text-align:center}
      .vital-num{display:block;font-family:'IBM Plex Mono',monospace;font-size:26px;font-weight:600;color:var(--ecg)}
      .vital-lab{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.14em;color:#6FA394}
      .monitor-note{margin-top:10px;font-size:10.5px;letter-spacing:.1em;color:#8FBCAD}
      /* buttons & bars */
      .btn{background:var(--teal);color:var(--btn-ink);border:none;border-radius:10px;padding:12px 16px;font-family:'Archivo',sans-serif;font-weight:700;font-size:14px;cursor:pointer;margin-top:6px}
      .btn:disabled{opacity:.4;cursor:default}
      .btn.ghost{background:transparent;color:var(--accent-ink);border:1.5px solid var(--teal)}
      .btn:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      .plan{display:flex;flex-wrap:wrap;gap:8px}
      .row{display:flex;gap:8px;flex-wrap:wrap}
      .bar{height:8px;background:var(--bar-bg);border-radius:99px;overflow:hidden;margin:8px 0 4px}
      .bar-fill{height:100%;background:var(--teal);border-radius:99px;transition:width .4s}
      .bar-fill.low{background:var(--coral)}
      /* questions — the primary reading surface */
      .q-meta{display:flex;justify-content:space-between;font-size:10px;letter-spacing:.1em;color:var(--muted);margin-bottom:10px;gap:8px;flex-wrap:wrap}
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
      .mx-colhead{text-align:center;font-size:10px;letter-spacing:.08em}
      .mx-cell{background:var(--surface);border:none;border-left:1px solid var(--line);padding:12px 4px;font-size:16px;cursor:pointer;color:var(--ink)}
      .mx-cell.picked{background:var(--pick-bg);color:var(--accent-ink);font-weight:700}
      .mx-cell.right{background:var(--right-bg);color:var(--accent-ink);font-weight:700}
      .mx-cell.wrong{background:var(--wrong-bg);color:var(--coral)}
      /* NGN: bow-tie */
      .bt-cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px}
      @media (max-width:520px){.bt-cols{grid-template-columns:1fr}}
      .bt-col{display:flex;flex-direction:column;gap:6px;background:var(--surface);border:1px dashed var(--line);border-radius:10px;padding:8px}
      .bt-label{margin-bottom:2px;font-size:10px;letter-spacing:.08em}
      .bt-opt{padding:9px 10px;font-size:13px}
      /* NGN: cloze */
      .cloze-dd{display:inline-block;margin:0 4px;background:var(--surface);color:var(--ink);border:1.5px solid var(--teal);border-radius:8px;padding:6px 8px;font-family:'Archivo',sans-serif;font-size:14px;font-weight:600;max-width:100%}
      .cloze-dd:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      .ord{min-width:20px;height:20px;border-radius:6px;background:var(--teal);color:var(--btn-ink);display:inline-flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
      .ord.dim{background:var(--bar-bg);color:var(--muted)}
      /* feedback: tinted frame carries the verdict; the rationale itself sits on a
         clean card surface so dense reading stays on optimal contrast */
      .feedback{border-radius:12px;padding:14px;margin-top:8px}
      .feedback.ok{background:var(--ok-bg);border:1px solid var(--ok-line)}
      .feedback.no{background:var(--no-bg);border:1px solid var(--no-line)}
      .fb-head{font-size:11px;letter-spacing:.12em;font-weight:600;margin-bottom:8px}
      .feedback.ok .fb-head{color:var(--accent-ink)} .feedback.no .fb-head{color:var(--danger-ink)}
      .rationale{font-size:var(--body-size);line-height:1.7;font-weight:var(--body-weight);color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px}
      /* case study */
      .chart{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
      .chip{background:var(--chip-bg);border:1px solid var(--line);border-radius:8px;padding:5px 8px;font-size:11px;font-weight:600;color:var(--accent-ink)}
      .chip.lab{background:var(--lab-bg);border-color:var(--lab-line);color:var(--lab-ink)}
      .note{font-style:italic}
      /* flashcards */
      .flashcard{width:100%;min-height:170px;background:linear-gradient(160deg,#0C201D,#123A32);color:#EAF6F0;border:none;border-radius:14px;padding:20px;display:flex;flex-direction:column;justify-content:center;gap:12px;cursor:pointer;text-align:center}
      .flashcard:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
      .fc-side{font-size:10px;letter-spacing:.18em;color:#6FA394}

      .fc-text{font-size:18px;font-weight:700;line-height:1.5}
      .grades{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
      .grade{margin-top:0;padding:11px 4px;font-size:13px;color:#fff}
      .grade.again{background:var(--coral)} .grade.hard{background:var(--amber);color:#3A2A08} .grade.good{background:var(--teal);color:var(--btn-ink)} .grade.easy{background:#0A5A4E}
      .grade{display:flex;flex-direction:column;align-items:center;gap:2px}
      .grade-sub{font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:400;opacity:.85}
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
      /* stats */
      .cat-row{margin-bottom:10px}
      .cat-top{display:flex;justify-content:space-between;gap:8px}
      .cat-top .small{margin-bottom:0}
      /* tabs */
      .tabs{position:fixed;bottom:0;left:0;right:0;max-width:560px;margin:0 auto;display:flex;background:var(--card);border-top:1px solid var(--line);padding:6px 6px calc(6px + env(safe-area-inset-bottom))}
      .tab{flex:1;background:none;border:none;padding:10px 2px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.02em;color:var(--tab-ink);cursor:pointer;border-radius:8px;font-weight:600}
      .tab.on{color:var(--accent-ink);background:var(--tab-on)}
      .tab:focus-visible{outline:3px solid var(--amber);outline-offset:-3px}
    `}</style>
  );
}
