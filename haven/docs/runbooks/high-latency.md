# Runbook: High API Latency (HavenHighLatency)

**Alert:** `HavenHighLatency` — p95 latency > 2s for 10 minutes
**Severity:** Warning / Critical
**Slack channel:** #alerts

---

## 1. Confirm the alert

```bash
# Check p95 latency by endpoint
curl -s 'http://prometheus:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))' \
  | jq '.data.result | sort_by(.value[1]) | reverse | .[0:10]'
```

---

## 2. Check for obvious causes

```bash
# Pod resource usage
kubectl top pods -n haven

# Node resource usage
kubectl top nodes

# Recent deployments
kubectl rollout history deployment/haven -n haven

# Database slow queries (Supabase dashboard → Logs → Slow Queries)
```

---

## 3. Identify slow paths

Common patterns:
| Slow path | Likely cause | Fix |
|-----------|-------------|-----|
| `/api/ai/*` | OpenAI slow response | Expected — no action |
| `/api/matches/score` | Cold ML computation | Scale up replicas |
| `/api/listings` | Missing DB index | Add index, analyze query |
| All paths | Pod CPU throttling | Increase resource limits |

---

## 4. Mitigate

### Scale up pods:
```bash
kubectl scale deployment haven --replicas=6 -n haven
kubectl rollout status deployment/haven -n haven
```

### Check and fix CPU throttling:
```bash
kubectl describe pod -n haven -l app=haven | grep -A5 "Limits"
# If CPU limit is low, patch temporarily:
kubectl patch deployment haven -n haven -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"haven","resources":{"limits":{"cpu":"2000m"}}}]}}}}'
```

### Enable Redis caching if it's turned off:
```bash
kubectl exec -n haven deploy/haven -- \
  redis-cli -u "$REDIS_URL" ping
```

---

## 5. Rollback if latency started after a deploy

```bash
helm rollback haven 0 -n haven --wait
```

---

## 6. Post-incident

- If root cause is a missing DB index, create a migration and deploy it
- If root cause is resource starvation, update `values-production.yaml` with higher limits
