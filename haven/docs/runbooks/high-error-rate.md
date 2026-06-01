# Runbook: High Error Rate (HavenHighErrorRate)

**Alert:** `HavenHighErrorRate` — Error rate > 5% for 5 minutes
**Severity:** Critical
**Slack channel:** #incidents

---

## 1. Verify the alert is real

```bash
# Check current error rate in Prometheus
curl -s 'http://prometheus:9090/api/v1/query?query=rate(http_requests_total{status=~"5.."}[5m])/rate(http_requests_total[5m])' | jq '.data.result'

# Check application logs
kubectl logs -n haven -l app=haven --since=10m | grep -E '"level":"error"' | tail -50
```

---

## 2. Identify the failing endpoint

```bash
# Top erroring routes
kubectl logs -n haven -l app=haven --since=10m \
  | jq -r 'select(.level == "error") | .path' \
  | sort | uniq -c | sort -rn | head -10
```

Common culprits:
- `/api/ai/*` — OpenAI quota exceeded or timeout
- `/api/payments/*` — Stripe API down
- `/api/listings` — Database connection pool exhausted

---

## 3. Check downstream dependencies

```bash
# Database health
kubectl exec -n haven deploy/haven -- \
  node -e "const {createClient}=require('@supabase/supabase-js'); \
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) \
    .from('profiles').select('count').then(console.log)"

# Redis health
kubectl exec -n haven deploy/haven -- \
  node -e "require('ioredis').createClient(process.env.REDIS_URL).ping().then(console.log)"

# Check Stripe status
curl https://status.stripe.com/api/v2/status.json | jq '.status'

# Check OpenAI status
curl https://status.openai.com/api/v2/status.json | jq '.status'
```

---

## 4. Mitigate

### If AI endpoints are failing:
```bash
# AI errors can be tolerated — confirm non-AI routes are healthy
curl -f https://haven.app/api/health
curl -f https://haven.app/api/listings

# If OpenAI is down, the app degrades gracefully — no action needed
# Monitor until OpenAI recovers
```

### If database is failing:
```bash
# Check connection count
kubectl exec -n haven deploy/haven -- \
  psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;"

# If connections are exhausted, restart the deployment (triggers connection drain)
kubectl rollout restart deployment/haven -n haven
kubectl rollout status deployment/haven -n haven
```

### If the issue is a bad deploy:
```bash
# Roll back to previous Helm release
helm rollback haven 0 -n haven --wait

# Verify rollback
kubectl rollout status deployment/haven -n haven
curl -f https://haven.app/api/health
```

---

## 5. Escalate if unresolved after 15 minutes

Page the engineering lead via PagerDuty if the error rate is still > 5% after 15 minutes of investigation.

---

## 6. Post-incident

- Document root cause in `#incidents`
- File a post-mortem if impact lasted > 30 minutes
- Create a Jira ticket for the fix if not already resolved
