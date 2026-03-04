# GitHub Actions — Required Secrets

All secrets are configured under **Settings → Secrets and variables → Actions** in the repository.

---

## Required Secrets

### Application

| Secret | Description | Example |
|--------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://abc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbGc...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) | `eyJhbGc...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_live_...` |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` |

### Database (CI/CD pipeline)

| Secret | Description |
|--------|-------------|
| `TEST_DATABASE_URL` | PostgreSQL URL for test runner (ephemeral DB, wiped each run) |
| `STAGING_DATABASE_URL` | PostgreSQL URL for staging environment |
| `PROD_DATABASE_URL` | PostgreSQL URL for production environment |

### Infrastructure

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user with S3 write + ECR push permissions |
| `AWS_SECRET_ACCESS_KEY` | Corresponding IAM secret key |
| `KUBECONFIG_STAGING` | Base64-encoded kubeconfig for staging cluster |
| `KUBECONFIG_PRODUCTION` | Base64-encoded kubeconfig for production cluster |

### Monitoring

| Secret | Description | How to generate |
|--------|-------------|-----------------|
| `METRICS_TOKEN` | Bearer token protecting `/api/metrics` | `openssl rand -hex 32` |
| `GRAFANA_PASSWORD` | Grafana admin password | Choose a strong password |
| `SLACK_INCIDENT_WEBHOOK` | Alertmanager → Slack webhook URL | Slack app settings |

### Backups

| Secret | Description |
|--------|-------------|
| `AWS_S3_BACKUP_BUCKET` | S3 bucket name for encrypted backups |
| `BACKUP_ENCRYPTION_KEY` | GPG passphrase for backup encryption (min 32 chars) |
| `SLACK_BACKUP_WEBHOOK` | Slack webhook for backup success/failure notifications |

### Rate Limiting

| Secret | Description |
|--------|-------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |

---

## Kubernetes Secrets

These secrets must exist in the cluster before deploying:

```bash
# Prometheus metrics scrape token (must match METRICS_TOKEN)
kubectl create secret generic prometheus-metrics-token \
  --from-literal=token="<METRICS_TOKEN>" \
  -n haven-monitoring

# Application secrets (Helm install reads these)
kubectl create secret generic haven-secrets \
  --from-literal=supabase-service-role-key="<SUPABASE_SERVICE_ROLE_KEY>" \
  --from-literal=openai-api-key="<OPENAI_API_KEY>" \
  --from-literal=stripe-secret-key="<STRIPE_SECRET_KEY>" \
  --from-literal=stripe-webhook-secret="<STRIPE_WEBHOOK_SECRET>" \
  --from-literal=upstash-redis-rest-url="<UPSTASH_REDIS_REST_URL>" \
  --from-literal=upstash-redis-rest-token="<UPSTASH_REDIS_REST_TOKEN>" \
  --from-literal=metrics-token="<METRICS_TOKEN>" \
  -n haven

# Backup secrets
kubectl create secret generic haven-backup-secrets \
  --from-literal=database-url="<PROD_DATABASE_URL>" \
  --from-literal=aws-access-key-id="<AWS_ACCESS_KEY_ID>" \
  --from-literal=aws-secret-access-key="<AWS_SECRET_ACCESS_KEY>" \
  --from-literal=aws-region="us-east-1" \
  --from-literal=s3-bucket="<AWS_S3_BACKUP_BUCKET>" \
  --from-literal=encryption-key="<BACKUP_ENCRYPTION_KEY>" \
  --from-literal=slack-webhook="<SLACK_BACKUP_WEBHOOK>" \
  -n haven
```

---

## Setting Secrets via GitHub CLI

```bash
# Bulk-set from your local .env.local (never commit this file!)
gh secret set METRICS_TOKEN --body "$(openssl rand -hex 32)"
gh secret set UPSTASH_REDIS_REST_URL --body "$UPSTASH_REDIS_REST_URL"
gh secret set UPSTASH_REDIS_REST_TOKEN --body "$UPSTASH_REDIS_REST_TOKEN"
gh secret set BACKUP_ENCRYPTION_KEY --body "$(openssl rand -hex 32)"
```

---

## Rotating Secrets

1. Generate a new value
2. Update GitHub Actions secret
3. Update the corresponding Kubernetes secret: `kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -`
4. Restart affected deployments: `kubectl rollout restart deployment/haven -n haven`
5. For `METRICS_TOKEN`: also restart the Prometheus pod so it re-reads the credentials file
