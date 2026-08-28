/* Guides about how the NCLEX-RN itself works — scoring, length, the CAT
   engine, test day. These target the questions students search before they
   have chosen a study product, which is exactly when we want to be the page
   that answers them honestly. */

export const EXAM_ARTICLES = [
  {
    slug: "how-is-the-nclex-scored",
    topic: "How the exam works",
    title: "How is the NCLEX scored?",
    h1: "How the NCLEX-RN is actually scored",
    description: "How NCLEX-RN computer adaptive testing makes a pass/fail decision, applies partial credit, and uses three decision rules.",
    published: "2026-08-03",
    updated: "2026-08-28",
    cta: "PulseRN can organize practice performance by category and difficulty; its readiness estimate is not an official NCLEX score or pass guarantee.",
    body: `
<p>The NCLEX-RN reports a pass/fail result rather than a candidate percentage score. Computer adaptive testing (CAT) estimates entry-level nursing ability from the difficulty of the items and the candidate's responses. Separately, an individual item with more than one key can receive partial credit under an approved scoring method.</p>

<div class="key" role="note" aria-labelledby="scoring-boundary">
<h2 id="scoring-boundary" style="margin-top:0">Important boundary</h2>
<p>Only the official result from the nursing regulatory body determines whether a candidate passed. A practice percentage, commercial readiness estimate, perceived item difficulty, stopping point or remembered question count is not an official NCLEX score and cannot establish the result.</p>
</div>

<h2>What computer adaptive testing does</h2>
<p>After each response, the computer re-estimates ability using all previous responses and the difficulty of those items. It then selects an item intended to be optimal for the current estimate—not too easy or too hard—so that the estimate becomes more precise. NCSBN's FAQ states that every candidate begins with a relatively low-difficulty item; later selection depends on performance.</p>
<p>That process is more precise than a rule that every correct response must produce a harder next item or every incorrect response an easier one. Candidates do not see calibrated item difficulty, so a question feeling difficult or familiar is not a reliable measure of the current ability estimate.</p>
<p class="source-note"><b>Evidence for this section:</b> NCSBN's <a href="#source-ncsbn-computerized-adaptive-testing">CAT explanation</a> and <a href="#source-ncsbn-nclex-faqs">NCLEX FAQ</a>.</p>

<h2>The three pass/fail rules</h2>
<div class="table-wrap" role="region" aria-label="NCLEX computerized adaptive testing decision rules" tabindex="0">
<table>
  <caption>How NCSBN determines the NCLEX result under CAT</caption>
  <thead><tr><th scope="col">Rule</th><th scope="col">When it applies</th><th scope="col">How the decision is made</th></tr></thead>
  <tbody>
    <tr><th scope="row">95% Confidence Interval</th><td>The computer becomes 95% certain that ability is clearly above or clearly below the passing standard.</td><td>The exam stops and the direction of that confidence determines pass or fail. NCSBN identifies this as the most common rule.</td></tr>
    <tr><th scope="row">Maximum-Length Exam</th><td>The 95% confidence decision is not reached before the maximum number of items.</td><td>The confidence-interval rule is disregarded. The final ability estimate based on all responses passes at or above the standard and fails below it.</td></tr>
    <tr><th scope="row">Run-Out-Of-Time</th><td>Time expires before the maximum and no 95% confidence decision has been reached.</td><td>Fewer than the required minimum items is an automatic fail. After at least the minimum, the final ability estimate based on all completed responses passes at or above the standard and fails below it.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this table:</b> NCSBN's <a href="#source-ncsbn-computerized-adaptive-testing">three CAT pass/fail rules</a> and the administration section of the <a href="#source-ncsbn-2026-rn-test-plan">2026 RN Test Plan</a>.</p>

<h2>Why your question count means less than you think</h2>
<p>Under the 95% rule, an early stop can reflect confidence clearly above or clearly below the standard. At maximum length, the final estimate decides. If time expires, the minimum-item and final-estimate criteria apply. The number of items therefore cannot identify the result without the official decision.</p>

<h2>Partial credit applies when an item has more than one key</h2>
<p>The 2026 RN Test Plan and NCLEX FAQ state that items with more than one key can receive partial credit. They identify three scoring methods:</p>
<ul>
  <li><b>Plus/minus scoring</b></li>
  <li><b>Zero/one scoring</b></li>
  <li><b>Rationale scoring</b></li>
</ul>
<p>Do not assume that every multiple-response item uses the same method or reverse-engineer an unofficial point total. Read the item directions, evaluate each option from the supplied evidence and answer only after considering the complete response.</p>
<p class="source-note"><b>Evidence for this section:</b> the scoring-items section of the <a href="#source-ncsbn-2026-rn-test-plan">2026 RN Test Plan</a> and <a href="#source-ncsbn-nclex-faqs">NCLEX FAQ</a>.</p>

<h2>Use scoring information without inventing a result</h2>
<ul>
  <li>Use a raw practice percentage as product-specific feedback, not as an NCLEX score.</li>
  <li>Do not infer pass or fail from perceived difficulty or question count.</li>
  <li>Practice the official item formats and follow the directions presented with each item.</li>
  <li>Answer each item before advancing; NCSBN states that the interface prompts a candidate who attempts to continue with an unanswered item.</li>
</ul>
`,
    faq: [
      { q: "Is there a passing percentage on the NCLEX?", a: "The NCLEX-RN reports pass or fail rather than a candidate percentage score. CAT compares the final ability decision with the passing standard under one of NCSBN's three decision rules." },
      { q: "Does finishing in the minimum number of questions mean I passed?", a: "No. An early stop under the 95% Confidence Interval Rule can mean ability was clearly above or clearly below the passing standard. Question count alone is not the result." },
      { q: "Do harder questions mean I am doing well?", a: "Perceived difficulty is not a reliable score signal. CAT selects an item intended to be optimal for the current estimate, and candidates are not shown calibrated difficulty. Continue answering the item in front of you rather than estimating the result." },
      { q: "Is there partial credit on the NCLEX?", a: "Yes, for items with more than one key. NCSBN identifies plus/minus, zero/one and rationale scoring as the three partial-credit methods. The applicable method depends on the item; do not treat every item as using the same scoring rule." },
    ],
  },

  {
    slug: "how-many-questions-is-the-nclex",
    topic: "How the exam works",
    title: "How many questions is the NCLEX?",
    h1: "How many questions is the NCLEX-RN?",
    description: "The 2026 NCLEX-RN contains 85–150 items in five hours, including 15 unscored pretest items. Learn why length varies and count cannot reveal the result.",
    published: "2026-08-03",
    updated: "2026-08-28",
    cta: "PulseRN can provide mixed and timed practice; it is not an official NCLEX simulation and cannot predict a result from question count.",
    body: `
<p>Under the 2026 RN Test Plan, every candidate answers at least 85 items and may receive up to 150 during a five-hour period. The exact length within that range varies because computer adaptive testing (CAT) selects items and updates the ability estimate as the examination proceeds.</p>

<div class="key" role="note" aria-labelledby="length-boundary">
<h2 id="length-boundary" style="margin-top:0">Current-rule boundary</h2>
<p>The 85–150 item range and five-hour limit apply to the 2026 RN Test Plan, effective April 1, 2026 through March 31, 2029. Confirm the current test plan and Candidate Bulletin before your examination. Question count, stopping point and remembered items do not establish pass or fail.</p>
</div>

<h2>What is inside the 85-item minimum</h2>
<div class="table-wrap" role="region" aria-label="Composition of the minimum-length 2026 NCLEX-RN" tabindex="0">
<table>
  <caption>Items in the minimum-length examination under the 2026 RN Test Plan</caption>
  <thead><tr><th scope="col">Component</th><th scope="col">Items</th><th scope="col">How NCSBN describes it</th></tr></thead>
  <tbody>
    <tr><th scope="row">Test-plan content areas</th><td>52</td><td>Items distributed across the eight client-needs content areas in the published percentages.</td></tr>
    <tr><th scope="row">Clinical-judgment case studies</th><td>18</td><td>Three six-item case studies measuring the six steps of the NCSBN Clinical Judgment Measurement Model.</td></tr>
    <tr><th scope="row">Pretest items</th><td>15</td><td>Unscored items used for calibration; they do not contribute to the ability estimate or pass/fail decision.</td></tr>
  </tbody>
</table>
</div>
<p>The 15 pretest items appear on every examination and have a similar style and format to operational scored items. Candidates cannot distinguish them during the test, so every item should receive the same careful attention.</p>
<p class="source-note"><b>Evidence for this section:</b> Examination Length and Pretest Items in the <a href="#source-ncsbn-2026-rn-test-plan">2026 RN Test Plan</a>.</p>

<h2>Why examination length varies</h2>
<p>After the required minimum, the 95% Confidence Interval Rule can stop the examination when the computer is 95% certain that ability is clearly above or clearly below the passing standard. If that decision is not reached, the examination can continue to the maximum length, where the final ability estimate determines the result.</p>
<p>An early stop can therefore represent confidence above or below the standard. At maximum length, the final estimate—not the length itself—determines pass or fail. Do not use item count as an unofficial result.</p>

<h2>Time, not just items</h2>
<p>The five-hour limit includes all breaks. NCSBN does not set a time limit for an individual item. Once a candidate confirms an answer and advances, the candidate cannot return to that item, and every item must be answered before proceeding.</p>
<p>If time expires before the maximum and no 95% confidence decision has been reached, fewer than 85 completed items results in a failing examination. After at least 85 items, the final ability estimate from all completed responses passes at or above the standard and fails below it.</p>

<h2>Practice pacing without inventing a universal quota</h2>
<p>There is no evidence-based requirement that every candidate complete a particular number of full-length simulations. Timed mixed sets or longer practice can help you observe pacing and concentration, but they should leave enough time to review reasoning, repair content gaps and rest. Use repeated practice evidence to adjust the workload rather than enforcing an arbitrary per-item clock.</p>
`,
    faq: [
      { q: "How many questions are on the NCLEX-RN in 2026?", a: "The 2026 RN Test Plan requires at least 85 items and permits up to 150 within five hours, including breaks. Verify the current test plan before your exam because administration rules can change." },
      { q: "What are pretest questions on the NCLEX?", a: "Every examination includes 15 unscored pretest items used to estimate item difficulty for possible future use. They do not contribute to the ability estimate or pass/fail decision and cannot be distinguished from operational items during the examination." },
      { q: "Is it bad if I get the maximum number of questions?", a: "Question count alone does not reveal the result. At maximum length, NCSBN disregards the 95% confidence-interval rule and uses the final ability estimate: at or above the standard passes; below it fails." },
      { q: "Does the five-hour limit include breaks?", a: "Yes. The 2026 RN Test Plan states that the five-hour limit includes all breaks. There is no separate time limit for each individual item." },
    ],
  },

  {
    slug: "next-generation-nclex-what-changed",
    topic: "How the exam works",
    title: "Next Generation NCLEX: what actually changed",
    h1: "Next Generation NCLEX: what actually changed",
    description: "The Next Generation NCLEX launched in 2023 to measure clinical judgment through case studies and stand-alone items. See how the 2026 RN Test Plan applies it.",
    published: "2026-08-03",
    updated: "2026-08-28",
    cta: "PulseRN can provide case-based and stand-alone clinical-judgment practice; it is not an official NCLEX examination or score predictor.",
    body: `
<p>NCSBN launched the Next Generation NCLEX (NGN) on April 1, 2023 to better measure clinical judgment and decision-making through case studies, stand-alone clinical-judgment items and multiple item formats. NGN did not remove nursing knowledge from the examination: the current RN Test Plan assesses the knowledge, skills, abilities and clinical judgment needed for entry-level nursing practice.</p>

<div class="key" role="note" aria-labelledby="ngn-boundary">
<h2 id="ngn-boundary" style="margin-top:0">Current-plan boundary</h2>
<p>The counts and percentages below come from the 2026 RN Test Plan, effective April 1, 2026 through March 31, 2029. NCSBN can revise test plans, administration rules and item presentation, so confirm the plan and Candidate Tutorial that apply on your examination date.</p>
</div>

<h2>The central change: explicit measurement of clinical judgment</h2>
<p>The 2026 RN Test Plan defines clinical judgment as an iterative process that uses nursing knowledge to assess a situation, identify a prioritized client concern and generate evidence-based solutions for safe care. It can be measured in a six-item case study built around one unfolding client presentation or in an individual stand-alone item.</p>
<p>This is more precise than saying NGN replaced recall with reasoning. NCSBN states that the majority of NCLEX items are written at the application level or higher, while knowledge remains part of the examination. The practical shift is that clinical judgment is now explicitly represented and measured.</p>
<p class="source-note"><b>Evidence for this section:</b> NCSBN's <a href="#source-ncsbn-next-generation-nclex">NGN project page</a> and the Integrated Processes and Clinical Judgment sections of the <a href="#source-ncsbn-2026-rn-test-plan">2026 RN Test Plan</a>.</p>

<h2>The clinical judgment model</h2>
<p>A case study uses the six steps of the NCSBN Clinical Judgment Measurement Model:</p>
<ol>
  <li><b>Recognize cues</b> — identify relevant and important information from available sources.</li>
  <li><b>Analyze cues</b> — organize and connect the cues to the client's presentation.</li>
  <li><b>Prioritize hypotheses</b> — evaluate possible explanations using urgency, likelihood, risk and other constraints.</li>
  <li><b>Generate solutions</b> — identify expected outcomes and possible interventions.</li>
  <li><b>Take action</b> — implement the solution or solutions addressing the highest priority.</li>
  <li><b>Evaluate outcomes</b> — compare observed outcomes with expected outcomes.</li>
</ol>
<p>A six-item case study measures the six steps across shared, unfolding client information. That does not establish that a case study has a special unofficial “weight” compared with another item. Use the official scoring and test-plan descriptions rather than assigning your own point values.</p>

<h2>How clinical judgment appears in the 2026 examination</h2>
<div class="table-wrap" role="region" aria-label="Clinical judgment presentation under the 2026 NCLEX-RN Test Plan" tabindex="0">
<table>
  <caption>Current NCSBN description of clinical-judgment content</caption>
  <thead><tr><th scope="col">Presentation</th><th scope="col">What the test plan establishes</th><th scope="col">Important limit</th></tr></thead>
  <tbody>
    <tr><th scope="row">Case studies</th><td>The minimum-length exam contains three six-item sets, or 18 case-study items. Each set uses one unfolding client presentation and measures the six clinical-judgment steps.</td><td>Do not infer an unofficial point weight from the fact that the items share a case.</td></tr>
    <tr><th scope="row">Stand-alone items</th><td>Approximately 10% of the exam consists of stand-alone clinical-judgment items, selected depending on examination length.</td><td>The percentage is approximate and the number can vary with exam length.</td></tr>
    <tr><th scope="row">Multiple formats</th><td>Candidates may receive stand-alone items and case studies in multiple formats, including items with multimedia.</td><td>Use the current NCLEX Candidate Tutorial and official sample pack for interface details.</td></tr>
    <tr><th scope="row">Partial credit</th><td>Items with more than one key can use plus/minus, zero/one or rationale scoring.</td><td>Partial credit does not apply merely because an item is labeled “Next Generation.”</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this table:</b> Clinical Judgment, Examination Length, Scoring Items and Types of Items in the <a href="#source-ncsbn-2026-rn-test-plan">2026 RN Test Plan</a>, with scoring clarification in the <a href="#source-ncsbn-nclex-faqs">NCLEX FAQ</a>.</p>

<div class="key" role="note">
<p><b>Study implication:</b> continue building nursing knowledge, then practice using it across the six clinical-judgment steps. For a case, identify the relevant cues, connect them, rank hypotheses, choose solutions and actions, and evaluate the supplied outcomes before reviewing the rationale. This is study guidance, not an NCSBN scoring rule or a guarantee of passing.</p>
</div>

<h2>What did not change</h2>
<ul>
  <li>The NCLEX-RN remains a computerized adaptive, pass/fail licensure examination.</li>
  <li>The test plan continues to distribute content across Client Needs categories and integrated processes.</li>
  <li>Candidates still need nursing knowledge and skills as well as clinical judgment.</li>
  <li>Question count, perceived difficulty and remembered formats do not establish the official result.</li>
</ul>
<p class="source-note"><b>Evidence for these boundaries:</b> the <a href="#source-ncsbn-2026-rn-test-plan">2026 RN Test Plan</a> and NCSBN's <a href="#source-ncsbn-next-generation-nclex">NGN project page</a>.</p>
`,
    faq: [
      { q: "What is the Next Generation NCLEX?", a: "NCSBN launched NGN on April 1, 2023 to better measure clinical judgment and decision-making through case studies, stand-alone clinical-judgment items and multiple item formats." },
      { q: "Does every clinical-judgment item belong to a case study?", a: "No. The 2026 RN Test Plan states that clinical judgment may be presented in six-item case studies or individual stand-alone items." },
      { q: "How much clinical-judgment content is on the 2026 NCLEX-RN?", a: "The minimum-length examination contains three six-item case studies, totaling 18 items. Approximately 10% of the exam also consists of stand-alone clinical-judgment items, selected depending on examination length." },
      { q: "Does every Next Generation item receive partial credit?", a: "No. NCSBN states that partial credit is available for items with more than one key and identifies plus/minus, zero/one and rationale methods. The applicable scoring depends on the item, not the NGN label alone." },
    ],
  },

  {
    slug: "nclex-test-day-what-to-expect",
    topic: "How the exam works",
    title: "NCLEX test day: what to expect",
    h1: "NCLEX test day: what to expect",
    description: "Current 2026 NCLEX check-in, identification, locker, break, timing, item-navigation, confidentiality, and results rules from official NCSBN sources.",
    published: "2026-08-03",
    updated: "2026-08-28",
    cta: "PulseRN can provide timed practice and case-based review; it cannot reproduce every test-center condition or predict an official result.",
    body: `
<p>For the 2026 NCLEX, plan around the official identification, arrival, check-in, personal-item, break and confidentiality rules—not anecdotes about a particular question number or how the examination “felt.” Your Candidate Bulletin and appointment confirmation control the logistics for your examination.</p>

<div class="key" role="note" aria-labelledby="test-day-boundary">
<h2 id="test-day-boundary" style="margin-top:0">Verify your own appointment</h2>
<p>This guide summarizes the 2026 NCSBN Candidate Bulletin and RN Test Plan checked on August 28, 2026. Requirements can change and accommodations or international testing can differ. Confirm your appointment email, current Candidate Bulletin and testing-accommodation instructions before test day.</p>
</div>

<h2>Before arrival</h2>
<div class="table-wrap" role="region" aria-label="2026 NCLEX test-day preparation" tabindex="0">
<table>
  <caption>Official preparation and check-in requirements</caption>
  <thead><tr><th scope="col">Requirement</th><th scope="col">What the 2026 bulletin says</th><th scope="col">Action</th></tr></thead>
  <tbody>
    <tr><th scope="row">Arrival</th><td>Plan to arrive at least 30 minutes before the scheduled time. Arriving more than 30 minutes after the appointment may require forfeiting the appointment.</td><td>Use the time and location in the confirmation email and allow for travel and check-in.</td></tr>
    <tr><th scope="row">Identification</th><td>Present one acceptable, valid identification whose first and last names exactly match the registration. Additional rules apply when the ID lacks a signature or testing occurs internationally.</td><td>Check every current ID requirement in the bulletin; do not rely on this summary alone.</td></tr>
    <tr><th scope="row">Check-in</th><td>The process includes a digital signature, palm-vein scan and photograph, plus testing-administrator procedures.</td><td>Follow staff instructions and disclose approved accommodations through the required process.</td></tr>
    <tr><th scope="row">Personal items</th><td>Personal items must be stored in the assigned locker, and prohibited items cannot be accessed during breaks.</td><td>Bring only what is necessary and review the Candidate Rules before arrival.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this table:</b> Identification Requirements, Candidate Rules and Check-In Process in the <a href="#source-ncsbn-2026-candidate-bulletin-pdf">2026 NCLEX Candidate Bulletin</a>.</p>

<h2>Breaks and the clock</h2>
<p>The five-hour NCLEX-RN time limit includes the introductory screen, two scheduled optional breaks and any unscheduled breaks. The scheduled breaks are offered after approximately two hours and again after approximately three and a half hours of testing time. The examination clock does not stop during a break.</p>
<p>For any break, follow the testing administrator's instructions. The bulletin requires a palm-vein scan before and after a break and restricts access to prohibited personal items. Whether to use an optional break is an individual decision; NCSBN does not promise that taking or skipping one improves the result.</p>
<p class="source-note"><b>Evidence for this section:</b> Break Procedures and Breaks in the <a href="#source-ncsbn-2026-candidate-bulletin-pdf">2026 Candidate Bulletin</a> and Examination Length in the <a href="#source-ncsbn-2026-rn-test-plan">2026 RN Test Plan</a>.</p>

<h2>While answering items</h2>
<p>CAT selects items using the test-plan requirements and the current ability estimate calculated from previous responses and calibrated item difficulty. Candidates are not shown calibrated difficulty or the ability estimate. A question feeling difficult, familiar or uncertain therefore does not establish whether the examination is going well or poorly.</p>
<ul>
  <li>There is no separate time limit for one item; maintain a reasonable overall pace.</li>
  <li>Every item must be answered before proceeding.</li>
  <li>You may reconsider an answer before selecting <b>Next</b>, but you cannot return after advancing.</li>
  <li>Do not infer a result from perceived difficulty, item type, question count or stopping point.</li>
</ul>
<p class="source-note"><b>Evidence for this section:</b> Reviewing Answers and Guessing and Computerized Adaptive Testing in the <a href="#source-ncsbn-2026-rn-test-plan">2026 RN Test Plan</a>, plus NCSBN's <a href="#source-ncsbn-computerized-adaptive-testing">CAT explanation</a>.</p>

<h2>Confidentiality and results</h2>
<p>Do not reproduce, discuss or share examination items before, during or after the examination. NCSBN states that this can lead to result withholding or cancellation and other consequences.</p>
<p>No result is released at the test center, and test-center staff do not have access to it. Official results are released only by the nursing regulatory body. Where available, Quick Results after two business days are unofficial and do not authorize practice. Follow the current bulletin and your regulatory body's instructions.</p>
<p class="source-note"><b>Evidence for this section:</b> Candidate Rules and Results Reporting in the <a href="#source-ncsbn-2026-candidate-bulletin-pdf">2026 Candidate Bulletin</a>.</p>
`,
    faq: [
      { q: "What identification do I need for the NCLEX?", a: "The 2026 Candidate Bulletin requires one acceptable, valid ID whose first and last names exactly match the registration. International testing and an ID without a signature have additional requirements, so verify the complete current bulletin before test day." },
      { q: "How early should I arrive for the NCLEX?", a: "The 2026 Candidate Bulletin says to plan to arrive at least 30 minutes before the scheduled testing time. Arriving more than 30 minutes after the appointment may require forfeiting it." },
      { q: "Do NCLEX breaks count against the five-hour limit?", a: "Yes. The exam clock does not stop for scheduled or unscheduled breaks. Scheduled optional breaks are offered after approximately two hours and approximately three and a half hours of testing time." },
      { q: "Can I return to an earlier NCLEX item?", a: "No. You may reconsider the current response before advancing, but after confirming it and selecting Next, you cannot return to a previous item." },
      { q: "Will the test center tell me whether I passed?", a: "No. Test-center staff do not have access to results. Official results come only from the nursing regulatory body; Quick Results, where available, are unofficial." },
    ],
  },
];
