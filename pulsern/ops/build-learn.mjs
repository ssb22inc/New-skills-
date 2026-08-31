/* Builds the /learn/ guide library into static HTML under public/learn/.

   These pages exist to be found — by search engines, by AI answer engines, and
   by students searching a specific question at 1am. They deliberately do NOT
   live inside the React app: no route, no bundle weight, no new UI. The app
   stays exactly as clean as it is, and these are plain documents that load
   instantly and index perfectly.

   Run: node ops/build-learn.mjs   (also run by `npm run build:learn`) */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ARTICLES } from "./learn-content.mjs";
import { MANIFEST_GENERATED_AT, POLICY_VERSION, SEARCH_INTENTS, intentFor, sourcesFor } from "./seo-content-policy.mjs";
import { COMMERCIAL_PAGES } from "./commercial-content.mjs";

const SITE = "https://www.pulsern.app";
const OUT = "public/learn";
const AUTHOR_URL = `${SITE}/about/#sheldon-bennett-rn`;

const REVIEW_LEDGER = JSON.parse(readFileSync(new URL("../content-review-records.json", import.meta.url), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function provenanceFor(article) {
  const sources = sourcesFor(article);
  const intent = intentFor(article);
  const contentSha256 = sha256(JSON.stringify({ title: article.title, h1: article.h1 ?? article.title, description: article.description, body: article.body, faq: article.faq ?? [] }));
  const sourceSetSha256 = sha256(JSON.stringify(sources.map(({ id, url, locator }) => ({ id, url, locator }))));
  const recorded = REVIEW_LEDGER.reviews?.[article.slug] ?? {};
  const reviewer = REVIEW_LEDGER.reviewer ?? {};
  const approved = reviewer.verificationStatus === "verified"
    && /^https:\/\//.test(reviewer.verificationUrl ?? "")
    && recorded.decision === "approved"
    && recorded.reviewerId === reviewer.id
    && recorded.contentSha256 === contentSha256
    && recorded.sourceSetSha256 === sourceSetSha256
    && /^\d{4}-\d{2}-\d{2}$/.test(recorded.reviewedAt ?? "")
    && Array.isArray(recorded.claims)
    && recorded.claims.length > 0
    && recorded.claims.every((claim) => claim.id && claim.locator && Array.isArray(claim.sourceIds) && claim.sourceIds.length > 0);
  return {
    route: `/learn/${article.slug}/`,
    risk: intent?.risk ?? "unmapped",
    intent,
    contentSha256,
    sourceSetSha256,
    sources,
    review: {
      decision: approved ? "approved" : "pending",
      reviewerId: recorded.reviewerId ?? null,
      reviewedAt: recorded.reviewedAt ?? null,
      scope: recorded.scope ?? null,
      claims: recorded.claims ?? [],
      evidenceMatchesContent: recorded.contentSha256 === contentSha256 && recorded.sourceSetSha256 === sourceSetSha256,
    },
  };
}

/* The original guide bank was drafted with mixed U.K./U.S. spelling. PulseRN
   serves U.S. NCLEX candidates, so normalize the small, known vocabulary set
   at build time without mutating slugs, clinical notation, or source files. */
const usEnglish = (html) => html
  .replace(/clinical judgement/gi, (m) => m[0] === "C" ? "Clinical judgment" : "clinical judgment")
  .replace(/judgement/g, "judgment").replace(/Judgement/g, "Judgment")
  .replace(/prioritisation/g, "prioritization").replace(/Prioritisation/g, "Prioritization")
  .replace(/prioritise/g, "prioritize").replace(/recognise/g, "recognize")
  .replace(/Prioritise/g, "Prioritize").replace(/Recognise/g, "Recognize")
  .replace(/practising/g, "practicing").replace(/practised/g, "practiced").replace(/practise/g, "practice")
  .replace(/Practising/g, "Practicing").replace(/Practised/g, "Practiced").replace(/Practise/g, "Practice")
  .replace(/\blabelled\b/g, "labeled").replace(/rigour/g, "rigor")
  .replace(/centre/g, "center").replace(/Centre/g, "Center").replace(/behaviour/g, "behavior")
  .replace(/memorise/g, "memorize").replace(/standardised/g, "standardized");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Shared look, lifted from /about/ so the guides read as part of the same
   product rather than a bolted-on blog. */
const CSS = `
  :root { --paper:#F3F6F4; --ink:#0F2E29; --card:#FFFFFF; --muted:#3B554F; --line:#D8E2DD; --teal:#0E7C6B; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--paper); color:var(--ink); font-family:system-ui,-apple-system,"Segoe UI",sans-serif; max-width:720px; margin:0 auto; padding:28px 18px 60px; line-height:1.6; }
  h1 { font-size:26px; margin-bottom:6px; letter-spacing:-.01em; } h1 b { color:var(--teal); }
  h2 { font-size:18px; margin:26px 0 8px; color:var(--teal); }
  h3 { font-size:15px; margin:18px 0 6px; }
  p, li { font-size:15.5px; color:#2a3833; margin-bottom:10px; }
  ul, ol { padding-left:22px; margin-bottom:12px; }
  a { color:var(--teal); }
  .sub { color:var(--muted); font-size:13px; margin-bottom:18px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:14px; }
  .back { display:inline-block; margin-bottom:14px; font-weight:600; text-decoration:none; }
  .meta { color:var(--muted); font-size:13px; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; margin-bottom:12px; font-size:14.5px; }
  th, td { text-align:left; padding:7px 9px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--teal); font-weight:600; }
  caption { color:var(--ink); font-weight:700; padding:0 0 8px; text-align:left; }
  .table-wrap { overflow-x:auto; margin-bottom:14px; border:1px solid var(--line); border-radius:8px; }
  .table-wrap:focus { outline:3px solid #8CCFC3; outline-offset:2px; }
  .table-wrap table { min-width:620px; margin-bottom:0; }
  .source-note { color:var(--muted); font-size:13px; }
  .key { background:#EAF4F0; border-left:3px solid var(--teal); padding:12px 14px; border-radius:0 8px 8px 0; margin-bottom:12px; }
  .key p:last-child { margin-bottom:0; }
  .cta { background:var(--card); border:1px solid var(--line); border-left:3px solid var(--teal); border-radius:12px; padding:18px 20px; margin:22px 0 14px; }
  .cta p { margin-bottom:8px; } .cta p:last-child { margin-bottom:0; }
  .rel { list-style:none; padding:0; } .rel li { margin-bottom:6px; }
  .foot { font-size:12.5px; color:var(--muted); margin-top:8px; }
  .idx { list-style:none; padding:0; } .idx li { margin-bottom:14px; }
  .idx a { font-weight:600; font-size:15.5px; text-decoration:none; }
  .idx p { font-size:14px; color:var(--muted); margin:2px 0 0; }
  .question { border-top:1px solid var(--line); padding-top:4px; margin-top:22px; }
  .question:first-of-type { border-top:0; margin-top:0; }
  .options { margin:10px 0 14px; }
  details { background:#F7FAF8; border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin-bottom:14px; }
  summary { color:var(--teal); cursor:pointer; font-weight:700; }
  details p { margin:10px 0 0; }
`;

const DISCLAIMER =
  'Educational exam preparation only — not medical advice and not a clinical reference. ' +
  'Always follow your own institution\'s policies and your instructors\' guidance. ' +
  'NCLEX&reg; is a registered trademark of the National Council of State Boards of Nursing, Inc. (NCSBN), ' +
  'which is not affiliated with and does not endorse this product.';

function head({ title, description, url, jsonld }) {
  return `<!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<meta name="theme-color" content="#0E7C6B">
<meta property="og:type" content="article">
<meta property="og:site_name" content="PulseRN">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/og.png">
<script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
</script>
<style>${CSS}</style>
</head>
<body>`;
}

export function articleJsonLd(a, url, provenance) {
  const citations = provenance.sources;
  const reviewer = REVIEW_LEDGER.reviewer;
  const person = {
    "@type": "Person",
    "@id": AUTHOR_URL,
    name: reviewer.displayName,
    url: AUTHOR_URL,
    worksFor: { "@id": `${SITE}/#org` },
  };
  if (reviewer.verificationStatus === "verified" && reviewer.verificationUrl) {
    person.name = `${reviewer.displayName}, ${reviewer.credential}`;
    person.jobTitle = reviewer.licenseType;
    person.sameAs = [reviewer.verificationUrl];
    person.hasCredential = { "@type": "EducationalOccupationalCredential", credentialCategory: reviewer.licenseType, recognizedBy: reviewer.licenseJurisdiction };
  }
  const graph = [
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: a.title,
      description: a.description,
      url,
      inLanguage: "en-US",
      datePublished: a.published,
      dateModified: a.updated,
      author: { "@id": `${SITE}/#org` },
      ...(provenance.review.decision === "approved" ? { reviewedBy: { "@id": AUTHOR_URL } } : {}),
      publisher: { "@type": "Organization", "@id": `${SITE}/#org`, name: "PulseRN", url: SITE, logo: `${SITE}/icon-512.png` },
      isPartOf: { "@type": "WebSite", name: "PulseRN", url: SITE },
      about: { "@type": "Thing", name: "NCLEX-RN examination preparation" },
      citation: citations.map((source) => source.url),
      identifier: `sha256:${provenance.contentSha256}`,
      sdPublisher: { "@id": `${SITE}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: "PulseRN",
      url: SITE,
      logo: `${SITE}/icon-512.png`,
    },
    ...(provenance.review.decision === "approved" ? [person] : []),
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#crumbs`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "PulseRN", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE}/learn/` },
        { "@type": "ListItem", position: 3, name: a.title, item: url },
      ],
    },
  ];
  if (a.faq?.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: a.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/* Three related guides, chosen by shared topic then filled from the rest, so
   every page links onward and nothing is orphaned. */
function related(a, all) {
  const same = all.filter((x) => x.slug !== a.slug && x.topic === a.topic);
  const rest = all.filter((x) => x.slug !== a.slug && x.topic !== a.topic);
  return [...same, ...rest].slice(0, 3);
}

function renderArticle(a, all, provenance) {
  const url = `${SITE}/learn/${a.slug}/`;
  const rel = related(a, all);
  const sources = sourcesFor(a);
  const faq = a.faq?.length
    ? `<div class="card"><h2 style="margin-top:0">Common questions</h2>${a.faq
        .map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`)
        .join("")}</div>`
    : "";

  const clinical = provenance.risk === "clinical";
  const reviewLine = provenance.review.decision === "approved"
    ? `${clinical ? "clinically reviewed" : "reviewed"} <time datetime="${esc(provenance.review.reviewedAt)}">${esc(provenance.review.reviewedAt)}</time> by <a href="/about/#sheldon-bennett-rn">${esc(REVIEW_LEDGER.reviewer.displayName)}, ${esc(REVIEW_LEDGER.reviewer.credential)}</a>`
    : `last updated <time datetime="${esc(a.updated)}">${esc(a.updated)}</time> &middot; ${clinical ? "clinical" : "editorial"} review evidence pending`;
  return usEnglish(`${head({ title: `${a.title} | PulseRN`, description: a.description, url, jsonld: articleJsonLd(a, url, provenance) })}
<main>
<a class="back" href="/learn/">&larr; All guides</a>
<article>
<h1>${esc(a.h1 ?? a.title)}</h1>
<p class="meta">${esc(a.topic)} &middot; published <time datetime="${esc(a.published)}">${esc(a.published)}</time> &middot; ${reviewLine}</p>

<div class="card">${a.body}</div>
${faq}
<div class="card">
  <h2 style="margin-top:0">Sources and further reading</h2>
  <ul>${sources.map((source) => `<li id="source-${esc(source.id)}"><a href="${source.url}" rel="external noopener">${esc(source.title)}</a> — ${esc(source.publisher)}; evidence locator: ${esc(source.locator)}${source.sourceUpdated ? `; source updated <time datetime="${esc(source.sourceUpdated)}">${esc(source.sourceUpdated)}</time>` : ""}; accessed <time datetime="${esc(source.accessedAt)}">${esc(source.accessedAt)}</time></li>`).join("")}</ul>
</div>
<div class="cta">
  <p><b>Practice this for real.</b> ${esc(a.cta ?? "PulseRN drills this with adaptive questions that adjust to your level, every Next Gen item type, and full-length readiness exams.")}</p>
  <p><a href="/">Start studying on PulseRN &rarr;</a></p>
</div>

<div class="card">
  <h2 style="margin-top:0">Keep reading</h2>
  <ul class="rel">${rel.map((r) => `<li><a href="/learn/${r.slug}/">${esc(r.title)}</a></li>`).join("")}</ul>
</div>
</article>
</main>

<footer><p class="foot">${DISCLAIMER} <a href="/legal/">Terms &middot; Privacy &middot; Disclaimer</a> &middot; <a href="/about/">About</a> &middot; <a href="/editorial-policy/">Editorial policy</a></p></footer>
</body>
</html>
`);
}

function renderIndex(all) {
  const url = `${SITE}/learn/`;
  const topics = [...new Set(all.map((a) => a.topic))];
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: "NCLEX-RN guides",
        description: "Straight answers on how the NCLEX-RN works and how to study for it, with transparent sources and explicit clinical-review status.",
        isPartOf: { "@type": "WebSite", name: "PulseRN", url: SITE },
        author: { "@id": `${SITE}/#org` },
      },
      {
        "@type": "ItemList",
        "@id": `${url}#list`,
        itemListElement: all.map((a, i) => ({
          "@type": "ListItem", position: i + 1, name: a.title, url: `${SITE}/learn/${a.slug}/`,
        })),
      },
    ],
  };

  const sections = topics.map((t) => `
  <div class="card">
    <h2 style="margin-top:0">${esc(t)}</h2>
    <ul class="idx">${all.filter((a) => a.topic === t).map((a) => `
      <li><a href="/learn/${a.slug}/">${esc(a.title)}</a><p>${esc(a.description)}</p></li>`).join("")}
    </ul>
  </div>`).join("");

  return usEnglish(`${head({
    title: "NCLEX-RN guides — how the exam works and how to study | PulseRN",
    description: REVIEW_LEDGER.reviewer.verificationStatus === "verified" ? "Straight answers on NCLEX scoring, Next Gen item types, dosage calculation, lab values, prioritization and delegation by a verified RN." : "Straight answers on NCLEX scoring, Next Gen item types and study topics, with transparent sources and clinical-review status.",
    url, jsonld,
  })}
<main><a class="back" href="/">&larr; Back to PulseRN</a>
<h1>NCLEX-RN <b>guides</b></h1>
<p class="sub">Straight answers owned by <a href="/about/#sheldon-bennett-rn">${esc(REVIEW_LEDGER.reviewer.displayName)}</a>, with explicit source and clinical-review status. No fluff, no false promises.</p>
${sections}
</main><footer><p class="foot">${DISCLAIMER} <a href="/legal/">Terms &middot; Privacy &middot; Disclaimer</a> &middot; <a href="/about/">About</a> &middot; <a href="/editorial-policy/">Editorial policy</a></p></footer>
</body>
</html>
`);
}

/* ---- build ---- */
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const slugs = new Set();
const provenance = [];
for (const a of ARTICLES) {
  if (slugs.has(a.slug)) throw new Error(`duplicate slug: ${a.slug}`);
  slugs.add(a.slug);
  for (const k of ["slug", "title", "description", "topic", "body", "published", "updated"]) {
    if (!a[k]) throw new Error(`article ${a.slug || "(no slug)"} is missing ${k}`);
  }
  if (a.description.length > 165) throw new Error(`${a.slug}: description too long for a search snippet (${a.description.length})`);
  const record = provenanceFor(a);
  provenance.push(record);
  mkdirSync(`${OUT}/${a.slug}`, { recursive: true });
  writeFileSync(`${OUT}/${a.slug}/index.html`, renderArticle(a, ARTICLES, record));
}
writeFileSync(`${OUT}/index.html`, renderIndex(ARTICLES));
writeFileSync("public/content-provenance.json", JSON.stringify({ schemaVersion: POLICY_VERSION, generatedAt: `${MANIFEST_GENERATED_AT}T00:00:00.000Z`, reviewer: REVIEW_LEDGER.reviewer, guides: provenance }, null, 2) + "\n");
writeFileSync("public/search-intents.json", JSON.stringify({ schemaVersion: POLICY_VERSION, generatedAt: `${MANIFEST_GENERATED_AT}T00:00:00.000Z`, intents: SEARCH_INTENTS }, null, 2) + "\n");

/* Sitemap covers the app pages plus every guide, so nothing relies on the
   crawler finding its own way in. */
const urls = [
  { loc: `${SITE}/`, freq: "weekly", pri: "1.0" },
  { loc: `${SITE}/learn/`, freq: "weekly", pri: "0.9" },
  { loc: `${SITE}/pricing/`, freq: "monthly", pri: "0.9" },
  { loc: `${SITE}/how-it-works/`, freq: "monthly", pri: "0.8" },
  { loc: `${SITE}/methodology/`, freq: "monthly", pri: "0.8" },
  { loc: `${SITE}/editorial-policy/`, freq: "monthly", pri: "0.8" },
  { loc: `${SITE}/about/`, freq: "monthly", pri: "0.7" },
  { loc: `${SITE}/legal/`, freq: "yearly", pri: "0.3" },
  ...COMMERCIAL_PAGES.map((page) => ({ loc: `${SITE}/${page.slug}/`, freq: "monthly", pri: page.slug === "compare" ? "0.9" : "0.8", lastmod: page.updated })),
  ...ARTICLES.map((a) => ({ loc: `${SITE}/learn/${a.slug}/`, freq: "monthly", pri: "0.8", lastmod: a.updated })),
];
const today = ARTICLES.reduce((m, a) => (a.updated > m ? a.updated : m), "2026-08-03");
writeFileSync("public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod ?? today}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`).join("\n")}
</urlset>
`);

console.log(`built ${ARTICLES.length} guides + index + sitemap (${urls.length} urls)`);
