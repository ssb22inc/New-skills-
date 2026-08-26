/* High-yield clinical content, written in an exam-prep register: what the NCLEX
   expects you to recognise and prioritise. These are study aids, never clinical
   protocols — every page carries the disclaimer, and reference ranges are
   presented as typical values that vary by laboratory. */

export const CLINICAL_ARTICLES = [
  {
    slug: "lab-values-to-memorize",
    topic: "High-yield clinical",
    title: "Lab values to memorise for the NCLEX",
    h1: "The lab values worth memorising",
    description: "The reference ranges the NCLEX actually leans on, grouped so they stick, plus the critical values that should trigger immediate action.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN has a built-in lab reference drawer and flashcards that drill these with real spaced repetition.",
    body: `
<p>You cannot memorise every laboratory value, and you do not need to. A relatively small set does most of the work on the exam, because those are the values that change what a nurse does next.</p>
<p>Ranges below are <b>typical adult reference ranges</b>. Real ranges vary between laboratories, and your institution's values always govern in practice. Paediatric, pregnancy and older-adult ranges differ.</p>

<h2>Electrolytes</h2>
<table>
  <tr><th>Test</th><th>Typical range</th><th>Why it is tested</th></tr>
  <tr><td>Sodium</td><td>135&ndash;145 mEq/L</td><td>Drives neurological signs — confusion, seizures at extremes.</td></tr>
  <tr><td>Potassium</td><td>3.5&ndash;5.0 mEq/L</td><td>Cardiac. Both ends are dangerous; small deviations matter.</td></tr>
  <tr><td>Calcium</td><td>9.0&ndash;10.5 mg/dL</td><td>Neuromuscular excitability, tetany, cardiac effects.</td></tr>
  <tr><td>Magnesium</td><td>1.3&ndash;2.1 mEq/L</td><td>Reflexes and cardiac conduction; central to obstetric scenarios.</td></tr>
  <tr><td>Phosphorus</td><td>3.0&ndash;4.5 mg/dL</td><td>Moves inversely to calcium.</td></tr>
  <tr><td>Chloride</td><td>98&ndash;106 mEq/L</td><td>Follows sodium; acid-base context.</td></tr>
</table>

<div class="key">
<p><b>Potassium is the one to know cold.</b> More NCLEX items hinge on potassium than any other single value. It is narrow, it is cardiac, and both hypo- and hyperkalaemia are lethal. If you memorise one range perfectly, make it 3.5&ndash;5.0.</p>
</div>

<h2>Renal and metabolic</h2>
<table>
  <tr><th>Test</th><th>Typical range</th><th>Why it is tested</th></tr>
  <tr><td>BUN</td><td>10&ndash;20 mg/dL</td><td>Rises with dehydration as well as renal impairment.</td></tr>
  <tr><td>Creatinine</td><td>0.6&ndash;1.2 mg/dL</td><td>More specific to kidney function than BUN.</td></tr>
  <tr><td>Glucose (fasting)</td><td>70&ndash;100 mg/dL</td><td>Hypoglycaemia is the emergency; treat before investigating.</td></tr>
  <tr><td>HbA1c</td><td>Below 5.7% (non-diabetic)</td><td>Long-term control — an education topic, not an acute one.</td></tr>
</table>

<h2>Haematology</h2>
<table>
  <tr><th>Test</th><th>Typical range</th><th>Why it is tested</th></tr>
  <tr><td>Haemoglobin</td><td>12&ndash;16 g/dL (female), 13&ndash;17 (male)</td><td>Oxygen-carrying capacity; fatigue, pallor, tachycardia.</td></tr>
  <tr><td>Haematocrit</td><td>Roughly three times the haemoglobin</td><td>A quick internal consistency check.</td></tr>
  <tr><td>White cells</td><td>5,000&ndash;10,000/mm3</td><td>Low means infection risk; the client cannot mount a normal response.</td></tr>
  <tr><td>Platelets</td><td>150,000&ndash;400,000/mm3</td><td>Bleeding precautions as the count falls.</td></tr>
</table>

<h2>Coagulation</h2>
<table>
  <tr><th>Test</th><th>Typical range</th><th>Pairs with</th></tr>
  <tr><td>INR</td><td>0.8&ndash;1.1 untreated; often 2&ndash;3 on therapy</td><td>Warfarin</td></tr>
  <tr><td>PT</td><td>11&ndash;13.5 seconds</td><td>Warfarin</td></tr>
  <tr><td>aPTT</td><td>30&ndash;40 seconds</td><td>Heparin</td></tr>
</table>
<p>The pairing is worth committing to memory: <b>PT/INR with warfarin, aPTT with heparin</b>. Items frequently test whether you monitor the right one.</p>

<h2>Values that should stop you</h2>
<p>The exam cares less about your recall of a range than about whether you recognise a value that demands action now:</p>
<ul>
  <li>Potassium below 2.5 or above 6.5 mEq/L</li>
  <li>Sodium below 120 or above 160 mEq/L</li>
  <li>Glucose below 40 or above 400 mg/dL</li>
  <li>Platelets below 20,000/mm3</li>
  <li>Haemoglobin below 7 g/dL</li>
  <li>INR above 5 in a client on anticoagulation</li>
</ul>

<h2>How to learn these so they stay</h2>
<p>Reading a table repeatedly produces recognition, not recall — you feel familiar with the numbers without being able to produce them. Retrieval practice is what makes them stick: cover the range, state it aloud, then check. Spacing those attempts over days rather than massing them in one session is the difference between knowing them this week and knowing them on exam day.</p>
`,
    faq: [
      { q: "What lab values do I need to know for the NCLEX?", a: "Electrolytes (especially potassium and sodium), renal markers (BUN, creatinine), glucose, the complete blood count, and coagulation studies with the drug each monitors — PT/INR with warfarin, aPTT with heparin." },
      { q: "What is the normal potassium level?", a: "Typically 3.5 to 5.0 mEq/L in adults. It is the value most worth memorising precisely, because the range is narrow and deviations at either end carry cardiac risk." },
      { q: "Does the NCLEX give you lab values?", a: "Some items provide reference ranges alongside results and others do not, so you cannot rely on them being supplied. Knowing the common ranges also lets you read a result quickly rather than pausing to interpret." },
    ],
  },

  {
    slug: "abg-interpretation",
    topic: "High-yield clinical",
    title: "ABG interpretation made simple",
    h1: "How to interpret ABGs without panicking",
    description: "A four-step method for arterial blood gases, how to spot compensation, and the shortcut that gets you to the answer in seconds.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN drills ABG interpretation inside full clinical scenarios, not just isolated numbers.",
    body: `
<p>Arterial blood gas questions look intimidating and are among the most learnable items on the exam, because the reasoning is entirely mechanical. Four steps, in order, every time.</p>

<h2>The values</h2>
<table>
  <tr><th>Value</th><th>Typical range</th></tr>
  <tr><td>pH</td><td>7.35&ndash;7.45</td></tr>
  <tr><td>PaCO2</td><td>35&ndash;45 mmHg</td></tr>
  <tr><td>HCO3</td><td>22&ndash;26 mEq/L</td></tr>
  <tr><td>PaO2</td><td>80&ndash;100 mmHg</td></tr>
</table>

<h2>The four steps</h2>
<ol>
  <li><b>Look at the pH.</b> Below 7.35 is acidosis, above 7.45 is alkalosis. If it is inside the range but off-centre, keep it in mind — it may be fully compensated.</li>
  <li><b>Look at the CO2.</b> This is the respiratory value. It moves opposite to pH in a respiratory problem: CO2 up, pH down.</li>
  <li><b>Look at the HCO3.</b> This is the metabolic value. It moves with pH in a metabolic problem: bicarbonate down, pH down.</li>
  <li><b>Decide which one explains the pH.</b> Whichever value is disturbed in the direction that accounts for the pH is the cause. The other tells you whether compensation is under way.</li>
</ol>

<div class="key">
<p><b>The shortcut:</b> if pH and CO2 move in <i>opposite</i> directions, it is respiratory. If pH and HCO3 move in the <i>same</i> direction, it is metabolic. That single comparison resolves most exam ABGs immediately.</p>
</div>

<h2>Compensation</h2>
<p>The body defends pH. When one system fails, the other shifts to pull pH back toward normal.</p>
<table>
  <tr><th>State</th><th>What you see</th></tr>
  <tr><td>Uncompensated</td><td>pH abnormal; the other system is still normal.</td></tr>
  <tr><td>Partially compensated</td><td>pH still abnormal; both values are abnormal as the second system works.</td></tr>
  <tr><td>Fully compensated</td><td>pH back within range; both values still abnormal. Which side of 7.40 the pH sits tells you the original problem.</td></tr>
</table>
<p>That last row is where full compensation is decided. A pH of 7.37 with abnormal CO2 and HCO3 is compensated acidosis — it sits on the acidic side of 7.40 — while 7.43 with the same pattern is compensated alkalosis.</p>

<h2>Causes worth recognising</h2>
<table>
  <tr><th>Disturbance</th><th>Common exam scenarios</th></tr>
  <tr><td>Respiratory acidosis</td><td>Hypoventilation — opioid oversedation, COPD exacerbation, neuromuscular weakness, airway obstruction.</td></tr>
  <tr><td>Respiratory alkalosis</td><td>Hyperventilation — anxiety, pain, early sepsis, high altitude.</td></tr>
  <tr><td>Metabolic acidosis</td><td>Diabetic ketoacidosis, renal failure, prolonged diarrhoea, shock.</td></tr>
  <tr><td>Metabolic alkalosis</td><td>Prolonged vomiting, nasogastric suction, excessive antacids.</td></tr>
</table>
<p>Two pairings recur often enough to be worth holding ready: <b>vomiting produces metabolic alkalosis</b> because acid is lost, while <b>diarrhoea produces metabolic acidosis</b> because bicarbonate is lost.</p>

<h2>Do not forget the oxygen</h2>
<p>PaO2 sits outside the acid-base logic and is easy to skip once you have classified the disturbance. A question can present a tidy, fully compensated picture with a PaO2 of 54 — and the correct answer concerns the hypoxaemia, not the elegant compensation. Read all four values before deciding what the client needs.</p>
`,
    faq: [
      { q: "How do I interpret an ABG quickly?", a: "Check the pH for acidosis or alkalosis, then compare. If pH and CO2 move in opposite directions it is respiratory; if pH and bicarbonate move in the same direction it is metabolic. Then read PaO2 separately." },
      { q: "How do I tell if an ABG is compensated?", a: "If pH is abnormal and only one system is disturbed, it is uncompensated. If both are disturbed and pH is still abnormal, it is partially compensated. If pH is back in range with both values abnormal, it is fully compensated — which side of 7.40 the pH sits reveals the original problem." },
      { q: "Does vomiting cause acidosis or alkalosis?", a: "Metabolic alkalosis, because gastric acid is lost. Prolonged diarrhoea does the opposite, causing metabolic acidosis through loss of bicarbonate." },
    ],
  },

  {
    slug: "electrolyte-imbalances",
    topic: "High-yield clinical",
    title: "Electrolyte imbalances: signs worth knowing",
    h1: "Electrolyte imbalances the NCLEX keeps testing",
    description: "The signs, causes and nursing priorities for potassium, sodium, calcium and magnesium imbalances, organised for recall.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN drills electrolyte scenarios as full cases, so you practise recognising them from findings rather than labels.",
    body: `
<p>Electrolyte questions are common because they connect a number to a clinical picture to a nursing priority. The exam rarely tells you the imbalance — it gives you the findings and expects you to name it.</p>

<h2>Potassium</h2>
<table>
  <tr><th>Comparison</th><th>Hypokalaemia (below 3.5)</th><th>Hyperkalaemia (above 5.0)</th></tr>
  <tr><td>Signs</td><td>Muscle weakness, cramps, decreased reflexes, reduced bowel sounds, dysrhythmias</td><td>Muscle weakness, tingling, diarrhoea, dysrhythmias, cardiac arrest</td></tr>
  <tr><td>Common causes</td><td>Loop diuretics, vomiting, nasogastric suction, poor intake</td><td>Renal failure, potassium-sparing diuretics, crush injury, acidosis</td></tr>
  <tr><td>Nursing priority</td><td>Cardiac monitoring; never give potassium as an IV push</td><td>Cardiac monitoring; expect measures that shift or remove potassium</td></tr>
</table>

<div class="key">
<p><b>Potassium is never given by IV push.</b> It is always diluted and infused slowly, on a pump, with cardiac monitoring. An option offering rapid IV potassium is wrong regardless of how low the level is. This is one of the most reliably tested safety facts on the exam.</p>
</div>

<h2>Sodium</h2>
<table>
  <tr><th>Comparison</th><th>Hyponatraemia (below 135)</th><th>Hypernatraemia (above 145)</th></tr>
  <tr><td>Signs</td><td>Confusion, headache, nausea, seizures at severe levels</td><td>Thirst, dry mucous membranes, restlessness, agitation</td></tr>
  <tr><td>Common causes</td><td>Excess water intake, SIADH, diuretics, heart failure</td><td>Water loss, inadequate intake, diabetes insipidus</td></tr>
  <tr><td>Nursing priority</td><td>Neurological status and seizure precautions</td><td>Neurological status; correction is deliberately gradual</td></tr>
</table>
<p>Both extremes present neurologically, which is the point: a sodium question usually arrives as a change in mental status rather than as a number.</p>

<h2>Calcium</h2>
<table>
  <tr><th>Comparison</th><th>Hypocalcaemia</th><th>Hypercalcaemia</th></tr>
  <tr><td>Signs</td><td>Tingling around the mouth and fingers, muscle spasm, tetany, positive Chvostek and Trousseau signs</td><td>Fatigue, weakness, decreased reflexes, constipation, kidney stones</td></tr>
  <tr><td>Memory hook</td><td>Low calcium, high excitability</td><td>High calcium, low excitability</td></tr>
</table>
<p>Two named signs are worth knowing precisely: <b>Chvostek</b> is facial twitching when the facial nerve is tapped, and <b>Trousseau</b> is carpal spasm when a blood pressure cuff is inflated. Both indicate hypocalcaemia.</p>

<h2>Magnesium</h2>
<table>
  <tr><th>Comparison</th><th>Hypomagnesaemia</th><th>Hypermagnesaemia</th></tr>
  <tr><td>Signs</td><td>Tremor, hyperactive reflexes, dysrhythmias, seizures</td><td>Diminished reflexes, drowsiness, respiratory depression, hypotension</td></tr>
  <tr><td>Where it shows up</td><td>Alcohol use disorder, malnutrition, diuretics</td><td>Magnesium therapy in obstetrics, renal impairment</td></tr>
</table>
<p>Magnesium appears constantly in maternity scenarios. A client receiving magnesium sulfate is monitored for <b>reflexes, respiratory rate and urine output</b>, because loss of reflexes is the early warning of toxicity and respiratory depression follows.</p>

<h2>The pattern underneath</h2>
<p>Rather than memorising four separate lists, hold one idea: <b>calcium and magnesium calm, potassium and sodium conduct.</b> Low calcium or magnesium removes the brake, so you get twitching, tremor and hyperactive reflexes. High levels sedate, so you get weakness, diminished reflexes and depressed respiration. That single frame reconstructs most of the table when recall fails.</p>
`,
    faq: [
      { q: "Can potassium be given IV push?", a: "No. Potassium is always diluted and infused slowly on a pump with cardiac monitoring. IV push potassium can cause fatal dysrhythmias, and any answer offering it is incorrect regardless of how low the level is." },
      { q: "What are Chvostek and Trousseau signs?", a: "Both indicate hypocalcaemia. Chvostek is facial twitching when the facial nerve is tapped; Trousseau is carpal spasm when a blood pressure cuff is inflated on the arm." },
      { q: "What is monitored during magnesium sulfate therapy?", a: "Deep tendon reflexes, respiratory rate and urine output. Loss of reflexes is the earliest sign of magnesium toxicity, typically appearing before respiratory depression." },
    ],
  },

  {
    slug: "infection-control-precautions",
    topic: "High-yield clinical",
    title: "Infection control precautions: what goes where",
    h1: "Isolation precautions worth memorising",
    description: "Airborne, droplet and contact precautions, which conditions belong to each, and the PPE sequence the NCLEX tests every time.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN drills precaution scenarios and PPE sequencing as ordered, drag-and-drop items.",
    body: `
<p>Infection control is reliably tested because it is concrete, safety-critical, and easy to write unambiguous questions about. It is also one of the highest-yield things you can memorise outright.</p>

<h2>The three transmission-based categories</h2>
<table>
  <tr><th>Precaution</th><th>Room</th><th>PPE</th></tr>
  <tr><td>Airborne</td><td>Negative pressure, door closed</td><td>N95 respirator (fit-tested)</td></tr>
  <tr><td>Droplet</td><td>Private room preferred</td><td>Surgical mask within about 1&ndash;2 metres</td></tr>
  <tr><td>Contact</td><td>Private room preferred</td><td>Gown and gloves</td></tr>
</table>
<p>Standard precautions apply to every client, always, on top of any of the above.</p>

<h2>Which conditions go where</h2>
<h3>Airborne</h3>
<ul>
  <li>Tuberculosis</li>
  <li>Measles (rubeola)</li>
  <li>Varicella (chickenpox) — also contact</li>
  <li>Disseminated herpes zoster — also contact</li>
</ul>
<h3>Droplet</h3>
<ul>
  <li>Influenza</li>
  <li>Pertussis</li>
  <li>Bacterial meningitis (Neisseria meningitidis)</li>
  <li>Mumps, rubella</li>
  <li>Group A streptococcal pharyngitis</li>
</ul>
<h3>Contact</h3>
<ul>
  <li>MRSA, VRE</li>
  <li>Clostridioides difficile</li>
  <li>Scabies, lice</li>
  <li>Respiratory syncytial virus</li>
  <li>Draining wounds and major skin infections</li>
</ul>

<div class="key">
<p><b>C. difficile has two exceptions to memorise.</b> Alcohol-based hand rub does not kill the spores, so hand hygiene must be <b>soap and water</b>. Cleaning requires a sporicidal agent such as bleach. Items testing this almost always offer alcohol gel as a tempting distractor.</p>
</div>

<h2>Protective environment</h2>
<p>Do not confuse isolation with protection. A severely immunocompromised client — a neutropenic or transplant client — needs a <b>protective environment</b>: positive pressure, filtered air, no standing water or fresh flowers, and screening of anyone entering for illness. Airborne precautions protect others from the client; this protects the client from everyone else, and the pressure runs the opposite way.</p>

<h2>PPE order</h2>
<p><b>Putting on:</b> gown, mask or respirator, goggles or face shield, gloves.</p>
<p><b>Taking off:</b> gloves, goggles or face shield, gown, mask or respirator.</p>
<p>The logic makes it recallable rather than rote. Gloves go on last because they cover the gown cuffs, and they come off first because they are the most contaminated thing you are wearing. The mask comes off last on the way out, because you are still in a contaminated space until you leave. Hand hygiene bookends the whole process.</p>

<h2>The one that trips people</h2>
<p>Some conditions need two categories at once. Varicella and disseminated zoster are <b>airborne and contact</b> — the lesions transmit by contact while the virus also travels through the air. An answer offering only one is incomplete.</p>
`,
    faq: [
      { q: "What precautions are used for C. difficile?", a: "Contact precautions with gown and gloves, hand hygiene using soap and water rather than alcohol-based rub, and cleaning with a sporicidal agent such as bleach. Alcohol gel does not kill C. difficile spores." },
      { q: "What is the correct order for putting on PPE?", a: "Gown, then mask or respirator, then goggles or face shield, then gloves. Removal reverses the principle rather than the list: gloves, goggles, gown, then mask last as you leave the room." },
      { q: "Which diseases require airborne precautions?", a: "Tuberculosis, measles, varicella and disseminated herpes zoster. Varicella and disseminated zoster require contact precautions as well, since the lesions are also infectious." },
    ],
  },

  {
    slug: "insulin-types-and-timing",
    topic: "High-yield clinical",
    title: "Insulin types, onset and peak",
    h1: "Insulin: types, timing and the peak that matters",
    description: "Rapid, short, intermediate and long-acting insulin compared, why peak time predicts hypoglycaemia, and the mixing order to memorise.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN includes insulin timing in both flashcards and full clinical scenarios.",
    body: `
<p>Insulin questions are rarely about pharmacology for its own sake. They ask: when will this client be at risk of hypoglycaemia, and what should the nurse do about it? Peak time answers that, which is why it is the column worth learning.</p>

<h2>The four categories</h2>
<table>
  <tr><th>Type</th><th>Example</th><th>Onset</th><th>Peak</th><th>Duration</th></tr>
  <tr><td>Rapid-acting</td><td>lispro, aspart, glulisine</td><td>About 15 min</td><td>1&ndash;2 h</td><td>3&ndash;5 h</td></tr>
  <tr><td>Short-acting</td><td>regular</td><td>30&ndash;60 min</td><td>2&ndash;4 h</td><td>5&ndash;8 h</td></tr>
  <tr><td>Intermediate</td><td>NPH</td><td>1&ndash;2 h</td><td>4&ndash;12 h</td><td>12&ndash;18 h</td></tr>
  <tr><td>Long-acting</td><td>glargine, detemir</td><td>1&ndash;2 h</td><td>Minimal or none</td><td>Up to 24 h</td></tr>
</table>
<p>Times are typical teaching values; individual products and clients vary.</p>

<div class="key">
<p><b>Peak equals hypoglycaemia risk.</b> If an item asks when a client is most likely to experience a reaction, it is asking about peak. Rapid-acting insulin given before a meal peaks while the client eats — which is why a missed or delayed meal after rapid insulin is the classic exam setup.</p>
</div>

<h2>The rules that get tested</h2>
<ul>
  <li><b>Rapid-acting is given with food already available</b> — typically within about 15 minutes of eating. Give it and then discover the tray has not arrived, and you have created the problem.</li>
  <li><b>Only regular insulin is given intravenously.</b> An option offering IV NPH or IV glargine is wrong.</li>
  <li><b>Long-acting insulin is not mixed</b> with other insulins in the same syringe.</li>
  <li><b>Do not shake insulin.</b> Cloudy suspensions such as NPH are gently rolled between the palms.</li>
</ul>

<h2>Mixing order</h2>
<p>When regular and NPH are drawn into one syringe, air goes into the cloudy vial first, then air into the clear vial, then <b>clear is drawn before cloudy</b>. The reason is contamination: drawing cloudy first would carry intermediate-acting suspension back into the clear vial and alter every subsequent dose.</p>
<p>The mnemonic most students carry is <i>clear before cloudy</i>, sometimes as RN — <b>R</b>egular before <b>N</b>PH. Either works as long as you can also say why.</p>

<h2>Recognising hypoglycaemia</h2>
<p>Early signs are sympathetic: shakiness, sweating, tachycardia, hunger, anxiety. Later signs are neurological: confusion, slurred speech, seizure, loss of consciousness.</p>
<p>Treat a conscious client with a fast-acting oral carbohydrate, then recheck. Follow with a longer-acting carbohydrate and protein once the level has recovered, so it does not fall again. If the client cannot swallow safely, oral carbohydrate is not an option and the answer will involve a parenteral route.</p>

<h2>The beta-blocker interaction</h2>
<p>Beta-blockers mask the early sympathetic warning signs of hypoglycaemia — the tachycardia and tremor a client would normally notice. Sweating tends to persist. A client on both insulin and a beta-blocker may therefore present with confusion as their first apparent sign, which is exactly the scenario the exam builds items around.</p>
`,
    faq: [
      { q: "When is a client most at risk of hypoglycaemia after insulin?", a: "At the insulin's peak. Rapid-acting insulin peaks about one to two hours after administration, regular insulin at two to four hours, and NPH anywhere from four to twelve hours." },
      { q: "Which insulin can be given intravenously?", a: "Only regular insulin. Intermediate-acting and long-acting insulins are never given IV." },
      { q: "What order do you draw up insulin when mixing?", a: "Air into the cloudy vial, air into the clear vial, then draw clear before cloudy. Drawing cloudy first would contaminate the clear vial with suspension and change later doses." },
    ],
  },

  {
    slug: "high-alert-medications",
    topic: "High-yield clinical",
    title: "High-alert medications and their antidotes",
    h1: "High-alert medications worth knowing cold",
    description: "The drugs most often involved in serious harm, what to monitor for each, and the antidote pairings the NCLEX expects on recall.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN drills these as flashcards and inside case studies where the monitoring decision actually matters.",
    body: `
<p>High-alert medications are those that cause disproportionate harm when something goes wrong. The exam concentrates on them because safety is the organising principle of nursing licensure.</p>

<h2>Antidote pairings</h2>
<table>
  <tr><th>Drug</th><th>Antidote or reversal</th></tr>
  <tr><td>Heparin</td><td>Protamine sulfate</td></tr>
  <tr><td>Warfarin</td><td>Vitamin K (phytonadione)</td></tr>
  <tr><td>Opioids</td><td>Naloxone</td></tr>
  <tr><td>Benzodiazepines</td><td>Flumazenil</td></tr>
  <tr><td>Acetaminophen</td><td>Acetylcysteine</td></tr>
  <tr><td>Magnesium sulfate</td><td>Calcium gluconate</td></tr>
  <tr><td>Digoxin</td><td>Digoxin immune Fab</td></tr>
  <tr><td>Iron</td><td>Deferoxamine</td></tr>
</table>
<p>These are among the highest-return facts to hold on instant recall, because items using them give no time to reason it out.</p>

<h2>Anticoagulants</h2>
<p>Monitor <b>aPTT for heparin</b> and <b>PT/INR for warfarin</b>. Assess for bleeding: bruising, bleeding gums, blood in urine or stool, and any change in neurological status that could indicate intracranial bleeding.</p>
<p>Warfarin interacts with dietary vitamin K. The teaching point is <b>consistency</b>, not avoidance — a client should keep green leafy vegetable intake steady rather than eliminate it. An option telling the client to avoid all vitamin K is wrong.</p>

<h2>Digoxin</h2>
<p>Take an apical pulse for a full minute before administering, and withhold for bradycardia below the parameter given. Early toxicity is often gastrointestinal — anorexia, nausea, vomiting — followed by visual disturbance, classically yellow-green vision or halos.</p>
<p><b>Hypokalaemia increases digoxin toxicity risk.</b> That pairing is the reason a client on both digoxin and a loop diuretic is such a common exam scenario.</p>

<h2>Insulin and heparin</h2>
<p>Both are high-alert partly because of how they are prepared. Independent double-checking of the dose is standard practice for both, and any option that skips verification on a high-alert drug should be treated with suspicion.</p>

<h2>Drug classes with a signature warning</h2>
<table>
  <tr><th>Class</th><th>What to watch</th></tr>
  <tr><td>Aminoglycosides</td><td>Nephrotoxicity and ototoxicity — monitor renal function and hearing.</td></tr>
  <tr><td>Vancomycin</td><td>Infusion-related flushing reaction if given too quickly; monitor renal function.</td></tr>
  <tr><td>ACE inhibitors</td><td>Persistent dry cough, hyperkalaemia, angio-oedema.</td></tr>
  <tr><td>Beta-blockers</td><td>Bradycardia, hypotension; masking of hypoglycaemia signs.</td></tr>
  <tr><td>Loop diuretics</td><td>Hypokalaemia, dehydration, ototoxicity at high doses.</td></tr>
  <tr><td>Corticosteroids</td><td>Hyperglycaemia, infection risk, never stopped abruptly.</td></tr>
</table>

<h2>What the exam is really asking</h2>
<p>Most high-alert medication items reduce to one of three questions: what do you check before giving this, what do you monitor after, and what would make you withhold it. If you can answer those three for each drug above, you can answer the item even when the specific scenario is unfamiliar.</p>
`,
    faq: [
      { q: "What is the antidote for heparin?", a: "Protamine sulfate. Warfarin is reversed with vitamin K, which is a different pairing and frequently tested alongside it." },
      { q: "What are the early signs of digoxin toxicity?", a: "Often gastrointestinal first — anorexia, nausea and vomiting — followed by visual disturbances such as yellow-green vision or halos. Hypokalaemia increases the risk, so clients on digoxin and a loop diuretic need close monitoring." },
      { q: "Should clients on warfarin avoid vitamin K?", a: "No. They should keep intake consistent rather than eliminate it. Sudden changes in green leafy vegetable consumption in either direction destabilise the INR." },
    ],
  },
];
