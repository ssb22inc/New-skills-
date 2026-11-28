/* The page a removed URL shows (410 Gone). Plain HTML, no scripts, so it
   can be served from the edge without the site bundle. */
export const RETIRED_BODY = `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page removed | PulseRN</title><link rel="icon" type="image/svg+xml" href="/icon.svg"><style>body{margin:0;background:#f4f8f6;color:#102f2a;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6}main{width:min(100% - 36px,640px);margin:12vh auto}h1{font-size:clamp(32px,6vw,46px);line-height:1.08;letter-spacing:-.03em;margin:0 0 14px}p{color:#304a44}a{color:#096d5d}.button{display:inline-block;border-radius:10px;background:#0e7c6b;color:#fff;text-decoration:none;font-weight:750;padding:11px 17px;margin:10px 8px 0 0}.button.alt{background:#fff;color:#0e6e5c;border:1px solid #b9d2ca}a:focus-visible{outline:3px solid #f4b942;outline-offset:3px}footer{width:min(100% - 36px,640px);margin:0 auto 40px;font-size:12px;color:#526b65}footer p{color:#526b65}</style></head><body><main><p><a href="/">PulseRN</a></p><h1>This page has been removed.</h1><p>It is no longer part of PulseRN. You can start practicing or read the study guides instead.</p><p><a class="button" href="/free-nclex-practice-test/">Try free NCLEX questions</a><a class="button alt" href="/learn/">Read the study guides</a></p></main><footer><p><a href="/legal/">Terms, Privacy, and Disclaimer</a> · <a href="/about/">About</a></p><p>Educational exam preparation only, not medical advice or a clinical reference. NCLEX® is a registered trademark of NCSBN, which is not affiliated with and does not endorse PulseRN.</p></footer></body></html>`;

/* Every URL that answers 410. The matcher in middleware.js covers these and
   anything else under /compare/. */
export const RETIRED_PATHS = [
  "/compare/",
  "/compare/methodology/",
  "/compare/pulsern-vs-uworld/",
  "/compare/pulsern-vs-archer/",
  "/compare/pulsern-vs-kaplan/",
  "/compare/best-nclex-question-banks/",
  "/compare/best-affordable-nclex-prep/",
  "/compare/best-nclex-app-repeat-test-takers/",
];

export function isRetired(pathname) {
  const pathOnly = String(pathname ?? "").split("?")[0].split("#")[0];
  return pathOnly === "/compare" || pathOnly.startsWith("/compare/");
}
