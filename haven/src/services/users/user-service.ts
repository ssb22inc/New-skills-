import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/types/user'
import type { Database } from '@/types/database'

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) return null
  return data
}

export async function updateProfile(
  userId: string,
  data: Partial<Profile>
): Promise<Profile> {
  const supabase = createAdminClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .update(data as Database['public']['Tables']['profiles']['Update'])
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  return profile
}

export async function getSeekerProfile(userId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('seeker_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) return null
  return data
}

export async function upsertSeekerProfile(userId: string, data: Record<string, unknown>) {
  const supabase = createAdminClient()
  const { data: profile, error } = await supabase
    .from('seeker_profiles')
    .upsert({ ...data, user_id: userId })
    .select()
    .single()

  if (error) throw error
  return profile
}

export async function getLandlordProfile(userId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('landlord_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) return null
  return data
}
