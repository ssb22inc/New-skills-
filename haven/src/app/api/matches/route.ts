import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findMatchesForSeeker } from '@/services/matching/match-engine';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const MATCH_ACTIONS = ['like', 'pass', 'super_like'] as const;

const matchActionSchema = z.object({
  listing_id: z.string().uuid('listing_id must be a valid UUID'),
  action: z.enum(MATCH_ACTIONS),
});

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
    const MAX_LIMIT = 100;
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const minScore = Math.max(0, Math.min(100, parseInt(searchParams.get('minScore') || '30') || 30));

    const matches = await findMatchesForSeeker(seekerProfile.id, { limit, minScore });

    return NextResponse.json({ matches });
  } catch (error) {
    logger.error({ event: 'matches_get_error', error: error instanceof Error ? error.message : String(error) });
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = matchActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { listing_id, action } = parsed.data;

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
    logger.error({ event: 'match_action_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to record action' }, { status: 500 });
  }
}
