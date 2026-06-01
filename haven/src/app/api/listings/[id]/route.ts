import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Only allow patching user-facing fields; system fields are excluded.
const listingPatchSchema = z.object({
  title: z.string().min(10).max(100).optional(),
  headline: z.string().max(200).optional(),
  description: z.string().min(50).max(5000).optional(),
  property_type: z.enum(['apartment', 'house', 'condo', 'room', 'townhouse', 'studio']).optional(),
  bedrooms: z.number().int().min(0).max(10).optional(),
  bathrooms: z.number().min(0.5).max(10).optional(),
  sqft: z.number().int().min(100).max(50000).optional(),
  address_line1: z.string().min(5).optional(),
  address_line2: z.string().optional(),
  city: z.string().min(2).optional(),
  state: z.string().length(2).optional(),
  zip_code: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  neighborhood: z.string().optional(),
  price_monthly: z.number().int().min(100).max(100000).optional(),
  price_weekly: z.number().int().min(50).optional(),
  security_deposit: z.number().int().min(0).optional(),
  cleaning_fee: z.number().int().min(0).optional(),
  utilities_included: z.boolean().optional(),
  utilities_estimate: z.number().int().min(0).optional(),
  available_date: z.string().optional(),
  minimum_stay_days: z.number().int().min(1).optional(),
  maximum_stay_days: z.number().int().min(1).optional(),
  instant_booking: z.boolean().optional(),
  furniture_status: z.enum(['furnished', 'partially_furnished', 'unfurnished']).optional(),
  amenities: z.array(z.string()).optional(),
  house_rules: z.array(z.string()).optional(),
  pet_policy: z.string().optional(),
  smoking_policy: z.string().optional(),
  guest_policy: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused']).optional(), // rented/archived require explicit transitions
  seo_title: z.string().max(100).optional(),
  seo_description: z.string().max(300).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        photos:listing_photos(id, url, thumbnail_url, position, room_type, caption, is_primary),
        landlord:profiles!listings_user_id_fkey(id, full_name, avatar_url)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    // Increment view count (fire-and-forget)
    supabase.rpc('increment_listing_views', { listing_uuid: id }).then(() => {});

    return NextResponse.json(data);
  } catch (error) {
    logger.error({ event: 'listing_get_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch listing' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const parsed = listingPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('listings')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('listings')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    logger.error({ event: 'listing_patch_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ event: 'listing_delete_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to delete listing' }, { status: 500 });
  }
}
