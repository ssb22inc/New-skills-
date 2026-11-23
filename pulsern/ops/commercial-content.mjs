import { createHash } from "node:crypto";

export const COMMERCIAL_POLICY_VERSION = 1;
export const COMMERCIAL_VERIFIED_AT = "2026-10-28";
/* The comparison pages were first published on this date. The publication
   date stays on the record even though those pages are no longer served. */
export const COMMERCIAL_PUBLISHED_AT = "2026-09-03";
const SITE = "https://www.pulsern.app";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/* PulseRN-owned pages the evidence builder can still cite. Competitor
   sources left with the comparison pages: nothing public names them, and
   the commercial source check has nothing external to fetch. */
export const COMMERCIAL_SOURCES = {
  pulseHome: {
    id: "pulsern-home-2026-09-03", publisher: "PulseRN", title: "PulseRN product overview",
    url: `${SITE}/`, accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Public product description, features, free access, authorship, and limitations",
  },
  pulsePricing: {
    id: "pulsern-pricing-2026-09-03", publisher: "PulseRN", title: "PulseRN pricing",
    url: `${SITE}/pricing/`, accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Access-plan prices, question-bank quantities, and included self-assessments",
  },
  pulseHow: {
    id: "pulsern-how-it-works-2026-09-03", publisher: "PulseRN", title: "How PulseRN works",
    url: `${SITE}/how-it-works/`, accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Adaptive practice, review, spaced repetition, and readiness limitations",
  },
  pulseAbout: {
    id: "pulsern-about-2026-09-03", publisher: "PulseRN", title: "About PulseRN",
    url: `${SITE}/about/`, accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "Founder identity, hospital RN practice, license verification, and how practice items and guides are checked",
  },
  pulseLegal: {
    id: "pulsern-legal-2026-09-03", publisher: "PulseRN", title: "PulseRN Terms, Privacy, and Disclaimer",
    url: `${SITE}/legal/`, accessedAt: COMMERCIAL_VERIFIED_AT,
    locator: "AI-tutor limitations, lab-reference qualification, privacy, and educational-use boundary",
  },
};

/* No comparison pages are published. The array stays so the public-page
   builder, sitemap, and evidence manifest keep a single empty source. */
const pages = [];

export const COMMERCIAL_PAGES = pages.map((page) => ({ ...page, updated: page.updated || COMMERCIAL_VERIFIED_AT, published: COMMERCIAL_PUBLISHED_AT }));

/* Retired comparison URLs. Each public path is listed with and without a
   trailing slash. Destinations are canonical static pages and carry no query
   string, so the platform keeps the visitor's original query on the 308.
   The catch-all is last and only applies when no exact rule matched. */
const RETIRED_COMPARE_ROUTES = [
  ["/compare/", "/how-it-works/"],
  ["/compare/methodology/", "/methodology/"],
  ["/compare/pulsern-vs-uworld/", "/how-it-works/"],
  ["/compare/pulsern-vs-archer/", "/how-it-works/"],
  ["/compare/pulsern-vs-kaplan/", "/how-it-works/"],
  ["/compare/best-nclex-question-banks/", "/free-nclex-practice-test/"],
  ["/compare/best-affordable-nclex-prep/", "/pricing/"],
  ["/compare/best-nclex-app-repeat-test-takers/", "/how-it-works/"],
];

const slashVariants = (path) => {
  const withSlash = path.endsWith("/") ? path : `${path}/`;
  return [withSlash.slice(0, -1), withSlash];
};

export const RETIRED_COMMERCIAL_REDIRECTS = [
  ...RETIRED_COMPARE_ROUTES.flatMap(([path, destination]) => slashVariants(path).map((source) => ({ source, destination, permanent: true }))),
  { source: "/compare/:path*", destination: "/how-it-works/", permanent: true },
];

export function retiredRedirectFor(pathname) {
  const pathOnly = String(pathname ?? "").split("?")[0].split("#")[0];
  for (const rule of RETIRED_COMMERCIAL_REDIRECTS) {
    if (rule.source.endsWith(":path*")) {
      const base = rule.source.slice(0, -":path*".length).replace(/\/$/, "");
      if (pathOnly === base || pathOnly.startsWith(`${base}/`)) return rule;
    } else if (pathOnly === rule.source) return rule;
  }
  return null;
}

export function relatedCommercial(slug, all = COMMERCIAL_PAGES) {
  const index = all.findIndex((page) => page.slug === slug);
  if (index < 0 || all.length < 2) return [];
  return Array.from({ length: Math.min(3, all.length - 1) }, (_, offset) => all[(index + offset + 1) % all.length]);
}

export function commercialEvidence() {
  return {
    schemaVersion: COMMERCIAL_POLICY_VERSION,
    generatedAt: `${COMMERCIAL_VERIFIED_AT}T00:00:00.000Z`,
    editorialOwner: { name: "Sheldon Bennett, RN", url: `${SITE}/about/#sheldon-bennett-rn` },
    disclosure: "PulseRN does not publish competitor comparison pages. No affiliate links, paid placement, star ratings, or outcome guarantees are used.",
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
