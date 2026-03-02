import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findMatchesForSeeker } from '@/services/matching/match-engine';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: seekerProfile } = await supabase
      .from('seeker_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!seekerProfile) {
      return NextResponse.json({ error: 'Seeker profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const minScore = parseInt(searchParams.get('minScore') || '30');

    const matches = await findMatchesForSeeker(seekerProfile.id, { limit, minScore });

    return NextResponse.json({ matches });
  } catch (error) {
    console.error('Matches fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch matches' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { listing_id, action } = await request.json();

    const { data: seekerProfile } = await supabase
      .from('seeker_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!seekerProfile) {
      return NextResponse.json({ error: 'Seeker profile not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('matches')
      .upsert(
        {
          seeker_id: seekerProfile.id,
          listing_id,
          seeker_action: action,
          seeker_action_at: new Date().toISOString(),
          total_score: 0,
        },
        { onConflict: 'seeker_id,listing_id' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Match action error:', error);
    return NextResponse.json({ error: 'Failed to record action' }, { status: 500 });
  }
}
