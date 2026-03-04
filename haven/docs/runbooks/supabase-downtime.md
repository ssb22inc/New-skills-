# Runbook: Supabase Downtime

## Symptoms
- API routes returning 500 errors with database-related messages
- Health check endpoint (`/api/health`) reporting `{"status":"degraded","database":"error"}`
- Auth flows failing (user unable to log in / register)
- High rate of `AuthError` or `PostgrestError` in application logs

## Severity
**P1** — all authenticated API routes depend on Supabase.

## Immediate Actions

### 1. Check Supabase status
Check https://status.supabase.com for known incidents affecting your project region.

### 2. Confirm project-level issue vs. global outage
Log in to https://app.supabase.com → select the Haven project → check the database health dashboard.

### 3. Check application health endpoint
```bash
curl -sf https://haven.app/api/health | jq .
```
If `"database":"error"`, Supabase PostgREST or the database itself is unreachable.

### 4. Check application logs for error patterns
```bash
kubectl logs -n haven -l app=haven --since=15m | grep -E '"level":"error"' | head -50
```

### 5. Verify connection from inside the cluster
```bash
kubectl exec -it -n haven deploy/haven -- sh -c \
  'curl -sf "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
    -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"'
# Expect: 200 with empty or schema JSON
```

## If Supabase Is Partially Degraded

### Read-only mode (PostgREST reachable but writes fail)
- Some API endpoints will return 500 on write operations
- Consider activating a maintenance page:
  ```bash
  kubectl set env deploy/haven MAINTENANCE_MODE=true -n haven
  ```

### Auth service degraded (login/signup fails)
- Existing sessions with valid JWTs continue to work
- New logins fail until Supabase Auth recovers

## Escalation
- If Supabase is degraded > 10 minutes, open a support ticket: https://supabase.com/support
- For Haven Supabase Pro plan incidents, use the priority support channel
- Page on-call engineer if the outage exceeds 5 minutes

## Post-Incident
1. Verify database integrity: run `SELECT COUNT(*) FROM audit_logs` and compare to pre-incident baseline
2. Check for any partial writes that may need reconciliation (e.g., bookings stuck in `pending`)
3. Resume normal operations and confirm health check returns `{"status":"healthy"}`
4. Write post-mortem if outage exceeded 15 minutes
