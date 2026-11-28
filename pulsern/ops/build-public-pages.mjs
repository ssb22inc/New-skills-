/* Build the public product and trust pages that search engines, answer engines,
   agents, and prospective learners need before entering the authenticated app. */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { GRADING_NOTE } from "../src/grading-note.js";
import { ON_PURPOSE } from "../src/on-purpose.js";
import { PLANS, fmtUsd } from "../src/pricing.js";
import { COMMERCIAL_PAGES, COMMERCIAL_SOURCES, commercialEvidence, relatedCommercial } from "./commercial-content.mjs";
import { ATTRIBUTION_BOOT_TAG, writeAttributionBoot } from "./attribution-boot.mjs";
import { personNode, AUTHOR_SENTENCE, LICENSE_LOOKUP_LABEL, displayDate } from "./author.mjs";

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

const PURPOSE_CSS = `.purpose{background:#0d302b;color:#fff;border-radius:16px;padding:18px 20px;margin:22px 0 8px}.purpose p{margin:0;color:#fff}.purpose .purpose-kicker{color:#8fd7c4;font-size:12px;font-weight:850;letter-spacing:.14em;margin-bottom:6px}.purpose .purpose-title{font-size:clamp(20px,3vw,26px);line-height:1.22;font-weight:850;letter-spacing:-.02em}.purpose .purpose-line{color:#d7ebe6;margin-top:6px;font-size:15px}`;

function purposeBand() {
  return `<aside class="purpose" aria-label="On purpose"><p class="purpose-kicker">${esc(ON_PURPOSE.eyebrow)}</p><p class="purpose-title">${esc(ON_PURPOSE.headline)}</p><p class="purpose-line">${esc(ON_PURPOSE.support)}</p></aside>`;
}

function withPurpose(body) {
  const lead = body.match(/<p class="lead">[\s\S]*?<\/p>/);
  if (!lead) return purposeBand() + body;
  return body.replace(lead[0], `${lead[0]}${purposeBand()}`);
}

