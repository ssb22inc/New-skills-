# Supabase connection audit — 2026-09-16

## Verified project mapping

| App | Supabase project | Observed state | Remaining work |
| --- | --- | --- | --- |
| PulseRN | `xlfdywudgamrnzjwtrtd` | `ACTIVE_HEALTHY`; deployed `/app/` returned HTTP 200; its bundled public publishable key reached `/auth/v1/settings` (200) and read one question through `/rest/v1/questions?select=id&limit=1` (200) | Management SQL timed out twice even though the Data API worked. Authenticated progress writes and server service-role calls were not reverified in this check. |
| Sycamore | `guwnrztetamljfodlybs` | `ACTIVE_HEALTHY`; live `/demo` returned 503 with password authentication failure for `postgres` | Correct the Production `DATABASE_URL`, redeploy the Sycamore branch, then verify migrations and demo data. Sept 10 SQL inventory found no application tables. |
| Forge | `ivttjklkepcizpbxyzub` | `INACTIVE` | Resume attempted Sept 16 but Supabase refused: account has reached its two-active-free-project limit. App/repository mapping is still unconfirmed. |
| Haven | Not identified | Repository expects Supabase; no assigned cloud project verified | Reconcile missing base migration and identify its intended Supabase project and deployment. Do not connect to another app's database by guessing. |

## PulseRN security fix

`supabase/migrations/20260910210120_pin_population_function_search_paths.sql`
records the three search-path changes applied and verified in production on
2026-09-10. The remote migration version matches this filename. Do not reset
production or replay all historical migrations: remote migration history did
not contain the older schema setup.

Immediately after application, all three functions retained invoker security,
their search paths were fixed, sample population classifications passed, and
the three mutable-search-path advisor warnings cleared. The approved,
nonrejected question total remained 10,707 (10,034 practice + 673 exam).
Local tests passed 201 tests and the production build generated 53 URLs.
These are dated results, not a claim that every authenticated feature was
retested on Sept 16.

Outstanding advisor item: leaked-password protection was disabled. The
`discount_codes` table intentionally has RLS with no client policies; keep
its access server-only.

## Sycamore credential repair

1. Open the [Sycamore Supabase project](https://supabase.com/dashboard/project/guwnrztetamljfodlybs).
2. In **Connect**, copy the Session pooler PostgreSQL connection URI for this
   project. Supply the real database password, not an API key, account password,
   or literal placeholder. Preserve the dashboard-provided host, port, database,
   and username; URI-encode password characters when constructing a URI.
3. If the database password is unknown, the owner must reset it in Database
   Settings and update every application using that credential. Do not send the
   password in chat or commit it to this repository.
4. In [Sycamore Vercel environment variables](https://vercel.com/ssb22incs-projects/sycamore/settings/environment-variables),
   replace **Production** `DATABASE_URL` with the correct URI. The app's code
   accepts aliases, but `DATABASE_URL` is already present and failing; adding
   another alias alone may not replace it.
5. Redeploy the Sycamore production branch
   `claude/sycamore-prompts-build-chain-o5rqtu`, root `apps/web`. Do not deploy
   PulseRN's `main` branch to this project. The branch's documented boot flow
   runs Kysely migrations and seeds the demo once.
6. Verify [the demo](https://sycamore-ssb22incs-projects.vercel.app/demo) returns
   successfully and SQL shows the intended application tables and seeded rows.
   An awake project or saved environment variable alone is not completion.

The database connection password is separate from PulseRN's API keys.

## Forge resume blocker

The restore endpoint refused the resume because the account is at the free
active-project limit. No other project was paused or deleted and no billing
plan was changed. Owner action is needed to make a plan/capacity decision;
PulseRN and Sycamore are both intended active projects.

[Supabase project pause/restore documentation](https://supabase.com/docs/guides/platform/upgrading#time-limits).

## Haven migration recovery findings

Main contains `002_security_tables.sql`, `003_prod_hardening.sql`, and
`003_webhook_idempotency.sql`, but lacks the `001_initial_schema.sql` its
README references. The original exists in
[PR #2's source commit](https://github.com/ssb22inc/New-skills-/blob/d7d60bda73826175fce96689cd94b4cfa255a814/haven/supabase/migrations/001_initial_schema.sql).
It has not been copied into the runnable migration directory or applied.

Before restoration, fix and validate the complete chain: the original uses
`ll_to_earth` without enabling its required extensions, allows public profile
reads including personal fields, and omits RLS on some public tables. The two
`003` migration versions also need reconciliation. Identify the intended Haven
cloud project before any remote DDL. Do not merge the entire old application
branch just to recover a schema file.
