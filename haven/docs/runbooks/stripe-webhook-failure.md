# Runbook: Stripe Webhook Failures

## Symptoms
- `webhook_processing_failed` errors in application logs
- Stripe Dashboard shows failed webhook deliveries (4xx/5xx responses)
- Subscriptions not activating after checkout
- Booking payment status stuck in `pending`

## Severity
**P1** if payment flows are blocked. **P2** for isolated retry failures.

## Immediate Actions

### 1. Check recent webhook delivery status
Log in to Stripe Dashboard → Developers → Webhooks → select the endpoint.
Review the **Recent deliveries** tab for failures. Note the event type and error code.

### 2. Check application logs for processing errors
```bash
# Kubernetes
kubectl logs -n haven -l app=haven --since=30m | grep '"event":"webhook_processing_failed"'

# Or via log aggregator
grep 'webhook_processing_failed' /var/log/haven/*.log | tail -50
```

### 3. Verify the webhook endpoint is reachable
```bash
curl -sf https://haven.app/api/health | jq .
# Expect: {"status":"healthy"}
```
If the health check fails, the application is down — follow the high-error-rate runbook.

### 4. Verify STRIPE_WEBHOOK_SECRET is correct
If Stripe reports "Invalid signature" events:
```bash
kubectl get secret haven-secrets -n haven -o jsonpath='{.data.STRIPE_WEBHOOK_SECRET}' | base64 -d
```
Compare with the secret shown in Stripe Dashboard → Developers → Webhooks → endpoint → Signing secret.
If they differ, update the secret and redeploy.

### 5. Replay failed events
In Stripe Dashboard → Developers → Webhooks → Recent deliveries, click **Resend** on each failed event.
Or use the Stripe CLI:
```bash
stripe events resend <event_id>
```

## Recovery

### Idempotency
The webhook handler is idempotent via the `processed_webhook_events` table. Replaying events is safe.

### Manual subscription activation
If a user completed checkout but their subscription was not activated:
```sql
-- Find the checkout session from Stripe Dashboard, then:
INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan_id, status)
VALUES ('<user_id>', '<stripe_customer_id>', '<stripe_subscription_id>', '<plan_id>', 'active')
ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = 'active';
```

### Manual booking payment status update
```sql
UPDATE bookings
SET payment_status = 'paid', stripe_payment_intent_id = '<intent_id>'
WHERE id = '<booking_id>';
```

## Escalation
- If Stripe itself is degraded: check https://status.stripe.com and open a support ticket at https://support.stripe.com
- If the issue is a code bug in the webhook handler: escalate to on-call engineer

## Post-Incident
- Replay all failed events from Stripe Dashboard once the root cause is resolved
- Review `processed_webhook_events` to confirm no duplicates were introduced
