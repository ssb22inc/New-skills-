# Haven — AI-Powered Housing Marketplace

Haven matches housing seekers and landlords using AI-driven lifestyle compatibility scoring, real-time messaging, and verified listings.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes, Supabase (PostgreSQL + Auth + Realtime) |
| AI | OpenAI GPT-4o, embeddings (vector matching) |
| Payments | Stripe |
| State | Zustand |
| Infrastructure | AWS EKS, Helm, Terraform, CloudFront |
| Monitoring | Prometheus, Grafana, Loki, Alertmanager |
| CI/CD | GitHub Actions |

---

## Local Development

### Prerequisites

- Node.js 20 (use `nvm use` to switch automatically)
- Docker + Docker Compose
- Supabase CLI (`npm i -g supabase`)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/your-org/haven.git
cd haven
nvm use                    # switches to Node 20 via .nvmrc
npm install

# 2. Copy and fill environment variables
cp .env.local.example .env.local
# Edit .env.local with your keys (see Environment Variables below)

# 3. Start local Supabase
supabase start

# 4. Apply database migrations
supabase db push

# 5. Seed the database with test data
./scripts/seed.sh

# 6. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server-side only) | ✅ |
| `OPENAI_API_KEY` | OpenAI API key | ✅ |
| `STRIPE_SECRET_KEY` | Stripe secret key | ✅ |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | ✅ |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL (rate limiting) | ✅ |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | ✅ |
| `METRICS_TOKEN` | Bearer token for `/api/metrics` | ✅ |
| `SLACK_INCIDENT_WEBHOOK` | Slack webhook for security incidents | optional |
| `NEXT_PUBLIC_APP_URL` | Base URL of the app | ✅ |

---

## Running Tests

```bash
# Unit + integration tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch

# E2E tests (requires running app)
npm run dev &
npm run e2e

# All tests
npm run test:all
```

---

## Database Migrations

```bash
# Apply migrations to local Supabase
supabase db push

# Create a new migration
supabase migration new <migration_name>

# Reset local DB (destructive — dev only)
supabase db reset
```

Migrations live in `supabase/migrations/`. Always run them in order:
1. `001_initial_schema.sql` — core tables
2. `002_security_tables.sql` — security & compliance tables

---

## Deployment

### Staging

Staging deploys automatically on push to `develop`:

```bash
git push origin develop
# CI builds, runs migrations, and deploys to staging.haven.app
```

### Production

Production deploys automatically on push to `main`:

```bash
git push origin main
# CI builds, runs migrations, deploys to haven.app, and creates a Sentry release
```

Manual deploy:

```bash
./scripts/deploy.sh --env production --tag <image-tag>
```

### Rollback

```bash
helm rollback haven 0 -n haven --wait
# Or use the rollback script:
./scripts/rollback.sh --env production
```

---

## Monitoring

| Dashboard | URL |
|-----------|-----|
| Grafana | http://grafana.haven-monitoring.svc.cluster.local:3000 |
| Prometheus | http://prometheus.haven-monitoring.svc.cluster.local:9090 |
| Alertmanager | http://alertmanager.haven-monitoring.svc.cluster.local:9093 |

Forward ports for local access:

```bash
kubectl port-forward svc/grafana 3001:3000 -n haven-monitoring
```

---

## Project Structure

```
haven/
├── src/
│   ├── app/              # Next.js App Router pages and API routes
│   ├── components/       # React components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Core libraries (supabase, security, openai, stripe)
│   ├── services/         # Business logic services
│   ├── stores/           # Zustand state stores
│   └── types/            # TypeScript type definitions
├── supabase/
│   ├── migrations/       # SQL migration files
│   └── seed.sql          # Seed data for development
├── k8s/                  # Kubernetes manifests
├── helm/haven/           # Helm chart
├── terraform/aws/        # AWS infrastructure as code
├── monitoring/           # Prometheus, Grafana, Loki configuration
├── docs/
│   ├── runbooks/         # Operational runbooks
│   └── disaster-recovery.md
├── e2e/                  # Playwright E2E tests
├── tests/                # Vitest unit + integration tests
└── scripts/              # Utility scripts (backup, deploy, seed)
```

---

## Contributing

1. Branch from `develop`: `git checkout -b feature/my-feature develop`
2. Write tests for new functionality
3. Ensure `npm run test:coverage` passes
4. Open a PR against `develop`
5. Request review from at least one engineer

---

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability disclosure policy.

To run a security audit locally:

```bash
./scripts/security-audit.sh
```
