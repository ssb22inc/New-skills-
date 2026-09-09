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
   git, a chat log, or this file)
3. **Deployments → ⋯ on the latest → Redeploy** (env vars apply to the next build)

After that, every push to the branch redeploys with no further steps, and the
phone link is:

```
https://sycamore-ssb22incs-projects.vercel.app/demo
```

Two Vercel details that cost an afternoon, so they are written down: environment
variables are scoped (Production / Preview / Development) and a build only sees
the scopes it belongs to — which is why this branch is the project's
*production* branch rather than a preview; and a commit that touches nothing
under `apps/web` or its workspace packages is skipped by Vercel's monorepo
heuristic, so a docs-only push will not redeploy.

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
| `DATABASE_URL` | Postgres. Required. |
| `SYCAMORE_MIGRATE_ON_BOOT` | `1` runs migrations before the first request. Idempotent; the ledger is append-only so a restart can never rewrite history. |
| `SYCAMORE_DEMO_INDEX` | `1` exposes `/demo`. **Leave it off for anything real.** |
| `SYCAMORE_PACKS_DIR` | Where the pack YAML lives. The image sets it; only needed if you run the server outside the image. |
| `REDIS_URL` | Only the gateway and worker need this. The web app does not. |

---

## What is verified, and what is not

**Verified on Vercel, 2026-09-09, from a different machine over HTTPS:** the
git-linked build succeeds; `/manifest.webmanifest`, `/sw.js`,
`/icons/icon-192.png` and `/icons/icon-512.png` all answer 200 with the right
types on the branch URL; `/` redirects to `/s/`; deployment protection is off so
no Vercel login stands in the way; and `/demo` without a database answers the
plain 503 page instead of a stack trace. A local build in Vercel mode traced all
19 pack YAML files into the functions. What remains unverified until
`DATABASE_URL` is pasted: the boot migration, the self-seed, and every
database-backed page — on the real Supabase pooler.

**Verified in this repo, by running it:** the standalone production server boots,
runs migrations at startup, and serves every route plus `/sw.js`,
`/icons/icon-192.png` and `/icons/icon-512.png` over the exact file layout the
`Dockerfile` produces. That last part matters — Next's standalone output does
**not** include `public/`, so a deploy that forgets to copy it installs a PWA with
no icon and no offline mode. The `Dockerfile` copies it; the check that caught the
omission was serving the built artifact and watching those three paths 404.

**Not verified here:** `docker build` itself, and the hosted deploy. This
container has no Docker daemon available and no route to the public internet
(outbound is limited to HTTPS through a proxy — a Cloudflare tunnel cannot even
connect, as it needs port 7844). The `Dockerfile` is written against a file layout
that was reproduced and tested locally, but nobody has yet run `docker build` on
it. Expect to fix a line or two on the first build; tell me what it says and I
will fix it properly.
