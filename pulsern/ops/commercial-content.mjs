import { createHash } from "node:crypto";

export const COMMERCIAL_POLICY_VERSION = 1;
export const COMMERCIAL_VERIFIED_AT = "2026-08-30";
const SITE = "https://www.pulsern.app";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const COMMERCIAL_SOURCES = {
  pulseHome: {
    id: "pulsern-home-2026-08-30", publisher: "PulseRN", title: "PulseRN product overview",
    url: `${SITE}/`, accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Public product description, features, free access, authorship, and limitations",
  },
  pulsePricing: {
    id: "pulsern-pricing-2026-08-30", publisher: "PulseRN", title: "PulseRN pricing",
    url: `${SITE}/pricing/`, accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Access-plan prices, question-bank quantities, and included self-assessments",
  },
  pulseHow: {
    id: "pulsern-how-it-works-2026-08-30", publisher: "PulseRN", title: "How PulseRN works",
    url: `${SITE}/how-it-works/`, accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Adaptive practice, review, spaced repetition, and readiness limitations",
  },
  pulseAbout: {
    id: "pulsern-about-2026-08-30", publisher: "PulseRN", title: "About PulseRN",
    url: `${SITE}/about/`, accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Creator identity, RN verification, clinical review, and content ownership",
  },
  pulseLegal: {
    id: "pulsern-legal-2026-08-30", publisher: "PulseRN", title: "PulseRN terms, privacy, and educational disclaimer",
    url: `${SITE}/legal/`, accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "AI-tutor limitations, lab-reference qualification, privacy, and educational-use boundary",
  },
  uworldCourse: {
    id: "uworld-nclex-rn-course-2026-08-30", publisher: "UWorld", title: "UWorld NCLEX-RN Prep Course",
    url: "https://nursing.uworld.com/nclex-rn/", accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Course features, question counts, access periods, public prices, RN team, assessments, and UAsk prompt allowances",
    expectedMarkers: ["3,400+", "UAsk", "40+"],
  },
  uworldAi: {
    id: "uworld-uask-2026-08-30", publisher: "UWorld", title: "UAsk — UWorld Nursing AI Assistant",
    url: "https://nursing.uworld.com/features/uask/", accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Personalized NCLEX and nursing-study explanations and stated educational role",
    expectedMarkers: ["UAsk", "AI", "NCLEX"],
  },
  archerPackages: {
    id: "archer-nclex-rn-packages-2026-08-30", publisher: "Archer Review", title: "Archer Review NCLEX-RN package comparison",
    url: "https://nurses.archerreview.com/nclex-rn/discounted-combo", accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "QBank, CAT, video, live-review, readiness-assessment, package-price, and repeat-tester support descriptions",
    expectedMarkers: ["3,100+", "Q-Bank + CAT", "Intense PREP"],
  },
  archerReadiness: {
    id: "archer-readiness-assessment-2026-08-30", publisher: "Archer Review", title: "Archer NCLEX Readiness Assessment",
    url: "https://nurses.archerreview.com/features/archer-readiness-assessment", accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "85-question readiness-assessment description and four-consecutive-assessment recommendation",
    expectedMarkers: ["85-question", "Readiness Assessment", "four"],
  },
  kaplanCourse: {
    id: "kaplan-nclex-course-2026-08-30", publisher: "Kaplan Test Prep", title: "Kaplan NCLEX Review and Test Prep",
    url: "https://www.kaptest.com/nclex", accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Practice and course package prices, QBank quantities, CATs, AI tutor, classes, and guarantee qualification",
    expectedMarkers: ["AI Tutor", "Computer Adaptive", "Decision Tree"],
  },
  kaplanPractice: {
    id: "kaplan-nclex-practice-2026-08-30", publisher: "Kaplan Test Prep", title: "Kaplan NCLEX Practice Tests and Questions",
    url: "https://www.kaptest.com/nclex/practice/computer-adaptive-test", accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "QBank, AI tutor, three CATs, flashcards, mobile access, and public practice-package prices",
    expectedMarkers: ["Qbank", "AI Tutor", "Computer Adaptive"],
  },
};

const sourceList = (ids) => `<section aria-labelledby="sources"><h2 id="sources">Sources checked</h2><p class="meta">Competitor facts were checked against provider-owned pages on <time datetime="${COMMERCIAL_VERIFIED_AT}">${COMMERCIAL_VERIFIED_AT}</time>. Prices and packages can change; verify the provider page before buying.</p><ul class="sources">${ids.map((id) => {
  const source = COMMERCIAL_SOURCES[id];
  return `<li id="source-${source.id}"><a href="${source.url}" rel="external noopener">${source.title}</a> — ${source.publisher}; ${source.locator}; accessed <time datetime="${source.accessedAt}">${source.accessedAt}</time>.</li>`;
}).join("")}</ul></section>`;

const table = (caption, rows) => `<div class="table-wrap" role="region" aria-label="${caption}" tabindex="0"><table><caption>${caption}</caption><thead><tr><th scope="col">Decision point</th><th scope="col">PulseRN</th><th scope="col">Competitor</th><th scope="col">How to interpret it</th></tr></thead><tbody>${rows.map(([label, pulse, competitor, meaning]) => `<tr><th scope="row">${label}</th><td>${pulse}</td><td>${competitor}</td><td>${meaning}</td></tr>`).join("")}</tbody></table></div>`;

const disclosure = `<div class="callout"><strong>How this comparison works:</strong> PulseRN publishes this page about its own product and therefore has a commercial interest. The table uses provider-owned public pages, separates observed facts from interpretation, gives competitors credit for capabilities they document, and does not use affiliate links, paid placement, star ratings, pass predictions, or a universal “winner.” Read the <a href="/compare/methodology/">comparison methodology</a>.</div>`;

