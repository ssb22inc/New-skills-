import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createCheckoutSession } from '@/lib/stripe/client';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { booking_id, amount, type } = await request.json();

    const session = await createCheckoutSession({
      amount,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${booking_id}?success=true`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${booking_id}?cancelled=true`,
      metadata: {
        booking_id,
        user_id: user.id,
        type,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 });
  }
}
