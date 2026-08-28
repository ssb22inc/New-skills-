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
    description: "Why the NCLEX has no fixed length, what the minimum and maximum mean, and why pretest items make your question count a poor predictor.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN's readiness exams run at the NCLEX-RN's minimum length so you practise the endurance, not just the content.",
    body: `
<p>There is no fixed number. The NCLEX-RN is adaptive, so its length is decided by how quickly the engine becomes confident about your ability. Two candidates sitting on the same day can answer very different numbers of items and both pass.</p>

<h2>The structure of your exam</h2>
<p>Every NCLEX contains two kinds of items, and you cannot tell them apart:</p>
<ul>
  <li><b>Operational items</b> — scored, and they determine your result.</li>
  <li><b>Pretest items</b> — unscored, being trialled for future exams. They look identical to real items.</li>
</ul>
<p>This matters more than students expect. An item you agonised over may not have counted at all. It is one more reason that reconstructing your performance from memory afterwards is not a useful exercise.</p>

<div class="key">
<p><b>Do not try to count.</b> Candidates sometimes try to work out where they are by tracking item numbers or guessing which were pretest. You cannot know, the counting costs attention you need for the item in front of you, and the conclusion you reach will be wrong as often as right.</p>
</div>

<h2>Why the length varies</h2>
<p>The exam stops when it reaches 95% confidence that you are above or below the passing standard. A candidate performing consistently — well above or well below — reaches that confidence quickly. A candidate performing close to the standard keeps the engine uncertain, so it keeps asking.</p>
<p>Finishing quickly is not a pass. Going long is not a fail. Both happen in both directions.</p>

<h2>Time, not just items</h2>
<p>You are also working against a clock that covers the whole session, including the optional breaks. Running out of time triggers a different decision rule based on your recent performance rather than the full exam.</p>
<p>The practical risk is not that you are too slow overall — it is that a handful of items eat disproportionate time. A minute or two on a hard item is normal. Five is a warning sign. Make a decision and move.</p>

<h2>Practising for length</h2>
<p>Most candidates have practised content far more than they have practised endurance. Sitting a full-length exam under timed conditions is uncomfortable in a way that a 20-question block never is, and that discomfort is the thing you want to meet in advance rather than on test day.</p>
<p>The exact minimum, maximum and time limit are set by NCSBN and can change between test plans. Confirm the current figures in the candidate bulletin at <a href="https://www.nclex.com" rel="noopener">nclex.com</a>.</p>
`,
    faq: [
      { q: "Why does the NCLEX have no fixed number of questions?", a: "Because it is adaptive. The exam continues until it is 95% confident your ability is above or below the passing standard, or until you reach the maximum length or run out of time. How fast that confidence arrives depends on how consistently you perform." },
      { q: "What are pretest questions on the NCLEX?", a: "Unscored items being trialled for use on future exams. They are indistinguishable from scored items while you are taking the test, and they do not count toward your result." },
      { q: "Is it bad if I get the maximum number of questions?", a: "No. It means the engine stayed uncertain about where you sit relative to the passing standard. Candidates pass and fail at the maximum length, just as they do at the minimum." },
    ],
  },

  {
    slug: "next-generation-nclex-what-changed",
    topic: "How the exam works",
    title: "Next Generation NCLEX: what actually changed",
    h1: "Next Generation NCLEX: what actually changed",
    description: "What the Next Gen NCLEX added, why it tests clinical judgment instead of recall, and what that means for how you should be studying.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN includes every Next Gen item type and runs case studies through the clinical judgment model.",
    body: `
<p>The Next Generation NCLEX kept the same licensure decision and changed how it measures you. The headline is new question formats, but the formats are a consequence, not the point. The point is <b>clinical judgment</b>.</p>

<h2>The real change: from knowing to deciding</h2>
<p>A traditional item can be answered by recall — you either know that a potassium of 6.8 is dangerous or you do not. Next Generation items are built to ask what you would <i>do</i>, in what order, and on what evidence. Recall is the entry fee, not the answer.</p>
<p>That is why the new formats look the way they do. A matrix item makes you classify several findings at once. A bow-tie makes you commit to a condition, the actions that follow, and the parameters you would monitor — as one connected decision.</p>

<h2>The clinical judgment model</h2>
<p>Case studies follow a six-step framework:</p>
<ol>
  <li><b>Recognise cues</b> — which findings in this scenario actually matter?</li>
  <li><b>Analyse cues</b> — what do they mean together?</li>
  <li><b>Prioritise hypotheses</b> — what is most likely, and most dangerous?</li>
  <li><b>Generate solutions</b> — what could you do?</li>
  <li><b>Take action</b> — what will you do, first?</li>
  <li><b>Evaluate outcomes</b> — did it work, and how would you know?</li>
</ol>
<p>Each step is a scoreable decision. This is why a single case study carries more weight than a single multiple-choice item, and why practising cases end-to-end is worth more than answering isolated questions.</p>

<h2>The item types you will meet</h2>
<table>
  <tr><th>Type</th><th>What it asks</th></tr>
  <tr><td>Matrix / grid</td><td>Classify multiple findings across categories — expected, unexpected, urgent.</td></tr>
  <tr><td>Bow-tie</td><td>Link condition, actions and monitoring parameters into one connected decision.</td></tr>
  <tr><td>Cloze (drop-down)</td><td>Complete a sentence with clinically correct choices from menus.</td></tr>
  <tr><td>Highlight</td><td>Select the significant findings inside a chart or nurse's note.</td></tr>
  <tr><td>Drag and drop</td><td>Order or match — often sequencing actions correctly.</td></tr>
  <tr><td>Extended multiple response</td><td>Select all that apply, frequently with partial credit.</td></tr>
</table>

<div class="key">
<p><b>What this means for studying:</b> memorising facts still matters, but it is no longer sufficient. If your practice consists of reading rationales for isolated questions, you are training recall while being examined on judgment. Work through whole scenarios and force yourself to state what you would do first, and why, before you look.</p>
</div>

<h2>What did not change</h2>
<ul>
  <li>It is still pass/fail, still adaptive, still no percentage score.</li>
  <li>The test plan is still organised around client-need categories.</li>
  <li>Safety is still the organising principle behind almost every correct answer.</li>
</ul>
<p>Test plan details are revised periodically by NCSBN. Check the current plan at <a href="https://www.nclex.com" rel="noopener">nclex.com</a>.</p>
`,
    faq: [
      { q: "What is the Next Generation NCLEX?", a: "A revision of the NCLEX that added new item types and a case-study format built to measure clinical judgment — the ability to recognise what matters in a scenario and decide what to do — rather than recall alone." },
      { q: "What are the Next Gen NCLEX question types?", a: "Matrix/grid, bow-tie, cloze (drop-down), highlight, drag-and-drop, and extended multiple response, alongside traditional multiple choice and dosage calculation." },
      { q: "Is the Next Generation NCLEX harder?", a: "It is different rather than uniformly harder. It rewards students who can reason through a scenario and penalises pure memorisation more than the previous format did. Candidates who practise whole cases tend to find it fairer than those who drill isolated facts." },
    ],
  },

  {
    slug: "nclex-test-day-what-to-expect",
    topic: "How the exam works",
    title: "NCLEX test day: what to expect",
    h1: "NCLEX test day: what actually happens",
    description: "What happens at the test centre, what to bring, how breaks and the clock work, and the mid-exam thinking that costs candidates marks.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN's readiness exams run under lockdown with a real clock, so test day is not the first time you sit one.",
    body: `
<p>Most test-day advice is about logistics. Logistics matter, but they are not what costs people the exam. What costs people the exam is what happens in their head around question 60.</p>

<h2>Before you go</h2>
<ul>
  <li><b>Acceptable photo ID</b> whose name matches your registration <i>exactly</i>. A mismatch is one of the few things that will stop you sitting the exam.</li>
  <li>Arrive early. Late arrival can forfeit your appointment and your fee.</li>
  <li>Personal items go in a locker. Expect palm-vein scanning, a photograph, and a check on the way in and back from every break.</li>
  <li>You will be given an on-screen calculator and something to write on. Bring nothing of your own to the desk.</li>
</ul>
<p>Confirm current ID rules and centre policy in the candidate bulletin at <a href="https://www.nclex.com" rel="noopener">nclex.com</a> and with <a href="https://www.pearsonvue.com/us/en/nclex.html" rel="noopener">Pearson VUE</a> — these are set by NCSBN and Pearson VUE, not by us, and they do change.</p>

<h2>The clock includes your breaks</h2>
<p>Optional breaks are offered during the session, and the time comes out of your total. A break is often worth taking anyway — the cost of a few minutes is smaller than the cost of grinding through the last hour with nothing left. Decide in advance roughly when you will take one, so it is not a decision you make while depleted.</p>

<h2>The part nobody prepares for</h2>
<div class="key">
<p>Somewhere in the middle you will hit a run of items you feel unsure about, and you will start building a story about what it means. Every candidate does this. The story is not evidence. The engine raises difficulty <i>because</i> you are answering well, so the feeling of struggling is the expected experience of a test that is going fine.</p>
</div>
<p>Two habits protect you:</p>
<ul>
  <li><b>Do not audit yourself mid-exam.</b> You cannot see your ability estimate, you cannot identify pretest items, and every conclusion you reach is a guess made with the attention you needed for the current item.</li>
  <li><b>Do not linger.</b> You cannot go back. Read carefully, decide, commit, move. An item you spend five minutes on has usually already had your best answer for four of them.</li>
</ul>

<h2>Reading the question properly</h2>
<p>Under pressure, candidates answer the question they expected instead of the one on screen. Before selecting:</p>
<ul>
  <li>Is it asking for the <b>first</b> action, or simply an appropriate one?</li>
  <li>Is it asking what the nurse should do, or what the nurse should do <b>next</b>?</li>
  <li>Is there a negative — <i>which finding requires no further action</i>?</li>
  <li>Who is the client, and does their age or condition change the expected values?</li>
</ul>

<h2>Afterwards</h2>
<p>You will leave with no idea how you did. That is normal and it is not diagnostic. Trying to reconstruct items afterwards tells you nothing useful — many of the ones you remember most vividly were the hardest, which frequently means you were doing well. Results are released through your board of nursing in their own time.</p>
`,
    faq: [
      { q: "What do I need to bring to the NCLEX?", a: "Acceptable photo identification whose name matches your registration exactly, and your appointment details. Everything else goes in a locker. Confirm the current ID requirements in the NCSBN candidate bulletin before your exam date." },
      { q: "Do NCLEX breaks count against my time?", a: "Yes. Optional breaks come out of your total session time. Many candidates still find a short break worthwhile, because fatigue costs more marks over the final stretch than the minutes do." },
      { q: "Can I go back and change an NCLEX answer?", a: "No. The exam is adaptive, so each item is selected based on your previous answers. Once you confirm an answer you cannot return to it." },
    ],
  },
];
