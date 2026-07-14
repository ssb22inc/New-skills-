import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listingSchema } from '@/lib/utils/validation';
import { logger } from '@/lib/logger';
import { ZodError } from 'zod';
import type { PropertyType } from '@/types/database';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // Project only the fields the list view needs — excludes heavy columns like
    // listing_embedding (1536 floats) and ai_analysis JSON.
    let query = supabase
      .from('listings')
      .select(
        'id, title, headline, property_type, bedrooms, bathrooms, sqft, city, state, zip_code, neighborhood, price_monthly, available_date, instant_booking, furniture_status, amenities, status, created_at, slug, photos:listing_photos(id, url, thumbnail_url, is_primary)',
        { count: 'exact' }
      )
      .eq('status', 'active');

    const city = searchParams.get('city');
    if (city) query = query.ilike('city', `%${city}%`);

    const state = searchParams.get('state');
    if (state) query = query.eq('state', state);

    const minPriceRaw = parseInt(searchParams.get('minPrice') || '');
    if (!isNaN(minPriceRaw) && minPriceRaw >= 0) {
      query = query.gte('price_monthly', minPriceRaw);
    }

    const maxPriceRaw = parseInt(searchParams.get('maxPrice') || '');
    if (!isNaN(maxPriceRaw) && maxPriceRaw >= 0) {
      query = query.lte('price_monthly', maxPriceRaw);
    }

    const bedroomsRaw = parseInt(searchParams.get('bedrooms') || '');
    if (!isNaN(bedroomsRaw) && bedroomsRaw >= 0) {
      query = query.eq('bedrooms', bedroomsRaw);
    }

    const ALLOWED_PROPERTY_TYPES = ['apartment', 'house', 'condo', 'room', 'townhouse', 'studio'];
    const propertyType = searchParams.get('propertyType');
    if (propertyType && ALLOWED_PROPERTY_TYPES.includes(propertyType)) {
      query = query.eq('property_type', propertyType as PropertyType);
    }

    const availableFrom = searchParams.get('availableFrom');
    if (availableFrom) query = query.lte('available_date', availableFrom);

    const instantBooking = searchParams.get('instantBooking');
    if (instantBooking === 'true') query = query.eq('instant_booking', true);

    const ALLOWED_SORT = ['newest', 'price_asc', 'price_desc'];
    const sortBy = ALLOWED_SORT.includes(searchParams.get('sortBy') || '') ? searchParams.get('sortBy')! : 'newest';
    switch (sortBy) {
      case 'price_asc': query = query.order('price_monthly', { ascending: true }); break;
      case 'price_desc': query = query.order('price_monthly', { ascending: false }); break;
      default: query = query.order('created_at', { ascending: false });
    }

    // Clamp page and limit to prevent large offset scans.
    const MAX_LIMIT = 100;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      listings: data,
      pagination: { page, limit, total: count ?? 0 },
    });
  } catch (error) {
    logger.error({ event: 'listings_get_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 });
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

    const validated = listingSchema.parse(body);

    const { data, error } = await supabase
      .from('listings')
      .insert({
        ...validated,
        user_id: user.id,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    logger.error({ event: 'listing_create_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
  }
}
