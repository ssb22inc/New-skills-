import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const profilePatchSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional().nullable(),
  avatar_url: z.string().url().max(2048).optional().nullable(),
  email_notifications: z.boolean().optional(),
  sms_notifications: z.boolean().optional(),
  seeker_profile: z.object({
    profession: z.string().max(100).optional(),
    employer: z.string().max(100).optional(),
    work_schedule: z.enum(['day', 'night', 'rotating', 'flexible', 'remote']).optional(),
    budget_min: z.number().int().min(0).optional(),
    budget_max: z.number().int().min(0).optional(),
    move_in_date: z.string().optional(),
    move_out_date: z.string().optional(),
    must_haves: z.array(z.string()).max(20).optional(),
    nice_to_haves: z.array(z.string()).max(20).optional(),
    dealbreakers: z.array(z.string()).max(20).optional(),
  }).optional(),
  landlord_profile: z.object({
    company_name: z.string().max(100).optional(),
    auto_reply_enabled: z.boolean().optional(),
    instant_booking_enabled: z.boolean().optional(),
    preferred_tenant_types: z.array(z.string()).max(10).optional(),
  }).optional(),
});

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
    logger.error({ event: 'profile_get_error', error: error instanceof Error ? error.message : String(error) });
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

    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { seeker_profile, landlord_profile, ...profileFields } = parsed.data;

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
    logger.error({ event: 'profile_update_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