function page({ slug, title, description, eyebrow, h1, body, schema, published, updated, sources = [], faq = [], contentSha256, purpose = false }) {
  const url = `${SITE}/${slug}/`;
  const related = published ? relatedCommercial(slug) : [];
  const relatedSection = related.length ? `<section aria-labelledby="related-comparisons"><h2 id="related-comparisons">Compare related NCLEX preparation options</h2><div class="grid">${related.map((item) => `<article class="card"><h3><a href="/${item.slug}/">${esc(item.title)}</a></h3><p>${esc(item.description)}</p></article>`).join("")}</div></section>` : "";
  const pageNode = { "@type": published ? "Article" : "WebPage", "@id": `${url}#page`, url, name: title, ...(published ? { headline: title } : {}), description, inLanguage: "en-US", isPartOf: { "@id": `${SITE}/#website` }, about: { "@id": `${SITE}/#app` }, author: { "@id": AUTHOR }, ...(published ? { datePublished: published, dateModified: updated, citation: sources.map((id) => COMMERCIAL_SOURCES[id]?.url).filter(Boolean), identifier: `sha256:${contentSha256}` } : {}) };
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      pageNode,
      personNode(),
      ...(published ? [{ "@type": "BreadcrumbList", "@id": `${url}#crumbs`, itemListElement: [{ "@type": "ListItem", position: 1, name: "PulseRN", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: title, item: url }] }] : []),
      ...(faq.length ? [{ "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: faq.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) }] : []),
      ...(schema ? [schema] : []),
    ],
  };
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | PulseRN</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}"><link rel="icon" type="image/svg+xml" href="/icon.svg"><meta name="theme-color" content="#0E7C6B"><meta property="og:type" content="website"><meta property="og:site_name" content="PulseRN"><meta property="og:url" content="${url}"><meta property="og:title" content="${esc(title)} | PulseRN"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${SITE}/og.png"><meta name="twitter:card" content="summary_large_image">${ATTRIBUTION_BOOT_TAG}<script type="application/ld+json">${JSON.stringify(jsonld)}</script><style>${CSS}${purpose ? PURPOSE_CSS : ""}</style></head><body>
  <header class="wrap"><nav class="nav" aria-label="Primary navigation"><a class="brand" href="/">PulseRN</a><div class="links"><a href="/how-it-works/">How it works</a><a href="/learn/">Guides</a><a href="/pricing/">Pricing</a><a href="/app/sign-in">Sign in</a></div></nav></header>
  <main class="wrap"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(h1)}</h1>${published ? `<p class="meta">Published <time datetime="${esc(published)}">${esc(published)}</time> · Last verified <time datetime="${esc(updated)}">${esc(updated)}</time> · editorial owner <a href="${AUTHOR}">${esc(AUTHOR_LABEL)}</a> · Corrections: <a href="mailto:sheldon@pulsern.app?subject=Correction%20request">sheldon@pulsern.app</a></p>` : ""}${purpose ? withPurpose(body) : body}${relatedSection}
  <div class="callout"><strong>Start free. No card, no auto-renew.</strong><br><a class="button" href="/app/sign-up">Start the ${esc(free.name.toLowerCase())}</a><a class="button alt" href="/free-nclex-practice-test/">Try 20 free questions</a></div></main>
  <footer><div class="wrap"><div class="footlinks"><a href="/">Home</a><a href="/pricing/">Pricing</a><a href="/methodology/">Methodology</a><a href="/editorial-policy/">Editorial policy</a><a href="/about/">About</a><a href="/legal/">Terms, Privacy, and Disclaimer</a></div><p class="grading">${esc(GRADING_NOTE)}</p><p>Educational exam preparation only, not medical advice or a clinical reference. NCLEX® is a registered trademark of NCSBN, which is not affiliated with and does not endorse PulseRN.</p></div></footer></body></html>`;
}

/* The page Vercel serves, with a 404 status, for any URL that matches no file.
   It is noindex and has no canonical, so a mistyped link never becomes a
   copy of the homepage in the index. */
function notFoundPage() {
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | PulseRN</title><link rel="icon" type="image/svg+xml" href="/icon.svg"><meta name="theme-color" content="#0E7C6B">${ATTRIBUTION_BOOT_TAG}<style>${CSS}</style></head><body>
  <header class="wrap"><nav class="nav" aria-label="Primary navigation"><a class="brand" href="/">PulseRN</a><div class="links"><a href="/how-it-works/">How it works</a><a href="/learn/">Guides</a><a href="/pricing/">Pricing</a><a href="/app/sign-in">Sign in</a></div></nav></header>
  <main class="wrap"><div class="eyebrow">Error 404</div><h1>We can't find that page.</h1><p class="lead">The link may be old or mistyped. These are good places to start:</p><ul><li><a href="/free-nclex-practice-test/">Free NCLEX-RN practice questions</a></li><li><a href="/learn/">NCLEX study guides</a></li><li><a href="/how-it-works/">How PulseRN works</a></li><li><a href="/pricing/">Pricing</a></li></ul><p><a class="button" href="/">Go to the homepage</a></p></main>
  <footer><div class="wrap"><div class="footlinks"><a href="/">Home</a><a href="/pricing/">Pricing</a><a href="/methodology/">Methodology</a><a href="/editorial-policy/">Editorial policy</a><a href="/about/">About</a><a href="/legal/">Terms, Privacy, and Disclaimer</a></div><p>Educational exam preparation only, not medical advice or a clinical reference. NCLEX® is a registered trademark of NCSBN, which is not affiliated with and does not endorse PulseRN.</p></div></footer></body></html>`;
}

/* /about/ is the author page every guide and schema node points to. It is
   built here so its Person data is the same object the guides use. */
