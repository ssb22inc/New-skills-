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
    title: "Building an NCLEX study plan that holds",
    h1: "An NCLEX study plan you can actually keep",
    description: "How to structure study time around retrieval and spacing rather than re-reading, and how to build a plan that survives a working week.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN builds a weekly plan around your weak areas and schedules flashcards on real calendar dates.",
    body: `
<p>Most study plans fail for the same two reasons: they are built around hours rather than retrieval, and they assume a week that never happens. A plan that survives contact with shifts, clinicals and ordinary life beats an ambitious one you abandon in ten days.</p>

<h2>Start from a baseline, not a schedule</h2>
<p>Before deciding what to study, find out where you are. Work through a broad set of questions across all categories and record performance by category rather than overall. The number matters less than the shape — which areas are genuinely weak versus which merely feel uncomfortable.</p>
<p>Those two often differ. Students routinely over-study the content they find interesting and avoid the category quietly costing them marks.</p>

<h2>The two principles that do the work</h2>
<div class="key">
<p><b>Retrieval beats review.</b> Re-reading notes produces recognition — the comfortable feeling of familiarity — without the ability to produce the answer unprompted. Testing yourself is harder, feels worse, and is substantially more effective. If a study session felt easy, it probably was not doing much.</p>
</div>
<p><b>Spacing beats massing.</b> The same total time spread across several days produces better retention than one long session. Six twenty-minute sessions beat one two-hour block, and they fit a real week far more easily.</p>

<h2>A weekly structure that works</h2>
<table>
  <tr><th>Component</th><th>Roughly</th><th>Purpose</th></tr>
  <tr><td>Daily question practice</td><td>20&ndash;40 items</td><td>Retrieval, and exposure to item formats.</td></tr>
  <tr><td>Reviewing what you missed</td><td>As long as the practice itself</td><td>Where the actual learning happens.</td></tr>
  <tr><td>Flashcards</td><td>10&ndash;15 minutes</td><td>Values, drugs, and facts that must be automatic.</td></tr>
  <tr><td>One weak category, deliberately</td><td>2&ndash;3 sessions weekly</td><td>Turns avoidance into progress.</td></tr>
  <tr><td>A full-length exam</td><td>Weekly or fortnightly</td><td>Endurance, pacing, and an honest readiness signal.</td></tr>
</table>

<h2>Review is not optional</h2>
<p>Answering 100 questions and reviewing none is close to wasted time. For every item you get wrong, be able to say three things:</p>
<ol>
  <li>Why the correct answer is correct.</li>
  <li>Why <i>your</i> answer was wrong — specifically.</li>
  <li>What you would look for to recognise this situation next time.</li>
</ol>
<p>The second is the one people skip, and it is the one that changes behaviour. Getting an item wrong because you misread the stem is a different problem from not knowing the content, and they need different fixes.</p>

<h2>Building it around a real life</h2>
<ul>
  <li><b>Set a floor, not a ceiling.</b> A minimum you will hit on your worst day — twenty questions — beats a target you miss and then abandon.</li>
  <li><b>Attach study to an existing habit</b> rather than to a time of day, which shifts with shifts.</li>
  <li><b>Plan a rest day.</b> Plans without them collapse; plans with them survive.</li>
  <li><b>Expect to miss days.</b> Missing one is normal. What matters is returning the next day rather than treating the plan as broken.</li>
</ul>

<h2>The last week</h2>
<p>Cramming new content in the final week has little effect and considerable cost. Better: light review of high-yield facts, moderate question practice to keep the rhythm, and genuine attention to sleep. Arriving rested is worth more than the last two hundred questions.</p>
`,
    faq: [
      { q: "How long should I study for the NCLEX?", a: "There is no universal figure, and consistency matters far more than total hours. Short daily sessions with real retrieval practice outperform occasional long ones, and a plan you keep for six weeks beats an ambitious one abandoned in ten days." },
      { q: "How many practice questions should I do a day?", a: "Twenty to forty is a sustainable target for most people, provided you spend as long reviewing what you missed as you spent answering. Volume without review produces very little learning." },
      { q: "Should I study new content the week before the NCLEX?", a: "Generally no. Late cramming adds little and costs sleep and confidence. Light review of high-yield facts, moderate question practice and proper rest serve you better." },
    ],
  },

  {
    slug: "spaced-repetition-for-nursing-students",
    topic: "Study strategy",
    title: "Spaced repetition for nursing students",
    h1: "Why spaced repetition works, and how to use it",
    description: "The forgetting curve, why re-reading feels productive and is not, and how to run spaced repetition without it becoming a second job.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN schedules flashcards on real calendar dates with a type-before-flip step, so recall is genuine.",
    body: `
<p>Nursing school asks you to hold an enormous volume of factual material — values, drugs, precautions, milestones — and then tests it months later. Spaced repetition is the best-evidenced tool for that specific problem.</p>

<h2>The forgetting curve</h2>
<p>Newly learned information decays quickly and then more slowly. Left alone, most of what you studied today is substantially gone within a week. Each successful recall flattens the curve, so the same fact needs reviewing less and less often.</p>
<p>The insight is that <b>timing matters more than quantity</b>. Reviewing something just as you are about to forget it produces far more durable memory than reviewing it while it is still fresh — which feels easier and accomplishes much less.</p>

<div class="key">
<p><b>Difficulty is the point.</b> If recall feels effortless, the review came too early to strengthen anything. A little struggle before the answer arrives is the signal that the memory is being reinforced. This is why the study methods that feel most productive are often the least effective.</p>
</div>

<h2>Why re-reading fails</h2>
<p>Reading a page again produces <b>recognition</b> — you know you have seen it, so it feels learned. Recognition is not recall, and the exam requires recall with no page in front of you.</p>
<p>The test is simple: close the book and say the potassium range out loud. If you can, you know it. If you can only recognise it when you see it, you do not yet.</p>

<h2>Making it work</h2>
<ul>
  <li><b>Recall before you flip.</b> Say or type the answer first. Flipping to check without attempting is passive review with extra steps.</li>
  <li><b>Grade yourself honestly.</b> Marking a card as known because you almost had it removes it from your schedule at exactly the wrong moment.</li>
  <li><b>Keep cards atomic.</b> One fact per card. A card holding six things will be graded on whichever part you remembered.</li>
  <li><b>Do the due cards daily.</b> The schedule only works if the intervals are respected; skipping days collapses it into cramming.</li>
</ul>

<h2>What belongs on a card</h2>
<p>Spaced repetition suits discrete facts. It is excellent for:</p>
<ul>
  <li>Laboratory values and critical thresholds</li>
  <li>Drug classes, antidotes, and what to monitor</li>
  <li>Isolation precautions by condition</li>
  <li>Developmental milestones</li>
  <li>Signs associated with a specific imbalance</li>
</ul>
<p>It is a poor fit for clinical judgement. You cannot flashcard your way to knowing which client to see first — that needs whole scenarios and practice questions. Use both, for what each is good at.</p>

<h2>The realistic version</h2>
<p>Fifteen minutes a day, every day, will carry several hundred facts to exam day. Two hours on a Sunday will not, however virtuous it feels. The value is entirely in the consistency, which is also why a manageable daily load beats an ambitious one that you start skipping.</p>
`,
    faq: [
      { q: "Does spaced repetition work for nursing school?", a: "Very well for factual recall — lab values, drugs, precautions, milestones — which is a large share of what the NCLEX requires. It is a poor fit for clinical judgement, which needs full scenarios and practice questions instead." },
      { q: "Why is re-reading notes ineffective?", a: "It builds recognition rather than recall. The material feels familiar when you see it, but the exam requires producing it with nothing in front of you. Self-testing is harder and substantially more effective." },
      { q: "How long should I spend on flashcards each day?", a: "Fifteen minutes daily is enough to carry several hundred facts, and it beats a single long weekly session. Spaced repetition depends on respecting the intervals, so consistency matters more than duration." },
    ],
  },

  {
    slug: "failed-the-nclex-what-now",
    topic: "Study strategy",
    title: "Failed the NCLEX? What to do next",
    h1: "If you did not pass: a practical next step",
    description: "How to read your candidate performance report, what to change rather than repeat, and why most retakers were closer than they felt.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN tracks performance by category so your second attempt targets what actually cost you marks.",
    body: `
<p>Not passing is common, survivable, and does not mean you will not be a nurse. A great many practising nurses did not pass the first time. What matters now is that the second attempt is different from the first, rather than simply more of it.</p>

<h2>Read the performance report properly</h2>
<p>Unsuccessful candidates receive a Candidate Performance Report showing how you performed in each client-need category relative to the passing standard. It is the most useful document you have.</p>
<p>Read it for <b>shape</b>, not verdict. Categories marked below the standard are where the marks went. Categories near the standard are usually cheaper to fix than the ones far below, because you are closer to competence already.</p>

<div class="key">
<p><b>Do not simply study more.</b> The most common mistake among retakers is repeating the first attempt's preparation with greater intensity. If your method produced this result, more of it produces the same result. Something specific has to change.</p>
</div>

<h2>Work out which problem you actually have</h2>
<table>
  <tr><th>Pattern</th><th>What it points to</th><th>What to change</th></tr>
  <tr><td>Weak in one or two categories</td><td>Content gaps</td><td>Targeted content work, then questions in that area.</td></tr>
  <tr><td>Near the standard everywhere</td><td>Test-taking method</td><td>Prioritisation frameworks and reading the stem precisely.</td></tr>
  <tr><td>Ran out of time</td><td>Pacing</td><td>Timed full-length practice; a decision rule for hard items.</td></tr>
  <tr><td>Knew it but chose wrong</td><td>Application</td><td>Whole case studies rather than isolated questions.</td></tr>
  <tr><td>Went blank</td><td>Anxiety</td><td>Simulate real conditions; address the anxiety directly.</td></tr>
</table>

<h2>The retake logistics</h2>
<p>There is a mandatory waiting period before retesting, and boards of nursing set their own limits on attempts within a given period. You will need to re-register and pay again. Confirm the current waiting period and your board's specific requirements at <a href="https://www.nclex.com" rel="noopener">nclex.com</a> and with your state board — these vary and they change.</p>
<p>Use the wait deliberately. It is enough time to change something real, and long enough that drifting through it is a genuine risk.</p>

<h2>A different second attempt</h2>
<ul>
  <li><b>Start from the report</b>, not from page one of a review book.</li>
  <li><b>Practise whole cases</b>, since applying knowledge under a scenario is what most retakers are missing.</li>
  <li><b>Sit full-length timed exams.</b> If pacing or stamina contributed, this is the only thing that fixes it.</li>
  <li><b>Review every wrong answer</b> to the point of being able to say why <i>your</i> choice was wrong, not just why the right one was right.</li>
  <li><b>Rebuild the endurance</b> deliberately. Sitting a long adaptive exam is a skill of its own.</li>
</ul>

<h2>One more thing</h2>
<p>The failure is information about one attempt on one day, not about whether you can do this work. Most candidates who did not pass were closer than the result felt — the exam stops when it is confident, and being just below the standard produces the same letter as being far below it. Treat the report as a map, and make the second attempt a different attempt.</p>
`,
    faq: [
      { q: "How soon can I retake the NCLEX?", a: "There is a mandatory waiting period, and individual boards of nursing set their own rules on the number of attempts allowed in a period. Confirm the current requirements with NCSBN and your own board, as these vary and change." },
      { q: "What is the Candidate Performance Report?", a: "A report sent to unsuccessful candidates showing performance in each client-need category relative to the passing standard. It is the most useful guide available for targeting a second attempt." },
      { q: "Does failing the NCLEX mean I will not be a nurse?", a: "No. Many practising nurses did not pass on their first attempt. What matters is diagnosing what went wrong — content, method, pacing or anxiety — and changing that specifically rather than repeating the same preparation more intensely." },
    ],
  },
];
