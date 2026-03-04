# Runbook: Redis / Upstash Failure

## Symptoms
- `rate_limit_unavailable` errors in application logs
- Auth and AI endpoints returning **503 Service Temporarily Unavailable**
- Default API routes still serving traffic (fail-open by design)
- Rate limiting metrics flatlined in Prometheus/Grafana

## Severity
**P1** if auth endpoints are down. **P2** if only rate-limiting is degraded (default routes unaffected).

## Immediate Actions

### 1. Verify Upstash status
Check https://status.upstash.com for known incidents.

### 2. Check application error logs
```bash
kubectl logs -n haven -l app=haven --since=10m | grep '"event":"rate_limit_unavailable"'
```

### 3. Test Redis connectivity from a running pod
```bash
kubectl exec -it -n haven deploy/haven -- sh -c \
  'curl -s "$UPSTASH_REDIS_REST_URL/ping" -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"'
# Expected: {"result":"PONG"}
```

### 4. Rotate credentials if compromised
If credentials are the issue:
1. Generate new credentials in Upstash Dashboard
2. Update the Kubernetes secret:
   ```bash
   kubectl patch secret haven-secrets -n haven --type=merge -p \
     '{"stringData":{"UPSTASH_REDIS_REST_URL":"<new_url>","UPSTASH_REDIS_REST_TOKEN":"<new_token>"}}'
   ```
3. Restart deployment: `kubectl rollout restart deploy/haven -n haven`

## Current Behaviour During Outage
| Route Type | Behaviour |
|------------|-----------|
| Auth (`/api/auth`, `/api/users/profile`) | **Blocked** — returns 503 |
| AI (`/api/ai/`) | **Blocked** — returns 503 |
| Default API routes | **Allowed** — rate limiting bypassed |

## Recovery
Once Redis is available, rate limiting resumes automatically on the next request.
No restart is required unless credentials were rotated.

## Escalation
- If Upstash is degraded > 15 minutes, open support ticket: https://upstash.com/support
- If production auth is blocked > 5 minutes, page on-call engineer

## Post-Incident
- Review logs for any requests that bypassed rate limiting during the outage
- Confirm rate limiting metrics resume in Grafana after recovery
