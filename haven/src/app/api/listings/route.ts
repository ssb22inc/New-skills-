import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listingSchema } from '@/lib/utils/validation';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    let query = supabase
      .from('listings')
      .select('*, photos:listing_photos(*)', { count: 'exact' })
      .eq('status', 'active');

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

    const availableFrom = searchParams.get('availableFrom');
    if (availableFrom) query = query.lte('available_date', availableFrom);

    const instantBooking = searchParams.get('instantBooking');
    if (instantBooking === 'true') query = query.eq('instant_booking', true);

    const sortBy = searchParams.get('sortBy') || 'newest';
    switch (sortBy) {
      case 'price_asc': query = query.order('price_monthly', { ascending: true }); break;
      case 'price_desc': query = query.order('price_monthly', { ascending: false }); break;
      case 'newest':
      default: query = query.order('created_at', { ascending: false });
    }

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      listings: data,
      pagination: { page, limit, total: count ?? 0 },
    });
  } catch (error) {
    console.error('Listings fetch error:', error);
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
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: (error as unknown as { errors: unknown }).errors },
        { status: 400 }
      );
    }
    console.error('Listing creation error:', error);
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
  }
}
