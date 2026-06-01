# Runbook: OpenAI API Errors

## Symptoms
- AI chat endpoint (`/api/ai/chat`) returning 500 or 502 errors
- AI listing generation endpoint failing
- AI matching endpoint slow or timing out
- Errors containing `openai`, `RateLimitError`, `APIConnectionError`, or `AuthenticationError` in logs

## Severity
**P2** — AI features are degraded but core listing/booking flows are unaffected.

## Immediate Actions

### 1. Check OpenAI status
Check https://status.openai.com for known incidents.

### 2. Check application logs for error type
```bash
kubectl logs -n haven -l app=haven --since=15m | grep -E '"event":"(chat|ai).*error"' | head -30
```

### 3. Identify the error type

| Error | Cause | Action |
|-------|-------|--------|
| `AuthenticationError` | Invalid/revoked API key | Rotate `OPENAI_API_KEY` |
| `RateLimitError` | Quota exceeded | Wait or increase usage tier |
| `APIConnectionError` | Network / OpenAI outage | Check status.openai.com |
| `APITimeoutError` | Model latency spike | Retry with backoff |
| `InsufficientQuotaError` | Billing issue | Check OpenAI billing dashboard |

### 4. Verify the API key is valid
```bash
kubectl exec -it -n haven deploy/haven -- sh -c \
  'curl -sf https://api.openai.com/v1/models \
    -H "Authorization: Bearer $OPENAI_API_KEY" | jq ".data[0].id"'
# Expect: a model name like "gpt-4o"
# AuthenticationError → key is invalid/revoked
```

### 5. Rotate the API key if compromised or invalid
1. Generate a new key at https://platform.openai.com/api-keys
2. Update the Kubernetes secret:
   ```bash
   kubectl patch secret haven-secrets -n haven --type=merge \
     -p '{"stringData":{"OPENAI_API_KEY":"<new_key>"}}'
   ```
3. Restart the deployment:
   ```bash
   kubectl rollout restart deploy/haven -n haven
   ```

## Graceful Degradation
AI features fail with a user-friendly error message. Core flows (listings, bookings, auth) are unaffected.
If AI is down for an extended period, consider displaying a banner notifying users.

## Rate Limit Recovery
If rate limits are hit:
- The AI endpoint returns 429 to clients automatically
- Review usage in OpenAI Dashboard → Usage
- Consider raising the rate-limit tier or implementing request queuing

## Escalation
- If the OpenAI outage exceeds 30 minutes, notify users via status page
- If the API key was compromised, rotate immediately and audit recent usage in the OpenAI Dashboard

## Post-Incident
1. Confirm AI endpoints return 200 after recovery
2. Review any queued or failed requests from affected users
3. If quota was exhausted, review usage patterns and adjust rate-limiting thresholds
