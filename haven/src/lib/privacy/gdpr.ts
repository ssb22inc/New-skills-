import { createServerSupabaseClient } from '@/lib/supabase/server';

// Data Subject Rights Implementation

/**
 * Right to Access (Article 15)
 * Export all user data
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const supabase = await createServerSupabaseClient();

  // Gather all user data
  const [profile, seekerProfile, landlordProfile, listings, bookings, messages, reviews] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('seeker_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('landlord_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('listings').select('*').eq('user_id', userId),
      supabase.from('bookings').select('*').or(`seeker_id.eq.${userId},landlord_id.eq.${userId}`),
      supabase.from('messages').select('*').eq('sender_id', userId),
      supabase.from('reviews').select('*').eq('reviewer_id', userId),
    ]);

  return {
    exportDate: new Date().toISOString(),
    profile: profile.data,
    seekerProfile: seekerProfile.data,
    landlordProfile: landlordProfile.data,
    listings: listings.data,
    bookings: bookings.data,
    messages: messages.data,
    reviews: reviews.data,
  };
}

/**
 * Right to Erasure (Article 17)
 * Delete all user data
 */
export async function deleteUserData(
  userId: string,
  options: { hardDelete?: boolean; preserveAuditLogs?: boolean } = {}
): Promise<{ success: boolean; deletedRecords: number }> {
  const supabase = await createServerSupabaseClient();
  let deletedCount = 0;

  // Order matters due to foreign key constraints
  const tables = [
    { name: 'messages', column: 'sender_id' },
    { name: 'reviews', column: 'reviewer_id' },
    { name: 'bookings', column: 'seeker_id' },
    { name: 'bookings', column: 'landlord_id' },
    { name: 'matches', column: 'seeker_id' },
    { name: 'listings', column: 'user_id' },
    { name: 'verifications', column: 'user_id' },
    { name: 'seeker_profiles', column: 'user_id' },
    { name: 'landlord_profiles', column: 'user_id' },
  ];

  for (const table of tables) {
    const { count } = await supabase.from(table.name).delete().eq(table.column, userId);
    deletedCount += count || 0;
  }

  // Delete profile last
  if (options.hardDelete) {
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from('profiles').delete().eq('id', userId);
  } else {
    // Soft delete - anonymize data
    await supabase
      .from('profiles')
      .update({
        email: `deleted_${userId}@deleted.local`,
        full_name: '[Deleted User]',
        phone: null,
        avatar_url: null,
        metadata: { deleted: true, deletedAt: new Date().toISOString() },
      })
      .eq('id', userId);
  }

  // Optionally preserve audit logs with anonymized user reference
  if (!options.preserveAuditLogs) {
    await supabase.from('audit_logs').delete().eq('user_id', userId);
  }

  return { success: true, deletedRecords: deletedCount };
}

/**
 * Right to Rectification (Article 16)
 * Update user data
 */
export async function rectifyUserData(
  userId: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean }> {
  const supabase = await createServerSupabaseClient();

  // Validate updates don't contain prohibited fields
  const prohibitedFields = ['id', 'created_at', 'email']; // email requires separate flow
  for (const field of prohibitedFields) {
    if (field in updates) {
      throw new Error(`Cannot update ${field} through rectification`);
    }
  }

  await supabase.from('profiles').update(updates).eq('id', userId);

  return { success: true };
}

/**
 * Right to Data Portability (Article 20)
 * Export data in machine-readable format
 */
export async function exportDataPortable(userId: string): Promise<string> {
  const data = await exportUserData(userId);
  return JSON.stringify(data, null, 2);
}

/**
 * Consent Management
 */
export interface ConsentRecord {
  type: 'marketing' | 'analytics' | 'necessary' | 'third_party';
  granted: boolean;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
}

export async function recordConsent(
  userId: string,
  consents: ConsentRecord[]
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  await supabase.from('consent_records').insert(
    consents.map((consent) => ({
      user_id: userId,
      consent_type: consent.type,
      granted: consent.granted,
      ip_address: consent.ip_address,
      user_agent: consent.user_agent,
    }))
  );

  // Update profile preferences
  const consentMap = consents.reduce(
    (acc, c) => ({ ...acc, [c.type]: c.granted }),
    {}
  );

  await supabase
    .from('profiles')
    .update({
      metadata: {
        consents: consentMap,
        consentUpdatedAt: new Date().toISOString(),
      },
    })
    .eq('id', userId);
}

export async function getConsentStatus(
  userId: string
): Promise<Record<string, boolean>> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from('profiles')
    .select('metadata')
    .eq('id', userId)
    .single();

  return (data?.metadata as any)?.consents || {};
}
