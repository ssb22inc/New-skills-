import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCheckoutSession } from '@/lib/stripe/client';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { booking_id, amount, type, plan_price_id } = await request.json();

    const session = await createCheckoutSession({
      priceId: plan_price_id,
      amount,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings?checkout=cancelled`,
      metadata: {
        booking_id: booking_id || '',
        user_id: user.id,
        type: type || 'booking',
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 });
  }
}
