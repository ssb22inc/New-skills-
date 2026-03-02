import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateMatchScore } from '@/services/matching/match-engine';
import { SeekerProfile } from '@/types/user';
import { ListingWithPhotos } from '@/types/listing';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { listingId } = await request.json();
    if (!listingId) {
      return NextResponse.json({ error: 'listingId required' }, { status: 400 });
    }

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Score calculation failed' },
      { status: 500 }
    );
  }
}
