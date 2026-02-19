import { createServerSupabaseClient } from '@/lib/supabase/server';

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.failed_login'
  | 'auth.password_change'
  | 'auth.password_reset'
  | 'listing.create'
  | 'listing.update'
  | 'listing.delete'
  | 'listing.publish'
  | 'booking.create'
  | 'booking.cancel'
  | 'payment.success'
  | 'payment.failed'
  | 'profile.update'
  | 'profile.verification'
  | 'admin.action'
  | 'security.rate_limit'
  | 'security.suspicious_activity';

export interface AuditLogEntry {
  id?: string;
  timestamp: string;
  action: AuditAction;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  severity: 'info' | 'warning' | 'critical';
  success: boolean;
}

class AuditLogger {
  private queue: AuditLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds

  constructor() {
    if (typeof window === 'undefined') {
      this.flushInterval = setInterval(() => this.flush(), this.FLUSH_INTERVAL);
    }
  }

  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.queue.push(fullEntry);

    // Log critical events immediately
    if (entry.severity === 'critical') {
      await this.flush();
    } else if (this.queue.length >= this.BATCH_SIZE) {
      await this.flush();
    }

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[AUDIT]', fullEntry);
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const entries = [...this.queue];
    this.queue = [];

    try {
      const supabase = await createServerSupabaseClient();

      // Note: audit_logs table needs to be created in Supabase
      // For now, we'll log to console if table doesn't exist
      const { error } = await supabase.from('audit_logs').insert(entries);

      if (error) {
        console.error('[AUDIT] Failed to flush logs:', error);
        // Log to console as fallback
        entries.forEach(entry => console.log('[AUDIT FALLBACK]', entry));
      }
    } catch (error) {
      console.error('[AUDIT] Failed to flush logs:', error);
      // Re-queue failed entries (limit to prevent memory issues)
      if (this.queue.length < this.BATCH_SIZE * 2) {
        this.queue.unshift(...entries);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
  }
}

export const auditLogger = new AuditLogger();

// Convenience functions
export async function logAuthEvent(
  action: 'auth.login' | 'auth.logout' | 'auth.failed_login' | 'auth.password_change',
  userId: string | null,
  request: Request,
  success: boolean,
  details?: Record<string, unknown>
): Promise<void> {
  await auditLogger.log({
    action,
    user_id: userId,
    ip_address: getClientIp(request),
    user_agent: request.headers.get('user-agent'),
    severity: action === 'auth.failed_login' ? 'warning' : 'info',
    success,
    details,
  });
}

export async function logSecurityEvent(
  action: 'security.rate_limit' | 'security.suspicious_activity',
  userId: string | null,
  request: Request,
  details: Record<string, unknown>
): Promise<void> {
  await auditLogger.log({
    action,
    user_id: userId,
    ip_address: getClientIp(request),
    user_agent: request.headers.get('user-agent'),
    severity: 'warning',
    success: false,
    details,
  });
}

export async function logResourceEvent(
  action: AuditAction,
  userId: string,
  resourceType: string,
  resourceId: string,
  request: Request,
  success: boolean,
  details?: Record<string, unknown>
): Promise<void> {
  await auditLogger.log({
    action,
    user_id: userId,
    ip_address: getClientIp(request),
    user_agent: request.headers.get('user-agent'),
    resource_type: resourceType,
    resource_id: resourceId,
    severity: 'info',
    success,
    details,
  });
}

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  return null;
}
