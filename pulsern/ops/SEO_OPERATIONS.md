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

## Public site and private app boundary

- `https://www.pulsern.app/` is always the indexable public landing page,
  including for users who already have an authenticated session.
- The authenticated PWA lives at `https://www.pulsern.app/app/` in the same
  Vercel project. `/app` permanently redirects to `/app/`.
- `/app/` and all deep app routes publish `noindex`, have no canonical URL,
  and stay out of `sitemap.xml` and `llms.txt`.
- The app manifest uses `/app/` for `id`, `start_url`, and `scope`. Its service
  worker is registered with `/app/` scope and cannot control public pages.
- The first post-migration app visit signs an existing root-era browser session
  out locally once. OAuth, magic-link, email-confirmation, invitation, and
  password-recovery callbacks are preserved and return under `/app/`.
- Stripe success and cancellation returns land under `/app/`.

Before deploying the split, Supabase Authentication URL Configuration must
allow these exact production redirects:

- `https://www.pulsern.app/app/`
- `https://www.pulsern.app/app/reset`

Add the equivalent Vercel preview origin routes before testing authentication
on a preview. Keep the Supabase Site URL at `https://www.pulsern.app`; application
code supplies the complete `/app/` callback URL.
