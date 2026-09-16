# DEPLOY.md — get the PWA onto any phone

To install a PWA, a phone needs a **secure origin**: HTTPS, or `localhost`. That
is the whole reason this file exists. A LAN address like `http://192.168.1.42:3000`
will serve every page correctly and will **never** offer to install — Chrome does
not fire `beforeinstallprompt` on an insecure origin, and the service worker (so,
offline mode) will not register either.

So: deploy once, get an HTTPS URL, and every phone can install from it.

---

## Option 0 — Vercel, already wired (this is the live one)

| | |
|---|---|
| Vercel project | `sycamore` in team `ssb22incs-projects` — its own project, **not** the two that PulseRN uses |
| Builds from | this branch, `claude/sycamore-prompts-build-chain-o5rqtu` (the project's production branch), root directory `apps/web`, on every push |
| Stable URL | `https://sycamore-ssb22incs-projects.vercel.app` |
| Branch URL | `https://sycamore-git-claude-sycamore-prompts-3567d5-ssb22incs-projects.vercel.app` (same build; the branch alias) |
| Database | Supabase project `sycamore` (`guwnrztetamljfodlybs`, us-east-1, free tier), role `sycamore` — its own project, never `Forge` |
| Deployment protection | off, so the URL opens on any phone with no Vercel login |

**What happens by itself on every deploy** (`apps/web/src/deploy-defaults.ts`):
migrations run before the first request, the demo market seeds itself exactly
once (an atomic one-row claim, so parallel cold starts cannot double-seed), and
`/demo` is served. Any of the three can be switched off with an explicit `0`:
`SYCAMORE_MIGRATE_ON_BOOT`, `SYCAMORE_DEMO_SEED`, `SYCAMORE_DEMO_INDEX`.

**The one thing that has to be done by hand, once.** The database password
cannot be committed — this repository is public — and the Vercel connector
exposes no way to set project environment variables. So `DATABASE_URL` is
pasted into the Vercel project by a human, one time:

1. Vercel → `sycamore` → **Settings → Environment Variables**
2. Add `DATABASE_URL` = the value handed over privately (never paste it into
   git, a chat log, or this file). **Tick Production** in the environment
   picker — the branch builds as production, and a value saved only for
   Preview is invisible to it.
3. **Deployments → ⋯ on the latest → Redeploy** (env vars apply to the next build)

Three things about that value, each of which has already gone wrong once:

- **The role is `sycamore`, not `postgres`.** The project's own superuser is
  not the app's credential; the app has a dedicated login role with `CREATE`
  on `public`, which is all the migrator needs.
- **Use the pooler host, not the direct one.** `aws-N-<region>.pooler.supabase.com`
  on port 6543 answers over IPv4, which is what a serverless function has. On
  the pooler the username carries the project reference: `sycamore.<project-ref>`.
  Whether the cluster is `aws-0-` or `aws-1-` only the dashboard knows, and boot
  tries the sibling by itself if the first is wrong.
- **Percent-encode punctuation in the password**, or avoid it entirely. A raw
  `@`, `:`, `/`, `?` or `#` makes the whole URL unparseable, and the failure
  looks nothing like a password problem.

The app also accepts the names hosted integrations write on your behalf —
`POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`,
`SUPABASE_DB_URL` — so connecting Supabase through Vercel's integration screen
works too, with no renaming.

**When it is wrong, `/demo` says how.** With nothing set, it lists the accepted
names, the environment the build is in, and which database-looking variable
names it can actually see. With something set that the database refuses, it
prints the error and the connection it attempted —
`sycamore.guwn…lybs@aws-1-us-east-1.pooler.supabase.com:6543/postgres` — with
the password dropped and the project reference masked. Between those two lines
every failure so far would have been one glance instead of an afternoon.

**To watch the machine rather than the product, open `/dev`.** The cockpit
answers "how is the business doing"; the developer console answers "is any of
this actually working". On one self-refreshing page: schema state and pending
migrations, which environment variable the database URL came from and the
connection it resolves to, every market and its status, the trial balance with
each account as a natural balance, the last fifteen events off the outbox with
how long ago each fired, row counts behind every page, and a live link to every
surface. It answers 503 the moment it finds a problem, so a red page is visible
without reading it, and it writes nothing. Like `/demo` it is scaffolding:
`SYCAMORE_DEMO_INDEX=0` and it 404s.

Two Vercel details that cost an afternoon, so they are written down: environment
variables are scoped (Production / Preview / Development) and a build only sees
the scopes it belongs to — which is why this branch is the project's
*production* branch rather than a preview; and a commit that touches nothing
under `apps/web` or its workspace packages is skipped by Vercel's monorepo
heuristic, so a docs-only push will not redeploy.

One tidy-up worth doing: this Vercel project is linked to the whole repository,
so every push to `main` or a `codex/*` branch — PulseRN's work, a different
product with no `apps/web` — starts a Sycamore build that fails. Those are
preview builds and cannot touch the production URL, but they are noise. Vercel
→ Settings → Git → **Ignored Build Step** with

```bash
[ "$VERCEL_GIT_COMMIT_REF" != "claude/sycamore-prompts-build-chain-o5rqtu" ]
```

exits 0 (skip) for every other branch and builds only this one.

**Why the schema was loaded by hand, once.** Boot-time migration is right for a
long-lived server and wrong for a cold start. On 2026-09-16 the first cold start
with a working credential created Kysely's two bookkeeping tables, got no
further, and logged nothing: a serverless instance began the work, answered the
request, and froze mid-transaction, which rolls back. Repeating that gets the
same two tables and the same empty schema every time. So the 22 migrations and
the demo market were applied deliberately over HTTPS instead — the schema dumped
from a local run of the real migrator, the data dumped in foreign-key order, both
replayed through the database connector, with `kysely_migration` carrying the 22
names so the app's own migrator sees a database that is already up to date and
does nothing. The `demo_seeded` flag is set for the same reason: the boot seeder
claims that flag before seeding and refuses when it exists.

The lesson generalises. Migrating from a request-scoped runtime is a race
against the platform's freeze, and the app should never be the thing that
notices. If a future deploy needs a new migration, run it deliberately — not by
hoping a cold start survives long enough.

If boot logs say the pooler cluster was "corrected", that is
`databaseUrlCandidates` doing its job: Supabase's shared pooler lives on
numbered clusters and only the dashboard says which; the app tries the sibling
and keeps whichever answers.

---
## Option 1 — Render (no CLI, ~5 minutes) — alternative, not in use

1. [render.com](https://render.com) → **New** → **Blueprint** → pick
   `ssb22inc/New-skills-`.
2. **Set the branch** to `claude/sycamore-prompts-build-chain-o5rqtu`.
   Render reads `render.yaml` from the branch you select, and the deploy files
   are not on `main` yet — pointed at `main`, the Blueprint finds nothing.
   (Merging that branch into `main` and using `main` works just as well; if you
   do, change the `branch:` line in `render.yaml` too.)
3. Render builds the `Dockerfile`, creates Postgres, wires `DATABASE_URL`, and
   gives you `https://sycamore-xxxx.onrender.com`.
4. Seed something to look at, from your laptop:

   ```bash
   DATABASE_URL='<the External Database URL from Render>' pnpm demo
   ```

5. Open `https://<your-url>/demo` on your phone.

## Option 2 — Fly.io (CLI, ~5 minutes, scales to zero) — alternative, not in use

```bash
fly launch --copy-config --no-deploy
fly postgres create --name sycamore-db
fly postgres attach sycamore-db          # sets DATABASE_URL
fly deploy
fly proxy 15432:5432 -a sycamore-db &    # tunnel the db to seed it
DATABASE_URL='postgres://postgres:<pw>@127.0.0.1:15432/sycamore' pnpm demo
```

Then open `https://sycamore.fly.dev/demo`.

## Option 3 — anywhere else

The `Dockerfile` is plain and self-contained. Any host that runs a container and
terminates TLS works — Railway, Koyeb, Cloud Run, a Hetzner box behind Caddy.
Set `DATABASE_URL`, `SYCAMORE_MIGRATE_ON_BOOT=1`, and (for the demo index)
`SYCAMORE_DEMO_INDEX=1`.

---

## Installing it, once you have the URL

**Android (Chrome)** — open `https://<your-url>/demo`, tap a seller's
*"Seller's day — install offer"*, then **Add to home screen**. That page is the
only surface that offers an install: buyers are never asked, and core only ever
emits that `?offer=1` link to a seller who earned it.

**iPhone (Safari)** — same page, then **Share → Add to Home Screen**. iOS has no
install prompt API at all, so the button on the page does nothing there; the
Share menu is the install path on every iOS PWA.

Once installed, tapping the icon opens `/s/` — the client remembers which
business it was installed for and goes straight to that seller's day. Turn the
phone to airplane mode and open it again: the cached day is still there, labelled
with how old it is, and completing an order queues locally until you reconnect.

---

## Environment variables

| Variable | Why |
|---|---|
| `DATABASE_URL` | Postgres. Required. `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING` and `SUPABASE_DB_URL` are accepted as aliases, in that order, for hosts whose integrations name it themselves. |
| `SYCAMORE_MIGRATE_ON_BOOT` | `1` runs migrations before the first request. Idempotent; the ledger is append-only so a restart can never rewrite history. |
| `SYCAMORE_DEMO_INDEX` | `1` exposes `/demo`. **Leave it off for anything real.** |
| `SYCAMORE_PACKS_DIR` | Where the pack YAML lives. The image sets it; only needed if you run the server outside the image. |
| `REDIS_URL` | Only the gateway and worker need this. The web app does not. |

---

## What is verified, and what is not

**Audited on the live origin, 2026-09-16, in a real browser.**
`pnpm --filter @sycamore/tests deploy:audit` drives Chromium against the
deployment and checks the P36 installability criteria where they actually matter:
18/18 green, including a service worker that activates and controls the page, a
seller's day that still renders with the network cut, both halves of the asymmetry
law, and the trust-page budget over the wire (1,973 B, interactive 532 ms on
throttled 3G). `.github/workflows/deploy-audit.yml` carries it, and it takes
`SYCAMORE_ORIGIN` to point at any other deployment. The workflow's nightly
schedule does NOT fire, and the workflow cannot be dispatched either: GitHub
registers a workflow only when it exists on the repository's DEFAULT branch, and
this product is not on it. A dispatch attempt returns 404, and the workflow does
not appear in the Actions tab at all. Until Sycamore's branch becomes the default
or the repository is split, the audit runs locally:
`pnpm --filter @sycamore/tests deploy:audit`. All that remains of the P36
gate is a human tapping "Add to home screen".

**Verified on Vercel, 2026-09-09, from a different machine over HTTPS:** the
git-linked build succeeds; `/manifest.webmanifest`, `/sw.js`,
`/icons/icon-192.png` and `/icons/icon-512.png` all answer 200 with the right
types on the branch URL; `/` redirects to `/s/`; deployment protection is off so
no Vercel login stands in the way; and `/demo` without a database answers the
plain 503 page instead of a stack trace. A local build in Vercel mode traced all
19 pack YAML files into the functions. Since 2026-09-16 the database is wired
too: `/demo`, the trust pages, the seller's day and the cockpit all serve real
data over the Supabase pooler, and `pnpm --filter @sycamore/tests deploy:audit`
re-checks the whole installability gate against the origin in a real browser.

**Verified in this repo, by running it:** the standalone production server boots,
runs migrations at startup, and serves every route plus `/sw.js`,
`/icons/icon-192.png` and `/icons/icon-512.png` over the exact file layout the
`Dockerfile` produces. That last part matters — Next's standalone output does
**not** include `public/`, so a deploy that forgets to copy it installs a PWA with
no icon and no offline mode. The `Dockerfile` copies it; the check that caught the
omission was serving the built artifact and watching those three paths 404.

**`docker build` — verified 2026-09-16, and it needed no fixes.** The image
builds from this `Dockerfile` unmodified (396 MB), and run against an EMPTY
database it applies all 22 migrations at boot, seeds the demo market when asked,
and serves everything: `/manifest.webmanifest`, `/sw.js`, both icons, `/demo`,
and the two redirects, each with the right status and content type. The seeded
ledger balances to the cent — 31,880,000 debits against 31,880,000 credits, the
same figure the local run and the hosted database produce. Its boot log reads:

```
[sycamore] applied 22 migration(s)
[sycamore] schema up to date, markets seeded
[sycamore] demo market seeded: 3 sellers, 14 buyers, ledger 31880000 = 31880000
```

This is the container path, where migrating at boot is correct: the process
outlives the request, so nothing can freeze it half-way. That is why the image
sets `SYCAMORE_MIGRATE_ON_BOOT=1` explicitly and a serverless deploy does not.

One note for anyone rebuilding behind a TLS-intercepting proxy: `pnpm install`
inside the build will fail on the certificate. Do not add proxy arguments to this
`Dockerfile` — give the base image the CA instead and build with `--network=host`,
so the artifact stays clean.

**Still not verified here:** nothing about the image. What remains is the human
half of the P36 gate — a person tapping "Add to home screen" on Android Chrome
and iOS Safari.
