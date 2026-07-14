import Stripe from 'stripe';

// apiVersion intentionally omitted: the SDK pins the API version it was
// generated against (currently 2026-06-24.dahlia), which is the only version
// its types are guaranteed to match.
//
// Lazily constructed so importing this module (e.g. during `next build`
// page-data collection) doesn't require STRIPE_SECRET_KEY.
let _client: Stripe | null = null;

function getClient(): Stripe {
  if (!_client) {
    _client = new Stripe(process.env.STRIPE_SECRET_KEY!, { typescript: true });
  }
  return _client;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getClient();
    const value = client[prop as keyof Stripe];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
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
