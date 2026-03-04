import { NextResponse } from 'next/server';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a Registry
const register = new Registry();

// Collect default metrics
collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'handler', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'handler', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register],
});

export const listingsCreated = new Counter({
  name: 'listings_created_total',
  help: 'Total number of listings created',
  registers: [register],
});

export const matchesCreated = new Counter({
  name: 'matches_created_total',
  help: 'Total number of matches created',
  registers: [register],
});

export const matchScore = new Histogram({
  name: 'match_score',
  help: 'Distribution of match scores',
  buckets: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  registers: [register],
});

export const bookingsCreated = new Counter({
  name: 'bookings_created_total',
  help: 'Total number of bookings created',
  labelNames: ['status'],
  registers: [register],
});

export const userSignups = new Counter({
  name: 'user_signups_total',
  help: 'Total number of user signups',
  labelNames: ['type'],
  registers: [register],
});

export const listingViews = new Counter({
  name: 'listing_views_total',
  help: 'Total number of listing views',
  registers: [register],
});

export const matchActions = new Counter({
  name: 'match_actions_total',
  help: 'Match actions taken by users',
  labelNames: ['action'],
  registers: [register],
});

export const authAttempts = new Counter({
  name: 'auth_attempts_total',
  help: 'Authentication attempts',
  labelNames: ['status'],
  registers: [register],
});

export const rateLimitHits = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Rate limit hits',
  labelNames: ['endpoint'],
  registers: [register],
});

export const aiRequestDuration = new Histogram({
  name: 'ai_request_duration_seconds',
  help: 'Duration of AI API requests',
  labelNames: ['endpoint'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30],
  registers: [register],
});

export const paymentAmount = new Counter({
  name: 'payment_amount_total',
  help: 'Total payment amounts',
  labelNames: ['status'],
  registers: [register],
});

export const funnelStep = new Counter({
  name: 'funnel_step_total',
  help: 'Conversion funnel steps',
  labelNames: ['step'],
  registers: [register],
});

// Metrics endpoint
export async function GET() {
  const metrics = await register.metrics();

  return new NextResponse(metrics, {
    headers: {
      'Content-Type': register.contentType,
    },
  });
}
