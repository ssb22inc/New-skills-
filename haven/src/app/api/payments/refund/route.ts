import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { stripe } from '@/lib/stripe/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateRequest } from '@/lib/security/auth'
import { logger } from '@/lib/logger'

const RefundSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
})

export async function POST(request: NextRequest) {
  const { authenticated, user } = await authenticateRequest(request)
  if (!authenticated || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = RefundSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { bookingId, reason } = parsed.data
  const supabase = await createServerSupabaseClient()

  // Fetch the booking and verify the requesting user is either the seeker or the landlord.
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, seeker_id, landlord_id, stripe_payment_intent_id, payment_status, status')
    .eq('id', bookingId)
    .single()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  if (booking.seeker_id !== user.id && booking.landlord_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (booking.payment_status === 'refunded') {
    return NextResponse.json({ error: 'Already refunded' }, { status: 409 })
  }

  if (!booking.stripe_payment_intent_id) {
    return NextResponse.json({ error: 'No payment found for this booking' }, { status: 422 })
  }

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: booking.stripe_payment_intent_id,
        ...(reason && { reason }),
      },
      // Idempotency key prevents duplicate refunds on network retries.
      { idempotencyKey: `refund-${bookingId}` }
    )

    // Optimistically update payment_status; the webhook handler will also update it.
    const admin = createAdminClient()
    await admin
      .from('bookings')
      .update({ payment_status: 'refunded', status: 'cancelled' })
      .eq('id', bookingId)

    logger.info({ event: 'refund_created', bookingId, refundId: refund.id, userId: user.id })

    return NextResponse.json({ refundId: refund.id, status: refund.status })
  } catch (err) {
    logger.error({
      event: 'refund_failed',
      bookingId,
      userId: user.id,
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Refund failed. Please contact support.' }, { status: 500 })
  }
}
