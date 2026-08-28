/* Test-taking skill and study strategy. These target the searches students make
   when practice scores have stalled and they suspect the problem is method
   rather than knowledge — which, very often, it is. */

export const SKILL_ARTICLES = [
  {
    slug: "prioritization-abc-maslow",
    topic: "Test-taking skill",
    title: "NCLEX prioritization: who comes first",
    h1: "How to answer NCLEX prioritization questions",
    description: "Use clinical judgment, immediate-threat screening, ABCs and nursing-process context to decide which client or action comes first.",
    published: "2026-08-03",
    updated: "2026-08-27",
    cta: "PulseRN interleaves prioritization across all eight categories so you practice comparing urgency in context.",
    body: `
<p>Prioritization items test whether you can recognize relevant cues, analyze them, rank the most likely or dangerous hypotheses, choose an action and evaluate the response. A mnemonic can help organize the comparison, but no single mnemonic decides every case.</p>

<div class="key" role="note" aria-labelledby="prioritization-safety-boundary">
<h2 id="prioritization-safety-boundary" style="margin-top:0">Safety boundary</h2>
<p>ABCs, Maslow, “acute before chronic” and “assess before acting” are study heuristics—not universal clinical algorithms. Use the exact scenario, current findings, orders, scope of practice and emergency protocol. When the stem establishes an emergency, do not delay the indicated emergency response merely to satisfy a mnemonic.</p>
</div>

<h2>A defensible decision sequence</h2>
<div class="table-wrap" role="region" aria-label="NCLEX prioritization decision sequence" tabindex="0">
<table>
  <caption>Questions to ask before selecting the first client or action</caption>
  <thead><tr><th scope="col">Step</th><th scope="col">Question</th><th scope="col">How it changes priority</th></tr></thead>
  <tbody>
    <tr><th scope="row">1. Read the task</th><td>Does the item ask whom to see, what to assess, or what to do?</td><td>An assessment answer and an intervention answer cannot be ranked without identifying the requested task.</td></tr>
    <tr><th scope="row">2. Screen for an established emergency</th><td>Do the supplied cues already establish an immediate life threat?</td><td>Activate the applicable response and begin the indicated first action rather than collecting nonessential data.</td></tr>
    <tr><th scope="row">3. Compare change and acuity</th><td>What is new, worsening, unexpected or different from baseline?</td><td>A meaningful acute change often raises priority, but “chronic” or “expected” never means automatically safe.</td></tr>
    <tr><th scope="row">4. Compare time sensitivity</th><td>Which delay is most likely to cause serious harm?</td><td>Choose the option whose safe window is shortest, using the clinical context rather than a memorized hierarchy alone.</td></tr>
    <tr><th scope="row">5. Choose and reassess</th><td>What action fits the evidence, and what response must be evaluated?</td><td>NCSBN's clinical-judgment model continues through taking action and evaluating outcomes.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this sequence:</b> the <a href="#source-ncsbn-2026-rn-test-plan">2026 NCSBN RN Test Plan</a> and <a href="#source-ncsbn-next-generation-nclex">NCSBN Clinical Judgment Measurement Model</a>.</p>

<h2>ABCs are a screen, not a universal ranking law</h2>
<p>Airway, breathing and circulation are useful categories for spotting immediate physiologic threats. They do not mean that every airway-related finding automatically outranks every circulation-related finding. The scenario may invoke a specific algorithm, simultaneous team actions or an already established intervention.</p>
<p>Cardiac arrest is the clearest counterexample to a rigid “airway always first” rule. The 2025 AHA adult basic-life-support guideline addresses initial recognition of cardiac arrest, activation of emergency response, high-quality CPR and AED use as a resuscitation sequence. It also includes updated recommendations for respiratory arrest and foreign-body airway obstruction. When the scenario establishes one of these emergencies, follow the applicable current algorithm rather than forcing every action into a generic airway-first ranking.</p>
<p class="source-note"><b>Evidence for this section:</b> the <a href="#source-aha-2025-adult-basic-life-support">2025 AHA Adult Basic Life Support guideline</a>.</p>

<h2>Maslow is a tie-breaker, not a clinical guideline</h2>
<p>When urgency and safety are otherwise comparable, physiologic needs commonly take priority over psychosocial needs. But Maslow does not override an emergency algorithm, an immediate safety threat, a time-critical treatment or the facts in the stem. Use it only after higher-risk differences have been resolved.</p>

<h2>Assessment first—unless the decision is already established</h2>
<p>Assessment is appropriate when important information is missing, the finding is ambiguous, or a questionable result should be verified without delaying care. Action is appropriate when the stem already supplies enough evidence for the protocol-defined response. The useful distinction is not “assess or act” in the abstract; it is whether another assessment would change the immediate safe action.</p>
<p>After acting, evaluation still matters. Reassess the relevant response, compare it with the expected outcome and escalate or revise the plan when the client does not improve.</p>

<h2>How to compare clients without unsafe shortcuts</h2>
<ul>
  <li><b>Do not discard “expected” findings automatically.</b> Severity, trend, associated cues and the recovery stage determine whether an expected symptom is tolerable or dangerous.</li>
  <li><b>Use baseline as context, not permission to ignore change.</b> A chronic condition can destabilize, and a value near baseline can still be urgent when the overall presentation changes.</li>
  <li><b>Distinguish actual cues from assumptions.</b> Rank what the stem states; do not invent stability, diagnoses or resources.</li>
  <li><b>Compare the consequence of delay.</b> Ask what could become irreversible first and whether the nurse can safely begin that response now.</li>
</ul>

<h2>Practice the comparison, not only the answer</h2>
<p>Before revealing a rationale, state who or what comes first, identify the decisive cue, and explain why the runner-up can safely wait. Then name what new cue would reverse your ranking. This exposes whether you used the case facts or merely recognized a familiar mnemonic.</p>
`,
    faq: [
      { q: "Do ABCs always determine which NCLEX client comes first?", a: "No. ABCs help screen for immediate physiologic threats, but a specific emergency algorithm, established intervention, major safety threat or time-critical change can determine the sequence. Use the complete scenario." },
      { q: "Should assessment always be the first nursing action?", a: "Assess when material information is missing or ambiguous. If the stem already establishes an emergency and the immediate response is defined, begin that response and evaluate the result rather than delaying for nonessential reassessment." },
      { q: "Does an expected or chronic finding automatically have low priority?", a: "No. Expected and chronic describe context, not safety. Compare severity, trend, associated cues, baseline and the likely consequence of delay." },
      { q: "Where does Maslow fit in NCLEX prioritization?", a: "Use it as a limited tie-breaker when urgency and safety are otherwise comparable. It does not override emergency protocols, immediate safety threats or time-critical care." },
    ],
  },

  {
    slug: "delegation-and-assignment",
    topic: "Test-taking skill",
    title: "NCLEX delegation and assignment: a safe framework",
    h1: "How to answer NCLEX delegation questions",
    description: "Separate assignment from delegation and apply the Five Rights, scope, competence, communication and supervision before choosing who can safely perform care.",
    published: "2026-08-03",
    updated: "2026-08-27",
    cta: "PulseRN includes delegation scenarios across management of care, with rationales for every option.",
    body: `
<p>Delegation questions test clinical judgment, not a universal list of tasks. The safe answer depends on the patient, the requested activity, the delegatee's verified competence, the state or jurisdiction's nurse practice provisions, employer policy and the supervision the licensed nurse can provide.</p>

<div class="key" role="note" aria-labelledby="delegation-safety-boundary">
<h2 id="delegation-safety-boundary" style="margin-top:0">Safety boundary</h2>
<p>This guide is an NCLEX study framework, not a substitute for a nurse practice act, board rule, job description or facility policy. Jurisdictions differ, and an employer may be more restrictive. Never infer that a task is permitted from a mnemonic alone.</p>
</div>

<h2>Assignment and delegation are not the same</h2>
<p>Under the NCSBN–ANA guidelines, an <b>assignment</b> is routine care, an activity or a procedure already within a licensed nurse's authorized scope or an assistive person's routine role. <b>Delegation</b> transfers responsibility for a specific nursing activity, skill or procedure outside the delegatee's traditional role after the required education, training and competence validation.</p>
<p>A handoff between licensed clinicians is also different: it transfers responsibility for care between providers rather than delegating an activity.</p>

<h2>A defensible delegation decision</h2>
<div class="table-wrap" role="region" aria-label="NCLEX delegation decision framework" tabindex="0">
<table>
  <caption>Checks required before selecting a delegatee</caption>
  <thead><tr><th scope="col">Check</th><th scope="col">Question</th><th scope="col">Why it matters</th></tr></thead>
  <tbody>
    <tr><th scope="row">Patient and circumstance</th><td>What are the patient's needs, stability, predictability and acuity?</td><td>A change in condition requires communication and reassessment of whether delegation remains appropriate.</td></tr>
    <tr><th scope="row">Authority and policy</th><td>Do jurisdiction rules, authorized scope, job description and employer policy permit this activity?</td><td>Neither an exam shortcut nor a local custom can expand legal scope.</td></tr>
    <tr><th scope="row">Competence</th><td>Has this specific delegatee's knowledge and skill been trained and validated?</td><td>A title alone does not establish competence for every activity.</td></tr>
    <tr><th scope="row">Communication</th><td>Are the directions patient-specific, measurable and understood in two-way communication?</td><td>The delegatee needs the task, method, timing, reporting conditions and opportunity to clarify.</td></tr>
    <tr><th scope="row">Supervision and follow-up</th><td>Can the licensed nurse remain available, intervene, follow up and evaluate the patient outcome?</td><td>Delegation continues through supervision and evaluation; it is not complete when instructions are given.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this framework:</b> the <a href="#source-ncsbn-ana-delegation-guidelines-2019">NCSBN–ANA National Guidelines for Nursing Delegation</a> and the <a href="#source-ncsbn-2026-rn-test-plan">2026 NCSBN RN Test Plan</a>.</p>

<h2>The Five Rights of Delegation</h2>
<ol>
  <li><b>Right task:</b> permitted by the delegatee's job description or written setting policy, with required competency preparation.</li>
  <li><b>Right circumstance:</b> the patient's condition and available resources make delegation appropriate; a change triggers reporting and reassessment.</li>
  <li><b>Right person:</b> the individual has the verified knowledge and skill for this activity and patient.</li>
  <li><b>Right directions and communication:</b> instructions specify what to do, what data to collect, how and when to report, and which findings require prompt notification.</li>
  <li><b>Right supervision and evaluation:</b> the licensed nurse is available, monitors as needed, follows up and evaluates the outcome.</li>
</ol>

<h2>What cannot be delegated</h2>
<p>The NCSBN–ANA guidelines state that clinical reasoning, nursing judgment and critical decision-making cannot be delegated. That boundary is safer than memorizing that every activity with a familiar label is always retained or always transferable. Determine whether the specific activity requires judgment in this patient's situation.</p>
<p>Similarly, do not assume an LPN/VN or assistive person may perform an activity merely because it appears on a study list. Confirm authorized scope or routine role, the setting's policy, demonstrated competence, the patient's condition and the supervision required.</p>

<h2>How to reason about common NCLEX options</h2>
<ul>
  <li><b>Routine activities can still be unsafe to assign.</b> Feeding, mobility, vital signs or intake and output may require a different decision when aspiration risk, instability, a new change or required interpretation is present.</li>
  <li><b>Data collection is not clinical interpretation.</b> A trained delegatee may collect permitted data; the licensed nurse retains the judgment the scenario requires and acts on the report.</li>
  <li><b>Licensed status does not erase scope limits.</b> LPN/VN authority varies by jurisdiction, and the activity must also fit employer policy and individual competence.</li>
  <li><b>Float or agency status does not define capability by itself.</b> Match the assignment to verified competence, authorized scope, patient needs and available orientation or support.</li>
</ul>

<h2>Accountability is shared but not identical</h2>
<p>The delegating licensed nurse maintains overall accountability for the patient and must make the delegation decision, remain available, follow up and evaluate the outcome. The delegatee is responsible for accepting only an activity they are competent to perform, carrying it out correctly, documenting it and reporting questions, changes or inability to complete it. The delegatee should not pass the delegated responsibility to someone else.</p>

<h2>Use the stem, not a slogan</h2>
<p>For each answer option, identify the patient's condition, the activity, the required judgment, the proposed person's authorized role and demonstrated competence, the instructions supplied and the follow-up plan. Reject an option as soon as one required element is missing; do not rely on “stable, predictable and routine” as a complete decision rule.</p>
`,
    faq: [
      { q: "What can be assigned or delegated to assistive personnel?", a: "Only an activity permitted by jurisdiction and employer policy that fits the person's routine role or validated delegated competence and is appropriate for this patient. The licensed nurse must give specific directions, supervise and evaluate the outcome." },
      { q: "What cannot be delegated by a licensed nurse?", a: "Clinical reasoning, nursing judgment and critical decision-making cannot be delegated. Whether a named activity requires those functions depends on the patient and circumstance, so avoid universal task lists." },
      { q: "What are the Five Rights of Delegation?", a: "Right task, right circumstance, right person, right directions and communication, and right supervision and evaluation. All five must fit the specific patient, delegatee and setting." },
      { q: "Is the RN the only person accountable after delegation?", a: "No. The delegating licensed nurse retains overall accountability for the patient and follow-up, while the delegatee is responsible for accepting only work they are competent to perform and for completing, documenting and reporting that activity correctly." },
    ],
  },

  {
    slug: "therapeutic-communication",
    topic: "Test-taking skill",
    title: "Therapeutic communication for NCLEX: choose in context",
    h1: "How to answer NCLEX therapeutic communication questions",
    description: "Choose client-centered responses by purpose, cues, safety, culture and context—not by memorizing that one communication technique is always correct.",
    published: "2026-08-03",
    updated: "2026-08-27",
    cta: "PulseRN includes psychosocial integrity items where the wrong answer is comfortable and the right one is harder.",
    body: `
<p>Therapeutic communication is purposeful, client-centered communication that supports assessment, trust, shared decision-making and safety. An NCLEX option should be judged against the client's words, nonverbal cues, immediate needs and the goal of the encounter—not against a list of phrases labeled “always correct.”</p>

<div class="key" role="note" aria-labelledby="communication-safety-boundary">
<h2 id="communication-safety-boundary" style="margin-top:0">Safety boundary</h2>
<p>No communication technique overrides urgent assessment, immediate safety, required treatment or escalation. Adapt language and method for culture, health literacy, preferred language, disability, trauma history, boundaries and client preference. Use qualified interpreters and accessible communication supports when indicated.</p>
</div>

<h2>Start with purpose and cues</h2>
<ol>
  <li><b>Identify the task.</b> Is the nurse exploring feelings, clarifying information, assessing safety, teaching, setting a boundary or coordinating care?</li>
  <li><b>Use the client's exact cue.</b> Respond to what was said or observed rather than introducing an unrelated topic.</li>
  <li><b>Choose the least judgmental effective response.</b> Preserve dignity, autonomy and professional boundaries.</li>
  <li><b>Check whether safety changes the sequence.</b> A concerning cue may require a direct, focused question and immediate action.</li>
</ol>
<p class="source-note"><b>Evidence for this approach:</b> the <a href="#source-ncbi-openrn-therapeutic-communication-2025">NCBI Open RN therapeutic communication chapter</a> and <a href="#source-ncsbn-2026-rn-test-plan">2026 NCSBN RN Test Plan</a>.</p>

<h2>Techniques are tools, not answer keys</h2>
<div class="table-wrap" role="region" aria-label="Therapeutic communication techniques in context" tabindex="0">
<table>
  <caption>Match the technique to the communication goal and client response</caption>
  <thead><tr><th scope="col">Technique</th><th scope="col">Useful purpose</th><th scope="col">Important qualification</th></tr></thead>
  <tbody>
    <tr><th scope="row">Open-ended invitation</th><td>Encourages the client to describe concerns in their own words.</td><td>A focused or closed question can be safer when confirming a specific symptom, fact or immediate risk.</td></tr>
    <tr><th scope="row">Reflection or restatement</th><td>Checks meaning and keeps attention on the client's experience.</td><td>It should sound natural and accurate; mechanical repetition can feel dismissive.</td></tr>
    <tr><th scope="row">Clarification</th><td>Resolves ambiguity before the nurse assumes meaning.</td><td>Use plain, respectful language and allow the client to correct the nurse.</td></tr>
    <tr><th scope="row">Silence</th><td>Allows time to think, feel or continue without interruption.</td><td>Observe whether silence is supportive or increasing distress; do not use it as withdrawal.</td></tr>
    <tr><th scope="row">Offering presence</th><td>Communicates availability without making promises.</td><td>Respect personal space, consent, culture, trauma history and professional boundaries.</td></tr>
    <tr><th scope="row">Information or teaching</th><td>Supports informed decisions when the client needs accurate explanation.</td><td>Assess readiness and understanding; explanation is not a substitute for acknowledging emotion or obtaining consent.</td></tr>
    <tr><th scope="row">Referral or team coordination</th><td>Connects the client with the appropriate professional or resource.</td><td>Address the immediate concern and explain the handoff instead of dismissively passing the client along.</td></tr>
  </tbody>
</table>
</div>

<h2>Patterns that often block communication</h2>
<ul>
  <li><b>False reassurance:</b> “Everything will be fine” promises an outcome the nurse cannot know and may dismiss the concern.</li>
  <li><b>Minimizing or comparison:</b> “Everyone feels that way” shifts attention away from this client's experience.</li>
  <li><b>Judgment or approval:</b> labeling a feeling or decision as good, bad, right or wrong can make the nurse the arbiter of acceptable responses.</li>
  <li><b>Defending:</b> explaining the institution's behavior before exploring the client's concern can close the conversation.</li>
  <li><b>Unsolicited prescriptive advice:</b> telling the client what they “should” do can bypass their goals and autonomy. Collaborative information and clinically necessary instructions are different.</li>
  <li><b>Repeated or accusatory “why” questions:</b> these may feel challenging or demand justification. A neutral invitation such as “What was happening when this began?” may obtain the needed information more safely.</li>
</ul>

<h2>Safety can require direct questions</h2>
<p>If a client expresses hopelessness, self-harm or suicide-related cues, do not rely on a vague invitation alone. Ask directly about suicidal thoughts and, when indicated, the plan and immediate safety; stay present, reduce access to lethal means when safe and within protocol, obtain urgent help, and follow facility or emergency procedures. NIMH states that asking whether a person is suicidal does not increase suicidal thoughts or behavior.</p>
<p class="source-note"><b>Evidence for this section:</b> the <a href="#source-nimh-suicide-five-action-steps-2024">NIMH five action steps</a>. In the United States, the 988 Suicide &amp; Crisis Lifeline is available by call or text; an immediate emergency still requires the applicable emergency response.</p>

<h2>Compare plausible NCLEX responses</h2>
<p>When two options both appear therapeutic, compare their fit to the stated goal, the client's cue, safety urgency, specificity, respect and likely next step. The best option may invite elaboration, but it may instead clarify a fact, give needed information, set a boundary, ask directly about risk or coordinate care. Context decides.</p>
`,
    faq: [
      { q: "Are open-ended questions always the best NCLEX response?", a: "No. They are useful for exploration, but focused or closed questions may be necessary to clarify facts, assess symptoms or determine immediate safety. Choose by purpose and context." },
      { q: "Are 'why' questions always nontherapeutic?", a: "No single word makes a question unsafe, but repeated or accusatory 'why' questions may sound challenging. Use neutral wording that gathers the needed information without demanding justification." },
      { q: "Is giving information or making a referral nontherapeutic?", a: "Not when it meets the client's needs. Give accurate information after considering readiness and understanding, and explain a coordinated referral while addressing the immediate concern rather than dismissing it." },
      { q: "What should the nurse do after a suicide-related cue?", a: "Ask directly about suicidal thoughts and immediate safety, including a plan when indicated; remain present, obtain urgent help and follow the applicable safety or emergency protocol. Direct asking does not increase suicidal thoughts or behavior." },
    ],
  },

  {
    slug: "dosage-calculation-formulas",
    topic: "Test-taking skill",
    title: "NCLEX dosage calculations: formulas and safety checks",
    h1: "How to solve NCLEX dosage calculations safely",
    description: "Set up tablet, liquid, weight-based and IV calculations with units, round only when directed, and verify that the result is safe and plausible.",
    published: "2026-08-03",
    updated: "2026-08-27",
    cta: "PulseRN has an on-screen calculator and worked solutions on every dosage item, so you can see where a calculation went wrong.",
    body: `
<p>NCLEX dosage calculations test whether you can translate an order and a supplied concentration into the requested unit, perform the arithmetic and judge whether the result is safe and plausible. A formula can organize the numbers, but it does not replace reading the entire order, label and item instructions.</p>

<div class="key" role="note" aria-labelledby="dosage-safety-boundary">
<h2 id="dosage-safety-boundary" style="margin-top:0">Safety boundary</h2>
<p>For exam practice, use the values and rounding direction in the item. In clinical practice, verify the complete order, medication label or concentration, route, timing, patient weight when relevant, safe dose range or maximum dose, allergies, contraindications and required monitoring. Follow current facility policy and the device or pharmacy instructions. Do not administer a dose when the order, concentration, calculation or result is unclear or implausible; stop and obtain an independent verification through the required clinical process.</p>
</div>

<h2>Use one setup and keep the units visible</h2>
<p>Dimensional analysis is a reliable general method: write the target unit, multiply by conversion factors arranged so unwanted units cancel, and confirm that only the requested unit remains. Ratio-proportion or the formula method can also work when used correctly. Avoid switching methods in the middle of a problem.</p>
<p>For a simple tablet or liquid dose, a common formula is:</p>
<p><b>Amount to give = (ordered dose ÷ dose available) × quantity containing the available dose.</b></p>
<p>Example: an order is 500 mg and the supply is 250 mg per tablet. The units show the setup: 500 mg × (1 tablet ÷ 250 mg) = 2 tablets.</p>
<p class="source-note"><b>Evidence for the calculation method:</b> <a href="#source-ncbi-openrn-math-calculations-2023">NCBI Open RN Math Calculations</a>. <a href="#source-ncsbn-2026-rn-test-plan">NCSBN's RN Test Plan</a> places medication calculations within safe medication administration and clinical judgment.</p>

<h2>Weight-based doses</h2>
<p>First determine exactly what the order expresses: a dose per administration, per day, per hour or per minute. Then:</p>
<ol>
  <li>Use the measured weight and unit stated in the item. If pounds must be converted to kilograms, use the supplied conversion; a common clinical approximation is <b>1 kg = 2.2 lb</b>, so pounds ÷ 2.2 = kilograms.</li>
  <li>Multiply the ordered amount per kilogram by the patient's weight in kilograms, keeping any time unit such as dose, day, hour or minute.</li>
  <li>If the order is per day but is given in divided doses, calculate the daily amount and then divide by the stated number of doses.</li>
  <li>Compare the calculated dose with the stated safe range or maximum before converting it to tablets or volume.</li>
</ol>
<p>Carry adequate precision through intermediate steps and round the final requested result according to the item, policy and measuring device. Premature rounding can change a small dose.</p>

<h2>IV flow rates</h2>
<p><b>Simple constant-rate pump problem, in milliliters per hour:</b> total volume in mL ÷ total time in hours.</p>
<p>1,000 mL over 8 hours gives 125 mL/hour.</p>
<p><b>Gravity infusion, in drops per minute:</b> (volume in mL × tubing drop factor in gtt/mL) ÷ time in minutes.</p>
<p>1,000 mL over 8 hours with a drop factor of 15 becomes 1,000 times 15, divided by 480 minutes, which is about 31 drops per minute.</p>
<p>A manual gravity rate is expressed as a whole number of drops per minute because a fraction of a drop cannot be counted. For medication infusions prescribed by weight and time, such as mcg/kg/min, include the patient's weight and the prepared concentration; do not substitute the simple volume-over-time formula.</p>

<h2>Conversions: distinguish exact from conventional</h2>
<div class="table-wrap" role="region" aria-label="Dosage calculation conversion factors" tabindex="0">
<table>
  <caption>Common factors used in nursing-education problems</caption>
  <thead><tr><th scope="col">Relationship</th><th scope="col">How to use it</th></tr></thead>
  <tbody>
    <tr><th scope="row">1 g = 1,000 mg</th><td>Exact metric relationship.</td></tr>
    <tr><th scope="row">1 mg = 1,000 mcg</th><td>Exact metric relationship.</td></tr>
    <tr><th scope="row">1 L = 1,000 mL</th><td>Exact metric relationship.</td></tr>
    <tr><th scope="row">1 kg ≈ 2.2 lb</th><td>Common clinical approximation; use the conversion specified by the item or policy.</td></tr>
    <tr><th scope="row">1 tsp ≈ 5 mL; 1 Tbsp ≈ 15 mL; 1 fl oz ≈ 30 mL</th><td>Conventional medication-calculation equivalents. For actual liquid medicine, use a calibrated metric device rather than a household spoon.</td></tr>
  </tbody>
</table>
</div>

<h2>Rounding and format</h2>
<ul>
  <li>Do not round intermediate results unless the item explicitly directs it. Round the final answer to the stated place or to the precision supported by the delivery device and policy.</li>
  <li>For a medication dose below one, use a leading zero: <b>0.5 mg</b>, not .5 mg.</li>
  <li>Do not add a trailing zero to a whole-number medication dose: <b>5 mg</b>, not 5.0 mg.</li>
  <li>Enter the number and unit exactly as the item requests; do not assume every interface uses the same response format.</li>
</ul>
<p>The decimal conventions reduce tenfold misreading risk. They do not authorize changing the precision of a device setting or ignoring a specific documentation standard.</p>

<h2>A final verification sequence</h2>
<ol>
  <li>Re-read what the question asks and confirm the target unit.</li>
  <li>Check that unwanted units cancel and recalculate independently.</li>
  <li>Compare the result with the order, supplied concentration, stated safe range or maximum, route, timing and available measuring device.</li>
  <li>Ask whether the magnitude is plausible. A surprising result is a stop signal, not a reason to force the number into an expected pattern.</li>
  <li>Apply the requested rounding only at the end and label the answer as directed.</li>
</ol>
`,
    faq: [
      { q: "What formula is used for a simple dosage calculation?", a: "For a tablet or liquid problem, amount to give equals ordered dose divided by available dose, multiplied by the quantity containing the available dose. Dimensional analysis reaches the same result while showing whether units cancel." },
      { q: "How do I calculate an IV drip rate?", a: "For gravity tubing, multiply volume in mL by the tubing drop factor in gtt/mL and divide by time in minutes; express the result as whole gtt/min. For a simple pump rate, divide mL by hours. Weight- and time-based medication infusions require the full order, patient weight and prepared concentration." },
      { q: "Should I round kilograms before calculating a weight-based dose?", a: "Keep adequate precision through the intermediate calculation and round the final requested answer according to the item, facility policy and measuring device. Use the weight conversion supplied by the item; 1 kg = 2.2 lb is a common clinical approximation." },
      { q: "What should I do if a calculated dose looks unsafe?", a: "Stop and recheck the order, label, units, arithmetic, safe range or maximum and patient-specific factors. In clinical practice, do not administer an unclear or implausible dose; obtain the independent verification required by policy." },
    ],
  },

  {
    slug: "nclex-study-plan",
    topic: "Study strategy",
    title: "NCLEX study plan: build an adaptable schedule",
    h1: "Build an NCLEX study plan you can adjust",
    description: "Use the RN Test Plan, retrieval practice, spaced study and an error log to create an NCLEX schedule that fits your baseline, time and needs.",
    published: "2026-08-03",
    updated: "2026-08-27",
    cta: "PulseRN builds a weekly plan around your weak areas and schedules flashcards on real calendar dates.",
    body: `
<p>An NCLEX study plan should connect the current RN Test Plan to your own evidence: what you can retrieve, which cues or item formats you misread, and what you can realistically practice before the exam. There is no evidence-based daily question quota or universal number of study weeks that fits every candidate.</p>

<div class="key" role="note" aria-labelledby="study-plan-boundary">
<h2 id="study-plan-boundary" style="margin-top:0">Important boundary</h2>
<p>This guide is an educational planning framework, not an official NCSBN preparation program or a readiness prediction. Practice-bank scores are not the NCLEX result. Adapt the plan for your testing date, prior education, work and caregiving demands, disability or accommodation needs, health, language needs and the feedback supplied by your nursing program or qualified educator.</p>
</div>

<h2>Start with the official scope and a baseline</h2>
<ol>
  <li>Read the current <a href="#source-ncsbn-2026-rn-test-plan">NCSBN RN Test Plan</a> so your category map and clinical-judgment practice reflect the exam's published scope.</li>
  <li>Complete a mixed, representative practice sample under conditions you can repeat. One sample is a starting point, not a verdict.</li>
  <li>Record more than percent correct: category, item format, cue or concept missed, reasoning error, and whether time or reading changed the response.</li>
  <li>Choose a small number of priorities for the next cycle, then reassess with a comparable sample.</li>
</ol>

<h2>Use retrieval and spacing—with evidence-sized claims</h2>
<p><b>Retrieval practice</b> asks you to produce or apply an answer before seeing it. <b>Distributed practice</b> returns to material across separated sessions instead of placing all exposure in one block. A systematic review of 56 health-professions studies found that 43 reported significant benefits from distributed practice, retrieval practice or both, while also noting heterogeneous designs and assessments. A randomized study in nurse-anesthesia students found higher learning outcomes with a spaced-learning intervention in that setting.</p>
<p>These findings support using retrieval and spacing as study tools; they do not establish one optimal interval, daily item count or guaranteed NCLEX outcome. Re-reading can still support orientation or clarification, but it should not be your only check of whether you can recall and apply information.</p>
<p class="source-note"><b>Evidence for this section:</b> the <a href="#source-ramnanan-2024-distributed-retrieval-review">systematic review of distributed and retrieval practice</a> and <a href="#source-khalafi-2024-spaced-learning-nursing">nursing spaced-learning trial</a>.</p>

<h2>Build a repeatable study cycle</h2>
<div class="table-wrap" role="region" aria-label="Adaptable NCLEX study cycle" tabindex="0">
<table>
  <caption>Choose a workload you can complete and review; the frequencies are individualized</caption>
  <thead><tr><th scope="col">Component</th><th scope="col">Action</th><th scope="col">Adjustment signal</th></tr></thead>
  <tbody>
    <tr><th scope="row">Mixed retrieval</th><td>Answer a manageable set across categories and item formats before viewing rationales.</td><td>Reduce set size if review is repeatedly unfinished; increase challenge only when the full cycle remains sustainable.</td></tr>
    <tr><th scope="row">Deliberate review</th><td>Explain the best answer, the evidence in the stem and the specific reason for your error.</td><td>Return to source material when the rationale exposes a knowledge gap or conflicting information.</td></tr>
    <tr><th scope="row">Focused repair</th><td>Practice the priority concept, cue or format identified in the error log.</td><td>Change the method when errors persist—for example, from passive reading to recall, worked examples or educator feedback.</td></tr>
    <tr><th scope="row">Spaced return</th><td>Revisit previously studied material after a delay instead of closing it after one session.</td><td>Shorten or lengthen the interval based on successful recall; research does not prescribe one interval for every learner.</td></tr>
    <tr><th scope="row">Comparable reassessment</th><td>Use another mixed sample to examine trends across more than one attempt.</td><td>Revise priorities from the pattern, not from a single high or low score.</td></tr>
  </tbody>
</table>
</div>

<h2>Turn rationales into an error log</h2>
<p>After a practice item, use the rationale and an authoritative source when needed to answer:</p>
<ol>
  <li>Why the correct answer is correct.</li>
  <li>Why your response was less defensible in this stem.</li>
  <li>Which cue, concept, calculation, priority rule or item-format demand you missed.</li>
  <li>What you will retrieve or do differently in the next comparable item.</li>
</ol>
<p>Also review correct answers that were guesses or were reached with unsafe reasoning. A percent-correct score can hide those gaps.</p>

<h2>Fit the workload to real constraints</h2>
<ul>
  <li><b>Plan from available sessions.</b> Mark work, school, caregiving, appointments and rest before assigning study.</li>
  <li><b>Use a minimum viable session.</b> On a constrained day, complete a small retrieval-and-review cycle rather than chasing an arbitrary item quota.</li>
  <li><b>Protect review time.</b> If you can answer more items than you can examine carefully, shrink the set.</li>
  <li><b>Use recovery rules.</b> When a session is missed, move the highest-priority task or resume the next planned cycle instead of doubling the next workload automatically.</li>
  <li><b>Seek support when needed.</b> Persistent content, language, test-anxiety or accessibility barriers may require an educator, clinician or the applicable testing-accommodation process rather than more question volume.</li>
</ul>

<h2>Use the final week to stabilize the plan</h2>
<p>Do not apply a blanket rule that every candidate must stop new content or complete a fixed number of questions. Review the error themes that still matter, keep the workload realistic, rehearse the item formats you will encounter, and verify current exam-day instructions from official sources. Avoid making a single commercial readiness score the basis of a high-stakes decision.</p>
`,
    faq: [
      { q: "How long should I study for the NCLEX?", a: "There is no evidence-based duration that fits everyone. Work backward from the test date, establish a repeatable baseline, account for your available time and support needs, and adjust the plan from performance trends rather than a universal number of weeks." },
      { q: "How many NCLEX practice questions should I do each day?", a: "There is no validated daily quota for every candidate. Choose a set small enough that you can answer it, review the reasoning and update your error log. Increase volume only when quality and sustainability remain intact." },
      { q: "Should I study new content during the week before the NCLEX?", a: "Use your own error pattern instead of a blanket prohibition. Address high-priority gaps without creating an unsustainable last-minute workload, continue targeted retrieval, and rely on current official instructions for exam-day preparation." },
      { q: "Does a practice-bank score predict that I will pass?", a: "A score can provide feedback within that product, but it is not the NCLEX result and should not be treated as a guarantee. Look at repeated trends, reasoning quality, content coverage and guidance from your nursing program or qualified educator." },
    ],
  },

  {
    slug: "spaced-repetition-for-nursing-students",
    topic: "Study strategy",
    title: "Spaced repetition for nursing: evidence and safe use",
    h1: "How nursing students can use spaced repetition",
    description: "Use retrieval across separated sessions, build source-linked cards, adjust intervals from performance, and pair factual recall with clinical scenarios.",
    published: "2026-08-03",
    updated: "2026-08-28",
    cta: "PulseRN schedules flashcards on real calendar dates with a type-before-flip step, so recall is genuine.",
    body: `
<p>Spaced repetition revisits material across separated sessions, often with retrieval practice before feedback. Research in health-professions education supports these approaches as useful learning tools, but it does not establish one best schedule, card algorithm or daily duration for every nursing student.</p>

<div class="key" role="note" aria-labelledby="spaced-repetition-boundary">
<h2 id="spaced-repetition-boundary" style="margin-top:0">Important boundary</h2>
<p>Flashcards are educational aids, not clinical references or proof of NCLEX readiness. Build clinical cards from authoritative, current sources; include context and units; review them when guidance changes; and do not use a memorized card to override an order, medication label, facility policy, patient-specific assessment or clinical judgment.</p>
</div>

<h2>What the evidence supports</h2>
<p>A systematic review included 56 health-professions studies and 63 experiments; 43 studies reported significant benefits from distributed practice, retrieval practice or both. The authors also identified heterogeneous interventions, comparison groups and assessments, so the review does not validate a single interval or algorithm. A randomized study of nurse-anesthesia students reported improved learning outcomes with a spaced-learning intervention in that setting, which supports the approach but does not by itself establish effects for every nursing program or the NCLEX.</p>
<p class="source-note"><b>Evidence for this section:</b> the <a href="#source-ramnanan-2024-distributed-retrieval-review">systematic review of distributed and retrieval practice</a> and <a href="#source-khalafi-2024-spaced-learning-nursing">nursing spaced-learning trial</a>.</p>

<h2>Use retrieval, feedback and correction</h2>
<ol>
  <li><b>Attempt before revealing.</b> Produce the answer or reasoning first instead of using familiarity as the only check.</li>
  <li><b>Compare with the sourced answer.</b> Feedback should identify what was correct, missing or unsafe.</li>
  <li><b>Correct the card or your response.</b> Do not repeatedly rehearse an ambiguous prompt, obsolete value or oversimplified rule.</li>
  <li><b>Return after a delay.</b> Use later performance to decide whether the interval should shorten, stay similar or lengthen.</li>
</ol>
<p>Rereading can help you orient to unfamiliar material or clarify an error. The limitation is using familiarity from rereading as the only evidence that you can retrieve and apply the content.</p>

<h2>Design cards that remain auditable</h2>
<div class="table-wrap" role="region" aria-label="Safe nursing flashcard design" tabindex="0">
<table>
  <caption>Fields that make a nursing flashcard easier to verify and update</caption>
  <thead><tr><th scope="col">Field</th><th scope="col">What to record</th><th scope="col">Why it matters</th></tr></thead>
  <tbody>
    <tr><th scope="row">Focused prompt</th><td>One clear retrieval target or one short decision with enough context.</td><td>Avoids grading a multi-part card as known when only one part was recalled.</td></tr>
    <tr><th scope="row">Answer and units</th><td>The complete answer, including units, population or condition when relevant.</td><td>Prevents a number or rule from being rehearsed without its safety context.</td></tr>
    <tr><th scope="row">Authoritative source</th><td>Publisher, link and precise section or label locator.</td><td>Makes the claim traceable instead of relying on an unsourced deck.</td></tr>
    <tr><th scope="row">Source/review date</th><td>When the source was updated and when the card was last checked.</td><td>Supports review when guidelines, labels or exam scope change.</td></tr>
    <tr><th scope="row">Qualification</th><td>Exceptions, variability or a reminder to apply patient and policy context.</td><td>Reduces unsafe memorization of an absolute rule.</td></tr>
  </tbody>
</table>
</div>

<h2>Match the tool to the learning target</h2>
<p>Cards can support retrieval of terminology, metric conversions, pharmacology facts, precautions and other source-bound information. They can also present a short cue that begins a reasoning step. They should not be the only practice for prioritization, delegation, unfolding cases, multi-cue clinical judgment or item-format navigation. Pair factual retrieval with mixed questions, case-based practice, rationale review and feedback.</p>
<p>Be cautious with laboratory ranges, medication timing, antidotes, isolation rules and developmental information: values and recommendations can vary by laboratory, product, population, jurisdiction or current guidance. Put the qualification and source on the card rather than memorizing a universal statement.</p>

<h2>Choose a sustainable review load</h2>
<p>No study cited here establishes that 15 minutes a day will maintain a particular number of facts. Select a load that leaves time for accurate recall, feedback, corrections and case-based practice. If reviews accumulate, pause or reduce new cards, prioritize current high-risk content, and resume instead of treating one missed day as failure. Consistency can help distribute practice, but the schedule should adapt to performance and real constraints.</p>
`,
    faq: [
      { q: "Does spaced repetition work for nursing students?", a: "Health-professions evidence supports distributed and retrieval practice as useful learning approaches, and one randomized nurse-anesthesia study reported improved outcomes. The evidence does not guarantee an NCLEX result or identify one best schedule for every student." },
      { q: "Should I stop rereading notes?", a: "No. Rereading can orient you or clarify an error, but familiarity should not be your only test of learning. Try to retrieve or apply the information before looking, then use the source and feedback to correct gaps." },
      { q: "How long should I spend on flashcards each day?", a: "There is no validated universal duration or card count. Use a workload that allows careful recall, feedback, source checking and other practice; reduce new cards when accumulated reviews crowd out those steps." },
      { q: "Can flashcards teach clinical judgment?", a: "They can support the factual knowledge and short cue recognition used in reasoning, but they should not be the only method. Add mixed items, unfolding cases, prioritization decisions, rationale review and feedback." },
    ],
  },

  {
    slug: "failed-the-nclex-what-now",
    topic: "Study strategy",
    title: "Failed the NCLEX? What to do next",
    h1: "If you did not pass: a practical next step",
    description: "Use your official Candidate Performance Report, confirm retake rules, and build a source-bound remediation plan without treating category labels as exact scores.",
    published: "2026-08-03",
    updated: "2026-08-28",
    cta: "PulseRN can organize review by test-plan category; use it alongside your official CPR, current NCSBN guidance, and educator feedback.",
    body: `
<p>A failing NCLEX result means that this attempt did not meet the passing standard. It does not identify one cause, quantify your future chance of passing or prescribe one study method. Separate the official retake requirements from the learning decisions you make next.</p>

<div class="key" role="note" aria-labelledby="retake-boundary">
<h2 id="retake-boundary" style="margin-top:0">Important boundary</h2>
<p>The Candidate Performance Report (CPR) provides indicators of strengths and weaknesses; it is not a section-by-section grade, an exact score or proof that one factor caused the result. NCSBN states that overall exam performance determines pass or fail. Use the CPR with the current test plan, your own practice evidence and qualified educator support.</p>
</div>

<h2>Read the CPR for what it actually reports</h2>
<p>NCSBN describes the CPR as an individualized two-page document for candidates who do not pass. A candidate who did not answer the minimum number of items receives an abbreviated CPR stating how many items were answered and how many were required, without further diagnostic information.</p>
<div class="table-wrap" role="region" aria-label="NCLEX Candidate Performance Report indicators" tabindex="0">
<table>
  <caption>How to use the three CPR performance indicators without over-interpreting them</caption>
  <thead><tr><th scope="col">Indicator</th><th scope="col">Official meaning or direction</th><th scope="col">Safe planning use</th></tr></thead>
  <tbody>
    <tr><th scope="row">Below the Passing Standard</th><td>NCSBN directs candidates to concentrate first on these test-plan areas.</td><td>Give these areas early remediation time, then reassess with varied items and rationale review.</td></tr>
    <tr><th scope="row">Near the Passing Standard</th><td>The ability estimate for that content area is not clearly above or below the standard.</td><td>Review after the below-standard priorities; do not treat “near” as a precise distance from passing.</td></tr>
    <tr><th scope="row">Above the Passing Standard</th><td>The CPR identifies relative strength, while NCSBN still recommends study to maintain proficiency.</td><td>Use lighter maintenance retrieval instead of deleting the area from the plan.</td></tr>
  </tbody>
</table>
 </div>
<p class="source-note"><b>Evidence for this section:</b> NCSBN's <a href="#source-ncsbn-candidate-performance-report">Candidate Performance Report guidance</a> and <a href="#source-ncsbn-2026-rn-test-plan">2026 RN Test Plan</a>.</p>

<h2>Build a remediation plan from more than one signal</h2>
<ol>
  <li><b>Map the CPR to the current test plan.</b> List the content areas and clinical-judgment categories, starting with below-standard areas and then near-standard areas.</li>
  <li><b>Collect comparable practice evidence.</b> Use mixed and targeted items to identify repeated errors. A single item, score or commercial readiness label should not control the plan.</li>
  <li><b>Classify the error you can observe.</b> Record the missed cue, content gap, calculation, unsafe priority, item-format issue or reasoning step. Do not diagnose a cause such as anxiety or poor pacing from a CPR label alone.</li>
  <li><b>Retrieve, check and correct.</b> Attempt the concept or reasoning before revealing the answer, compare it with an authoritative source and correct the error.</li>
  <li><b>Return after a delay.</b> Distributed and retrieval practice can support learning, but the evidence does not establish one best interval, daily question quota or guaranteed retake result.</li>
  <li><b>Reassess the pattern.</b> Change the priority when repeated, comparable attempts show improvement or a persistent gap.</li>
</ol>
<p class="source-note"><b>Evidence for this section:</b> the <a href="#source-ramnanan-2024-distributed-retrieval-review">systematic review of distributed and retrieval practice</a>, the <a href="#source-khalafi-2024-spaced-learning-nursing">nursing spaced-learning trial</a> and the <a href="#source-ncsbn-2026-rn-test-plan">official test plan</a>.</p>

<h2>The retake logistics</h2>
<p>NCSBN's retake policy allows another examination 45 days after the prior administration. Some nursing regulatory bodies (NRBs) require a longer interval. Candidates testing through a participating NRB may take the NCLEX up to eight times in a year with 45 test-free days between examinations, while some jurisdictions impose stricter annual limits.</p>
<ol>
  <li>Contact your NRB and confirm its current retake eligibility, attempt limits, fees and required materials.</li>
  <li>Register again with Pearson and pay the applicable registration fee.</li>
  <li>Wait for a new Authorization to Test (ATT); its validity dates reflect any required waiting period.</li>
  <li>Schedule only after the new ATT arrives, using its dates and your NRB's instructions.</li>
</ol>
<p>Policies can change, so verify the <a href="#source-ncsbn-nclex-results-retake">current NCSBN retake page</a> and your NRB rather than relying on a memorized rule.</p>

<h2>Practice under exam-like constraints only when it answers a question</h2>
<p>Timed sets or longer simulations can help you observe pacing, concentration and item-navigation behavior. They are not a universal remedy and should not replace content repair, clinical-judgment cases, feedback, rest or accommodations. Use the shortest practice that produces useful evidence, then review the reasoning carefully.</p>

<h2>Do not estimate closeness from the stopping point</h2>
<p>NCSBN describes three CAT decision rules: the 95% Confidence Interval Rule, the Maximum-Length Exam Rule and the Run-Out-Of-Time Rule. Because the rule applied and the final ability estimate—not item count alone—determine the outcome, do not infer how close you were from where the exam stopped. Use the official result and CPR instead.</p>
<p class="source-note"><b>Evidence for this section:</b> NCSBN's <a href="#source-ncsbn-computerized-adaptive-testing">computerized adaptive testing explanation</a>.</p>
`,
    faq: [
      { q: "How soon can I retake the NCLEX?", a: "NCSBN's policy allows retesting 45 days after the previous exam, but some nursing regulatory bodies require a longer interval or impose stricter annual attempt limits. Confirm the current rule with your NRB and use the validity dates on your new ATT." },
      { q: "What is the Candidate Performance Report?", a: "The CPR is NCSBN's individualized report for a candidate who did not pass. It gives below-, near- and above-standard indicators across test-plan content and clinical-judgment categories, but it is not a section grade or exact score. A candidate who did not answer the minimum number of items receives an abbreviated report without further diagnostic detail." },
      { q: "What should I change before an NCLEX retake?", a: "There is no single change for every candidate. Start with the CPR and current test plan, collect repeated practice evidence, identify the specific cue, content or reasoning errors you can observe, and use retrieval, feedback and delayed reassessment. Seek qualified educator or accommodation support when needed." },
      { q: "Does failing the NCLEX mean I cannot become a nurse?", a: "A failing result means this attempt did not meet the NCLEX passing standard; it is not a prediction of your future result. You still must satisfy your nursing regulatory body's eligibility requirements and pass the licensure examination." },
    ],
  },
];
