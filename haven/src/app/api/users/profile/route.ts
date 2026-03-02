import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select(`
        *,
        seeker_profile:seeker_profiles(*),
        landlord_profile:landlord_profiles(*)
      `)
      .eq('id', user.id)
      .single();

    if (error) throw error;

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { seeker_profile, landlord_profile, ...profileFields } = body;

    if (Object.keys(profileFields).length > 0) {
      const { error } = await supabase
        .from('profiles')
        .update(profileFields)
        .eq('id', user.id);
      if (error) throw error;
    }

    if (seeker_profile) {
      const { error } = await supabase
        .from('seeker_profiles')
        .upsert({ user_id: user.id, ...seeker_profile }, { onConflict: 'user_id' });
      if (error) throw error;
    }

    if (landlord_profile) {
      const { error } = await supabase
        .from('landlord_profiles')
        .upsert({ user_id: user.id, ...landlord_profile }, { onConflict: 'user_id' });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
