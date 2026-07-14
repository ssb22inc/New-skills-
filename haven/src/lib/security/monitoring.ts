import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';

interface SecurityAlert {
  type: 'brute_force' | 'suspicious_activity' | 'rate_limit_abuse' | 'injection_attempt' | 'unauthorized_access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  ip_address?: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
}

class SecurityMonitor {
  private alertThresholds = {
    failedLogins: { count: 5, window: 300 }, // 5 failures in 5 minutes
    rateLimitHits: { count: 10, window: 60 }, // 10 rate limits in 1 minute
    suspiciousPatterns: { count: 3, window: 60 }, // 3 suspicious patterns in 1 minute
  };

  private recentEvents: Map<string, { count: number; timestamp: number }[]> = new Map();

  async trackEvent(
    eventType: string,
    identifier: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const key = `${eventType}:${identifier}`;
    const now = Date.now();

    if (!this.recentEvents.has(key)) {
      this.recentEvents.set(key, []);
    }

    const events = this.recentEvents.get(key)!;
    events.push({ count: 1, timestamp: now });

    // Clean old events
    const threshold = this.alertThresholds[eventType as keyof typeof this.alertThresholds];
    if (threshold) {
      const windowStart = now - threshold.window * 1000;
      const recentCount = events.filter((e) => e.timestamp > windowStart).length;

      if (recentCount >= threshold.count) {
        await this.triggerAlert({
          type: this.mapEventToAlertType(eventType),
          severity: this.determineSeverity(recentCount, threshold.count),
          description: `Threshold exceeded for ${eventType}: ${recentCount} events in ${threshold.window}s`,
          metadata: { ...metadata, eventCount: recentCount },
        });

        // Reset after alert
        this.recentEvents.set(key, []);
      }
    }
  }

  async triggerAlert(alert: SecurityAlert): Promise<void> {
    console.error('[SECURITY ALERT]', alert);

    // Store in database
    const supabase = await createServerSupabaseClient();
    await supabase.from('security_alerts').insert({
      alert_type: alert.type,
      severity: alert.severity,
      title: alert.type.replace(/_/g, ' '),
      description: alert.description,
      ip_address: alert.ip_address,
      user_id: alert.user_id,
      metadata: (alert.metadata ?? {}) as Json,
      created_at: new Date().toISOString(),
    });

    // Send notifications based on severity
    if (alert.severity === 'critical' || alert.severity === 'high') {
      await this.sendAlertNotification(alert);
    }

    // Auto-remediation for critical alerts
    if (alert.severity === 'critical') {
      await this.autoRemediate(alert);
    }
  }

  private async sendAlertNotification(alert: SecurityAlert): Promise<void> {
    // Send to Slack
    if (process.env.SLACK_SECURITY_WEBHOOK) {
      await fetch(process.env.SLACK_SECURITY_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 Security Alert: ${alert.type}`,
          attachments: [
            {
              color: alert.severity === 'critical' ? 'danger' : 'warning',
              fields: [
                { title: 'Severity', value: alert.severity, short: true },
                { title: 'Type', value: alert.type, short: true },
                { title: 'Description', value: alert.description },
                { title: 'IP', value: alert.ip_address || 'N/A', short: true },
              ],
            },
          ],
        }),
      });
    }

    // Send email for critical alerts
    if (alert.severity === 'critical' && process.env.SECURITY_EMAIL) {
      // Implement email sending
    }

    // PagerDuty integration for critical
    if (alert.severity === 'critical' && process.env.PAGERDUTY_KEY) {
      await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: process.env.PAGERDUTY_KEY,
          event_action: 'trigger',
          payload: {
            summary: `Haven Security Alert: ${alert.type}`,
            severity: alert.severity,
            source: 'haven-security-monitor',
            custom_details: alert,
          },
        }),
      });
    }
  }

  private async autoRemediate(alert: SecurityAlert): Promise<void> {
    const supabase = await createServerSupabaseClient();

    switch (alert.type) {
      case 'brute_force':
        // Block IP temporarily
        if (alert.ip_address) {
          await supabase.from('blocked_ips').insert({
            ip_address: alert.ip_address,
            reason: 'Brute force attack',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
          });
        }
        break;

      case 'unauthorized_access':
        // Invalidate user sessions
        if (alert.user_id) {
          await supabase.auth.admin.signOut(alert.user_id, 'global');
        }
        break;

      case 'injection_attempt':
        // Log and block
        if (alert.ip_address) {
          await supabase.from('blocked_ips').insert({
            ip_address: alert.ip_address,
            reason: 'Injection attempt',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          });
        }
        break;
    }
  }

  private mapEventToAlertType(eventType: string): SecurityAlert['type'] {
    const mapping: Record<string, SecurityAlert['type']> = {
      failedLogins: 'brute_force',
      rateLimitHits: 'rate_limit_abuse',
      suspiciousPatterns: 'suspicious_activity',
    };
    return mapping[eventType] || 'suspicious_activity';
  }

  private determineSeverity(count: number, threshold: number): SecurityAlert['severity'] {
    const ratio = count / threshold;
    if (ratio >= 3) return 'critical';
    if (ratio >= 2) return 'high';
    if (ratio >= 1.5) return 'medium';
    return 'low';
  }
}

export const securityMonitor = new SecurityMonitor();

// IP Blocklist checker
export async function isIpBlocked(ipAddress: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('blocked_ips')
    .select('id')
    .eq('ip_address', ipAddress)
    .gt('expires_at', new Date().toISOString())
    .single();

  return !!data;
}
