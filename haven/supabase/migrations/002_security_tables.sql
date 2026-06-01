-- Migration 002: Security & Compliance Tables
-- Adds tables required by src/lib/security/* modules

-- ============================================================================
-- SECURITY ALERTS
-- Used by src/lib/security/monitoring.ts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.security_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    description TEXT,
    ip_address INET,
    user_id UUID REFERENCES public.profiles(id),
    request_path TEXT,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX idx_security_alerts_created_at ON public.security_alerts(created_at DESC);
CREATE INDEX idx_security_alerts_severity ON public.security_alerts(severity);
CREATE INDEX idx_security_alerts_alert_type ON public.security_alerts(alert_type);
CREATE INDEX idx_security_alerts_ip ON public.security_alerts(ip_address);
CREATE INDEX idx_security_alerts_resolved ON public.security_alerts(resolved) WHERE resolved = FALSE;

-- ============================================================================
-- BLOCKED IPs
-- Used by src/lib/security/monitoring.ts for IP blocking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blocked_ips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    blocked_by TEXT DEFAULT 'system',
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_blocked_ips_ip ON public.blocked_ips(ip_address);
CREATE INDEX idx_blocked_ips_expires_at ON public.blocked_ips(expires_at) WHERE expires_at IS NOT NULL;

-- Auto-expire: function to clean up expired blocks
CREATE OR REPLACE FUNCTION cleanup_expired_ip_blocks()
RETURNS void AS $$
BEGIN
    DELETE FROM public.blocked_ips
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CONSENT RECORDS
-- Used by src/lib/privacy/gdpr.ts for GDPR compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL,
    granted BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    version TEXT NOT NULL DEFAULT '1.0',
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(user_id, consent_type, version)
);

CREATE INDEX idx_consent_records_user_id ON public.consent_records(user_id);
CREATE INDEX idx_consent_records_type ON public.consent_records(consent_type);
CREATE INDEX idx_consent_records_granted ON public.consent_records(granted);

CREATE TRIGGER update_consent_records_updated_at
    BEFORE UPDATE ON public.consent_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- DATA DELETION REQUESTS
-- Used by src/lib/privacy/gdpr.ts for right-to-erasure
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_deletion_requests_user_id ON public.data_deletion_requests(user_id);
CREATE INDEX idx_deletion_requests_status ON public.data_deletion_requests(status);

CREATE TRIGGER update_deletion_requests_updated_at
    BEFORE UPDATE ON public.data_deletion_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Security alerts: only service role can access
CREATE POLICY "security_alerts_service_only" ON public.security_alerts
    USING (false);

-- Blocked IPs: only service role can access
CREATE POLICY "blocked_ips_service_only" ON public.blocked_ips
    USING (false);

-- Consent records: users can read/write their own
CREATE POLICY "consent_records_own" ON public.consent_records
    FOR ALL USING (user_id = auth.uid());

-- Deletion requests: users can read their own
CREATE POLICY "deletion_requests_own" ON public.data_deletion_requests
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "deletion_requests_insert_own" ON public.data_deletion_requests
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- Enable pg_cron cleanup schedules (run manually if pg_cron is available)
-- ============================================================================

-- SELECT cron.schedule('cleanup-expired-ip-blocks', '*/30 * * * *', 'SELECT cleanup_expired_ip_blocks()');
-- SELECT cron.schedule('cleanup-old-security-alerts', '0 4 * * *',
--   'DELETE FROM public.security_alerts WHERE created_at < NOW() - INTERVAL ''30 days'' AND resolved = TRUE');
