# PulseRN organic-search operations

The repository builds the crawlable site and validates its evidence. Google
Search Console remains an account-level service and must be connected by an
authorized owner; no Google credential or verification token belongs in git.

## One-time Search Console setup

1. Create a Domain property for `pulsern.app` in Google Search Console.
2. Prefer the DNS TXT verification record supplied by Google. This verifies all
   protocols and subdomains without changing application code.
3. If HTML-tag verification is required instead, store the token value—not the
   complete meta tag—as the Vercel production environment variable
   `GOOGLE_SITE_VERIFICATION`, then redeploy. The Vite build validates and
   injects the tag. Never prefix this server-side build value with `VITE_`.
4. Submit `https://www.pulsern.app/sitemap.xml`.
5. Inspect `/`, `/learn/`, and each new sample-question route. Confirm the
   declared canonical is selected and the page is allowed by `robots.txt`.

## Weekly measurement

- Record indexed pages, excluded-page reasons, impressions, clicks, CTR, and
  average position by landing page and query.
- Separate branded queries from non-branded NCLEX intents.
- Track conversions from public guides and sample sets to account creation in
  the product analytics system only after its privacy notice and consent model
  cover that collection.
- Investigate sudden drops, duplicate canonicals, crawl errors, source failures,
  and content whose clinical source or RN review has gone stale.

## Release boundary

Search Console verification does not override the repository gates. Public
clinical content still requires digest-bound RN approval, source validation,
accessibility and crawler audits, OpenRouter adversarial review, evidence
binding, and fail-closed final enforcement.
