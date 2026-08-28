/* One guide per Next Generation item type. These are strong long-tail targets:
   a student who searches "bow tie nclex" has a specific, urgent question and
   almost nothing on the open web answers it in exam-prep terms. */

export const TYPE_ARTICLES = [
  {
    slug: "bow-tie-questions",
    topic: "Question types",
    title: "Bow-tie questions: how to answer them",
    h1: "Bow-tie questions on the NCLEX",
    description: "A source-bound guide to NCLEX bow-tie items: identify one potential condition, two actions, and two parameters while keeping all five selections consistent.",
    published: "2026-08-03",
    updated: "2026-08-28",
    cta: "PulseRN can provide bow-tie-style practice with rationales; it does not reproduce the official NCLEX item bank or guarantee a result.",
    body: `
<p>A bow-tie item presents client information and asks the candidate to select one potential condition, two actions to take and two parameters to monitor. The five selections should form one clinically consistent response to the evidence in the item.</p>

<div class="key" role="note" aria-labelledby="bow-tie-boundary">
<h2 id="bow-tie-boundary" style="margin-top:0">Format and scoring boundary</h2>
<p>Use the current NCLEX Candidate Tutorial and official sample pack for the exact interface. NCSBN states generally that items with more than one key can receive partial credit under plus/minus, zero/one or rationale scoring. Do not assume a bow-tie is all-or-nothing, that every box earns an independent point, or that an incorrect center selection automatically erases every other selection.</p>
</div>

<h2>What each part asks</h2>
<div class="table-wrap" role="region" aria-label="NCLEX bow-tie response components" tabindex="0">
<table>
  <caption>The five selections in a bow-tie response</caption>
  <thead><tr><th scope="col">Component</th><th scope="col">Selections</th><th scope="col">Reasoning task</th></tr></thead>
  <tbody>
    <tr><th scope="row">Potential condition</th><td>One</td><td>Identify the condition most consistent with the relevant client information.</td></tr>
    <tr><th scope="row">Actions</th><td>Two</td><td>Select actions appropriate to that condition and the circumstances given.</td></tr>
    <tr><th scope="row">Parameters</th><td>Two</td><td>Select findings that appropriately monitor the client in relation to the condition and actions.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for the format:</b> NCSBN's <a href="#source-ncsbn-next-generation-nclex">Next Generation NCLEX materials</a>. Scoring boundaries come from Scoring Items in the <a href="#source-ncsbn-2026-rn-test-plan">2026 RN Test Plan</a> and the <a href="#source-ncsbn-nclex-faqs">NCLEX FAQ</a>.</p>

<h2>A consistency-first method</h2>
<p>The NCLEX does not require candidates to fill the targets in a particular reasoning order. One useful study method is:</p>
<ol>
  <li><b>Read the complete client information and prompt.</b> Identify time course, trends, risks and the question's exact wording.</li>
  <li><b>Separate relevant cues from distractors.</b> Use the supplied evidence rather than one isolated familiar finding.</li>
  <li><b>Compare the potential conditions.</b> Select the option best supported by the combined cues.</li>
  <li><b>Evaluate each action against that condition.</b> Confirm that both actions fit the client and do not merely sound generally helpful.</li>
  <li><b>Evaluate each monitoring parameter.</b> Confirm that both parameters are relevant to the selected condition and actions.</li>
  <li><b>Recheck all five selections together.</b> Change any selection that conflicts with the rest of the response or the scenario.</li>
</ol>
<p>This is study guidance, not an NCSBN scoring rule. A candidate may reason in another order and should follow the interface instructions shown on the examination.</p>

<h2>Common reasoning errors</h2>
<ul>
  <li>Selecting an action that may be appropriate generally but does not fit the chosen condition.</li>
  <li>Using one cue in isolation while ignoring contradictory or more urgent information.</li>
  <li>Choosing two actions or parameters that duplicate one another without covering what the item asks.</li>
  <li>Inventing facts not provided in the client information.</li>
  <li>Trying to calculate an unofficial score instead of completing the response requested.</li>
</ul>
`,
    faq: [
      { q: "What is a bow-tie question on the NCLEX?", a: "A clinical-judgment item that asks for one potential condition, two actions to take and two parameters to monitor based on the supplied client information." },
      { q: "How is a bow-tie question scored?", a: "NCSBN states that items with more than one key can receive partial credit under plus/minus, zero/one or rationale scoring. Follow the item directions and do not assume an unofficial per-box or all-or-nothing rule." },
      { q: "Must I fill in the condition first?", a: "No official rule requires a particular completion order. Identifying the best-supported condition first can be a useful consistency check because the actions and monitoring parameters should fit it, but review all five selections together before advancing." },
    ],
  },

  {
    slug: "matrix-grid-questions",
    topic: "Question types",
    title: "Matrix and grid questions: how to answer them",
    h1: "Matrix and grid questions on the NCLEX",
    description: "How matrix items are scored row by row, why they punish pattern-guessing, and the one-finding-at-a-time habit that keeps you accurate.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN drills matrix items with per-row rationales so you can see exactly which finding you misclassified.",
    body: `
<p>A matrix item gives you a table. Findings run down the side, categories run across the top, and you classify every row. Typical category sets are <i>expected / unexpected</i>, <i>effective / ineffective</i>, or <i>indicated / contraindicated / non-essential</i>.</p>

<h2>Why this format is unforgiving</h2>
<p>Matrix items are usually scored <b>row by row</b>. That has two consequences students underestimate:</p>
<ul>
  <li>Getting most rows right can still earn partial credit — the item is not all-or-nothing under +/- style scoring, so a careful row is worth placing carefully.</li>
  <li>There is nowhere to hide. On a multiple-choice item you can eliminate your way to an answer. Here, every single finding demands an independent judgement.</li>
</ul>

<div class="key">
<p><b>Treat each row as its own question.</b> The single most common error is drifting — classifying a row based on the overall vibe of the scenario rather than on that specific finding. If the client is clearly deteriorating, it feels wrong to mark a normal finding as expected. Mark it anyway. The exam is testing whether you can tell them apart.</p>
</div>

<h2>The method</h2>
<ol>
  <li><b>Read the categories before the rows.</b> Expected-for-this-condition is a different question from normal-for-a-healthy-adult, and the column headings tell you which one is being asked.</li>
  <li><b>Establish the frame.</b> Who is this client, what is their condition, how long post-operative or post-partum, what is their age? A heart rate of 120 is expected in an infant and alarming in a resting adult.</li>
  <li><b>Cover the other rows.</b> Work one finding at a time, deciding it fully before moving on.</li>
  <li><b>Do not balance the columns.</b> There is no rule that categories are evenly used. If nine findings are unexpected, mark nine.</li>
</ol>

<h2>The frame does most of the work</h2>
<p>Almost every matrix error traces back to classifying against the wrong baseline. Before you start, fix in your mind what <i>should</i> be true for this specific client:</p>
<table>
  <tr><th>Context</th><th>What shifts</th></tr>
  <tr><td>Age</td><td>Vital sign ranges, developmental expectations, normal behaviour.</td></tr>
  <tr><td>Time since surgery or birth</td><td>What is an expected part of recovery at 2 hours is not at 2 days.</td></tr>
  <tr><td>Pregnancy</td><td>Physiological changes make several "abnormal" adult values expected.</td></tr>
  <tr><td>Chronic disease</td><td>A baseline that would be abnormal in a healthy client may be this client's normal.</td></tr>
</table>

<h2>Reading the whole grid first</h2>
<p>Skim every row before classifying any. Matrix items are often built around two or three findings that carry the clinical story, with the rest as filler that is genuinely unremarkable. Spotting the important ones early stops you from reading significance into rows that have none.</p>
`,
    faq: [
      { q: "How are matrix questions scored on the NCLEX?", a: "Usually row by row, so partial credit is possible. Each finding you classify correctly can earn credit independently, which is why working carefully through every row is worthwhile even when you are unsure of some." },
      { q: "What categories do matrix questions use?", a: "Commonly expected versus unexpected, effective versus ineffective, or indicated versus contraindicated versus non-essential. Read the column headings first — they change what question you are actually answering." },
      { q: "Do matrix questions have an even number of answers per column?", a: "No. There is no requirement that categories be evenly used. If every finding in a scenario is unexpected, every row is marked unexpected." },
    ],
  },

  {
    slug: "cloze-drop-down-questions",
    topic: "Question types",
    title: "Cloze (drop-down) questions: how to answer them",
    h1: "Cloze and drop-down questions on the NCLEX",
    description: "How cloze items chain clinical reasoning across linked blanks, and why you should answer the blank you are surest about first.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN includes cloze items with linked reasoning, so you practise the chain rather than isolated facts.",
    body: `
<p>A cloze item is a sentence — or a short paragraph — with blanks, each offering a drop-down menu. You are completing a clinical statement so that it reads as something a competent nurse would actually say.</p>

<h2>Why these are harder than they look</h2>
<p>The blanks are frequently <b>linked</b>. A typical construction reads: <i>The client is most likely experiencing [blank 1] as evidenced by [blank 2], and the nurse should first [blank 3].</i></p>
<p>Choose wrongly in blank 1 and blanks 2 and 3 are almost certainly wrong too, because they must be consistent with it. Some cloze items are scored so that linked selections must agree with one another to earn credit.</p>

<div class="key">
<p><b>Answer out of order.</b> Start with whichever blank you are most confident about, even if it is the last one. A firm anchor anywhere in the sentence constrains the others. Working strictly left-to-right means your least certain guess sets the direction for everything after it.</p>
</div>

<h2>The method</h2>
<ol>
  <li><b>Read the complete sentence with every blank empty</b> to see what claim is being built.</li>
  <li><b>Open each menu and read all the options</b> before choosing anything. The distractors tell you what distinction is being tested.</li>
  <li><b>Anchor on your strongest blank.</b></li>
  <li><b>Work outward,</b> keeping every choice consistent with the anchor.</li>
  <li><b>Read the finished sentence back.</b> This last step catches more errors than any other — a wrong combination usually sounds wrong when you read it whole.</li>
</ol>

<h2>What the distractors are doing</h2>
<table>
  <tr><th>Distractor style</th><th>How to beat it</th></tr>
  <tr><td>Right concept, wrong severity</td><td>Match the urgency in the scenario, not just the topic.</td></tr>
  <tr><td>True but irrelevant</td><td>A factually correct statement that does not follow from this client's findings.</td></tr>
  <tr><td>Right action, wrong timing</td><td>Something you would genuinely do, but not first.</td></tr>
  <tr><td>Plausible-sounding jargon</td><td>Terminology that sounds clinical but does not describe what is happening here.</td></tr>
</table>

<h2>Reading the sentence back</h2>
<p>Cloze items are built as complete clinical statements, and an inconsistent set of choices produces a sentence that a nurse would not say. If your completed sentence claims a client is experiencing one problem, evidenced by a finding that belongs to another, and treated with an intervention for a third, you have found your own error before the exam scored it.</p>
`,
    faq: [
      { q: "What is a cloze question on the NCLEX?", a: "An item where you complete a clinical sentence or short paragraph by choosing from drop-down menus at each blank. Also called drop-down items." },
      { q: "Are cloze question blanks scored separately?", a: "It depends on the item. Some blanks are scored independently; others are linked so that selections must be clinically consistent with one another to earn credit." },
      { q: "Should I answer cloze blanks in order?", a: "No. Start with the blank you are most confident about. A firm anchor constrains the remaining choices, whereas guessing at the first blank sends the rest of the sentence in the wrong direction." },
    ],
  },

  {
    slug: "highlight-questions",
    topic: "Question types",
    title: "Highlight questions: how to answer them",
    h1: "Highlight questions on the NCLEX",
    description: "How highlight items test cue recognition, why over-selecting costs you, and how to read a nurse's note for what actually matters.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN's highlight items use realistic chart excerpts and nurse's notes, not simplified fragments.",
    body: `
<p>A highlight item gives you a piece of a chart — a nurse's note, a history, a set of results — and asks you to click the findings that are significant. It is the purest test of the first step of clinical judgment: <b>recognising cues</b>.</p>

<h2>The core skill</h2>
<p>Real charting contains a great deal of information that is true, documented, and completely unremarkable. The competent nurse reads past it to the two or three things that change what happens next. That filtering is exactly what is being scored.</p>

<div class="key">
<p><b>Do not highlight everything.</b> These items commonly use +/- scoring, where an incorrect selection cancels out a correct one. Highlighting generously to make sure you caught the right ones can reduce your score to zero on an item where you actually knew the answer.</p>
</div>

<h2>The method</h2>
<ol>
  <li><b>Read the question stem first.</b> Findings requiring immediate follow-up is a narrower ask than findings that are abnormal, which is narrower again than findings relevant to the diagnosis. The stem sets the bar.</li>
  <li><b>Read the whole passage once without clicking.</b></li>
  <li><b>For each candidate finding, ask a single question:</b> does this change what I do next? If not, leave it.</li>
  <li><b>Check what is missing.</b> A note that records no urine output since a time hours ago is a significant finding stated as an absence.</li>
</ol>

<h2>What tends to be significant</h2>
<ul>
  <li>Values outside the expected range <i>for this client</i>, given age, condition and stage of recovery.</li>
  <li>Trends — a value that has moved, even while still technically within range.</li>
  <li>Findings that contradict the expected trajectory, such as pain increasing when it should be settling.</li>
  <li>New neurological or mental status changes, which are cues far more often than they are noise.</li>
  <li>Anything touching airway, breathing or circulation.</li>
  <li>Absences: no output, no bowel sounds, no response.</li>
</ul>

<h2>What tends not to be</h2>
<ul>
  <li>Values inside the expected range for that client.</li>
  <li>Findings consistent with the known diagnosis and already being managed.</li>
  <li>Social and historical detail with no bearing on the current problem.</li>
  <li>Routine care that has been carried out as ordered.</li>
</ul>

<h2>When you are unsure</h2>
<p>Under +/- scoring the arithmetic is simple. A finding you are confident about is worth selecting. A finding you are truly 50/50 on has an expected value near zero and can cost you a mark you had already earned. Select what you can defend and leave the rest.</p>
`,
    faq: [
      { q: "What is a highlight question on the NCLEX?", a: "An item that presents chart material — a nurse's note, history or results — and asks you to click the findings that are significant. It tests cue recognition, the first step of the clinical judgment model." },
      { q: "Should I highlight every abnormal finding?", a: "Only those that meet the bar set by the stem. Highlight items often use +/- scoring, where an incorrect selection cancels a correct one, so over-selecting actively reduces your score." },
      { q: "What counts as a significant finding?", a: "Anything that changes what you would do next: values outside the expected range for that client, meaningful trends, new neurological changes, anything affecting airway, breathing or circulation, and significant absences such as no urine output." },
    ],
  },

  {
    slug: "select-all-that-apply-strategy",
    topic: "Question types",
    title: "Select all that apply: a strategy that works",
    h1: "Select all that apply (SATA) questions",
    description: "Why treating each option as a true/false question beats hunting for a pattern, and how partial credit changes when to guess.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN's multiple-response items rationalise every option, so you learn why the ones you left out were wrong.",
    body: `
<p>Select all that apply — extended multiple response — is the item type candidates dread most. The dread is mostly misplaced. SATA is not harder knowledge; it is the same knowledge with nowhere to hide.</p>

<h2>The one habit that fixes most SATA problems</h2>
<div class="key">
<p><b>Treat each option as a separate true/false question about the client in the stem.</b> Cover the other options, read one, and decide: is this true, for this client, right now? Then move to the next. Do not compare options with each other. There is no best answer to find — each one stands or falls alone.</p>
</div>
<p>Comparing options is a habit built by years of single-answer multiple choice, and it is exactly wrong here. It produces the classic SATA failure: rejecting a correct option because another option seemed more correct.</p>

<h2>How many are right?</h2>
<p>There is no fixed number, no rule that it is usually three, and no guarantee that at least one is wrong. Any number of the options may be correct. Going in expecting three and stopping when you have found three is a way to miss a fourth.</p>

<h2>Partial credit changes the maths</h2>
<p>Many extended multiple response items use <b>+/- scoring</b>: each correct selection earns credit, each incorrect selection removes some, and the item cannot go below zero.</p>
<table>
  <tr><th>Situation</th><th>What to do</th></tr>
  <tr><td>Confident it is true</td><td>Select it.</td></tr>
  <tr><td>Confident it is false</td><td>Leave it.</td></tr>
  <tr><td>Genuinely 50/50</td><td>Leave it. Its expected value is roughly zero and it can cancel a mark you earned.</td></tr>
  <tr><td>Leaning true, can state why</td><td>Select it. Being able to articulate the reason is usually the difference between knowledge and hope.</td></tr>
</table>
<p>Under older all-or-nothing scoring the calculation was different — you needed the exact set. Under +/- scoring, restraint is rewarded.</p>

<h2>Recurring traps</h2>
<ul>
  <li><b>Absolutes.</b> Options containing always, never, all or none are more often false, because clinical practice rarely tolerates them.</li>
  <li><b>True but not for this client.</b> A statement that is sound general nursing yet contraindicated by this client's condition, age or stage.</li>
  <li><b>Right intervention, wrong phase.</b> Something appropriate later in care but not at the point the stem describes.</li>
  <li><b>Two options saying nearly the same thing.</b> Usually both true or both false — resist assuming exactly one must be right.</li>
</ul>

<h2>Working through it</h2>
<ol>
  <li>Identify the client, the condition, and the moment in their care.</li>
  <li>Note what the stem is asking for — teaching, actions, expected findings, contraindications.</li>
  <li>Go down the options one at a time, deciding each in isolation.</li>
  <li>Do not revisit to make the total feel right. Your per-option reasoning was better than your instinct about the count.</li>
</ol>
`,
    faq: [
      { q: "How many answers are correct in a select all that apply question?", a: "There is no fixed number. Any number of the options may be correct, and there is no rule that a particular count is typical. Judge each option independently rather than aiming for a total." },
      { q: "Should I guess on select all that apply questions?", a: "Not on options you are genuinely unsure about. Many extended multiple response items use +/- scoring, where an incorrect selection cancels a correct one, so a coin-flip selection has an expected value near zero." },
      { q: "Why do I keep getting SATA questions wrong?", a: "Most often because of comparing options against each other instead of judging each one on its own. SATA has no best answer — each option is a separate true/false claim about the client in the stem." },
    ],
  },

  {
    slug: "drag-and-drop-ordering-questions",
    topic: "Question types",
    title: "Drag-and-drop and ordering questions",
    h1: "Drag-and-drop and ordering questions on the NCLEX",
    description: "How sequencing items are scored, the frameworks that decide order, and why you should build the sequence from both ends.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN includes ordering items across procedures, emergencies and the nursing process.",
    body: `
<p>Drag-and-drop items ask you to place options into an order or a set of categories. The most demanding version is sequencing: put these actions in the order the nurse should perform them.</p>

<h2>What is being tested</h2>
<p>Not whether you know the actions — the word bank has already told you them. What is being tested is <b>priority</b>: which comes first when several reasonable things all need doing.</p>

<h2>The frameworks that decide order</h2>
<table>
  <tr><th>Framework</th><th>Use it when</th></tr>
  <tr><td>ABC — airway, breathing, circulation</td><td>Any scenario with a physiological threat. It outranks everything else.</td></tr>
  <tr><td>Nursing process</td><td>Assess before you intervene, unless the stem has already given you the assessment finding.</td></tr>
  <tr><td>Maslow</td><td>Physiological needs before safety, safety before psychosocial.</td></tr>
  <tr><td>Safety first</td><td>Procedures — hand hygiene, identification, and verification usually precede the technical steps.</td></tr>
  <tr><td>Least invasive first</td><td>Where several interventions would work and the client is stable.</td></tr>
</table>

<div class="key">
<p><b>Build from both ends.</b> The first and last steps are usually the most obvious — hand hygiene near the start, evaluation or documentation near the end. Place those, then fill the middle, where the real discrimination lives. Working strictly top to bottom means spending your effort on the ambiguous middle while your certain anchors sit unplaced.</p>
</div>

<h2>Sequencing patterns worth knowing</h2>
<ul>
  <li><b>Sterile procedures</b> — gather and check equipment, hand hygiene, position the client, establish the sterile field, perform, secure, document.</li>
  <li><b>Personal protective equipment</b> — the order of donning is not the reverse of doffing, and both are commonly tested.</li>
  <li><b>Deteriorating client</b> — assess and protect airway and breathing, then circulation, then escalate, then document. Documentation is almost never first.</li>
  <li><b>Admission and handover</b> — verify identity before anything is done to the client.</li>
</ul>

<h2>Scoring and the practical consequence</h2>
<p>Ordering items may be scored all-or-nothing or with credit for correctly placed positions, depending on the item. Either way, one misplacement early in a sequence displaces everything after it, so the opening steps deserve the most care.</p>

<h2>Assessment first, except when it is not</h2>
<p>Assess before intervening is a sound default, and it is also the most over-applied rule in NCLEX preparation. If the stem has already handed you the assessment finding — the client is not breathing, the saturation is 82%, the tracing shows a lethal rhythm — then reassessing is a delay, and the exam scores it as one. Assessment comes first when you still need information. When the information is already in front of you, act.</p>
`,
    faq: [
      { q: "How are NCLEX ordering questions scored?", a: "Depending on the item, either all-or-nothing or with credit for positions placed correctly. Because a single early misplacement shifts everything after it, the opening steps carry the most weight." },
      { q: "What order should I put nursing actions in?", a: "Use ABC first for any physiological threat, then the nursing process, then Maslow. For procedures, safety steps such as hand hygiene and client identification usually precede the technical steps." },
      { q: "Should assessment always come first?", a: "No. Assess first when you still need information. If the stem has already given you the critical finding, reassessing is a delay and the exam treats it as one." },
    ],
  },
];
