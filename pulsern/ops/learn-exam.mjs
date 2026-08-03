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
    description: "The NCLEX is pass/fail with no percentage score. How computerised adaptive testing decides, and why your question count tells you less than you think.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN's readiness estimate is built on the same logic — ability estimated from difficulty, not a raw percentage.",
    body: `
<p>The NCLEX-RN is not scored as a percentage. There is no 75%, no curve, and no partial credit that adds up to a final mark. It is a <b>pass/fail decision</b> produced by computerised adaptive testing, and understanding that changes how you should read your own practice results.</p>

<h2>What computerised adaptive testing does</h2>
<p>The exam maintains a running estimate of your ability. It starts near the passing standard and updates after every answered item:</p>
<ul>
  <li>Answer correctly, and the estimate rises — the next item is harder.</li>
  <li>Answer incorrectly, and the estimate falls — the next item is easier.</li>
</ul>
<p>Because items carry different difficulty, two candidates answering the same <i>number</i> correctly can finish in completely different places. Getting a very hard item right moves you far more than getting an easy one right.</p>

<div class="key">
<p><b>The consequence students miss:</b> feeling like the questions are hard is not evidence you are failing. If the engine is working and you are performing well, it will keep pushing difficulty up until you are answering roughly half of them correctly. A test that feels hard is often a test that is going well.</p>
</div>

<h2>The three ways the exam ends</h2>
<table>
  <tr><th>Rule</th><th>What happens</th></tr>
  <tr><td>95% confidence</td><td>The exam stops as soon as it is 95% confident you are clearly above or clearly below the passing standard — this ends most exams.</td></tr>
  <tr><td>Maximum length</td><td>If confidence is never reached, you answer up to the maximum number of items, and the final ability estimate decides.</td></tr>
  <tr><td>Run out of time</td><td>The decision is made on the items you did answer, using an alternate rule based on your recent performance.</td></tr>
</table>

<h2>Why your question count means less than you think</h2>
<p>Stopping early can mean you were clearly above the standard — or clearly below it. Going the full length means the engine stayed uncertain, which is neither good nor bad on its own. Candidates pass at every length and fail at every length.</p>
<p>Treat the count as information about the engine's confidence, not about your result. Reading it as a verdict is guessing.</p>

<h2>Next Generation scoring is partly different</h2>
<p>Traditional items are scored right or wrong. Next Generation item types — matrix, bow-tie, cloze, highlight — can use <b>polytomous scoring</b>, meaning partial credit is possible on a single item. Common approaches include:</p>
<ul>
  <li><b>0/1 scoring</b> — all-or-nothing; every element must be right.</li>
  <li><b>+/- scoring</b> — correct selections earn credit, incorrect selections lose it, with the item floored at zero.</li>
  <li><b>Rationale scoring</b> — linked parts must be consistent with each other to earn credit.</li>
</ul>
<p>Practically this means guessing widely on a select-all item can actively cost you under +/- scoring. Choosing only what you can defend is the better habit.</p>

<h2>What to do with this</h2>
<ul>
  <li>Stop tracking practice performance as a raw percentage. Track it against difficulty.</li>
  <li>Do not read difficulty as failure mid-exam. It is the engine doing its job.</li>
  <li>Do not over-select on partial-credit items to "cover" yourself.</li>
  <li>Answer every item — an unanswered item cannot help you, and the exam will not advance without one.</li>
</ul>
<p>For the current, authoritative rules — including exam length and time limits, which are set by NCSBN and can change between test plans — check the official candidate bulletin at <a href="https://www.nclex.com" rel="noopener">nclex.com</a> before your exam date.</p>
`,
    faq: [
      { q: "Is there a passing percentage on the NCLEX?", a: "No. The NCLEX-RN is pass/fail and reports no percentage score. The decision comes from an ability estimate produced by computerised adaptive testing, measured against a passing standard set by NCSBN." },
      { q: "Does finishing in the minimum number of questions mean I passed?", a: "No. Stopping early means the exam reached 95% confidence about your ability — that confidence can be that you are clearly above the standard or clearly below it. Candidates pass and fail at every exam length." },
      { q: "Do harder questions mean I am doing well?", a: "Often, yes. The engine raises difficulty after correct answers, so a test that feels difficult usually means your ability estimate is climbing. It is not a reliable signal on its own, and it is not a reason to panic mid-exam." },
      { q: "Is there partial credit on the NCLEX?", a: "On Next Generation item types, yes. Matrix, bow-tie, cloze and highlight items can use polytomous scoring, including +/- scoring where an incorrect selection cancels a correct one. Traditional multiple-choice items remain right or wrong." },
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
