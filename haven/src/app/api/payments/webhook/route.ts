import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import type Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Idempotency guard: skip events already processed.
  // The processed_webhook_events table schema:
  //   CREATE TABLE processed_webhook_events (
  //     stripe_event_id TEXT PRIMARY KEY,
  //     processed_at TIMESTAMPTZ DEFAULT now()
  //   );
  const { data: alreadyProcessed } = await supabase
    .from('processed_webhook_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (alreadyProcessed) {
    return NextResponse.json({ received: true, skipped: 'duplicate' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.CheckoutSession
        const { userId, planId } = session.metadata || {}

        // Validate planId is one of the known plans to prevent spoofing.
        const ALLOWED_PLANS = ['landlord_basic', 'landlord_pro', 'landlord_unlimited']
        if (userId && planId && ALLOWED_PLANS.includes(planId) && session.subscription) {
          const { error } = await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            plan_id: planId,
            status: 'active',
          })
          if (error) throw error
        }
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)
        if (error) throw error
        break
      }

      case 'invoice.payment_failed':
      case 'invoice.payment_action_required': {
        const invoice = event.data.object as Stripe.Invoice
        // Mark the subscription as past_due / requires_action so the UI can prompt the user.
        if (invoice.subscription) {
          const newStatus =
            event.type === 'invoice.payment_failed' ? 'past_due' : 'requires_action'
          await supabase
            .from('subscriptions')
            .update({ status: newStatus })
            .eq('stripe_subscription_id', invoice.subscription as string)
        }
        break
      }

      case 'invoice.paid': {
        // Subscription successfully renewed — ensure status is active.
        const invoice = event.data.object as Stripe.Invoice
        if (invoice.subscription) {
          await supabase
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('stripe_subscription_id', invoice.subscription as string)
        }
        break
      }

      case 'payment_intent.succeeded': {
        // One-time payment (e.g. booking deposit) confirmed.
        const intent = event.data.object as Stripe.PaymentIntent
        const { bookingId } = intent.metadata || {}
        if (bookingId) {
          await supabase
            .from('bookings')
            .update({ payment_status: 'paid', stripe_payment_intent_id: intent.id })
            .eq('id', bookingId)
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent
        const { bookingId } = intent.metadata || {}
        if (bookingId) {
          await supabase
            .from('bookings')
            .update({ payment_status: 'failed' })
            .eq('id', bookingId)
        }
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        if (charge.payment_intent) {
          await supabase
            .from('bookings')
            .update({ payment_status: 'refunded' })
            .eq('stripe_payment_intent_id', charge.payment_intent as string)
        }
        break
      }
    }

    // Mark event as processed after successful handling.
    await supabase
      .from('processed_webhook_events')
      .insert({ stripe_event_id: event.id })

    return NextResponse.json({ received: true })
  } catch (err) {
    // Return 500 so Stripe will retry the webhook delivery.
    logger.error({
      event: 'webhook_processing_failed',
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 })
  }
}
