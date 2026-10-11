/* Build the public product and trust pages that search engines, answer engines,
   agents, and prospective learners need before entering the authenticated app. */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { PLANS, fmtUsd } from "../src/pricing.js";
import { COMMERCIAL_PAGES, COMMERCIAL_SOURCES, commercialEvidence, relatedCommercial } from "./commercial-content.mjs";
import { ATTRIBUTION_BOOT_TAG, writeAttributionBoot } from "./attribution-boot.mjs";

const SITE = "https://www.pulsern.app";
const AUTHOR = `${SITE}/about/#sheldon-bennett-rn`;
const REVIEW_LEDGER = JSON.parse(readFileSync(new URL("../content-review-records.json", import.meta.url), "utf8"));
const REVIEWER_VERIFIED = REVIEW_LEDGER.reviewer?.verificationStatus === "verified" && /^https:\/\//.test(REVIEW_LEDGER.reviewer?.verificationUrl ?? "");
const AUTHOR_LABEL = REVIEWER_VERIFIED ? `${REVIEW_LEDGER.reviewer.displayName}, ${REVIEW_LEDGER.reviewer.credential}` : REVIEW_LEDGER.reviewer.displayName;
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
  :root{--paper:#f4f8f6;--ink:#102f2a;--muted:#45615a;--line:#d7e5e0;--teal:#0e7c6b;--pale:#e8f4f0;--white:#fff}
  *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.62}
  a{color:#096d5d;text-underline-offset:3px}a:focus-visible,.button:focus-visible,summary:focus-visible{outline:3px solid #f4b942;outline-offset:3px}
  .wrap{width:min(100% - 36px,920px);margin:auto}.nav{min-height:70px;display:flex;align-items:center;gap:20px}.brand{font-size:21px;font-weight:850;letter-spacing:-.03em;text-decoration:none}.links{margin-left:auto;display:flex;gap:18px;font-size:14px;font-weight:650}.links a{text-decoration:none;color:#37544d}
  main{padding:64px 0 80px}.eyebrow{color:var(--teal);font-size:12px;font-weight:850;letter-spacing:.09em;text-transform:uppercase}h1{font-size:clamp(38px,7vw,62px);line-height:1.04;letter-spacing:-.045em;max-width:800px;margin:12px 0 18px}h2{font-size:27px;line-height:1.15;letter-spacing:-.025em;margin:42px 0 14px}h3{font-size:18px;margin:0 0 6px}p,li{color:#304a44}.lead{font-size:19px;max-width:760px}.card{background:var(--white);border:1px solid var(--line);border-radius:15px;padding:22px;margin:14px 0}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.grid .card{margin:0}.callout{background:var(--pale);border-left:4px solid var(--teal);border-radius:0 13px 13px 0;padding:18px 20px;margin:26px 0}.button{display:inline-block;border:0;border-radius:10px;background:var(--teal);color:white;text-decoration:none;font-weight:750;padding:11px 17px;margin:10px 8px 0 0}.button.alt{background:white;color:#0e6e5c;border:1px solid #b9d2ca}.meta{font-size:13px;color:#526b65}.price{font-size:30px;font-weight:850;color:var(--ink)}.price small{font-size:13px;color:var(--muted);font-weight:500}.best{border:2px solid var(--teal);position:relative}.tag{display:inline-block;background:var(--teal);color:white;border-radius:99px;padding:3px 9px;font-size:11px;font-weight:800;margin-bottom:12px}.table-wrap{overflow-x:auto;margin:18px 0;border:1px solid var(--line);border-radius:12px}.table-wrap:focus{outline:3px solid #8ccfc3;outline-offset:2px}.table-wrap table{min-width:760px;border:0;margin:0}table{width:100%;border-collapse:collapse;background:white;border:1px solid var(--line)}caption{text-align:left;font-weight:800;color:var(--ink);padding:13px 12px;background:var(--pale)}th,td{text-align:left;padding:12px;border-bottom:1px solid var(--line);vertical-align:top}th{color:#0b6557}.sources li{margin-bottom:7px}footer{background:#0b2a25;color:#c7ddd7;padding:34px 0;font-size:12px}footer p{color:#96b3ab}.footlinks{display:flex;flex-wrap:wrap;gap:14px}.footlinks a{color:#d9ebe6}
  @media(max-width:650px){.links a:not(:last-child){display:none}.grid{grid-template-columns:1fr}main{padding-top:42px}h1{font-size:42px}table{font-size:13px}th,td{padding:9px}}
`;

function page({ slug, title, description, eyebrow, h1, body, schema, published, updated, sources = [], faq = [], contentSha256 }) {
  const url = `${SITE}/${slug}/`;
  const related = published ? relatedCommercial(slug) : [];
  const relatedSection = related.length ? `<section aria-labelledby="related-comparisons"><h2 id="related-comparisons">Compare related NCLEX preparation options</h2><div class="grid">${related.map((item) => `<article class="card"><h3><a href="/${item.slug}/">${esc(item.title)}</a></h3><p>${esc(item.description)}</p></article>`).join("")}</div></section>` : "";
  const pageNode = { "@type": published ? "Article" : "WebPage", "@id": `${url}#page`, url, name: title, ...(published ? { headline: title } : {}), description, inLanguage: "en-US", isPartOf: { "@id": `${SITE}/#website` }, about: { "@id": `${SITE}/#app` }, author: { "@id": AUTHOR }, ...(published ? { datePublished: published, dateModified: updated, citation: sources.map((id) => COMMERCIAL_SOURCES[id]?.url).filter(Boolean), identifier: `sha256:${contentSha256}` } : {}) };
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      pageNode,
      { "@type": "Person", "@id": AUTHOR, name: AUTHOR_LABEL, url: AUTHOR, worksFor: { "@id": `${SITE}/#org` }, ...(REVIEWER_VERIFIED ? { jobTitle: REVIEW_LEDGER.reviewer.licenseType, sameAs: [REVIEW_LEDGER.reviewer.verificationUrl] } : {}) },
      ...(published ? [{ "@type": "BreadcrumbList", "@id": `${url}#crumbs`, itemListElement: [{ "@type": "ListItem", position: 1, name: "PulseRN", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: "Comparisons", item: `${SITE}/compare/` }, { "@type": "ListItem", position: 3, name: title, item: url }] }] : []),
      ...(faq.length ? [{ "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: faq.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) }] : []),
      ...(schema ? [schema] : []),
    ],
  };
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | PulseRN</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}"><link rel="icon" type="image/svg+xml" href="/icon.svg"><meta name="theme-color" content="#0E7C6B"><meta property="og:type" content="website"><meta property="og:site_name" content="PulseRN"><meta property="og:url" content="${url}"><meta property="og:title" content="${esc(title)} | PulseRN"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${SITE}/og.png"><meta name="twitter:card" content="summary_large_image">${ATTRIBUTION_BOOT_TAG}<script type="application/ld+json">${JSON.stringify(jsonld)}</script><style>${CSS}</style></head><body>
  <header class="wrap"><nav class="nav" aria-label="Primary navigation"><a class="brand" href="/">PulseRN</a><div class="links"><a href="/how-it-works/">How it works</a><a href="/learn/">Guides</a><a href="/compare/">Compare</a><a href="/pricing/">Pricing</a><a href="/?signin=1">Sign in</a></div></nav></header>
  <main class="wrap"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(h1)}</h1>${published ? `<p class="meta">Published and last verified <time datetime="${esc(updated)}">${esc(updated)}</time> · editorial owner <a href="${AUTHOR}">${esc(AUTHOR_LABEL)}</a></p>` : ""}${body}${relatedSection}
  <div class="callout"><strong>Built to get you ready to walk into the NCLEX confident.</strong><br><a class="button" href="/?start=1">Start the ${esc(free.name.toLowerCase())}</a><a class="button alt" href="/learn/">Read the nursing-study guides</a></div></main>
  <footer><div class="wrap"><div class="footlinks"><a href="/">Home</a><a href="/pricing/">Pricing</a><a href="/compare/">Compare</a><a href="/methodology/">Methodology</a><a href="/editorial-policy/">Editorial policy</a><a href="/about/">About</a><a href="/legal/">Terms · Privacy · Disclaimer</a></div><p>Educational exam preparation only — not medical advice or a clinical reference. NCLEX® is a registered trademark of NCSBN, which is not affiliated with and does not endorse PulseRN. Competitor trademarks belong to their respective owners; no affiliation or endorsement is implied.</p></div></footer></body></html>`;
}

const free = PLANS.find((p) => p.id === "pass1");
const paid = PLANS.filter((p) => !p.addon && p.cents > 0);
const addons = PLANS.filter((p) => p.addon);
const offers = PLANS.filter((p) => !p.addon).map((p) => ({
  "@type": "Offer", name: p.name, price: (p.cents / 100).toFixed(2), priceCurrency: "USD", availability: "https://schema.org/InStock", url: `${SITE}/pricing/`, description: p.blurb,
}));

const pages = [
  {
    slug: "free-nclex-practice-test", title: "Free NCLEX-RN practice test: 20 questions", eyebrow: "Free practice", h1: "Try 20 free NCLEX-RN practice questions.",
    description: "Start with 20 free NCLEX-RN questions in pharmacology, prioritization, dosage, and NGN bow-tie, each with the answer, rationale, and sources.",
    schema: {
      "@type": "CollectionPage", "@id": `${SITE}/free-nclex-practice-test/#collection`, name: "Free NCLEX-RN practice test",
      mainEntity: {
        "@type": "ItemList", numberOfItems: 4,
        itemListElement: [
          ["NCLEX pharmacology practice questions", "nclex-pharmacology-practice-questions"],
          ["NCLEX prioritization practice questions", "nclex-prioritization-practice-questions"],
          ["NCLEX dosage calculation practice questions", "nclex-dosage-calculation-practice-questions"],
          ["NGN bow-tie practice questions", "ngn-bow-tie-practice-questions"],
        ].map(([name, slug], index) => ({ "@type": "ListItem", position: index + 1, name, url: `${SITE}/learn/${slug}/` })),
      },
    },
    body: `<p class="lead">Start with a question. Four public sets cover pharmacology, prioritization, dosage calculations, and an NGN bow-tie item, five questions each. No account and no card. The answer and the rationale are on the page. Built by a working hospital RN.</p>
      <div class="callout"><strong>Educational boundary:</strong> These 20 items are original educational examples. They are not live, recalled, or reproduced NCLEX questions, and a result here cannot predict or guarantee an exam outcome.</div>
      <section aria-labelledby="practice-sets"><h2 id="practice-sets">Choose a five-question set</h2><div class="grid">
        <article class="card"><h3><a href="/learn/nclex-pharmacology-practice-questions/">Pharmacology practice</a></h3><p>Five medication-focused questions with the answer and rationale shown after each prompt.</p></article>
        <article class="card"><h3><a href="/learn/nclex-prioritization-practice-questions/">Prioritization practice</a></h3><p>Five questions about recognizing which patient, finding, or nursing action takes priority.</p></article>
        <article class="card"><h3><a href="/learn/nclex-dosage-calculation-practice-questions/">Dosage-calculation practice</a></h3><p>Five calculation questions with worked rationales and the supporting educational sources.</p></article>
        <article class="card"><h3><a href="/learn/ngn-bow-tie-practice-questions/">NGN bow-tie practice</a></h3><p>Five bow-tie examples that ask you to connect a likely condition, actions, and monitoring parameters.</p></article>
      </div><p class="meta">Each linked set publishes its sources, content digest, and RN-review record. These public sets are guides. They are not a claim that every practice question is signed off by a human.</p></section>
      <section><h2>Use the free practice as a study loop</h2><ol><li>Commit to an answer before opening the rationale.</li><li>Name whether a miss came from knowledge, calculation, prioritization, or the item format.</li><li>Read the cited support on the set when a rationale is new.</li><li>Return to the <a href="/learn/2026-nclex-rn-test-plan/">2026 NCLEX-RN test-plan guide</a> or the <a href="/learn/nclex-clinical-judgment/">clinical-judgment guide</a> before the next round.</li></ol></section>
      <section><h2>What this free test shows</h2><div class="card"><p>The hub is a no-sign-in sample of PulseRN's question-and-rationale loop. It is not a readiness self-assessment and it is not a simulated adaptive exam. Read the <a href="/methodology/">methodology</a> for how adaptive practice and readiness estimates work, the <a href="/editorial-policy/">editorial policy</a> for how content is checked, or <a href="/pricing/">pricing</a> for current access.</p></div></section>`,
  },
  {
    slug: "pricing", title: "NCLEX-RN prep pricing", eyebrow: "Clear pricing", h1: "Choose the study window that fits your plan.",
    description: `PulseRN NCLEX-RN prep from a free ${free.days}-day pass, no card, through 30- to 730-day plans. The same study library on every paid plan.`,
    schema: { "@type": "Product", "@id": `${SITE}/#app`, name: "PulseRN", description: "Adaptive NCLEX-RN exam preparation", brand: { "@type": "Brand", name: "PulseRN" }, offers },
    body: `<p class="lead">Built by a working hospital RN. Every paid plan opens the same library: 10,000+ practice questions, 500+ case studies, and 1,100+ flashcards, engineered around retrieval practice, spaced repetition, and adaptive practice. Paid plans add one to six readiness self-assessments, by plan length. The free pass includes study content and no readiness self-assessment. No card is needed for the free pass.</p>
      <section aria-labelledby="plans"><h2 id="plans">Access plans</h2><div class="grid">
      <article class="card"><span class="tag">Free</span><h3>${esc(free.name)}</h3><p class="price">$0</p><p>${esc(free.blurb)}</p></article>
      ${paid.map((p) => `<article class="card${p.id === "sub90" ? " best" : ""}">${p.id === "sub90" ? '<span class="tag">Popular study window</span>' : ""}<h3>${esc(p.name)}</h3><p class="price">${esc(fmtUsd(p.cents))} <small>USD</small></p><p>${esc(p.blurb)}</p><p class="meta">${p.exams} readiness self-assessment${p.exams === 1 ? "" : "s"}</p></article>`).join("")}</div></section>
      <section><h2>Optional add-ons</h2><table><thead><tr><th>Add-on</th><th>What it adds</th><th>Price</th></tr></thead><tbody>${addons.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.blurb)}</td><td>${esc(fmtUsd(p.cents))} USD</td></tr>`).join("")}</tbody></table></section>
      <div class="callout"><strong>Important:</strong> A readiness result is an educational estimate based on activity inside PulseRN. It is not a prediction or guarantee of an NCLEX outcome.</div>`,
  },
  {
    slug: "how-it-works", title: "How PulseRN works", eyebrow: "The study loop", h1: "Engineered around how you learn and remember.",
    description: "See how PulseRN uses retrieval practice, spaced repetition, adaptive questions, a Today round, and a weekly plan built around your exam date.",
    body: `<p class="lead">Built by Sheldon Bennett, a working hospital RN. PulseRN was researched and engineered around how people actually learn and remember under pressure. The loop is the product.</p>
      <section><h2>1. Retrieval practice</h2><div class="card"><p>Every session starts with a question, not a lecture. You commit to an answer, then read the rationale. Practice includes standard multiple choice and Next Generation formats: matrix, bow-tie, cloze, highlight, drag-and-drop, multiple response, and dosage calculation.</p></div></section>
      <section><h2>2. Spaced repetition</h2><div class="card"><p>What you miss comes back on a real calendar date, right before you would forget it. Recall comes before the answer is shown. Cards you know move further out.</p></div></section>
      <section><h2>3. Adaptive practice</h2><div class="card"><p>PulseRN finds weak spots across the eight NCSBN client-needs categories and works them until they are strengths. The working estimate sequences practice inside the app. It is not an official NCLEX score.</p></div></section>
      <section><h2>4. A plan for each day</h2><div class="card"><p>A Today round puts due cards and adaptive questions in one session. Set an exam date and the weekly plan is built around it. Readiness self-assessments use standardized 85-question forms that are not repeated. The result is an estimate of your work in PulseRN. It does not predict or guarantee an exam result.</p></div></section>
      <section><h2>5. Visual study cards and the library</h2><div class="card"><p>ABGs, potassium and ECG changes, IV fluids, insulin, isolation, and pressure injuries are drawn so the concept clicks. The library is 10,000+ practice questions, 500+ case studies, 1,100+ flashcards, dosage calculation, and an AI tutor for another explanation after you answer.</p></div></section>
      <p class="meta">Product description owner: <a href="${AUTHOR}">${esc(AUTHOR_LABEL)}</a>. For the scoring and content-governance details, read the <a href="/methodology/">methodology</a> and <a href="/editorial-policy/">editorial policy</a>.</p>`,
  },
  {
    slug: "methodology", title: "PulseRN methodology", eyebrow: "Methods and limits", h1: "How the PulseRN study loop works.",
    description: "How PulseRN uses retrieval practice, spaced repetition, adaptive questions, and readiness estimates, and what those estimates do not predict.",
    body: `<p class="lead">Built by Sheldon Bennett, a working hospital RN. The methods below guide study inside PulseRN. A readiness result is an estimate of that work. It is not an official NCLEX score and it does not predict a licensing result.</p>
      <section><h2>Retrieval practice</h2><div class="card"><p>Every session starts with a question, not a lecture. The answer is committed before the rationale or the flashcard answer is shown.</p></div></section>
      <section><h2>Adaptive practice</h2><div class="card"><p>Question difficulty is selected from a learner-ability estimate built from prior answers. It sequences practice across the eight NCSBN client-needs categories. It is not an official NCLEX score.</p></div></section>
      <section><h2>Spaced repetition</h2><div class="card"><p>Flashcards are scheduled on calendar dates from recall feedback. An item you miss returns sooner. An item you know moves further out.</p></div></section>
      <section><h2>A daily round and a weekly plan</h2><div class="card"><p>The Today round combines due flashcards with adaptive questions. A weekly plan is built around the exam date once that date is set.</p></div></section>
      <section><h2>Content coverage</h2><div class="card"><p>Practice is organized around NCSBN's published NCLEX-RN test plan and includes standard and Next Generation item formats, dosage calculation, case studies, and visual explainers for ABGs, potassium and ECG changes, IV fluids, insulin, isolation, and pressure injuries. PulseRN does not use or claim access to live exam questions. Practice questions, case studies, flashcards, and readiness items pass automated quality checks before they go live. That is not a per-question sign-off by a human reviewer. Public study guides are a separate set: each approved guide has an RN review record bound to the exact page.</p></div></section>
      <section><h2>Readiness estimates</h2><div class="card"><p>Self-assessments use 85-question forms and never repeat a form for the same account. The result is an estimate of work inside PulseRN. It requires enough answered material before it appears, and it does not predict or guarantee an exam result.</p></div></section>
      <section><h2>Limits</h2><ul><li>PulseRN is not affiliated with or endorsed by NCSBN.</li><li>Practice performance can be affected by content exposure, study conditions, and other factors.</li><li>Educational content is not medical advice and should not replace current clinical policies or instruction.</li></ul></section>
      <section><h2>Primary framework</h2><ul class="sources"><li><a href="https://www.nclex.com/test-plans.page" rel="external">NCSBN NCLEX test plans</a></li><li><a href="https://www.nclex.com/next-generation-nclex.page" rel="external">NCSBN Next Generation NCLEX information</a></li></ul></section>
      <p class="meta">Method owner: <a href="${AUTHOR}">${esc(AUTHOR_LABEL)}</a>. ${REVIEWER_VERIFIED ? "Reviewer identity is linked to public verification evidence." : "Independent credential verification is pending."}</p>`,
  },
  {
    slug: "editorial-policy", title: "Editorial and clinical review policy", eyebrow: "Content governance", h1: "How PulseRN's study content is built and checked.",
    description: "How PulseRN builds practice from the NCSBN test plan, checks items automatically, RN-reviews public guides, and handles corrections.",
    body: `<p class="lead">PulseRN is educational material for NCLEX-RN preparation, built by Sheldon Bennett, a working hospital RN. The checks below are the real process.</p>
      <section><h2>Authorship and accountability</h2><div class="card"><p>${esc(AUTHOR_LABEL)} is the founder and content owner. Public guides expose versioned source, content-digest, reviewer, and review-status evidence. No guide is treated as approved while that evidence is pending.</p></div></section>
      <section><h2>Source hierarchy</h2><div class="card"><p>Exam-format claims prioritize NCSBN materials. Clinical content on the public guides favors current primary or authoritative sources such as government health agencies, official professional guidance, and peer-reviewed evidence. Sources are linked where they materially support a guide.</p></div></section>
      <section><h2>Practice items and AI assistance</h2><div class="card"><p>AI may assist with drafting practice items and with on-demand tutoring. It is not the author of the product. Practice questions, case studies, flashcards, and readiness items are built around NCSBN's published test plan and pass automated quality checks before they go live. That is not a per-question sign-off by a human reviewer. Sheldon Bennett, RN, can correct or remove any item. Public study guides are separate: each approved guide has an RN review record bound to the exact page.</p></div></section>
      <section><h2>Claims and safety</h2><ul><li>PulseRN never claims its questions are identical to live NCLEX content.</li><li>Readiness is never presented as an outcome guarantee.</li><li>Educational content is never framed as patient-specific medical advice.</li><li>Material uncertainty or conflicting guidance must be surfaced, not hidden.</li></ul></section>
      <section><h2>Corrections</h2><div class="card"><p>Substantive corrections should update the affected page, its review date, and its cited support. Questions or correction requests can be sent to <a href="mailto:sheldon@pulsern.app">sheldon@pulsern.app</a>.</p></div></section>
      <p class="meta">Policy owner: <a href="${AUTHOR}">${esc(AUTHOR_LABEL)}</a>.</p>`,
  },
];

/* Static product pages do not load the marketing bundle. The tag is the same
   first-touch capture the homepage runs, written out before the HTML so a
   campaign that lands here is already stored when the bare homepage CTA is
   clicked. */
writeAttributionBoot();
const evidence = commercialEvidence();
for (const data of [...pages, ...COMMERCIAL_PAGES.map((item) => ({ ...item, contentSha256: evidence.pages.find((page) => page.route === `/${item.slug}/`)?.contentSha256 }))]) {
  const directory = `public/${data.slug}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/index.html`, page(data));
}

writeFileSync("public/comparison-evidence.json", JSON.stringify(evidence, null, 2) + "\n");
writeFileSync("public/commercial-search-intents.json", JSON.stringify({ schemaVersion: 1, generatedAt: evidence.generatedAt, intents: Object.fromEntries(evidence.pages.map((item) => [item.route, item.intent])) }, null, 2) + "\n");
writeFileSync("public/release.json", JSON.stringify({
  schemaVersion: 1,
  commitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local-unbound",
  source: process.env.VERCEL_GIT_COMMIT_SHA ? "vercel" : process.env.GITHUB_SHA ? "github" : "local",
}, null, 2) + "\n");

console.log(`built ${pages.length} public product/trust pages and ${COMMERCIAL_PAGES.length} commercial-intent pages`);
