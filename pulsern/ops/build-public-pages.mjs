/* Build the public product and trust pages that search engines, answer engines,
   agents, and prospective learners need before entering the authenticated app. */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { PLANS, fmtUsd } from "../src/pricing.js";

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
  main{padding:64px 0 80px}.eyebrow{color:var(--teal);font-size:12px;font-weight:850;letter-spacing:.09em;text-transform:uppercase}h1{font-size:clamp(38px,7vw,62px);line-height:1.04;letter-spacing:-.045em;max-width:800px;margin:12px 0 18px}h2{font-size:27px;line-height:1.15;letter-spacing:-.025em;margin:42px 0 14px}h3{font-size:18px;margin:0 0 6px}p,li{color:#304a44}.lead{font-size:19px;max-width:760px}.card{background:var(--white);border:1px solid var(--line);border-radius:15px;padding:22px;margin:14px 0}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.grid .card{margin:0}.callout{background:var(--pale);border-left:4px solid var(--teal);border-radius:0 13px 13px 0;padding:18px 20px;margin:26px 0}.button{display:inline-block;border:0;border-radius:10px;background:var(--teal);color:white;text-decoration:none;font-weight:750;padding:11px 17px;margin:10px 8px 0 0}.button.alt{background:white;color:#0e6e5c;border:1px solid #b9d2ca}.meta{font-size:13px;color:#526b65}.price{font-size:30px;font-weight:850;color:var(--ink)}.price small{font-size:13px;color:var(--muted);font-weight:500}.best{border:2px solid var(--teal);position:relative}.tag{display:inline-block;background:var(--teal);color:white;border-radius:99px;padding:3px 9px;font-size:11px;font-weight:800;margin-bottom:12px}table{width:100%;border-collapse:collapse;background:white;border:1px solid var(--line)}th,td{text-align:left;padding:12px;border-bottom:1px solid var(--line)}th{color:#0b6557}.sources li{margin-bottom:7px}footer{background:#0b2a25;color:#c7ddd7;padding:34px 0;font-size:12px}footer p{color:#96b3ab}.footlinks{display:flex;flex-wrap:wrap;gap:14px}.footlinks a{color:#d9ebe6}
  @media(max-width:650px){.links a:not(:last-child){display:none}.grid{grid-template-columns:1fr}main{padding-top:42px}h1{font-size:42px}table{font-size:13px}th,td{padding:9px}}
`;

function page({ slug, title, description, eyebrow, h1, body, schema }) {
  const url = `${SITE}/${slug}/`;
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#page`, url, name: title, description, inLanguage: "en-US", isPartOf: { "@id": `${SITE}/#website` }, about: { "@id": `${SITE}/#app` }, author: { "@id": AUTHOR } },
      { "@type": "Person", "@id": AUTHOR, name: AUTHOR_LABEL, url: AUTHOR, worksFor: { "@id": `${SITE}/#org` }, ...(REVIEWER_VERIFIED ? { jobTitle: REVIEW_LEDGER.reviewer.licenseType, sameAs: [REVIEW_LEDGER.reviewer.verificationUrl] } : {}) },
      ...(schema ? [schema] : []),
    ],
  };
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | PulseRN</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}"><link rel="icon" type="image/svg+xml" href="/icon.svg"><meta name="theme-color" content="#0E7C6B"><meta property="og:type" content="website"><meta property="og:site_name" content="PulseRN"><meta property="og:url" content="${url}"><meta property="og:title" content="${esc(title)} | PulseRN"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${SITE}/og.png"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${JSON.stringify(jsonld)}</script><style>${CSS}</style></head><body>
  <header class="wrap"><nav class="nav" aria-label="Primary navigation"><a class="brand" href="/">PulseRN</a><div class="links"><a href="/how-it-works/">How it works</a><a href="/learn/">Guides</a><a href="/pricing/">Pricing</a><a href="/?signin=1">Sign in</a></div></nav></header>
  <main class="wrap"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(h1)}</h1>${body}
  <div class="callout"><strong>Ready for a focused study session?</strong><br><a class="button" href="/?start=1">Start the 1-day free pass</a><a class="button alt" href="/learn/">Read the nursing-study guides</a></div></main>
  <footer><div class="wrap"><div class="footlinks"><a href="/">Home</a><a href="/pricing/">Pricing</a><a href="/methodology/">Methodology</a><a href="/editorial-policy/">Editorial policy</a><a href="/about/">About</a><a href="/legal/">Terms · Privacy · Disclaimer</a></div><p>Educational exam preparation only — not medical advice or a clinical reference. NCLEX® is a registered trademark of NCSBN, which is not affiliated with and does not endorse PulseRN.</p></div></footer></body></html>`;
}

const paid = PLANS.filter((p) => !p.addon && p.cents > 0);
const addons = PLANS.filter((p) => p.addon);
const offers = PLANS.filter((p) => !p.addon).map((p) => ({
  "@type": "Offer", name: p.name, price: (p.cents / 100).toFixed(2), priceCurrency: "USD", availability: "https://schema.org/InStock", url: `${SITE}/pricing/`, description: p.blurb,
}));

const pages = [
  {
    slug: "pricing", title: "NCLEX-RN prep pricing", eyebrow: "Clear pricing", h1: "Choose the study window that fits your plan.",
    description: "Compare PulseRN NCLEX-RN prep access from a free 1-day pass to 30-, 60-, 90-, 180-, 360-, and 730-day plans.",
    schema: { "@type": "Product", "@id": `${SITE}/#app`, name: "PulseRN", description: "Adaptive NCLEX-RN exam preparation", brand: { "@type": "Brand", name: "PulseRN" }, offers },
    body: `<p class="lead">Every paid plan includes full study access and a stated number of readiness self-assessments. The free pass includes study content but no readiness self-assessment.</p>
      <section aria-labelledby="plans"><h2 id="plans">Access plans</h2><div class="grid">
      <article class="card"><span class="tag">Free</span><h3>1-Day Free Pass</h3><p class="price">$0</p><p>Unlimited study-content access for 24 hours. Readiness self-assessments are not included.</p></article>
      ${paid.map((p) => `<article class="card${p.id === "sub90" ? " best" : ""}">${p.id === "sub90" ? '<span class="tag">Popular study window</span>' : ""}<h3>${esc(p.name)}</h3><p class="price">${esc(fmtUsd(p.cents))} <small>USD</small></p><p>${esc(p.blurb)}</p><p class="meta">${p.exams} readiness self-assessment${p.exams === 1 ? "" : "s"}</p></article>`).join("")}</div></section>
      <section><h2>Optional add-ons</h2><table><thead><tr><th>Add-on</th><th>What it adds</th><th>Price</th></tr></thead><tbody>${addons.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.blurb)}</td><td>${esc(fmtUsd(p.cents))} USD</td></tr>`).join("")}</tbody></table></section>
      <div class="callout"><strong>Important:</strong> A readiness result is an educational estimate based on activity inside PulseRN. It is not a prediction or guarantee of an NCLEX outcome.</div>`,
  },
  {
    slug: "how-it-works", title: "How PulseRN works", eyebrow: "Product walkthrough", h1: "A transparent loop from practice to review.",
    description: "See how PulseRN combines adaptive NCLEX-RN practice, Next Gen item types, spaced repetition, case studies, and readiness estimates.",
    body: `<p class="lead">PulseRN organizes study activity into a repeatable four-part loop. You choose the focus; the system uses your work to recommend what deserves attention next.</p>
      <section><h2>1. Practice in context</h2><div class="card"><p>Choose mixed practice or a client-needs category. Questions include standard multiple choice and Next Generation NCLEX formats such as matrix, bow-tie, cloze, highlight, and multiple response.</p></div></section>
      <section><h2>2. Review after committing</h2><div class="card"><p>Answer first, then review the rationale. The goal is not merely to expose the correct choice; it is to make the priority, safety, or clinical-judgment principle explicit.</p></div></section>
      <section><h2>3. Return to weak knowledge</h2><div class="card"><p>Adaptive difficulty responds to demonstrated performance. Recall-first flashcards use calendar-based spaced repetition so review returns over time instead of staying in one long session.</p></div></section>
      <section><h2>4. Interpret progress carefully</h2><div class="card"><p>Readiness self-assessments use standardized 85-question forms that are not repeated. Any readiness result is labeled as an estimate and does not predict or guarantee an exam result.</p></div></section>
      <p class="meta">Product description owner: <a href="${AUTHOR}">${esc(AUTHOR_LABEL)}</a>. For the scoring and content-governance details, read the <a href="/methodology/">methodology</a> and <a href="/editorial-policy/">editorial policy</a>.</p>`,
  },
  {
    slug: "methodology", title: "PulseRN methodology", eyebrow: "Methods and limitations", h1: "What PulseRN measures—and what it does not.",
    description: "Learn how PulseRN approaches adaptive practice, spaced repetition, readiness estimates, content coverage, and important limitations.",
    body: `<p class="lead">PulseRN is an educational practice system. Its methods are designed to guide study decisions inside the product, not to diagnose a learner or predict a licensing result.</p>
      <section><h2>Adaptive practice</h2><div class="card"><p>Question difficulty is selected using a learner-ability estimate derived from prior answers. This is used to sequence practice. It is not presented as an official NCLEX score.</p></div></section>
      <section><h2>Content coverage</h2><div class="card"><p>Practice is organized across the eight NCSBN client-needs categories and includes standard and Next Generation item formats. Coverage is informed by the published NCLEX-RN test plan; PulseRN does not use or claim access to live exam questions.</p></div></section>
      <section><h2>Spaced repetition</h2><div class="card"><p>Flashcards are scheduled on calendar dates using recall feedback. An active retrieval step comes before the answer is revealed.</p></div></section>
      <section><h2>Readiness estimates</h2><div class="card"><p>Self-assessments use 85-question forms and never repeat a form for the same account. Results are deliberately described as estimates, require sufficient answered material, and never promise a pass outcome.</p></div></section>
      <section><h2>Limits</h2><ul><li>PulseRN is not affiliated with or endorsed by NCSBN.</li><li>Practice performance can be affected by content exposure, study conditions, and other factors.</li><li>Educational content is not medical advice and should not replace current clinical policies or instruction.</li></ul></section>
      <section><h2>Primary framework</h2><ul class="sources"><li><a href="https://www.nclex.com/test-plans.page" rel="external">NCSBN NCLEX test plans</a></li><li><a href="https://www.nclex.com/next-generation-nclex.page" rel="external">NCSBN Next Generation NCLEX information</a></li></ul></section>
      <p class="meta">Method owner: <a href="${AUTHOR}">${esc(AUTHOR_LABEL)}</a>. ${REVIEWER_VERIFIED ? "Reviewer identity is linked to public verification evidence." : "Independent credential verification is pending."}</p>`,
  },
  {
    slug: "editorial-policy", title: "Editorial and clinical review policy", eyebrow: "Content governance", h1: "A human-owned review process for nursing education.",
    description: "Read PulseRN's policy for authorship, clinical review, source use, AI assistance, corrections, and educational safety.",
    body: `<p class="lead">PulseRN content is educational material for NCLEX-RN preparation. Clinical responsibility stays with the named human owner and reviewer.</p>
      <section><h2>Authorship and accountability</h2><div class="card"><p>${esc(AUTHOR_LABEL)} is identified as the creator and content owner. Public guides expose versioned source, content-digest, reviewer, and review-status evidence. No guide is treated as clinically approved while that evidence is pending.</p></div></section>
      <section><h2>Source hierarchy</h2><div class="card"><p>Exam-format claims prioritize NCSBN materials. Clinical content should favor current primary or authoritative sources such as government health agencies, official professional guidance, and peer-reviewed evidence. Sources are linked where they materially support a guide.</p></div></section>
      <section><h2>AI assistance</h2><div class="card"><p>AI may assist with drafting, critique, or explanation. It is not the accountable author. Generated clinical or educational content must pass automated checks and human RN review before publication.</p></div></section>
      <section><h2>Claims and safety</h2><ul><li>PulseRN never claims its questions are identical to live NCLEX content.</li><li>Readiness is never presented as an outcome guarantee.</li><li>Educational content is never framed as patient-specific medical advice.</li><li>Material uncertainty or conflicting guidance must be surfaced, not hidden.</li></ul></section>
      <section><h2>Corrections</h2><div class="card"><p>Substantive corrections should update the affected page, its review date, and its cited support. Questions or correction requests can be sent to <a href="mailto:sheldon@pulsern.app">sheldon@pulsern.app</a>.</p></div></section>
      <p class="meta">Policy owner: <a href="${AUTHOR}">${esc(AUTHOR_LABEL)}</a>.</p>`,
  },
];

for (const data of pages) {
  const directory = `public/${data.slug}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/index.html`, page(data));
}

console.log(`built ${pages.length} public product and trust pages`);
