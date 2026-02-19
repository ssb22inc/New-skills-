import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET /api/listings/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        photos:listing_photos(*),
        landlord:profiles!listings_user_id_fkey(
          id, full_name, avatar_url
        )
      `)
      .eq('id', params.id)
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    // Increment view count
    await supabase.rpc('increment_listing_views', { listing_uuid: params.id });

    return NextResponse.json(data);
  } catch (error) {
    console.error('Listing fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch listing' }, { status: 500 });
  }
}

// PATCH /api/listings/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Verify ownership
    const { data: existing } = await supabase
      .from('listings')
      .select('user_id')
      .eq('id', params.id)
      .single();

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('listings')
      .update(body)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Listing update error:', error);
    return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
  }
}

// DELETE /api/listings/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Listing deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete listing' }, { status: 500 });
  }
}
