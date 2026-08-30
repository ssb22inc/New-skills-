/* Optional Google Search Console HTML-tag verification.

   Domain-property verification through DNS remains preferable because it covers
   every protocol and subdomain. When the owner instead receives an HTML meta
   token from Search Console, this helper injects it at build time without ever
   committing the token to source control. */

export function verificationMeta(token = "") {
  const value = String(token).trim();
  if (!value) return "";
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(value)) {
    throw new Error("GOOGLE_SITE_VERIFICATION must be a 20–200 character token containing only letters, numbers, underscores, or hyphens.");
  }
  return `<meta name="google-site-verification" content="${value}">`;
}

export function injectSearchVerification(html, token = "") {
  const meta = verificationMeta(token);
  if (!meta) return html;
  if (/<meta\b[^>]*name=["']google-site-verification["']/i.test(html)) {
    throw new Error("index.html already contains a Google site-verification tag; keep verification build-time only.");
  }
  return html.replace(/(<meta\b[^>]*name=["']description["'][^>]*>)/i, `$1\n    ${meta}`);
}
