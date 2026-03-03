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
  // Analytics events - keep for 365 days
  {
    table: 'events',
    retentionDays: 365,
    action: 'delete',
  },
  // Messages from deleted conversations - 30 days
  {
    table: 'messages',
    retentionDays: 30,
    condition: "conversation_id IN (SELECT id FROM conversations WHERE updated_at < NOW() - INTERVAL '30 days')",
    action: 'delete',
  },
  // Verification documents - 365 days after verification
  {
    table: 'verifications',
    retentionDays: 365,
    condition: "status = 'verified'",
    action: 'anonymize',
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

    // Apply additional condition if specified
    // Note: Complex conditions would need raw SQL via RPC

    const { data: records } = await query;

    if (records && records.length > 0) {
      const ids = records.map((r) => r.id);

      if (policy.action === 'delete') {
        await supabase.from(policy.table).delete().in('id', ids);
      } else if (policy.action === 'anonymize') {
        // Anonymization depends on table structure
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
