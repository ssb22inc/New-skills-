import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCheckoutSession, PLANS } from '@/lib/stripe/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const PLAN_IDS = Object.values(PLANS).map((p) => p.id) as [string, ...string[]];

const checkoutSchema = z.discriminatedUnion('type', [
  // Subscription checkout
  z.object({
    type: z.literal('subscription'),
    plan_price_id: z.string().min(1),
    plan_id: z.enum(PLAN_IDS),
  }),
  // One-time booking deposit
  z.object({
    type: z.literal('booking'),
    booking_id: z.string().uuid('booking_id must be a valid UUID'),
    amount: z.number().int().min(50, 'Minimum deposit is $0.50').max(1_000_000),
  }),
]);

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

    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.type === 'booking') {
      // Verify the booking exists and belongs to this user
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('id, seeker_id, landlord_id, payment_status')
        .eq('id', data.booking_id)
        .single();

      if (bookingError || !booking) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }
      if (booking.seeker_id !== user.id && booking.landlord_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (booking.payment_status === 'paid') {
        return NextResponse.json({ error: 'Booking already paid' }, { status: 409 });
      }
    }

    const session = await createCheckoutSession({
      priceId: data.type === 'subscription' ? data.plan_price_id : undefined,
      amount: data.type === 'booking' ? data.amount : undefined,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        type: data.type,
        ...(data.type === 'booking' && { booking_id: data.booking_id }),
        ...(data.type === 'subscription' && { plan_id: data.plan_id }),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error({ event: 'checkout_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 });
  }
}
