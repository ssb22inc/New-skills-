/* Test-taking skill and study strategy. These target the searches students make
   when practice scores have stalled and they suspect the problem is method
   rather than knowledge — which, very often, it is. */

export const SKILL_ARTICLES = [
  {
    slug: "prioritization-abc-maslow",
    topic: "Test-taking skill",
    title: "Prioritisation: ABC, Maslow and what comes first",
    h1: "How to answer prioritisation questions",
    description: "The order of frameworks that decides which client to see first, and the trap of applying assessment-first when the assessment is already done.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN's adaptive practice interleaves prioritisation across all eight categories, so you meet it in context.",
    body: `
<p>Prioritisation items give you several things that all genuinely need doing and ask which comes first. Every option is defensible. That is the design — you are being tested on ordering, not on identifying the one right action.</p>

<h2>The frameworks, in the order you apply them</h2>
<ol>
  <li><b>ABC — airway, breathing, circulation.</b> Outranks everything. An airway problem beats a circulation problem beats everything else.</li>
  <li><b>Maslow.</b> Physiological before safety, safety before psychosocial.</li>
  <li><b>Nursing process.</b> Assess before intervening — with the exception below.</li>
  <li><b>Acute over chronic.</b> A new problem outranks a long-standing one.</li>
  <li><b>Unstable over stable.</b> Unexpected findings outrank expected ones.</li>
</ol>

<div class="key">
<p><b>The exception that costs the most marks:</b> assess-first is a default, not a law. When the stem has already handed you the assessment finding — the client is not breathing, the saturation is 84%, the rhythm is lethal — choosing to reassess is a delay, and the exam scores it as one. Assessment comes first when you still need information. When you already have it, act.</p>
</div>

<h2>Which client do you see first?</h2>
<p>These items list several clients and ask who to attend to first. Work through them in a fixed order rather than by impression:</p>
<ol>
  <li><b>Discard the expected.</b> A finding that is normal for that condition or stage of recovery is not urgent, however dramatic it sounds. Post-operative pain on day one is expected.</li>
  <li><b>Find the unexpected.</b> A finding that does not fit the diagnosis is your candidate.</li>
  <li><b>Apply ABC</b> to whichever candidates remain.</li>
  <li><b>Prefer the one who could deteriorate fastest.</b> Between two abnormal findings, the airway or circulatory one wins.</li>
</ol>

<h2>Patterns that signal urgency</h2>
<table>
  <tr><th>Finding</th><th>Why it moves up the list</th></tr>
  <tr><td>New confusion or restlessness</td><td>Frequently the first sign of hypoxaemia, before saturation falls noticeably.</td></tr>
  <tr><td>A change from the client's baseline</td><td>Trend matters more than an absolute value inside a range.</td></tr>
  <tr><td>Anything obstructing an airway</td><td>Stridor, drooling, swelling, inability to speak in full sentences.</td></tr>
  <tr><td>Signs of bleeding or shock</td><td>Tachycardia with falling blood pressure, cool clammy skin, falling output.</td></tr>
  <tr><td>Sudden severe pain</td><td>Especially chest, abdominal, or calf pain that is new.</td></tr>
</table>

<h2>Findings that look urgent and are not</h2>
<ul>
  <li>Pain that is expected for the procedure and stage.</li>
  <li>A low-grade temperature in the first 24 hours after surgery.</li>
  <li>Serosanguineous drainage early in wound healing.</li>
  <li>A chronic abnormal value that matches this client's known baseline.</li>
  <li>Anxiety before a scheduled procedure with no physiological findings.</li>
</ul>

<h2>Practising this properly</h2>
<p>The common mistake is reading a prioritisation rationale, agreeing with it, and moving on. Agreement is not the skill. Before revealing any answer, commit out loud to who you would see first <i>and</i> why the second-place option is second. If your reason for the runner-up is vague, that is the gap — not the one you got right.</p>
`,
    faq: [
      { q: "What order should I use for NCLEX prioritisation questions?", a: "Airway, breathing and circulation first, then Maslow, then the nursing process, then acute over chronic and unstable over stable. ABC outranks everything else." },
      { q: "Should assessment always be the first action?", a: "No. Assess first when you still need information. When the stem has already given you the critical finding, reassessing delays care and the exam treats it as the wrong choice." },
      { q: "How do I decide which client to see first?", a: "Eliminate findings that are expected for each client's condition and stage, identify what is unexpected, then apply ABC to those. Between two abnormal findings, choose the one that could deteriorate fastest." },
    ],
  },

  {
    slug: "delegation-and-assignment",
    topic: "Test-taking skill",
    title: "Delegation and assignment rules",
    h1: "Delegation: what goes to whom",
    description: "What can be delegated to assistive personnel and LPNs, what never leaves the RN, and the stable-predictable-routine test that resolves most items.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN includes delegation scenarios across management of care, with rationales for every option.",
    body: `
<p>Delegation items are testable because the rules are genuinely rule-like. Once you hold the boundaries, most of these questions resolve in seconds.</p>

<h2>What never leaves the RN</h2>
<p>The nursing process itself does not transfer. Specifically:</p>
<ul>
  <li><b>Assessment</b> — the initial assessment and any assessment requiring clinical judgement.</li>
  <li><b>Diagnosis</b> and analysis of data.</li>
  <li><b>Planning</b> and setting of goals.</li>
  <li><b>Evaluation</b> of outcomes.</li>
  <li><b>Teaching</b> that requires assessment of understanding.</li>
  <li>Care of the <b>unstable</b> client.</li>
</ul>

<div class="key">
<p><b>The test that resolves most items:</b> a task can be delegated when the client is <b>stable</b>, the outcome is <b>predictable</b>, and the task is <b>routine</b> and does not require nursing judgement. If any one of those fails, it stays with the RN.</p>
</div>

<h2>Assistive personnel</h2>
<p>Generally appropriate:</p>
<ul>
  <li>Bathing, hygiene, oral care, grooming</li>
  <li>Feeding a client with no swallowing difficulty</li>
  <li>Ambulation and transfers for stable clients</li>
  <li>Positioning and turning</li>
  <li>Routine vital signs on a stable client</li>
  <li>Measuring intake and output, height and weight</li>
  <li>Simple documentation of the above</li>
</ul>
<p>Not appropriate: anything with an unstable client, anything requiring interpretation, any first-time assessment, and any teaching.</p>

<h2>Licensed practical nurses</h2>
<p>Scope varies by state and setting, and the exam works from a general standard. Commonly within scope:</p>
<ul>
  <li>Monitoring findings on a stable client, and reporting them</li>
  <li>Reinforcing teaching the RN has already provided</li>
  <li>Routine wound care and dressing changes</li>
  <li>Administering many oral and some parenteral medications</li>
  <li>Tracheostomy and catheter care</li>
  <li>Enteral feeding</li>
</ul>
<p>Typically outside scope: initial assessment, IV push medications in many jurisdictions, blood product administration, care planning, and the unstable client.</p>

<h2>The five rights of delegation</h2>
<ol>
  <li>Right <b>task</b></li>
  <li>Right <b>circumstance</b></li>
  <li>Right <b>person</b></li>
  <li>Right <b>direction and communication</b> — specific, not vague</li>
  <li>Right <b>supervision and evaluation</b></li>
</ol>
<p>The fourth is where exam items live. Telling assistive personnel to let you know if anything changes is not a delegation instruction. Telling them to report a heart rate above 110 or a systolic below 100 is.</p>

<h2>Assignment patterns</h2>
<p>When asked which client to assign to whom, work from stability: the most stable and predictable clients go to the least qualified appropriate staff member, and the RN keeps the newly admitted, the unstable, the post-operative day-zero client, and anyone needing assessment or teaching.</p>
<p>Two constraints appear often enough to watch for. A <b>float or agency nurse</b> should receive clients whose care is within general competence rather than unit-specific specialist care. A <b>pregnant staff member</b> should not be assigned clients receiving internal radiation therapy or with certain infectious conditions.</p>

<h2>Delegation is not transfer of accountability</h2>
<p>The RN who delegates remains accountable for the outcome. That is why options where the RN delegates and then does nothing further are usually wrong: appropriate delegation includes checking that the task was done and what the result was.</p>
`,
    faq: [
      { q: "What can be delegated to unlicensed assistive personnel?", a: "Routine tasks for stable clients with predictable outcomes that require no nursing judgement — hygiene, feeding a client without swallowing difficulty, ambulation, positioning, routine vital signs, and intake and output." },
      { q: "What can never be delegated by an RN?", a: "Assessment requiring clinical judgement, nursing diagnosis, planning, evaluation of outcomes, teaching that requires assessing understanding, and the care of unstable clients." },
      { q: "What are the five rights of delegation?", a: "Right task, right circumstance, right person, right direction and communication, and right supervision and evaluation. Vague instructions fail the fourth right and are a common wrong answer." },
    ],
  },

  {
    slug: "therapeutic-communication",
    topic: "Test-taking skill",
    title: "Therapeutic communication: picking the right response",
    h1: "Therapeutic communication answers",
    description: "The response patterns that are almost always correct, the ones that are almost always wrong, and why false reassurance fails every time.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN includes psychosocial integrity items where the wrong answer is comfortable and the right one is harder.",
    body: `
<p>Therapeutic communication items are among the most predictable on the exam, because the correct answer follows a small number of patterns. Once you can spot them, these become some of the fastest questions you will answer.</p>

<h2>What correct answers do</h2>
<ul>
  <li><b>Stay with the client's feeling</b> rather than moving to the problem. <i>You sound frightened.</i></li>
  <li><b>Use open-ended invitations.</b> <i>Tell me more about that.</i></li>
  <li><b>Reflect and restate</b> so the client hears themselves. <i>You are saying you feel like a burden.</i></li>
  <li><b>Offer presence.</b> <i>I will sit with you.</i></li>
  <li><b>Seek clarification.</b> <i>I am not sure I understand what you mean by that.</i></li>
  <li><b>Acknowledge without judging.</b> <i>This has been a hard week for you.</i></li>
  <li><b>Use silence.</b> Frequently correct and frequently rejected by candidates because it feels passive.</li>
</ul>

<div class="key">
<p><b>The single most reliable test:</b> does the response keep the client talking, or does it close the conversation? Correct answers open. Reassurance, advice and explanation all close — however kind they sound.</p>
</div>

<h2>What wrong answers do</h2>
<table>
  <tr><th>Pattern</th><th>Example</th><th>Why it fails</th></tr>
  <tr><td>False reassurance</td><td>Everything will be fine.</td><td>Dismisses the feeling and makes a promise the nurse cannot keep.</td></tr>
  <tr><td>Giving advice</td><td>What you should do is...</td><td>Removes the client's autonomy.</td></tr>
  <tr><td>Asking why</td><td>Why do you feel that way?</td><td>Demands justification and reads as confrontation.</td></tr>
  <tr><td>Changing the subject</td><td>Let us talk about your discharge plan.</td><td>Avoids the distress the client raised.</td></tr>
  <tr><td>Minimising</td><td>Everyone feels that way before surgery.</td><td>Tells the client their feeling is unremarkable.</td></tr>
  <tr><td>Defending</td><td>Your nurse was very busy.</td><td>Takes the institution's side against the client.</td></tr>
  <tr><td>Approval or disapproval</td><td>That is the right attitude.</td><td>Makes the nurse the judge of acceptable feelings.</td></tr>
  <tr><td>Deflecting to someone else</td><td>You should discuss that with your doctor.</td><td>Passes the client along rather than responding.</td></tr>
</table>

<h2>Why false reassurance is the most tempting trap</h2>
<p>It sounds caring, it is what people say in ordinary life, and in the moment it is what many of us would want to say. That is exactly why it is written into so many items. If an option would comfort you and requires no further conversation, look at it harder.</p>

<h2>Safety overrides communication</h2>
<p>One important exception: when a client expresses thoughts of self-harm or harm to others, the priority shifts from exploring feelings to <b>direct assessment of risk and immediate safety</b>. Asking plainly whether the client has a plan is the correct nursing action — it is not intrusive, and avoiding the question does not protect anyone.</p>

<h2>A quick screen</h2>
<p>When two options both look therapeutic, choose the one that is more specific to what this client actually said. Generic empathy is better than false reassurance, but a response that reflects the client's own words is better still.</p>
`,
    faq: [
      { q: "What makes a response therapeutic on the NCLEX?", a: "It stays with the client's feeling, is open-ended, and keeps the conversation going. Reflecting, restating, offering presence, seeking clarification and using silence are all reliably correct patterns." },
      { q: "Why is 'why' a poor therapeutic question?", a: "It asks the client to justify their feelings, which tends to read as confrontational and puts them on the defensive. Open invitations such as 'tell me more about that' get further." },
      { q: "What should the nurse do if a client expresses suicidal thoughts?", a: "Assess risk directly, including asking whether the client has a plan, and ensure immediate safety. Safety overrides exploratory communication techniques, and asking about a plan does not increase risk." },
    ],
  },

  {
    slug: "dosage-calculation-formulas",
    topic: "Test-taking skill",
    title: "Dosage calculation: the formulas that cover it",
    h1: "Dosage calculation without the panic",
    description: "The three formulas that cover almost every NCLEX calculation, how to handle weight-based and IV rate problems, and where rounding goes wrong.",
    published: "2026-08-03",
    updated: "2026-08-03",
    cta: "PulseRN has an on-screen calculator and worked solutions on every dosage item, so you can see where a calculation went wrong.",
    body: `
<p>Dosage calculation frightens people out of proportion to its difficulty. There are only a few formulas, the arithmetic is deliberately manageable, and the errors that cost marks are nearly always about setup or units rather than about mathematics.</p>

<h2>The core formula</h2>
<p><b>Desired over Have, times Quantity.</b></p>
<p>Amount to give equals the dose you want, divided by the dose you have on hand, multiplied by the quantity that dose comes in.</p>
<p>If an order is for 500 mg and the supply is 250 mg per tablet, then 500 divided by 250, times 1 tablet, gives 2 tablets.</p>

<h2>Weight-based doses</h2>
<p>Two steps, in this order:</p>
<ol>
  <li>Convert weight to kilograms if it is given in pounds — <b>divide by 2.2</b>.</li>
  <li>Multiply the prescribed dose per kilogram by the client's weight in kilograms.</li>
</ol>
<p>Then, if needed, apply Desired over Have to convert that dose into a volume.</p>

<div class="key">
<p><b>Convert units before you calculate, never during.</b> The overwhelming majority of dosage errors are unit errors: pounds left unconverted, milligrams treated as grams, an hourly rate confused with a total volume. Write the units next to every number and make sure they cancel.</p>
</div>

<h2>IV flow rates</h2>
<p><b>By pump, in millilitres per hour:</b> total volume divided by total hours.</p>
<p>1,000 mL over 8 hours gives 125 mL/hour.</p>
<p><b>By gravity, in drops per minute:</b> volume in millilitres, times the drop factor, divided by the time in minutes.</p>
<p>1,000 mL over 8 hours with a drop factor of 15 becomes 1,000 times 15, divided by 480 minutes, which is about 31 drops per minute.</p>
<p>Drops per minute are always rounded to a whole number — you cannot deliver a fraction of a drop.</p>

<h2>Conversions worth knowing without thinking</h2>
<table>
  <tr><th>From</th><th>To</th></tr>
  <tr><td>1 kg</td><td>2.2 lb</td></tr>
  <tr><td>1 g</td><td>1,000 mg</td></tr>
  <tr><td>1 mg</td><td>1,000 mcg</td></tr>
  <tr><td>1 L</td><td>1,000 mL</td></tr>
  <tr><td>1 tsp</td><td>5 mL</td></tr>
  <tr><td>1 tbsp</td><td>15 mL</td></tr>
  <tr><td>1 oz</td><td>30 mL</td></tr>
</table>

<h2>Rounding and format</h2>
<ul>
  <li>Follow the rounding the item specifies. If it asks for the nearest tenth, give a tenth.</li>
  <li>Use a leading zero for values below one — <b>0.5 mg</b>, never .5 mg, which is misread as 5.</li>
  <li>Never use a trailing zero — <b>5 mg</b>, never 5.0 mg, which is misread as 50.</li>
  <li>Enter only the number unless the item asks for a unit.</li>
</ul>
<p>Those two zero rules are safety conventions, not style preferences, and they are examinable in their own right.</p>

<h2>The sense check that catches disasters</h2>
<p>Before entering an answer, ask whether it is plausible. Half a tablet, two tablets, 125 mL per hour — these are ordinary. Fourteen tablets, or an infusion at 1,200 mL per hour, is a signal that something was set up upside down. In practice a nurse who calculates an implausible dose stops and rechecks, and the exam rewards the same instinct.</p>
`,
    faq: [
      { q: "What formula is used for dosage calculation?", a: "Desired over Have times Quantity: divide the dose you want by the dose on hand, then multiply by the quantity that dose comes in. Weight-based problems add a step of converting pounds to kilograms first." },
      { q: "How do I calculate IV drip rate?", a: "Multiply the volume in millilitres by the drop factor, then divide by the time in minutes. Round drops per minute to a whole number. For a pump in millilitres per hour, divide total volume by total hours." },
      { q: "How many kilograms is a pound?", a: "There are 2.2 pounds in a kilogram, so divide pounds by 2.2 to get kilograms. Doing this conversion before starting the calculation prevents the most common dosage error." },
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
