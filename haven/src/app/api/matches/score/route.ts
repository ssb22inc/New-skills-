import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateMatchScore } from '@/services/matching/match-engine';
import { SeekerProfile } from '@/types/user';
import { ListingWithPhotos } from '@/types/listing';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const scoreSchema = z.object({
  listingId: z.string().uuid('listingId must be a valid UUID'),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = scoreSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { listingId } = parsed.data;
    const admin = createAdminClient();

    const [{ data: seekerProfile }, { data: listing }] = await Promise.all([
      admin.from('seeker_profiles').select('*').eq('user_id', user.id).single(),
      admin.from('listings').select('*, listing_photos(*)').eq('id', listingId).single(),
    ]);

    if (!seekerProfile || !listing) {
      return NextResponse.json({ error: 'Profile or listing not found' }, { status: 404 });
    }

    const result = await calculateMatchScore(
      seekerProfile as SeekerProfile,
      listing as unknown as ListingWithPhotos
    );
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ event: 'match_score_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Score calculation failed' }, { status: 500 });
  }
}
