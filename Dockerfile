# Sycamore — production image for the web app (trust pages, seller's day,
# the sovereign chat door, the founder cockpit, and the installable PWA).
#
# Two stages: build the monorepo once, then ship only Next's traced
# standalone output. The runtime image carries no pnpm store, no source,
# and no dev dependencies.

# ─────────────────────────────── build ───────────────────────────────
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

WORKDIR /repo

# Manifests first, so a dependency install caches across source edits.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY core/package.json           core/package.json
COPY packs/package.json          packs/package.json
COPY design/package.json         design/package.json
COPY adapters/package.json       adapters/package.json
COPY apps/gateway/package.json   apps/gateway/package.json
COPY apps/web/package.json       apps/web/package.json
COPY apps/worker/package.json    apps/worker/package.json
COPY tests/package.json          tests/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @sycamore/web build

# ────────────────────────────── runtime ──────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Next's standalone bundle: server + exactly the traced dependencies.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

# Packs are DATA, not code — the loader reads YAML at runtime, so the
# files ship beside the server and the loader is pointed at them.
COPY --from=build /repo/packs/context ./packs/context
COPY --from=build /repo/packs/vertical ./packs/vertical
COPY --from=build /repo/packs/copy ./packs/copy
ENV SYCAMORE_PACKS_DIR=/app/packs

# Migrations run at boot via apps/web/instrumentation.ts, before the
# first request. The migrator is idempotent and the ledger is
# append-only, so a restart is always safe.
ENV SYCAMORE_MIGRATE_ON_BOOT=1

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
