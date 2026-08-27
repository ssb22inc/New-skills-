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
    description: "A structured four-step introduction to arterial blood gases, compensation patterns, mixed-disorder cautions, and oxygenation context.",
    published: "2026-08-03",
    updated: "2026-08-26",
    cta: "PulseRN drills ABG interpretation inside full clinical scenarios, not just isolated numbers.",
    body: `
<p>Arterial blood gas questions become more manageable with a consistent screening sequence. The four-step method below helps classify common primary disturbances in exam questions. Real patients can have mixed disorders, so ABG values must also be interpreted with the history, assessment, oxygen delivery, trends and local reference ranges.</p>

<h2>Common adult reference ranges</h2>
<p>These are general arterial ranges. The reporting laboratory's ranges take priority, and values can vary with age and clinical circumstances.</p>
<table>
  <tr><th>Value</th><th>Typical range</th></tr>
  <tr><td>pH</td><td>7.35&ndash;7.45</td></tr>
  <tr><td>PaCO2</td><td>35&ndash;45 mmHg</td></tr>
  <tr><td>HCO3</td><td>22&ndash;26 mEq/L</td></tr>
  <tr><td>PaO2</td><td>75&ndash;100 mmHg</td></tr>
</table>

<h2>The four steps</h2>
<ol>
  <li><b>Look at the pH.</b> Below 7.35 is acidemia; above 7.45 is alkalemia. A pH within range does not by itself prove full compensation; it can also occur with a mixed disorder.</li>
  <li><b>Look at the CO2.</b> This is the respiratory value. It moves opposite to pH in a respiratory problem: CO2 up, pH down.</li>
  <li><b>Look at the HCO3.</b> This is the metabolic value. It moves with pH in a metabolic problem: bicarbonate down, pH down.</li>
  <li><b>Identify the likely primary process.</b> Determine which value explains the pH direction, then ask whether the other value has shifted in the expected compensatory direction. A response outside the expected range can signal a second primary disorder.</li>
</ol>

<div class="key">
<p><b>The introductory shortcut:</b> in a straightforward single-disorder question, pH and CO2 moving in <i>opposite</i> directions points toward a respiratory process; pH and HCO3 moving in the <i>same</i> direction points toward a metabolic process. This is a screening aid, not a substitute for expected-compensation calculations or clinical context.</p>
</div>

<h2>Compensation</h2>
<p>The body defends pH. When a primary acid-base disturbance occurs, the respiratory or renal system may shift in the opposing direction.</p>
<table>
  <tr><th>Teaching label</th><th>Screening pattern</th></tr>
  <tr><td>No evident compensation</td><td>pH is abnormal and the expected compensatory variable remains within range.</td></tr>
  <tr><td>Partial compensation</td><td>pH remains abnormal and the other system has shifted in the expected direction.</td></tr>
  <tr><td>pH within reference range with both values abnormal</td><td>This can reflect a compensated primary disorder or a mixed disorder. Compare with expected compensation and the clinical picture rather than labeling it from pH alone.</td></tr>
</table>
<p>For simplified exam items, comparing a normal-range pH with 7.40 can help identify the likely primary direction: 7.37 may suggest an acidotic primary process, while 7.43 may suggest an alkalotic primary process. Both values are still within the normal pH range. Treat this comparison as an introductory clue, not proof. Expected-compensation rules, trends and the clinical presentation are needed to identify mixed disorders.</p>

<h2>Causes worth recognizing</h2>
<table>
  <tr><th>Disturbance</th><th>Common exam scenarios</th></tr>
  <tr><td>Respiratory acidosis</td><td>Hypoventilation — COPD, opioid oversedation or overdose, severe obesity, or brain injury.</td></tr>
  <tr><td>Respiratory alkalosis</td><td>Hyperventilation — panic or anxiety, pulmonary embolism, pneumonia, or salicylate toxicity.</td></tr>
  <tr><td>Metabolic acidosis</td><td>Diabetic ketoacidosis, renal failure, severe or prolonged diarrhea, lactic acidosis, or shock.</td></tr>
  <tr><td>Metabolic alkalosis</td><td>Prolonged vomiting, diuretic-related losses, or hypovolemia.</td></tr>
</table>
<p>Two pairings recur often enough to be worth holding ready: <b>vomiting produces metabolic alkalosis</b> because acid is lost, while <b>diarrhea produces metabolic acidosis</b> because bicarbonate is lost.</p>

<h2>Do not forget the oxygen</h2>
<p>PaO2 sits outside the acid-base classification and is easy to skip. A PaO2 of 54 mmHg on room air is below the usual adult range, but oxygenation must be interpreted with the inspired oxygen concentration, age, trend and full clinical presentation. Read every reported value before deciding what the client needs; a normal PaO2 on supplemental oxygen does not by itself exclude respiratory failure.</p>
`,
    faq: [
      { q: "How do I interpret an ABG quickly?", a: "Check the pH for acidemia or alkalemia, compare PaCO2 and HCO3 to identify the likely primary process, assess whether the other system moved in the expected compensatory direction, and then evaluate PaO2 in the oxygen-delivery and clinical context." },
      { q: "How do I tell if an ABG is compensated?", a: "A shift in the other system in the expected direction suggests compensation. If both PaCO2 and HCO3 are abnormal with a normal-range pH, do not assume full compensation automatically; compare the values with expected compensation and assess for a mixed disorder." },
      { q: "Does vomiting cause acidosis or alkalosis?", a: "Metabolic alkalosis, because gastric acid is lost. Prolonged diarrhea does the opposite, causing metabolic acidosis through loss of bicarbonate." },
    ],
  },

  {
    slug: "electrolyte-imbalances",
    topic: "High-yield clinical",
    title: "Electrolyte imbalances for NCLEX: signs and priorities",
    h1: "Electrolyte imbalances for the NCLEX",
    description: "Compare potassium, sodium, calcium and magnesium imbalances, including common findings, causes and nursing safety priorities.",
    published: "2026-08-03",
    updated: "2026-08-26",
    cta: "PulseRN drills electrolyte scenarios as full cases, so you practice recognizing them from findings rather than labels.",
    body: `
<p>Electrolyte questions connect a laboratory result with symptoms, likely causes and a nursing priority. Start with stability: new ECG changes, dysrhythmia, seizure, marked change in consciousness, paralysis or respiratory depression takes priority over memorizing a list. Then check the reporting laboratory's reference interval, the direction and speed of change, symptoms, kidney function, medications and possible specimen error.</p>

<h2>Potassium</h2>
<div class="table-wrap" role="region" aria-label="Potassium imbalance comparison" tabindex="0">
<table>
  <caption>Potassium imbalance comparison</caption>
  <thead><tr><th scope="col">Comparison</th><th scope="col">Hypokalemia</th><th scope="col">Hyperkalemia</th></tr></thead>
  <tbody>
  <tr><th scope="row">Typical threshold</th><td>Below 3.5 mEq/L, with laboratory variation</td><td>Above the laboratory's upper limit, commonly 5.0–5.5 mEq/L</td></tr>
  <tr><th scope="row">Possible findings</th><td>Weakness, fatigue, cramps, constipation, palpitations and dysrhythmias</td><td>Weakness, palpitations, conduction changes, dysrhythmias or paralysis; mild cases may have no symptoms</td></tr>
  <tr><th scope="row">Common contexts</th><td>Loop or thiazide diuretics, vomiting, diarrhea, poor intake and magnesium depletion</td><td>Acute or chronic kidney disease, potassium-raising medications, tissue breakdown and transcellular shifts such as acidosis</td></tr>
  <tr><th scope="row">Nursing focus</th><td>Assess symptoms and cardiac risk, review losses and medications, check magnesium when relevant, and replace only as ordered</td><td>Assess symptoms and ECG, stop exogenous sources when ordered, report urgent findings, and anticipate measures that stabilize the myocardium, shift potassium or remove it</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this section:</b> <a href="#source-ncbi-statpearls-hypokalemia-2025">Hypokalemia</a>, <a href="#source-ncbi-statpearls-hyperkalemia-2025">Hyperkalemia</a>, and the <a href="#source-dailymed-potassium-chloride-concentrate">potassium chloride product label</a>.</p>

<div class="key">
<p><b>Never administer concentrated potassium chloride by direct IV injection or IV push.</b> Before IV infusion, dilute the concentrate in a larger volume and ensure it is completely mixed. Use the prescribed patient-specific dose, concentration and rate; do not infuse it rapidly. Monitor the clinical response and serial laboratory results. Use serial ECGs or cardiac monitoring when indicated, especially with cardiac or renal disease; the product label requires continuous cardiac monitoring for urgent high-rate infusion.</p>
</div>
<p>An unexpected potassium result also needs context. Hemolysis can produce pseudohyperkalemia, so an unexplained elevation without matching symptoms or ECG changes may need confirmation before aggressive treatment. Do not delay escalation when the client is symptomatic or has concerning ECG findings.</p>

<h2>Sodium</h2>
<div class="table-wrap" role="region" aria-label="Sodium imbalance comparison" tabindex="0">
<table>
  <caption>Sodium imbalance comparison</caption>
  <thead><tr><th scope="col">Comparison</th><th scope="col">Hyponatremia (below 135 mEq/L)</th><th scope="col">Hypernatremia (above 145 mEq/L)</th></tr></thead>
  <tbody>
  <tr><th scope="row">Possible findings</th><td>Headache, nausea, fatigue, confusion, gait change, seizures or reduced consciousness when severe or rapidly developing</td><td>Thirst and dehydration findings; restlessness, irritability, lethargy, seizures or coma when severe or rapidly developing</td></tr>
  <tr><th scope="row">Common contexts</th><td>SIADH, diuretics, excess water relative to solute, heart failure, kidney disease and gastrointestinal losses</td><td>Water loss, inadequate access to water, diabetes insipidus, osmotic diuresis and, less often, excess sodium</td></tr>
  <tr><th scope="row">Nursing focus</th><td>Neurological and volume-status assessment, seizure precautions when indicated, serial sodium results and the prescribed correction plan</td><td>Neurological and volume-status assessment, intake and output, ongoing losses, serial sodium results and the prescribed correction plan</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this section:</b> <a href="#source-ncbi-statpearls-hyponatremia-2026">Hyponatremia</a> and <a href="#source-ncbi-statpearls-hypernatremia-2023">Hypernatremia</a>.</p>
<p>Symptoms depend on severity, duration and rate of change, not only the sodium value. Correction must be individualized to the cause, volume status, symptoms and whether the disturbance is acute or chronic. Overly rapid correction of chronic hyponatremia can cause osmotic demyelination; overly rapid correction of chronic hypernatremia can cause cerebral edema and seizures.</p>

<h2>Calcium</h2>
<div class="table-wrap" role="region" aria-label="Calcium imbalance comparison" tabindex="0">
<table>
  <caption>Calcium imbalance comparison</caption>
  <thead><tr><th scope="col">Comparison</th><th scope="col">Hypocalcemia</th><th scope="col">Hypercalcemia</th></tr></thead>
  <tbody>
  <tr><th scope="row">Possible findings</th><td>Perioral or fingertip tingling, painful cramps, tetany, seizures and QT prolongation</td><td>Weakness, constipation, polyuria, polydipsia, kidney stones and altered mental status when severe</td></tr>
  <tr><th scope="row">Assessment context</th><td colspan="2">Distinguish total from ionized calcium. Albumin can change total calcium without changing the physiologically active ionized fraction.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this section:</b> <a href="#source-ncbi-statpearls-calcium-disorders-2026">Calcium homeostasis and disorders</a>.</p>
<p><b>Chvostek sign</b> is ipsilateral facial contraction after tapping over the facial nerve. <b>Trousseau sign</b> is carpal spasm provoked by inflating a blood pressure cuff above systolic pressure. They are associated with neuromuscular irritability in hypocalcemia, but a bedside sign is not diagnostic by itself; interpret it with symptoms and laboratory evidence.</p>

<h2>Magnesium</h2>
<div class="table-wrap" role="region" aria-label="Magnesium imbalance comparison" tabindex="0">
<table>
  <caption>Magnesium imbalance comparison</caption>
  <thead><tr><th scope="col">Comparison</th><th scope="col">Hypomagnesemia</th><th scope="col">Hypermagnesemia or magnesium toxicity</th></tr></thead>
  <tbody>
  <tr><th scope="row">Possible findings</th><td>Tremor, hyperreflexia, muscle fasciculations, dysrhythmias and seizures when severe</td><td>Diminished reflexes, hypotension, central nervous system depression, respiratory depression and conduction abnormalities as toxicity progresses</td></tr>
  <tr><th scope="row">Common contexts</th><td>Alcohol use disorder, chronic diarrhea, malnutrition, proton-pump inhibitors and loop or thiazide diuretics</td><td>Magnesium-containing medications or IV therapy, especially when kidney function is impaired</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this section:</b> <a href="#source-ncbi-statpearls-magnesium-2023">Magnesium</a> and the <a href="#source-dailymed-magnesium-sulfate-in-water">magnesium sulfate product label</a>.</p>
<p>During magnesium sulfate therapy for preeclampsia or eclampsia, monitor deep-tendon reflexes, respiratory status, urine output and renal function, serum magnesium when ordered, and the overall clinical picture. Diminishing or absent patellar reflexes are an important warning of rising magnesium effect and may precede respiratory paralysis; report toxicity findings and follow the ordered emergency protocol.</p>

<div class="key" role="note" aria-labelledby="urgent-electrolyte-findings">
<h2 id="urgent-electrolyte-findings" style="margin-top:0">Findings that change the priority</h2>
<p>Escalate new dysrhythmia or concerning ECG change, severe weakness or paralysis, seizure, marked change in consciousness, tetany, respiratory depression, or diminishing or absent reflexes during magnesium therapy according to the clinical setting and emergency protocol. These findings make immediate safety assessment more important than finishing a diagnostic mnemonic.</p>
</div>

<h2>A safer recall pattern</h2>
<p>Use patterns as prompts, not rules. Low calcium and low magnesium often increase neuromuscular excitability; excess magnesium depresses reflexes and respiration. Potassium abnormalities can disrupt cardiac conduction in either direction, and sodium disorders often become neurologic when severe or rapid. Then return to the actual result, trend, ECG, symptoms, cause and clinical orders before choosing an intervention.</p>
`,
    faq: [
      { q: "Can potassium chloride be given by IV push?", a: "No. Concentrated potassium chloride must never be administered by direct IV injection or IV push. Before IV infusion, it must be diluted in a larger volume and completely mixed. Use the prescribed patient-specific dose, concentration and rate; do not infuse it rapidly. Monitoring is based on the clinical risk, and continuous cardiac monitoring is required by the product label for urgent high-rate infusion." },
      { q: "What are Chvostek and Trousseau signs?", a: "Chvostek sign is facial contraction after tapping over the facial nerve; Trousseau sign is carpal spasm induced by inflating a blood pressure cuff above systolic pressure. Both are associated with hypocalcemic neuromuscular irritability but are interpreted with symptoms and laboratory evidence, not alone." },
      { q: "What is monitored during magnesium sulfate therapy?", a: "Monitor deep-tendon reflexes, respiratory status, urine output and renal function, serum magnesium when ordered, and the client's overall condition. Diminishing or absent patellar reflexes are an important toxicity warning and may occur before respiratory paralysis." },
      { q: "When is an electrolyte imbalance urgent?", a: "Urgency depends on symptoms, the rate of change and the clinical setting—not the number alone. New dysrhythmia or concerning ECG changes, severe weakness or paralysis, seizure, marked change in consciousness, tetany, respiratory depression, or diminishing or absent reflexes during magnesium therapy require prompt escalation under the applicable emergency protocol." },
    ],
  },

  {
    slug: "infection-control-precautions",
    topic: "High-yield clinical",
    title: "Infection control precautions for the NCLEX",
    h1: "Infection control precautions for the NCLEX",
    description: "Compare Standard, Airborne, Droplet and Contact Precautions, disease-specific qualifiers, PPE sequencing and protective environments.",
    published: "2026-08-03",
    updated: "2026-08-27",
    cta: "PulseRN drills infection-control scenarios and PPE sequencing as ordered, drag-and-drop items.",
    body: `
<p>Choose infection-control precautions from the suspected or confirmed organism, route of transmission, care setting and current facility policy. <b>Standard Precautions apply to every client</b>; add one or more Transmission-Based Precautions when Standard Precautions alone do not interrupt transmission. When the diagnosis is not yet confirmed, use the indicated empiric precautions while testing is pending.</p>

<div class="key" role="note" aria-labelledby="infection-control-safety-boundary">
<h2 id="infection-control-safety-boundary" style="margin-top:0">Safety boundary</h2>
<p>This is an NCLEX study framework, not a substitute for the isolation sign, infection-prevention direction or facility policy. Precaution type, PPE and duration can change with the organism, symptoms, immune status, procedure and care setting.</p>
</div>

<h2>The three transmission-based categories</h2>
<div class="table-wrap" role="region" aria-label="Transmission-based precautions comparison" tabindex="0">
<table>
  <caption>Transmission-Based Precautions in acute care</caption>
  <thead><tr><th scope="col">Precaution</th><th scope="col">Placement</th><th scope="col">Healthcare personnel</th><th scope="col">Patient movement</th></tr></thead>
  <tbody>
  <tr><th scope="row">Airborne</th><td>Airborne infection isolation room (AIIR) with monitored negative pressure; keep the door closed.</td><td>Put on disease-specific respiratory protection before entry. Current tuberculosis and measles guidance uses a fit-tested N95 or more protective respirator.</td><td>Limit transport. If transport is necessary, place a mask on the patient if tolerated and cover infectious skin lesions.</td></tr>
  <tr><th scope="row">Droplet</th><td>Single-patient room if available; special air handling is not required.</td><td>Wear a mask for close contact, generally upon room entry. Add eye protection when Standard Precautions or the organism-specific protocol indicates it.</td><td>Limit transport and have the patient wear a mask if tolerated; follow respiratory hygiene.</td></tr>
  <tr><th scope="row">Contact</th><td>Single-patient room if available; use dedicated or appropriately disinfected equipment.</td><td>Put on gown and gloves on entry when contact with the patient or contaminated environment is expected; remove and discard them before exit.</td><td>Contain infected or colonized areas and communicate the precaution status during transfer.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this section:</b> <a href="#source-cdc-isolation-precautions">CDC Transmission-Based Precautions</a> and the <a href="#source-cdc-isolation-appendix-a-2025">CDC disease-specific Appendix A</a>.</p>

<h2>High-yield disease examples and qualifiers</h2>
<h3>Airborne, with Standard Precautions</h3>
<ul>
  <li><b>Suspected or confirmed pulmonary or laryngeal tuberculosis:</b> use an AIIR and the respiratory protection required by the tuberculosis and facility protocol.</li>
  <li><b>Measles (rubeola):</b> Airborne Precautions through four days after rash onset; use the duration of illness when the patient is immunocompromised.</li>
  <li><b>Varicella (chickenpox):</b> Airborne plus Contact Precautions until lesions are dry and crusted.</li>
  <li><b>Disseminated herpes zoster:</b> Airborne plus Contact Precautions. Use the same combination for localized zoster in an immunocompromised patient until dissemination is ruled out.</li>
</ul>
<p>Localized zoster in an immunocompetent patient is different: if lesions can be completely covered, CDC lists Standard Precautions until they are dry and crusted. When possible, susceptible healthcare personnel should not care for measles, varicella or zoster when immune caregivers are available.</p>

<h3>Droplet, with Standard Precautions</h3>
<ul>
  <li><b>Seasonal influenza:</b> follow current influenza and facility guidance.</li>
  <li><b>Pertussis:</b> continue through five days after effective antibiotic therapy begins.</li>
  <li><b>Known or suspected meningococcal disease:</b> continue through 24 hours after effective therapy begins.</li>
  <li><b>Mumps:</b> continue through five days after swelling begins.</li>
  <li><b>Rubella:</b> continue through seven days after rash onset.</li>
  <li><b>Group A streptococcal pharyngitis:</b> use Droplet Precautions for the first 24 hours of effective antimicrobial therapy.</li>
</ul>

<h3>Contact, with Standard Precautions</h3>
<ul>
  <li><b>Clostridioides difficile infection:</b> initiate Contact Precautions for suspected or confirmed infection and use dedicated equipment.</li>
  <li><b>MRSA, VRE and other clinically significant MDROs:</b> use Contact Precautions when indicated by the acute-care setting, transmission risk and infection-prevention program.</li>
  <li><b>Scabies and head lice:</b> continue through 24 hours after effective therapy begins.</li>
  <li><b>Respiratory syncytial virus:</b> use Contact Precautions for infants, young children and immunocompromised adults for the duration of illness; prolonged shedding may extend the duration.</li>
  <li><b>Major wounds or skin infections:</b> use Contact Precautions when drainage cannot be covered or contained. Standard Precautions may be sufficient when a dressing fully contains limited drainage.</li>
</ul>
<p class="source-note"><b>Evidence for these examples:</b> the <a href="#source-cdc-isolation-appendix-a-2025">CDC disease-specific precaution and duration table</a>. Always verify the posted isolation order and current institutional protocol.</p>

<h2>C. difficile: separate spores from hand-hygiene policy</h2>
<div class="key">
<p>Alcohol-based hand sanitizer does not have sporicidal activity, and soap-and-water washing removes spores better. However, CDC still prefers alcohol-based hand sanitizer for routine healthcare hand hygiene when hands are not visibly soiled because eliminating it can reduce overall compliance. Wash with soap and water when hands are visibly soiled and during care of patients with suspected or confirmed C. difficile in an outbreak; CDC encourages soap-and-water washing after care as an additional outbreak precaution without restricting access to alcohol-based sanitizer.</p>
</div>
<p>Use gown and gloves, dedicated equipment and an EPA-registered sporicidal disinfectant according to the product instructions and facility protocol. In acute care, CDC recommends maintaining Contact Precautions for confirmed infection for at least 48 hours after diarrhea resolves, or longer when the facility policy requires it.</p>
<p class="source-note"><b>Evidence for this section:</b> <a href="#source-cdc-cdiff-acute-care-2026">CDC acute-care C. difficile guidance</a>, <a href="#source-cdc-clinical-hand-hygiene-2024">CDC clinical hand-hygiene guidance</a>, and the <a href="#source-cdc-isolation-appendix-a-2025">CDC isolation appendix</a>.</p>

<h2>Protective environment is a specific designation</h2>
<p>Do not use “protective environment” as a generic synonym for neutropenic precautions. CDC's protective-environment table applies to <b>allogeneic hematopoietic stem-cell transplant recipients</b>. It specifies HEPA-filtered incoming air, at least 12 air changes per hour, positive pressure relative to the corridor, a well-sealed room, a self-closing door, and no fresh or dried flowers or potted plants. It does not require masks, gowns or gloves in the absence of suspected or confirmed infection unless Standard Precautions or source control indicates them. Other immunocompromised patients require individualized precautions under facility and infection-prevention guidance.</p>
<p class="source-note"><b>Evidence for this section:</b> <a href="#source-cdc-protective-environment-table-5">CDC Components of a Protective Environment</a>.</p>

<h2>PPE sequence: learn the example and follow the protocol</h2>
<p>A CDC example for <b>putting on</b> PPE is gown, mask or respirator, goggles or face shield, then gloves. One CDC example for <b>removal</b> is gloves, goggles or face shield, gown, then mask or respirator, followed immediately by hand hygiene.</p>
<p>Use the posted isolation procedure because more than one safe removal method can be acceptable and organism-specific protocols can differ. Keep contaminated surfaces away from clothing and mucous membranes; perform hand hygiene between steps if the hands become contaminated. For an AIIR, keep respiratory protection on until after leaving the room and closing the door unless the applicable protocol directs otherwise.</p>
<p class="source-note"><b>Evidence for this section:</b> <a href="#source-cdc-ppe-sequence-2023">CDC's safe donning and removal example</a> and <a href="#source-cdc-isolation-precautions">CDC Transmission-Based Precautions</a>.</p>
`,
    faq: [
      { q: "What precautions are used for C. difficile?", a: "Use Standard plus Contact Precautions, gown and gloves, dedicated equipment, and an EPA-registered sporicidal disinfectant under facility policy. Soap and water removes spores better and is emphasized when hands are visibly soiled and during outbreaks, but CDC does not recommend removing access to alcohol-based hand sanitizer." },
      { q: "What is the correct order for putting on PPE?", a: "One CDC example is gown, mask or respirator, goggles or face shield, then gloves. Follow the posted protocol because organism-specific procedures and safe removal methods can differ." },
      { q: "Which conditions commonly require Airborne Precautions?", a: "Suspected or confirmed pulmonary or laryngeal tuberculosis, measles, varicella, disseminated zoster, and localized zoster in an immunocompromised patient until dissemination is ruled out. Varicella and the applicable zoster presentations also require Contact Precautions." },
      { q: "Does every neutropenic patient need a protective-environment room?", a: "No. CDC's protective-environment table specifically applies to allogeneic hematopoietic stem-cell transplant recipients. Other immunocompromised patients need individualized precautions based on facility and infection-prevention guidance." },
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
