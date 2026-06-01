# Haven Disaster Recovery Plan

## Overview

| Metric | Target |
|--------|--------|
| **RTO** (Recovery Time Objective) | < 1 hour |
| **RPO** (Recovery Point Objective) | < 15 minutes |
| **Backup Frequency** | Every 6 hours (cron) |
| **Backup Retention** | 30 days (production), 7 days (staging) |
| **Replication** | Multi-AZ RDS, S3 versioning |

---

## Backup Schedule

Backups run via Kubernetes CronJob:

```yaml
# k8s/backup-cronjob.yaml (auto-deployed with Helm)
schedule: "0 */6 * * *"   # Every 6 hours
```

Backup files are stored at:
```
s3://haven-production-uploads/backups/production/haven_production_YYYYMMDD_HHMMSS.sql.gz.gpg
```

Each backup is:
1. `pg_dump` of the full database
2. Compressed with `gzip -9`
3. Encrypted with AES-256 (GPG symmetric)
4. Uploaded to S3 Standard-IA storage class

---

## Recovery Procedures

### Scenario 1: Database Corruption / Accidental Data Deletion

**Time estimate: 15-30 min**

```bash
# 1. List available backups
aws s3 ls s3://haven-production-uploads/backups/production/ --recursive | tail -10

# 2. Download the most recent (or target) backup
aws s3 cp s3://haven-production-uploads/backups/production/<BACKUP_FILE> /tmp/

# 3. Decrypt
gpg --batch --passphrase "$BACKUP_ENCRYPTION_KEY" \
    --decrypt /tmp/<BACKUP_FILE> > /tmp/haven_restore.sql.gz

# 4. Decompress
gunzip /tmp/haven_restore.sql.gz

# 5. Restore to a new database (never overwrite production directly)
psql "$DATABASE_URL_NEW" < /tmp/haven_restore.sql

# 6. Verify row counts
psql "$DATABASE_URL_NEW" -c "SELECT COUNT(*) FROM public.profiles;"
psql "$DATABASE_URL_NEW" -c "SELECT COUNT(*) FROM public.listings;"

# 7. Update connection string in Kubernetes secrets
kubectl create secret generic haven-secrets \
  --from-literal=DATABASE_URL="$DATABASE_URL_NEW" \
  --namespace haven --dry-run=client -o yaml | kubectl apply -f -

# 8. Rolling restart
kubectl rollout restart deployment/haven -n haven
```

---

### Scenario 2: Complete Region Failure (us-east-1 down)

**Time estimate: 30-60 min**

1. **Activate standby region** (us-west-2):
   ```bash
   export AWS_DEFAULT_REGION=us-west-2
   cd terraform/aws
   terraform workspace select production-dr
   terraform apply -var="aws_region=us-west-2"
   ```

2. **Restore latest backup** to new RDS instance (follow Scenario 1 steps 1-6)

3. **Update DNS** to point to new CloudFront distribution:
   ```bash
   aws route53 change-resource-record-sets \
     --hosted-zone-id <ZONE_ID> \
     --change-batch file://dns-failover.json
   ```

4. **Verify** health check passes:
   ```bash
   curl -f https://haven.app/api/health
   ```

---

### Scenario 3: Kubernetes Cluster Failure

**Time estimate: 20-45 min**

```bash
# 1. Provision new EKS cluster
cd terraform/aws && terraform apply

# 2. Update kubeconfig
aws eks update-kubeconfig --name haven-production --region us-east-1

# 3. Re-deploy all manifests
kubectl apply -f k8s/
helm upgrade --install haven ./helm/haven \
  --namespace haven \
  --values ./helm/haven/values-production.yaml

# 4. Verify
kubectl get pods -n haven
curl -f https://haven.app/api/health
```

---

### Scenario 4: Compromised Secrets / Credentials

**Time estimate: 15-30 min**

```bash
# 1. Rotate all secrets in AWS Secrets Manager
aws secretsmanager rotate-secret --secret-id haven/production

# 2. Rotate Supabase service role key (via Supabase dashboard)
# 3. Rotate Stripe keys (via Stripe dashboard)
# 4. Rotate OpenAI key (via OpenAI dashboard)

# 5. Update Kubernetes secrets
kubectl create secret generic haven-secrets \
  --from-env-file=.env.production \
  --namespace haven --dry-run=client -o yaml | kubectl apply -f -

# 6. Rolling restart to pick up new secrets
kubectl rollout restart deployment/haven -n haven

# 7. Invalidate all user sessions
# Run in Supabase SQL Editor:
# DELETE FROM auth.sessions;
```

---

## Post-Recovery Checklist

- [ ] Health endpoint returns 200: `curl https://haven.app/api/health`
- [ ] User login works end-to-end
- [ ] Listing creation works
- [ ] Payments process successfully (test with Stripe test card)
- [ ] AI matching returns results
- [ ] Monitoring/alerting is functional (check Grafana)
- [ ] All Prometheus alerts are green
- [ ] Incident documented in `#incidents` Slack channel
- [ ] Post-mortem scheduled within 48 hours

---

## Contacts

| Role | Contact |
|------|---------|
| On-call engineer | PagerDuty → `#on-call` |
| Engineering lead | `engineering-leads` Slack group |
| AWS Support | support.aws.amazon.com (Business/Enterprise plan) |
| Supabase Support | app.supabase.com → Support |

---

## Testing the DR Plan

Run a DR drill quarterly:

```bash
# Restore latest backup to staging DB
BACKUP_ENV=production DATABASE_URL=$STAGING_DB_URL ./scripts/backup.sh --dry-run

# Verify row counts match production
./scripts/check-health.sh --env staging
```

Results should be documented in `docs/dr-drill-results/YYYY-MM-DD.md`.