const pages = [
  {
    slug: "compare", title: "Compare NCLEX-RN preparation options", eyebrow: "Choose by fit", h1: "Compare NCLEX preparation without a manufactured winner.",
    description: "Compare PulseRN with UWorld, Archer Review, and Kaplan using dated provider sources, transparent criteria, current public pricing, and learner-fit guidance.",
    intent: { primary: "compare NCLEX prep courses", secondary: ["NCLEX prep comparison", "NCLEX question bank comparison"], audience: "NCLEX-RN candidates", risk: "commercial" },
    sources: ["pulseHome", "pulsePricing", "uworldCourse", "archerPackages", "kaplanCourse"],
    claims: [
      { id: "compare-sourced-method", statement: "The comparison uses dated provider-owned public sources and no affiliate placement.", sourceIds: ["pulseHome", "uworldCourse", "archerPackages", "kaplanCourse"] },
    ],
    body: `<p class="lead">The useful question is not “Which company says it is best?” It is “Which study system matches the way I need to prepare?” PulseRN, UWorld, Archer Review, and Kaplan overlap in practice questions and exam preparation, but their public packages emphasize different kinds of support.</p>
      ${disclosure}
      <section><h2>Start with the decision you actually need to make</h2><div class="grid">
        <article class="card"><h3><a href="/compare/pulsern-vs-uworld/">PulseRN vs UWorld</a></h3><p>Compare two app-centered systems with adaptive practice and AI explanations. The meaningful differences are content-media depth, public evidence, lab access, pricing windows, and how accountability is presented.</p></article>
        <article class="card"><h3><a href="/compare/pulsern-vs-archer/">PulseRN vs Archer Review</a></h3><p>Compare PulseRN’s integrated self-directed workflow with Archer’s high-volume QBank, readiness assessments, videos, and optional live-support packages.</p></article>
        <article class="card"><h3><a href="/compare/pulsern-vs-kaplan/">PulseRN vs Kaplan</a></h3><p>Compare a focused RN-created study application with Kaplan’s larger course system, proprietary strategy instruction, classes, CAT practice, and guarantee terms.</p></article>
        <article class="card"><h3><a href="/compare/best-nclex-question-banks/">Best NCLEX question banks</a></h3><p>Use a criteria-first shortlist instead of relying on an undisclosed ranking. Compare questions, rationales, adaptive practice, AI support, assessments, and review tools.</p></article>
        <article class="card"><h3><a href="/compare/best-affordable-nclex-prep/">Best affordable NCLEX preparation</a></h3><p>Compare current public entry prices and what each package includes. The lowest sticker price is not always the lowest cost for the features a learner will actually use.</p></article>
        <article class="card"><h3><a href="/compare/best-nclex-app-repeat-test-takers/">Best NCLEX apps for repeat test-takers</a></h3><p>Prioritize error repair, new-question availability, realistic practice, support level, and a plan that responds to the previous attempt without promising an outcome.</p></article>
      </div></section>
      <section><h2>PulseRN’s fit in one paragraph</h2><div class="card"><p>PulseRN is built and clinically owned by a working registered nurse. Inside one study app, learners can practice adaptively, revisit missed questions, use spaced-repetition cards, open a searchable lab-value reference, ask educational NCLEX or nursing-concept questions, and request a different AI explanation after answering. AI assists the study experience but is not presented as a clinician, a human reviewer, or a pass predictor.</p></div></section>
      <section><h2>What this hub does not decide</h2><p>It does not determine which provider has the “best” clinical content, which learner will pass, or whether a higher price creates a better outcome. UWorld documents a large RN author team and extensive visual and video resources. Archer documents high question volume, numerous readiness assessments, and live-support options. Kaplan documents strategy instruction, classes, AI support, and CAT practice. PulseRN emphasizes a simpler RN-owned workflow, direct lab access, broad in-app study questions, and conservative claims.</p></section>
      ${sourceList(["pulseHome", "pulsePricing", "uworldCourse", "archerPackages", "kaplanCourse"])}`,
    faq: [
      { q: "Does PulseRN rank itself first?", a: "No. These pages compare documented features and learner fit. They do not assign unsupported overall scores or guarantee outcomes." },
      { q: "Are the comparison links affiliate links?", a: "No. PulseRN does not receive a commission when a reader visits a cited competitor page." },
    ],
  },
  {
    slug: "compare/methodology", title: "NCLEX prep comparison methodology", eyebrow: "Transparent criteria", h1: "How PulseRN compares NCLEX preparation products.",
    description: "Read PulseRN's comparison methodology for provider sourcing, pricing dates, feature labels, conflicts of interest, corrections, and educational limitations.",
    intent: { primary: "NCLEX prep comparison methodology", secondary: ["how NCLEX courses are compared"], audience: "NCLEX-RN candidates", risk: "commercial" },
    sources: ["pulseHome", "pulsePricing", "uworldCourse", "archerPackages", "kaplanCourse"],
    claims: [{ id: "method-provider-sources", statement: "Provider-owned pages are the primary evidence for competitor features and prices.", sourceIds: ["uworldCourse", "archerPackages", "kaplanCourse"] }],
    body: `<p class="lead">PulseRN is comparing a product it owns with products it does not own. That conflict cannot be erased, so this method makes it visible and limits what the comparison is allowed to claim.</p>
      ${disclosure}
      <section><h2>Evidence hierarchy</h2><ol><li><strong>Provider-owned product and pricing pages</strong> are the primary source for current features, quantities, access periods, prices, and guarantee terms.</li><li><strong>Official exam materials</strong> support NCLEX-format or policy statements when they appear.</li><li><strong>PulseRN’s public product, pricing, editorial, and legal pages</strong> support statements about PulseRN.</li><li>Third-party rankings, anonymous comments, affiliate reviews, and copied comparison tables are not used as factual authority for these pages.</li></ol></section>
      <section><h2>What the labels mean</h2><div class="card"><p><strong>Included</strong> means the cited provider page explicitly lists the capability in the relevant package. <strong>Not confirmed on the cited page</strong> means PulseRN did not find the capability in that specific public evidence; it does not prove the capability is absent everywhere. <strong>Varies by package</strong> means the provider presents materially different access by tier or duration.</p></div></section>
      <section><h2>Pricing rules</h2><p>Prices are recorded with an observation date. Temporary discounts are not treated as permanent prices. Where a public page shows a list price and a promotion, the comparison gives the list price priority and notes that promotions may change. Taxes, financing, institutional discounts, renewals, add-ons, and eligibility conditions may affect the actual checkout amount.</p></section>
      <section><h2>No universal winner</h2><p>A learner who wants a large visual library may reasonably value UWorld. A learner prioritizing inexpensive question volume or frequent readiness forms may value Archer. A learner who wants structured strategy instruction or live teaching may value Kaplan. A learner who wants a focused RN-created app with a built-in lab reference, broad educational nursing Q&amp;A, adaptive practice, and transparent clinical governance may value PulseRN. The methodology permits all four conclusions.</p></section>
      <section><h2>Claims the comparison refuses to make</h2><ul><li>No product is called guaranteed to produce a pass.</li><li>Provider pass-rate statements are not converted into head-to-head outcome rankings.</li><li>Question counts are not treated as proof of question quality.</li><li>A missing public feature is not labeled absent unless the provider explicitly says so.</li><li>PulseRN’s AI is not described as a clinician or substitute for current course, laboratory, institutional, or patient-care guidance.</li><li>“Best” pages identify the best fit for stated needs; they do not manufacture an objective first-place award.</li></ul></section>
      <section><h2>Freshness, correction, and accountability</h2><p>Every page displays its verification date and links the cited provider pages. The release gate checks source reachability and expected product markers. A material change requires updating the fact, page date, source evidence, and content digest. Correction requests may be sent to <a href="mailto:sheldon@pulsern.app">sheldon@pulsern.app</a>.</p><p class="meta">Editorial owner: <a href="/about/#sheldon-bennett-rn">Sheldon Bennett, RN</a>. Commercial comparisons are editorial product content, not clinical approval or medical advice.</p></section>
      ${sourceList(["pulseHome", "pulsePricing", "uworldCourse", "archerPackages", "kaplanCourse"])}`,
    faq: [{ q: "Does a missing feature mean a competitor does not offer it?", a: "No. Unless a provider explicitly states that a feature is unavailable, the comparison says only that it was not confirmed in the cited public evidence." }],
  },
  {
    slug: "compare/pulsern-vs-uworld", title: "PulseRN vs UWorld for NCLEX-RN prep", eyebrow: "Head-to-head fit", h1: "PulseRN vs UWorld: which study workflow fits you?",
    description: "Compare PulseRN and UWorld NCLEX-RN prep by public pricing, question-bank scale, AI tutoring, lab access, RN accountability, videos, and assessments.",
    intent: { primary: "PulseRN vs UWorld", secondary: ["UWorld alternative for NCLEX", "PulseRN or UWorld"], audience: "NCLEX-RN candidates", risk: "commercial" },
    sources: ["pulseHome", "pulsePricing", "pulseHow", "pulseAbout", "pulseLegal", "uworldCourse", "uworldAi"],
    claims: [
      { id: "uworld-public-scale", statement: "UWorld publicly lists up to 3,400+ questions, videos, visual rationales, CAT practice, up to six self-assessments, and a 40+ RN/educator team.", sourceIds: ["uworldCourse"] },
      { id: "both-ai", statement: "Both products publicly describe an in-product AI study assistant.", sourceIds: ["pulseHome", "uworldAi"] },
      { id: "pulse-labs-rn", statement: "PulseRN documents a searchable lab reference and a verified working-RN creator and reviewer.", sourceIds: ["pulseHome", "pulseAbout", "pulseLegal"] },
    ],
    body: `<p class="lead">PulseRN and UWorld both combine NCLEX question practice with adaptive or CAT-style work, study tools, readiness signals, and AI explanations. The choice is less about a missing core feature and more about whether you want UWorld’s larger content-and-media ecosystem or PulseRN’s smaller, directly RN-owned study workflow with a built-in lab reference and broad nursing-study Q&amp;A.</p>
      ${disclosure}
      ${table("PulseRN and UWorld public-feature comparison", [
        ["Public 30-day price", "$99; one-day study pass is $0", "$149 list price; a promotion was displayed when checked", "Verify checkout pricing. PulseRN is lower for this observed 30-day comparison, but price alone does not measure content fit."],
        ["Question-bank scale", "Paid plans publicly list 3,100+ questions at 60/90 days and higher quantities on longer plans", "Publicly lists 2,900+ at 30 days and up to 3,400+ by duration", "Counts vary by access period and do not prove question quality."],
        ["AI study help", "AI explains answered questions differently; the in-app helper and lab search accept educational NCLEX and nursing-concept questions", "UAsk provides contextual NCLEX and nursing-study explanations; published prompt allowances vary by plan", "Both use AI meaningfully inside study. Neither AI should replace human clinical guidance."],
        ["Lab reference", "Searchable lab and vital-sign reference is available from the app’s quick actions", "Not confirmed on the cited UWorld course or UAsk pages", "Not confirmed does not mean unavailable elsewhere in UWorld."],
        ["Human accountability", "Created and clinically owned by Sheldon Bennett, RN, with public license verification and digest-bound guide reviews", "Public page states that 40+ practicing RNs and nurse educators write the content", "UWorld offers team scale; PulseRN offers direct named-owner traceability."],
        ["Teaching media", "Text rationales, AI re-explanations, guides, questions, cards, and cases", "Publicly lists visual rationales, illustrations, review videos, a notebook, a planner, flashcards, and a review book option", "UWorld is the stronger documented fit when a broad visual/video library is essential."],
        ["Readiness", "Standardized 85-question forms and a deliberately qualified educational estimate", "Up to six 100-question self-assessments with a publicly described readiness prediction", "PulseRN avoids outcome prediction; UWorld makes stronger validation claims on its own page."],
      ])}
      <section><h2>Where PulseRN is the clearer fit</h2><p>Choose PulseRN when you want one web app that keeps a searchable lab reference close to practice, lets you ask educational NCLEX or nursing-concept questions without leaving the workflow, returns missed material for repair, and identifies one working RN as the product’s clinical owner. The AI boundary is explicit: explanations are study aids, not individually reviewed clinical advice.</p><p>PulseRN also gives a one-day study-content pass without a credit card and publishes every current plan on one pricing page. Its readiness language is deliberately conservative. That may appeal to learners who prefer a study signal over a product claim about their exam outcome.</p></section>
      <section><h2>Where UWorld is the clearer fit</h2><p>Choose UWorld when its documented visual rationales, illustrations, videos, digital notebook, planner, review book, peer benchmarking, and large RN/educator team justify the price for you. UWorld also publishes a much larger learner-and-review footprint. PulseRN should not pretend that a newer product has already matched that institutional scale.</p></section>
      <section><h2>Bottom line</h2><div class="card"><p><strong>PulseRN:</strong> focused RN-owned app, direct lab access, broad study Q&amp;A, adaptive practice, spaced repetition, and conservative readiness language.</p><p><strong>UWorld:</strong> mature content ecosystem with extensive visuals, videos, planner/notebook tools, a large author team, and substantial public outcome and learner evidence.</p><p>Try PulseRN’s free day if its workflow sounds right. Choose UWorld if its broader media and evidence base are the capabilities you expect to use. No product choice can guarantee an NCLEX result.</p></div></section>
      ${sourceList(["pulseHome", "pulsePricing", "pulseHow", "pulseAbout", "pulseLegal", "uworldCourse", "uworldAi"])}`,
    faq: [
      { q: "Is PulseRN cheaper than UWorld?", a: "For the public 30-day prices observed on August 30, 2026, PulseRN listed $99 and UWorld listed $149 before a displayed promotion. Prices change, so verify both provider pages." },
      { q: "Do both PulseRN and UWorld include AI help?", a: "Yes. Both publicly describe in-product AI explanations. Their allowances, context, safeguards, and surrounding study tools differ." },
    ],
  },
  {
    slug: "compare/pulsern-vs-archer", title: "PulseRN vs Archer Review for NCLEX-RN", eyebrow: "Head-to-head fit", h1: "PulseRN vs Archer Review: app workflow or high-volume package?",
    description: "Compare PulseRN and Archer Review by QBank size, public pricing, AI study help, lab access, readiness assessments, videos, live support, and repeat-tester fit.",
    intent: { primary: "PulseRN vs Archer Review", secondary: ["Archer Review alternative", "PulseRN or Archer NCLEX"], audience: "NCLEX-RN candidates", risk: "commercial" },
    sources: ["pulseHome", "pulsePricing", "pulseHow", "pulseAbout", "pulseLegal", "archerPackages", "archerReadiness"],
    claims: [
      { id: "archer-packages", statement: "Archer publicly lists 3,100+ questions, 30+ readiness/CAT exams, video packages, and live-support tiers.", sourceIds: ["archerPackages"] },
      { id: "archer-readiness", statement: "Archer describes 85-question readiness assessments and recommends four consecutive high or very-high results.", sourceIds: ["archerReadiness"] },
      { id: "pulse-integrated-tools", statement: "PulseRN documents AI nursing-study Q&A, lab reference, spaced repetition, adaptive practice, and RN ownership in one app.", sourceIds: ["pulseHome", "pulseHow", "pulseAbout", "pulseLegal"] },
    ],
    body: `<p class="lead">Archer Review’s public packages emphasize question volume, repeated readiness/CAT opportunities, videos, and progressively more live support. PulseRN emphasizes an integrated daily study loop: adaptive questions, missed-question repair, spaced repetition, an always-available lab reference, educational nursing Q&amp;A, and named RN ownership.</p>
      ${disclosure}
      ${table("PulseRN and Archer Review public-feature comparison", [
        ["Basic one-month entry", "$99 for 30 days; one-day study pass is $0", "QBank + CAT publicly listed from $79 for one month when checked", "Archer has the lower observed paid entry price. PulseRN offers a free first day and different included tools."],
        ["Question bank", "Public plans list 3,100+ questions at 60/90 days and higher quantities on longer plans", "Public package page lists 3,100+ questions", "The documented quantities are comparable; evaluate rationales, workflow, and unused-question rules too."],
        ["Readiness practice", "A stated number of standardized 85-question self-assessments by plan", "Publicly lists 30+ readiness assessments and CAT exams; readiness forms use 85 questions", "Archer is the stronger documented fit for learners who want frequent formal readiness forms."],
        ["AI and lab help", "Educational nursing Q&amp;A, answer re-explanations, and a searchable lab/vital reference", "An equivalent broad AI study assistant or built-in lab reference was not confirmed on the cited package pages", "This is a documented PulseRN workflow advantage, not proof that Archer has no adjacent capability."],
        ["Videos and live support", "Self-directed app; no live class package is listed", "Video packages, a three-day live review, daily live topics, and intensive support are listed by tier", "Archer is the clearer fit when scheduled human instruction or accountability is required."],
        ["Content ownership", "Named working-RN creator and reviewer with public verification", "Public pages describe instructors, tutors, and package support", "PulseRN makes one accountable owner especially visible; Archer offers a broader instruction system."],
      ])}
      <section><h2>Choose PulseRN when the study surface matters most</h2><p>PulseRN keeps practice, explanations, labs, cards, case studies, study questions, and progress signals together. A learner can open the lab reference from the same app, ask a concept question, request a different explanation after answering, and return to missed material without assembling several resources. The product’s clinical owner is a working RN whose public guides are bound to exact review and source evidence.</p></section>
      <section><h2>Choose Archer when repetition and human support matter most</h2><p>Archer publicly offers substantially more readiness/CAT opportunities than PulseRN and sells packages that add videos, live review, interactive cases, and tutor guidance. Its Intense PREP tier is explicitly positioned for repeat test-takers or high-anxiety learners wanting more accountability. PulseRN should not label its self-directed app superior for someone who knows that scheduled instruction is necessary.</p></section>
      <section><h2>Bottom line</h2><div class="card"><p><strong>PulseRN:</strong> choose the integrated RN-owned app when lab lookup, broad nursing-study Q&amp;A, adaptive daily work, spaced repetition, and conservative claims are central.</p><p><strong>Archer:</strong> choose the documented package breadth when low entry price, frequent readiness/CAT use, videos, live review, or intensive support is central.</p><p>Neither provider’s readiness label can guarantee an actual exam outcome.</p></div></section>
      ${sourceList(["pulseHome", "pulsePricing", "pulseHow", "pulseAbout", "pulseLegal", "archerPackages", "archerReadiness"])}`,
    faq: [
      { q: "Is PulseRN less expensive than Archer Review?", a: "Not at the observed one-month paid entry level. Archer listed a $79 QBank + CAT option, while PulseRN listed $99 for 30 days and also offered a one-day free study pass." },
      { q: "Which offers more readiness assessments?", a: "Archer publicly lists 30+ readiness assessments and CAT exams. PulseRN includes a smaller stated number of never-repeated self-assessments by plan." },
    ],
  },
  {
    slug: "compare/pulsern-vs-kaplan", title: "PulseRN vs Kaplan for NCLEX-RN prep", eyebrow: "Head-to-head fit", h1: "PulseRN vs Kaplan: focused app or structured course system?",
    description: "Compare PulseRN and Kaplan NCLEX-RN prep by price, QBank scale, AI tutoring, lab access, CAT practice, strategy classes, RN accountability, and support.",
    intent: { primary: "PulseRN vs Kaplan NCLEX", secondary: ["Kaplan NCLEX alternative", "PulseRN or Kaplan"], audience: "NCLEX-RN candidates", risk: "commercial" },
    sources: ["pulseHome", "pulsePricing", "pulseHow", "pulseAbout", "pulseLegal", "kaplanCourse", "kaplanPractice"],
    claims: [
      { id: "kaplan-practice", statement: "Kaplan publicly lists a QBank, AI tutor, CAT practice, and pharmacy flashcards in its practice tiers; quantities and prices vary by current package presentation.", sourceIds: ["kaplanCourse", "kaplanPractice"] },
      { id: "kaplan-course", statement: "Kaplan course tiers add classes, strategy instruction, content review, and a conditional guarantee.", sourceIds: ["kaplanCourse"] },
      { id: "pulse-tools", statement: "PulseRN documents a built-in lab reference, broad nursing-study Q&A, adaptive practice, spaced repetition, and named RN ownership.", sourceIds: ["pulseHome", "pulseHow", "pulseAbout", "pulseLegal"] },
    ],
    body: `<p class="lead">Kaplan’s public NCLEX offering spans question-bank practice, CATs, an AI tutor, strategy instruction, content review, live classes, tutoring, and a conditional guarantee. PulseRN is a narrower self-directed product designed around one integrated app and a directly accountable working-RN creator.</p>
      ${disclosure}
      ${table("PulseRN and Kaplan public-feature comparison", [
        ["Practice entry price", "$99 for 30 days; one-day study pass is $0", "$99 list price for CAT + QBank when checked; temporary promotions may apply", "The observed list-price entry is similar. Compare duration and included tools before using price as a tiebreaker."],
        ["Question practice", "Public plans list 3,100+ questions at 60/90 days and higher quantities on longer plans", "Public pages list a QBank and larger course inventories, with quantities varying by package presentation", "Package definitions differ, so a single count is not an apples-to-apples quality measure."],
        ["Adaptive/CAT work", "Adaptive QBank plus standardized 85-question self-assessments", "Three full-length CATs in listed practice and course packages", "Both support test-like practice; the surrounding scoring and study workflows differ."],
        ["AI and lab access", "AI answer re-explanations, educational nursing-study Q&amp;A, and searchable lab/vital reference", "Kaplan lists an AI tutor with definitions, examples, explanations, recommendations, and flashcard creation; a lab reference was not confirmed on the cited pages", "Kaplan documents broader study-resource recommendations; PulseRN documents direct lab access."],
        ["Instruction", "Self-directed app and public RN-reviewed guides; no live classes", "Recorded strategy classes, an NCLEX Channel, live-online options, and tutoring are available by package", "Kaplan is the clearer fit for formal instruction and a scheduled course structure."],
        ["Accountability", "Created and clinically owned by a named, publicly verified working RN", "Kaplan describes nurse educators and expert faculty", "PulseRN emphasizes direct creator traceability; Kaplan emphasizes an established faculty system."],
      ])}
      <section><h2>Choose PulseRN for a direct, self-directed nursing workflow</h2><p>PulseRN is designed for the learner who wants to open one app, practice at an adaptive level, repair misses, ask an educational nursing question, check a lab reference, and use spaced review. Its public pages explicitly separate RN accountability from AI assistance. The AI can explain or clarify, but it is not the accountable clinical reviewer and it does not create an outcome guarantee.</p></section>
      <section><h2>Choose Kaplan for instruction and strategy structure</h2><p>Kaplan is the stronger documented fit when you want a proprietary test-taking strategy, scheduled or recorded teaching, a live channel, faculty interaction, tutoring options, or a conditional money-back guarantee. Those capabilities represent a different product category from a focused self-directed app, and their higher course-tier prices should be compared with the instruction included.</p></section>
      <section><h2>Bottom line</h2><div class="card"><p><strong>PulseRN:</strong> a focused working-RN-created study app with lab reference, broad nursing-study Q&amp;A, adaptive practice, cards, cases, and transparent limitations.</p><p><strong>Kaplan:</strong> a larger course and practice system with CATs, an AI tutor, strategy teaching, classes, content review, and higher-support options.</p><p>The right choice depends on whether you reliably study independently or need external structure. A guarantee’s eligibility terms should be read in full before purchase.</p></div></section>
      ${sourceList(["pulseHome", "pulsePricing", "pulseHow", "pulseAbout", "pulseLegal", "kaplanCourse", "kaplanPractice"])}`,
    faq: [
      { q: "Do PulseRN and Kaplan both include AI tutoring?", a: "Yes. Both publicly describe AI study help. PulseRN also documents broad nursing-study questions and a built-in lab reference; Kaplan documents resource recommendations and flashcard creation." },
      { q: "Does PulseRN offer live classes?", a: "No live class package is publicly listed. Kaplan offers live, recorded, channel, and tutoring options depending on the package." },
    ],
  },
  {
    slug: "compare/best-nclex-question-banks", title: "Best NCLEX question banks compared", eyebrow: "Criteria before rankings", h1: "The best NCLEX question bank is the one you will review deeply.",
    description: "Compare NCLEX question banks from PulseRN, UWorld, Archer Review, and Kaplan by question scale, rationales, adaptive practice, AI, assessments, and price.",
    intent: { primary: "best NCLEX question banks", secondary: ["NCLEX QBank comparison", "best NCLEX practice questions"], audience: "NCLEX-RN candidates", risk: "commercial" },
    sources: ["pulseHome", "pulsePricing", "pulseHow", "pulseAbout", "uworldCourse", "archerPackages", "kaplanCourse", "kaplanPractice"],
    claims: [
      { id: "qbank-counts", statement: "The compared providers publicly list question inventories or packages in roughly the low-thousands, with definitions and access periods that differ.", sourceIds: ["pulsePricing", "uworldCourse", "archerPackages", "kaplanCourse"] },
      { id: "qbank-tools", statement: "The providers differentiate through rationales, CAT/adaptive work, assessments, AI, videos, classes, cards, and other review tools.", sourceIds: ["pulseHow", "uworldCourse", "archerPackages", "kaplanPractice"] },
    ],
    body: `<p class="lead">There is no defensible universal first-place QBank. The useful shortlist depends on whether you need visual teaching, high-volume readiness practice, formal strategy instruction, or an integrated RN-owned app with lab lookup and broad nursing-study Q&amp;A.</p>
      ${disclosure}
      <section><h2>Four credible fits</h2><div class="grid"><article class="card"><h3>PulseRN: integrated study workflow</h3><p>Best fit when you want adaptive practice, missed-question repair, spaced cards, case studies, an always-available lab reference, broad educational nursing questions, and named RN ownership in one app.</p></article><article class="card"><h3>UWorld: visual explanation ecosystem</h3><p>Best fit when visual rationales, illustrations, videos, a notebook, planner, flashcards, extensive public evidence, and a large RN/educator team are worth the price.</p></article><article class="card"><h3>Archer: question and readiness volume</h3><p>Best fit when lower-cost basic access, 3,100+ publicly listed questions, frequent readiness/CAT opportunities, and optional video or live tiers match your plan.</p></article><article class="card"><h3>Kaplan: strategy and course structure</h3><p>Best fit when you want a QBank plus CATs, an AI tutor, a proprietary strategy method, classes, a content channel, or tutoring options.</p></article></div></section>
      <section><h2>Compare what happens after you answer</h2><p>A large bank can create shallow activity if a learner only counts completed questions. Before buying, inspect whether the product explains every option, helps you identify a reasoning error, returns missed concepts, lets you ask a follow-up, and makes it practical to revisit the idea later. PulseRN uses rationales, AI re-explanations, missed-question review, cards, and topic guides. UWorld documents detailed visual rationales. Archer documents rationales and video-enhanced tiers. Kaplan documents detailed explanations, AI support, and resource recommendations.</p></section>
      <section><h2>Question counts need context</h2><p>PulseRN’s public paid plans list 3,100+ questions for 60- and 90-day access and higher quantities for longer access. UWorld lists totals that grow from 2,900+ to 3,400+ by duration. Archer lists 3,100+ in its RN QBank packages. Kaplan’s public pages describe a QBank and larger course inventories, while quantities can vary by package presentation. These are provider-defined totals: some may include assessment questions, course activities, or access-specific inventory. Do not treat the largest number as audited proof of the best bank.</p></section>
      <section><h2>A six-question buying test</h2><ol><li>Do I need text explanations, visual teaching, video, live instruction, or a combination?</li><li>Will I use a general AI study assistant, or do I only need question-specific explanations?</li><li>Do I need a lab reference inside the same study surface?</li><li>How many formal CAT or readiness forms will I realistically complete and review?</li><li>Am I paying for a duration I can use rather than a quantity I will never finish?</li><li>Does the provider explain authorship, limitations, corrections, and outcome claims clearly?</li></ol></section>
      <section><h2>Our shortlist, without a fake winner</h2><div class="card"><p><strong>Choose PulseRN</strong> for integration and direct RN accountability. <strong>Choose UWorld</strong> for documented visual/media depth and mature evidence. <strong>Choose Archer</strong> for a lower observed basic entry price and high readiness volume. <strong>Choose Kaplan</strong> for structured strategy and instruction.</p><p>A QBank can support preparation, but no question count, assessment label, AI response, or course can guarantee an NCLEX result.</p></div></section>
      ${sourceList(["pulseHome", "pulsePricing", "pulseHow", "pulseAbout", "uworldCourse", "archerPackages", "kaplanCourse", "kaplanPractice"])}`,
    faq: [
      { q: "Which NCLEX question bank has the most questions?", a: "Public totals vary by plan and by what each provider counts. UWorld lists up to 3,400+, Archer lists 3,100+, PulseRN lists up to 3,401+ on longer plans, and Kaplan lists different totals by practice or course package." },
      { q: "Should I choose a QBank by question count?", a: "No. Also evaluate rationale quality, error review, adaptive or CAT practice, follow-up support, content fit, access duration, and how consistently you will review." },
    ],
  },
  {
    slug: "compare/best-affordable-nclex-prep", title: "Best affordable NCLEX preparation compared", eyebrow: "Value without hype", h1: "Affordable NCLEX preparation starts with the features you will use.",
    description: "Compare current public entry prices and value from PulseRN, UWorld, Archer Review, and Kaplan without affiliate rankings, hidden pass promises, or false cheapest claims.",
    intent: { primary: "best affordable NCLEX preparation", secondary: ["affordable NCLEX prep", "cheap NCLEX question bank"], audience: "NCLEX-RN candidates", risk: "commercial" },
    sources: ["pulseHome", "pulsePricing", "uworldCourse", "archerPackages", "kaplanCourse"],
    claims: [
      { id: "observed-entry-prices", statement: "Observed public entry prices differ by duration, package, and promotion, with Archer lower than PulseRN at the basic one-month paid level when checked.", sourceIds: ["pulsePricing", "uworldCourse", "archerPackages", "kaplanCourse"] },
      { id: "pulse-free-day", statement: "PulseRN publicly lists a one-day free study-content pass without a readiness self-assessment.", sourceIds: ["pulseHome", "pulsePricing"] },
    ],
    body: `<p class="lead">“Affordable” should mean the lowest total cost for the study support you will actually use—not whichever page displays the smallest promotional number. On August 30, 2026, Archer had the lowest observed basic one-month paid entry among these four. PulseRN offered the only documented one-day study-content pass in this comparison and a $99 30-day plan.</p>
      ${disclosure}
      <section><h2>Observed public entry points</h2><div class="table-wrap" role="region" aria-label="Observed NCLEX preparation entry prices" tabindex="0"><table><caption>Provider prices observed August 30, 2026</caption><thead><tr><th scope="col">Provider</th><th scope="col">Observed entry</th><th scope="col">Important context</th></tr></thead><tbody><tr><th scope="row">PulseRN</th><td>$0 one-day study pass; $99 for 30 days</td><td>The free day excludes readiness self-assessments. Paid plans include a stated assessment count.</td></tr><tr><th scope="row">UWorld</th><td>$149 list price for 30 days; a promotion was displayed</td><td>Package includes a duration-specific question total, media/tools, and one self-assessment.</td></tr><tr><th scope="row">Archer Review</th><td>$79 for one-month QBank + CAT when checked</td><td>Videos and live support require higher tiers; pricing pages frequently show promotions.</td></tr><tr><th scope="row">Kaplan</th><td>$99 list price for CAT + QBank when checked</td><td>Temporary promotions may reduce the price. Classes and larger course systems cost more.</td></tr></tbody></table></div></section>
      <section><h2>When PulseRN is good value</h2><p>PulseRN can be a strong value when you would otherwise combine a QBank with separate flashcards, a lab reference, an AI nursing-study tool, case studies, readiness forms, and study guides. Those capabilities live in one browser-based app created and clinically owned by a working RN. The free first day lets a learner test the workflow before buying, although one day is not a meaningful preparation plan by itself.</p></section>
      <section><h2>When another provider may be the better value</h2><p>Archer’s observed basic package is less expensive than PulseRN’s 30-day paid plan and documents far more readiness/CAT opportunities. UWorld may be worth the higher price for a learner who will consistently use visual rationales, videos, the planner, notebook, book option, and its larger content team. Kaplan may be worth more when strategy instruction, recorded or live teaching, a content channel, tutoring, or guarantee eligibility replaces other purchases.</p></section>
      <section><h2>Costs that comparison tables often hide</h2><ul><li><strong>Unused access:</strong> a six-month discount is not value if the exam is in six weeks.</li><li><strong>Add-ons:</strong> extra assessments, extensions, books, tutoring, or higher-support packages can change the total.</li><li><strong>Promotion expiry:</strong> a crossed-out price may disappear before checkout.</li><li><strong>Guarantee conditions:</strong> a money-back promise may require completion, timing, first-attempt status, or other eligibility rules.</li><li><strong>Tool duplication:</strong> buying a separate app, cards, lab reference, or tutor can make a low QBank price less affordable.</li><li><strong>Review time:</strong> the cheapest unused bank creates no study value.</li></ul></section>
      <section><h2>Practical recommendation by budget need</h2><div class="card"><p><strong>Need to test the interface before paying:</strong> start with PulseRN’s one-day free study pass and any competitor trial currently listed.</p><p><strong>Need the lowest observed one-month basic QBank/CAT price:</strong> Archer was lower when checked.</p><p><strong>Need one integrated app with labs and broad study Q&amp;A:</strong> compare PulseRN’s $99 plan with the cost of assembling those capabilities elsewhere.</p><p><strong>Need extensive video or live instruction:</strong> compare UWorld, Archer’s higher tiers, and Kaplan courses by the teaching you will actually attend.</p></div></section>
      ${sourceList(["pulseHome", "pulsePricing", "uworldCourse", "archerPackages", "kaplanCourse"])}`,
    faq: [
      { q: "What was the cheapest paid option when this page was checked?", a: "Archer Review listed a $79 one-month QBank + CAT option. PulseRN and Kaplan listed $99 entry plans, while UWorld's 30-day list price was $149 before a displayed promotion." },
      { q: "Does PulseRN offer free NCLEX prep?", a: "PulseRN offers a one-day free pass to study content without a readiness self-assessment. Its public guides and sample-question sets are also available without signing in." },
    ],
  },
  {
    slug: "compare/best-nclex-app-repeat-test-takers", title: "Best NCLEX apps for repeat test-takers", eyebrow: "Rebuild from evidence", h1: "The best repeat-tester app helps you change the next attempt.",
    description: "Compare PulseRN, UWorld, Archer Review, and Kaplan for NCLEX repeat test-takers by error repair, new practice, support, AI, readiness, labs, and structure.",
    intent: { primary: "best NCLEX application for repeat test-takers", secondary: ["NCLEX repeat test prep app", "failed NCLEX best question bank"], audience: "NCLEX-RN repeat test-takers", risk: "commercial" },
    sources: ["pulseHome", "pulsePricing", "pulseHow", "pulseAbout", "uworldCourse", "archerPackages", "archerReadiness", "kaplanCourse"],
    claims: [
      { id: "repeat-support-options", statement: "The compared products document different repeat-preparation tools, including error review, resets or new forms, intensive support, CATs, classes, and AI study help.", sourceIds: ["pulseHow", "uworldCourse", "archerPackages", "kaplanCourse"] },
      { id: "archer-intense", statement: "Archer explicitly positions Intense PREP for repeat test-takers or learners wanting added support and accountability.", sourceIds: ["archerPackages"] },
      { id: "pulse-repair", statement: "PulseRN documents missed-question review, adaptive sequencing, educational nursing Q&A, lab reference, and never-repeated assessment forms.", sourceIds: ["pulseHome", "pulseHow"] },
    ],
    body: `<p class="lead">A repeat attempt needs more than another pile of questions. The study system should help identify what failed, repair reasoning errors, supply enough unfamiliar practice, and provide the level of structure the learner lacked—without treating an app score as a promise about the next exam.</p>
      ${disclosure}
      <section><h2>Start with the previous attempt, not a brand name</h2><p>Use the candidate performance information available to you, instructor feedback, and your own study record to separate content gaps, clinical-judgment errors, pacing, anxiety, stamina, and inconsistent review. An app cannot diagnose the cause from a single readiness label. The right product is the one that changes the weakest part of the previous process.</p></section>
      <section><h2>Four different repeat-tester fits</h2><div class="grid"><article class="card"><h3>PulseRN: daily error repair</h3><p>Missed questions remain available for review until corrected. Adaptive practice and spaced cards revisit weak knowledge, while the AI can re-explain an answered item or respond to an educational nursing question. A lab reference stays in the same app.</p></article><article class="card"><h3>UWorld: rebuild with teaching depth</h3><p>Visual rationales, videos, a planner, notes, flashcards, CAT practice, and self-assessments can support a broad rebuild. Longer packages publicly list a one-time reset option, so examine reset eligibility and timing.</p></article><article class="card"><h3>Archer: frequent assessment and accountability</h3><p>Archer documents 30+ readiness/CAT opportunities and explicitly positions Intense PREP for repeat test-takers or high-anxiety learners seeking tutor guidance, group sessions, and feedback.</p></article><article class="card"><h3>Kaplan: strategy and instruction reset</h3><p>Kaplan combines QBank and CAT work with an AI tutor, its Decision Tree strategy, classes, a content channel, and tutoring tiers. This may fit someone whose previous self-study lacked structure.</p></article></div></section>
      <section><h2>Why PulseRN may fit a repeat test-taker</h2><p>PulseRN does not erase a miss just because the rationale was opened. The review pool is designed to keep missed questions active until they are answered correctly, and adaptive sequencing uses demonstrated performance to guide future practice. When a concept is unclear, the learner can ask for another explanation or use the app’s broader study Q&amp;A. The searchable lab reference reduces context switching during lab-heavy review.</p><p>The product’s readiness result is deliberately called an estimate. Ten standardized 85-question forms exist in the system, and a form is not repeated to the same account; the number included depends on the plan. That design prioritizes unfamiliar assessment material but offers fewer formal forms than Archer publicly lists.</p></section>
      <section><h2>When PulseRN is not enough</h2><p>If the previous attempt involved severe test anxiety, repeated scheduling failures, weak foundational teaching, or an inability to maintain self-directed study, an app-only plan may not be the right intervention. Archer’s intensive tier, Kaplan’s live or tutoring options, an educator, or another structured human-support plan may be a better fit. PulseRN should not turn its RN ownership or AI features into a claim that human instruction is unnecessary.</p></section>
      <section><h2>A repeat-attempt buying checklist</h2><ol><li>Does the product provide unfamiliar questions or assessments rather than only replaying memorized material?</li><li>Can you identify and revisit reasoning errors, not just view a percentage?</li><li>Will you actually use the available AI, videos, classes, tutoring, cards, or planner?</li><li>Does the access window match the new test date and required retest interval?</li><li>Are readiness and pass claims qualified, and are guarantee conditions realistic for you?</li><li>What human help will you use if the same weak pattern appears again?</li></ol></section>
      <section><h2>Bottom line</h2><div class="card"><p><strong>PulseRN</strong> is a strong fit for a self-directed repeat tester who wants persistent error repair, adaptive work, labs, broad educational nursing Q&amp;A, and transparent RN ownership. <strong>Archer</strong> has the clearest documented high-frequency assessment and intensive-support option. <strong>Kaplan</strong> offers a structured strategy-and-instruction reset. <strong>UWorld</strong> offers the deepest documented visual/media review ecosystem among these choices.</p><p>No app can determine why a learner did not pass or guarantee that the next attempt will be successful.</p></div></section>
      ${sourceList(["pulseHome", "pulsePricing", "pulseHow", "pulseAbout", "uworldCourse", "archerPackages", "archerReadiness", "kaplanCourse"])}`,
    faq: [
      { q: "Which NCLEX app is best after a failed attempt?", a: "There is no universal winner. PulseRN fits self-directed error repair, Archer documents intensive repeat-tester support, Kaplan offers strategy and instruction, and UWorld offers extensive visual and media review." },
      { q: "Can a readiness assessment guarantee the next NCLEX result?", a: "No. Treat readiness results as study evidence, not an outcome guarantee, and combine them with human guidance and the reasons the previous plan did not work." },
    ],
  },
];

