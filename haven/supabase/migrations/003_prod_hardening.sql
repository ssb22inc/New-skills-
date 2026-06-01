-- ============================================================================
-- Migration 003: Production Hardening
-- • Schedule pg_cron cleanup jobs (audit logs, expired IP blocks, security alerts)
-- • Fix RLS policies on security_alerts and blocked_ips (add WITH CHECK)
-- • Add missing indexes for common sort/filter queries
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pg_cron cleanup schedules
-- ----------------------------------------------------------------------------
-- These require the pg_cron extension which is available on Supabase Pro plans.
-- Enable it via Dashboard → Database → Extensions if not already enabled.
--
-- Audit log cleanup: nightly at 03:00 UTC, retains last 90 days (critical excluded)
SELECT cron.schedule(
  'cleanup-audit-logs',
  '0 3 * * *',
  'SELECT cleanup_old_audit_logs()'
);

-- Expired IP block cleanup: every 30 minutes
SELECT cron.schedule(
  'cleanup-expired-ip-blocks',
  '*/30 * * * *',
  'SELECT cleanup_expired_ip_blocks()'
);

-- Resolved security alert cleanup: nightly at 04:00 UTC, retains last 30 days
SELECT cron.schedule(
  'cleanup-old-security-alerts',
  '0 4 * * *',
  $$DELETE FROM public.security_alerts
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND resolved = TRUE$$
);

-- ----------------------------------------------------------------------------
-- 2. Fix RLS policies: add explicit WITH CHECK (false) so INSERT/UPDATE
--    also requires the service role. USING (false) alone only blocks SELECT.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "security_alerts_service_only" ON public.security_alerts;
CREATE POLICY "security_alerts_service_only" ON public.security_alerts
    AS RESTRICTIVE
    FOR ALL
    USING (false)
    WITH CHECK (false);

DROP POLICY IF EXISTS "blocked_ips_service_only" ON public.blocked_ips;
CREATE POLICY "blocked_ips_service_only" ON public.blocked_ips
    AS RESTRICTIVE
    FOR ALL
    USING (false)
    WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- 3. Missing indexes for common sort/filter patterns
-- ----------------------------------------------------------------------------

-- listings.published_at: used for sorting newly-published listings
CREATE INDEX IF NOT EXISTS idx_listings_published_at
    ON public.listings(published_at DESC NULLS LAST)
    WHERE published_at IS NOT NULL;

-- bookings.created_at: used for sorting/filtering booking history
CREATE INDEX IF NOT EXISTS idx_bookings_created_at
    ON public.bookings(created_at DESC);

-- listings.price_monthly + status: compound index for filtered price sorts
CREATE INDEX IF NOT EXISTS idx_listings_status_price
    ON public.listings(status, price_monthly)
    WHERE status = 'active';
