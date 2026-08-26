/* Builds the /learn/ guide library into static HTML under public/learn/.

   These pages exist to be found — by search engines, by AI answer engines, and
   by students searching a specific question at 1am. They deliberately do NOT
   live inside the React app: no route, no bundle weight, no new UI. The app
   stays exactly as clean as it is, and these are plain documents that load
   instantly and index perfectly.

   Run: node ops/build-learn.mjs   (also run by `npm run build:learn`) */

import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { ARTICLES } from "./learn-content.mjs";

const SITE = "https://www.pulsern.app";
const OUT = "public/learn";
const AUTHOR_URL = `${SITE}/about/#sheldon-bennett-rn`;

const SOURCES = {
  testPlan: { title: "NCSBN — NCLEX test plans", url: "https://www.nclex.com/test-plans.page" },
  ngn: { title: "NCSBN — Next Generation NCLEX", url: "https://www.nclex.com/next-generation-nclex.page" },
  candidate: { title: "NCSBN — NCLEX candidate bulletin", url: "https://www.nclex.com/candidate-bulletin.page" },
  cdcIsolation: { title: "CDC — Isolation Precautions Guideline", url: "https://www.cdc.gov/infection-control/hcp/isolation-precautions/index.html" },
  ismp: { title: "ISMP — High-Alert Medications in Acute Care Settings", url: "https://www.ismp.org/Tools/institutionalhighAlert.asp" },
  bloodGas: { title: "MedlinePlus — Blood Gases", url: "https://medlineplus.gov/lab-tests/blood-gases/" },
  electrolytes: { title: "MedlinePlus — Electrolyte Panel", url: "https://medlineplus.gov/lab-tests/electrolyte-panel/" },
  labTests: { title: "MedlinePlus — Medical Tests", url: "https://medlineplus.gov/lab-tests/" },
  learning: { title: "Dunlosky et al. — Improving Students’ Learning With Effective Learning Techniques", url: "https://doi.org/10.1177/1529100612453266" },
};

function sourcesFor(a) {
  if (a.slug === "nclex-test-day-what-to-expect") return [SOURCES.candidate, SOURCES.testPlan];
  if (a.topic === "How the exam works" || a.topic === "Question types") return [SOURCES.testPlan, SOURCES.ngn];
  if (a.slug === "infection-control-precautions") return [SOURCES.cdcIsolation, SOURCES.testPlan];
  if (a.slug === "high-alert-medications") return [SOURCES.ismp, SOURCES.testPlan];
  if (a.slug === "abg-interpretation") return [SOURCES.bloodGas, SOURCES.testPlan];
  if (a.slug === "electrolyte-imbalances") return [SOURCES.electrolytes, SOURCES.testPlan];
  if (a.slug === "lab-values-to-memorize" || a.slug === "insulin-types-and-timing") return [SOURCES.labTests, SOURCES.testPlan];
  if (a.topic === "Study strategy") return [SOURCES.learning, SOURCES.testPlan];
  return [SOURCES.testPlan];
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
  .replace(/labelled/g, "labeled").replace(/rigour/g, "rigor")
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
  .key { background:#EAF4F0; border-left:3px solid var(--teal); padding:12px 14px; border-radius:0 8px 8px 0; margin-bottom:12px; }
  .key p:last-child { margin-bottom:0; }
  .cta { background:var(--card); border:1px solid var(--line); border-left:3px solid var(--teal); border-radius:12px; padding:18px 20px; margin:22px 0 14px; }
  .cta p { margin-bottom:8px; } .cta p:last-child { margin-bottom:0; }
  .rel { list-style:none; padding:0; } .rel li { margin-bottom:6px; }
  .foot { font-size:12.5px; color:var(--muted); margin-top:8px; }
  .idx { list-style:none; padding:0; } .idx li { margin-bottom:14px; }
  .idx a { font-weight:600; font-size:15.5px; text-decoration:none; }
  .idx p { font-size:14px; color:var(--muted); margin:2px 0 0; }
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

function articleJsonLd(a, url) {
  const citations = sourcesFor(a);
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
      author: { "@id": AUTHOR_URL },
      reviewedBy: { "@id": AUTHOR_URL },
      publisher: { "@type": "Organization", "@id": `${SITE}/#org`, name: "PulseRN", url: SITE, logo: `${SITE}/icon-512.png` },
      isPartOf: { "@type": "WebSite", name: "PulseRN", url: SITE },
      about: { "@type": "Thing", name: "NCLEX-RN examination preparation" },
      citation: citations.map((source) => source.url),
    },
    {
      "@type": "Person",
      "@id": AUTHOR_URL,
      name: "Sheldon Bennett, RN",
      jobTitle: "Registered Nurse",
      url: AUTHOR_URL,
      worksFor: { "@id": `${SITE}/#org` },
    },
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

function renderArticle(a, all) {
  const url = `${SITE}/learn/${a.slug}/`;
  const rel = related(a, all);
  const sources = sourcesFor(a);
  const faq = a.faq?.length
    ? `<div class="card"><h2 style="margin-top:0">Common questions</h2>${a.faq
        .map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`)
        .join("")}</div>`
    : "";

  return usEnglish(`${head({ title: `${a.title} | PulseRN`, description: a.description, url, jsonld: articleJsonLd(a, url) })}
<main>
<a class="back" href="/learn/">&larr; All guides</a>
<article>
<h1>${esc(a.h1 ?? a.title)}</h1>
<p class="meta">${esc(a.topic)} &middot; published <time datetime="${esc(a.published)}">${esc(a.published)}</time> &middot; reviewed <time datetime="${esc(a.updated)}">${esc(a.updated)}</time> by <a href="/about/#sheldon-bennett-rn">Sheldon Bennett, RN</a></p>

<div class="card">${a.body}</div>
${faq}
<div class="card">
  <h2 style="margin-top:0">Sources and further reading</h2>
  <ul>${sources.map((source) => `<li><a href="${source.url}" rel="external noopener">${esc(source.title)}</a></li>`).join("")}</ul>
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
        description: "Straight answers on how the NCLEX-RN works and how to study for it, written by a licensed RN.",
        isPartOf: { "@type": "WebSite", name: "PulseRN", url: SITE },
        author: { "@id": AUTHOR_URL },
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
    description: "Straight answers on how the NCLEX-RN is scored, every Next Gen question type, dosage calculation, lab values, prioritisation and delegation — written by a licensed RN.",
    url, jsonld,
  })}
<main><a class="back" href="/">&larr; Back to PulseRN</a>
<h1>NCLEX-RN <b>guides</b></h1>
<p class="sub">Straight answers, written and reviewed by <a href="/about/#sheldon-bennett-rn">Sheldon Bennett, RN</a>. No fluff, no false promises.</p>
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
for (const a of ARTICLES) {
  if (slugs.has(a.slug)) throw new Error(`duplicate slug: ${a.slug}`);
  slugs.add(a.slug);
  for (const k of ["slug", "title", "description", "topic", "body", "published", "updated"]) {
    if (!a[k]) throw new Error(`article ${a.slug || "(no slug)"} is missing ${k}`);
  }
  if (a.description.length > 165) throw new Error(`${a.slug}: description too long for a search snippet (${a.description.length})`);
  mkdirSync(`${OUT}/${a.slug}`, { recursive: true });
  writeFileSync(`${OUT}/${a.slug}/index.html`, renderArticle(a, ARTICLES));
}
writeFileSync(`${OUT}/index.html`, renderIndex(ARTICLES));

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
