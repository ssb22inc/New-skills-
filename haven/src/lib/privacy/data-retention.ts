import { createServerSupabaseClient } from '@/lib/supabase/server';

interface RetentionPolicy {
  table: string;
  retentionDays: number;
  condition?: string;
  action: 'delete' | 'anonymize';
}

const retentionPolicies: RetentionPolicy[] = [
  // Audit logs - keep for 90 days (except critical)
  {
    table: 'audit_logs',
    retentionDays: 90,
    condition: "severity != 'critical'",
    action: 'delete',
  },
  // Security alerts - keep for 365 days
  {
    table: 'security_alerts',
    retentionDays: 365,
    action: 'delete',
  },
  // Expired blocked IPs - 7 days after expiry
  {
    table: 'blocked_ips',
    retentionDays: 7,
    condition: 'blocked_until < NOW()',
    action: 'delete',
  },
];

export async function enforceRetentionPolicies(): Promise<{
  policiesApplied: number;
  recordsAffected: number;
}> {
  const supabase = await createServerSupabaseClient();
  let totalAffected = 0;

  for (const policy of retentionPolicies) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    let query = supabase.from(policy.table).select('id');

    // Apply time-based filter
    query = query.lt('created_at', cutoffDate.toISOString());

    const { data: records } = await query;

    if (records && records.length > 0) {
      const ids = records.map((r) => r.id);

      if (policy.action === 'delete') {
        await supabase.from(policy.table).delete().in('id', ids);
      } else if (policy.action === 'anonymize') {
        await anonymizeRecords(policy.table, ids);
      }

      totalAffected += records.length;
    }
  }

  return { policiesApplied: retentionPolicies.length, recordsAffected: totalAffected };
}

async function anonymizeRecords(table: string, ids: string[]): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const anonymizationMap: Record<string, Record<string, unknown>> = {
    verifications: {
      document_storage_path: null,
      extracted_data: {},
      ai_analysis: {},
    },
    profiles: {
      full_name: '[Anonymized]',
      phone: null,
      avatar_url: null,
    },
  };

  const updates = anonymizationMap[table];
  if (updates) {
    await supabase.from(table).update(updates).in('id', ids);
  }
}

// Schedule this to run daily
export async function runRetentionJob(): Promise<void> {
  console.log('[Retention] Starting data retention enforcement...');

  try {
    const result = await enforceRetentionPolicies();
    console.log(
      `[Retention] Complete: ${result.policiesApplied} policies, ${result.recordsAffected} records affected`
    );
  } catch (error) {
    console.error('[Retention] Error:', error);
    throw error;
  }
}
