import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import type Stripe from 'stripe'

// As of Stripe API 2025-03-31.basil, billing periods live on subscription
// items rather than the subscription itself.
function subscriptionPeriod(subscription: Stripe.Subscription): {
  start: string | null
  end: string | null
} {
  const item = subscription.items?.data?.[0]
  return {
    start: item ? new Date(item.current_period_start * 1000).toISOString() : null,
    end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
  }
}

// As of Stripe API 2025-03-31.basil, invoice.subscription was replaced by
// invoice.parent.subscription_details.subscription.
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription
  if (!sub) return null
  return typeof sub === 'string' ? sub : sub.id
}

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

  // Idempotency guard
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
        const session = event.data.object as Stripe.Checkout.Session
        const { userId, planId, type, booking_id } = session.metadata || {}

        if (type === 'subscription' && userId && planId && session.subscription) {
          // Validate planId before upsert
          const ALLOWED_PLANS = ['landlord_basic', 'landlord_pro', 'landlord_unlimited']
          if (!ALLOWED_PLANS.includes(planId)) break

          // Verify userId corresponds to a real profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single()
          if (!profile) break

          const { error } = await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            plan_id: planId,
            status: 'active',
          })
          if (error) throw error
        } else if (type === 'booking' && booking_id) {
          await supabase
            .from('bookings')
            .update({ payment_status: 'paid' })
            .eq('id', booking_id)
        }
        break
      }

      case 'customer.subscription.created': {
        // New subscription created outside checkout (e.g. via API or Stripe dashboard)
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.userId
        if (userId) {
          const period = subscriptionPeriod(subscription)
          await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            plan_id: subscription.metadata?.planId ?? 'unknown',
            status: subscription.status,
            current_period_start: period.start,
            current_period_end: period.end,
          }, { onConflict: 'stripe_subscription_id' })
        }
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const period = subscriptionPeriod(subscription)
        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
            current_period_start: period.start,
            current_period_end: period.end,
          })
          .eq('stripe_subscription_id', subscription.id)
        if (error) throw error
        break
      }

      case 'customer.subscription.trial_will_end': {
        // Trial ending in 3 days — queue an in-app notification and email
        const subscription = event.data.object as Stripe.Subscription
        logger.info({
          event: 'stripe_trial_ending',
          stripe_subscription_id: subscription.id,
          trial_end: subscription.trial_end,
        })
        // TODO: wire to notification service (email/push) for trial expiry reminder
        break
      }

      case 'invoice.payment_failed':
      case 'invoice.payment_action_required': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = invoiceSubscriptionId(invoice)
        if (subscriptionId) {
          const newStatus =
            event.type === 'invoice.payment_failed' ? 'past_due' : 'requires_action'
          await supabase
            .from('subscriptions')
            .update({ status: newStatus })
            .eq('stripe_subscription_id', subscriptionId)
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = invoiceSubscriptionId(invoice)
        if (subscriptionId) {
          await supabase
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('stripe_subscription_id', subscriptionId)
        }
        break
      }

      case 'payment_intent.succeeded': {
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

      case 'payment_method.attached':
      case 'payment_method.detached': {
        // Logged for audit purposes; no application state to update.
        logger.info({
          event: `stripe_${event.type.replace('.', '_')}`,
          stripe_event_id: event.id,
        })
        break
      }

      case 'customer.updated': {
        // If Stripe customer email changes, log it for reconciliation.
        logger.info({ event: 'stripe_customer_updated', stripe_event_id: event.id })
        break
      }

      default:
        // Unhandled event — not an error, just not acted on.
        logger.info({ event: 'stripe_unhandled_event', stripe_event_type: event.type })
    }

    // Mark event as processed
    await supabase
      .from('processed_webhook_events')
      .insert({ stripe_event_id: event.id })

    return NextResponse.json({ received: true })
  } catch (err) {
    logger.error({
      event: 'webhook_processing_failed',
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 })
  }
}
