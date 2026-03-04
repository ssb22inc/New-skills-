import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateListing, generateListingEmbedding } from '@/services/ai/listing-generator';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const generateListingSchema = z.object({
  city: z.string().min(2).max(100),
  state: z.string().length(2),
  neighborhood: z.string().max(100).optional(),
  property_type: z.enum(['apartment', 'house', 'condo', 'room', 'townhouse', 'studio']),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().min(0.5).max(10),
  amenities: z.array(z.string()).max(50).optional().default([]),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = generateListingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const input = parsed.data;
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
    logger.error({ event: 'ai_generate_listing_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to generate listing' }, { status: 500 });
  }
}
