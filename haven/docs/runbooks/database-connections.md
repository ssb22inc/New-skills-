# Runbook: Database Connection Pool Exhaustion (DatabaseConnectionHigh)

**Alert:** `DatabaseConnectionHigh` — Active connections > 80% of max
**Severity:** Warning at 80%, Critical at 95%
**Slack channel:** #alerts → #incidents at critical

---

## 1. Assess severity

```bash
# Check current connection count
psql "$DATABASE_URL" -c "
  SELECT count(*) as total,
    count(*) FILTER (WHERE state = 'active') as active,
    count(*) FILTER (WHERE state = 'idle') as idle,
    count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx
  FROM pg_stat_activity
  WHERE datname = 'haven';
"
```

**Max connections:** Check `SHOW max_connections;` — typically 100 for Supabase free tier, 200+ for paid.

---

## 2. Find connection hogs

```bash
psql "$DATABASE_URL" -c "
  SELECT pid, usename, application_name, client_addr,
         state, query_start, state_change,
         left(query, 100) as query
  FROM pg_stat_activity
  WHERE datname = 'haven'
  ORDER BY query_start ASC
  LIMIT 20;
"
```

Look for:
- Connections stuck in `idle in transaction` (leaked transactions)
- Many connections from the same `application_name`

---

## 3. Immediate mitigation

### Kill idle transactions (> 5 min):
```bash
psql "$DATABASE_URL" -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = 'haven'
    AND state = 'idle in transaction'
    AND state_change < NOW() - INTERVAL '5 minutes';
"
```

### Rolling restart to drain connections:
```bash
kubectl rollout restart deployment/haven -n haven
kubectl rollout status deployment/haven -n haven
```

---

## 4. Root cause: No connection pooler

The Haven app connects directly to Postgres from each pod. With 6 pods × 10 connections each = 60 connections easily.

**Permanent fix:** Enable Supabase connection pooler (PgBouncer):

1. In Supabase dashboard → Settings → Database → Connection Pooling
2. Enable **Transaction mode** pooler
3. Copy the pooler connection string
4. Update the Kubernetes secret:

```bash
kubectl create secret generic haven-secrets \
  --from-literal=DATABASE_URL="postgresql://postgres.<ref>:<pass>@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true" \
  --namespace haven --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment/haven -n haven
```

5. Verify:
```bash
psql "$POOLER_URL" -c "SHOW server_version;"
```

---

## 5. Monitoring after fix

```bash
# Watch connection count over time
watch -n 5 'psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity WHERE datname='"'"'haven'"'"';"'
```

Alert should clear within 2-3 minutes of the rolling restart.
