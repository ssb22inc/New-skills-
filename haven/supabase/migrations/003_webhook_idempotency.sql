-- Migration: webhook idempotency table
-- Stores Stripe event IDs that have been successfully processed so that
-- duplicate webhook deliveries (Stripe retries) are safely de-duplicated.

CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
    stripe_event_id TEXT PRIMARY KEY,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Automatically purge events older than 90 days to bound table growth.
-- Stripe's webhook retry window is at most 3 days, so 90 days is very safe.
CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
    ON public.processed_webhook_events (processed_at);

COMMENT ON TABLE public.processed_webhook_events IS
    'Idempotency log for Stripe webhook events. Records every stripe_event_id '
    'that has been fully processed so retried deliveries are no-ops.';
