import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
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

        if (userId && planId && session.subscription) {
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
    }

    // Mark event as processed after successful handling.
    await supabase
      .from('processed_webhook_events')
      .insert({ stripe_event_id: event.id })

    return NextResponse.json({ received: true })
  } catch (err) {
    // Return 500 so Stripe will retry the webhook delivery.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'webhook_processing_failed',
        stripe_event_id: event.id,
        stripe_event_type: event.type,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      })
    )
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 })
  }
}
