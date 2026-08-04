# DEPLOY.md — get the PWA onto any phone

To install a PWA, a phone needs a **secure origin**: HTTPS, or `localhost`. That
is the whole reason this file exists. A LAN address like `http://192.168.1.42:3000`
will serve every page correctly and will **never** offer to install — Chrome does
not fire `beforeinstallprompt` on an insecure origin, and the service worker (so,
offline mode) will not register either.

So: deploy once, get an HTTPS URL, and every phone can install from it.

---

## Option 1 — Render (no CLI, ~5 minutes)

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

## Option 2 — Fly.io (CLI, ~5 minutes, scales to zero)

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
