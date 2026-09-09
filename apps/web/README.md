# @sycamore/web

The Next.js PWA: buyer trust pages (`/t`), the sovereign chat door (`/c`), the
seller's day and installable client (`/s`), show-me-why (`/why`), the founder
cockpit (`/cockpit`), and — only when a deployment asks for it — the demo index
(`/demo`).

## How it deploys

The live instance is a git-linked Vercel project building this directory on
every push to the Sycamore branch; `../../DEPLOY.md` has the URL, the database,
and the single manual step. `instrumentation.ts` runs migrations and the
one-time demo seed at boot; `src/deploy-defaults.ts` is the one place that
decides what a deployment does unless told otherwise.

Build with webpack, not Turbopack (`next build --webpack`): workspace packages
use NodeNext `.js` specifiers for `.ts` files, and only webpack's
`extensionAlias` resolves them.

## Laws this app is checked against

- No hardcoded user-facing copy (`tests/src/copy`), no raw hex
  (`tests/src/design`), buyers never offered an install (`src/pwa.test.ts`).
- The trust page stays under 100 KB and interactive in under 2 s on throttled
  3G (`tests/src/perf`), and that check runs in CI.
