import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
});

export const PLANS = {
  LANDLORD_BASIC: {
    id: 'landlord_basic',
    name: 'Basic',
    priceId: process.env.STRIPE_BASIC_PRICE_ID,
    listingsLimit: 3,
    price: 29,
  },
  LANDLORD_PRO: {
    id: 'landlord_pro',
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    listingsLimit: 10,
    price: 79,
  },
  LANDLORD_UNLIMITED: {
    id: 'landlord_unlimited',
    name: 'Unlimited',
    priceId: process.env.STRIPE_UNLIMITED_PRICE_ID,
    listingsLimit: -1,
    price: 149,
  },
} as const;

export async function createCheckoutSession(params: {
  priceId?: string;
  amount?: number;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  return stripe.checkout.sessions.create({
    customer: params.customerId,
    payment_method_types: ['card'],
    line_items: params.priceId
      ? [{ price: params.priceId, quantity: 1 }]
      : [{
          price_data: {
            currency: 'usd',
            unit_amount: Math.round((params.amount ?? 0) * 100),
            product_data: { name: 'Haven Booking' },
          },
          quantity: 1,
        }],
    mode: params.priceId ? 'subscription' : 'payment',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
}

export async function createConnectAccount(email: string) {
  return stripe.accounts.create({
    type: 'express',
    email,
    capabilities: {
      transfers: { requested: true },
    },
  });
}

export async function createAccountLink(accountId: string, returnUrl: string) {
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${returnUrl}?refresh=true`,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
}
