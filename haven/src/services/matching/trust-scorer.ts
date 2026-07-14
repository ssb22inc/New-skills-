import type { SeekerProfile } from '@/types/user'
import { createAdminClient } from '@/lib/supabase/admin'

export function scoreTrust(_seeker: SeekerProfile): { score: number; details: string[] } {
  // Placeholder - in production this would consider verification status
  return { score: 70, details: ['Basic profile verification'] }
}

export async function scoreTrustFromProfile(userId: string): Promise<{ score: number; details: string[] }> {
  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('identity_verified, income_verified, background_check_completed')
    .eq('id', userId)
    .single()

  if (!profile) return { score: 50, details: ['Profile not found'] }

  const details: string[] = []
  let score = 50

  if (profile.identity_verified) {
    score += 20
    details.push('Identity verified')
  }
  if (profile.income_verified) {
    score += 20
    details.push('Income verified')
  }
  if (profile.background_check_completed) {
    score += 10
    details.push('Background check completed')
  }

  return { score, details }
}