export const COMMERCIAL_PAGES = pages.map((page) => ({ ...page, updated: COMMERCIAL_VERIFIED_AT, published: COMMERCIAL_VERIFIED_AT }));

export function commercialEvidence() {
  return {
    schemaVersion: COMMERCIAL_POLICY_VERSION,
    generatedAt: `${COMMERCIAL_VERIFIED_AT}T00:00:00.000Z`,
    editorialOwner: { name: "Sheldon Bennett, RN", url: `${SITE}/about/#sheldon-bennett-rn` },
    disclosure: "PulseRN publishes comparisons about its own product. No affiliate links, paid placement, star ratings, or outcome guarantees are used.",
    pages: COMMERCIAL_PAGES.map((page) => {
      const sources = page.sources.map((id) => COMMERCIAL_SOURCES[id]);
      return {
        route: `/${page.slug}/`, intent: page.intent, published: page.published, updated: page.updated,
        contentSha256: sha256(JSON.stringify({ title: page.title, h1: page.h1, description: page.description, body: page.body, faq: page.faq ?? [] })),
        sourceSetSha256: sha256(JSON.stringify(sources.map(({ id, url, locator, accessedAt }) => ({ id, url, locator, accessedAt })))),
        sources,
        claims: page.claims.map((claim) => ({ ...claim, sourceIds: claim.sourceIds.map((id) => COMMERCIAL_SOURCES[id].id) })),
      };
    }),
  };
}
