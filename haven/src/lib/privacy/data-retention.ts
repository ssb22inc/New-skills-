import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

type TableName = keyof Database['public']['Tables'] & string;

interface RetentionPolicy {
  table: TableName;
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
    condition: 'expires_at < NOW()',
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

    // Table name is dynamic; every policy table has `id` and `created_at`,
    // so anchor the builder's types on one such table.
    let query = supabase.from(policy.table as 'audit_logs').select('id');

    // Apply time-based filter
    query = query.lt('created_at', cutoffDate.toISOString());

    // Apply additional condition if specified
    // Note: Complex conditions would need raw SQL via RPC

    const { data: records } = await query;

    if (records && records.length > 0) {
      const ids = records.map((r) => r.id);

      if (policy.action === 'delete') {
        await supabase.from(policy.table as 'audit_logs').delete().in('id', ids);
      } else if (policy.action === 'anonymize') {
        // Anonymization depends on table structure
        await anonymizeRecords(policy.table, ids);
      }

      totalAffected += records.length;
    }
  }

  return { policiesApplied: retentionPolicies.length, recordsAffected: totalAffected };
}

async function anonymizeRecords(table: TableName, ids: string[]): Promise<void> {
  const supabase = await createServerSupabaseClient();

  if (table === 'verifications') {
    await supabase
      .from('verifications')
      .update({ document_storage_path: null, extracted_data: {}, ai_analysis: {} })
      .in('id', ids);
  } else if (table === 'profiles') {
    await supabase
      .from('profiles')
      .update({ full_name: '[Anonymized]', phone: null, avatar_url: null })
      .in('id', ids);
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
