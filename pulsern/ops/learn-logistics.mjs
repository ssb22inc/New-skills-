/* Current NCLEX registration, scheduling, results, and test-center logistics.
   These pages summarize first-party NCSBN/Pearson rules rather than clinical
   care. They remain digest-bound review candidates until the review ledger
   records a human decision for the exact content and source set. */

export const LOGISTICS_ARTICLES = [
  {
    slug: "how-to-register-for-the-nclex",
    topic: "Registration and results",
    title: "How to register for the NCLEX-RN",
    h1: "How to register for the NCLEX-RN: the official sequence",
    description: "A current step-by-step NCLEX-RN registration guide covering the nursing regulatory body, Pearson registration, eligibility, ATT, and scheduling.",
    published: "2026-08-31",
    updated: "2026-08-31",
    cta: "PulseRN can help organize study and practice after registration; it cannot determine eligibility, issue an ATT, or schedule an NCLEX appointment.",
    body: `
<p>NCLEX-RN registration is not one form submitted to one organization. It is a sequence involving the nursing regulatory body (NRB) where you are applying for licensure and Pearson, the examination administrator. NCSBN tells candidates to complete every step and to confirm the requirements of the NRB where they seek to practice.</p>

<div class="key" role="note" aria-labelledby="registration-boundary">
<h2 id="registration-boundary" style="margin-top:0">Use your regulator's instructions</h2>
<p>This page summarizes official information checked on August 31, 2026. Eligibility, application documents, licensure fees, deadlines and accommodations are controlled by the relevant NRB. Use its instructions and your Pearson correspondence as the final authority.</p>
</div>

<h2>The six-step registration sequence</h2>
<div class="table-wrap" role="region" aria-label="NCLEX registration sequence" tabindex="0">
<table>
  <caption>Who handles each NCLEX registration step</caption>
  <thead><tr><th scope="col">Step</th><th scope="col">Action</th><th scope="col">Responsible organization</th></tr></thead>
  <tbody>
    <tr><th scope="row">1</th><td>Apply for nursing licensure or registration and satisfy that jurisdiction's requirements.</td><td>Your nursing regulatory body</td></tr>
    <tr><th scope="row">2</th><td>Register for the NCLEX with the required program code, matching name, email and payment.</td><td>Pearson</td></tr>
    <tr><th scope="row">3</th><td>Pay the examination registration fee and any applicable jurisdiction or scheduling charges.</td><td>Pearson and, separately, the NRB</td></tr>
    <tr><th scope="row">4</th><td>Wait for the NRB to declare eligibility and for Pearson to email the Authorization to Test (ATT).</td><td>NRB eligibility; Pearson ATT email</td></tr>
    <tr><th scope="row">5</th><td>Choose an available domestic or international testing location.</td><td>Pearson test-center network</td></tr>
    <tr><th scope="row">6</th><td>Schedule the appointment within the ATT validity dates and verify the confirmation email.</td><td>Pearson</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this sequence:</b> the official <a href="#source-ncsbn-registration-process-2026">NCLEX registration process</a> and <a href="#source-ncsbn-pearson-registration-2026">Pearson registration instructions</a>.</p>

<h2>Name, program code and email checks</h2>
<p>The first and last name used during Pearson registration must match the identification presented at the appointment. Pearson registration also requires a program code and an email address. NCSBN says Pearson correspondence is sent by email and candidates should normally receive a registration acknowledgment within two days.</p>
<ul>
  <li>Find the program code through the official registration page rather than guessing it.</li>
  <li>Review spelling before payment, especially the registered first and last names.</li>
  <li>Keep access to the registered email account and check spam or filtering rules.</li>
  <li>If the acknowledgment does not arrive, contact Pearson Candidate Services before submitting another registration.</li>
</ul>

<h2>Registration does not equal eligibility</h2>
<p>Paying Pearson does not make a candidate eligible. The NRB must declare eligibility. An NCLEX registration remains open for 365 days while awaiting that decision. If eligibility is not granted during that period, the registration and examination fee are forfeited under the published NCSBN rules. Candidates also may not hold two open registrations for the same examination type; an overlapping registration can be denied without a refund.</p>

<h2>What happens after eligibility</h2>
<p>After eligibility and Pearson registration are complete, Pearson sends the ATT by email. The ATT contains validity dates and is required before scheduling. NCSBN says the average ATT period is 90 days, but the issuing NRB specifies the actual period. Schedule against the dates in your own ATT rather than the average.</p>
`,
    faq: [
      { q: "Do I apply to the nursing board or register with Pearson first?", a: "The process requires both an application to the nursing regulatory body and registration with Pearson. Follow the regulator's instructions for sequencing; accommodations should be requested from the regulator before Pearson registration." },
      { q: "Does paying Pearson make me eligible for the NCLEX?", a: "No. The nursing regulatory body must declare eligibility. Pearson issues the ATT only after eligibility and registration are complete." },
      { q: "How long can an NCLEX registration remain open?", a: "NCSBN states that a registration remains open for 365 days while waiting for eligibility. If eligibility is not granted during that period, the registration and fee are forfeited." },
      { q: "When can I schedule the NCLEX?", a: "Only after receiving the Authorization to Test email. Schedule within the validity dates shown in that specific ATT." },
    ],
  },
  {
    slug: "nclex-authorization-to-test-att",
    topic: "Registration and results",
    title: "NCLEX Authorization to Test (ATT): what it means",
    h1: "NCLEX Authorization to Test: when it arrives and what to check",
    description: "Understand the NCLEX Authorization to Test email, eligibility prerequisites, validity dates, scheduling limits, and what to do when an ATT has not arrived.",
    published: "2026-08-31",
    updated: "2026-08-31",
    cta: "PulseRN can support your preparation while you wait for an ATT, but it has no access to NRB eligibility decisions or Pearson registration records.",
    body: `
<p>An Authorization to Test (ATT) is the Pearson email that permits an eligible, registered candidate to schedule the NCLEX. It is not the nursing license, an examination result, or a general approval without an expiration date.</p>

<div class="key" role="note" aria-labelledby="att-boundary">
<h2 id="att-boundary" style="margin-top:0">Your ATT controls your dates</h2>
<p>NCSBN describes an average ATT length of 90 days, but the nursing regulatory body sets the actual validity period. The dates in your own ATT are controlling. Confirm them directly and do not plan around the average.</p>
</div>

<h2>What must happen before the ATT</h2>
<ol>
  <li>You apply for licensure or registration through the appropriate NRB.</li>
  <li>You complete NCLEX registration with Pearson.</li>
  <li>The NRB determines that you are eligible to test.</li>
  <li>Pearson sends the ATT to the email address used during registration.</li>
</ol>
<p>Because eligibility belongs to the NRB, Pearson registration alone cannot generate the ATT. Because Pearson sends the email, a current and accurately entered email address matters.</p>
<p class="source-note"><b>Evidence for this sequence:</b> Authorization to Test on the <a href="#source-ncsbn-registration-process-2026">official registration-process page</a> and the <a href="#source-ncsbn-nclex-faqs">NCLEX FAQ</a>.</p>

<h2>What to verify when it arrives</h2>
<div class="table-wrap" role="region" aria-label="NCLEX ATT verification checklist" tabindex="0">
<table>
  <caption>ATT details to review before scheduling</caption>
  <thead><tr><th scope="col">Check</th><th scope="col">Why it matters</th><th scope="col">If something is wrong</th></tr></thead>
  <tbody>
    <tr><th scope="row">Name and examination type</th><td>The registration, appointment and acceptable identification must align.</td><td>Contact the responsible organization before scheduling or testing.</td></tr>
    <tr><th scope="row">Validity dates</th><td>The appointment must occur inside the stated window.</td><td>Do not assume the window can be extended; contact the NRB.</td></tr>
    <tr><th scope="row">ATT number and contact details</th><td>Telephone scheduling and accommodated appointments may require ATT information.</td><td>Use the official Pearson/NRB contact path, not a third-party service.</td></tr>
    <tr><th scope="row">Approved accommodations</th><td>Approved arrangements must be reflected in the scheduling process.</td><td>Call the number on the ATT and request the NCLEX Accommodations Coordinator.</td></tr>
  </tbody>
</table>
</div>

<h2>If the ATT has not arrived</h2>
<p>NCSBN's FAQ directs candidates to the NRB when eligibility may not yet have been granted or required materials may be incomplete. Also verify that Pearson registration was acknowledged and that the registered email is accessible. Do not create a duplicate Pearson registration: NCSBN warns that candidates may not have two registrations for the same examination type open simultaneously and that a second registration can be denied with a non-refundable fee.</p>

<h2>Schedule before the window becomes narrow</h2>
<p>NCSBN warns that waiting can substantially limit date selection and that a test center might not have a seat before a nearly expired ATT ends. If that happens, the published rule requires a new registration and examination fee. Receiving an ATT therefore starts a scheduling window; it does not reserve a seat.</p>
`,
    faq: [
      { q: "What is an NCLEX ATT?", a: "It is Pearson's Authorization to Test email, issued after the nursing regulatory body declares eligibility and Pearson registration is complete. It is required before scheduling." },
      { q: "How long is an NCLEX ATT valid?", a: "The nursing regulatory body sets the validity period. NCSBN says the average is 90 days, but candidates must follow the exact dates in their own ATT." },
      { q: "Who should I contact if my ATT has not arrived?", a: "Check the Pearson registration acknowledgment and contact the nursing regulatory body to confirm eligibility and required materials. Avoid submitting a duplicate registration." },
      { q: "Can I schedule before receiving the ATT?", a: "No. NCSBN states that candidates may not schedule an NCLEX appointment until they have received the ATT." },
    ],
  },
  {
    slug: "schedule-reschedule-cancel-nclex",
    topic: "Registration and results",
    title: "How to schedule, reschedule, or cancel the NCLEX",
    h1: "Schedule, reschedule, or cancel the NCLEX without losing your fee",
    description: "Current NCLEX scheduling rules for ATT holders, confirmation emails, rescheduling deadlines, weekends, international centers, and accommodated appointments.",
    published: "2026-08-31",
    updated: "2026-08-31",
    cta: "PulseRN can help build a preparation calendar around a confirmed test date; it cannot change a Pearson appointment.",
    body: `
<p>You can schedule the NCLEX only after receiving the ATT. Pearson provides online and telephone scheduling, and the appointment must fall within the ATT validity dates. Availability is not guaranteed merely because the ATT remains valid.</p>

<div class="key" role="note" aria-labelledby="scheduling-boundary">
<h2 id="scheduling-boundary" style="margin-top:0">Get a confirmation</h2>
<p>A message left on an answering machine does not satisfy the published cancellation or rescheduling rule. Complete the change through the Pearson website or with a Pearson agent and obtain the confirmation email.</p>
</div>

<h2>Scheduling the first appointment</h2>
<p>Sign in to Pearson, choose a preferred test center, date and time, and verify the confirmation email. NCSBN states that first-time candidates will be offered an appointment within 30 days of the scheduling request; repeat candidates will be offered an appointment beginning 45 days after the prior attempt. A candidate may decline the offered appointment and choose a later available date.</p>
<p>These are appointment-offer rules, not promises that every preferred center or date will be available. Scheduling early generally preserves more choices, while waiting until the ATT is close to expiration can leave no available seat inside the validity window.</p>

<h2>Changing or canceling a domestic appointment</h2>
<div class="table-wrap" role="region" aria-label="NCLEX appointment change deadlines" tabindex="0">
<table>
  <caption>Published notice rules checked August 31, 2026</caption>
  <thead><tr><th scope="col">Appointment day</th><th scope="col">Required action</th><th scope="col">Timing</th></tr></thead>
  <tbody>
    <tr><th scope="row">Tuesday–Friday</th><td>Use Pearson online or speak with Pearson Candidate Services.</td><td>At least one full business day and 24 hours before the local appointment time.</td></tr>
    <tr><th scope="row">Saturday–Monday</th><td>Use Pearson online or speak with Pearson Candidate Services.</td><td>No later than Friday and at least 24 hours before the local appointment time.</td></tr>
    <tr><th scope="row">National-holiday period</th><td>Account for office closures and complete the change earlier.</td><td>The normal deadline still applies; a closed office does not create an automatic exception.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this table:</b> Changing an Appointment on the official <a href="#source-ncsbn-scheduling-rules-2026">NCLEX scheduling page</a>.</p>

<h2>International and accommodated appointments</h2>
<p>Changes to an international appointment must be made by telephone with Pearson Candidate Services. Moving between international locations can preserve the international scheduling fee, but moving from international to domestic forfeits it; moving from domestic to international adds the non-refundable fee and applicable tax.</p>
<p>For an appointment with approved testing accommodations, call the number on the ATT and ask for the NCLEX Accommodations Coordinator. Do not assume a standard online change will preserve the approved arrangements.</p>

<h2>What happens after a missed appointment</h2>
<p>Failure to attend or to complete a timely cancellation or change forfeits the examination fee and any applicable scheduling fee. NCSBN states that the ATT is invalidated, a new registration and fee are required, and the missed examination is recorded as a case report visible to the NRB.</p>
`,
    faq: [
      { q: "How much notice is required to reschedule the NCLEX?", a: "At least one full business day and 24 hours before the local appointment time. For Saturday, Sunday, or Monday appointments, complete the change no later than Friday and at least 24 hours beforehand." },
      { q: "Does leaving Pearson a voicemail cancel my NCLEX?", a: "No. NCSBN states that a voicemail does not constitute notice. Complete the change online or with an agent and receive confirmation." },
      { q: "Can I change an international NCLEX appointment online?", a: "NCSBN says changes to international appointments must be made by calling Pearson Candidate Services." },
      { q: "What happens if I miss the NCLEX?", a: "The examination fee and applicable scheduling fee are forfeited, the ATT is invalidated, and a new registration and fee are required under the published rules." },
    ],
  },
  {
    slug: "nclex-fees-and-payment",
    topic: "Registration and results",
    title: "NCLEX fees and payment: current official costs",
    h1: "NCLEX fees and payment: what the exam can cost",
    description: "Current official NCLEX registration, international scheduling, change, refund, and planned 2027 fee information, with jurisdiction-specific limitations.",
    published: "2026-08-31",
    updated: "2026-08-31",
    cta: "PulseRN pricing is separate from NCLEX, Pearson, and nursing-regulatory-body fees; PulseRN cannot collect or refund examination charges.",
    body: `
<p>The total cost of becoming licensed is not the NCLEX registration fee alone. Depending on the jurisdiction and test location, a candidate may pay a nursing-regulatory-body application fee, the Pearson NCLEX registration fee, an international scheduling fee, taxes, and charges for certain registration changes.</p>

<div class="key" role="note" aria-labelledby="fee-boundary">
<h2 id="fee-boundary" style="margin-top:0">Time-sensitive prices</h2>
<p>The figures below were checked on August 31, 2026. The official page announces a fee change effective February 1, 2027. Verify the live NCSBN fee page and your NRB immediately before paying. PulseRN is not affiliated with NCSBN, Pearson or an NRB.</p>
</div>

<h2>Published fees before February 1, 2027</h2>
<div class="table-wrap" role="region" aria-label="Current NCLEX fees by licensure destination" tabindex="0">
<table>
  <caption>NCLEX fees shown by NCSBN on August 31, 2026</caption>
  <thead><tr><th scope="col">Fee</th><th scope="col">U.S. licensure</th><th scope="col">Canadian licensure</th><th scope="col">Australian licensure</th></tr></thead>
  <tbody>
    <tr><th scope="row">Registration</th><td>$200 USD</td><td>$360 CAD, excluding local taxes</td><td>$200 USD</td></tr>
    <tr><th scope="row">Additional international scheduling</th><td>$150 USD plus applicable VAT</td><td>$150 CAD plus applicable VAT</td><td>$150 USD plus applicable VAT</td></tr>
    <tr><th scope="row">Change NRB after registration</th><td>$50 USD</td><td>$50 CAD</td><td>Not applicable on the published table</td></tr>
    <tr><th scope="row">Change RN/PN examination type</th><td>$50 USD</td><td>Not applicable on the published table</td><td>Not applicable on the published table</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this table:</b> the official <a href="#source-ncsbn-fees-payment-2026">NCLEX Fees &amp; Payment page</a>. Local taxes and NRB licensure fees are separate.</p>

<h2>The announced 2027 change</h2>
<p>NCSBN's live fee page states that effective February 1, 2027, the registration fee will be $350 in the United States and Australia and $570 CAD in Canada. That is an announced future price, not the amount displayed for registrations before the effective date. Because fee implementation can change, confirm the live checkout and official page rather than relying on a saved screenshot.</p>

<h2>Payment and duplicate-registration risk</h2>
<p>The published Pearson registration options accept valid Visa, MasterCard or American Express credit, debit or prepaid cards. Schools, agencies or employers can use the official third-party-payment route. If confirmation does not arrive within two days, NCSBN directs the candidate to Pearson Candidate Services; submitting another registration before resolving the first can create a non-refundable duplicate fee.</p>

<h2>Refund boundaries</h2>
<p>NCSBN states that registration fees are not refunded for duplicate registrations, an untimely cancellation or change, or failure to appear. It also states that the international scheduling fee is non-refundable. Read the current policy before paying and preserve confirmation records for registrations and appointment changes.</p>
`,
    faq: [
      { q: "What is the U.S. NCLEX registration fee in 2026?", a: "The official NCSBN page showed $200 USD for candidates seeking U.S. licensure when checked on August 31, 2026. It announces a change to $350 effective February 1, 2027; verify the live page before payment." },
      { q: "Is there an extra international NCLEX fee?", a: "Yes. The published table shows an additional $150 international scheduling fee in the applicable currency, plus VAT where applicable." },
      { q: "Are nursing-board application fees included?", a: "No. Nursing regulatory body licensure or registration fees are separate and vary by jurisdiction." },
      { q: "Is the NCLEX fee refundable if I miss the appointment?", a: "The published NCSBN refund policy says no. Failure to appear and untimely changes or cancellations forfeit the registration fee, and the international scheduling fee is also non-refundable." },
    ],
  },
  {
    slug: "nclex-testing-accommodations",
    topic: "Registration and results",
    title: "How to request NCLEX testing accommodations",
    h1: "NCLEX testing accommodations: who to contact and when",
    description: "Current NCLEX accommodations process covering the nursing regulatory body, pre-registration timing, comfort aids, ATT review, and appointment changes.",
    published: "2026-08-31",
    updated: "2026-08-31",
    cta: "PulseRN can offer flexible study settings, but it does not evaluate disabilities, approve accommodations, or modify NCLEX appointments.",
    body: `
<p>The nursing regulatory body (NRB)—not PulseRN, Pearson alone, or the test center—controls the candidate-specific NCLEX accommodation decision. The official NCLEX registration page directs candidates to request accommodations from the NRB before registering for the NCLEX with Pearson.</p>

<div class="key" role="note" aria-labelledby="accommodation-boundary">
<h2 id="accommodation-boundary" style="margin-top:0">This is process information, not legal advice</h2>
<p>Documentation, deadlines, available arrangements and appeal procedures vary by jurisdiction and individual decision. Contact the NRB where you are applying and follow its current instructions. Do not send medical records or disability documentation to PulseRN.</p>
</div>

<h2>The published sequence</h2>
<ol>
  <li>Apply for licensure or registration through the appropriate NRB.</li>
  <li>Request the accommodation from that NRB and follow its documentation and deadline requirements.</li>
  <li>Complete the NRB request before Pearson registration, as the official NCLEX registration page directs.</li>
  <li>Register with Pearson using information consistent with the NRB application.</li>
  <li>Review the ATT and approved scheduling instructions.</li>
  <li>Use the accommodations contact path on the ATT when scheduling or changing the appointment.</li>
</ol>
<p class="source-note"><b>Evidence for this process:</b> the official NCLEX <a href="#source-ncsbn-pearson-registration-2026">Pearson-registration page</a>, the <a href="#source-ncsbn-registration-process-2026">registration-process page</a>, the official <a href="#source-ncsbn-scheduling-rules-2026">scheduling page</a>, and Pearson VUE's dated <a href="#source-pearson-vue-comfort-aid-list-2024">Comfort Aid List</a>.</p>

<h2>Accommodations and comfort aids are not identical</h2>
<div class="table-wrap" role="region" aria-label="NCLEX accommodations and comfort aids comparison" tabindex="0">
<table>
  <caption>Two different pre-exam pathways</caption>
  <thead><tr><th scope="col">Path</th><th scope="col">Approval</th><th scope="col">Action</th></tr></thead>
  <tbody>
    <tr><th scope="row">Testing accommodation</th><td>Controlled by the NRB using its requirements and decision process.</td><td>Request it from the NRB before Pearson registration and follow that regulator's current instructions.</td></tr>
    <tr><th scope="row">Listed comfort aid</th><td>Some items do not require advance approval and are admitted after test-center inspection.</td><td>Check the current Pearson Comfort Aid List; do not assume an unlisted item qualifies.</td></tr>
  </tbody>
</table>
</div>
<p>Pearson VUE's current list includes qualified examples such as casts, hearing aids and insulin pumps among items admitted after visual inspection. Device-specific conditions apply, and some devices or testing channels require formal accommodation approval. A medical device being important does not by itself establish the test-center procedure; verify the live list and contact path in advance.</p>

<h2>Scheduling and changing an accommodated appointment</h2>
<p>The official scheduling page instructs candidates with approved accommodations to call the number on the ATT and ask for the NCLEX Accommodations Coordinator when changing an appointment. Preserve the approval and appointment confirmation records, and verify that the scheduled arrangements match the authorization before test day.</p>
`,
    faq: [
      { q: "Who approves NCLEX testing accommodations?", a: "The nursing regulatory body coordinates the accommodations process. Submit the request and required materials according to that regulator's instructions." },
      { q: "When should I request NCLEX accommodations?", a: "The official NCLEX registration page directs candidates to request accommodations from the NRB before registering for the NCLEX with Pearson. Follow the NRB's own documentation and deadline rules." },
      { q: "Do all medical or comfort items require preapproval?", a: "No. Some items on Pearson's current Comfort Aid List can be admitted after visual inspection. Check the live list rather than assuming an item is covered." },
      { q: "How do I change an accommodated NCLEX appointment?", a: "Call the number listed on the ATT and ask for the NCLEX Accommodations Coordinator, following the official scheduling instructions." },
    ],
  },
  {
    slug: "nclex-quick-results-vs-official-results",
    topic: "Registration and results",
    title: "NCLEX Quick Results vs. official results",
    h1: "NCLEX Quick Results and official results are not the same",
    description: "Learn when NCLEX Quick Results may appear, which jurisdictions participate, why they are unofficial, what they cost, and who issues official results.",
    published: "2026-08-31",
    updated: "2026-08-31",
    cta: "PulseRN cannot access, accelerate, infer, or verify an NCLEX result. Use Pearson and your nursing regulatory body for result information.",
    body: `
<p>NCLEX Quick Results are an optional, unofficial service available to some U.S. licensure candidates. Official results come only from the nursing regulatory body. Neither a commercial readiness score nor a test-day impression substitutes for either channel.</p>

<div class="key" role="note" aria-labelledby="results-boundary">
<h2 id="results-boundary" style="margin-top:0">Practice authorization boundary</h2>
<p>NCSBN states that Quick Results do not authorize a candidate to practice as a licensed or registered nurse. Only the NRB can issue the official result and licensure decision.</p>
</div>

<h2>Quick Results compared with official results</h2>
<div class="table-wrap" role="region" aria-label="NCLEX Quick Results and official results comparison" tabindex="0">
<table>
  <caption>Which result channel controls</caption>
  <thead><tr><th scope="col">Feature</th><th scope="col">Quick Results</th><th scope="col">Official results</th></tr></thead>
  <tbody>
    <tr><th scope="row">Issuer</th><td>Accessed through the Pearson candidate account.</td><td>Sent by the nursing regulatory body.</td></tr>
    <tr><th scope="row">Timing</th><td>May be available two business days after the exam.</td><td>NCSBN says the NRB sends them within six weeks.</td></tr>
    <tr><th scope="row">Availability</th><td>Only for eligible U.S. candidates whose NRB participates.</td><td>Every candidate's official result follows the NRB process.</td></tr>
    <tr><th scope="row">Status</th><td>Unofficial; does not authorize practice.</td><td>Official result and licensure channel.</td></tr>
    <tr><th scope="row">Published price</th><td>$7.95 when checked August 31, 2026, charged only when results are available.</td><td>NRB processes and charges vary.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this table:</b> the official <a href="#source-ncsbn-quick-results-2026">Quick Results page</a> and <a href="#source-ncsbn-results-retake">results page</a>.</p>

<h2>How the published Quick Results process works</h2>
<ol>
  <li>Sign in to the Pearson candidate account.</li>
  <li>Select Quick Results under the account options.</li>
  <li>If the service says a result is available, complete the purchase flow.</li>
  <li>Read the result on the receipt page, remembering that it remains unofficial.</li>
</ol>
<p>The list of participating NRBs can change. Check the current official Quick Results page instead of relying on an old state list. If the result is not available, do not use unofficial browser tricks, payment-card behavior, question count or perceived item difficulty to infer it.</p>

<h2>When to contact the NRB</h2>
<p>Official results are available only through the NRB. NCSBN says candidates should contact the NRB if more than six weeks have passed without receiving a result and should not call NCSBN, Pearson Candidate Services or the test center for the result itself.</p>
`,
    faq: [
      { q: "Are NCLEX Quick Results official?", a: "No. NCSBN explicitly labels them unofficial and states that they do not authorize practice. Official results come only from the nursing regulatory body." },
      { q: "When can Quick Results appear?", a: "For eligible candidates, the service may show unofficial results two business days after the examination." },
      { q: "How much do NCLEX Quick Results cost?", a: "The official page showed $7.95 when checked on August 31, 2026, with the card charged only if the result is available. Verify the live price before purchase." },
      { q: "Who should I contact if official results are late?", a: "Contact the nursing regulatory body if more than six weeks have passed without an official result." },
    ],
  },
  {
    slug: "how-to-read-nclex-candidate-performance-report",
    topic: "Registration and results",
    title: "How to read an NCLEX Candidate Performance Report",
    h1: "How to read your NCLEX Candidate Performance Report (CPR)",
    description: "Understand Below, Near, and Above the Passing Standard on an NCLEX CPR, what the report cannot diagnose, and how to turn it into a retake plan.",
    published: "2026-08-31",
    updated: "2026-08-31",
    cta: "PulseRN can organize practice by category and missed-question patterns; its analytics do not replace the official Candidate Performance Report.",
    body: `
<p>The NCLEX Candidate Performance Report (CPR) is an individualized two-page report sent to candidates who do not pass. It organizes performance indicators by test-plan content area and clinical-judgment categories. It is a planning signal, not a section-by-section scorecard.</p>

<div class="key" role="note" aria-labelledby="cpr-boundary">
<h2 id="cpr-boundary" style="margin-top:0">The NCLEX is not graded in sections</h2>
<p>NCSBN states that overall exam performance determines pass or fail. A category labeled Above the Passing Standard does not mean the candidate passed that independent section, and a CPR does not provide further diagnostic detail beyond the report.</p>
</div>

<h2>What the three indicators mean for planning</h2>
<div class="table-wrap" role="region" aria-label="NCLEX Candidate Performance Report indicators" tabindex="0">
<table>
  <caption>Using CPR categories without over-interpreting them</caption>
  <thead><tr><th scope="col">Indicator</th><th scope="col">Official planning implication</th><th scope="col">Responsible study response</th></tr></thead>
  <tbody>
    <tr><th scope="row">Below the Passing Standard</th><td>NCSBN identifies these as the greatest weaknesses.</td><td>Start remediation here, using the current test plan to identify the category scope.</td></tr>
    <tr><th scope="row">Near the Passing Standard</th><td>These follow the Below categories in NCSBN's suggested order.</td><td>Build consistency after the weakest areas; review reasoning, not only question volume.</td></tr>
    <tr><th scope="row">Above the Passing Standard</th><td>These are relative strengths, not permanent mastery.</td><td>Maintain proficiency while allocating more time to weaker categories.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for this framework:</b> the official <a href="#source-ncsbn-candidate-performance-report">Candidate Performance Report page</a> and the current <a href="#source-ncsbn-2026-rn-test-plan">RN Test Plan</a>.</p>

<h2>When the CPR is abbreviated</h2>
<p>If a candidate did not answer the minimum number of items, NCSBN says the candidate receives an abbreviated CPR that identifies how many items were answered and how many were required for evaluation. It does not provide the same category-level performance indicators.</p>

<h2>A four-step retake workflow</h2>
<ol>
  <li><b>Translate labels into categories.</b> Use the current test plan to define what each client-needs and clinical-judgment category includes.</li>
  <li><b>Start with Below.</b> Review content gaps and the reasoning behind missed questions before increasing volume.</li>
  <li><b>Move to Near.</b> Use mixed practice to determine whether improvement holds outside an isolated category set.</li>
  <li><b>Maintain Above.</b> Keep those categories in spaced mixed review rather than removing them entirely.</li>
</ol>
<p>A commercial readiness estimate can add practice feedback, but it should not be described as a conversion of the CPR or a guarantee of the next result. Use the report as one input alongside current knowledge gaps, question reasoning, pacing and the requirements of the NRB.</p>

<h2>Retake administration is separate</h2>
<p>The CPR does not itself authorize a retest. Contact the NRB, complete its required steps, register with Pearson, wait for a new ATT and schedule within the new validity period. The NCSBN policy permits a retake after 45 test-free days, but jurisdictions can impose stricter limits.</p>
`,
    faq: [
      { q: "Who receives an NCLEX CPR?", a: "NCSBN sends the individualized CPR to candidates who do not pass. Candidates who do not complete the minimum number of items receive an abbreviated version." },
      { q: "Is the NCLEX graded by content section?", a: "No. NCSBN states that overall performance determines pass or fail. CPR categories indicate relative strengths and weaknesses for preparation." },
      { q: "Which CPR area should I study first?", a: "NCSBN recommends concentrating first on categories labeled Below the Passing Standard, then Near, while continuing to maintain areas labeled Above." },
      { q: "Does an Above label guarantee that area is mastered?", a: "No. NCSBN specifically recommends continuing to study Above areas to maintain proficiency." },
    ],
  },
  {
    slug: "international-nclex-testing",
    topic: "Registration and results",
    title: "International NCLEX testing: locations, fees, and changes",
    h1: "International NCLEX testing: what changes outside domestic centers",
    description: "Official NCLEX international-testing guidance covering domestic definitions, available locations, scheduling fees, VAT, appointment changes, and ATT limits.",
    published: "2026-08-31",
    updated: "2026-08-31",
    cta: "PulseRN works wherever its service is available, but it does not operate NCLEX test centers or control international scheduling, fees, visas, or licensure eligibility.",
    body: `
<p>The NCLEX is offered through domestic and international Pearson test centers, but “international” depends on the licensure destination—not simply the candidate's citizenship or home address. The selected center can affect scheduling fees, taxes and how an appointment must be changed.</p>

<div class="key" role="note" aria-labelledby="international-boundary">
<h2 id="international-boundary" style="margin-top:0">Verify the live location list</h2>
<p>Test-center availability, temporary sites and country coverage can change. The official locator and your Pearson appointment confirmation control. This summary was checked on August 31, 2026 and is not immigration, travel, tax or licensure advice.</p>
</div>

<h2>Domestic depends on the licensure destination</h2>
<div class="table-wrap" role="region" aria-label="NCLEX domestic testing definitions" tabindex="0">
<table>
  <caption>How NCSBN defines domestic test centers</caption>
  <thead><tr><th scope="col">Licensure destination</th><th scope="col">Domestic center definition</th><th scope="col">International center</th></tr></thead>
  <tbody>
    <tr><th scope="row">United States</th><td>United States and listed U.S. territories.</td><td>A center outside those locations.</td></tr>
    <tr><th scope="row">Canada</th><td>Canadian provinces/territories and the mainland United States.</td><td>A center outside those locations.</td></tr>
    <tr><th scope="row">Australia</th><td>United States and listed U.S. territories under the current published definition.</td><td>A center outside those locations.</td></tr>
  </tbody>
</table>
</div>
<p class="source-note"><b>Evidence for these definitions:</b> the official <a href="#source-ncsbn-testing-locations-2026">NCLEX Testing Locations page</a>. Confirm the live table because geographic classifications can change.</p>

<h2>Scheduling cost and tax</h2>
<p>NCSBN's fee page lists an additional non-refundable international scheduling fee of $150 in the applicable USD or CAD category, plus value-added tax where applicable. This is separate from the examination registration fee, NRB application fees and travel expenses. Check the live fee table before selecting a center.</p>

<h2>Changing an international appointment</h2>
<p>NCSBN requires candidates to call Pearson Candidate Services to change an international appointment. Moving to another international center can preserve the international scheduling fee; moving to a domestic center forfeits it. Moving a domestic appointment to an international center adds the non-refundable fee and applicable VAT.</p>
<p>The same notice rules and ATT validity constraints still matter. A location change does not automatically extend an ATT, and a new center must have an available appointment within the validity window.</p>

<h2>Plan beyond the examination booking</h2>
<ul>
  <li>Confirm the NRB eligibility and identification rules for the licensure destination.</li>
  <li>Use the Pearson locator and appointment confirmation for the exact center address and availability.</li>
  <li>Research travel documents, entry permissions and local requirements through the relevant authorities.</li>
  <li>Budget separately for registration, international scheduling, tax, travel and lodging.</li>
  <li>Call Pearson for international appointment changes and retain the confirmation.</li>
</ul>
`,
    faq: [
      { q: "Is the NCLEX available outside the United States?", a: "Yes. NCSBN lists domestic and international Pearson test centers. Availability and the country list can change, so use the current official locator." },
      { q: "How much is the international NCLEX scheduling fee?", a: "The NCSBN table showed an additional $150 fee in the applicable USD or CAD category, plus VAT where applicable, when checked August 31, 2026." },
      { q: "Can I change an international NCLEX appointment online?", a: "No. NCSBN instructs candidates to call Pearson Candidate Services for changes to international appointments." },
      { q: "Does changing countries extend my ATT?", a: "No automatic extension is stated. The appointment still must be available inside the validity dates on the candidate's ATT." },
    ],
  },
];
