import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    // Get seeker profile
    const { data: seekerProfile } = await admin
      .from('seeker_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!seekerProfile) {
      return NextResponse.json({ data: [] })
    }

    const { data: matches, error } = await admin
      .from('matches')
      .select('*, listings(*, listing_photos(*))')
      .eq('seeker_id', seekerProfile.id)
      .order('total_score', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ data: matches })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch matches' },
      { status: 500 }
    )
  }
}
