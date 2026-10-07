/* Public sample-question sets requested by the SEO audit. These are deliberately
   separate from the authenticated question bank: they are crawlable educational
   examples with visible answers, rationales, sources, and fail-closed RN review
   provenance. */

export const SAMPLE_ARTICLES = [
  {
    slug: "nclex-pharmacology-practice-questions",
    topic: "Practice questions",
    title: "Free NCLEX pharmacology practice questions with rationales",
    h1: "NCLEX pharmacology practice questions",
    description: "Try five free NCLEX pharmacology questions on high-alert medications, reversal agents, monitoring, and label-based medication safety.",
    published: "2026-08-29",
    updated: "2026-08-29",
    cta: "PulseRN includes adaptive pharmacology practice with explanations after every committed answer.",
    body: `
<p>These five original questions demonstrate the reasoning expected in NCLEX-RN pharmacology practice. Commit to an answer before opening the rationale. Medication labels and safety guidance change, so use the linked primary sources and your current nursing-program materials rather than treating a mnemonic as a clinical order.</p>

<div class="key" role="note" aria-labelledby="pharm-sample-boundary">
<h2 id="pharm-sample-boundary" style="margin-top:0">Educational boundary</h2>
<p>These are exam-preparation examples, not medication-administration instructions. In practice, verify the patient, complete order, product label, allergies, contraindications, laboratory results, monitoring requirements, and facility policy. Stop and use the required clinical verification process whenever an order or response is unclear.</p>
</div>

<section class="question" aria-labelledby="pharm-q1">
<h2 id="pharm-q1">Question 1: What “high alert” means</h2>
<p>A nurse is explaining why a medication appears on an institutional high-alert list. Which statement is most accurate?</p>
<ol class="options" type="A">
  <li>The medication causes errors more frequently than every other medication.</li>
  <li>The medication is prohibited outside an intensive-care unit.</li>
  <li>An error involving the medication carries a heightened risk of significant patient harm.</li>
  <li>Every dose requires the same independent double-check in every organization.</li>
</ol>
<details><summary>Show answer and rationale</summary><p><b>Answer: C.</b> ISMP uses “high-alert” for medications that carry a heightened risk of causing significant harm when used in error. The designation does not prove that errors are more frequent, create a universal location restriction, or prescribe one identical safeguard for every setting. Organizations select safeguards appropriate to the medication and process.</p></details>
</section>

<section class="question" aria-labelledby="pharm-q2">
<h2 id="pharm-q2">Question 2: Heparin reversal</h2>
<p>A client receiving unfractionated heparin develops serious bleeding, and the prescriber orders the labeled reversal agent. Which medication should the nurse expect?</p>
<ol class="options" type="A">
  <li>Protamine sulfate</li>
  <li>Naloxone</li>
  <li>Flumazenil</li>
  <li>Acetylcysteine</li>
</ol>
<details><summary>Show answer and rationale</summary><p><b>Answer: A.</b> The heparin label identifies protamine sulfate for neutralization of heparin, and the protamine label identifies heparin overdosage as its indication. Protamine must be administered according to the current order and label because rapid administration can cause severe hypotensive and anaphylactoid reactions. The other options reverse different toxicities.</p></details>
</section>

<section class="question" aria-labelledby="pharm-q3">
<h2 id="pharm-q3">Question 3: Warfarin monitoring and diet</h2>
<p>Which statement by a client taking warfarin best reflects safe teaching?</p>
<ol class="options" type="A">
  <li>“I will stop eating every food that contains vitamin K.”</li>
  <li>“I will keep my vitamin K intake reasonably consistent and complete ordered INR monitoring.”</li>
  <li>“Once my dose is stable, laboratory monitoring is no longer necessary.”</li>
  <li>“An over-the-counter medication cannot affect my warfarin response.”</li>
</ol>
<details><summary>Show answer and rationale</summary><p><b>Answer: B.</b> The warfarin prescribing information emphasizes INR monitoring and notes that changes in dietary vitamin K can alter response. The goal is not universal avoidance of vitamin-K-containing foods. New prescriptions, over-the-counter products, supplements, illness, and diet changes should be discussed through the appropriate clinical process.</p></details>
</section>

<section class="question" aria-labelledby="pharm-q4">
<h2 id="pharm-q4">Question 4: Response after naloxone</h2>
<p>A client with suspected opioid overdose improves after naloxone. Which action remains necessary?</p>
<ol class="options" type="A">
  <li>End observation because the first response proves that recurrence is impossible.</li>
  <li>Withhold airway support because naloxone replaces resuscitative care.</li>
  <li>Assume one dose is always sufficient for every opioid exposure.</li>
  <li>Continue respiratory support and surveillance, with repeat treatment available as ordered if the response is incomplete or symptoms recur.</li>
</ol>
<details><summary>Show answer and rationale</summary><p><b>Answer: D.</b> The naloxone label directs clinicians to maintain airway and resuscitative support, observe the patient, and use repeat administration when indicated because the initial response may be incomplete and opioid effects can outlast naloxone. A response does not remove the need for monitoring.</p></details>
</section>

<section class="question" aria-labelledby="pharm-q5">
<h2 id="pharm-q5">Question 5: Flumazenil safety</h2>
<p>Which risk is most important to recognize before administering flumazenil?</p>
<ol class="options" type="A">
  <li>It prevents all recurrence of sedation.</li>
  <li>It eliminates the need for airway and ventilatory support.</li>
  <li>It can precipitate seizures in specified high-risk circumstances, and resedation can occur.</li>
  <li>It is the labeled reversal agent for opioid overdose.</li>
</ol>
<details><summary>Show answer and rationale</summary><p><b>Answer: C.</b> Flumazenil carries a seizure warning and requires monitoring for resedation. It does not replace airway or ventilatory support. Naloxone—not flumazenil—is used for opioid overdose. Apply the current label, patient history, exposure context, and ordered monitoring.</p></details>
</section>
`,
    faq: [
      { q: "Are these real NCLEX questions?", a: "No. They are original educational examples written to practice NCLEX-style reasoning. They are not copied from, recalled from, or represented as live NCLEX content." },
      { q: "Why do the rationales cite medication labels?", a: "Medication details can vary by product and change over time. A current authoritative label makes the reasoning traceable and easier to recheck." },
      { q: "Should I memorize every reversal agent as an absolute rule?", a: "Use pairings as study cues, then check the exact exposure, contraindications, current label, monitoring needs, and clinical context. A memorized pairing is not a medication order." },
    ],
  },

  {
    slug: "nclex-prioritization-practice-questions",
    topic: "Practice questions",
    title: "Free NCLEX prioritization questions with rationales",
    h1: "NCLEX prioritization practice questions",
    description: "Try five free NCLEX prioritization questions using emergency recognition, change from baseline, time sensitivity, assessment, and evaluation.",
    published: "2026-08-29",
    updated: "2026-08-29",
    cta: "PulseRN interleaves prioritization across client-needs categories so you compare urgency in context.",
    body: `
<p>Prioritization is not solved by one slogan. For each example, identify the task, screen for an established emergency, compare meaningful changes and time sensitivity, choose the first safe action, and identify what response must be evaluated. Commit before opening the rationale.</p>

<div class="key" role="note" aria-labelledby="priority-sample-boundary">
<h2 id="priority-sample-boundary" style="margin-top:0">Educational boundary</h2>
<p>These simplified examples test an exam-reasoning sequence. Real care depends on the complete assessment, current orders, emergency protocols, available team, scope of practice, and facility policy. Do not delay an established emergency response to satisfy a mnemonic.</p>
</div>

<section class="question" aria-labelledby="priority-q1">
<h2 id="priority-q1">Question 1: Established cardiac arrest</h2>
<p>A hospitalized adult is unresponsive, is not breathing normally, and has no definite pulse. Which action takes priority?</p>
<ol class="options" type="A">
  <li>Activate the emergency response and begin high-quality CPR while an AED/defibrillator is obtained.</li>
  <li>Complete a full pain assessment.</li>
  <li>Review the admission medication list before intervening.</li>
  <li>Wait for the primary provider to arrive before starting resuscitation.</li>
</ol>
<details><summary>Show answer and rationale</summary><p><b>Answer: A.</b> The scenario already establishes cardiac arrest. Current adult basic-life-support guidance prioritizes recognition, emergency-response activation, high-quality CPR, and AED use. Nonessential assessment and record review must not delay the defined emergency response.</p></details>
</section>

<section class="question" aria-labelledby="priority-q2">
<h2 id="priority-q2">Question 2: Change from baseline</h2>
<p>The nurse receives four reports. Which client should be assessed first?</p>
<ol class="options" type="A">
  <li>A client with chronic arthritis requesting a scheduled warm pack</li>
  <li>A client whose family reports sudden new confusion and difficulty speaking</li>
  <li>A client awaiting routine discharge instructions</li>
  <li>A client with a documented chronic finding unchanged from baseline</li>
</ol>
<details><summary>Show answer and rationale</summary><p><b>Answer: B.</b> A sudden neurologic change is new, potentially time-sensitive, and carries a greater consequence of delay than stable or routine needs. “Chronic” and “expected” are context, not automatic proof of safety; the decisive comparison here is the abrupt change.</p></details>
</section>

<section class="question" aria-labelledby="priority-q3">
<h2 id="priority-q3">Question 3: Assessment versus action</h2>
<p>Which principle best determines whether the nurse should assess again or act first?</p>
<ol class="options" type="A">
  <li>Assessment must always precede every intervention.</li>
  <li>Action is always preferred because reassessment wastes time.</li>
  <li>Assess when material information is missing; act when the scenario already establishes the emergency and defined response.</li>
  <li>Choose whichever option appears first in the answer list.</li>
</ol>
<details><summary>Show answer and rationale</summary><p><b>Answer: C.</b> Another assessment is useful when it could change the immediate safe action. When the stem already establishes an emergency with a defined response, nonessential reassessment delays care. The requested task and supplied evidence control the sequence.</p></details>
</section>

<section class="question" aria-labelledby="priority-q4">
<h2 id="priority-q4">Question 4: Using Maslow safely</h2>
<p>When is Maslow’s hierarchy most defensible in an NCLEX prioritization item?</p>
<ol class="options" type="A">
  <li>As a limited tie-breaker after immediate safety, urgency, and time sensitivity have been compared</li>
  <li>As a rule that overrides a current emergency algorithm</li>
  <li>As proof that every psychosocial concern can wait indefinitely</li>
  <li>As a substitute for reading the clinical findings</li>
</ol>
<details><summary>Show answer and rationale</summary><p><b>Answer: A.</b> Maslow may organize otherwise comparable needs, but it does not override emergency protocols, immediate safety threats, or the actual cues in the stem. Use it only after higher-risk differences have been resolved.</p></details>
</section>

<section class="question" aria-labelledby="priority-q5">
<h2 id="priority-q5">Question 5: Evaluation after action</h2>
<p>After the nurse completes the priority intervention, what is the next reasoning obligation?</p>
<ol class="options" type="A">
  <li>Assume the intervention worked because it was the best answer.</li>
  <li>Evaluate the relevant patient response and revise or escalate when the expected outcome is not achieved.</li>
  <li>Begin an unrelated task before checking the response.</li>
  <li>Document success before reassessment.</li>
</ol>
<details><summary>Show answer and rationale</summary><p><b>Answer: B.</b> Clinical judgment continues through evaluating outcomes. The nurse reassesses the response that matters, compares it with the expected result, and escalates or revises the plan when the client does not improve.</p></details>
</section>
`,
    faq: [
      { q: "Do ABCs always decide the first NCLEX action?", a: "No. ABCs help screen for immediate physiologic threats, but a specific emergency algorithm, supplied findings, requested task, and consequence of delay determine the defensible sequence." },
      { q: "Does chronic always mean low priority?", a: "No. Chronic describes context. Compare the current severity, trend, associated cues, baseline, and consequence of delay." },
      { q: "Should the nurse always assess before acting?", a: "Assess when important information is missing or ambiguous. When the scenario already establishes an emergency and its immediate response, begin that response and evaluate it." },
    ],
  },

  {
    slug: "nclex-dosage-calculation-practice-questions",
    topic: "Practice questions",
    title: "Free NCLEX dosage calculation practice questions",
    h1: "NCLEX dosage calculation practice questions",
    description: "Work five free NCLEX dosage calculations covering tablets, liquids, pump rates, gravity tubing, weight conversion, units, and rounding.",
    published: "2026-08-29",
    updated: "2026-08-29",
    cta: "PulseRN includes calculation items with units, answer commitment, and rationales after every attempt.",
    body: `
<p>Write the units at every step, use only the values supplied, and round only where the question directs. These five examples use educational numbers rather than patient-specific orders. Commit to the numerical answer before opening the worked rationale.</p>

<div class="key" role="note" aria-labelledby="dose-sample-boundary">
<h2 id="dose-sample-boundary" style="margin-top:0">Educational boundary</h2>
<p>A correct arithmetic result does not by itself make a real medication order safe. In practice, verify the complete order, product and concentration, route, timing, patient factors, safe range, measuring device, required monitoring, and facility policy. Stop and obtain the required independent verification for any unclear or implausible result.</p>
</div>

<section class="question" aria-labelledby="dose-q1">
<h2 id="dose-q1">Question 1: Tablets</h2>
<p>The educational order is 500 mg. The supplied tablet contains 250 mg. How many tablets correspond to the ordered dose?</p>
<details><summary>Show answer and rationale</summary><p><b>Answer: 2 tablets.</b> Ordered dose ÷ available dose × available quantity = 500 mg ÷ 250 mg × 1 tablet = 2 tablets. The milligram units cancel, leaving tablets.</p></details>
</section>

<section class="question" aria-labelledby="dose-q2">
<h2 id="dose-q2">Question 2: Oral liquid</h2>
<p>The educational order is 375 mg. The supplied concentration is 250 mg per 5 mL. How many milliliters correspond to the ordered dose?</p>
<details><summary>Show answer and rationale</summary><p><b>Answer: 7.5 mL.</b> 375 mg ÷ 250 mg × 5 mL = 7.5 mL. Keep the concentration together as 250 mg per 5 mL and confirm that milligrams cancel.</p></details>
</section>

<section class="question" aria-labelledby="dose-q3">
<h2 id="dose-q3">Question 3: Infusion-pump rate</h2>
<p>An educational item supplies 250 mL to infuse over 2 hours. What pump rate in mL/hr completes that volume in the stated time?</p>
<details><summary>Show answer and rationale</summary><p><b>Answer: 125 mL/hr.</b> Volume ÷ time = 250 mL ÷ 2 hr = 125 mL/hr. The item asks for a pump rate, so the final unit is milliliters per hour.</p></details>
</section>

<section class="question" aria-labelledby="dose-q4">
<h2 id="dose-q4">Question 4: Gravity drip rate</h2>
<p>An educational item supplies 1,000 mL over 8 hours with tubing calibrated at 15 gtt/mL. Calculate the whole-number drip rate in gtt/min.</p>
<details><summary>Show answer and rationale</summary><p><b>Answer: 31 gtt/min.</b> Convert 8 hours to 480 minutes. Then 1,000 mL × 15 gtt/mL ÷ 480 min = 31.25 gtt/min. A gravity drip is counted in whole drops, so round the final result to 31 gtt/min.</p></details>
</section>

<section class="question" aria-labelledby="dose-q5">
<h2 id="dose-q5">Question 5: Pounds, kilograms, and a weight-based dose</h2>
<p>An educational item gives a weight of 154 lb, directs use of 1 kg = 2.2 lb, and supplies a dose of 5 mg/kg. What total dose does the calculation produce?</p>
<details><summary>Show answer and rationale</summary><p><b>Answer: 350 mg.</b> First convert the supplied weight: 154 lb ÷ 2.2 lb/kg = 70 kg. Then 70 kg × 5 mg/kg = 350 mg. Keep adequate precision through the intermediate step and round only as the item directs.</p></details>
</section>
`,
    faq: [
      { q: "What formula works for tablet and liquid questions?", a: "A common setup is ordered dose divided by available dose, multiplied by the quantity that contains the available dose. Dimensional analysis reaches the same result while making unit cancellation visible." },
      { q: "When should I round a dosage calculation?", a: "Keep adequate precision through intermediate steps and round the final requested value according to the item, supplied measuring device, and applicable policy." },
      { q: "Does correct math prove a medication dose is safe?", a: "No. Real administration also requires validation of the order, product, concentration, route, timing, patient factors, safe range, monitoring, and policy." },
    ],
  },

  {
    slug: "ngn-bow-tie-practice-questions",
    topic: "Practice questions",
    title: "Free NGN bow-tie practice questions with rationales",
    h1: "NGN bow-tie practice questions",
    description: "Try five free NGN bow-tie examples that connect a likely condition with two priority actions and two parameters to monitor.",
    published: "2026-08-29",
    updated: "2026-08-29",
    cta: "PulseRN includes bow-tie items inside adaptive practice and unfolding case studies.",
    body: `
<p>A bow-tie item asks you to connect the most likely condition with two actions and two parameters to monitor. Read the number of selections required, use only the supplied cues, and make all five selections describe one coherent clinical picture. These text versions expose the reasoning without imitating live NCLEX content.</p>

<div class="key" role="note" aria-labelledby="bowtie-sample-boundary">
<h2 id="bowtie-sample-boundary" style="margin-top:0">Educational boundary</h2>
<p>Each scenario is deliberately simplified for exam preparation. It is not a standing protocol or substitute for patient-specific assessment, current orders, emergency response, medication labeling, and facility policy.</p>
</div>

<section class="question" aria-labelledby="bowtie-q1">
<h2 id="bowtie-q1">Question 1: Opioid toxicity</h2>
<p><b>Cues:</b> After opioid administration, the client is difficult to arouse, respirations are markedly depressed, and oxygenation is worsening.</p>
<p><b>Select one condition:</b> opioid toxicity; hypoglycemia; airborne infection.</p>
<p><b>Select two actions:</b> support airway and ventilation; administer naloxone as ordered; give flumazenil; end observation after the first response.</p>
<p><b>Select two parameters:</b> respiratory effort and oxygenation; level of consciousness and recurrent sedation; dietary vitamin K intake; stool frequency.</p>
<details><summary>Show answer and rationale</summary><p><b>Condition:</b> opioid toxicity. <b>Actions:</b> support airway/ventilation and administer naloxone as ordered. <b>Monitor:</b> respiratory effort/oxygenation and consciousness/recurrent sedation. The naloxone label keeps resuscitative support and surveillance central because the response can be incomplete and opioid effects can recur after naloxone wanes.</p></details>
</section>

<section class="question" aria-labelledby="bowtie-q2">
<h2 id="bowtie-q2">Question 2: Conscious client with low glucose</h2>
<p><b>Cues:</b> A conscious client who can swallow has shakiness and sweating; point-of-care glucose is below the instructed threshold.</p>
<p><b>Select one condition:</b> hypoglycemia; heparin overdosage; C. difficile infection.</p>
<p><b>Select two actions:</b> give 15 grams of fast-acting carbohydrate according to the plan; recheck glucose after 15 minutes; give long-acting insulin immediately; prohibit all oral intake.</p>
<p><b>Select two parameters:</b> repeat glucose result; symptom response and recurrence; INR; airborne-room pressure.</p>
<details><summary>Show answer and rationale</summary><p><b>Condition:</b> hypoglycemia. <b>Actions:</b> provide the instructed fast-acting carbohydrate and recheck after 15 minutes. <b>Monitor:</b> repeat glucose and symptom response/recurrence. The MedlinePlus self-care guidance describes the 15-gram treatment and 15-minute recheck for a person who can follow that plan; inability to swallow or severe impairment requires a different emergency response.</p></details>
</section>

<section class="question" aria-labelledby="bowtie-q3">
<h2 id="bowtie-q3">Question 3: Suspected C. difficile</h2>
<p><b>Cues:</b> A hospitalized client develops new frequent diarrhea after antibiotic exposure, and C. difficile testing is ordered.</p>
<p><b>Select one condition:</b> suspected C. difficile infection; cardiac arrest; opioid toxicity.</p>
<p><b>Select two actions:</b> initiate Contact Precautions according to policy; use dedicated equipment when possible; place the client in an airborne-infection isolation room solely for this finding; delay precautions until every test is final.</p>
<p><b>Select two parameters:</b> stool pattern and hydration-related clinical status; response to the ordered evaluation and treatment; INR; insulin peak time.</p>
<details><summary>Show answer and rationale</summary><p><b>Condition:</b> suspected C. difficile infection. <b>Actions:</b> initiate Contact Precautions according to policy and use dedicated equipment. <b>Monitor:</b> stool pattern/hydration-related status and the response to ordered evaluation/treatment. CDC guidance supports prompt isolation/contact precautions and dedicated equipment; it does not classify C. difficile as an airborne indication.</p></details>
</section>

<section class="question" aria-labelledby="bowtie-q4">
<h2 id="bowtie-q4">Question 4: Bleeding during heparin therapy</h2>
<p><b>Cues:</b> A client receiving unfractionated heparin develops significant active bleeding and an excessive anticoagulation response.</p>
<p><b>Select one condition:</b> heparin-associated over-anticoagulation; hypoglycemia; benzodiazepine reversal.</p>
<p><b>Select two actions:</b> stop heparin and notify the appropriate clinician according to the emergency process; prepare protamine sulfate if ordered; administer naloxone; encourage unsupervised ambulation.</p>
<p><b>Select two parameters:</b> bleeding and hemodynamic response; ordered coagulation testing; stool isolation category; glucose after oral carbohydrate.</p>
<details><summary>Show answer and rationale</summary><p><b>Condition:</b> heparin-associated over-anticoagulation. <b>Actions:</b> stop the heparin/escalate according to the clinical process and prepare ordered protamine. <b>Monitor:</b> bleeding/hemodynamic response and ordered coagulation tests. The heparin and protamine labels support coagulation monitoring and protamine neutralization, with careful administration because protamine itself can cause severe reactions.</p></details>
</section>

<section class="question" aria-labelledby="bowtie-q5">
<h2 id="bowtie-q5">Question 5: Cardiac arrest</h2>
<p><b>Cues:</b> An adult suddenly becomes unresponsive, is not breathing normally, and has no definite pulse.</p>
<p><b>Select one condition:</b> cardiac arrest; stable chronic pain; isolated dietary interaction.</p>
<p><b>Select two actions:</b> activate the emergency-response system; begin high-quality CPR and obtain an AED/defibrillator; complete routine discharge teaching; wait for a full chart review.</p>
<p><b>Select two parameters:</b> rhythm/pulse checks at the protocol-defined times; response to CPR and defibrillation; long-term food preferences; bowel pattern before resuscitation.</p>
<details><summary>Show answer and rationale</summary><p><b>Condition:</b> cardiac arrest. <b>Actions:</b> activate emergency response and begin CPR/obtain an AED. <b>Monitor:</b> protocol-timed rhythm/pulse assessment and response to resuscitation. Current adult basic-life-support guidance prioritizes recognition, activation, CPR, and AED use without delaying for nonessential tasks.</p></details>
</section>
`,
    faq: [
      { q: "How many selections does an NGN bow-tie item require?", a: "Follow the directions shown in the item. A common bow-tie configuration asks for one condition, two actions, and two parameters, but you should never assume the count without reading the screen." },
      { q: "How do I keep the five bow-tie selections consistent?", a: "State the condition first, then confirm that both actions address that condition and both parameters evaluate its risk or response. Reject a selection that belongs to a different clinical picture." },
      { q: "Are these copied from the NCLEX?", a: "No. They are original educational examples and are not copied from, recalled from, or represented as live NCLEX content." },
    ],
  },
];