function aboutPage() {
  const description = "Sheldon Bennett, RN, a Florida-licensed nurse since 2020, built PulseRN for NCLEX-RN prep. Check his license and see how content is reviewed.";
  const lookup = REVIEW_LEDGER.reviewer.verificationUrl;
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "AboutPage", "@id": `${SITE}/about/#about`, url: `${SITE}/about/`, name: "About PulseRN", description, inLanguage: "en-US", mainEntity: { "@id": AUTHOR }, isPartOf: { "@id": `${SITE}/#website` }, publisher: { "@id": `${SITE}/#org` } },
      personNode(),
      { "@type": "Organization", "@id": `${SITE}/#org`, name: "PulseRN", url: `${SITE}/`, email: "sheldon@pulsern.app", founder: { "@id": AUTHOR } },
    ],
  };
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>About PulseRN and its founder, Sheldon Bennett, RN</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${SITE}/about/"><link rel="icon" type="image/svg+xml" href="/icon.svg"><meta name="theme-color" content="#0E7C6B"><meta property="og:type" content="website"><meta property="og:site_name" content="PulseRN"><meta property="og:url" content="${SITE}/about/"><meta property="og:title" content="About PulseRN and its founder, Sheldon Bennett, RN"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${SITE}/og.png"><meta name="twitter:card" content="summary_large_image">${ATTRIBUTION_BOOT_TAG}<script type="application/ld+json">${JSON.stringify(jsonld)}</script><style>${CSS}</style></head><body>
  <header class="wrap"><nav class="nav" aria-label="Primary navigation"><a class="brand" href="/">PulseRN</a><div class="links"><a href="/how-it-works/">How it works</a><a href="/learn/">Guides</a><a href="/pricing/">Pricing</a><a href="/app/sign-in">Sign in</a></div></nav></header>
  <main class="wrap"><div class="eyebrow">About</div><h1>About PulseRN</h1>
    <section class="card" id="sheldon-bennett-rn" aria-labelledby="founder"><h2 id="founder" style="margin-top:0">Sheldon Bennett, RN</h2>
      <p><strong>Founder of PulseRN.</strong> ${esc(AUTHOR_SENTENCE)} He holds an associate degree in nursing.</p>
      ${REVIEWER_VERIFIED ? `<p>License status is public record. <a href="${esc(lookup)}" rel="external noopener">Check his license on the ${LICENSE_LOOKUP_LABEL}</a>. Last checked ${esc(displayDate(REVIEW_LEDGER.reviewer.verifiedAt))}.</p>` : ""}
      <p>Sheldon writes the public study guides and checks each one against its sources. Each guide shows its review status.</p></section>
    <section><h2>Why I built it</h2><div class="card"><p>I'm a hospital RN, and I remember studying for the NCLEX between shifts. The tools I had were either a giant question bank or a lecture, and neither was built around how memory works.</p><p>PulseRN is for the nursing student fitting study around clinicals, work, and the rest of life. Every session starts with a question. What you miss comes back right before you'd forget it, and weak areas get extra reps until they aren't weak anymore.</p></div></section>
    <section><h2>How content is checked</h2><div class="card"><p>Practice questions, case studies, flashcards, and readiness items are built around NCSBN's published test plan. Each one passes automated quality checks before it goes live, covering the keyed answer, the distractors, the rationale, and any dosage math. AI assists with drafting items and with on-demand tutoring.</p><p>I own the product and can correct or remove any item. Report a problem under a question, and the report is saved for follow-up. Public study guides are a separate set: I review each one against its sources, and the review record is tied to the exact text of the page. The <a href="/editorial-policy/">editorial policy</a> has the details.</p></div></section>
    <section><h2>How scoring works</h2><div class="card"><p>${esc(GRADING_NOTE)} Practice questions use NCSBN-style partial credit. Your readiness score is an estimate built from your own answers, explained on the <a href="/methodology/">methodology</a> page.</p></div></section>
    <section><h2>Ready to register for the NCLEX?</h2><div class="card"><p>Registration takes three steps: apply for licensure with your state board of nursing, register with Pearson VUE, then schedule your exam when your Authorization to Test (ATT) arrives. The official sources are <a href="https://www.nclex.com" rel="external noopener">nclex.com</a>, NCSBN's exam site, and <a href="https://www.pearsonvue.com/us/en/nclex.html" rel="external noopener">Pearson VUE</a>, which handles registration, fees, and scheduling. The <a href="/learn/how-to-register-for-the-nclex/">registration guide</a> walks through each step.</p></div></section>
  <div class="callout"><strong>Start free. No card, no auto-renew.</strong><br><a class="button" href="/app/sign-up">Start the ${esc(free.name.toLowerCase())}</a><a class="button alt" href="/free-nclex-practice-test/">Try 20 free questions</a></div></main>
  <footer><div class="wrap"><div class="footlinks"><a href="/">Home</a><a href="/pricing/">Pricing</a><a href="/methodology/">Methodology</a><a href="/editorial-policy/">Editorial policy</a><a href="/learn/">Guides</a><a href="/legal/">Terms, Privacy, and Disclaimer</a></div><p>Educational exam preparation only, not medical advice or a clinical reference. NCLEX® is a registered trademark of NCSBN, which is not affiliated with and does not endorse PulseRN.</p></div></footer></body></html>`;
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
    description: "Start with 20 free NCLEX-RN questions in pharmacology, prioritization, dosage calculation, and NGN bow-tie items, each with the answer, rationale, and sources.",
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
    body: `<p class="lead">Start with a question. Four free sets cover pharmacology, prioritization, dosage calculation, and Next Generation NCLEX (NGN) bow-tie items, five questions each. No account or card is needed, and the answer and rationale are on the page.</p>
      <div class="callout"><strong>About these questions:</strong> These 20 items are original educational examples. They are not live, recalled, or reproduced NCLEX questions, and a result here cannot predict or guarantee an exam outcome.</div>
      <section aria-labelledby="practice-sets"><h2 id="practice-sets">Choose a five-question set</h2><div class="grid">
        <article class="card"><h3><a href="/learn/nclex-pharmacology-practice-questions/">Pharmacology practice</a></h3><p>Five medication-focused questions with the answer and rationale shown after each prompt.</p></article>
        <article class="card"><h3><a href="/learn/nclex-prioritization-practice-questions/">Prioritization practice</a></h3><p>Five questions about recognizing which client, finding, or nursing action comes first.</p></article>
        <article class="card"><h3><a href="/learn/nclex-dosage-calculation-practice-questions/">Dosage calculation practice</a></h3><p>Five calculation questions with worked rationales and the supporting educational sources.</p></article>
        <article class="card"><h3><a href="/learn/ngn-bow-tie-practice-questions/">NGN bow-tie practice</a></h3><p>Five bow-tie examples that ask you to connect a likely condition, actions, and monitoring parameters.</p></article>
      </div><p class="meta">Each linked set publishes its sources, content digest, and RN-review record.</p></section>
      <section><h2>Use the free practice as a study loop</h2><ol><li>Commit to an answer before opening the rationale.</li><li>Name whether a miss came from knowledge, calculation, prioritization, or the item format.</li><li>Read the cited sources when a rationale surprises you.</li><li>Return to the <a href="/learn/2026-nclex-rn-test-plan/">2026 NCLEX-RN Test Plan guide</a> or the <a href="/learn/nclex-clinical-judgment/">clinical judgment guide</a> before the next round.</li></ol></section>
      <section><h2>What this free test shows</h2><div class="card"><p>This page is a free sample of PulseRN's question-and-rationale loop, with no sign-in needed. Adaptive practice and readiness estimates live in the app. Read the <a href="/methodology/">methodology</a> for how they work, the <a href="/editorial-policy/">editorial policy</a> for how content is checked, or <a href="/pricing/">pricing</a> for current access.</p></div></section>`,
  },
  {
    slug: "pricing", title: `NCLEX-RN prep pricing: free ${free.days}-day pass, plans from ${fmtUsd(paid[0].cents)}`, eyebrow: "Clear pricing", h1: "Choose the study window that fits your plan.", purpose: true,
    description: `PulseRN NCLEX-RN prep, from a free ${free.days}-day pass with no card needed to 30- to 730-day plans. Every paid plan opens the same study library.`,
    schema: { "@type": "Product", "@id": `${SITE}/#app`, name: "PulseRN", description: "Adaptive NCLEX-RN exam preparation", brand: { "@type": "Brand", name: "PulseRN" }, offers },
    body: `<p class="lead">Every paid plan opens the same library: 10,000+ practice questions, 500+ case studies, and 1,100+ flashcards, built on retrieval practice, spaced repetition, and adaptive question selection. Paid plans add one to six readiness self-assessments, depending on plan length. The free pass includes study content but no readiness self-assessment, and no card is needed.</p>
      <section aria-labelledby="plans"><h2 id="plans">Access plans</h2><div class="grid">
      <article class="card"><span class="tag">Free</span><h3>${esc(free.name)}</h3><p class="price">$0</p><p>${esc(free.blurb)}</p></article>
      ${paid.map((p) => `<article class="card"><h3>${esc(p.name)}</h3><p class="price">${esc(fmtUsd(p.cents))} <small>USD</small></p><p>${esc(p.blurb)}</p></article>`).join("")}</div></section>
      <section><h2>Optional add-ons</h2><table><thead><tr><th>Add-on</th><th>What it adds</th><th>Price</th></tr></thead><tbody>${addons.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.blurb)}</td><td>${esc(fmtUsd(p.cents))} USD</td></tr>`).join("")}</tbody></table></section>
      <div class="callout"><strong>One payment, no auto-renewal.</strong> Each plan is one payment for a fixed access window. Nothing renews or charges you again. If you haven't used your paid access, you can request a full refund within 7 days of purchase. <a href="/legal/#payments">Payment and refund terms</a>.</div>
      <p class="meta">How readiness is estimated, and what it can and can't tell you, is on the <a href="/methodology/">methodology</a> page.</p>`,
  },
  {
    slug: "how-it-works", title: "How PulseRN works: adaptive NCLEX-RN practice", eyebrow: "The study loop", h1: "Questions first, reviews timed to your memory.", purpose: true,
    description: "See how PulseRN uses retrieval practice, spaced repetition, adaptive questions, a Today round, and a weekly plan built around your exam date.",
    body: `<p class="lead">Built by Sheldon Bennett, RN. PulseRN uses three methods with strong research behind them: testing yourself, spacing your reviews, and drilling weak areas. Each part below feeds the next.</p>
      <section><h2>1. Retrieval practice</h2><div class="card"><p>Every session starts with a question, not a lecture. You commit to an answer, then read the rationale. Practice includes standard multiple-choice, multiple response, and dosage calculation items, plus Next Generation NCLEX (NGN) formats: matrix, bow-tie, cloze, highlight, and drag-and-drop.</p></div></section>
      <section><h2>2. Spaced repetition</h2><div class="card"><p>What you miss comes back on a real calendar date, right before you'd forget it. You recall the answer before it's shown. Cards you know move further out.</p></div></section>
      <section><h2>3. Adaptive practice</h2><div class="card"><p>PulseRN tracks your results across the eight NCSBN Client Needs categories and focuses practice on your weaker areas. PulseRN updates its estimate of your level after every answer and picks the next question from it.</p></div></section>
      <section><h2>4. A plan for each day</h2><div class="card"><p>A Today round puts due cards and adaptive questions in one session. Set an exam date and the weekly plan is built around it. Readiness self-assessments use fixed 85-question forms, and each form is shown once per account.</p></div></section>
      <section><h2>5. The study library</h2><div class="card"><p>The library includes 10,000+ practice questions, 500+ case studies, 1,100+ flashcards, dosage calculation practice, and an AI tutor for another explanation after you answer.</p></div></section>
      <p class="meta">Written by <a href="${AUTHOR}">${esc(AUTHOR_LABEL)}</a>. For scoring and content-review details, read the <a href="/methodology/">methodology</a> and <a href="/editorial-policy/">editorial policy</a>.</p>`,
  },
  {
    slug: "methodology", title: "How PulseRN scores practice and readiness", eyebrow: "Methods and limits", h1: "The methods behind PulseRN, and their limits.", purpose: true,
    description: "How PulseRN uses retrieval practice, spaced repetition, adaptive questions, and a readiness estimate built from your work in the app.",
    body: `<p class="lead">Written by Sheldon Bennett, RN. This page explains the methods PulseRN uses, how readiness is estimated, and what the estimate can't tell you.</p>
      <section><h2>Retrieval practice</h2><div class="card"><p>Each session opens with a question. You commit to an answer before you see the rationale or the back of the card.</p></div></section>
      <section><h2>Adaptive practice</h2><div class="card"><p>Question difficulty is selected from a learner-ability estimate built from prior answers. Practice is sequenced across the eight NCSBN Client Needs categories and steered toward the categories where the estimate is lowest, without dropping the others.</p></div></section>
      <section><h2>Spaced repetition</h2><div class="card"><p>Flashcards and missed questions are scheduled on calendar dates from recall feedback. An item you miss returns sooner. An item you know moves further out.</p></div></section>
      <section><h2>A daily round and a weekly plan</h2><div class="card"><p>The Today round combines due flashcards with adaptive questions. A weekly plan is built around the exam date once that date is set.</p></div></section>
      <section><h2>Content coverage</h2><div class="card"><p>Practice is organized around NCSBN's published NCLEX-RN test plan and includes standard and Next Generation item formats, dosage calculation, and case studies. PulseRN does not use or claim access to live exam questions. Practice questions, case studies, flashcards, and readiness items pass automated quality checks before they go live. Public study guides are a separate set: each approved guide has an RN review record bound to the exact page.</p></div></section>
      <section><h2>Readiness estimates</h2><div class="card"><p>Self-assessments use 85-question forms, and each form is shown once per account. Your readiness score comes from your own answers and tells you what to review next. It appears once you've answered at least 12 questions. It is an estimate, not a prediction of your exam result. ${esc(GRADING_NOTE)}</p></div></section>
      <section><h2>Limits</h2><ul><li>PulseRN is not affiliated with or endorsed by NCSBN.</li><li>Practice performance can be affected by content exposure, study conditions, and other factors.</li><li>Educational content is not medical advice and should not replace current clinical policies or instruction.</li></ul></section>
      <section><h2>Primary framework</h2><ul class="sources"><li><a href="https://www.nclex.com/test-plans.page" rel="external">NCSBN NCLEX test plans</a></li><li><a href="https://www.nclex.com/next-generation-nclex.page" rel="external">NCSBN Next Generation NCLEX information</a></li></ul></section>
      <p class="meta">Written by <a href="${AUTHOR}">${esc(AUTHOR_LABEL)}</a>. ${REVIEWER_VERIFIED ? `His Florida RN license can be checked on the <a href="${esc(REVIEW_LEDGER.reviewer.verificationUrl)}" rel="external">${LICENSE_LOOKUP_LABEL}</a>.` : "Independent credential verification is pending."}</p>`,
  },
  {
    slug: "editorial-policy", title: "Editorial and clinical review policy", eyebrow: "Content governance", h1: "How PulseRN's study content is built and checked.",
    description: "How PulseRN builds practice from the NCSBN test plan, checks items automatically, has an RN review public guides against their sources, and handles corrections.",
    body: `<p class="lead">PulseRN is educational material for NCLEX-RN preparation, built by Sheldon Bennett, RN. This page explains how content is written, checked, and corrected.</p>
      <section><h2>Authorship and accountability</h2><div class="card"><p>${esc(AUTHOR_LABEL.includes(",") ? `${AUTHOR_LABEL},` : AUTHOR_LABEL)} is the founder and content owner. ${esc(AUTHOR_SENTENCE)} Public guides show versioned source, content-digest, reviewer, and review-status evidence. A guide counts as approved when that evidence is in place.</p></div></section>
      <section><h2>Source hierarchy</h2><div class="card"><p>Exam-format claims prioritize NCSBN materials. Clinical content on the public guides favors current primary or authoritative sources such as government health agencies, official professional guidance, and peer-reviewed evidence. Sources are linked where they materially support a guide.</p></div></section>
      <section><h2>Practice items and AI assistance</h2><div class="card"><p>AI may assist with drafting practice items and with on-demand tutoring. Practice questions, case studies, flashcards, and readiness items are built around NCSBN's published test plan and pass automated quality checks before they go live. Sheldon Bennett, RN, can correct or remove any item. Public study guides are separate: each approved guide has an RN review record bound to the exact page.</p></div></section>
      <section><h2>Claims and safety</h2><ul><li>Practice items are original, built around the published test plan, and kept separate from live NCLEX content.</li><li>Readiness is an estimate, not a prediction of your exam result.</li><li>Educational content is exam preparation, and it stays separate from patient-specific medical advice.</li><li>Material uncertainty or conflicting guidance must be surfaced, not hidden.</li></ul></section>
      <section><h2>Corrections</h2><div class="card"><p>Substantive corrections will update the affected page, its review date, and its cited support. Questions or correction requests can be sent to <a href="mailto:sheldon@pulsern.app">sheldon@pulsern.app</a>.</p></div></section>
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

writeFileSync("public/404.html", notFoundPage());
writeFileSync("public/about/index.html", aboutPage());

writeFileSync("public/comparison-evidence.json", JSON.stringify(evidence, null, 2) + "\n");
writeFileSync("public/commercial-search-intents.json", JSON.stringify({ schemaVersion: 1, generatedAt: evidence.generatedAt, intents: Object.fromEntries(evidence.pages.map((item) => [item.route, item.intent])) }, null, 2) + "\n");
if (!COMMERCIAL_PAGES.some((item) => item.slug === "compare" || item.slug.startsWith("compare/"))) rmSync("public/compare", { recursive: true, force: true });

writeFileSync("public/release.json", JSON.stringify({
  schemaVersion: 1,
  commitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local-unbound",
  source: process.env.VERCEL_GIT_COMMIT_SHA ? "vercel" : process.env.GITHUB_SHA ? "github" : "local",
}, null, 2) + "\n");

console.log(`built ${pages.length} public product/trust pages and ${COMMERCIAL_PAGES.length} commercial-intent pages`);
