import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateListing, generateListingEmbedding } from '@/services/ai/listing-generator';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const input = await request.json();

    const listing = await generateListing(input);
    const embedding = await generateListingEmbedding({
      title: listing.title,
      description: listing.description,
      amenities: listing.amenities,
      city: input.city,
      neighborhood: input.neighborhood,
    });

    return NextResponse.json({ listing, embedding });
  } catch (error) {
    console.error('Listing generation error:', error);
    return NextResponse.json({ error: 'Failed to generate listing' }, { status: 500 });
  }
}
