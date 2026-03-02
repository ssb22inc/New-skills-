import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
})

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
} as const
