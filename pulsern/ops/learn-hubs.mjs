/* Current-plan authority hubs. These answer broad, high-value NCLEX searches
   while routing candidates to narrower, already-reviewed PulseRN guides. They
   remain digest-bound review candidates until the review ledger records a
   human decision for the exact content and source set. */

export const HUB_ARTICLES = [
  {
    slug: "2026-nclex-rn-test-plan",
    topic: "2026 NCLEX essentials",
    title: "2026 NCLEX-RN Test Plan: categories and percentages",
    h1: "2026 NCLEX-RN Test Plan: what to study",
    description: "A source-bound guide to the 2026 NCLEX-RN Test Plan, including effective dates, Client Needs percentages, integrated processes, and exam boundaries.",
    published: "2026-09-02",
    updated: "2026-09-02",
    cta: "PulseRN can organize practice across NCLEX Client Needs categories and clinical-judgment skills; it is not affiliated with NCSBN and cannot guarantee an examination result.",
    body: `
<p>The 2026 NCLEX-RN Test Plan is the official outline for the knowledge, skills, abilities and clinical judgment measured on the RN licensure examination. It is effective <b>April 1, 2026 through March 31, 2029</b>. The plan is based on the 2024 RN Practice Analysis and expert judgment from the NCLEX Examination Committee.</p>

<div class="key" role="note" aria-labelledby="test-plan-boundary">
<h2 id="test-plan-boundary" style="margin-top:0">Use the plan as a blueprint, not a prediction</h2>
<p>The published percentages describe ranges for content selection. They do not reveal the exact sequence of questions, let a candidate predict a result, or replace the current Candidate Bulletin and official NCLEX instructions. Verify the plan that applies on your examination date.</p>
</div>

<h2>2026 RN Client Needs percentages</h2>
<p>The test plan organizes content into four major Client Needs categories. Two are divided into subcategories, producing the eight percentage ranges shown below. Because the examination is adaptive and variable in length, NCSBN states that an individual examination's distribution may differ by up to three percentage points in each category.</p>
<div class="table-wrap" role="region" aria-label="2026 NCLEX-RN Client Needs percentage ranges" tabindex="0">
<table>
  <caption>Percentage of items assigned to each 2026 RN category or subcategory</caption>
  <thead><tr><th scope="col">Major category</th><th scope="col">Category or subcategory</th><th scope="col">Published range</th></tr></thead>
  <tbody>
    <tr><th scope="row" rowspan="2">Safe and Effective Care Environment</th><td>Management of Care</td><td>15–21%</td></tr>
    <tr><td>Safety and Infection Prevention and Control</td><td>10–16%</td></tr>
    <tr><th scope="row">Health Promotion and Maintenance</th><td>Health Promotion and Maintenance</td><td>6–12%</td></tr>
    <tr><th scope="row">Psychosocial Integrity</th><td>Psychosocial Integrity</td><td>6–12%</td></tr>
    <tr><th scope="row" rowspan="4">Physiological Integrity</th><td>Basic Care and Comfort</td><td>6–12%</td></tr>
    <tr><td>Pharmacological and Parenteral Therapies</td><td>13–19%</td></tr>
    <tr><td>Reduction of Risk Potential</td><td>9–15%</td></tr>
    <tr><td>Physiological Adaptation</td><td>11–17%</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this table:</b> Distribution of Content in the official <a href="#source-ncsbn-2026-rn-test-plan-pdf">2026 RN Test Plan</a> and the current-plan summary in the <a href="#source-ncsbn-2026-candidate-bulletin-pdf">2026 Candidate Bulletin</a>.</p>

<h2>Integrated processes appear throughout the plan</h2>
<p>Nursing process, caring, clinical judgment, communication and documentation, teaching and learning, and culture and spirituality are integrated across the Client Needs categories. They are not separate percentage buckets that can be studied once and set aside. For example, a medication item can also require communication, safety, teaching and clinical judgment.</p>
<p>Clinical judgment is also measured explicitly. The minimum-length RN examination includes three six-item case studies, totaling 18 items, and the test plan says approximately 10% of the examination consists of stand-alone clinical-judgment items selected according to examination length. Read the separate <a href="/learn/nclex-clinical-judgment/">NCLEX clinical judgment guide</a> for the six measured cognitive skills and a source-bound practice method.</p>

<h2>What the percentages mean for studying</h2>
<ol>
  <li><b>Begin with evidence, not a favorite topic.</b> Map recent practice errors to the eight Client Needs areas and the clinical-judgment skills involved.</li>
  <li><b>Keep every category active.</b> The ranges are not permission to omit a smaller category such as Health Promotion and Maintenance or Psychosocial Integrity.</li>
  <li><b>Give repeated weaknesses more time.</b> Use rationales and error patterns to distinguish a content gap from a cue-recognition, prioritization or calculation problem.</li>
  <li><b>Mix content after focused repair.</b> Focused review can rebuild a weak area; mixed sets then require you to identify the problem without being told the category first.</li>
  <li><b>Recheck the official plan.</b> Commercial study labels do not override NCSBN's current categories, definitions or administration rules.</li>
</ol>

<h2>Use the PulseRN library by test-plan need</h2>
<ul>
  <li><b>Safety and management:</b> review <a href="/learn/infection-control-precautions/">infection-control precautions</a>, <a href="/learn/delegation-and-assignment/">delegation and assignment</a>, and <a href="/learn/prioritization-abc-maslow/">prioritization</a>.</li>
  <li><b>Pharmacological and parenteral therapies:</b> use the <a href="/learn/high-alert-medications/">high-alert medication guide</a>, <a href="/learn/insulin-types-and-timing/">insulin timing guide</a>, and <a href="/learn/nclex-pharmacology-practice-questions/">free pharmacology questions</a>.</li>
  <li><b>Reduction of risk and physiological adaptation:</b> connect <a href="/learn/lab-values-to-memorize/">laboratory values</a>, <a href="/learn/electrolyte-imbalances/">electrolytes</a>, and <a href="/learn/abg-interpretation/">ABG interpretation</a> to assessment and priority decisions.</li>
  <li><b>Communication and psychosocial care:</b> practice <a href="/learn/therapeutic-communication/">therapeutic communication</a> with safety escalation when the scenario requires it.</li>
</ul>

<h2>Exam structure is a separate question</h2>
<p>The test plan also documents computerized adaptive testing, the 85–150 item range, the five-hour limit, pretest items and pass/fail rules. Those mechanics matter, but they are different search needs. See <a href="/learn/how-many-questions-is-the-nclex/">how many questions are on the NCLEX</a> and <a href="/learn/how-is-the-nclex-scored/">how the NCLEX is scored</a> for focused explanations. Do not use this content-distribution page to infer an unofficial score or result.</p>
`,
    faq: [
      { q: "When is the 2026 NCLEX-RN Test Plan effective?", a: "The official 2026 RN Test Plan is effective April 1, 2026 through March 31, 2029. Confirm the current NCSBN plan before your examination." },
      { q: "What is the largest 2026 NCLEX-RN content category?", a: "The plan publishes ranges rather than a fixed rank for every examination. Management of Care is 15–21%, Pharmacological and Parenteral Therapies is 13–19%, and Physiological Adaptation is 11–17%. Individual category distributions may vary within the plan's stated tolerance." },
      { q: "Can I skip categories with smaller percentages?", a: "No category is optional. The NCLEX assembles an examination that meets the test plan, and integrated processes can appear across all Client Needs categories. Use your practice evidence to adjust time without abandoning a category." },
      { q: "Are clinical-judgment case studies included in the category percentages?", a: "The 2026 plan states that the 18 case-study items in the minimum-length examination span content areas and are counted independently of the 52 content-area-specific items. Approximately 10% stand-alone clinical-judgment items are also selected depending on exam length." },
    ],
  },
  {
    slug: "nclex-clinical-judgment",
    topic: "2026 NCLEX essentials",
    title: "NCLEX clinical judgment: the six skills explained",
    h1: "NCLEX clinical judgment: a source-bound study guide",
    description: "Learn the six NCSBN clinical-judgment skills, how case studies and stand-alone items measure them, and a practical method for safer NCLEX reasoning.",
    published: "2026-09-02",
    updated: "2026-09-02",
    cta: "PulseRN can provide case-based practice and explanations across clinical-judgment skills; it is an educational tool, not clinical advice or an official NCLEX predictor.",
    body: `
<p>Clinical judgment on the NCLEX is the observed outcome of critical thinking and decision-making applied to client care. The 2026 RN Test Plan describes it as an iterative, multistep process that uses nursing knowledge to assess a situation, identify a prioritized concern and generate evidence-based solutions for safe care.</p>

<div class="key" role="note" aria-labelledby="clinical-judgment-boundary">
<h2 id="clinical-judgment-boundary" style="margin-top:0">What the NCJMM is—and is not</h2>
<p>The NCSBN Clinical Judgment Measurement Model (NCJMM) is a framework for developing, classifying and scoring examination items. NCSBN states that it neither defines nor redefines clinical judgment and was not constructed to replace the nursing process or an educational program's clinical framework. Use it to understand what the examination measures, not as a substitute for nursing knowledge, clinical instruction, facility policy or professional judgment.</p>
</div>

<h2>The six measurable clinical-judgment skills</h2>
<div class="table-wrap" role="region" aria-label="Six NCLEX clinical judgment skills" tabindex="0">
<table>
  <caption>Layer 3 cognitive skills represented in NCLEX case studies</caption>
  <thead><tr><th scope="col">Skill</th><th scope="col">Official focus, paraphrased</th><th scope="col">Question to ask during practice</th></tr></thead>
  <tbody>
    <tr><th scope="row">Recognize cues</th><td>Identify relevant and important information from sources such as history, assessment and vital signs.</td><td>Which findings matter to this presentation, and which are background or distractors?</td></tr>
    <tr><th scope="row">Analyze cues</th><td>Organize and connect recognized cues to the client's clinical presentation.</td><td>What pattern do these findings form, and what relationships need clarification?</td></tr>
    <tr><th scope="row">Prioritize hypotheses</th><td>Evaluate possible explanations using urgency, likelihood, risk, difficulty and time constraints.</td><td>Which explanation demands attention first, and what evidence supports that priority?</td></tr>
    <tr><th scope="row">Generate solutions</th><td>Identify expected outcomes and possible interventions for the prioritized hypotheses.</td><td>What safe outcome is needed, and which options could move the client toward it?</td></tr>
    <tr><th scope="row">Take action</th><td>Implement the solution or solutions addressing the highest priority.</td><td>Which action is indicated now within the nurse's role and the information supplied?</td></tr>
    <tr><th scope="row">Evaluate outcomes</th><td>Compare observed outcomes with expected outcomes.</td><td>Did the response move toward the expected result, and what requires reassessment or escalation?</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this table:</b> Clinical Judgment in the <a href="#source-ncsbn-2026-rn-test-plan-pdf">2026 RN Test Plan</a>, the definitions section of the <a href="#source-ncsbn-2026-candidate-bulletin-pdf">2026 Candidate Bulletin</a>, and NCSBN's <a href="#source-ncsbn-clinical-judgment-measurement-model">NCJMM framework page</a>.</p>

<h2>How clinical judgment appears on the 2026 NCLEX-RN</h2>
<p>A case study contains six items tied to the same unfolding client presentation and addresses the six skills. In the minimum-length examination, three case-study sets account for 18 items. The test plan also says approximately 10% of the examination consists of stand-alone clinical-judgment items, selected according to examination length.</p>
<p>The clinical-judgment process is integrated, so a real item may require more than one kind of reasoning even when it is classified to a particular skill. The six labels should help you diagnose practice errors; they should not become a rigid shortcut that makes you ignore the item directions or newly revealed information.</p>
<p>For the historical change from the pre-2023 examination, read <a href="/learn/next-generation-nclex-what-changed/">what changed with the Next Generation NCLEX</a>. For interface-specific practice, use the guides to <a href="/learn/bow-tie-questions/">bow-tie</a>, <a href="/learn/matrix-grid-questions/">matrix/grid</a>, <a href="/learn/cloze-drop-down-questions/">cloze drop-down</a>, <a href="/learn/highlight-questions/">highlight</a>, and <a href="/learn/drag-and-drop-ordering-questions/">ordering</a> items.</p>

<h2>A disciplined practice loop</h2>
<ol>
  <li><b>Read the task before solving.</b> Identify what the item asks you to select, rank, complete or evaluate.</li>
  <li><b>Build a concise cue list.</b> Separate relevant findings from neutral background information and note trends or changes.</li>
  <li><b>Connect before naming.</b> Explain how the cues relate instead of jumping from one familiar finding to a diagnosis.</li>
  <li><b>Rank with explicit criteria.</b> Compare urgency, likelihood, risk, stability and time sensitivity using the information given.</li>
  <li><b>Match the action to the role and moment.</b> Distinguish immediate nursing action, further assessment, communication and longer-term planning.</li>
  <li><b>Use the outcome as new evidence.</b> Compare the observed response with the expected result and decide whether to continue, reassess or escalate.</li>
</ol>
<p>This loop is PulseRN study guidance derived from the official skill definitions; it is not an NCSBN scoring algorithm. An item can supply facts or constraints that change the appropriate reasoning sequence.</p>

<h2>Review mistakes by reasoning failure, not only topic</h2>
<div class="table-wrap" role="region" aria-label="Clinical judgment error review" tabindex="0">
<table>
  <caption>Questions for reviewing a missed practice item</caption>
  <thead><tr><th scope="col">Observed problem</th><th scope="col">Possible skill gap</th><th scope="col">Repair action</th></tr></thead>
  <tbody>
    <tr><th scope="row">A decisive finding was overlooked</th><td>Recognize cues</td><td>Re-read the record by source and time, then label which findings changed the priority.</td></tr>
    <tr><th scope="row">Facts were noticed but not connected</th><td>Analyze cues</td><td>State the relationship among assessment, trend, medication, laboratory and history findings.</td></tr>
    <tr><th scope="row">A plausible but lower-priority problem was chosen</th><td>Prioritize hypotheses</td><td>Compare urgency, risk and likelihood explicitly before selecting.</td></tr>
    <tr><th scope="row">A correct intervention was chosen at the wrong time</th><td>Generate solutions or take action</td><td>Separate what is safe eventually from what is indicated first.</td></tr>
    <tr><th scope="row">A response was recorded but not interpreted</th><td>Evaluate outcomes</td><td>Name the expected result first, then compare the new evidence with it.</td></tr>
  </tbody>
</table>
</div>

<h2>Keep content knowledge connected to judgment</h2>
<p>Clinical judgment cannot operate without nursing knowledge. Practice the reasoning loop with concrete domains such as <a href="/learn/electrolyte-imbalances/">electrolytes</a>, <a href="/learn/insulin-types-and-timing/">insulin</a>, <a href="/learn/infection-control-precautions/">infection control</a>, <a href="/learn/delegation-and-assignment/">delegation</a>, and <a href="/learn/therapeutic-communication/">therapeutic communication</a>. The goal is not to memorize six labels; it is to use relevant knowledge while responding to the client information and task presented.</p>
`,
    faq: [
      { q: "What are the six NCLEX clinical-judgment skills?", a: "The 2026 RN Test Plan lists recognize cues, analyze cues, prioritize hypotheses, generate solutions, take action, and evaluate outcomes." },
      { q: "Does the NCJMM replace the nursing process?", a: "No. NCSBN states that the NCJMM was not constructed to replace nursing-process or educational frameworks. It supports measurement of clinical judgment on the NCLEX." },
      { q: "How many clinical-judgment case studies are on the 2026 NCLEX-RN?", a: "The minimum-length examination includes three six-item case studies, totaling 18 items. The plan also describes approximately 10% stand-alone clinical-judgment items selected depending on examination length." },
      { q: "Should I memorize the six skills?", a: "Know what each skill means, but do not stop at memorizing labels. Build nursing knowledge, practice with unfolding evidence, and review whether missed items came from cue recognition, analysis, prioritization, solution selection, action, or outcome evaluation." },
    ],
  },
];
