import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listingSchema } from '@/lib/utils/validation';

// GET /api/listings - List/search listings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    let query = supabase
      .from('listings')
      .select(`
        *,
        photos:listing_photos(*)
      `)
      .eq('status', 'active');

    // Apply filters
    const city = searchParams.get('city');
    if (city) query = query.ilike('city', `%${city}%`);

    const state = searchParams.get('state');
    if (state) query = query.eq('state', state);

    const minPrice = searchParams.get('minPrice');
    if (minPrice) query = query.gte('price_monthly', parseInt(minPrice));

    const maxPrice = searchParams.get('maxPrice');
    if (maxPrice) query = query.lte('price_monthly', parseInt(maxPrice));

    const bedrooms = searchParams.get('bedrooms');
    if (bedrooms) query = query.eq('bedrooms', parseInt(bedrooms));

    const propertyType = searchParams.get('propertyType');
    if (propertyType) query = query.eq('property_type', propertyType);

    // Sorting
    const sortBy = searchParams.get('sortBy') || 'newest';
    switch (sortBy) {
      case 'price_asc': query = query.order('price_monthly', { ascending: true }); break;
      case 'price_desc': query = query.order('price_monthly', { ascending: false }); break;
      case 'newest': default: query = query.order('created_at', { ascending: false });
    }

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      listings: data,
      pagination: { page, limit, total: count },
    });
  } catch (error) {
    console.error('Listings fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 });
  }
}

// POST /api/listings - Create new listing
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
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
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Listing creation error:', error);
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
  }
}
